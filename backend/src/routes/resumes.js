const express = require('express');
const multer = require('multer');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// ─── Multer: memory storage, 5 MB limit, PDF + DOCX only ───────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF and DOCX files are accepted.'));
  },
});

// GET /api/resumes
router.get('/', (req, res) => {
  try {
    const resumes = db.prepare(
      'SELECT id, user_id, name, content, file_type, original_name, is_default, created_at, updated_at FROM resumes WHERE user_id = ? ORDER BY is_default DESC, updated_at DESC'
    ).all(req.user.id);
    res.json({ resumes });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch resumes.' });
  }
});

// GET /api/resumes/:id
router.get('/:id', (req, res) => {
  try {
    const resume = db.prepare(
      'SELECT id, user_id, name, content, file_type, original_name, is_default, created_at, updated_at FROM resumes WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);
    if (!resume) return res.status(404).json({ error: 'Resume not found.' });
    res.json({ resume });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch resume.' });
  }
});

// GET /api/resumes/:id/download — serves the original uploaded file
router.get('/:id/download', (req, res) => {
  try {
    // Support token in query string for direct <a href> downloads
    const jwt = require('jsonwebtoken');
    const config = require('../config');
    const token = req.query.token || (req.headers.authorization || '').replace('Bearer ', '');
    let userId;
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET);
      userId = decoded.id || decoded.userId;
    } catch {
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    const resume = db.prepare(
      'SELECT file_data, file_type, original_name FROM resumes WHERE id = ? AND user_id = ?'
    ).get(req.params.id, userId);

    if (!resume || !resume.file_data) {
      return res.status(404).json({ error: 'Original file not found.' });
    }

    res.set({
      'Content-Type': resume.file_type,
      'Content-Disposition': `attachment; filename="${resume.original_name || 'resume'}"`,
    });
    res.send(resume.file_data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to download file.' });
  }
});

// POST /api/resumes — upload a PDF or DOCX, extract text automatically
router.post('/', upload.single('resume'), async (req, res) => {
  try {
    const { name } = req.body;
    const file = req.file;

    if (!name?.trim()) return res.status(400).json({ error: 'Resume name is required.' });
    if (!file) return res.status(400).json({ error: 'A PDF or DOCX file is required.' });

    // Extract plain text for AI use
    let textContent = '';
    if (file.mimetype === 'application/pdf') {
      const result = await pdfParse(file.buffer);
      textContent = result.text || '';
    } else {
      // DOCX
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      textContent = result.value || '';
    }

    // Check if this user has no resumes yet — make first one the default
    const existingCount = db.prepare('SELECT COUNT(*) as cnt FROM resumes WHERE user_id = ?').get(req.user.id);
    const isDefault = existingCount.cnt === 0 ? 1 : 0;

    const stmt = db.prepare(`
      INSERT INTO resumes (user_id, name, content, file_data, file_type, original_name, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
    const info = stmt.run(
      req.user.id,
      name.trim(),
      textContent,
      file.buffer,
      file.mimetype,
      file.originalname,
      isDefault
    );

    const resume = db.prepare(
      'SELECT id, user_id, name, content, file_type, original_name, is_default, created_at, updated_at FROM resumes WHERE id = ?'
    ).get(info.lastInsertRowid);

    res.status(201).json({ resume });
  } catch (err) {
    console.error('Resume upload error:', err);
    res.status(500).json({ error: err.message || 'Failed to process resume.' });
  }
});

// PUT /api/resumes/:id — update name and/or content
router.put('/:id', (req, res) => {
  try {
    const { name, content } = req.body;
    const resume = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!resume) return res.status(404).json({ error: 'Resume not found.' });

    db.prepare(
      "UPDATE resumes SET name = ?, content = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
    ).run(name ?? resume.name, content ?? resume.content, req.params.id, req.user.id);

    const updated = db.prepare(
      'SELECT id, user_id, name, content, file_type, original_name, is_default, created_at, updated_at FROM resumes WHERE id = ?'
    ).get(req.params.id);
    res.json({ resume: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update resume.' });
  }
});

// PUT /api/resumes/:id/default
router.put('/:id/default', (req, res) => {
  try {
    const resume = db.prepare('SELECT id FROM resumes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!resume) return res.status(404).json({ error: 'Resume not found.' });

    db.prepare('UPDATE resumes SET is_default = 0 WHERE user_id = ?').run(req.user.id);
    db.prepare("UPDATE resumes SET is_default = 1, updated_at = datetime('now') WHERE id = ?").run(req.params.id);

    const updated = db.prepare(
      'SELECT id, user_id, name, content, file_type, original_name, is_default, created_at, updated_at FROM resumes WHERE id = ?'
    ).get(req.params.id);
    res.json({ resume: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to set default resume.' });
  }
});

// DELETE /api/resumes/:id
router.delete('/:id', (req, res) => {
  try {
    const resume = db.prepare('SELECT id FROM resumes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!resume) return res.status(404).json({ error: 'Resume not found.' });
    db.prepare('DELETE FROM resumes WHERE id = ?').run(req.params.id);
    res.json({ message: 'Resume deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete resume.' });
  }
});

module.exports = router;
