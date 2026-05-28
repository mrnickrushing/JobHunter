const express = require('express');
const multer = require('multer');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and DOCX files are accepted.'));
    }
  },
});

// GET /api/resumes - list all resumes for user (exclude binary blob from list)
router.get('/', (req, res) => {
  try {
    const resumes = db.prepare(
      'SELECT id, user_id, name, content, is_default, file_type, original_name, created_at, updated_at FROM resumes WHERE user_id = ? ORDER BY is_default DESC, updated_at DESC'
    ).all(req.user.id);
    res.json({ resumes });
  } catch (err) {
    console.error('List resumes error:', err);
    res.status(500).json({ error: 'Failed to fetch resumes.' });
  }
});

// POST /api/resumes - upload a resume file (multipart/form-data)
router.post('/', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'A resume file (PDF or DOCX) is required.' });
    }

    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Resume name is required.' });
    }

    const file = req.file;
    let textContent = '';

    if (file.mimetype === 'application/pdf') {
      const result = await pdfParse(file.buffer);
      textContent = result.text;
    } else {
      // DOCX
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      textContent = result.value;
    }

    if (!textContent.trim()) {
      return res.status(400).json({ error: 'Could not extract text from this file. Make sure it is not a scanned image.' });
    }

    // First resume becomes default
    const count = db.prepare('SELECT COUNT(*) as cnt FROM resumes WHERE user_id = ?').get(req.user.id);
    const isDefault = count.cnt === 0 ? 1 : 0;

    const result = db.prepare(`
      INSERT INTO resumes (user_id, name, content, is_default, file_data, file_type, original_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      name.trim(),
      textContent,
      isDefault,
      file.buffer,
      file.mimetype,
      file.originalname
    );

    const resume = db.prepare(
      'SELECT id, user_id, name, content, is_default, file_type, original_name, created_at, updated_at FROM resumes WHERE id = ?'
    ).get(result.lastInsertRowid);

    res.status(201).json({ resume });
  } catch (err) {
    if (err.message && err.message.includes('Only PDF')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('Create resume error:', err);
    res.status(500).json({ error: 'Failed to upload resume.' });
  }
});

// GET /api/resumes/:id - get single resume (no binary blob)
router.get('/:id', (req, res) => {
  try {
    const resume = db.prepare(
      'SELECT id, user_id, name, content, is_default, file_type, original_name, created_at, updated_at FROM resumes WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);
    if (!resume) {
      return res.status(404).json({ error: 'Resume not found.' });
    }
    res.json({ resume });
  } catch (err) {
    console.error('Get resume error:', err);
    res.status(500).json({ error: 'Failed to fetch resume.' });
  }
});

// GET /api/resumes/:id/download - download the original uploaded file
router.get('/:id/download', (req, res) => {
  try {
    const resume = db.prepare(
      'SELECT file_data, file_type, original_name FROM resumes WHERE id = ? AND user_id = ?'
    ).get(req.params.id, req.user.id);
    if (!resume || !resume.file_data) {
      return res.status(404).json({ error: 'Original file not found.' });
    }
    const ext = resume.file_type === 'application/pdf' ? '.pdf' : '.docx';
    const filename = resume.original_name || `resume${ext}`;
    res.set({
      'Content-Type': resume.file_type,
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(resume.file_data);
  } catch (err) {
    console.error('Download resume error:', err);
    res.status(500).json({ error: 'Failed to download resume.' });
  }
});

// PUT /api/resumes/:id - update resume name only
router.put('/:id', (req, res) => {
  try {
    const resume = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!resume) {
      return res.status(404).json({ error: 'Resume not found.' });
    }

    const { name } = req.body;

    db.prepare(
      'UPDATE resumes SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
    ).run(
      name !== undefined ? name.trim() : resume.name,
      req.params.id,
      req.user.id
    );

    const updatedResume = db.prepare(
      'SELECT id, user_id, name, content, is_default, file_type, original_name, created_at, updated_at FROM resumes WHERE id = ?'
    ).get(req.params.id);
    res.json({ resume: updatedResume });
  } catch (err) {
    console.error('Update resume error:', err);
    res.status(500).json({ error: 'Failed to update resume.' });
  }
});

// DELETE /api/resumes/:id
router.delete('/:id', (req, res) => {
  try {
    const resume = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!resume) {
      return res.status(404).json({ error: 'Resume not found.' });
    }

    db.prepare('DELETE FROM resumes WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);

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

    db.prepare('UPDATE resumes SET is_default = 0 WHERE user_id = ?').run(req.user.id);
    db.prepare('UPDATE resumes SET is_default = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);

    const updatedResume = db.prepare(
      'SELECT id, user_id, name, content, is_default, file_type, original_name, created_at, updated_at FROM resumes WHERE id = ?'
    ).get(req.params.id);
    res.json({ resume: updatedResume });
  } catch (err) {
    console.error('Set default resume error:', err);
    res.status(500).json({ error: 'Failed to set default resume.' });
  }
});

module.exports = router;
