import React, { useState } from 'react';
import { search as searchApi, jobs as jobsApi } from '../api.js';
import styles from './Search.module.css';

function formatSalary(min, max) {
  if (!min && !max) return null;
  const fmt = n => n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n}`;
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  if (min) return `${fmt(min)}+`;
  return `Up to ${fmt(max)}`;
}

function daysAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

export default function Search() {
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savedIds, setSavedIds] = useState(new Set());
  const [savingIds, setSavingIds] = useState(new Set());
  const [searched, setSearched] = useState(false);

  const PER_PAGE = 10;

  async function doSearch(p = 1) {
    if (!query.trim()) { setError('Please enter a job title or keyword.'); return; }
    setLoading(true);
    setError('');
    setPage(p);
    try {
      const data = await searchApi.search({ q: query, location, page: p, results_per_page: PER_PAGE });
      setResults(data.results || []);
      setTotal(data.total || 0);
      setSearched(true);
    } catch (err) {
      setError(err.message || 'Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    doSearch(1);
  }

  async function saveJob(job) {
    setSavingIds(prev => new Set([...prev, job.id]));
    try {
      await jobsApi.create({
        title: job.title,
        company: job.company,
        location: job.location,
        url: job.url,
        description: job.description,
        salary_min: job.salary_min,
        salary_max: job.salary_max,
        status: 'saved',
        source: 'Adzuna',
      });
      setSavedIds(prev => new Set([...prev, job.id]));
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSavingIds(prev => { const s = new Set(prev); s.delete(job.id); return s; });
    }
  }

  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Find Jobs</h1>
        <p className={styles.subtitle}>Search millions of jobs powered by Adzuna</p>
      </div>

      <form onSubmit={handleSubmit} className={styles.searchBar}>
        <input
          className={styles.queryInput}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Job title, keywords..."
          autoFocus
        />
        <input
          className={styles.locationInput}
          value={location}
          onChange={e => setLocation(e.target.value)}
          placeholder="Location (optional)"
        />
        <button type="submit" className={styles.searchBtn} disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {error && <div className={styles.error}>{error}</div>}

      {loading && (
        <div className={styles.skeletonGrid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={styles.skeleton} />
          ))}
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🔍</div>
          <p>No results found for "{query}"</p>
          <p className={styles.emptyHint}>Try different keywords or broaden your location.</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <>
          <div className={styles.meta}>
            {total.toLocaleString()} results — page {page} of {totalPages}
          </div>
          <div className={styles.grid}>
            {results.map(job => (
              <div key={job.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <div className={styles.jobTitle}>{job.title}</div>
                    <div className={styles.jobCompany}>{job.company}</div>
                  </div>
                  {savedIds.has(job.id) ? (
                    <span className={styles.savedBadge}>Saved ✓</span>
                  ) : (
                    <button
                      className={styles.saveBtn}
                      onClick={() => saveJob(job)}
                      disabled={savingIds.has(job.id)}
                    >
                      {savingIds.has(job.id) ? '...' : '+ Save'}
                    </button>
                  )}
                </div>
                <div className={styles.cardMeta}>
                  {job.location && <span className={styles.metaItem}>📍 {job.location}</span>}
                  {formatSalary(job.salary_min, job.salary_max) && (
                    <span className={styles.metaItem}>💰 {formatSalary(job.salary_min, job.salary_max)}</span>
                  )}
                  {job.posted_at && <span className={styles.metaItem}>🕐 {daysAgo(job.posted_at)}</span>}
                </div>
                {job.description && (
                  <p className={styles.description}>
                    {job.description.slice(0, 200)}{job.description.length > 200 ? '...' : ''}
                  </p>
                )}
                {job.url && (
                  <a href={job.url} target="_blank" rel="noopener noreferrer" className={styles.viewLink}>
                    View Job →
                  </a>
                )}
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                className={styles.pageBtn}
                onClick={() => doSearch(page - 1)}
                disabled={page <= 1 || loading}
              >
                ← Previous
              </button>
              <span className={styles.pageInfo}>Page {page} of {totalPages}</span>
              <button
                className={styles.pageBtn}
                onClick={() => doSearch(page + 1)}
                disabled={page >= totalPages || loading}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
