const express = require('express');
const fetch = require('node-fetch');
const PizZip = require('pizzip');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const config = require('../config');

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const router = express.Router();
router.use(authMiddleware);

// In-memory rate limiter: 10 AI requests per minute per user
const rateWindows = new Map();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(userId) {
  const now = Date.now();
  const key = String(userId);
  const timestamps = (rateWindows.get(key) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT) return false;
  timestamps.push(now);
  rateWindows.set(key, timestamps);
  return true;
}

async function callClaude(system, user) {
  if (!config.ANTHROPIC_API_KEY) {
    throw new Error('AI service not configured. Add ANTHROPIC_API_KEY to your environment.');
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.content[0].text;
}

function getJobAndResume(jobId, resumeId, userId) {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(jobId, userId);
  if (!job) throw new Error('Job not found');

  let resumeText = null;
  if (resumeId) {
    const resume = db.prepare('SELECT content FROM resumes WHERE id = ? AND user_id = ?').get(resumeId, userId);
    resumeText = resume ? resume.content : null;
  } else {
    const resume = db.prepare('SELECT content FROM resumes WHERE user_id = ? AND is_default = 1').get(userId);
    resumeText = resume ? resume.content : null;
  }

  return { job, resumeText };
}

function upsertDocument(jobId, resumeId, type, content, userId) {
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT id FROM ai_documents WHERE job_id = ? AND type = ?').get(jobId, type);
  if (existing) {
    db.prepare('UPDATE ai_documents SET content = ?, resume_id = ?, updated_at = ? WHERE id = ?')
      .run(content, resumeId || null, now, existing.id);
  } else {
    db.prepare('INSERT INTO ai_documents (job_id, user_id, resume_id, type, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(jobId, userId, resumeId || null, type, content, now, now);
  }
}

// Inject Claude's tailored text into the original DOCX XML, preserving all
// formatting (fonts, sizes, bold, spacing, heading styles). Only text content
// inside <w:t> elements is replaced — all surrounding XML tags stay untouched.
function injectIntoDocx(originalBuffer, tailoredText) {
  const zip = new PizZip(originalBuffer);
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('Invalid DOCX: missing word/document.xml');

  let docXml = docFile.asText();

  // Collect every non-empty paragraph: its raw XML block and plain-text content
  const paragraphs = [];
  const paraRe = /<w:p[ >][\s\S]*?<\/w:p>/g;
  let m;
  while ((m = paraRe.exec(docXml)) !== null) {
    const texts = [...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(x => x[1]);
    const text = texts.join('').trim();
    if (text) paragraphs.push({ xml: m[0], text });
  }

  // Map Claude's output lines to original paragraphs 1-to-1
  const tailoredLines = tailoredText.split('\n').filter(l => l.trim());
  const limit = Math.min(paragraphs.length, tailoredLines.length);

  for (let i = 0; i < limit; i++) {
    const orig = paragraphs[i];
    const newText = tailoredLines[i];
    if (newText.trim() === orig.text) continue;

    // Replace text in runs while keeping all formatting XML intact.
    // First <w:t> gets the full new text; subsequent runs are cleared.
    let firstRun = true;
    const newParaXml = orig.xml.replace(/<w:t([^>]*)>[^<]*<\/w:t>/g, (_, attrs) => {
      if (firstRun) {
        firstRun = false;
        const safe = newText
          .replace(/&/g, '&amp;').replace(/</g, '&lt;')
          .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const spaceAttr = attrs.includes('preserve') ? attrs : ` xml:space="preserve"${attrs}`;
        return `<w:t${spaceAttr}>${safe}</w:t>`;
      }
      return '<w:t></w:t>';
    });

    // Use function form so $ signs in newParaXml aren't treated as replacement patterns
    docXml = docXml.replace(orig.xml, () => newParaXml);
  }

  zip.file('word/document.xml', docXml);
  return Buffer.from(zip.generate({ type: 'arraybuffer' }));
}

// Build a cover letter DOCX that matches the resume's fonts, margins, and run formatting.
// Extracts run properties and section properties from the original resume DOCX and
// writes the cover letter lines using that style — blank lines become empty paragraphs.
function injectCoverLetterIntoDocx(originalBuffer, coverLetterText) {
  const zip = new PizZip(originalBuffer);
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('Invalid DOCX: missing word/document.xml');

  const docXml = docFile.asText();

  // Extract run properties from the first body paragraph that contains text (font, size, color)
  let bodyRpr = '';
  const paraRe = /<w:p[ >][\s\S]*?<\/w:p>/g;
  let m;
  while ((m = paraRe.exec(docXml)) !== null) {
    const texts = [...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(x => x[1]);
    if (texts.join('').trim()) {
      const rprMatch = m[0].match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
      if (rprMatch) bodyRpr = `<w:rPr>${rprMatch[1]}</w:rPr>`;
      break;
    }
  }

  // Preserve page size, margins, and section layout from the original
  const sectPrMatch = docXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/);
  const sectPr = sectPrMatch ? sectPrMatch[0] : '';

  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const newParas = coverLetterText.split('\n').map(line => {
    if (!line.trim()) return '<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>';
    return `<w:p><w:r>${bodyRpr}<w:t xml:space="preserve">${esc(line)}</w:t></w:r></w:p>`;
  });

  const newDocXml = docXml.replace(/<w:body>[\s\S]*<\/w:body>/, () => `<w:body>${newParas.join('')}${sectPr}</w:body>`);
  zip.file('word/document.xml', newDocXml);
  return Buffer.from(zip.generate({ type: 'arraybuffer' }));
}

function textToDocx(text, title) {
  const lines = text.split('\n');
  const children = lines.map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      return new Paragraph({ text: trimmed.slice(2), heading: HeadingLevel.HEADING_1 });
    }
    if (trimmed.startsWith('## ')) {
      return new Paragraph({ text: trimmed.slice(3), heading: HeadingLevel.HEADING_2 });
    }
    return new Paragraph({ children: [new TextRun({ text: line, size: 24 })] });
  });

  return new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: '' }),
        ...children,
      ],
    }],
  });
}

async function parseResumeToJSON(resumeText) {
  const raw = await callClaude(
    'You are a resume parser. Extract structured data and return ONLY valid JSON, no markdown.',
    `Parse this resume into structured JSON with EXACTLY this shape — use empty arrays/strings for missing fields:
{
  "name": "Full Name",
  "title": "Professional Title",
  "contact": { "email": "", "phone": "", "linkedin": "", "website": "" },
  "summary": "Summary paragraph",
  "experience": [{ "company": "", "role": "", "dates": "", "bullets": [""] }],
  "education": [{ "degree": "", "institution": "", "dates": "", "bullets": [""] }],
  "skills": ["Skill 1"],
  "certifications": ["Cert 1"]
}

For linkedin/website fields: include just the URL path without https://.
For dates: use format "Month YYYY – Month YYYY" or "Month YYYY – Present".

RESUME:
${resumeText}

Return ONLY the JSON object, no other text.`
  );
  const match = raw.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : raw);
}

function renderResumeHTML(data) {
  const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const clean = s => (s || '').replace(/^https?:\/\//, '');

  const linkedinSvg = `<svg style="width:13px;height:13px;display:inline-block;vertical-align:middle" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>`;

  const contactItems = [
    data.contact?.email && `<span class="ci">✉ <a href="mailto:${esc(data.contact.email)}">${esc(data.contact.email)}</a></span>`,
    data.contact?.phone && `<span class="ci">☏ ${esc(data.contact.phone)}</span>`,
    data.contact?.linkedin && `<span class="ci">${linkedinSvg} <a href="https://${clean(data.contact.linkedin)}">${esc(clean(data.contact.linkedin))}</a></span>`,
    data.contact?.website && `<span class="ci">🌐 <a href="https://${clean(data.contact.website)}">${esc(clean(data.contact.website))}</a></span>`,
  ].filter(Boolean);

  const entryHtml = (items, showDegree) => (items || []).map(e => {
    const org = showDegree ? (e.degree || e.institution) : e.company;
    const sub = showDegree ? (e.degree && e.institution ? e.institution : '') : e.role;
    return `<div class="entry">
      <div class="eh"><span class="eo">${esc(org)}</span><span class="ed">${esc(e.dates)}</span></div>
      ${sub ? `<div class="er">${esc(sub)}</div>` : ''}
      ${e.bullets?.filter(b => b).length ? `<ul>${e.bullets.filter(b => b).map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(data.name)} — Resume</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;background:#fff;max-width:760px;margin:0 auto;padding:40px 48px;font-size:13px;line-height:1.55}
.hdr{text-align:center;margin-bottom:10px}
.name{font-size:26px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#111827}
.job-title{font-size:13.5px;color:#6b7280;margin-top:5px}
.contact{display:flex;flex-wrap:wrap;justify-content:center;gap:16px;margin:12px 0 26px;font-size:12px;color:#4b5563}
.contact a{color:#4b5563;text-decoration:none}.contact a:hover{color:#d97706}
.ci{display:flex;align-items:center;gap:5px}
.sec{margin-bottom:22px}
.st{color:#d97706;font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;border-bottom:1.5px solid #fde68a;padding-bottom:3px;margin-bottom:11px}
.entry{margin-bottom:13px}
.eh{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.eo{font-weight:700;font-size:13px;color:#111827}
.ed{font-size:11px;color:#9ca3af;font-style:italic;white-space:nowrap;flex-shrink:0}
.er{font-size:12px;color:#6b7280;margin:2px 0 5px}
ul{padding-left:18px;margin-top:4px}
li{margin-bottom:3px;line-height:1.45}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{background:#fef3c7;color:#92400e;border-radius:999px;padding:3px 12px;font-size:11.5px;font-weight:500}
ul.certs{list-style:none;padding:0}
ul.certs li{padding:2px 0;font-size:12.5px}
ul.certs li::before{content:'•';color:#d97706;margin-right:7px;font-weight:700}
@media print{body{padding:20px 28px}.chip{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head>
<body>
<div class="hdr">
  <div class="name">${esc(data.name)}</div>
  ${data.title ? `<div class="job-title">${esc(data.title)}</div>` : ''}
</div>
${contactItems.length ? `<div class="contact">${contactItems.join('')}</div>` : ''}
${data.summary ? `<div class="sec"><div class="st">Summary</div><p>${esc(data.summary)}</p></div>` : ''}
${data.experience?.length ? `<div class="sec"><div class="st">Work Experience</div>${entryHtml(data.experience, false)}</div>` : ''}
${data.education?.length ? `<div class="sec"><div class="st">Education</div>${entryHtml(data.education, true)}</div>` : ''}
${data.skills?.length ? `<div class="sec"><div class="st">Skills</div><div class="chips">${data.skills.map(s => `<span class="chip">${esc(s)}</span>`).join('')}</div></div>` : ''}
${data.certifications?.length ? `<div class="sec"><div class="st">Certificates</div><ul class="certs">${data.certifications.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}
</body>
</html>`;
}

// POST /api/ai/import-job
router.post('/import-job', async (req, res) => {
  if (!checkRateLimit(req.user.id)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Please wait a minute before making more AI requests.' });
  }
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required.' });

  try {
    const text = await callClaude(
      'You are a job posting parser. Extract structured data and return only valid JSON.',
      `Extract job details from this URL: ${url}

Return a JSON object with these exact keys:
{
  "title": "Job title",
  "company": "Company name",
  "location": "Location or Remote",
  "description": "Brief description (max 200 words)",
  "source": "Web Import"
}

If you cannot determine a value, use an empty string. Return ONLY the JSON object, no other text.`
    );

    let job;
    try {
      const match = text.match(/\{[\s\S]*\}/);
      job = JSON.parse(match ? match[0] : text);
    } catch {
      job = { title: '', company: '', location: '', description: text.slice(0, 200), source: 'Web Import' };
    }

    res.json({ job: { ...job, url } });
  } catch (err) {
    console.error('Import job error:', err);
    res.status(500).json({ error: err.message || 'Failed to import job.' });
  }
});

// POST /api/ai/import-linkedin-profile
router.post('/import-linkedin-profile', async (req, res) => {
  if (!checkRateLimit(req.user.id)) {
    return res.status(429).json({ error: 'Rate limit exceeded.' });
  }
  const { profile_url } = req.body;
  if (!profile_url) return res.status(400).json({ error: 'profile_url is required.' });

  try {
    const text = await callClaude(
      'You help users import LinkedIn profile data. Return only valid JSON.',
      `A user wants to import this LinkedIn profile: ${profile_url}

Since LinkedIn requires authentication to access profile data directly, acknowledge the import and provide a helpful template.

Return JSON:
{
  "headline": "LinkedIn profile imported",
  "summary": "Profile imported from ${profile_url}. Please review the linked profile and update your notes with relevant experience and skills."
}

Return ONLY the JSON object.`
    );

    let profile;
    try {
      const match = text.match(/\{[\s\S]*\}/);
      profile = JSON.parse(match ? match[0] : text);
    } catch {
      profile = { headline: 'LinkedIn profile imported', summary: `Profile URL: ${profile_url}` };
    }

    res.json({ profile });
  } catch (err) {
    console.error('LinkedIn import error:', err);
    res.status(500).json({ error: err.message || 'Failed to import LinkedIn profile.' });
  }
});

// POST /api/ai/:jobId/match-score
router.post('/:jobId/match-score', async (req, res) => {
  if (!checkRateLimit(req.user.id)) {
    return res.status(429).json({ error: 'Rate limit exceeded.' });
  }
  try {
    const { job, resumeText } = getJobAndResume(req.params.jobId, req.body.resume_id, req.user.id);
    if (!resumeText) return res.status(400).json({ error: 'No resume found. Please upload a resume first.' });

    const result = await callClaude(
      'You are an ATS and career coach expert. Analyze resume-to-job fit.',
      `Analyze how well this resume matches this job.

JOB: ${job.title} at ${job.company}
DESCRIPTION: ${job.description || 'Not provided'}

RESUME:
${resumeText}

Provide:
1. Overall match score (0–100%) with brief reasoning
2. Matching skills and experience (bullet points)
3. Missing requirements or gaps (bullet points)
4. Top 3 specific recommendations to strengthen this application`
    );

    upsertDocument(job.id, req.body.resume_id, 'match_score', result, req.user.id);
    res.json({ match_score: result });
  } catch (err) {
    console.error('Match score error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate match score.' });
  }
});

// POST /api/ai/:jobId/tailor-resume
router.post('/:jobId/tailor-resume', async (req, res) => {
  if (!checkRateLimit(req.user.id)) {
    return res.status(429).json({ error: 'Rate limit exceeded.' });
  }
  try {
    const { job, resumeText } = getJobAndResume(req.params.jobId, req.body.resume_id, req.user.id);
    if (!resumeText) return res.status(400).json({ error: 'No resume found. Please upload a resume first.' });

    // Load original DOCX to extract exact paragraph list for 1:1 injection at download time
    const originalResume = req.body.resume_id
      ? db.prepare('SELECT file_data, file_type FROM resumes WHERE id = ? AND user_id = ?').get(req.body.resume_id, req.user.id)
      : db.prepare('SELECT file_data, file_type FROM resumes WHERE user_id = ? AND is_default = 1').get(req.user.id);

    let result = null;

    if (originalResume?.file_data && originalResume.file_type === DOCX_MIME) {
      const zip = new PizZip(Buffer.from(originalResume.file_data));
      const docFile = zip.file('word/document.xml');

      if (docFile) {
        const docXml = docFile.asText();
        const paragraphs = [];
        const paraRe = /<w:p[ >][\s\S]*?<\/w:p>/g;
        let m;
        while ((m = paraRe.exec(docXml)) !== null) {
          const texts = [...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(x => x[1]);
          const text = texts.join('').trim();
          if (text) paragraphs.push(text);
        }

        if (paragraphs.length > 0) {
          const N = paragraphs.length;
          const numbered = paragraphs.map((p, i) => `${i + 1}| ${p}`).join('\n');

          const raw = await callClaude(
            'You are an expert resume writer. You tailor resumes to specific jobs while preserving exact structure.',
            `Tailor this resume for the job below. The resume has exactly ${N} lines.

RULES — follow precisely:
1. Return EXACTLY ${N} lines — one output line per input line, no more, no less
2. Each line must start with its number and a pipe character: "1| text", "2| text", etc.
3. Keep every section heading exactly as-is
4. Only change wording: add job-relevant keywords, strengthen impact verbs
5. Do NOT add or remove lines
6. Plain text only — no markdown, no asterisks, no extra blank lines between numbered lines

JOB: ${job.title} at ${job.company}
DESCRIPTION: ${job.description || 'Not provided'}

RESUME (${N} lines):
${numbered}

Return exactly ${N} numbered lines.`
          );

          // Extract only lines that start with a number pattern; ignore blank spacers Claude may add
          const parsed = raw.split('\n')
            .filter(l => /^\s*\d+\s*[|.)]\s*/.test(l))
            .map(l => l.replace(/^\s*\d+\s*[|.)\s]+/, '').trimEnd());

          if (parsed.length === N) {
            result = parsed.join('\n');
          }
        }
      }
    }

    if (!result) {
      // Fallback for non-DOCX resumes or when Claude doesn't return exact paragraph count
      result = await callClaude(
        'You are an expert resume writer. You tailor resumes to specific jobs by editing content while preserving structure exactly.',
        `Tailor this resume for the job below.

RULES — follow these precisely:
1. Keep every section heading exactly as-is (do not rename, reorder, or remove sections)
2. Keep the same number of lines and bullet points as the original
3. Only change wording: incorporate job-relevant keywords, strengthen impact verbs
4. Do NOT add new bullet points or remove existing ones
5. Output one line of text per original line
6. Return plain text only, no markdown formatting

JOB: ${job.title} at ${job.company}
DESCRIPTION: ${job.description || 'Not provided'}

ORIGINAL RESUME (preserve this exact line structure):
${resumeText}

Return the tailored resume with the identical line structure as the original.`
      );
    }

    upsertDocument(job.id, req.body.resume_id, 'tailored_resume', result, req.user.id);
    res.json({ tailored_resume: result });
  } catch (err) {
    console.error('Tailor resume error:', err);
    res.status(500).json({ error: err.message || 'Failed to tailor resume.' });
  }
});

// POST /api/ai/:jobId/cover-letter
router.post('/:jobId/cover-letter', async (req, res) => {
  if (!checkRateLimit(req.user.id)) {
    return res.status(429).json({ error: 'Rate limit exceeded.' });
  }
  try {
    const { job, resumeText } = getJobAndResume(req.params.jobId, req.body.resume_id, req.user.id);
    if (!resumeText) return res.status(400).json({ error: 'No resume found. Please upload a resume first.' });

    const result = await callClaude(
      'You are an expert cover letter writer. Write concise, compelling letters.',
      `Write a professional cover letter for this application.

JOB: ${job.title} at ${job.company}
LOCATION: ${job.location || 'Not specified'}
DESCRIPTION: ${job.description || 'Not provided'}

APPLICANT BACKGROUND:
${resumeText}

Write a compelling 3-paragraph cover letter. Include a subject line at the top. Do not use placeholder text — write it ready to send.`
    );

    upsertDocument(job.id, req.body.resume_id, 'cover_letter', result, req.user.id);
    res.json({ cover_letter: result });
  } catch (err) {
    console.error('Cover letter error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate cover letter.' });
  }
});

// POST /api/ai/:jobId/interview-prep
router.post('/:jobId/interview-prep', async (req, res) => {
  if (!checkRateLimit(req.user.id)) {
    return res.status(429).json({ error: 'Rate limit exceeded.' });
  }
  try {
    const { job, resumeText } = getJobAndResume(req.params.jobId, req.body.resume_id, req.user.id);

    const result = await callClaude(
      'You are an expert interview coach. Prepare candidates thoroughly.',
      `Prepare interview materials for this role.

JOB: ${job.title} at ${job.company}
DESCRIPTION: ${job.description || 'Not provided'}
${resumeText ? `\nCANDIDATE BACKGROUND:\n${resumeText}` : ''}

Provide:
1. Five likely technical or role-specific questions with concise model answers
2. Three behavioral questions with STAR-method answer frameworks based on the candidate's background
3. Three smart questions for the candidate to ask the interviewer`
    );

    upsertDocument(job.id, req.body.resume_id, 'interview_prep', result, req.user.id);
    res.json({ interview_prep: result });
  } catch (err) {
    console.error('Interview prep error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate interview prep.' });
  }
});

// POST /api/ai/:jobId/email-draft
router.post('/:jobId/email-draft', async (req, res) => {
  if (!checkRateLimit(req.user.id)) {
    return res.status(429).json({ error: 'Rate limit exceeded.' });
  }
  try {
    const { job, resumeText } = getJobAndResume(req.params.jobId, req.body.resume_id, req.user.id);

    const result = await callClaude(
      'You are an expert at professional job application emails. Be concise and impactful.',
      `Write a short professional application or follow-up email for this position.

JOB: ${job.title} at ${job.company}
${resumeText ? `\nAPPLICANT BACKGROUND (brief):\n${resumeText.substring(0, 400)}` : ''}

Write:
Subject: [email subject line]

[3–4 sentence professional email body]

Make it direct, warm, and confident. Do not use placeholder names.`
    );

    upsertDocument(job.id, req.body.resume_id, 'email_draft', result, req.user.id);
    res.json({ email_draft: result });
  } catch (err) {
    console.error('Email draft error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate email draft.' });
  }
});

// GET /api/ai/resume-preview/:resumeId — must be before /:jobId routes
router.get('/resume-preview/:resumeId', async (req, res) => {
  if (!checkRateLimit(req.user.id)) {
    return res.status(429).json({ error: 'Rate limit exceeded.' });
  }
  try {
    const resume = db.prepare('SELECT content FROM resumes WHERE id = ? AND user_id = ?').get(req.params.resumeId, req.user.id);
    if (!resume?.content) return res.status(404).json({ error: 'Resume not found.' });
    const structured = await parseResumeToJSON(resume.content);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderResumeHTML(structured));
  } catch (err) {
    console.error('Resume preview error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate resume preview.' });
  }
});

// GET /api/ai/:jobId/documents
router.get('/:jobId/documents', (req, res) => {
  try {
    const job = db.prepare('SELECT id FROM jobs WHERE id = ? AND user_id = ?').get(req.params.jobId, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    const documents = db.prepare('SELECT * FROM ai_documents WHERE job_id = ? ORDER BY updated_at DESC').all(req.params.jobId);
    res.json({ documents });
  } catch (err) {
    console.error('Get documents error:', err);
    res.status(500).json({ error: 'Failed to get documents.' });
  }
});

// GET /api/ai/:jobId/tailor-resume/download
router.get('/:jobId/tailor-resume/download', async (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(req.params.jobId, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const doc = db.prepare(
      'SELECT content, resume_id FROM ai_documents WHERE job_id = ? AND type = ? ORDER BY updated_at DESC LIMIT 1'
    ).get(req.params.jobId, 'tailored_resume');

    if (!doc || !doc.content) return res.status(404).json({ error: 'No tailored resume found. Generate one first.' });

    // HTML preview: parse content to structured JSON and render the visual template
    if (req.query.format === 'html') {
      if (!checkRateLimit(req.user.id)) return res.status(429).json({ error: 'Rate limit exceeded.' });
      const structured = await parseResumeToJSON(doc.content);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(renderResumeHTML(structured));
    }

    // Resolve the original resume file for format preservation
    const resumeId = req.query.resume_id || doc.resume_id;
    const original = resumeId
      ? db.prepare('SELECT file_data, file_type FROM resumes WHERE id = ? AND user_id = ?').get(resumeId, req.user.id)
      : db.prepare('SELECT file_data, file_type FROM resumes WHERE user_id = ? AND is_default = 1').get(req.user.id);

    let buffer;
    if (original?.file_data && original.file_type === DOCX_MIME) {
      // Format-preserving: inject tailored text into original DOCX XML structure
      // Keeps fonts, sizes, bold, spacing, heading styles — only text content changes
      buffer = injectIntoDocx(Buffer.from(original.file_data), doc.content);
    } else {
      // Fallback for PDF originals or missing file: generate a clean fresh DOCX
      const document = textToDocx(doc.content, `${job.title} — Tailored Resume`);
      buffer = await Packer.toBuffer(document);
    }

    res.set({
      'Content-Type': DOCX_MIME,
      'Content-Disposition': `attachment; filename="${job.company.replace(/[^a-zA-Z0-9]/g, '-')}-resume.docx"`,
    });
    res.send(buffer);
  } catch (err) {
    console.error('Download tailored resume error:', err);
    res.status(500).json({ error: 'Failed to generate resume download.' });
  }
});

// GET /api/ai/:jobId/cover-letter/download
router.get('/:jobId/cover-letter/download', async (req, res) => {
  try {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(req.params.jobId, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const doc = db.prepare(
      'SELECT content, resume_id FROM ai_documents WHERE job_id = ? AND type = ? ORDER BY updated_at DESC LIMIT 1'
    ).get(req.params.jobId, 'cover_letter');

    if (!doc || !doc.content) return res.status(404).json({ error: 'No cover letter found. Generate one first.' });

    // Use the same resume DOCX as a style template so fonts and margins match
    const resumeId = req.query.resume_id || doc.resume_id;
    const original = resumeId
      ? db.prepare('SELECT file_data, file_type FROM resumes WHERE id = ? AND user_id = ?').get(resumeId, req.user.id)
      : db.prepare('SELECT file_data, file_type FROM resumes WHERE user_id = ? AND is_default = 1').get(req.user.id);

    let buffer;
    if (original?.file_data && original.file_type === DOCX_MIME) {
      buffer = injectCoverLetterIntoDocx(Buffer.from(original.file_data), doc.content);
    } else {
      const document = textToDocx(doc.content, `Cover Letter — ${job.title} at ${job.company}`);
      buffer = await Packer.toBuffer(document);
    }

    res.set({
      'Content-Type': DOCX_MIME,
      'Content-Disposition': `attachment; filename="${job.company.replace(/[^a-zA-Z0-9]/g, '-')}-cover-letter.docx"`,
    });
    res.send(buffer);
  } catch (err) {
    console.error('Download cover letter error:', err);
    res.status(500).json({ error: 'Failed to generate cover letter download.' });
  }
});

module.exports = router;
