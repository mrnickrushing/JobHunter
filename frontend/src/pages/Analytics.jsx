
import React, { useEffect, useMemo, useState } from 'react';
import { jobs as jobsApi } from '../api.js';
import styles from './Analytics.module.css';

const LABELS = {
  saved: 'Saved', applied: 'Applied', phone_screen: 'Phone Screen', interview: 'Interview',
  offer: 'Offer', rejected: 'Rejected', withdrawn: 'Withdrawn'
};

export default function Analytics() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    jobsApi.list().then(data => setJobs(data.jobs || [])).catch(err => setError(err.message)).finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const byStatus = Object.keys(LABELS).reduce((acc, key) => ({ ...acc, [key]: 0 }), {});
    let withSalary = 0, totalMid = 0;
    jobs.forEach(job => {
      byStatus[job.status] = (byStatus[job.status] || 0) + 1;
      if (job.salary_min || job.salary_max) {
        const lo = Number(job.salary_min || 0);
        const hi = Number(job.salary_max || lo);
        totalMid += hi && lo ? (lo + hi) / 2 : (hi || lo || 0);
        withSalary += 1;
      }
    });
    return { byStatus, avgSalary: withSalary ? Math.round(totalMid / withSalary) : 0 };
  }, [jobs]);

  if (loading) return <div className={styles.page}><div className={styles.card}>Loading analytics...</div></div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Analytics</h1>
        <p className={styles.subtitle}>A quick look at your pipeline, response rate, and salary data.</p>
      </div>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.grid}>
        <section className={styles.card}>
          <h2>Status Breakdown</h2>
          <div className={styles.list}>
            {Object.entries(stats.byStatus).map(([key, val]) => (
              <div key={key} className={styles.row}><span>{LABELS[key]}</span><strong>{val}</strong></div>
            ))}
          </div>
        </section>
        <section className={styles.card}>
          <h2>Pipeline Health</h2>
          <div className={styles.kpis}>
            <div><span>Total jobs</span><strong>{jobs.length}</strong></div>
            <div><span>Offers</span><strong>{stats.byStatus.offer || 0}</strong></div>
            <div><span>Interviews</span><strong>{stats.byStatus.interview || 0}</strong></div>
            <div><span>Avg salary</span><strong>{stats.avgSalary ? `$${stats.avgSalary.toLocaleString()}` : '—'}</strong></div>
          </div>
        </section>
      </div>
    </div>
  );
}
