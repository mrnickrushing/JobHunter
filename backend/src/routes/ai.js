const express = require('express');
const fetch = require('node-fetch');
const db = require('../db');
const config = require('../config');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

async function callClaude(messages, system) {
  if (!config.ANTHROPIC_API_KEY) {
    throw new Error('Anthropic API key is not configured.');
  }

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
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}

function getJobAndResume(jobId, resumeId, userId) {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(jobId, userId);
  if (!job) throw { status: 404, message: 'Job not found.' };

  const resume = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(resumeId, userId);
  if (!resume) throw { status: 404, message: 'Resume not found.' };

  return { job, resume };
}

// POST /api/ai/tailor-resume
router.post('/tailor-resume', async (req, res) => {
  try {
    const { jobId, resumeId } = req.body;
    if (!jobId || !resumeId) {
      return res.status(400).json({ error: 'jobId and resumeId are required.' });
    }

    const { job, resume } = getJobAndResume(jobId, resumeId, req.user.id);

    const system = 'You are an expert resume writer and career coach. Tailor resumes to be ATS-optimized and highly relevant to specific job descriptions.';
    const messages = [
      {
        role: 'user',
        content: `Please tailor the following resume for the job listed below. Optimize it to match the job requirements, incorporate relevant keywords, and highlight the most relevant experience. Keep the same basic format but adjust content to best match this specific role.

JOB TITLE: ${job.title}
COMPANY: ${job.company}
${job.description ? `JOB DESCRIPTION:\n${job.description}` : ''}

ORIGINAL RESUME:
${resume.content}

Please provide the tailored resume content only, no explanations or headers.`,
      },
    ];

    const content = await callClaude(messages, system);

    // Save to ai_documents (upsert-style: insert new version)
    db.prepare(`
      INSERT INTO ai_documents (job_id, user_id, type, content)
      VALUES (?, ?, 'tailored_resume', ?)
    `).run(job.id, req.user.id, content);

    res.json({ content });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Tailor resume error:', err);
    res.status(500).json({ error: err.message || 'Failed to tailor resume.' });
  }
});

// POST /api/ai/cover-letter
router.post('/cover-letter', async (req, res) => {
  try {
    const { jobId, resumeId } = req.body;
    if (!jobId || !resumeId) {
      return res.status(400).json({ error: 'jobId and resumeId are required.' });
    }

    const { job, resume } = getJobAndResume(jobId, resumeId, req.user.id);

    const system = 'You are an expert cover letter writer who crafts compelling, personalized cover letters that get interviews.';
    const messages = [
      {
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

Output only the cover letter text, no extra headers or explanations. Start with "Dear Hiring Manager," or similar.`,
      },
    ];

    const content = await callClaude(messages, system);

    db.prepare(`
      INSERT INTO ai_documents (job_id, user_id, type, content)
      VALUES (?, ?, 'cover_letter', ?)
    `).run(job.id, req.user.id, content);

    res.json({ content });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Cover letter error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate cover letter.' });
  }
});

// POST /api/ai/match-score
router.post('/match-score', async (req, res) => {
  try {
    const { jobId, resumeId } = req.body;
    if (!jobId || !resumeId) {
      return res.status(400).json({ error: 'jobId and resumeId are required.' });
    }

    const { job, resume } = getJobAndResume(jobId, resumeId, req.user.id);

    const system = 'You are an expert ATS (Applicant Tracking System) analyzer and career advisor. Provide objective, data-driven assessments.';
    const messages = [
      {
        role: 'user',
        content: `Analyze how well this resume matches the job description and provide a detailed assessment.

JOB TITLE: ${job.title}
COMPANY: ${job.company}
${job.description ? `JOB DESCRIPTION:\n${job.description}` : 'No description provided.'}

RESUME:
${resume.content}

Respond with ONLY a valid JSON object in this exact format (no markdown, no explanation):
{
  "score": <number 0-100>,
  "strengths": [<string>, <string>, ...],
  "gaps": [<string>, <string>, ...],
  "recommendation": "<2-3 sentence overall recommendation>"
}`,
      },
    ];

    const rawContent = await callClaude(messages, system);
    const cleaned = stripMarkdownFences(rawContent);
    const parsed = JSON.parse(cleaned);

    db.prepare(`
      INSERT INTO ai_documents (job_id, user_id, type, content)
      VALUES (?, ?, 'match_score', ?)
    `).run(job.id, req.user.id, JSON.stringify(parsed));

    res.json(parsed);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Match score error:', err);
    res.status(500).json({ error: err.message || 'Failed to analyze match score.' });
  }
});

// POST /api/ai/interview-prep
router.post('/interview-prep', async (req, res) => {
  try {
    const { jobId, resumeId } = req.body;
    if (!jobId || !resumeId) {
      return res.status(400).json({ error: 'jobId and resumeId are required.' });
    }

    const { job, resume } = getJobAndResume(jobId, resumeId, req.user.id);

    const system = 'You are an expert interview coach who helps candidates prepare thoroughly for job interviews.';
    const messages = [
      {
        role: 'user',
        content: `Create comprehensive interview preparation materials for this job application.

JOB TITLE: ${job.title}
COMPANY: ${job.company}
${job.description ? `JOB DESCRIPTION:\n${job.description}` : 'No description provided.'}

RESUME:
${resume.content}

Respond with ONLY a valid JSON object in this exact format (no markdown, no explanation):
{
  "questions": [
    {
      "question": "<interview question>",
      "answer_framework": "<how to approach answering this question, with specific tips>"
    }
  ],
  "topics": [<key topic string>, <key topic string>, ...],
  "tips": [<actionable tip string>, <actionable tip string>, ...]
}

Include 8-10 questions covering behavioral, technical, and situational types. Include 5-7 key topics to study. Include 5-6 practical tips.`,
      },
    ];

    const rawContent = await callClaude(messages, system);
    const cleaned = stripMarkdownFences(rawContent);
    const parsed = JSON.parse(cleaned);

    db.prepare(`
      INSERT INTO ai_documents (job_id, user_id, type, content)
      VALUES (?, ?, 'interview_prep', ?)
    `).run(job.id, req.user.id, JSON.stringify(parsed));

    res.json(parsed);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Interview prep error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate interview prep.' });
  }
});

// GET /api/ai/documents/:jobId - get all AI documents for a job
router.get('/documents/:jobId', (req, res) => {
  try {
    const job = db.prepare('SELECT id FROM jobs WHERE id = ? AND user_id = ?').get(req.params.jobId, req.user.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found.' });
    }

    const documents = db.prepare(
      'SELECT * FROM ai_documents WHERE job_id = ? AND user_id = ? ORDER BY created_at DESC'
    ).all(job.id, req.user.id);

    const parsed = documents.map(doc => {
      if (doc.type === 'match_score' || doc.type === 'interview_prep') {
        try {
          return { ...doc, content: JSON.parse(doc.content) };
        } catch {
          return doc;
        }
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
