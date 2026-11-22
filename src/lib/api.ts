export const API_BASE = '';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('aether_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// Concurrency queue to eliminate 429 burst errors
const MAX_CONCURRENT = 3;
let activeRequests = 0;
const queue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT) {
    activeRequests++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    queue.push(() => {
      activeRequests++;
      resolve();
    });
  });
}

function releaseSlot(): void {
  activeRequests--;
  if (queue.length > 0 && activeRequests < MAX_CONCURRENT) {
    const next = queue.shift();
    if (next) {
      setTimeout(next, 60); // 60ms stagger to prevent Cloud Run QPS burst
    }
  }
}

export async function apiRequest<T = any>(
  endpoint: string, 
  options: RequestInit = {},
  retries = 5
): Promise<T> {
  await acquireSlot();

  try {
    const headers = {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
      ...options.headers
    };

    let attempt = 0;
    while (true) {
      try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
          ...options,
          headers
        });

        // Automatic retry for status 429 (Too Many Requests) with exponential backoff & jitter
        if (response.status === 429 && attempt < retries) {
          attempt++;
          // Exponential backoff: 500ms, 1000ms, 2000ms, 4000ms, 8000ms + random jitter
          const backoff = 500 * Math.pow(2, attempt) + Math.random() * 300;
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }

        const data = await response.json().catch(() => ({}));

        if (response.status === 429 && attempt < retries) {
          attempt++;
          const backoff = 500 * Math.pow(2, attempt) + Math.random() * 300;
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }

        if (!response.ok) {
          throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
        }

        return data;
      } catch (err: any) {
        if ((err.message?.includes('429') || err.message?.includes('Too Many Requests')) && attempt < retries) {
          attempt++;
          const backoff = 500 * Math.pow(2, attempt) + Math.random() * 300;
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        throw err;
      }
    }
  } finally {
    releaseSlot();
  }
}

export const authStorage = {
  getToken: () => localStorage.getItem('aether_token'),
  setToken: (token: string) => localStorage.setItem('aether_token', token),
  clearToken: () => {
    localStorage.removeItem('aether_token');
    localStorage.removeItem('aether_user');
  },
  getUser: () => {
    const raw = localStorage.getItem('aether_user');
    return raw ? JSON.parse(raw) : null;
  },
  setUser: (user: any) => localStorage.setItem('aether_user', JSON.stringify(user))
};
