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
  const offerCount = statusCounts.offer || 0;
  const responseRate = totalJobs > 0
    ? Math.round(((totalJobs - (statusCounts.saved || 0)) / totalJobs) * 100)
    : 0;

  const recentJobs = [...allJobs]
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .slice(0, 5);

  const upcomingEvents = allJobs
    .flatMap(job => (job.events || []).map(ev => ({ ...ev, jobTitle: job.title, jobCompany: job.company, jobId: job.id })))
    .filter(ev => ev.date && new Date(ev.date) >= new Date())
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 5);

  const deadlineSoon = allJobs
    .filter(j => j.deadline && new Date(j.deadline) >= new Date())
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    .slice(0, 3);

  function getTimeOfDay() {
    const h = new Date().getHours();
    if (h < 12) return 'morning';
    if (h < 17) return 'afternoon';
    return 'evening';
  }

  if (loading) return <div className={styles.page}><div className={styles.loadingCard}>Loading dashboard...</div></div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.greeting}>Good {getTimeOfDay()}, {user?.name?.split(' ')[0] || 'there'} 👋</h1>
          <p className={styles.subtitle}>Here's your job search at a glance.</p>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {deadlineSoon.length > 0 && (
        <div className={styles.deadlineBanner}>
          <span>⏰ Upcoming deadlines: </span>
          {deadlineSoon.map(j => (
            <span key={j.id} className={styles.deadlineItem} onClick={() => navigate(`/jobs/${j.id}`)}>
              {j.company} – {j.title} ({formatDate(j.deadline)})
            </span>
          ))}
        </div>
      )}

      {/* KPI Cards */}
      <div className={styles.statsGrid}>
        <StatCard label="Total Applications" value={totalJobs} icon="📋" color="blue" />
        <StatCard label="Active" value={activeApplications} icon="🔥" color="orange" />
        <StatCard label="Offers" value={offerCount} icon="🎉" color="green" />
        <StatCard label="Response Rate" value={`${responseRate}%`} icon="📈" color="purple" />
      </div>

      {/* Pipeline */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Pipeline</h2>
        <div className={styles.pipeline}>
          {STATUSES.map(s => (
            <div key={s} className={styles.pipelineStage}>
              <div className={styles.pipelineCount}>{statusCounts[s]}</div>
              <div className={styles.pipelineLabel}>{STATUS_LABELS[s]}</div>
            </div>
          ))}
        </div>
      </section>

      <div className={styles.twoCol}>
        {/* Upcoming Events */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Upcoming Events</h2>
          {upcomingEvents.length === 0 ? (
            <p className={styles.empty}>No upcoming events.</p>
          ) : (
            <ul className={styles.eventList}>
              {upcomingEvents.map(ev => (
                <li key={ev.id} className={styles.eventItem} onClick={() => navigate(`/jobs/${ev.jobId}`)}>
                  <span className={styles.eventIcon}>{EVENT_TYPE_ICONS[ev.type] || '📅'}</span>
                  <div className={styles.eventInfo}>
                    <div className={styles.eventTitle}>{ev.title || ev.type}</div>
                    <div className={styles.eventMeta}>{ev.jobCompany} · {formatDate(ev.date)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent Activity */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Recent Activity</h2>
          {recentJobs.length === 0 ? (
            <p className={styles.empty}>No applications yet. <span className={styles.link} onClick={() => navigate('/tracker')}>Add your first job →</span></p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map(job => (
                  <tr key={job.id} className={styles.tableRow} onClick={() => navigate(`/jobs/${job.id}`)}>
                    <td className={styles.company}>{job.company}</td>
                    <td>{job.title}</td>
                    <td><StatusBadge status={job.status} /></td>
                    <td className={styles.date}>{daysAgo(job.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }) {
  return (
    <div className={`${styles.statCard} ${styles[`statCard_${color}`]}`}>
      <div className={styles.statIcon}>{icon}</div>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`${styles.badge} ${styles[`badge_${status}`]}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}
