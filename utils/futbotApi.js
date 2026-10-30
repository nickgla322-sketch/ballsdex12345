const BASE_URL = (process.env.FUTBOT_API_URL || '').replace(/\/+$/, '');
const API_KEY = process.env.FUTBOT_API_KEY || '';

async function request(endpoint, options = {}) {
  if (!BASE_URL) {
    throw new Error('FUTBOT_API_URL is not configured.');
  }

  if (!API_KEY) {
    throw new Error('FUTBOT_API_KEY is not configured.');
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      ...(options.headers || {}),
    },
  });

  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = body && typeof body === 'object'
      ? body.error || body.message
      : body;

    throw new Error(message || `FutBot API returned HTTP ${response.status}.`);
  }

  return body;
}

async function getStatus() {
  return request('/api/v1/status', { method: 'GET' });
}

module.exports = {
  request,
  getStatus,
};
