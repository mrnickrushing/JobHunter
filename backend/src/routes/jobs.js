const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const ALLOWED_JOB_FIELDS = [
  'title', 'company', 'location', 'url', 'description', 'status',
  'salary_min', 'salary_max', 'salary_currency', 'notes', 'source',
  'applied_at', 'deadline'
];

const VALID_STATUSES = ['saved', 'applied', 'phone_screen', 'interview', 'offer', 'rejected', 'withdrawn'];

// GET /api/jobs
router.get('/', (req, res) => {
  try {
    const { status, search } = req.query;
    let query = 'SELECT * FROM jobs WHERE user_id = ?';
    const params = [req.user.id];

    if (status && VALID_STATUSES.includes(status)) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (search) {
      query += ' AND (title LIKE ? OR company LIKE ? OR notes LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    query += ' ORDER BY updated_at DESC';

    const jobs = db.prepare(query).all(...params);
    res.json({ jobs });
  } catch (err) {
    console.error('List jobs error:', err);
    res.status(500).json({ error: 'Failed to fetch jobs.' });
  }
});

// GET /api/jobs/export/csv — export all jobs as CSV
router.get('/export/csv', (req, res) => {
  try {
    const jobs = db.prepare('SELECT * FROM jobs WHERE user_id = ? ORDER BY updated_at DESC').all(req.user.id);

    const headers = ['id','title','company','location','status','salary_min','salary_max','salary_currency','source','url','applied_at','deadline','notes','created_at','updated_at'];
    const escape = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = [headers.join(',')];
    for (const job of jobs) {
      rows.push(headers.map(h => escape(job[h])).join(','));
    }

    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="jobhunter_export_${new Date().toISOString().slice(0,10)}.csv"`,
    });
    res.send(rows.join('\n'));
  } catch (err) {
    console.error('CSV export error:', err);
    res.status(500).json({ error: 'Failed to export jobs.' });
  }
});

// POST /api/jobs
router.post('/', (req, res) => {
  try {
    const { title, company, location, url, description, status, salary_min, salary_max, salary_currency, notes, source, applied_at, deadline } = req.body;
    if (!title || !company) return res.status(400).json({ error: 'Title and company are required.' });

    const jobStatus = status && VALID_STATUSES.includes(status) ? status : 'saved';
    const result = db.prepare(`
      INSERT INTO jobs (user_id, title, company, location, url, description, status, salary_min, salary_max, salary_currency, notes, source, applied_at, deadline)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id, title.trim(), company.trim(),
      location || null, url || null, description || null, jobStatus,
      salary_min || null, salary_max || null, salary_currency || 'USD',
      notes || null, source || null, applied_at || null, deadline || null
    );

    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ job });
  } catch (err) {
    console.error('Create job error:', err);
    res.status(500).json({ error: 'Failed to create job.' });
  }
});

// GET /api/jobs/:id
router.get('/:id', (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });

    const contacts = db.prepare('SELECT * FROM job_contacts WHERE job_id = ? ORDER BY created_at ASC').all(job.id);
    const events = db.prepare('SELECT * FROM job_events WHERE job_id = ? ORDER BY scheduled_at ASC, created_at ASC').all(job.id);
    res.json({ job: { ...job, contacts, events } });
  } catch (err) {
    console.error('Get job error:', err);
    res.status(500).json({ error: 'Failed to fetch job.' });
  }
});

// PUT /api/jobs/:id
router.put('/:id', (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });

    const updates = {};
    for (const field of ALLOWED_JOB_FIELDS) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if (updates.status && !VALID_STATUSES.includes(updates.status)) {
      return res.status(400).json({ error: 'Invalid status value.' });
    }
    if (Object.keys(updates).length === 0) return res.json({ job });

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE jobs SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`)
      .run(...Object.values(updates), req.params.id, req.user.id);

    const updatedJob = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
    res.json({ job: updatedJob });
  } catch (err) {
    console.error('Update job error:', err);
    res.status(500).json({ error: 'Failed to update job.' });
  }
});

// DELETE /api/jobs/:id
router.delete('/:id', (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });

    db.prepare('DELETE FROM job_contacts WHERE job_id = ?').run(job.id);
    db.prepare('DELETE FROM job_events WHERE job_id = ?').run(job.id);
    db.prepare('DELETE FROM ai_documents WHERE job_id = ?').run(job.id);
    db.prepare('DELETE FROM jobs WHERE id = ?').run(job.id);
    res.json({ message: 'Job deleted successfully.' });
  } catch (err) {
    console.error('Delete job error:', err);
    res.status(500).json({ error: 'Failed to delete job.' });
  }
});

// ─── CONTACTS ──────────────────────────────────────────────────────────────
router.get('/:id/contacts', (req, res) => {
  try {
    const job = db.prepare('SELECT id FROM jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    const contacts = db.prepare('SELECT * FROM job_contacts WHERE job_id = ? ORDER BY created_at ASC').all(job.id);
    res.json({ contacts });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch contacts.' }); }
});

router.post('/:id/contacts', (req, res) => {
  try {
    const job = db.prepare('SELECT id FROM jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    const { name, role, email, phone, linkedin, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Contact name is required.' });
    const result = db.prepare(`INSERT INTO job_contacts (job_id, name, role, email, phone, linkedin) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(job.id, name.trim(), role || null, email || null, phone || null, linkedin || null);
    res.status(201).json({ contact: db.prepare('SELECT * FROM job_contacts WHERE id = ?').get(result.lastInsertRowid) });
  } catch (err) { res.status(500).json({ error: 'Failed to create contact.' }); }
});

router.put('/:id/contacts/:contactId', (req, res) => {
  try {
    const job = db.prepare('SELECT id FROM jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    const contact = db.prepare('SELECT * FROM job_contacts WHERE id = ? AND job_id = ?').get(req.params.contactId, job.id);
    if (!contact) return res.status(404).json({ error: 'Contact not found.' });
    const { name, role, email, phone, linkedin } = req.body;
    db.prepare(`UPDATE job_contacts SET name=?,role=?,email=?,phone=?,linkedin=? WHERE id=?`)
      .run(name||contact.name, role!==undefined?role:contact.role, email!==undefined?email:contact.email,
           phone!==undefined?phone:contact.phone, linkedin!==undefined?linkedin:contact.linkedin, contact.id);
    res.json({ contact: db.prepare('SELECT * FROM job_contacts WHERE id = ?').get(contact.id) });
  } catch (err) { res.status(500).json({ error: 'Failed to update contact.' }); }
});

router.delete('/:id/contacts/:contactId', (req, res) => {
  try {
    const job = db.prepare('SELECT id FROM jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    const result = db.prepare('DELETE FROM job_contacts WHERE id = ? AND job_id = ?').run(req.params.contactId, job.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Contact not found.' });
    res.json({ message: 'Contact deleted.' });
  } catch (err) { res.status(500).json({ error: 'Failed to delete contact.' }); }
});

// ─── EVENTS ───────────────────────────────────────────────────────────────
router.get('/:id/events', (req, res) => {
  try {
    const job = db.prepare('SELECT id FROM jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    res.json({ events: db.prepare('SELECT * FROM job_events WHERE job_id = ? ORDER BY scheduled_at ASC, created_at ASC').all(job.id) });
  } catch (err) { res.status(500).json({ error: 'Failed to fetch events.' }); }
});

router.post('/:id/events', (req, res) => {
  try {
    const job = db.prepare('SELECT id FROM jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    const { type, title, scheduled_at, notes } = req.body;
    if (!type || !title) return res.status(400).json({ error: 'Event type and title are required.' });
    const result = db.prepare(`INSERT INTO job_events (job_id, type, title, scheduled_at, notes) VALUES (?,?,?,?,?)`)
      .run(job.id, type, title.trim(), scheduled_at || null, notes || null);
    res.status(201).json({ event: db.prepare('SELECT * FROM job_events WHERE id = ?').get(result.lastInsertRowid) });
  } catch (err) { res.status(500).json({ error: 'Failed to create event.' }); }
});

router.put('/:id/events/:eventId', (req, res) => {
  try {
    const job = db.prepare('SELECT id FROM jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    const event = db.prepare('SELECT * FROM job_events WHERE id = ? AND job_id = ?').get(req.params.eventId, job.id);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    const { type, title, scheduled_at, notes } = req.body;
    db.prepare(`UPDATE job_events SET type=?,title=?,scheduled_at=?,notes=? WHERE id=?`)
      .run(type||event.type, title||event.title, scheduled_at!==undefined?scheduled_at:event.scheduled_at, notes!==undefined?notes:event.notes, event.id);
    res.json({ event: db.prepare('SELECT * FROM job_events WHERE id = ?').get(event.id) });
  } catch (err) { res.status(500).json({ error: 'Failed to update event.' }); }
});

router.delete('/:id/events/:eventId', (req, res) => {
  try {
    const job = db.prepare('SELECT id FROM jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    const result = db.prepare('DELETE FROM job_events WHERE id = ? AND job_id = ?').run(req.params.eventId, job.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Event not found.' });
    res.json({ message: 'Event deleted.' });
  } catch (err) { res.status(500).json({ error: 'Failed to delete event.' }); }
});

module.exports = router;
