import React, { useState, useEffect } from 'react';
import { ai, resumes as resumesApi } from '../api.js';
import styles from './AIPanel.module.css';

const TABS = ['Match Score', 'Tailor Resume', 'Cover Letter', 'Interview Prep'];

export default function AIPanel({ jobId }) {
  const [activeTab, setActiveTab] = useState(0);
  const [resumes, setResumes] = useState([]);
  const [selectedResume, setSelectedResume] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState({});
  const [error, setError] = useState('');

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
      docs.forEach(doc => {
        if (!newResults[doc.type]) {
          newResults[doc.type] = doc.content;
        }
      });
      setResults(newResults);
    }).catch(() => {});
  }, [jobId]);

  async function runAI(action) {
    if (!selectedResume) {
      setError('Please select a resume first.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      let result;
      if (action === 'match_score') result = await ai.matchScore(jobId, selectedResume);
      else if (action === 'tailored_resume') result = await ai.tailorResume(jobId, selectedResume);
      else if (action === 'cover_letter') result = await ai.coverLetter(jobId, selectedResume);
      else if (action === 'interview_prep') result = await ai.interviewPrep(jobId, selectedResume);

      if (action === 'tailored_resume' || action === 'cover_letter') {
        setResults(prev => ({ ...prev, [action]: result.content }));
      } else {
        setResults(prev => ({ ...prev, [action]: result }));
      }
    } catch (err) {
      setError(err.message || 'AI request failed.');
    } finally {
      setLoading(false);
    }
  }

  function copyText(text) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  const resumeSelector = (
    <div className={styles.resumeSelect}>
      <select
        value={selectedResume}
        onChange={e => setSelectedResume(e.target.value)}
        disabled={loading}
      >
        <option value="">Select a resume...</option>
        {resumes.map(r => (
          <option key={r.id} value={String(r.id)}>
            {r.name}{r.is_default ? ' (default)' : ''}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className={styles.panel}>
      <div className={styles.tabs}>
        {TABS.map((tab, i) => (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === i ? styles.tabActive : ''}`}
            onClick={() => { setActiveTab(i); setError(''); }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className={styles.body}>
        {error && <div className={styles.error}>{error}</div>}

        {activeTab === 0 && (
          <div className={styles.section}>
            {resumeSelector}
            <button
              className={styles.runBtn}
              onClick={() => runAI('match_score')}
              disabled={loading}
            >
              {loading ? <span className="spinner" /> : null}
              {loading ? 'Analyzing...' : 'Analyze Match'}
            </button>
            {results.match_score && (
              <MatchScoreResult data={results.match_score} />
            )}
          </div>
        )}

        {activeTab === 1 && (
          <div className={styles.section}>
            {resumeSelector}
            <button
              className={styles.runBtn}
              onClick={() => runAI('tailored_resume')}
              disabled={loading}
            >
              {loading ? <span className="spinner" /> : null}
              {loading ? 'Tailoring...' : 'Tailor Resume'}
            </button>
            {results.tailored_resume && (
              <div className={styles.textResult}>
                <div className={styles.resultHeader}>
                  <span className={styles.resultLabel}>Tailored Resume</span>
                  <button className={styles.copyBtn} onClick={() => copyText(results.tailored_resume)}>Copy</button>
                </div>
                <textarea
                  className={styles.resultTextarea}
                  value={results.tailored_resume}
                  readOnly
                  rows={20}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 2 && (
          <div className={styles.section}>
            {resumeSelector}
            <button
              className={styles.runBtn}
              onClick={() => runAI('cover_letter')}
              disabled={loading}
            >
              {loading ? <span className="spinner" /> : null}
              {loading ? 'Writing...' : 'Generate Cover Letter'}
            </button>
            {results.cover_letter && (
              <div className={styles.textResult}>
                <div className={styles.resultHeader}>
                  <span className={styles.resultLabel}>Cover Letter</span>
                  <button className={styles.copyBtn} onClick={() => copyText(results.cover_letter)}>Copy</button>
                </div>
                <textarea
                  className={styles.resultTextarea}
                  value={results.cover_letter}
                  readOnly
                  rows={20}
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 3 && (
          <div className={styles.section}>
            {resumeSelector}
            <button
              className={styles.runBtn}
              onClick={() => runAI('interview_prep')}
              disabled={loading}
            >
              {loading ? <span className="spinner" /> : null}
              {loading ? 'Preparing...' : 'Generate Prep'}
            </button>
            {results.interview_prep && (
              <InterviewPrepResult data={results.interview_prep} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MatchScoreResult({ data }) {
  const score = data.score || 0;
  const color = score >= 75 ? 'var(--success)' : score >= 50 ? 'var(--warning)' : 'var(--danger)';
  return (
    <div className={styles.matchResult}>
      <div className={styles.scoreCircle} style={{ '--score-color': color }}>
        <span className={styles.scoreNum}>{score}</span>
        <span className={styles.scoreLabel}>/ 100</span>
      </div>
      {data.strengths?.length > 0 && (
        <div className={styles.section2}>
          <div className={styles.sectionTitle} style={{ color: 'var(--success)' }}>Strengths</div>
          <ul className={styles.list}>
            {data.strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}
      {data.gaps?.length > 0 && (
        <div className={styles.section2}>
          <div className={styles.sectionTitle} style={{ color: 'var(--danger)' }}>Gaps</div>
          <ul className={styles.list}>
            {data.gaps.map((g, i) => <li key={i}>{g}</li>)}
          </ul>
        </div>
      )}
      {data.recommendation && (
        <div className={styles.recommendation}>
          <div className={styles.sectionTitle}>Recommendation</div>
          <p>{data.recommendation}</p>
        </div>
      )}
    </div>
  );
}

function InterviewPrepResult({ data }) {
  const [openQ, setOpenQ] = useState(null);
  return (
    <div className={styles.prepResult}>
      {data.questions?.length > 0 && (
        <div className={styles.section2}>
          <div className={styles.sectionTitle}>Likely Questions</div>
          {data.questions.map((q, i) => (
            <div key={i} className={styles.questionItem}>
              <button
                className={styles.questionBtn}
                onClick={() => setOpenQ(openQ === i ? null : i)}
              >
                <span>{q.question}</span>
                <span className={styles.chevron}>{openQ === i ? '▲' : '▼'}</span>
              </button>
              {openQ === i && q.answer_framework && (
                <div className={styles.answerFramework}>{q.answer_framework}</div>
              )}
            </div>
          ))}
        </div>
      )}
      {data.topics?.length > 0 && (
        <div className={styles.section2}>
          <div className={styles.sectionTitle}>Key Topics to Study</div>
          <div className={styles.tags}>
            {data.topics.map((t, i) => (
              <span key={i} className={styles.tag}>{t}</span>
            ))}
          </div>
        </div>
      )}
      {data.tips?.length > 0 && (
        <div className={styles.section2}>
          <div className={styles.sectionTitle}>Tips</div>
          <ul className={styles.list}>
            {data.tips.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
