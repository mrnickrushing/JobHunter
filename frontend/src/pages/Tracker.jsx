import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { jobs as jobsApi, ai as aiApi, resumes as resumesApi } from '../api.js';
import KanbanBoard from '../components/KanbanBoard.jsx';
import AddJobModal from '../components/AddJobModal.jsx';
import styles from './Tracker.module.css';

const STATUS_LABELS = {
  saved: 'Saved', applied: 'Applied', phone_screen: 'Phone Screen',
  interview: 'Interview', offer: 'Offer', rejected: 'Rejected', withdrawn: 'Withdrawn',
};
const STATUS_ORDER = ['saved', 'applied', 'phone_screen', 'interview', 'offer', 'rejected', 'withdrawn'];
const ALL_STATUSES = ['', ...STATUS_ORDER];

function daysAgo(dateStr) {
  if (!dateStr) return '—';
  const d = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return '1d ago';
  return `${d}d ago`;
}

function deadlineLabel(dateStr) {
  if (!dateStr) return null;
  const days = Math.ceil((new Date(dateStr).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  if (days < 0) return { label: 'Overdue', color: 'var(--danger)' };
  if (days === 0) return { label: 'Today', color: 'var(--danger)' };
  if (days === 1) return { label: '1d left', color: 'var(--warning)' };
  if (days <= 7) return { label: `${days}d left`, color: 'var(--warning)' };
  return { label: new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), color: 'var(--text-muted)' };
}

export default function Tracker() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState('kanban');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('updated_at');
  const [sortDir, setSortDir] = useState('desc');
  const [showModal, setShowModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkQueue, setBulkQueue] = useState(null);
  const [defaultResumeId, setDefaultResumeId] = useState(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const searchRef = useRef(null);

  useEffect(() => {
    if (searchParams.get('add') === '1') setShowModal(true);
  }, [searchParams]);

  useEffect(() => {
    loadJobs();
    resumesApi.list().then(data => {
      const def = (data.resumes || []).find(r => r.is_default);
      if (def) setDefaultResumeId(def.id);
    }).catch(() => {});
  }, []);

  function loadJobs() {
    setLoading(true);
    jobsApi.list()
      .then(data => setJobs(data.jobs || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setShowModal(true); }
      if (e.key === 'k' || e.key === 'K') { e.preventDefault(); setView('kanban'); }
      if (e.key === 'l' || e.key === 'L') { e.preventDefault(); setView('list'); }
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filtered = useMemo(() => {
    let list = jobs;
    if (statusFilter) list = list.filter(j => j.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(j =>
        j.title.toLowerCase().includes(q) ||
        j.company.toLowerCase().includes(q) ||
        (j.location || '').toLowerCase().includes(q)
      );
    }
    list = [...list].sort((a, b) => {
      let va = a[sortBy] || '', vb = b[sortBy] || '';
      if (sortBy === 'salary_min') { va = Number(va); vb = Number(vb); }
      const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [jobs, statusFilter, search, sortBy, sortDir]);

  function toggleSort(col) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  }

  async function handleStatusChange(jobId, newStatus) {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j));
    try {
      await jobsApi.update(jobId, { status: newStatus });
    } catch {
      loadJobs();
    }
  }

  async function handleSave(data) {
    const result = await jobsApi.create(data);
    setJobs(prev => [result.job, ...prev]);
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(j => j.id)));
  }

  async function startBulkTailor() {
    const toProcess = filtered.filter(j => selectedIds.has(j.id));
    if (!toProcess.length) return;
    setBulkQueue({ jobs: toProcess, current: 0, done: [], errors: [], running: true });
  }

  const bulkTailorRef = useRef(null);
  bulkTailorRef.current = bulkQueue;

  useEffect(() => {
    if (!bulkQueue || !bulkQueue.running) return;
    if (bulkQueue.current >= bulkQueue.jobs.length) {
      setBulkQueue(prev => ({ ...prev, running: false }));
      return;
    }

    const job = bulkQueue.jobs[bulkQueue.current];
    aiApi.tailorResume(job.id, defaultResumeId)
      .then(() => {
        setBulkQueue(prev => prev ? {
          ...prev, current: prev.current + 1,
          done: [...prev.done, { id: job.id, title: job.title, company: job.company }],
        } : null);
      })
      .catch(err => {
        setBulkQueue(prev => prev ? {
          ...prev, current: prev.current + 1,
          errors: [...prev.errors, { id: job.id, title: job.title, company: job.company, error: err.message }],
        } : null);
      });
  }, [bulkQueue?.current, bulkQueue?.running]);

  const sortIcon = col => sortBy === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Job Tracker</h1>
          <p className={styles.subtitle}>
            {jobs.length} job{jobs.length !== 1 ? 's' : ''} tracked
            {selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {selectedIds.size > 0 && (
            <button
              className={styles.addBtn}
              style={{ background: 'var(--info)', fontSize: '13px' }}
              onClick={startBulkTailor}
            >
              Bulk Tailor ({selectedIds.size})
            </button>
          )}
          <button
            className={styles.addBtn}
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)', fontSize: '13px' }}
            onClick={() => jobsApi.exportCsv().catch(e => setError(e.message))}
          >
            Export CSV
          </button>
          <button className={styles.addBtn} onClick={() => setShowModal(true)}>
            + Add Job <span style={{ opacity: 0.5, fontSize: '11px', marginLeft: '4px' }}>N</span>
          </button>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {/* Controls */}
      <div className={styles.controls}>
        <input
          ref={searchRef}
          className={styles.searchInput}
          placeholder="Search jobs... (/)"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          {STATUS_ORDER.map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <div className={styles.viewToggle}>
          <button
            className={`${styles.viewBtn} ${view === 'kanban' ? styles.viewBtnActive : ''}`}
            onClick={() => setView('kanban')}
          >
            Kanban <span style={{ opacity: 0.4, fontSize: '11px' }}>K</span>
          </button>
          <button
            className={`${styles.viewBtn} ${view === 'list' ? styles.viewBtnActive : ''}`}
            onClick={() => setView('list')}
          >
            List <span style={{ opacity: 0.4, fontSize: '11px' }}>L</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className={styles.loadingState}><span className="spinner" /> Loading jobs...</div>
      ) : view === 'kanban' ? (
        <KanbanBoard jobs={filtered} onStatusChange={handleStatusChange} />
      ) : (
        <div className={styles.listContainer}>
          {filtered.length === 0 ? (
            <div className={styles.emptyState}>
              No jobs found.
              {!search && !statusFilter && (
                <button className={styles.addBtn} style={{ marginTop: '8px' }} onClick={() => setShowModal(true)}>
                  Add your first job
                </button>
              )}
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th} style={{ width: '36px' }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filtered.length && filtered.length > 0}
                      onChange={selectAll}
                      style={{ width: 'auto', cursor: 'pointer' }}
                    />
                  </th>
                  <th className={styles.th} onClick={() => toggleSort('title')}>
                    Title<span className={styles.sortIcon}>{sortIcon('title')}</span>
                  </th>
                  <th className={styles.th} onClick={() => toggleSort('company')}>
                    Company<span className={styles.sortIcon}>{sortIcon('company')}</span>
                  </th>
                  <th className={styles.th} onClick={() => toggleSort('status')}>
                    Status<span className={styles.sortIcon}>{sortIcon('status')}</span>
                  </th>
                  <th className={styles.th} onClick={() => toggleSort('deadline')}>
                    Deadline<span className={styles.sortIcon}>{sortIcon('deadline')}</span>
                  </th>
                  <th className={styles.th} onClick={() => toggleSort('updated_at')}>
                    Updated<span className={styles.sortIcon}>{sortIcon('updated_at')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(job => {
                  const dl = deadlineLabel(job.deadline);
                  return (
                    <tr
                      key={job.id}
                      className={styles.tr}
                      onClick={e => { if (e.target.type !== 'checkbox') navigate(`/jobs/${job.id}`); }}
                    >
                      <td className={styles.td} onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(job.id)}
                          onChange={() => toggleSelect(job.id)}
                          style={{ width: 'auto', cursor: 'pointer' }}
                        />
                      </td>
                      <td className={`${styles.td} ${styles.jobTitleCell}`}>{job.title}</td>
                      <td className={`${styles.td} ${styles.muted}`}>{job.company}</td>
                      <td className={styles.td}>
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
                      </td>
                      <td className={styles.td}>
                        {dl ? (
                          <span style={{ color: dl.color, fontSize: '13px' }}>{dl.label}</span>
                        ) : (
                          <span className={styles.muted}>—</span>
                        )}
                      </td>
                      <td className={`${styles.td} ${styles.muted}`}>{daysAgo(job.updated_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Keyboard shortcut hint */}
      {!loading && (
        <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'right' }}>
          Shortcuts: <kbd style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '3px', padding: '1px 5px' }}>N</kbd> new job &nbsp;
          <kbd style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '3px', padding: '1px 5px' }}>K</kbd> kanban &nbsp;
          <kbd style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '3px', padding: '1px 5px' }}>L</kbd> list &nbsp;
          <kbd style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '3px', padding: '1px 5px' }}>/</kbd> search
        </div>
      )}

      {/* Add Job Modal */}
      {showModal && (
        <AddJobModal
          onClose={() => setShowModal(false)}
          onSave={handleSave}
        />
      )}

      {/* Bulk Tailor Overlay */}
      {bulkQueue && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: '14px', padding: '32px', minWidth: '380px', maxWidth: '480px',
          }}>
            <h2 style={{ marginBottom: '16px', fontSize: '18px' }}>Bulk Tailoring Queue</h2>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <span>{bulkQueue.current} / {bulkQueue.jobs.length} processed</span>
                {bulkQueue.running && <span style={{ color: 'var(--accent)' }}>Running...</span>}
                {!bulkQueue.running && <span style={{ color: 'var(--success)' }}>Complete</span>}
              </div>
              <div style={{ background: 'var(--bg-tertiary)', borderRadius: '6px', height: '8px', overflow: 'hidden' }}>
                <div style={{
                  background: 'var(--accent)',
                  height: '100%',
                  width: `${(bulkQueue.current / bulkQueue.jobs.length) * 100}%`,
                  transition: 'width 0.3s ease',
                  borderRadius: '6px',
                }} />
              </div>
            </div>

            {bulkQueue.running && bulkQueue.current < bulkQueue.jobs.length && (
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Tailoring: <strong>{bulkQueue.jobs[bulkQueue.current]?.title}</strong> at {bulkQueue.jobs[bulkQueue.current]?.company}
              </div>
            )}

            {bulkQueue.done.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '12px', color: 'var(--success)', marginBottom: '6px', fontWeight: 600 }}>
                  Completed ({bulkQueue.done.length})
                </div>
                {bulkQueue.done.map(j => (
                  <div key={j.id} style={{ fontSize: '13px', padding: '4px 0', color: 'var(--text-secondary)' }}>
                    ✓ {j.title} at {j.company}
                  </div>
                ))}
              </div>
            )}

            {bulkQueue.errors.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '12px', color: 'var(--danger)', marginBottom: '6px', fontWeight: 600 }}>
                  Errors ({bulkQueue.errors.length})
                </div>
                {bulkQueue.errors.map(j => (
                  <div key={j.id} style={{ fontSize: '13px', padding: '4px 0', color: 'var(--danger)' }}>
                    ✗ {j.title}: {j.error}
                  </div>
                ))}
              </div>
            )}

            {!bulkQueue.running && (
              <button
                onClick={() => { setBulkQueue(null); setSelectedIds(new Set()); }}
                style={{
                  width: '100%', padding: '10px', background: 'var(--accent)',
                  color: 'white', border: 'none', borderRadius: '8px',
                  fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                Done
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
