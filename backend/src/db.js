const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/jobhunter.db');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT,
    url TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'saved',
    salary_min INTEGER,
    salary_max INTEGER,
    notes TEXT,
    source TEXT,
    deadline TEXT,
    linkedin_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS job_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'other',
    scheduled_at TEXT,
    notes TEXT,
    location TEXT,
    duration_minutes INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS job_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS resumes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    content TEXT,
    file_data BLOB,
    file_type TEXT,
    original_name TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ai_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resume_id INTEGER REFERENCES resumes(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    content TEXT,
    resume_version INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migrations for existing DBs
const migrate = (sql) => { try { db.exec(sql); } catch (e) { /* column may already exist */ } };
migrate("ALTER TABLE jobs ADD COLUMN deadline TEXT");
migrate("ALTER TABLE jobs ADD COLUMN linkedin_url TEXT");
migrate("ALTER TABLE resumes ADD COLUMN content TEXT");
migrate("ALTER TABLE resumes ADD COLUMN file_data BLOB");
migrate("ALTER TABLE resumes ADD COLUMN file_type TEXT");
migrate("ALTER TABLE resumes ADD COLUMN original_name TEXT");
migrate("ALTER TABLE resumes ADD COLUMN updated_at TEXT");
migrate("UPDATE resumes SET updated_at = created_at WHERE updated_at IS NULL");
migrate("ALTER TABLE ai_documents ADD COLUMN resume_version INTEGER DEFAULT 1");
migrate("ALTER TABLE ai_documents ADD COLUMN resume_id INTEGER REFERENCES resumes(id) ON DELETE SET NULL");
migrate("ALTER TABLE ai_documents ADD COLUMN created_at TEXT");
migrate("ALTER TABLE ai_documents ADD COLUMN updated_at TEXT");
migrate("UPDATE ai_documents SET created_at = datetime('now') WHERE created_at IS NULL");
migrate("UPDATE ai_documents SET updated_at = datetime('now') WHERE updated_at IS NULL");
migrate("ALTER TABLE job_events ADD COLUMN location TEXT");
migrate("ALTER TABLE job_events ADD COLUMN duration_minutes INTEGER");
migrate("ALTER TABLE job_notes ADD COLUMN updated_at TEXT");
migrate("UPDATE job_notes SET updated_at = created_at WHERE updated_at IS NULL");

module.exports = db;
