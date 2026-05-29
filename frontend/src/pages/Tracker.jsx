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
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    function handleKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowAddModal(true);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  async function handleSaveJob(jobData) {
    try {
      await jobsApi.create(jobData);
      setShowAddModal(false);
      loadJobs();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleStatusChange(jobId, newStatus) {
    try {
      await jobsApi.update(jobId, { status: newStatus });
      loadJobs();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleExportCsv() {
    try {
      await jobsApi.exportCsv();
    } catch (err) {
      setError(err.message);
    }
  }

  const sortedJobs = [...jobs].sort((a, b) => {
    let aVal = a[sortField] || '';
    let bVal = b[sortField] || '';
    if (sortDir === 'asc') return aVal > bVal ? 1 : -1;
    return aVal < bVal ? 1 : -1;
  });

  function toggleSort(field) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  function SortIcon({ field }) {
    if (sortField !== field) return <span className={styles.sortIcon}>↕</span>;
    return <span className={styles.sortIcon}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  if (loading) return <div className={styles.page}><div className={styles.loadingCard}>Loading jobs...</div></div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Job Tracker</h1>
        <div className={styles.headerActions}>
          <button className={styles.exportBtn} onClick={handleExportCsv} title="Export to CSV">
            ⬇ Export CSV
          </button>
          <button className={styles.addBtn} onClick={() => setShowAddModal(true)}>
            + Add Job <kbd className={styles.kbd}>⌘K</kbd>
          </button>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.controls}>
        <input
          className={styles.search}
          type="text"
          placeholder="Search jobs..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
        />
        <select
          className={styles.filter}
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          {STATUSES.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <div className={styles.viewToggle}>
          <button
            className={`${styles.viewBtn} ${view === 'kanban' ? styles.viewBtnActive : ''}`}
            onClick={() => setView('kanban')}
          >
            Kanban
          </button>
          <button
            className={`${styles.viewBtn} ${view === 'list' ? styles.viewBtnActive : ''}`}
            onClick={() => setView('list')}
          >
            List
          </button>
        </div>
      </div>

      {view === 'kanban' ? (
        <KanbanBoard jobs={sortedJobs} onStatusChange={handleStatusChange} onJobClick={id => navigate(`/jobs/${id}`)} />
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th onClick={() => toggleSort('company')} className={styles.sortable}>
                  Company <SortIcon field="company" />
                </th>
                <th onClick={() => toggleSort('title')} className={styles.sortable}>
                  Role <SortIcon field="title" />
                </th>
                <th onClick={() => toggleSort('status')} className={styles.sortable}>
                  Status <SortIcon field="status" />
                </th>
                <th onClick={() => toggleSort('updated_at')} className={styles.sortable}>
                  Updated <SortIcon field="updated_at" />
                </th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {sortedJobs.length === 0 ? (
                <tr><td colSpan={5} className={styles.empty}>No jobs found.</td></tr>
              ) : (
                sortedJobs.map(job => (
                  <tr key={job.id} className={styles.tableRow} onClick={() => navigate(`/jobs/${job.id}`)}>
                    <td className={styles.company}>{job.company}</td>
                    <td>{job.title}</td>
                    <td>
                      <span className={`${styles.badge} ${styles[`badge_${job.status}`]}`}>
                        {STATUS_LABELS[job.status] || job.status}
                      </span>
                    </td>
                    <td className={styles.date}>{daysAgo(job.updated_at)}</td>
                    <td>{job.location || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <AddJobModal onClose={() => setShowAddModal(false)} onSave={handleSaveJob} />
      )}
    </div>
  );
}
