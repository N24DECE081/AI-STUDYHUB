import { useCallback, useEffect, useMemo, useState } from "react";
import { loadRoadmapData, migrateRoadmapStorage, saveRoadmapData } from "./roadmap.store";

export function useStudySessions(userId) {
  const [data, setData] = useState(() => { migrateRoadmapStorage(); return loadRoadmapData(userId); });
  useEffect(() => { if (userId) saveRoadmapData(userId, data); }, [data, userId]);
  const addSession = useCallback((session) => setData((current) => ({ ...current, sessions: [...current.sessions, { ...session, id: session.id || crypto.randomUUID(), userId }] })), [userId]);
  const updateSession = useCallback((session) => setData((current) => ({ ...current, sessions: current.sessions.map((item) => item.id === session.id ? { ...item, ...session } : item) })), []);
  const deleteSession = useCallback((id) => setData((current) => ({ ...current, sessions: current.sessions.filter((item) => item.id !== id) })), []);
  return useMemo(() => ({ data, setData, addSession, updateSession, deleteSession }), [data, addSession, updateSession, deleteSession]);
}
