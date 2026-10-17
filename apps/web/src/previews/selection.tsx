import { useState } from 'react';
import type { AttemptSummary } from '@trajectoryos/contracts';
import { useApi, useResource } from '../app/context';
import { useRouter } from '../app/router';
import { ErrorNotice, shortId } from '../components/ui';

export function useOwnedSelection({ loadSelectedRecord = true }: { loadSelectedRecord?: boolean } = {}) {
  const { api, userId } = useApi();
  const router = useRouter();
  const selected = new URLSearchParams(router.search).get('attempt') ?? '';
  const history = useResource(() => api.history(), `${userId}:preview-history`);
  const [older, setOlder] = useState<AttemptSummary[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error>();
  const next = cursor === undefined ? history.data?.nextCursor : cursor;
  const record = useResource(async () => {
    if (!selected || !loadSelectedRecord) return null;
    const attempt = await api.attempt(selected);
    const evidence = attempt.evidenceId ? await api.evidence(attempt.evidenceId) : null;
    return { attempt, evidence };
  }, `${userId}:preview:${loadSelectedRecord}:${selected}`);
  const items = [...(history.data?.items ?? []), ...older].filter((item, index, all) => all.findIndex(other => other.id === item.id) === index);
  const more = async () => {
    if (!next || busy) return;
    setBusy(true);
    try {
      const page = await api.history(next);
      setOlder(existing => [...existing, ...page.items]);
      setCursor(page.nextCursor);
      setError(undefined);
    } catch (cause) { setError(cause instanceof Error ? cause : new Error('History page failed.')); }
    finally { setBusy(false); }
  };
  return { selected, history, record, items, next, busy, error, more, select: (id: string) => router.navigate(`${router.path}${id ? `?attempt=${encodeURIComponent(id)}` : ''}`) };
}

export function RecordSelector({ state }: { state: ReturnType<typeof useOwnedSelection> }) {
  const statusLabel = (status: AttemptSummary['status']) => status === 'draft' ? 'Draft' : status === 'queued' ? 'Queued' : status === 'running' ? 'Evaluating' : status === 'execution_error' ? 'Execution error' : 'Completed';
  const retry = state.history.error ? state.history.reload : state.more;
  return <section className="record-selector" aria-label="Choose an attempt">
    <label>Choose an attempt you own<select aria-label="Choose an attempt you own" value={state.selected} onChange={event => state.select(event.target.value)}><option value="">Choose an attempt…</option>{state.selected && !state.items.some(item => item.id === state.selected) && <option value={state.selected}>Selected attempt {shortId(state.selected)} · the API will verify access</option>}{state.items.map(item => <option key={item.id} value={item.id}>{shortId(item.id)} · {statusLabel(item.status)} · challenge v{item.challenge.version}</option>)}</select></label>
    {state.next && <button disabled={state.busy} onClick={() => void state.more()}>{state.busy ? 'Loading older attempts…' : 'Load older attempts'}</button>}
    <ErrorNotice error={state.history.error ?? state.error} retry={retry} />
  </section>;
}
