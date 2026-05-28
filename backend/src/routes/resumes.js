const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// GET /api/resumes - list all resumes for user
router.get('/', (req, res) => {
  try {
    const resumes = db.prepare(
      'SELECT * FROM resumes WHERE user_id = ? ORDER BY is_default DESC, updated_at DESC'
    ).all(req.user.id);
    res.json({ resumes });
  } catch (err) {
    console.error('List resumes error:', err);
    res.status(500).json({ error: 'Failed to fetch resumes.' });
  }
});

// POST /api/resumes - create resume
router.post('/', (req, res) => {
  try {
    const { name, content } = req.body;

    if (!name || !content) {
      return res.status(400).json({ error: 'Name and content are required.' });
    }

    // Check if this is the first resume; if so, set it as default
    const count = db.prepare('SELECT COUNT(*) as cnt FROM resumes WHERE user_id = ?').get(req.user.id);
    const isDefault = count.cnt === 0 ? 1 : 0;

    const result = db.prepare(`
      INSERT INTO resumes (user_id, name, content, is_default)
      VALUES (?, ?, ?, ?)
    `).run(req.user.id, name.trim(), content, isDefault);

    const resume = db.prepare('SELECT * FROM resumes WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ resume });
  } catch (err) {
    console.error('Create resume error:', err);
    res.status(500).json({ error: 'Failed to create resume.' });
  }
});

// GET /api/resumes/:id - get single resume
router.get('/:id', (req, res) => {
  try {
    const resume = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!resume) {
      return res.status(404).json({ error: 'Resume not found.' });
    }
    res.json({ resume });
  } catch (err) {
    console.error('Get resume error:', err);
    res.status(500).json({ error: 'Failed to fetch resume.' });
  }
});

// PUT /api/resumes/:id - update resume
router.put('/:id', (req, res) => {
  try {
    const resume = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!resume) {
      return res.status(404).json({ error: 'Resume not found.' });
    }

    const { name, content } = req.body;

    db.prepare(`
      UPDATE resumes SET name = ?, content = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).run(
      name !== undefined ? name.trim() : resume.name,
      content !== undefined ? content : resume.content,
      req.params.id,
      req.user.id
    );

    const updatedResume = db.prepare('SELECT * FROM resumes WHERE id = ?').get(req.params.id);
    res.json({ resume: updatedResume });
  } catch (err) {
    console.error('Update resume error:', err);
    res.status(500).json({ error: 'Failed to update resume.' });
  }
});

// DELETE /api/resumes/:id - delete resume
router.delete('/:id', (req, res) => {
  try {
    const resume = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!resume) {
      return res.status(404).json({ error: 'Resume not found.' });
    }

    db.prepare('DELETE FROM resumes WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);

    // If deleted resume was default, set next resume as default
    if (resume.is_default) {
      const nextResume = db.prepare('SELECT id FROM resumes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1').get(req.user.id);
      if (nextResume) {
        db.prepare('UPDATE resumes SET is_default = 1 WHERE id = ?').run(nextResume.id);
      }
    }

    res.json({ message: 'Resume deleted successfully.' });
  } catch (err) {
    console.error('Delete resume error:', err);
    res.status(500).json({ error: 'Failed to delete resume.' });
  }
});

// PUT /api/resumes/:id/default - set as default
router.put('/:id/default', (req, res) => {
  try {
    const resume = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!resume) {
      return res.status(404).json({ error: 'Resume not found.' });
    }

    // Unset all defaults for this user
    db.prepare('UPDATE resumes SET is_default = 0 WHERE user_id = ?').run(req.user.id);
    // Set this one as default
    db.prepare('UPDATE resumes SET is_default = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);

    const updatedResume = db.prepare('SELECT * FROM resumes WHERE id = ?').get(req.params.id);
    res.json({ resume: updatedResume });
  } catch (err) {
    console.error('Set default resume error:', err);
    res.status(500).json({ error: 'Failed to set default resume.' });
  }
});

module.exports = router;
