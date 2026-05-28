import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { jobs as jobsApi } from '../api.js';
import KanbanBoard from '../components/KanbanBoard.jsx';
import AddJobModal from '../components/AddJobModal.jsx';
import styles from './Tracker.module.css';

const STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'saved', label: 'Saved' },
  { value: 'applied', label: 'Applied' },
  { value: 'phone_screen', label: 'Phone Screen' },
  { value: 'interview', label: 'Interview' },
  { value: 'offer', label: 'Offer' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

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

export default function Tracker() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState('kanban'); // 'kanban' | 'list'
  const [filterStatus, setFilterStatus] = useState('');
  const [searchText, setSearchText] = useState('');
  const [sortField, setSortField] = useState('updated_at');
  const [sortDir, setSortDir] = useState('desc');
  const [showAddModal, setShowAddModal] = useState(false);

  const loadJobs = useCallback(async () => {
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (searchText) params.search = searchText;
      const data = await jobsApi.list(params);
      setJobs(data.jobs || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, searchText]);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(loadJobs, searchText ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadJobs, searchText]);

  async function handleStatusChange(jobId, newStatus) {
    try {
      const updated = await jobsApi.update(jobId, { status: newStatus });
      setJobs(prev => prev.map(j => j.id === jobId ? updated.job : j));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAddJob(data) {
    const result = await jobsApi.create(data);
    setJobs(prev => [result.job, ...prev]);
  }

  function handleSort(field) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  const sortedJobs = [...jobs].sort((a, b) => {
    let av = a[sortField] || '';
    let bv = b[sortField] || '';
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  function SortIcon({ field }) {
    if (sortField !== field) return <span className={styles.sortIcon}>↕</span>;
    return <span className={styles.sortIcon}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Job Tracker</h1>
          <p className={styles.subtitle}>{jobs.length} job{jobs.length !== 1 ? 's' : ''} tracked</p>
        </div>
        <button className={styles.addBtn} onClick={() => setShowAddModal(true)}>
          + Add Job
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {/* Controls */}
      <div className={styles.controls}>
        <input
          type="text"
          placeholder="Search jobs..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          className={styles.searchInput}
        />
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className={styles.filterSelect}
        >
          {STATUSES.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        <div className={styles.viewToggle}>
          <button
            className={`${styles.viewBtn} ${view === 'kanban' ? styles.viewBtnActive : ''}`}
            onClick={() => setView('kanban')}
            title="Kanban view"
          >
            ⊞ Board
          </button>
          <button
            className={`${styles.viewBtn} ${view === 'list' ? styles.viewBtnActive : ''}`}
            onClick={() => setView('list')}
            title="List view"
          >
            ☰ List
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className={styles.loadingState}>
          <div className="spinner" />
          <span>Loading jobs...</span>
        </div>
      ) : view === 'kanban' ? (
        <KanbanBoard jobs={jobs} onStatusChange={handleStatusChange} />
      ) : (
        /* List view */
        <div className={styles.listContainer}>
          {sortedJobs.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No jobs found.</p>
              <button className={styles.addBtn} onClick={() => setShowAddModal(true)}>
                Add your first job
              </button>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th} onClick={() => handleSort('title')}>
                    Title <SortIcon field="title" />
                  </th>
                  <th className={styles.th} onClick={() => handleSort('company')}>
                    Company <SortIcon field="company" />
                  </th>
                  <th className={styles.th} onClick={() => handleSort('location')}>
                    Location <SortIcon field="location" />
                  </th>
                  <th className={styles.th} onClick={() => handleSort('status')}>
                    Status <SortIcon field="status" />
                  </th>
                  <th className={styles.th} onClick={() => handleSort('updated_at')}>
                    Updated <SortIcon field="updated_at" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedJobs.map(job => (
                  <tr
                    key={job.id}
                    className={styles.tr}
                    onClick={() => navigate(`/jobs/${job.id}`)}
                  >
                    <td className={styles.td}>
                      <span className={styles.jobTitleCell}>{job.title}</span>
                    </td>
                    <td className={styles.td}>{job.company}</td>
                    <td className={styles.td}>
                      <span className={styles.muted}>{job.location || '—'}</span>
                    </td>
                    <td className={styles.td}>
                      <span
                        className={styles.statusBadge}
                        style={{
                          background: `var(--status-${job.status})20`,
                          color: `var(--status-${job.status})`,
                          border: `1px solid var(--status-${job.status})40`,
                        }}
                      >
                        {STATUS_LABELS[job.status] || job.status}
                      </span>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.muted}>{daysAgo(job.updated_at)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showAddModal && (
        <AddJobModal
          onClose={() => setShowAddModal(false)}
          onSave={handleAddJob}
        />
      )}
    </div>
  );
}
