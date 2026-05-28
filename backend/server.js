require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const config = require('./src/config');
// Initialize DB on startup
require('./src/db');

const authRoutes = require('./src/routes/auth');
const jobsRoutes = require('./src/routes/jobs');
const resumesRoutes = require('./src/routes/resumes');
const aiRoutes = require('./src/routes/ai');
const searchRoutes = require('./src/routes/search');

const app = express();

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/resumes', resumesRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/search', searchRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend static files in production
if (config.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../frontend/dist');
  app.use(express.static(distPath));

  // SPA catch-all
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(config.PORT, () => {
  console.log(`JobHunter server running on port ${config.PORT} (${config.NODE_ENV})`);
});

module.exports = app;
