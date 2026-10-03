import { useEffect, useState } from 'react';
import { flushStudyQueue, setStudyUser, studyQueue } from '../utils/studySync';

export default function useStudySync(userKey) {
  const [state, setState] = useState({ owner: '', pending: [] });
  useEffect(() => {
    setStudyUser(userKey);
    const failed = (error) => setState({ owner: userKey, pending: [{ error: error.message, blocked: true }] });
    const refresh = () => { try { setState({ owner: userKey, pending: studyQueue() }); } catch (error) { failed(error); } };
    const retry = () => { void flushStudyQueue().catch(failed); };
    window.addEventListener('studyhub:sync-status', refresh);
    window.addEventListener('online', retry);
    const timer = window.setInterval(retry, 10000);
    const initial = window.setTimeout(() => { refresh(); retry(); }, 0);
    return () => {
      window.clearInterval(timer); window.clearTimeout(initial);
      window.removeEventListener('studyhub:sync-status', refresh); window.removeEventListener('online', retry);
      setStudyUser('');
    };
  }, [userKey]);
  return { pending: userKey && state.owner === userKey ? state.pending : [], retry: flushStudyQueue };
}
