const API_URL = import.meta.env.VITE_API_URL || '/api';

export function getToken() {
  return localStorage.getItem('saluddata_token');
}

export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('saluddata_user') || 'null');
  } catch {
    return null;
  }
}

export function saveSession(token, user) {
  localStorage.setItem('saluddata_token', token);
  localStorage.setItem('saluddata_user', JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem('saluddata_token');
  localStorage.removeItem('saluddata_user');
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login' && path !== '/auth/verify-code') {
      clearSession();
    }
    throw new Error(data?.message || data || 'Error de comunicación con el servidor.');
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  upload: (path, file) => {
    const form = new FormData();
    form.append('file', file);
    return request(path, { method: 'POST', body: form });
  },
  async download(path, filename) {
    const token = getToken();
    const response = await fetch(`${API_URL}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error('No se pudo descargar el reporte.');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },
};
