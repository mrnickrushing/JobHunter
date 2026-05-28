import React, { useState, useEffect } from 'react';
import { resumes as resumesApi } from '../api.js';
import styles from './Resumes.module.css';

export default function Resumes() {
  const [list, setList] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editName, setEditName] = useState('');
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadResumes();
  }, []);

  async function loadResumes() {
    try {
      const data = await resumesApi.list();
      setList(data.resumes || []);
    } catch {}
  }

  function selectResume(resume) {
    setSelected(resume);
    setEditName(resume.name);
    setEditContent(resume.content);
    setError('');
    setSaved(false);
    setCreating(false);
  }

  function startNew() {
    setSelected(null);
    setNewName('');
    setEditContent('');
    setCreating(true);
    setError('');
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return setError('Name is required.');
    if (!editContent.trim()) return setError('Resume content is required.');
    setSaving(true);
    setError('');
    try {
      const data = await resumesApi.create({ name: newName.trim(), content: editContent });
      await loadResumes();
      selectResume(data.resume);
      setCreating(false);
    } catch (err) {
      setError(err.message || 'Failed to create resume.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      const data = await resumesApi.update(selected.id, { name: editName, content: editContent });
      setSelected(data.resume);
      setList(prev => prev.map(r => r.id === data.resume.id ? data.resume : r));
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError(err.message || 'Failed to save resume.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSetDefault() {
    if (!selected) return;
    try {
      const data = await resumesApi.setDefault(selected.id);
      setSelected(data.resume);
      await loadResumes();
    } catch (err) {
      setError(err.message || 'Failed to set default.');
    }
  }

  async function handleDelete() {
    if (!selected) return;
    if (!confirm(`Delete "${selected.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await resumesApi.remove(selected.id);
      setSelected(null);
      setCreating(false);
      await loadResumes();
    } catch (err) {
      setError(err.message || 'Failed to delete resume.');
    } finally {
      setDeleting(false);
    }
  }

  const wordCount = editContent.split(/\s+/).filter(Boolean).length;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Resumes</h1>
        <button className={styles.newBtn} onClick={startNew}>+ New Resume</button>
      </div>

      <div className={styles.layout}>
        {/* Left list */}
        <div className={styles.listPanel}>
          {list.length === 0 && !creating && (
            <div className={styles.emptyList}>
              <p>No resumes yet.</p>
              <p>Click "+ New Resume" to add one.</p>
            </div>
          )}
          {list.map(r => (
            <button
              key={r.id}
              className={`${styles.listItem} ${selected?.id === r.id ? styles.listItemActive : ''}`}
              onClick={() => selectResume(r)}
            >
              <div className={styles.listItemName}>{r.name}</div>
              <div className={styles.listItemMeta}>
                {r.is_default ? <span className={styles.defaultBadge}>Default</span> : null}
                <span className={styles.listItemDate}>
                  {new Date(r.updated_at).toLocaleDateString()}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Right editor */}
        <div className={styles.editor}>
          {!selected && !creating && (
            <div className={styles.emptyEditor}>
              <div className={styles.emptyEditorIcon}>📄</div>
              <p>Select a resume to edit or create a new one.</p>
            </div>
          )}

          {(selected || creating) && (
            <>
              {error && <div className={styles.error}>{error}</div>}

              {creating ? (
                <form onSubmit={handleCreate} className={styles.createForm}>
                  <div className={styles.nameRow}>
                    <input
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      placeholder="Resume name (e.g. Software Engineer Resume)"
                      className={styles.nameInput}
                      autoFocus
                    />
                  </div>
                  <div className={styles.editorActions}>
                    <span className={styles.wordCount}>{wordCount} words</span>
                    <button type="button" className={styles.cancelBtn} onClick={() => setCreating(false)}>Cancel</button>
                    <button type="submit" className={styles.saveBtn} disabled={saving}>
                      {saving ? 'Creating...' : 'Create Resume'}
                    </button>
                  </div>
                  <textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    className={styles.contentArea}
                    placeholder="Paste your resume here in plain text..."
                    autoFocus={false}
                  />
                </form>
              ) : (
                <div className={styles.editView}>
                  <div className={styles.nameRow}>
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className={styles.nameInput}
                    />
                    {selected?.is_default ? (
                      <span className={styles.defaultBadge}>Default</span>
                    ) : (
                      <button className={styles.setDefaultBtn} onClick={handleSetDefault}>
                        Set as Default
                      </button>
                    )}
                  </div>
                  <div className={styles.editorActions}>
                    <span className={styles.wordCount}>{wordCount} words</span>
                    {saved && <span className={styles.savedNote}>Saved ✓</span>}
                    <button className={styles.deleteBtn} onClick={handleDelete} disabled={deleting}>
                      {deleting ? 'Deleting...' : 'Delete'}
                    </button>
                    <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                  <textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    className={styles.contentArea}
                    placeholder="Your resume content..."
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
