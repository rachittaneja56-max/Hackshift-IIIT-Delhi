import { useEffect, useReducer, useState } from 'react';
import { ArtifactSchema, type Artifact, type AttemptDto } from '@trajectoryos/contracts';
import { useApi } from '../app/context';
import { SaveQueue, same } from './save-queue';
import { recoveryArtifact } from '../lib/scenes';
type Recovery = { artifact: Artifact; baseRevision: number; baseArtifact: Artifact };
export function useAttempt(id: string) {
  const { api, userId } = useApi(); const [, render] = useReducer(v => v + 1, 0);
  const [queue, setQueue] = useState<SaveQueue>(); const [error, setError] = useState<Error>(); const [storageError, setStorageError] = useState(''); const [recovery, setRecovery] = useState<Recovery>();
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true; let current: SaveQueue | undefined; let unsubscribe: (() => void) | undefined;
    setQueue(undefined); setError(undefined); setRecovery(undefined);
    const key = `trajectoryos:draft:${userId}:${id}:retry-safe-credit:1`;
    let storageTimer: ReturnType<typeof setTimeout>; let pendingRecovery: { artifact: Artifact; base: AttemptDto } | undefined;
    const persist = (artifact: Artifact, base: AttemptDto) => {
      try { localStorage.setItem(key, JSON.stringify({ artifact, baseRevision: base.revision, baseArtifact: base.artifact })); }
      catch { if (alive) setStorageError('Browser storage is unavailable or full. Keep this tab open; local recovery cannot be guaranteed.'); }
    };
    const write = (artifact: Artifact, base: AttemptDto) => { pendingRecovery = { artifact, base }; clearTimeout(storageTimer); storageTimer = setTimeout(() => { persist(artifact, base); pendingRecovery = undefined; }, 250); };
    api.attempt(id).then(attempt => {
      if (!alive) return;
      current = new SaveQueue(attempt, api, write); unsubscribe = current.subscribe(render);
      if (attempt.status === 'draft') {
        try { const raw = localStorage.getItem(key); if (raw) { const parsed: unknown = JSON.parse(raw); if (parsed && typeof parsed === 'object' && 'artifact' in parsed && 'baseRevision' in parsed && 'baseArtifact' in parsed && typeof parsed.baseRevision === 'number') { const artifact = recoveryArtifact(parsed.artifact); if (!same(artifact, attempt.artifact)) setRecovery({ artifact, baseRevision: parsed.baseRevision, baseArtifact: ArtifactSchema.parse(parsed.baseArtifact) }); } } }
        catch { setStorageError('The saved device copy could not be read. The server draft is intact.'); }
      }
      setQueue(current);
    }, e => { if (alive) setError(e); });
    const unload = (event: BeforeUnloadEvent) => { if (current && !same(current.local, current.server.artifact)) { persist(current.local, current.server); event.preventDefault(); } };
    window.addEventListener('beforeunload', unload);
    return () => { clearTimeout(storageTimer); if (pendingRecovery) persist(pendingRecovery.artifact, pendingRecovery.base); alive = false; unsubscribe?.(); current?.dispose(); window.removeEventListener('beforeunload', unload); };
  }, [api, userId, id, reload]);
  return { queue, error, storageError, recovery, reload: () => setReload(v => v + 1), recover: () => { if (queue && recovery) { queue.restore(recovery.artifact); if (recovery.baseRevision !== queue.server.revision || !same(recovery.baseArtifact, queue.server.artifact)) { queue.conflict = queue.server; queue.conflictBase = recovery.baseArtifact; queue.state = 'Conflict'; queue.notify(); } setRecovery(undefined); } }, discardRecovery: () => { setRecovery(undefined); if (queue) { try { localStorage.removeItem(`trajectoryos:draft:${userId}:${id}:retry-safe-credit:1`); } catch {} } } };
}
