
import React, { useState, useEffect } from 'react';
import { ai, resumes as resumesApi } from '../api.js';
import styles from './AIPanel.module.css';

const TABS = ['Match Score', 'Tailor Resume', 'Cover Letter', 'Interview Prep', 'Email Draft'];

export default function AIPanel({ jobId, jobCompany }) {
  const [activeTab, setActiveTab] = useState(0);
  const [resumes, setResumes] = useState([]);
  const [selectedResume, setSelectedResume] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [results, setResults] = useState({});
  const [error, setError] = useState('');
  const [downloadNote, setDownloadNote] = useState('');

  useEffect(() => {
    resumesApi.list().then(data => {
      setResumes(data.resumes || []);
      const def = (data.resumes || []).find(r => r.is_default);
      if (def) setSelectedResume(String(def.id));
      else if (data.resumes?.length > 0) setSelectedResume(String(data.resumes[0].id));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!jobId) return;
    ai.getDocuments(jobId).then(data => {
      const docs = data.documents || [];
      const newResults = {};
      docs.forEach(doc => { if (!newResults[doc.type]) newResults[doc.type] = doc.content; });
      setResults(newResults);
    }).catch(() => {});
  }, [jobId]);

  async function previewHtml(type) {
    setPreviewing(true); setError(''); setDownloadNote('');
    try {
      if (type === 'tailored_resume') await ai.previewTailoredResume(jobId, selectedResume);
      setDownloadNote('✓ Preview opened');
      setTimeout(() => setDownloadNote(''), 3000);
    } catch (err) { setError(err.message || 'Preview failed.'); }
    finally { setPreviewing(false); }
  }

  async function downloadDocx(type) {
    setDownloading(true); setDownloadNote('');
    try {
      if (type === 'tailored_resume') await ai.downloadTailoredResume(jobId, selectedResume, jobCompany);
      else if (type === 'cover_letter') await ai.downloadCoverLetter(jobId, jobCompany);
      setDownloadNote('✓ Downloaded');
      setTimeout(() => setDownloadNote(''), 3000);
    } catch (err) { setError(err.message || 'Download failed.'); }
    finally { setDownloading(false); }
  }

  async function runAI(action) {
    const requiresResume = action === 'match_score' || action === 'tailored_resume' || action === 'cover_letter';
    if (requiresResume && !selectedResume) { setError('Please select a resume first.'); return; }
    setLoading(true); setError(''); setDownloadNote('');
    try {
      let result;
      if (action === 'match_score') result = await ai.matchScore(jobId, selectedResume);
      else if (action === 'tailored_resume') result = await ai.tailorResume(jobId, selectedResume);
      else if (action === 'cover_letter') result = await ai.coverLetter(jobId, selectedResume);
      else if (action === 'interview_prep') result = await ai.interviewPrep(jobId, selectedResume);
      else if (action === 'email_draft') result = await ai.emailDraft(jobId, selectedResume);

      // Each endpoint returns { [action]: "text" } — extract the text by key
      const text = result[action] || '';

      if (action === 'tailored_resume' || action === 'cover_letter') {
        setResults(prev => ({ ...prev, [action]: text }));
        setLoading(false);
        await downloadDocx(action);
        return;
      }
      setResults(prev => ({ ...prev, [action]: text }));
    } catch (err) { setError(err.message || 'AI request failed.'); }
    finally { setLoading(false); }
  }

  function copyText(text) { navigator.clipboard.writeText(text).catch(() => {}); }

  const resumeSelector = (
    <div className={styles.resumeSelect}>
      <select value={selectedResume} onChange={e => setSelectedResume(e.target.value)} disabled={loading || downloading}>
        <option value="">Select a resume...</option>
        {resumes.map(r => <option key={r.id} value={String(r.id)}>{r.name}{r.is_default ? ' (default)' : ''}</option>)}
      </select>
    </div>
  );

  const isWorking = loading || downloading || previewing;

  return (
    <div className={styles.panel}>
      <div className={styles.tabs}>
        {TABS.map((tab, i) => (
          <button key={tab} className={`${styles.tab} ${activeTab === i ? styles.tabActive : ''}`}
            onClick={() => { setActiveTab(i); setError(''); setDownloadNote(''); }}>
            {tab}
          </button>
        ))}
      </div>
      <div className={styles.body}>
        {error && <div className={styles.error}>{error}</div>}
        {downloadNote && <div className={styles.downloadNote}>{downloadNote}</div>}
        {activeTab === 0 && <div className={styles.section}>{resumeSelector}<button className={styles.runBtn} onClick={() => runAI('match_score')} disabled={isWorking}>{loading ? 'Analyzing...' : 'Analyze Match'}</button>{results.match_score && <MatchScoreResult data={results.match_score} styles={styles} />}</div>}
        {activeTab === 1 && <div className={styles.section}>{resumeSelector}<button className={styles.runBtn} onClick={() => runAI('tailored_resume')} disabled={isWorking}>{loading ? 'Tailoring...' : downloading ? 'Downloading...' : 'Tailor + Download Resume'}</button><p className={styles.hint}>Generates a job-tailored version and automatically downloads it as a <strong>.docx</strong> file.</p>{results.tailored_resume && <TextResult label="Tailored Resume" text={results.tailored_resume} onCopy={copyText} onDownload={() => downloadDocx('tailored_resume')} onPreview={() => previewHtml('tailored_resume')} downloading={downloading} previewing={previewing} styles={styles} />}</div>}
        {activeTab === 2 && <div className={styles.section}>{resumeSelector}<button className={styles.runBtn} onClick={() => runAI('cover_letter')} disabled={isWorking}>{loading ? 'Writing...' : downloading ? 'Downloading...' : 'Generate + Download Cover Letter'}</button><p className={styles.hint}>Writes a personalized cover letter and automatically downloads it as a <strong>.docx</strong> file.</p>{results.cover_letter && <TextResult label="Cover Letter" text={results.cover_letter} onCopy={copyText} onDownload={() => downloadDocx('cover_letter')} downloading={downloading} styles={styles} />}</div>}
        {activeTab === 3 && <div className={styles.section}>{resumeSelector}<button className={styles.runBtn} onClick={() => runAI('interview_prep')} disabled={isWorking}>{loading ? 'Preparing...' : 'Generate Prep'}</button>{results.interview_prep && <InterviewPrepResult data={results.interview_prep} styles={styles} />}</div>}
        {activeTab === 4 && <div className={styles.section}>{resumeSelector}<button className={styles.runBtn} onClick={() => runAI('email_draft')} disabled={isWorking}>{loading ? 'Drafting...' : 'Generate Email Draft'}</button>{results.email_draft && <TextResult label="Email Draft" text={results.email_draft} onCopy={copyText} styles={styles} />}</div>}
      </div>
    </div>
  );
}

function TextResult({ label, text, onCopy, onDownload, onPreview, downloading, previewing, styles }) {
  return <div className={styles.textResult}><div className={styles.resultHeader}><span className={styles.resultLabel}>{label}</span><div className={styles.resultActions}>{onPreview ? <button className={styles.previewBtn} onClick={onPreview} disabled={previewing || downloading}>{previewing ? 'Generating...' : '⊞ Preview HTML'}</button> : null}{onDownload ? <button className={styles.downloadBtn} onClick={onDownload} disabled={downloading || previewing}>{downloading ? 'Downloading...' : '⤓ Re-download .docx'}</button> : null}<button className={styles.copyBtn} onClick={() => onCopy(text)}>Copy</button></div></div><textarea className={styles.resultTextarea} value={text} readOnly rows={20} /></div>;
}

function MatchScoreResult({ data, styles }) {
  if (typeof data === 'string') {
    return <textarea className={styles.resultTextarea} value={data} readOnly rows={20} />;
  }
  const score = data.score || 0;
  const color = score >= 75 ? 'var(--success)' : score >= 50 ? 'var(--warning)' : 'var(--danger)';
  return <div className={styles.matchResult}><div className={styles.scoreCircle} style={{ '--score-color': color }}><span className={styles.scoreNum}>{score}</span><span className={styles.scoreLabel}>/ 100</span></div>{data.strengths?.length > 0 && <div className={styles.section2}><div className={styles.sectionTitle} style={{ color: 'var(--success)' }}>Strengths</div><ul className={styles.list}>{data.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}{data.gaps?.length > 0 && <div className={styles.section2}><div className={styles.sectionTitle} style={{ color: 'var(--danger)' }}>Gaps</div><ul className={styles.list}>{data.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul></div>}{data.recommendation && <div className={styles.recommendation}><div className={styles.sectionTitle}>Recommendation</div><p>{data.recommendation}</p></div>}</div>;
}

function InterviewPrepResult({ data, styles }) {
  const [openQ, setOpenQ] = useState(null);
  if (typeof data === 'string') {
    return <textarea className={styles.resultTextarea} value={data} readOnly rows={20} />;
  }
  return <div className={styles.prepResult}>{data.questions?.length > 0 && <div className={styles.section2}><div className={styles.sectionTitle}>Likely Questions</div>{data.questions.map((q, i) => <div key={i} className={styles.questionItem}><button className={styles.questionBtn} onClick={() => setOpenQ(openQ === i ? null : i)}><span>{q.question}</span><span className={styles.chevron}>{openQ === i ? '▲' : '▼'}</span></button>{openQ === i && q.answer_framework && <div className={styles.answerFramework}>{q.answer_framework}</div>}</div>)}</div>}{data.topics?.length > 0 && <div className={styles.section2}><div className={styles.sectionTitle}>Key Topics to Study</div><div className={styles.tags}>{data.topics.map((t, i) => <span key={i} className={styles.tag}>{t}</span>)}</div></div>}{data.tips?.length > 0 && <div className={styles.section2}><div className={styles.sectionTitle}>Tips</div><ul className={styles.list}>{data.tips.map((t, i) => <li key={i}>{t}</li>)}</ul></div>}</div>;
}
