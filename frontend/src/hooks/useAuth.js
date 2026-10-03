import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentUser } from '../api';

export default function useAuth() {
  const [session, setSession] = useState({ user: null, isLoading: true });
  const revision = useRef(0);
  const setUser = useCallback((user) => {
    revision.current += 1;
    try {
      if (user) localStorage.setItem('studyhub-user', JSON.stringify(user));
      else {
        const cached = localStorage.getItem('studyhub-user');
        localStorage.removeItem('studyhub-user');
        const previous = JSON.parse(cached || 'null');
        const key = previous?.id || previous?.email;
        if (key) {
          localStorage.removeItem(`studyhub-subscription:${key}`);
          localStorage.removeItem(`studyhub-quiz-decks:${key}`);
        }
      }
    } catch { /* The cookie session still works without browser storage. */ }
    setSession({ user, isLoading: false });
  }, []);
  useEffect(() => {
    let active = true;
    const version = revision.current;
    getCurrentUser().then(result => {
      if (active && version === revision.current) setUser(result.user || null);
    }).catch(() => {
      if (active && version === revision.current) setUser(null);
    });
    return () => { active = false; };
  }, [setUser]);
  return { ...session, isAuthenticated: Boolean(session.user), setUser };
}
