import { useEffect, useState } from 'react';
import { getProgressSummary, getProgressTimeline, getTodayTasks } from '../api';

export default function useProgressData(userKey, range) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true, revision = 0;
    const refresh = async () => {
      const request = ++revision;
      try {
        const [summary, timeline, tasks] = await Promise.all([getProgressSummary(), getProgressTimeline(range), getTodayTasks()]);
        if (active && request === revision) { setData({ summary, points: timeline.points, tasks, owner: userKey, range }); setError(''); }
      } catch (failure) { if (active && request === revision) setError(failure.message); }
    };
    void refresh();
    window.addEventListener('studyhub:progress-changed', refresh);
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('studyhub:progress-changed', refresh); window.removeEventListener('focus', refresh); };
  }, [userKey, range, retry]);
  return { data: data?.owner === userKey && data.range === range ? data : null, error, retry: () => setRetry(n => n + 1) };
}
