import React from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './JobCard.module.css';

const STATUS_LABELS = {
  saved: 'Saved',
  applied: 'Applied',
  phone_screen: 'Phone Screen',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

function daysAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

export default function JobCard({ job, onDragStart }) {
  const navigate = useNavigate();

  return (
    <div
      className={styles.card}
      style={{ '--status-color': `var(--status-${job.status})` }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('jobId', String(job.id));
        if (onDragStart) onDragStart(job);
      }}
      onClick={() => navigate(`/jobs/${job.id}`)}
    >
      <div className={styles.statusBar} />
      <div className={styles.body}>
        <div className={styles.title}>{job.title}</div>
        <div className={styles.company}>{job.company}</div>
        {job.location && (
          <div className={styles.location}>{job.location}</div>
        )}
        <div className={styles.footer}>
          <span className={styles.badge} style={{ '--c': `var(--status-${job.status})` }}>
            {STATUS_LABELS[job.status] || job.status}
          </span>
          <span className={styles.date}>{daysAgo(job.updated_at)}</span>
        </div>
      </div>
    </div>
  );
}
