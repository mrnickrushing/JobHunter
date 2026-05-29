
import React, { useState } from 'react';
import { ai } from '../api.js';
import styles from './AddJobModal.module.css';

const STATUSES = [
  { value: 'saved', label: 'Saved' },
  { value: 'applied', label: 'Applied' },
  { value: 'phone_screen', label: 'Phone Screen' },
  { value: 'interview', label: 'Interview' },
  { value: 'offer', label: 'Offer' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

export default function AddJobModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    title: '', company: '', location: '', url: '', description: '', status: 'saved',
    salary_min: '', salary_max: '', notes: '', source: '', deadline: '', linkedin_url: ''
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  async function handleImport() {
    if (!importUrl.trim()) { setError('Paste a job URL to import.'); return; }
    setImporting(true); setError('');
    try {
      const result = await ai.importJobFromUrl(importUrl.trim());
      const job = result.job || result.data || result;
      setForm(prev => ({
        ...prev,
        title: job.title || prev.title,
        company: job.company || prev.company,
        location: job.location || prev.location,
        url: job.url || importUrl.trim(),
        description: job.description || prev.description,
        source: job.source || prev.source || 'AI URL Import',
      }));
    } catch (err) { setError(err.message || 'Failed to import job URL.'); }
    finally { setImporting(false); }
  }

  async function handleLinkedInImport() {
    if (!linkedinUrl.trim()) { setError('Paste a LinkedIn profile URL to import.'); return; }
    setImporting(true); setError('');
    try {
      const result = await ai.importLinkedInProfile(linkedinUrl.trim());
      const profile = result.profile || result.data || result;
      setForm(prev => ({
        ...prev,
        notes: [prev.notes, profile.summary || profile.headline || 'LinkedIn profile imported.'].filter(Boolean).join('\n\n'),
        linkedin_url: linkedinUrl.trim(),
      }));
    } catch (err) { setError(err.message || 'Failed to import LinkedIn profile.'); }
    finally { setImporting(false); }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.company.trim()) { setError('Title and company are required.'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        salary_min: form.salary_min ? parseInt(form.salary_min, 10) : undefined,
        salary_max: form.salary_max ? parseInt(form.salary_max, 10) : undefined,
        deadline: form.deadline || undefined,
      };
      await onSave(payload);
      onClose();
    } catch (err) { setError(err.message || 'Failed to save job.'); }
    finally { setSaving(false); }
  }

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Add New Job</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.field}>
            <label className={styles.label}>AI Import from Job URL</label>
            <div className={styles.inlineActionRow}>
              <input value={importUrl} onChange={e => setImportUrl(e.target.value)} placeholder="https://company.com/job/123" type="url" />
              <button type="button" className={styles.importBtn} onClick={handleImport} disabled={importing}>{importing ? 'Importing...' : 'Import'}</button>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>LinkedIn Profile Import</label>
            <div className={styles.inlineActionRow}>
              <input value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)} placeholder="https://www.linkedin.com/in/..." type="url" />
              <button type="button" className={styles.importBtn} onClick={handleLinkedInImport} disabled={importing}>{importing ? 'Importing...' : 'Import'}</button>
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Job Title <span className={styles.req}>*</span></label>
              <input name="title" value={form.title} onChange={handleChange} placeholder="e.g. Senior Engineer" />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Company <span className={styles.req}>*</span></label>
              <input name="company" value={form.company} onChange={handleChange} placeholder="e.g. Acme Corp" />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Location</label>
              <input name="location" value={form.location} onChange={handleChange} placeholder="e.g. Remote, NYC" />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Status</label>
              <select name="status" value={form.status} onChange={handleChange}>
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Job URL</label>
              <input name="url" value={form.url} onChange={handleChange} placeholder="https://..." type="url" />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Deadline</label>
              <input name="deadline" value={form.deadline} onChange={handleChange} type="date" />
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Salary Min</label>
              <input name="salary_min" value={form.salary_min} onChange={handleChange} placeholder="e.g. 80000" type="number" />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Salary Max</label>
              <input name="salary_max" value={form.salary_max} onChange={handleChange} placeholder="e.g. 120000" type="number" />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Source</label>
            <input name="source" value={form.source} onChange={handleChange} placeholder="LinkedIn, Indeed, Referral..." />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Job Description</label>
            <textarea name="description" value={form.description} onChange={handleChange} rows={4} placeholder="Paste the job description here..." className={styles.textarea} />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Notes</label>
            <textarea name="notes" value={form.notes} onChange={handleChange} rows={3} placeholder="Any notes about this opportunity..." className={styles.textarea} />
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.saveBtn} disabled={saving}>{saving ? 'Saving...' : 'Add Job'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
