const express = require('express');
const multer = require('multer');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and DOCX files are accepted.'));
    }
  },
});

/** Extract plain text from an uploaded file buffer. */
async function extractText(buffer, mimetype) {
  if (mimetype === 'application/pdf') {
    const result = await pdfParse(buffer);
    return result.text;
  }
  // DOCX
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

// ─── GET /api/resumes ────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const resumes = db.prepare(
    'SELECT id, name, content, file_type, original_name, is_default, created_at, updated_at FROM resumes WHERE user_id = ? ORDER BY updated_at DESC'
  ).all(req.user.id);
  res.json({ resumes });
});

// ─── GET /api/resumes/:id ────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const resume = db.prepare(
    'SELECT id, name, content, file_type, original_name, is_default, created_at, updated_at FROM resumes WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);
  if (!resume) return res.status(404).json({ error: 'Resume not found.' });
  res.json({ resume });
});

// ─── GET /api/resumes/:id/download ──────────────────────────────────────
// Serves back the original uploaded file binary.
router.get('/:id/download', (req, res) => {
  const resume = db.prepare(
    'SELECT file_data, file_type, original_name FROM resumes WHERE id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);

  if (!resume || !resume.file_data) {
    return res.status(404).json({ error: 'Original file not available.' });
  }

  res.set({
    'Content-Type': resume.file_type || 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${resume.original_name || 'resume'}"`
  });
  res.send(resume.file_data);
});

// ─── POST /api/resumes ───────────────────────────────────────────────────
// Upload a new resume (multipart/form-data: name + resume file).
router.post('/', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'A PDF or DOCX file is required.' });
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Resume name is required.' });

    const content = await extractText(req.file.buffer, req.file.mimetype);

    // First resume for this user becomes the default automatically
    const existing = db.prepare('SELECT COUNT(*) as cnt FROM resumes WHERE user_id = ?').get(req.user.id);
    const isDefault = existing.cnt === 0 ? 1 : 0;

    const result = db.prepare(`
      INSERT INTO resumes (user_id, name, content, file_data, file_type, original_name, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(req.user.id, name, content, req.file.buffer, req.file.mimetype, req.file.originalname, isDefault);

    const resume = db.prepare(
      'SELECT id, name, content, file_type, original_name, is_default, created_at, updated_at FROM resumes WHERE id = ?'
    ).get(result.lastInsertRowid);

    res.status(201).json({ resume });
  } catch (err) {
    console.error('Resume upload error:', err);
    res.status(500).json({ error: err.message || 'Failed to upload resume.' });
  }
});

// ─── PUT /api/resumes/:id/reupload ───────────────────────────────────────
// Replace the file on an existing resume entry, re-extracting text.
router.put('/:id/reupload', upload.single('resume'), async (req, res) => {
  try {
    const resume = db.prepare('SELECT id FROM resumes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!resume) return res.status(404).json({ error: 'Resume not found.' });
    if (!req.file) return res.status(400).json({ error: 'A PDF or DOCX file is required.' });

    const content = await extractText(req.file.buffer, req.file.mimetype);

    db.prepare(`
      UPDATE resumes
      SET content = ?, file_data = ?, file_type = ?, original_name = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(content, req.file.buffer, req.file.mimetype, req.file.originalname, req.params.id, req.user.id);

    const updated = db.prepare(
      'SELECT id, name, content, file_type, original_name, is_default, created_at, updated_at FROM resumes WHERE id = ?'
    ).get(req.params.id);

    res.json({ resume: updated });
  } catch (err) {
    console.error('Resume reupload error:', err);
    res.status(500).json({ error: err.message || 'Failed to replace resume file.' });
  }
});

// ─── PUT /api/resumes/:id ────────────────────────────────────────────────
// Update resume name only (content lives in the uploaded file).
router.put('/:id', (req, res) => {
  const resume = db.prepare('SELECT id FROM resumes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!resume) return res.status(404).json({ error: 'Resume not found.' });

  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name is required.' });

  db.prepare(`UPDATE resumes SET name = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`)
    .run(name, req.params.id, req.user.id);

  const updated = db.prepare(
    'SELECT id, name, content, file_type, original_name, is_default, created_at, updated_at FROM resumes WHERE id = ?'
  ).get(req.params.id);

  res.json({ resume: updated });
});

// ─── PUT /api/resumes/:id/default ────────────────────────────────────────
router.put('/:id/default', (req, res) => {
  const resume = db.prepare('SELECT id FROM resumes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!resume) return res.status(404).json({ error: 'Resume not found.' });

  db.prepare('UPDATE resumes SET is_default = 0 WHERE user_id = ?').run(req.user.id);
  db.prepare('UPDATE resumes SET is_default = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);

  const updated = db.prepare(
    'SELECT id, name, content, file_type, original_name, is_default, created_at, updated_at FROM resumes WHERE id = ?'
  ).get(req.params.id);

  res.json({ resume: updated });
});

// ─── DELETE /api/resumes/:id ─────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const resume = db.prepare('SELECT id FROM resumes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!resume) return res.status(404).json({ error: 'Resume not found.' });

  db.prepare('DELETE FROM resumes WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ message: 'Resume deleted.' });
});

// ─── Multer error handler ────────────────────────────────────────────────
router.use((err, _req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File is too large. Maximum size is 5 MB.' });
  }
  if (err.message) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'Upload failed.' });
});

module.exports = router;
