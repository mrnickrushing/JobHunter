const BASE_URL = import.meta.env.VITE_API_URL || '';

function getToken() {
  return localStorage.getItem('jt_token');
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    localStorage.removeItem('jt_token');
    window.location.href = '/login';
    throw new Error('Session expired. Please log in again.');
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data;
}

// Auth API
export const auth = {
  login: (email, password) =>
    request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (name, email, password) =>
    request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),

  me: () => request('/api/auth/me'),
};

// Jobs API
export const jobs = {
  list: (params = {}) => {
    const query = new URLSearchParams();
    if (params.status) query.append('status', params.status);
    if (params.search) query.append('search', params.search);
    const qs = query.toString();
    return request(`/api/jobs${qs ? '?' + qs : ''}`);
  },

  get: (id) => request(`/api/jobs/${id}`),

  create: (data) =>
    request('/api/jobs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id, data) =>
    request(`/api/jobs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  remove: (id) =>
    request(`/api/jobs/${id}`, { method: 'DELETE' }),

  addContact: (jobId, data) =>
    request(`/api/jobs/${jobId}/contacts`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateContact: (jobId, contactId, data) =>
    request(`/api/jobs/${jobId}/contacts/${contactId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  removeContact: (jobId, contactId) =>
    request(`/api/jobs/${jobId}/contacts/${contactId}`, { method: 'DELETE' }),

  addEvent: (jobId, data) =>
    request(`/api/jobs/${jobId}/events`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateEvent: (jobId, eventId, data) =>
    request(`/api/jobs/${jobId}/events/${eventId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  removeEvent: (jobId, eventId) =>
    request(`/api/jobs/${jobId}/events/${eventId}`, { method: 'DELETE' }),
};

// Resumes API
export const resumes = {
  list: () => request('/api/resumes'),

  get: (id) => request(`/api/resumes/${id}`),

  create: (data) =>
    request('/api/resumes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id, data) =>
    request(`/api/resumes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  remove: (id) =>
    request(`/api/resumes/${id}`, { method: 'DELETE' }),

  setDefault: (id) =>
    request(`/api/resumes/${id}/default`, { method: 'PUT' }),
};

// AI API
export const ai = {
  tailorResume: (jobId, resumeId) =>
    request('/api/ai/tailor-resume', {
      method: 'POST',
      body: JSON.stringify({ jobId, resumeId }),
    }),

  coverLetter: (jobId, resumeId) =>
    request('/api/ai/cover-letter', {
      method: 'POST',
      body: JSON.stringify({ jobId, resumeId }),
    }),

  matchScore: (jobId, resumeId) =>
    request('/api/ai/match-score', {
      method: 'POST',
      body: JSON.stringify({ jobId, resumeId }),
    }),

  interviewPrep: (jobId, resumeId) =>
    request('/api/ai/interview-prep', {
      method: 'POST',
      body: JSON.stringify({ jobId, resumeId }),
    }),

  getDocuments: (jobId) => request(`/api/ai/documents/${jobId}`),
};

// Search API
export const search = {
  search: (params) => {
    const query = new URLSearchParams();
    if (params.q) query.append('q', params.q);
    if (params.location) query.append('location', params.location);
    if (params.page) query.append('page', params.page);
    if (params.results_per_page) query.append('results_per_page', params.results_per_page);
    return request(`/api/search?${query.toString()}`);
  },
};
