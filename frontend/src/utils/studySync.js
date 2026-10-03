import { postStudy } from '../api';

let userKey = '';
let flushing = null;
const storageKey = (user) => `studyhub-study-outbox:${user}`;
const read = (user) => JSON.parse(localStorage.getItem(storageKey(user)) || '[]');
const write = (user, items) => localStorage.setItem(storageKey(user), JSON.stringify(items));
const status = () => window.dispatchEvent(new Event('studyhub:sync-status'));

export function setStudyUser(key) { userKey = String(key || ''); status(); }
export function studyQueue() { return userKey ? read(userKey) : []; }

export async function flushStudyQueue() {
  if (!userKey || !navigator.onLine) return;
  if (flushing) return flushing;
  const owner = userKey;
  flushing = (async () => {
    while (owner === userKey && navigator.onLine) {
      const item = read(owner).find(entry => !entry.blocked);
      if (!item) break;
      try {
        const result = await postStudy(item.path, item.payload);
        write(owner, read(owner).filter(entry => entry.id !== item.id).map(entry => result.attemptId
          ? { ...entry, path: entry.path.replace(`:attempt:${item.id}`, String(result.attemptId)),
            payload: { ...entry.payload, ...(entry.payload.attemptId === `:attempt:${item.id}` ? { attemptId: result.attemptId } : {}) } } : entry));
        if (owner === userKey) {
          window.dispatchEvent(new CustomEvent('studyhub:mutation-saved', { detail: { ...item, result } }));
          window.dispatchEvent(new Event('studyhub:progress-changed'));
        }
        status();
      } catch (error) {
        const permanent = error.status && error.status < 500 && ![401, 408, 409, 429].includes(error.status);
        write(owner, read(owner).map(entry => entry.id === item.id ? { ...entry, error: error.message, blocked: Boolean(permanent) } : entry));
        status();
        if (!permanent) break;
      }
    }
  })();
  try { await flushing; } finally { flushing = null; }
}

export async function mutateStudy(path, payload) {
  if (!userKey) throw new Error('Bạn cần đăng nhập để lưu hoạt động học.');
  const owner = userKey, id = payload.idempotencyKey || crypto.randomUUID();
  const item = { id, path, payload: { ...payload, occurredAt: new Date().toISOString(), idempotencyKey: id } };
  // Persist before sending: a closed tab or lost response cannot lose the action.
  write(owner, [...read(owner), item]); status();
  let result;
  const received = (event) => { if (event.detail.id === id) result = event.detail.result; };
  window.addEventListener('studyhub:mutation-saved', received);
  try {
    await flushStudyQueue();
    const pending = read(owner).find(entry => entry.id === id);
    if (pending?.blocked) throw new Error(pending.error);
    return result || { pending: true, idempotencyKey: id };
  } finally { window.removeEventListener('studyhub:mutation-saved', received); }
}
