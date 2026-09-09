// Normaliza la URL base para asegurar que siempre termine en /api
const rawBase = import.meta.env.VITE_API_URL || '';
const cleanBase = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase;
const API_URL = cleanBase ? (cleanBase.endsWith('/api') ? cleanBase : `${cleanBase}/api`) : '/api';

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

  // Asegura que el path empiece con / y no lleve /api repetido
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const finalPath = cleanPath.startsWith('/api/') ? cleanPath.replace('/api', '') : cleanPath;

  const response = await fetch(`${API_URL}${finalPath}`, { ...options, headers });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    if (response.status === 401 && !finalPath.includes('/auth/login') && !finalPath.includes('/auth/verify-code')) {
      clearSession();
    }
    // FastAPI devuelve los errores en .detail (o .message si es personalizado)
    const errorMessage = typeof data === 'object' 
      ? (data.detail || data.message || JSON.stringify(data)) 
      : data;
      
    throw new Error(errorMessage || 'Error de comunicación con el servidor.');
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
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const finalPath = cleanPath.startsWith('/api/') ? cleanPath.replace('/api', '') : cleanPath;
    
    const response = await fetch(`${API_URL}${finalPath}`, {
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
