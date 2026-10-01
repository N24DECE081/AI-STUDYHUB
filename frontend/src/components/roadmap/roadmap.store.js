const VERSION = 2;
const prefix = (userId) => `studyhub-roadmap-v${VERSION}:${userId}`;
export const loadRoadmapData = (userId) => {
  try { return JSON.parse(localStorage.getItem(prefix(userId)) || '{"roadmaps":[],"sessions":[]}'); }
  catch { return { roadmaps: [], sessions: [] }; }
};
export const saveRoadmapData = (userId, data) => localStorage.setItem(prefix(userId), JSON.stringify(data));
export const migrateRoadmapStorage = () => {
  try {
    if (localStorage.getItem("studyhub-roadmap-storage-version") === String(VERSION)) return;
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index) || "";
      if (key.startsWith("studyhub-roadmap:") || key.startsWith("studyhub-source-roadmap:")) localStorage.removeItem(key);
    }
    localStorage.setItem("studyhub-roadmap-storage-version", String(VERSION));
  } catch { /* Storage is optional. */ }
};
