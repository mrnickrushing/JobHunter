const BASE_URL = import.meta.env.VITE_API_URL || '';

const MAX_RESUME_SIZE = 5 * 1024 * 1024; // 5MB

function getToken() {
  return localStorage.getItem('jobhunter_token');
}

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = `Request failed: ${res.status}`;
    try {
      const json = JSON.parse(text);
      message = json.error || json.message || message;
    } catch {}
    throw new Error(message);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return res.text();
}

async function downloadFile(path, filename) {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || 'Download failed');
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
  return true;
}

export const auth = {
  login: (email, password) =>
    request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (name, email, password) =>
    request('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) }),
  me: () => request('/api/auth/me'),
};

export const jobs = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/jobs${qs ? `?${qs}` : ''}`);
  },
  get: (id) => request(`/api/jobs/${id}`),
  create: (data) => request('/api/jobs', { method: 'POST', body: JSON.stringify(data) }),
  exportCsv: () => downloadFile('/api/jobs/export', 'jobs-export.csv'),
  update: (id, data) => request(`/api/jobs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/api/jobs/${id}`, { method: 'DELETE' }),
  addEvent: (id, data) => request(`/api/jobs/${id}/events`, { method: 'POST', body: JSON.stringify(data) }),
  updateEvent: (id, eventId, data) =>
    request(`/api/jobs/${id}/events/${eventId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEvent: (id, eventId) =>
    request(`/api/jobs/${id}/events/${eventId}`, { method: 'DELETE' }),
  addNote: (id, data) => request(`/api/jobs/${id}/notes`, { method: 'POST', body: JSON.stringify(data) }),
  updateNote: (id, noteId, data) =>
    request(`/api/jobs/${id}/notes/${noteId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteNote: (id, noteId) =>
    request(`/api/jobs/${id}/notes/${noteId}`, { method: 'DELETE' }),
};

export const resumes = {
  list: () => request('/api/resumes'),
  upload: async (file, name, isDefault = false) => {
    if (file.size > MAX_RESUME_SIZE) {
      throw new Error(`File too large. Maximum size is ${MAX_RESUME_SIZE / 1024 / 1024}MB.`);
    }
    const token = getToken();
    const formData = new FormData();
    formData.append('resume', file);
    formData.append('name', name);
    formData.append('is_default', isDefault);
    const res = await fetch(`${BASE_URL}/api/resumes`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let message = `Upload failed: ${res.status}`;
      try { const json = JSON.parse(text); message = json.error || json.message || message; } catch {}
      throw new Error(message);
    }
    return res.json();
  },
  setDefault: (id) => request(`/api/resumes/${id}/default`, { method: 'PUT' }),
  delete: (id) => request(`/api/resumes/${id}`, { method: 'DELETE' }),
  download: (id, filename) => downloadFile(`/api/resumes/${id}/download`, filename),
};

export const ai = {
  importJobFromUrl: (url) =>
    request('/api/ai/import-job', { method: 'POST', body: JSON.stringify({ url }) }),
  importLinkedInProfile: (profileUrl) =>
    request('/api/ai/import-linkedin-profile', { method: 'POST', body: JSON.stringify({ profile_url: profileUrl }) }),
  emailDraft: (jobId, resumeId) =>
    request(`/api/ai/${jobId}/email-draft`, { method: 'POST', body: JSON.stringify({ resume_id: resumeId }) }),
  matchScore: (jobId, resumeId) =>
    request(`/api/ai/${jobId}/match-score`, { method: 'POST', body: JSON.stringify({ resume_id: resumeId }) }),
  tailorResume: (jobId, resumeId) =>
    request(`/api/ai/${jobId}/tailor-resume`, { method: 'POST', body: JSON.stringify({ resume_id: resumeId }) }),
  coverLetter: (jobId, resumeId) =>
    request(`/api/ai/${jobId}/cover-letter`, { method: 'POST', body: JSON.stringify({ resume_id: resumeId }) }),
  interviewPrep: (jobId, resumeId) =>
    request(`/api/ai/${jobId}/interview-prep`, { method: 'POST', body: JSON.stringify({ resume_id: resumeId }) }),
  getDocuments: (jobId) => request(`/api/ai/${jobId}/documents`),
  downloadTailoredResume: (jobId, resumeId, company) =>
    downloadFile(`/api/ai/${jobId}/tailor-resume/download?resume_id=${resumeId}`, `${company || 'tailored'}-resume.docx`),
  downloadCoverLetter: (jobId, company) =>
    downloadFile(`/api/ai/${jobId}/cover-letter/download`, `${company || 'cover'}-letter.docx`),
};

export function validateResumeFile(file) {
  if (!file) return 'No file selected.';
  const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  if (!allowed.includes(file.type)) return 'Only PDF and DOCX files are accepted.';
  if (file.size > MAX_RESUME_SIZE) return `File too large. Maximum size is ${MAX_RESUME_SIZE / 1024 / 1024}MB.`;
  return null;
}

export const search = {
  search: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/search${qs ? `?${qs}` : ''}`);
  },
};
