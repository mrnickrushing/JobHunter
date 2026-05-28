const express = require('express');
const fetch = require('node-fetch');
const config = require('../config');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// GET /api/search - search jobs via Adzuna API
router.get('/', async (req, res) => {
  try {
    const { q, location, page = 1, results_per_page = 10 } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Search query (q) is required.' });
    }

    if (!config.ADZUNA_APP_ID || !config.ADZUNA_API_KEY) {
      return res.status(503).json({ error: 'Job search is not configured. Please set ADZUNA_APP_ID and ADZUNA_API_KEY.' });
    }

    const params = new URLSearchParams({
      app_id: config.ADZUNA_APP_ID,
      app_key: config.ADZUNA_API_KEY,
      what: q,
      results_per_page: String(results_per_page),
      'content-type': 'application/json',
    });

    if (location) {
      params.append('where', location);
    }

    const adzunaUrl = `https://api.adzuna.com/v1/api/jobs/us/search/${page}?${params.toString()}`;

    const response = await fetch(adzunaUrl);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Adzuna API error:', response.status, errorText);
      return res.status(502).json({ error: 'Job search API error. Please try again later.' });
    }

    const data = await response.json();

    const results = (data.results || []).map(job => ({
      id: job.id,
      title: job.title || '',
      company: job.company?.display_name || '',
      location: job.location?.display_name || '',
      url: job.redirect_url || '',
      description: job.description || '',
      salary_min: job.salary_min || null,
      salary_max: job.salary_max || null,
      posted_at: job.created || null,
    }));

    res.json({
      results,
      total: data.count || 0,
      page: parseInt(page),
    });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Failed to search jobs. Please try again.' });
  }
});

module.exports = router;
