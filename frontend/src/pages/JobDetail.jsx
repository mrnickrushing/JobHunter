import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { jobs as jobsApi } from '../api.js';
import AIPanel from '../components/AIPanel.jsx';
import styles from './JobDetail.module.css';

const STATUSES = [
  { value: 'saved', label: 'Saved' },
  { value: 'applied', label: 'Applied' },
  { value: 'phone_screen', label: 'Phone Screen' },
  { value: 'interview', label: 'Interview' },
  { value: 'offer', label: 'Offer' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

const EVENT_TYPES = ['phone_screen', 'interview', 'offer', 'follow_up', 'networking', 'rejection', 'other'];

function useDebounce(fn, delay) {
  const timer = useRef(null);
  return useCallback((...args) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const [newContact, setNewContact] = useState({ name: '', role: '', email: '', phone: '', linkedin: '' });
  const [addingContact, setAddingContact] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);

  const [newEvent, setNewEvent] = useState({ type: 'interview', title: '', scheduled_at: '', notes: '' });
  const [addingEvent, setAddingEvent] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);

  useEffect(() => {
    jobsApi.get(id)
      .then(data => { setJob(data.job); setLoading(false); })
      .catch(() => { setError('Failed to load job.'); setLoading(false); });
  }, [id]);

  const saveField = useCallback(async (field, value) => {
    try {
      const data = await jobsApi.update(id, { [field]: value });
      setJob(data.job);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {}
  }, [id]);

  const debouncedSave = useDebounce(saveField, 600);

  function handleFieldBlur(field, value) {
    if (!job || String(job[field] || '') === String(value || '')) return;
    saveField(field, value);
  }

  async function handleStatusChange(e) {
    const newStatus = e.target.value;
    setJob(prev => ({ ...prev, status: newStatus }));
    await saveField('status', newStatus);
  }

  async function addContact(e) {
    e.preventDefault();
    if (!newContact.name.trim()) return;
    setAddingContact(true);
    try {
      const data = await jobsApi.addContact(id, newContact);
      setJob(prev => ({ ...prev, contacts: [...(prev.contacts || []), data.contact] }));
      setNewContact({ name: '', role: '', email: '', phone: '', linkedin: '' });
      setShowContactForm(false);
    } catch {}
    setAddingContact(false);
  }

  async function deleteContact(contactId) {
    await jobsApi.removeContact(id, contactId);
    setJob(prev => ({ ...prev, contacts: prev.contacts.filter(c => c.id !== contactId) }));
  }

  async function addEvent(e) {
    e.preventDefault();
    if (!newEvent.title.trim()) return;
    setAddingEvent(true);
    try {
      const data = await jobsApi.addEvent(id, newEvent);
      setJob(prev => ({ ...prev, events: [...(prev.events || []), data.event] }));
      setNewEvent({ type: 'interview', title: '', scheduled_at: '', notes: '' });
      setShowEventForm(false);
    } catch {}
    setAddingEvent(false);
  }

  async function deleteEvent(eventId) {
    await jobsApi.removeEvent(id, eventId);
    setJob(prev => ({ ...prev, events: prev.events.filter(ev => ev.id !== eventId) }));
  }

  async function deleteJob() {
    if (!confirm('Delete this job? This cannot be undone.')) return;
    await jobsApi.remove(id);
    navigate('/tracker');
  }

  if (loading) return <div className={styles.loading}>Loading...</div>;
  if (error || !job) return <div className={styles.loading}>{error || 'Job not found.'}</div>;

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => navigate('/tracker')}>← Back</button>
        <div className={styles.topActions}>
          {saved && <span className={styles.savedNote}>Saved</span>}
          <select
            className={styles.statusSelect}
            value={job.status}
            onChange={handleStatusChange}
            style={{ '--status-color': `var(--status-${job.status})` }}
          >
            {STATUSES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <button className={styles.deleteBtn} onClick={deleteJob}>Delete</button>
        </div>
      </div>

      <div className={styles.layout}>
        {/* Left main content */}
        <div className={styles.main}>
          {/* Header */}
          <div className={styles.section}>
            <EditableField label="Job Title" value={job.title} onBlur={v => handleFieldBlur('title', v)} big />
            <div className={styles.row}>
              <EditableField label="Company" value={job.company} onBlur={v => handleFieldBlur('company', v)} />
              <EditableField label="Location" value={job.location || ''} onBlur={v => handleFieldBlur('location', v)} placeholder="Not specified" />
            </div>
            <div className={styles.row}>
              <EditableField label="Job URL" value={job.url || ''} onBlur={v => handleFieldBlur('url', v)} placeholder="https://..." />
              <EditableField label="Source" value={job.source || ''} onBlur={v => handleFieldBlur('source', v)} placeholder="LinkedIn, Indeed..." />
            </div>
            <div className={styles.row}>
              <EditableField label="Salary Min" value={job.salary_min || ''} onBlur={v => handleFieldBlur('salary_min', v)} placeholder="e.g. 80000" type="number" />
              <EditableField label="Salary Max" value={job.salary_max || ''} onBlur={v => handleFieldBlur('salary_max', v)} placeholder="e.g. 120000" type="number" />
            </div>
          </div>

          {/* Description */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Job Description</h3>
            <TextareaField
              value={job.description || ''}
              onBlur={v => handleFieldBlur('description', v)}
              placeholder="Paste the job description here..."
              rows={8}
            />
          </div>

          {/* Notes */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Notes</h3>
            <TextareaField
              value={job.notes || ''}
              onBlur={v => handleFieldBlur('notes', v)}
              placeholder="Your notes about this opportunity..."
              rows={4}
            />
          </div>

          {/* Contacts */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Contacts</h3>
              <button className={styles.addSmallBtn} onClick={() => setShowContactForm(v => !v)}>
                {showContactForm ? 'Cancel' : '+ Add Contact'}
              </button>
            </div>
            {showContactForm && (
              <form onSubmit={addContact} className={styles.subForm}>
                <div className={styles.row}>
                  <input value={newContact.name} onChange={e => setNewContact(p => ({ ...p, name: e.target.value }))} placeholder="Name *" required />
                  <input value={newContact.role} onChange={e => setNewContact(p => ({ ...p, role: e.target.value }))} placeholder="Role" />
                </div>
                <div className={styles.row}>
                  <input value={newContact.email} onChange={e => setNewContact(p => ({ ...p, email: e.target.value }))} placeholder="Email" type="email" />
                  <input value={newContact.phone} onChange={e => setNewContact(p => ({ ...p, phone: e.target.value }))} placeholder="Phone" />
                </div>
                <input value={newContact.linkedin} onChange={e => setNewContact(p => ({ ...p, linkedin: e.target.value }))} placeholder="LinkedIn URL" />
                <button type="submit" className={styles.submitSmall} disabled={addingContact}>
                  {addingContact ? 'Adding...' : 'Add Contact'}
                </button>
              </form>
            )}
            {(job.contacts || []).length === 0 && !showContactForm && (
              <p className={styles.empty}>No contacts yet.</p>
            )}
            {(job.contacts || []).map(c => (
              <div key={c.id} className={styles.contactCard}>
                <div className={styles.contactInfo}>
                  <span className={styles.contactName}>{c.name}</span>
                  {c.role && <span className={styles.contactMeta}>{c.role}</span>}
                  {c.email && <a href={`mailto:${c.email}`} className={styles.contactLink}>{c.email}</a>}
                  {c.phone && <span className={styles.contactMeta}>{c.phone}</span>}
                  {c.linkedin && <a href={c.linkedin} target="_blank" rel="noopener noreferrer" className={styles.contactLink}>LinkedIn</a>}
                </div>
                <button className={styles.removeBtn} onClick={() => deleteContact(c.id)}>✕</button>
              </div>
            ))}
          </div>

          {/* Events/Timeline */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Timeline</h3>
              <button className={styles.addSmallBtn} onClick={() => setShowEventForm(v => !v)}>
                {showEventForm ? 'Cancel' : '+ Add Event'}
              </button>
            </div>
            {showEventForm && (
              <form onSubmit={addEvent} className={styles.subForm}>
                <div className={styles.row}>
                  <select value={newEvent.type} onChange={e => setNewEvent(p => ({ ...p, type: e.target.value }))}>
                    {EVENT_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                  </select>
                  <input value={newEvent.title} onChange={e => setNewEvent(p => ({ ...p, title: e.target.value }))} placeholder="Event title *" required />
                </div>
                <input value={newEvent.scheduled_at} onChange={e => setNewEvent(p => ({ ...p, scheduled_at: e.target.value })} type="datetime-local" />
                <textarea value={newEvent.notes} onChange={e => setNewEvent(p => ({ ...p, notes: e.target.value }))} placeholder="Notes..." rows={2} />
                <button type="submit" className={styles.submitSmall} disabled={addingEvent}>
                  {addingEvent ? 'Adding...' : 'Add Event'}
                </button>
              </form>
            )}
            {(job.events || []).length === 0 && !showEventForm && (
              <p className={styles.empty}>No events yet.</p>
            )}
            {(job.events || []).map(ev => (
              <div key={ev.id} className={styles.eventItem}>
                <div className={styles.eventDot} />
                <div className={styles.eventBody}>
                  <div className={styles.eventTitle}>{ev.title}</div>
                  <div className={styles.eventMeta}>
                    <span className={styles.eventType}>{ev.type.replace('_', ' ')}</span>
                    {ev.scheduled_at && (
                      <span>{new Date(ev.scheduled_at).toLocaleString()}</span>
                    )}
                  </div>
                  {ev.notes && <p className={styles.eventNotes}>{ev.notes}</p>}
                </div>
                <button className={styles.removeBtn} onClick={() => deleteEvent(ev.id)}>✕</button>
              </div>
            ))}
          </div>
        </div>

        {/* Right sidebar: AI Panel — pass company name for DOCX filename */}
        <div className={styles.sidebar}>
          <h3 className={styles.sidebarTitle}>AI Assistant</h3>
          <AIPanel jobId={id} jobCompany={job.company} />
        </div>
      </div>
    </div>
  );
}

function EditableField({ label, value, onBlur, placeholder, type = 'text', big }) {
  const [val, setVal] = useState(value);

  useEffect(() => { setVal(value); }, [value]);

  return (
    <div className={styles.editField}>
      <label className={styles.fieldLabel}>{label}</label>
      <input
        type={type}
        value={val ?? ''}
        onChange={e => setVal(e.target.value)}
        onBlur={() => onBlur(val)}
        placeholder={placeholder}
        className={big ? styles.bigInput : ''}
      />
    </div>
  );
}

function TextareaField({ value, onBlur, placeholder, rows }) {
  const [val, setVal] = useState(value);
  useEffect(() => { setVal(value); }, [value]);
  return (
    <textarea
      value={val ?? ''}
      onChange={e => setVal(e.target.value)}
      onBlur={() => onBlur(val)}
      placeholder={placeholder}
      rows={rows}
      className={styles.textarea}
    />
  );
}
