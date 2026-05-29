import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { jobs as jobsApi } from '../api.js';
import styles from './Dashboard.module.css';

const STATUS_LABELS = {
  saved: 'Saved', applied: 'Applied', phone_screen: 'Phone Screen',
  interview: 'Interview', offer: 'Offer', rejected: 'Rejected', withdrawn: 'Withdrawn',
};

const STATUS_ORDER = ['saved', 'applied', 'phone_screen', 'interview', 'offer', 'rejected', 'withdrawn'];

const EVENT_ICONS = { interview: '🎤', phone_screen: '📞', offer: '🎉', deadline: '⏰', other: '📅' };

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return Math.ceil(diff / 86400000);
}

function daysAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return '1d ago';
  return `${d}d ago`;
}

export default function Dashboard() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    jobsApi.list()
      .then(data => setJobs(data.jobs || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const byStatus = STATUS_ORDER.reduce((acc, s) => ({ ...acc, [s]: 0 }), {});
    jobs.forEach(j => { byStatus[j.status] = (byStatus[j.status] || 0) + 1; });
    return {
      total: jobs.length,
      applied: jobs.filter(j => ['applied', 'phone_screen', 'interview', 'offer'].includes(j.status)).length,
      interviews: byStatus.interview || 0,
      offers: byStatus.offer || 0,
      byStatus,
    };
  }, [jobs]);

  const upcomingDeadlines = useMemo(() => {
    return jobs
      .filter(j => j.deadline && daysUntil(j.deadline) !== null && daysUntil(j.deadline) >= 0 && daysUntil(j.deadline) <= 7)
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  }, [jobs]);

  const upcomingEvents = useMemo(() => {
    const now = Date.now();
    const events = [];
    jobs.forEach(job => {
      (job.events || []).forEach(ev => {
        if (ev.scheduled_at && new Date(ev.scheduled_at).getTime() >= now) {
          events.push({ ...ev, jobTitle: job.title, jobCompany: job.company, jobId: job.id });
        }
      });
    });
    return events.sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at)).slice(0, 5);
  }, [jobs]);

  const recentJobs = useMemo(() =>
    [...jobs].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 8),
    [jobs]
  );

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingState}><span className="spinner" /> Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.subtitle}>Overview of your job search pipeline</p>
        </div>
        <div className={styles.quickActions}>
          <button className={`${styles.actionBtn} ${styles.actionBtnSecondary}`} onClick={() => navigate('/tracker')}>
            View Tracker
          </button>
          <button className={styles.actionBtn} onClick={() => navigate('/tracker?add=1')}>
            + Add Job
          </button>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {/* Deadline Banner */}
      {upcomingDeadlines.length > 0 && (
        <div style={{
          background: 'var(--warning-dim)',
          border: '1px solid var(--warning)',
          borderRadius: '10px',
          padding: '14px 18px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
        }}>
          <span style={{ fontSize: '18px', flexShrink: 0 }}>⏰</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: 'var(--warning)', marginBottom: '6px', fontSize: '14px' }}>
              {upcomingDeadlines.length === 1
                ? '1 application deadline in the next 7 days'
                : `${upcomingDeadlines.length} application deadlines in the next 7 days`}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {upcomingDeadlines.map(job => {
                const d = daysUntil(job.deadline);
                return (
                  <span
                    key={job.id}
                    onClick={() => navigate(`/jobs/${job.id}`)}
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--warning)',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <strong>{job.title}</strong> at {job.company} —{' '}
                    <span style={{ color: d === 0 ? 'var(--danger)' : 'var(--warning)' }}>
                      {d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `${d} days`}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: 'var(--accent)' }}>{stats.total}</div>
          <div className={styles.statLabel}>Total Jobs</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: 'var(--info)' }}>{stats.applied}</div>
          <div className={styles.statLabel}>In Progress</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: 'var(--warning)' }}>{stats.interviews}</div>
          <div className={styles.statLabel}>Interviews</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: 'var(--success)' }}>{stats.offers}</div>
          <div className={styles.statLabel}>Offers</div>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className={styles.emptyState}>
          <div style={{ fontSize: '48px' }}>🎯</div>
          <div>No jobs tracked yet.</div>
          <div className={styles.emptyHint}>Head to the Tracker to add your first application.</div>
          <button className={styles.actionBtn} onClick={() => navigate('/tracker')}>Go to Tracker</button>
        </div>
      ) : (
        <>
          <div className={styles.twoCol}>
            {/* Pipeline */}
            <div className={styles.card}>
              <div className={styles.cardTitle}>Pipeline</div>
              <div className={styles.pipeline}>
                {STATUS_ORDER.map(status => {
                  const count = stats.byStatus[status] || 0;
                  const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
                  return (
                    <div key={status} className={styles.pipelineRow}>
                      <div className={styles.pipelineLabel}>
                        <span
                          className={styles.statusDot}
                          style={{ background: `var(--status-${status})` }}
                        />
                        {STATUS_LABELS[status]}
                      </div>
                      <div className={styles.pipelineBar}>
                        <div
                          className={styles.pipelineFill}
                          style={{
                            width: `${pct}%`,
                            background: `var(--status-${status})`,
                          }}
                        />
                      </div>
                      <div className={styles.pipelineCount}>{count}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Upcoming Events */}
            <div className={styles.card}>
              <div className={styles.cardTitle}>Upcoming Events</div>
              {upcomingEvents.length === 0 ? (
                <div className={styles.emptyState} style={{ padding: '24px', fontSize: '13px' }}>
                  No upcoming events scheduled.
                </div>
              ) : (
                <div className={styles.eventList}>
                  {upcomingEvents.map(ev => (
                    <div key={ev.id} className={styles.eventItem} onClick={() => navigate(`/jobs/${ev.jobId}`)}>
                      <span className={styles.eventIcon}>{EVENT_ICONS[ev.type] || '📅'}</span>
                      <div className={styles.eventInfo}>
                        <div className={styles.eventTitle}>{ev.title}</div>
                        <div className={styles.eventJob}>{ev.jobTitle} — {ev.jobCompany}</div>
                      </div>
                      <div className={styles.eventDate}>{formatDate(ev.scheduled_at)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Jobs */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Recent Activity</div>
            <div className={styles.recentTable}>
              <div className={styles.tableHeader}>
                <span>Job</span>
                <span>Company</span>
                <span>Status</span>
                <span>Updated</span>
              </div>
              {recentJobs.map(job => (
                <div key={job.id} className={styles.tableRow} onClick={() => navigate(`/jobs/${job.id}`)}>
                  <span className={styles.jobTitle}>{job.title}</span>
                  <span className={styles.jobCompany}>{job.company}</span>
                  <span>
                    <span
                      className={styles.statusBadge}
                      style={{
                        background: `var(--status-${job.status})22`,
                        color: `var(--status-${job.status})`,
                        border: `1px solid var(--status-${job.status})44`,
                      }}
                    >
                      {STATUS_LABELS[job.status] || job.status}
                    </span>
                  </span>
                  <span className={styles.jobDate}>{daysAgo(job.updated_at)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
