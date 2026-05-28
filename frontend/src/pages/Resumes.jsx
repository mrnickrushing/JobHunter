import React, { useState, useEffect, useRef } from 'react';
import { resumes as resumesApi, validateResumeFile } from '../api.js';
import styles from './Resumes.module.css';

export default function Resumes() {
  const [list, setList] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reuploading, setReuploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [reuploadFile, setReuploadFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [reuploadDragOver, setReuploadDragOver] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef(null);
  const reuploadInputRef = useRef(null);

  useEffect(() => { loadResumes(); }, []);

  async function loadResumes() {
    try {
      const data = await resumesApi.list();
      setList(data.resumes || []);
    } catch {}
  }

  function selectResume(resume) {
    setSelected(resume);
    setEditName(resume.name);
    setError('');
    setSaved(false);
    setCreating(false);
    setReuploadFile(null);
  }

  function startNew() {
    setSelected(null);
    setNewName('');
    setUploadFile(null);
    setCreating(true);
    setError('');
  }

  // ── File selection helpers ──────────────────────────────────────────────

  function handleFileSelect(file, isReupload = false) {
    const err = validateResumeFile(file);
    if (err) { setError(err); return; }
    setError('');
    if (isReupload) {
      setReuploadFile(file);
    } else {
      setUploadFile(file);
      if (!newName.trim()) setNewName(file.name.replace(/\.(pdf|docx)$/i, ''));
    }
  }

  function handleFileDrop(e, isReupload = false) {
    e.preventDefault();
    isReupload ? setReuploadDragOver(false) : setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file, isReupload);
  }

  // ── Create ──────────────────────────────────────────────────────────────

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return setError('Resume name is required.');
    if (!uploadFile) return setError('Please select a PDF or DOCX file to upload.');
    setSaving(true);
    setError('');
    try {
      const data = await resumesApi.create({ name: newName.trim(), file: uploadFile });
      await loadResumes();
      selectResume(data.resume);
      setCreating(false);
      setUploadFile(null);
    } catch (err) {
      setError(err.message || 'Failed to upload resume.');
    } finally {
      setSaving(false);
    }
  }

  // ── Save name ───────────────────────────────────────────────────────────

  async function handleSaveName() {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      const data = await resumesApi.update(selected.id, { name: editName });
      setSelected(data.resume);
      setList(prev => prev.map(r => r.id === data.resume.id ? data.resume : r));
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError(err.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  // ── Re-upload (replace file) ────────────────────────────────────────────

  async function handleReupload() {
    if (!selected || !reuploadFile) return;
    setReuploading(true);
    setError('');
    try {
      const data = await resumesApi.reupload({ id: selected.id, file: reuploadFile });
      setSelected(data.resume);
      setList(prev => prev.map(r => r.id === data.resume.id ? data.resume : r));
      setReuploadFile(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message || 'Failed to replace resume file.');
    } finally {
      setReuploading(false);
    }
  }

  // ── Set default ─────────────────────────────────────────────────────────

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

  // ── Delete ──────────────────────────────────────────────────────────────

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

  const fileLabel = (type) => type === 'application/pdf' ? 'PDF' : 'DOCX';
  const wordCount = selected?.content ? selected.content.split(/\s+/).filter(Boolean).length : 0;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Resumes</h1>
        <button className={styles.newBtn} onClick={startNew}>+ Upload Resume</button>
      </div>

      <div className={styles.layout}>
        {/* ── Left list ── */}
        <div className={styles.listPanel}>
          {list.length === 0 && !creating && (
            <div className={styles.emptyList}>
              <p>No resumes yet.</p>
              <p>Click "+ Upload Resume" to add one.</p>
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
                {r.file_type && <span className={styles.fileTypeBadge}>{fileLabel(r.file_type)}</span>}
                <span className={styles.listItemDate}>
                  {new Date(r.updated_at).toLocaleDateString()}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* ── Right panel ── */}
        <div className={styles.editor}>
          {!selected && !creating && (
            <div className={styles.emptyEditor}>
              <div className={styles.emptyEditorIcon}>📄</div>
              <p>Select a resume or upload a new one.</p>
            </div>
          )}

          {(selected || creating) && (
            <>
              {error && <div className={styles.error}>{error}</div>}

              {/* ── Create form ── */}
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

                  <div
                    className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ''} ${uploadFile ? styles.dropZoneHasFile : ''}`}
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => handleFileDrop(e, false)}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      style={{ display: 'none' }}
                      onChange={e => e.target.files[0] && handleFileSelect(e.target.files[0], false)}
                    />
                    {uploadFile ? (
                      <>
                        <div className={styles.dropZoneFileIcon}>✅</div>
                        <div className={styles.dropZoneFileName}>{uploadFile.name}</div>
                        <div className={styles.dropZoneFileSub}>
                          {(uploadFile.size / 1024).toFixed(0)} KB &mdash; click to change
                        </div>
                      </>
                    ) : (
                      <>
                        <div className={styles.dropZoneIcon}>📂</div>
                        <div className={styles.dropZoneText}>Drag &amp; drop or click to upload</div>
                        <div className={styles.dropZoneSub}>PDF or DOCX &mdash; max 5 MB</div>
                      </>
                    )}
                  </div>

                  <div className={styles.editorActions}>
                    <button type="button" className={styles.cancelBtn} onClick={() => setCreating(false)}>Cancel</button>
                    <button type="submit" className={styles.saveBtn} disabled={saving || !uploadFile}>
                      {saving ? 'Uploading...' : 'Upload Resume'}
                    </button>
                  </div>
                </form>

              ) : (
                /* ── Edit / view existing ── */
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
                    <span className={styles.wordCount}>{wordCount} words extracted</span>
                    {selected?.file_type && <span className={styles.fileTypeBadge}>{fileLabel(selected.file_type)}</span>}
                    {selected?.original_name && (
                      <span className={styles.origName} title={selected.original_name}>
                        {selected.original_name}
                      </span>
                    )}
                    {saved && <span className={styles.savedNote}>Saved ✓</span>}
                    <button className={styles.deleteBtn} onClick={handleDelete} disabled={deleting}>
                      {deleting ? 'Deleting...' : 'Delete'}
                    </button>
                    <button className={styles.saveBtn} onClick={handleSaveName} disabled={saving}>
                      {saving ? 'Saving...' : 'Save Name'}
                    </button>
                  </div>

                  {/* ── Re-upload zone ── */}
                  <div className={styles.reuploadSection}>
                    <div className={styles.reuploadLabel}>Replace File</div>
                    <div
                      className={`${styles.dropZone} ${styles.dropZoneSmall} ${reuploadDragOver ? styles.dropZoneActive : ''} ${reuploadFile ? styles.dropZoneHasFile : ''}`}
                      onDragOver={e => { e.preventDefault(); setReuploadDragOver(true); }}
                      onDragLeave={() => setReuploadDragOver(false)}
                      onDrop={e => handleFileDrop(e, true)}
                      onClick={() => reuploadInputRef.current?.click()}
                    >
                      <input
                        ref={reuploadInputRef}
                        type="file"
                        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        style={{ display: 'none' }}
                        onChange={e => e.target.files[0] && handleFileSelect(e.target.files[0], true)}
                      />
                      {reuploadFile ? (
                        <>
                          <div className={styles.dropZoneFileIcon}>✅</div>
                          <div className={styles.dropZoneFileName}>{reuploadFile.name}</div>
                          <div className={styles.dropZoneFileSub}>
                            {(reuploadFile.size / 1024).toFixed(0)} KB &mdash; click to change
                          </div>
                        </>
                      ) : (
                        <>
                          <div className={styles.dropZoneIcon}>🔄</div>
                          <div className={styles.dropZoneText}>Drop a new PDF or DOCX to replace</div>
                          <div className={styles.dropZoneSub}>max 5 MB &mdash; re-extracts text automatically</div>
                        </>
                      )}
                    </div>
                    {reuploadFile && (
                      <div className={styles.reuploadActions}>
                        <button
                          className={styles.cancelBtn}
                          onClick={() => { setReuploadFile(null); setError(''); }}
                        >
                          Cancel
                        </button>
                        <button
                          className={styles.saveBtn}
                          onClick={handleReupload}
                          disabled={reuploading}
                        >
                          {reuploading ? 'Replacing...' : 'Replace File'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* ── Extracted text preview ── */}
                  <div className={styles.contentPreview}>
                    <div className={styles.contentPreviewLabel}>Extracted Text Preview</div>
                    <pre className={styles.contentPre}>{selected?.content}</pre>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
