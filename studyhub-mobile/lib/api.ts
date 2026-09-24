// Replace this placeholder with your computer's LAN IPv4 from `ipconfig`.
// Keep the API bound to 0.0.0.0 so a physical device on the same Wi-Fi can reach it.
export const API_BASE_URL = 'http://192.168.1.100:5000';

type ApiOptions = Omit<RequestInit, 'body'> & { body?: unknown };

export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status})`);
  return payload as T;
}

export function login(email: string, password: string) {
  return apiRequest<{ token: string; user: { email: string } }>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export type Item = { id: string; title: string; description: string };
export const itemsApi = {
  list: () => apiRequest<Item[]>('/api/items'),
  create: (item: Omit<Item, 'id'>) => apiRequest<Item>('/api/items', { method: 'POST', body: item }),
  update: (id: string, item: Partial<Omit<Item, 'id'>>) => apiRequest<Item>(`/api/items/${id}`, { method: 'PUT', body: item }),
  remove: (id: string) => apiRequest<{ ok: true }>(`/api/items/${id}`, { method: 'DELETE' }),
};
