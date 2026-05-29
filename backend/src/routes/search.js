const express = require('express');
const fetch = require('node-fetch');
const config = require('../config');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

async function searchAdzuna(q, location, page, perPage) {
  if (!config.ADZUNA_APP_ID || !config.ADZUNA_API_KEY) return null;

  const params = new URLSearchParams({
    app_id: config.ADZUNA_APP_ID,
    app_key: config.ADZUNA_API_KEY,
    what: q,
    results_per_page: String(perPage),
    'content-type': 'application/json',
  });
  if (location) params.append('where', location);

  const url = `https://api.adzuna.com/v1/api/jobs/us/search/${page}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error('Adzuna API error:', res.status, await res.text().catch(() => ''));
    return null;
  }
  const data = await res.json();

  return {
    total: data.count || 0,
    results: (data.results || []).map(job => ({
      id: `adzuna-${job.id}`,
      title: job.title || '',
      company: job.company?.display_name || '',
      location: job.location?.display_name || '',
      url: job.redirect_url || '',
      description: job.description || '',
      salary_min: job.salary_min || null,
      salary_max: job.salary_max || null,
      salary: null,
      posted_at: job.created || null,
      source: 'Adzuna',
    })),
  };
}

async function searchJooble(q, location, page, perPage) {
  if (!config.JOOBLE_API_KEY) return null;

  const body = { keywords: q, page: String(page), resultsOnPage: String(perPage) };
  if (location) body.location = location;

  const url = `https://jooble.org/api/${config.JOOBLE_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error('Jooble API error:', res.status, await res.text().catch(() => ''));
    return null;
  }
  const data = await res.json();

  return {
    total: data.totalCount || 0,
    results: (data.jobs || []).map((job, i) => ({
      id: `jooble-${page}-${i}-${encodeURIComponent(job.link || i)}`,
      title: job.title || '',
      company: job.company || '',
      location: job.location || '',
      url: job.link || '',
      description: job.snippet || '',
      salary_min: null,
      salary_max: null,
      salary: job.salary || null,
      posted_at: job.updated || null,
      source: 'Jooble',
    })),
  };
}

// GET /api/search
router.get('/', async (req, res) => {
  try {
    const { q, location, page = 1, results_per_page = 10 } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Search query (q) is required.' });
    }

    const hasAdzuna = !!(config.ADZUNA_APP_ID && config.ADZUNA_API_KEY);
    const hasJooble = !!config.JOOBLE_API_KEY;

    if (!hasAdzuna && !hasJooble) {
      return res.status(503).json({ error: 'Job search is not configured.' });
    }

    const perPage = parseInt(results_per_page);
    const pageNum = parseInt(page);

    const [adzunaResult, joobleResult] = await Promise.all([
      hasAdzuna ? searchAdzuna(q, location, pageNum, perPage).catch(() => null) : Promise.resolve(null),
      hasJooble ? searchJooble(q, location, pageNum, perPage).catch(() => null) : Promise.resolve(null),
    ]);

    const results = [
      ...(adzunaResult?.results || []),
      ...(joobleResult?.results || []),
    ];

    const total = (adzunaResult?.total || 0) + (joobleResult?.total || 0);

    res.json({ results, total, page: pageNum });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Failed to search jobs. Please try again.' });
  }
});

module.exports = router;
