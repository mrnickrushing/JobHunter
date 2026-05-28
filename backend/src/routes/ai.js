const express = require('express');
const fetch = require('node-fetch');
const PizZip = require('pizzip');
const { Document, Paragraph, TextRun, HeadingLevel, Packer } = require('docx');
const db = require('../db');
const config = require('../config');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// ─── Rate limiting: max 12 AI requests per minute per user ───────────────────────
// Using a simple in-memory sliding window (no extra package needed)
const rateLimitMap = new Map();
function aiRateLimit(req, res, next) {
  const userId = req.user && req.user.id;
  if (!userId) return next();
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 12;
  const timestamps = (rateLimitMap.get(userId) || []).filter(t => now - t < windowMs);
  if (timestamps.length >= maxRequests) {
    return res.status(429).json({ error: 'Too many AI requests. Please wait a moment and try again.' });
  }
  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  next();
}

router.use(authMiddleware);
router.use(aiRateLimit);

async function callClaude(messages, system) {
  if (!config.ANTHROPIC_API_KEY) throw new Error('Anthropic API key is not configured.');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: system || 'You are a professional career coach and resume writer.',
      messages,
    }),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
  }
  const data = await response.json();
  return data.content[0].text;
}

function stripMarkdownFences(text) {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

function getJobAndResume(jobId, resumeId, userId) {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(jobId, userId);
  if (!job) throw { status: 404, message: 'Job not found.' };
  const resume = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(resumeId, userId);
  if (!resume) throw { status: 404, message: 'Resume not found.' };
  return { job, resume };
}

function injectContentIntoDocx(originalDocxBuffer, newTextContent) {
  const zip = new PizZip(originalDocxBuffer);
  const docXml = zip.file('word/document.xml').asText();
  const paragraphRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;
  const originalParagraphs = docXml.match(paragraphRegex) || [];
  const newLines = newTextContent.split('\n');
  let lineIndex = 0;
  const rebuiltParagraphs = originalParagraphs.map(para => {
    const pPrMatch = para.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
    const pPr = pPrMatch ? pPrMatch[0] : '';
    const rPrMatch = para.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
    const rPr = rPrMatch ? rPrMatch[0] : '';
    const lineText = lineIndex < newLines.length ? (newLines[lineIndex] || '') : '';
    lineIndex++;
    const escaped = lineText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
    return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`;
  });
  let rebuildIndex = 0;
  const newDocXml = docXml.replace(paragraphRegex, () => rebuiltParagraphs[rebuildIndex++] || '<w:p></w:p>');
  zip.file('word/document.xml', newDocXml);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function classifyLine(line) {
  const t = line.trim();
  if (!t) return 'blank';
  if (t === t.toUpperCase() && /[A-Z]/.test(t) && t.length < 60) return 'heading2';
  if (/^(dear\s|to\s+whom|hiring\s+manager)/i.test(t)) return 'salutation';
  if (/^(sincerely|best\s+regards|regards|thank\s+you|yours\s+truly)/i.test(t)) return 'closing';
  if (t.endsWith(':') && t.length < 60) return 'heading2';
  return 'body';
}

async function buildPlainDocx(textContent) {
  const lines = textContent.split('\n');
  const paragraphs = lines.map(line => {
    const kind = classifyLine(line);
    const text = line.trim();
    if (kind === 'blank') return new Paragraph({ children: [] });
    if (kind === 'heading2') return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text, bold: true })] });
    if (kind === 'salutation') return new Paragraph({ children: [new TextRun({ text })], spacing: { before: 200 } });
    if (kind === 'closing') return new Paragraph({ children: [new TextRun({ text })], spacing: { before: 400 } });
    return new Paragraph({ children: [new TextRun({ text })] });
  });
  const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] });
  return Packer.toBuffer(doc);
}

// ─── POST /api/ai/import-job ───────────────────────────────────────────────────
// Paste a job posting URL → Claude fetches and parses it into structured job fields.
router.post('/import-job', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required.' });

    // Fetch the page HTML
    let pageText = '';
    try {
      const pageRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
      const html = await pageRes.text();
      // Strip tags for cleaner input
      pageText = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 8000);
    } catch (fetchErr) {
      return res.status(422).json({ error: 'Could not fetch the URL. Make sure it is publicly accessible.' });
    }

    const system = 'You are a job posting parser. Extract structured job data from raw webpage text.';
    const messages = [{
      role: 'user',
      content: `Extract job details from this webpage text and return ONLY a JSON object with these fields:
{
  "title": "job title",
  "company": "company name",
  "location": "city, state or Remote",
  "description": "full job description text",
  "salary_min": number or null,
  "salary_max": number or null,
  "deadline": "YYYY-MM-DD or null"
}

Webpage text:
${pageText}`,
    }];

    const rawContent = await callClaude(messages, system);
    const cleaned = stripMarkdownFences(rawContent);
    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch (e) { return res.status(422).json({ error: 'Could not parse job details from that page. Try adding the job manually.' }); }

    res.json({ job: parsed });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Import job error:', err);
    res.status(500).json({ error: err.message || 'Failed to import job.' });
  }
});

// ─── POST /api/ai/tailor-resume ─────────────────────────────────────────────────
router.post('/tailor-resume', async (req, res) => {
  try {
    const { jobId, resumeId } = req.body;
    if (!jobId || !resumeId) return res.status(400).json({ error: 'jobId and resumeId are required.' });
    const { job, resume } = getJobAndResume(jobId, resumeId, req.user.id);

    // Warn if resume text looks too short (likely image-based PDF)
    if (resume.content && resume.content.trim().length < 100) {
      return res.status(422).json({
        error: 'This PDF appears to be image-based and could not be read as text. For best results, upload a text-based PDF or DOCX file.',
        code: 'IMAGE_BASED_PDF'
      });
    }

    const system = `You are an expert resume writer.
You MUST preserve the exact structure and section order of the original resume.
Only update the content — keywords, phrasing, skills, and emphasis — to better match the job description.
Do NOT add, remove, or reorder sections.
Do NOT add headers or explanations.
Return the tailored resume as plain text only, maintaining the same line-by-line structure as the original.`;

    const messages = [{
      role: 'user',
      content: `Tailor the resume below for the following job. Preserve the exact structure line by line.

JOB TITLE: ${job.title}
COMPANY: ${job.company}
${job.description ? `JOB DESCRIPTION:\n${job.description}` : ''}

ORIGINAL RESUME:
${resume.content}

Return ONLY the tailored resume text. Same structure, same sections, job-optimized content.`,
    }];

    const content = await callClaude(messages, system);
    db.prepare(`INSERT INTO ai_documents (job_id, user_id, type, content) VALUES (?, ?, 'tailored_resume', ?)`)
      .run(job.id, req.user.id, content);
    res.json({ content });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Tailor resume error:', err);
    res.status(500).json({ error: err.message || 'Failed to tailor resume.' });
  }
});

// ─── POST /api/ai/tailor-resume/download ────────────────────────────────────────
router.post('/tailor-resume/download', async (req, res) => {
  try {
    const { jobId, resumeId } = req.body;
    if (!jobId || !resumeId) return res.status(400).json({ error: 'jobId and resumeId are required.' });

    const aiDoc = db.prepare(`SELECT content FROM ai_documents WHERE job_id=? AND user_id=? AND type='tailored_resume' ORDER BY created_at DESC LIMIT 1`)
      .get(jobId, req.user.id);
    if (!aiDoc) return res.status(404).json({ error: 'No tailored resume found. Please generate one first.' });

    const resume = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(resumeId, req.user.id);
    if (!resume) return res.status(404).json({ error: 'Resume not found.' });

    const job = db.prepare('SELECT title, company FROM jobs WHERE id = ? AND user_id = ?').get(jobId, req.user.id);
    const safeCompany = job ? job.company.replace(/[^a-z0-9]/gi, '_') : 'company';

    const isDocx = resume.file_type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const docxBuffer = (isDocx && resume.file_data)
      ? injectContentIntoDocx(resume.file_data, aiDoc.content)
      : await buildPlainDocx(aiDoc.content);

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${safeCompany}_tailored_resume.docx"`,
    });
    res.send(docxBuffer);
  } catch (err) {
    console.error('Tailor resume download error:', err);
    res.status(500).json({ error: 'Failed to generate document.' });
  }
});

// ─── POST /api/ai/cover-letter ──────────────────────────────────────────────────
router.post('/cover-letter', async (req, res) => {
  try {
    const { jobId, resumeId } = req.body;
    if (!jobId || !resumeId) return res.status(400).json({ error: 'jobId and resumeId are required.' });
    const { job, resume } = getJobAndResume(jobId, resumeId, req.user.id);

    const system = 'You are an expert cover letter writer who crafts compelling, personalized cover letters that get interviews.';
    const messages = [{
      role: 'user',
      content: `Write a compelling, professional cover letter for the following job application.

JOB TITLE: ${job.title}
COMPANY: ${job.company}
${job.location ? `LOCATION: ${job.location}` : ''}
${job.description ? `JOB DESCRIPTION:\n${job.description}` : ''}

CANDIDATE'S RESUME:
${resume.content}

Write a 3-4 paragraph cover letter that:
1. Opens with a strong hook showing genuine interest in the company/role
2. Highlights 2-3 specific achievements from the resume most relevant to this job
3. Shows knowledge of the company and explains why you're a great fit
4. Closes with a clear call to action

Output only the cover letter text. Start with "Dear Hiring Manager," or similar.`,
    }];

    const content = await callClaude(messages, system);
    db.prepare(`INSERT INTO ai_documents (job_id, user_id, type, content) VALUES (?, ?, 'cover_letter', ?)`)
      .run(job.id, req.user.id, content);
    res.json({ content });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Cover letter error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate cover letter.' });
  }
});

// ─── POST /api/ai/cover-letter/download ─────────────────────────────────────────
router.post('/cover-letter/download', async (req, res) => {
  try {
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ error: 'jobId is required.' });

    const aiDoc = db.prepare(`SELECT content FROM ai_documents WHERE job_id=? AND user_id=? AND type='cover_letter' ORDER BY created_at DESC LIMIT 1`)
      .get(jobId, req.user.id);
    if (!aiDoc) return res.status(404).json({ error: 'No cover letter found. Please generate one first.' });

    const job = db.prepare('SELECT title, company FROM jobs WHERE id = ? AND user_id = ?').get(jobId, req.user.id);
    const safeCompany = job ? job.company.replace(/[^a-z0-9]/gi, '_') : 'company';
    const docxBuffer = await buildPlainDocx(aiDoc.content);

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${safeCompany}_cover_letter.docx"`,
    });
    res.send(docxBuffer);
  } catch (err) {
    console.error('Cover letter download error:', err);
    res.status(500).json({ error: 'Failed to generate cover letter document.' });
  }
});

// ─── POST /api/ai/email-draft ───────────────────────────────────────────────────
// Generates a short, punchy email body for submitting the application.
router.post('/email-draft', async (req, res) => {
  try {
    const { jobId, resumeId } = req.body;
    if (!jobId || !resumeId) return res.status(400).json({ error: 'jobId and resumeId are required.' });
    const { job, resume } = getJobAndResume(jobId, resumeId, req.user.id);

    const system = 'You are an expert career coach who writes concise, compelling job application emails.';
    const messages = [{
      role: 'user',
      content: `Write a short, professional email body (3-4 sentences max) for submitting a job application.
This is the body only — not a cover letter. It should be direct and confident.

JOB TITLE: ${job.title}
COMPANY: ${job.company}

KEY RESUME HIGHLIGHTS (use 1-2 of these):
${resume.content.slice(0, 800)}

Output only the email body text. No subject line. No greeting or sign-off (those will be added separately).`,
    }];

    const content = await callClaude(messages, system);
    db.prepare(`INSERT INTO ai_documents (job_id, user_id, type, content) VALUES (?, ?, 'email_draft', ?)`)
      .run(job.id, req.user.id, content);
    res.json({ content });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Email draft error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate email draft.' });
  }
});

// ─── POST /api/ai/match-score ──────────────────────────────────────────────────
router.post('/match-score', async (req, res) => {
  try {
    const { jobId, resumeId } = req.body;
    if (!jobId || !resumeId) return res.status(400).json({ error: 'jobId and resumeId are required.' });
    const { job, resume } = getJobAndResume(jobId, resumeId, req.user.id);

    const system = 'You are an expert ATS analyzer. Provide objective, data-driven assessments.';
    const messages = [{
      role: 'user',
      content: `Analyze how well this resume matches the job description.

JOB TITLE: ${job.title}
COMPANY: ${job.company}
${job.description ? `JOB DESCRIPTION:\n${job.description}` : 'No description provided.'}

RESUME:
${resume.content}

Respond with ONLY a valid JSON object:
{
  "score": <number 0-100>,
  "strengths": [<string>, ...],
  "gaps": [<string>, ...],
  "recommendation": "<2-3 sentence overall recommendation>"
}`,
    }];

    const rawContent = await callClaude(messages, system);
    const cleaned = stripMarkdownFences(rawContent);
    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch (e) { throw new Error('AI returned malformed data. Please try again.'); }

    db.prepare(`INSERT INTO ai_documents (job_id, user_id, type, content) VALUES (?, ?, 'match_score', ?)`)
      .run(job.id, req.user.id, JSON.stringify(parsed));
    res.json(parsed);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Match score error:', err);
    res.status(500).json({ error: err.message || 'Failed to analyze match score.' });
  }
});

// ─── POST /api/ai/interview-prep ────────────────────────────────────────────────
router.post('/interview-prep', async (req, res) => {
  try {
    const { jobId, resumeId } = req.body;
    if (!jobId || !resumeId) return res.status(400).json({ error: 'jobId and resumeId are required.' });
    const { job, resume } = getJobAndResume(jobId, resumeId, req.user.id);

    const system = 'You are an expert interview coach who helps candidates prepare thoroughly for job interviews.';
    const messages = [{
      role: 'user',
      content: `Create comprehensive interview preparation materials for this job.

JOB TITLE: ${job.title}
COMPANY: ${job.company}
${job.description ? `JOB DESCRIPTION:\n${job.description}` : 'No description provided.'}

RESUME:
${resume.content}

Respond with ONLY a valid JSON object:
{
  "questions": [
    { "question": "<question>", "answer_framework": "<how to answer>" }
  ],
  "topics": [<key topic string>, ...],
  "tips": [<actionable tip string>, ...]
}

Include 8-10 questions, 5-7 topics, 5-6 tips.`,
    }];

    const rawContent = await callClaude(messages, system);
    const cleaned = stripMarkdownFences(rawContent);
    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch (e) { throw new Error('AI returned malformed data. Please try again.'); }

    db.prepare(`INSERT INTO ai_documents (job_id, user_id, type, content) VALUES (?, ?, 'interview_prep', ?)`)
      .run(job.id, req.user.id, JSON.stringify(parsed));
    res.json(parsed);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('Interview prep error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate interview prep.' });
  }
});

// ─── GET /api/ai/documents/:jobId ─────────────────────────────────────────────────
router.get('/documents/:jobId', (req, res) => {
  try {
    const job = db.prepare('SELECT id FROM jobs WHERE id = ? AND user_id = ?').get(req.params.jobId, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });

    const documents = db.prepare('SELECT * FROM ai_documents WHERE job_id = ? AND user_id = ? ORDER BY created_at DESC').all(job.id, req.user.id);
    const parsed = documents.map(doc => {
      if (['match_score', 'interview_prep'].includes(doc.type)) {
        try { return { ...doc, content: JSON.parse(doc.content) }; } catch { return doc; }
      }
      return doc;
    });
    res.json({ documents: parsed });
  } catch (err) {
    console.error('Get documents error:', err);
    res.status(500).json({ error: 'Failed to fetch AI documents.' });
  }
});

module.exports = router;
