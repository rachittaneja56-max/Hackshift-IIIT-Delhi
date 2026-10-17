import { useRef, useState } from 'react';
import { useApi } from '../app/context';
import { useRouter } from '../app/router';
import { ErrorNotice } from '../components/ui';
export function StartAttempt({ label = 'Start a new attempt' }: { label?: string }) {
  const { api, userId } = useApi(); const { navigate } = useRouter(); const key = useRef<string | null>(null); const busyRef = useRef(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<Error>();
  const [storageWarning, setStorageWarning] = useState(false);
  const start = async () => {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); setError(undefined);
    // The key survives an uncertain response AND a route refresh. It is retired only on acknowledgement.
    try { const storageKey = `trajectoryos:create:${userId}`; try { key.current ??= sessionStorage.getItem(storageKey); } catch { setStorageWarning(true); } key.current ??= crypto.randomUUID(); try { sessionStorage.setItem(storageKey, key.current); } catch { setStorageWarning(true); } const attempt = await api.create(key.current); try { sessionStorage.removeItem(storageKey); } catch {} key.current = null; navigate(`/lab/attempts/${attempt.id}`); }
    catch (e) { setError(e instanceof Error ? e : new Error('Attempt creation failed. Retry uses the same request key.')); }
    finally { busyRef.current = false; setBusy(false); }
  };
  return <div><button className="primary" disabled={busy} onClick={() => void start()}>{busy ? 'Opening your attempt…' : error ? 'Retry opening this attempt' : label}<span aria-hidden="true"> ↗</span></button>{storageWarning && <p className="small muted">Session storage is unavailable. Retry in this tab to retain the same creation key; check history before starting again after refresh.</p>}<ErrorNotice error={error} /></div>;
}
