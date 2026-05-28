import React, { useState } from 'react';
import JobCard from './JobCard.jsx';
import styles from './KanbanBoard.module.css';

const COLUMNS = [
  { status: 'saved', label: 'Saved' },
  { status: 'applied', label: 'Applied' },
  { status: 'phone_screen', label: 'Phone Screen' },
  { status: 'interview', label: 'Interview' },
  { status: 'offer', label: 'Offer' },
  { status: 'rejected', label: 'Rejected' },
  { status: 'withdrawn', label: 'Withdrawn' },
];

export default function KanbanBoard({ jobs, onStatusChange }) {
  const [dragOverCol, setDragOverCol] = useState(null);

  const jobsByStatus = COLUMNS.reduce((acc, col) => {
    acc[col.status] = jobs.filter(j => j.status === col.status);
    return acc;
  }, {});

  function handleDragOver(e, status) {
    e.preventDefault();
    setDragOverCol(status);
  }

  function handleDrop(e, newStatus) {
    e.preventDefault();
    setDragOverCol(null);
    const jobId = parseInt(e.dataTransfer.getData('jobId'), 10);
    if (!jobId) return;
    const job = jobs.find(j => j.id === jobId);
    if (job && job.status !== newStatus) {
      onStatusChange(jobId, newStatus);
    }
  }

  return (
    <div className={styles.board}>
      {COLUMNS.map(col => (
        <div
          key={col.status}
          className={`${styles.column} ${dragOverCol === col.status ? styles.dragOver : ''}`}
          onDragOver={(e) => handleDragOver(e, col.status)}
          onDragLeave={() => setDragOverCol(null)}
          onDrop={(e) => handleDrop(e, col.status)}
        >
          <div className={styles.colHeader}>
            <span
              className={styles.colDot}
              style={{ background: `var(--status-${col.status})` }}
            />
            <span className={styles.colLabel}>{col.label}</span>
            <span className={styles.colCount}>{jobsByStatus[col.status].length}</span>
          </div>
          <div className={styles.cards}>
            {jobsByStatus[col.status].length === 0 ? (
              <div className={styles.emptyCol}>Drop here</div>
            ) : (
              jobsByStatus[col.status].map(job => (
                <JobCard key={job.id} job={job} />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
