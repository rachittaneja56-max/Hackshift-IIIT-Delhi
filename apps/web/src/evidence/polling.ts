import { useEffect, useRef, useState } from 'react';
// Sequential requests, paused in hidden tabs. Visibility restoration fetches immediately.
export function usePolling<T>(load: () => Promise<T>, key: string, pending: (data: T) => boolean) {
  const [data, setData] = useState<T>(); const [error, setError] = useState<Error>(); const [refresh, setRefresh] = useState(0); const loadRef = useRef(load); const pendingRef = useRef(pending); loadRef.current = load; pendingRef.current = pending;
  useEffect(() => {
    let alive = true, busy = false, terminal = false; let timer: ReturnType<typeof setTimeout>;
    const run = async () => { if (!alive || busy || document.hidden || terminal) return; busy = true; clearTimeout(timer); try { const next = await loadRef.current(); if (!alive) return; setData(next); setError(undefined); terminal = !pendingRef.current(next); } catch (e) { if (alive) { setError(e instanceof Error ? e : new Error('Status refresh failed.')); terminal = true; } } finally { busy = false; if (alive && !terminal) timer = setTimeout(() => void run(), 1200); } };
    const visible = () => { if (!document.hidden && !terminal) { clearTimeout(timer); void run(); } };
    void run(); document.addEventListener('visibilitychange', visible);
    return () => { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
  }, [key, refresh]);
  return { data, error, reload: () => { setError(undefined); setRefresh(v => v + 1); }, update: (value: T) => { setData(value); setError(undefined); setRefresh(v => v + 1); } };
}
