const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
const authRequired = authMiddleware;

// CSV Export
router.get('/export', authRequired, async (req, res) => {
  try {
    const jobs = db.prepare(
      `SELECT id, title, company, location, status, url, source, salary_min, salary_max, deadline, created_at, updated_at
       FROM jobs WHERE user_id = ? ORDER BY updated_at DESC`
    ).all(req.user.id);

    const esc = (value) => {
      if (value === null || value === undefined) return '';
      const str = String(value).replace(/"/g, '""');
      return /[",\n]/.test(str) ? `"${str}"` : str;
    };

    const headers = ['id', 'title', 'company', 'location', 'status', 'url', 'source', 'salary_min', 'salary_max', 'deadline', 'created_at', 'updated_at'];
    const lines = [headers.join(',')];
    for (const row of jobs) {
      lines.push(headers.map(h => esc(row[h])).join(','));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="jobs-export.csv"');
    res.send(lines.join('\n'));
  } catch (err) {
    console.error('Export CSV error:', err);
    res.status(500).json({ error: 'Failed to export jobs' });
  }
});

// List jobs
router.get('/', authRequired, (req, res) => {
  try {
    const { status, search } = req.query;
    let query = 'SELECT * FROM jobs WHERE user_id = ?';
    const params = [req.user.id];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (search) {
      query += ' AND (title LIKE ? OR company LIKE ? OR location LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    query += ' ORDER BY updated_at DESC';
    const jobs = db.prepare(query).all(...params);

    // Attach events and notes
    const enriched = jobs.map(job => {
      const events = db.prepare('SELECT * FROM job_events WHERE job_id = ? ORDER BY scheduled_at ASC').all(job.id);
      const notes = db.prepare('SELECT * FROM job_notes WHERE job_id = ? ORDER BY created_at DESC').all(job.id);
      return { ...job, events, notes };
    });

    res.json({ jobs: enriched });
  } catch (err) {
    console.error('List jobs error:', err);
    res.status(500).json({ error: 'Failed to list jobs' });
  }
});

// Get single job
router.get('/:id', authRequired, (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const events = db.prepare('SELECT * FROM job_events WHERE job_id = ? ORDER BY scheduled_at ASC').all(job.id);
    const notes = db.prepare('SELECT * FROM job_notes WHERE job_id = ? ORDER BY created_at DESC').all(job.id);
    res.json({ job: { ...job, events, notes } });
  } catch (err) {
    console.error('Get job error:', err);
    res.status(500).json({ error: 'Failed to get job' });
  }
});

// Create job
router.post('/', authRequired, (req, res) => {
  try {
    const { title, company, location, url, description, status, salary_min, salary_max, notes, source, deadline, linkedin_url } = req.body;
    if (!title || !company) return res.status(400).json({ error: 'Title and company are required' });

    const now = new Date().toISOString();
    const result = db.prepare(
      `INSERT INTO jobs (user_id, title, company, location, url, description, status, salary_min, salary_max, notes, source, deadline, linkedin_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(req.user.id, title, company, location || null, url || null, description || null, status || 'saved', salary_min || null, salary_max || null, notes || null, source || null, deadline || null, linkedin_url || null, now, now);

    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ job });
  } catch (err) {
    console.error('Create job error:', err);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// Update job
router.put('/:id', authRequired, (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const allowed = ['title', 'company', 'location', 'url', 'description', 'status', 'salary_min', 'salary_max', 'notes', 'source', 'deadline', 'linkedin_url'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = new Date().toISOString();

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), req.params.id, req.user.id];
    db.prepare(`UPDATE jobs SET ${setClauses} WHERE id = ? AND user_id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
    const events = db.prepare('SELECT * FROM job_events WHERE job_id = ? ORDER BY scheduled_at ASC').all(updated.id);
    const notes = db.prepare('SELECT * FROM job_notes WHERE job_id = ? ORDER BY created_at DESC').all(updated.id);
    res.json({ job: { ...updated, events, notes } });
  } catch (err) {
    console.error('Update job error:', err);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

// Delete job
router.delete('/:id', authRequired, (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    db.prepare('DELETE FROM job_events WHERE job_id = ?').run(req.params.id);
    db.prepare('DELETE FROM job_notes WHERE job_id = ?').run(req.params.id);
    db.prepare('DELETE FROM jobs WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete job error:', err);
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

// Add event
router.post('/:id/events', authRequired, (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const { title, type, scheduled_at, notes, location, duration_minutes } = req.body;
    if (!title) return res.status(400).json({ error: 'Event title is required' });
    const now = new Date().toISOString();
    const result = db.prepare(
      `INSERT INTO job_events (job_id, title, type, scheduled_at, notes, location, duration_minutes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(req.params.id, title, type || 'other', scheduled_at || null, notes || null, location || null, duration_minutes || null, now);
    const event = db.prepare('SELECT * FROM job_events WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ event });
  } catch (err) {
    console.error('Add event error:', err);
    res.status(500).json({ error: 'Failed to add event' });
  }
});

// Update event
router.put('/:id/events/:eventId', authRequired, (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const event = db.prepare('SELECT * FROM job_events WHERE id = ? AND job_id = ?').get(req.params.eventId, req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    const allowed = ['title', 'type', 'scheduled_at', 'notes', 'location', 'duration_minutes'];
    const updates = {};
    for (const key of allowed) { if (req.body[key] !== undefined) updates[key] = req.body[key]; }
    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), req.params.eventId];
    db.prepare(`UPDATE job_events SET ${setClauses} WHERE id = ?`).run(...values);
    const updated = db.prepare('SELECT * FROM job_events WHERE id = ?').get(req.params.eventId);
    res.json({ event: updated });
  } catch (err) {
    console.error('Update event error:', err);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// Delete event
router.delete('/:id/events/:eventId', authRequired, (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    db.prepare('DELETE FROM job_events WHERE id = ? AND job_id = ?').run(req.params.eventId, req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete event error:', err);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// Add note
router.post('/:id/notes', authRequired, (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Note content is required' });
    const now = new Date().toISOString();
    const result = db.prepare(`INSERT INTO job_notes (job_id, content, created_at, updated_at) VALUES (?, ?, ?, ?)`).run(req.params.id, content, now, now);
    const note = db.prepare('SELECT * FROM job_notes WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ note });
  } catch (err) {
    console.error('Add note error:', err);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// Update note
router.put('/:id/notes/:noteId', authRequired, (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const note = db.prepare('SELECT * FROM job_notes WHERE id = ? AND job_id = ?').get(req.params.noteId, req.params.id);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    const { content } = req.body;
    const now = new Date().toISOString();
    db.prepare('UPDATE job_notes SET content = ?, updated_at = ? WHERE id = ?').run(content, now, req.params.noteId);
    const updated = db.prepare('SELECT * FROM job_notes WHERE id = ?').get(req.params.noteId);
    res.json({ note: updated });
  } catch (err) {
    console.error('Update note error:', err);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

// Delete note
router.delete('/:id/notes/:noteId', authRequired, (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    db.prepare('DELETE FROM job_notes WHERE id = ? AND job_id = ?').run(req.params.noteId, req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete note error:', err);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

module.exports = router;
