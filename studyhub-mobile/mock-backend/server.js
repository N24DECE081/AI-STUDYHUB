const cors = require('cors');
const express = require('express');
const { randomUUID } = require('node:crypto');

const app = express();
const port = Number(process.env.PORT || 5000);
const items = new Map();
const sessions = new Map();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body?.email || '').trim();
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const token = randomUUID();
  const user = { id: randomUUID(), email };
  sessions.set(token, user);
  return res.json({ token, user });
});

app.get('/api/items', (_req, res) => res.json(Array.from(items.values())));

app.post('/api/items', (req, res) => {
  const title = String(req.body?.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Title is required' });
  const item = { id: randomUUID(), title, description: String(req.body?.description || '') };
  items.set(item.id, item);
  return res.status(201).json(item);
});

app.get('/api/items/:id', (req, res) => {
  const item = items.get(req.params.id);
  return item ? res.json(item) : res.status(404).json({ error: 'Item not found' });
});

app.put('/api/items/:id', (req, res) => {
  const existing = items.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item not found' });
  const item = {
    ...existing,
    ...(req.body?.title === undefined ? {} : { title: String(req.body.title).trim() }),
    ...(req.body?.description === undefined ? {} : { description: String(req.body.description) }),
  };
  items.set(item.id, item);
  return res.json(item);
});

app.delete('/api/items/:id', (req, res) => {
  if (!items.delete(req.params.id)) return res.status(404).json({ error: 'Item not found' });
  return res.json({ ok: true });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Mock backend on http://0.0.0.0:${port}`);
});
