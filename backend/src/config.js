require('dotenv').config();

const NODE_ENV = process.env.NODE_ENV || 'development';

if (NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required in production');
}

const config = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  JWT_EXPIRY: process.env.JWT_EXPIRY || '7d',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ADZUNA_APP_ID: process.env.ADZUNA_APP_ID,
  ADZUNA_API_KEY: process.env.ADZUNA_API_KEY,
  JOOBLE_API_KEY: process.env.JOOBLE_API_KEY,
  THEMUSE_API_KEY: process.env.THEMUSE_API_KEY,
  DB_PATH: NODE_ENV === 'production' ? '/app/data/data.sqlite' : './data.sqlite',
  NODE_ENV,
};

module.exports = config;
