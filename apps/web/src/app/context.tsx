import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@clerk/react';
import { ApiClient } from '../lib/api';
export const ApiContext = createContext<{ api: ApiClient; userId: string } | null>(null);
export function ApiProvider({ children }: { children: ReactNode }) {
  const { getToken, userId } = useAuth(); const [isMock, setMock] = useState(false);
  const api = useMemo(() => new ApiClient(import.meta.env.VITE_API_BASE_URL, fresh => getToken({ skipCache: fresh ?? false }), meta => { if (meta.isMock) setMock(true); }), [getToken, userId]);
  if (!userId) return null;
  return <ApiContext.Provider value={{ api, userId }}>{isMock && <div className="fixture-banner" role="status">Fixture API response · meta.isMock: true · This session includes demonstration data.</div>}{children}</ApiContext.Provider>;
}
export function useApi() { const ctx = useContext(ApiContext); if (!ctx) throw new Error('Authenticated API context missing.'); return ctx; }
export function useResource<T>(load: () => Promise<T>, key: string) {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true });
  const [refresh, setRefresh] = useState(0);
  useEffect(() => { let alive = true; setState({ loading: true }); load().then(data => { if (alive) setState({ data, loading: false }); }, error => { if (alive) setState({ error: error instanceof Error ? error : new Error('Unable to load.'), loading: false }); }); return () => { alive = false; }; }, [key, refresh]);
  return { ...state, reload: () => setRefresh(v => v + 1) };
}
