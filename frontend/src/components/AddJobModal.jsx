import React, { useState } from 'react';
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
    title: '',
    company: '',
    location: '',
    url: '',
    description: '',
    status: 'saved',
    salary_min: '',
    salary_max: '',
    notes: '',
    source: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.company.trim()) {
      setError('Title and company are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        salary_min: form.salary_min ? parseInt(form.salary_min, 10) : undefined,
        salary_max: form.salary_max ? parseInt(form.salary_max, 10) : undefined,
      };
      await onSave(payload);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save job.');
    } finally {
      setSaving(false);
    }
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
                {STATUSES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Job URL</label>
            <input name="url" value={form.url} onChange={handleChange} placeholder="https://..." type="url" />
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
            <textarea name="notes" value={form.notes} onChange={handleChange} rows={2} placeholder="Any notes about this opportunity..." className={styles.textarea} />
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? 'Saving...' : 'Add Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
