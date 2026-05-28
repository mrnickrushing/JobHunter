# JobHunter

A full-stack job search tracker application that helps you manage your job applications, track progress through the hiring pipeline, and leverage AI to create tailored resumes and cover letters.

## Features

- **Job Tracker**: Kanban board and list view for tracking applications through every stage
- **Status Pipeline**: Track jobs from Saved → Applied → Phone Screen → Interview → Offer
- **AI-Powered Tools**: 
  - Resume tailoring for specific job descriptions
  - Cover letter generation
  - Match score analysis
  - Interview preparation Q&A
- **Job Search**: Search real job listings via Adzuna API
- **Resume Management**: Store multiple resumes, set a default
- **Contact Tracking**: Track hiring managers and contacts per job
- **Event Timeline**: Log interviews, calls, follow-ups per job
- **Dashboard**: Overview stats, pipeline funnel, upcoming events

## Screenshots

_Add screenshots here_

## Tech Stack

- **Backend**: Node.js + Express + better-sqlite3 (SQLite)
- **Frontend**: React 18 + Vite
- **Auth**: JWT stored in localStorage
- **AI**: Anthropic Claude API (claude-sonnet-4-20250514)
- **Job Search**: Adzuna API
- **Deployment**: Railway

## Database Schema

| Table | Purpose |
|-------|---------|
| `users` | User accounts (email, password hash, name) |
| `resumes` | Resume content (plain text, supports multiple) |
| `jobs` | Job applications with full details and status |
| `contacts` | Contacts associated with each job |
| `events` | Timeline events per job (interviews, calls, etc.) |
| `ai_documents` | AI-generated content (tailored resumes, cover letters, etc.) |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3000) |
| `JWT_SECRET` | Yes (prod) | Secret key for JWT signing |
| `JWT_EXPIRY` | No | JWT expiry duration (default: 7d) |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude AI features |
| `ADZUNA_APP_ID` | Yes | Adzuna API application ID |
| `ADZUNA_API_KEY` | Yes | Adzuna API key |
| `NODE_ENV` | No | Set to `production` for production mode |

## Local Development Setup

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd JobHunter
   ```

2. Install all dependencies:
   ```bash
   npm run install:all
   ```

3. Create a `.env` file in the `backend/` directory:
   ```env
   PORT=3000
   JWT_SECRET=your-super-secret-jwt-key-here
   JWT_EXPIRY=7d
   ANTHROPIC_API_KEY=your-anthropic-api-key
   ADZUNA_APP_ID=your-adzuna-app-id
   ADZUNA_API_KEY=your-adzuna-api-key
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

   This runs:
   - Backend on http://localhost:3000
   - Frontend on http://localhost:5173

### API Keys

- **Anthropic**: Get your API key at https://console.anthropic.com
- **Adzuna**: Register at https://developer.adzuna.com and create an application

## Railway Deployment

1. Create a new Railway project
2. Connect your GitHub repository
3. Add a volume mounted at `/app/data` for SQLite persistence
4. Set environment variables in Railway dashboard:
   - `JWT_SECRET` (generate a strong random secret)
   - `ANTHROPIC_API_KEY`
   - `ADZUNA_APP_ID`
   - `ADZUNA_API_KEY`
   - `NODE_ENV=production`
5. Railway will automatically run `npm run build` then `node backend/server.js`

The SQLite database will be stored at `/app/data/data.sqlite` on the mounted volume.

## Project Structure

```
JobHunter/
├── package.json          # Root scripts
├── railway.toml          # Railway deployment config
├── backend/
│   ├── package.json
│   ├── server.js         # Express app entry point
│   └── src/
│       ├── config.js     # Environment configuration
│       ├── db.js         # SQLite database setup
│       ├── middleware/
│       │   └── auth.js   # JWT authentication middleware
│       └── routes/
│           ├── auth.js   # Login/register endpoints
│           ├── jobs.js   # Job CRUD + contacts/events
│           ├── resumes.js # Resume management
│           ├── ai.js     # AI-powered features
│           └── search.js # Adzuna job search
└── frontend/
    ├── package.json
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── main.jsx      # React entry point
        ├── App.jsx       # Routes + auth context
        ├── api.js        # API helper functions
        ├── styles/
        │   └── global.css
        ├── pages/        # Page components
        └── components/   # Reusable components
```
