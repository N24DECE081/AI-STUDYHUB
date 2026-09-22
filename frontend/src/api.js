const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

async function readError(response) {
  const text = await response.text();
  try { return JSON.parse(text).error || text; } catch { return text || `HTTP ${response.status}`; }
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, { credentials: 'include', ...options });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export const login = (email, password) => request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
export const register = (name, email, password) => request('/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password }) });
export const logout = () => request('/auth/logout', { method: 'POST' });
export const getDocuments = () => request('/documents');

export async function uploadDocument({ file, title, description, subjectCode }) {
  const subjects = await request('/subjects');
  const subject = subjects.find((item) => item.code === subjectCode) || subjects[0];
  if (!subject) throw new Error('Backend chưa có môn học để gắn tài liệu.');
  const body = new FormData();
  body.append('file', file);
  body.append('title', title);
  body.append('description', description || '');
  body.append('subject_id', subject.id);
  const response = await fetch(`${apiBase}/upload`, { method: 'POST', credentials: 'include', body });
  if (!response.ok) throw new Error(await readError(response));
  const result = await response.json();
  return request(`/documents/${result.document_id}`);
}

export const askTutor = ({ documentId, question }) => request('/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document_id: documentId, question }) });
export const askAiTutor = ({ conversationId, message, mode, fileIds = [] }) => request('/ai-tutor/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversation_id: conversationId, message, mode, file_ids: fileIds }) });
export const getSubscription = () => request('/subscription');
export const checkoutSubscription = ({ plan, billingCycle, paymentMethod }) => request('/subscription/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan, billing_cycle: billingCycle, payment_method: paymentMethod }) });
export const cancelSubscription = () => request('/subscription/cancel', { method: 'POST' });
