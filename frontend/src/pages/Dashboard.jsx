import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { jobs as jobsApi } from '../api.js';
import { useAuth } from '../App.jsx';
import styles from './Dashboard.module.css';

const STATUSES = ['saved', 'applied', 'phone_screen', 'interview', 'offer', 'rejected', 'withdrawn'];

const STATUS_LABELS = {
  saved: 'Saved',
  applied: 'Applied',
  phone_screen: 'Phone Screen',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

const EVENT_TYPE_ICONS = {
  phone: '📞',
  interview: '🎤',
  offer: '🎉',
  followup: '📧',
  onsite: '🏢',
  technical: '💻',
  other: '📅',
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [allJobs, setAllJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const data = await jobsApi.list();
        setAllJobs(data.jobs || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const statusCounts = {};
  STATUSES.forEach(s => { statusCounts[s] = 0; });
  allJobs.forEach(j => {
    if (statusCounts[j.status] !== undefined) statusCounts[j.status]++;
  });

  const totalJobs = allJobs.length;
  const activeApplications = (statusCounts.applied || 0) + (statusCounts.phone_screen || 0) + (statusCounts.interview || 0);
  const interviews = statusCounts.interview || 0;
  const offers = statusCounts.offer || 0;

  const recentJobs = [...allJobs]
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 5);

  // Collect all events across jobs
  const allEvents = [];
  allJobs.forEach(job => {
    if (job.events) {
      job.events.forEach(evt => {
        allEvents.push({ ...evt, jobTitle: job.title, jobCompany: job.company, jobId: job.id });
      });
    }
  });
  const upcomingEvents = allEvents
    .filter(e => e.scheduled_at && new Date(e.scheduled_at) >= new Date())
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
    .slice(0, 5);

  const pipelineStatuses = ['saved', 'applied', 'phone_screen', 'interview', 'offer'];

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingState}>
          <div className="spinner" />
          <span>Loading dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>
            Good {getTimeOfDay()}, {user?.name ? user.name.split(' ')[0] : 'there'}!
          </h1>
          <p className={styles.subtitle}>Here's your job search overview</p>
        </div>
        <div className={styles.quickActions}>
          <button className={styles.actionBtn} onClick={() => navigate('/tracker')}>
            + Add Job
          </button>
          <button className={`${styles.actionBtn} ${styles.actionBtnSecondary}`} onClick={() => navigate('/search')}>
            Search Jobs
          </button>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {/* Stats row */}
      <div className={styles.statsGrid}>
        <StatCard label="Total Jobs" value={totalJobs} color="var(--accent)" />
        <StatCard label="Active Applications" value={activeApplications} color="var(--info)" />
        <StatCard label="Interviews" value={interviews} color="var(--warning)" />
        <StatCard label="Offers" value={offers} color="var(--success)" />
      </div>

      <div className={styles.twoCol}>
        {/* Pipeline funnel */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Application Pipeline</h2>
          <div className={styles.pipeline}>
            {pipelineStatuses.map(status => (
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
                      width: totalJobs > 0 ? `${(statusCounts[status] / totalJobs) * 100}%` : '0%',
                      background: `var(--status-${status})`,
                    }}
                  />
                </div>
                <span className={styles.pipelineCount}>{statusCounts[status]}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Upcoming events */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Upcoming Events</h2>
          {upcomingEvents.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No upcoming events scheduled.</p>
              <span className={styles.emptyHint}>Add events in job detail pages.</span>
            </div>
          ) : (
            <div className={styles.eventList}>
              {upcomingEvents.map(evt => (
                <div
                  key={evt.id}
                  className={styles.eventItem}
                  onClick={() => navigate(`/jobs/${evt.jobId}`)}
                >
                  <span className={styles.eventIcon}>
                    {EVENT_TYPE_ICONS[evt.type] || EVENT_TYPE_ICONS.other}
                  </span>
                  <div className={styles.eventInfo}>
                    <span className={styles.eventTitle}>{evt.title}</span>
                    <span className={styles.eventJob}>{evt.jobCompany} — {evt.jobTitle}</span>
                  </div>
                  <span className={styles.eventDate}>{formatDate(evt.scheduled_at)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Recent activity */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Recent Activity</h2>
        {recentJobs.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No jobs tracked yet.</p>
            <button className={styles.actionBtn} onClick={() => navigate('/tracker')}>
              Add your first job
            </button>
          </div>
        ) : (
          <div className={styles.recentTable}>
            <div className={styles.tableHeader}>
              <span>Job</span>
              <span>Company</span>
              <span>Status</span>
              <span>Updated</span>
            </div>
            {recentJobs.map(job => (
              <div
                key={job.id}
                className={styles.tableRow}
                onClick={() => navigate(`/jobs/${job.id}`)}
              >
                <span className={styles.jobTitle}>{job.title}</span>
                <span className={styles.jobCompany}>{job.company}</span>
                <span>
                  <StatusBadge status={job.status} />
                </span>
                <span className={styles.jobDate}>{daysAgo(job.updated_at)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className={styles.statCard}>
      <span className={styles.statValue} style={{ color }}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

function StatusBadge({ status }) {
  return (
    <span
      className={styles.statusBadge}
      style={{
        background: `var(--status-${status})20`,
        color: `var(--status-${status})`,
        border: `1px solid var(--status-${status})40`,
      }}
    >
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
