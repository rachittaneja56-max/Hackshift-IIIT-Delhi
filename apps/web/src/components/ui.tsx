import { Component, type ReactNode } from 'react';
import { ApiClientError } from '../lib/api';
import { Link } from '../app/router';
export function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }) { return <span className={`badge ${tone}`}>{children}</span>; }
export function Loading({ label = 'Loading your workspace…' }: { label?: string }) { return <div className="loading" role="status"><span className="loading-mark" />{label}<div className="skeleton" /><div className="skeleton short" /></div>; }
export function ErrorNotice({ error, retry }: { error: Error | null | undefined; retry?: () => void }) {
  if (!error) return null;
  const api = error instanceof ApiClientError ? error : null;
  const hint = api?.status === 401 ? 'Your session needs attention. Use the account menu to sign in again.' : api?.status === 403 ? 'Check the API CORS origin, Clerk authorized parties and the configured Clerk application.' : api?.status === 404 ? 'This record is unavailable or you do not have access.' : api?.status === 413 ? 'Reduce the saved diagram size; your local input is retained.' : api?.status === 429 ? `Capacity reached. Retry after ${api.retryAfter ?? '2'} seconds.` : '';
  return <div className="notice error" role="alert"><strong>{api ? `${api.status || 'Network'} · ${api.code}` : 'Something needs attention'}</strong><p>{error.message}</p>{hint && <p>{hint}</p>}{api?.details && <details><summary>Field details</summary><pre>{JSON.stringify(api.details, null, 2)}</pre></details>}{api?.requestId && <small>Request {api.requestId}</small>}{retry && <button onClick={retry}>Try again</button>}</div>;
}
export function Empty({ title, children }: { title: string; children: ReactNode }) { return <div className="empty"><span className="eyebrow">A place for your work</span><h2>{title}</h2>{children}</div>; }
export function PageTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) { return <div className="page-title"><span className="eyebrow">{eyebrow}</span><h1 tabIndex={-1}>{title}</h1>{children}</div>; }
export function PreviewNotice({ children }: { children?: ReactNode }) { return <div className="notice preview"><Badge>Local preview</Badge><span>{children ?? 'Fictional demonstration material. Preparing context sends nothing.'}</span></div>; }
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  override state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  override render() { return this.state.error ? <main id="main-content" tabIndex={-1} className="page"><h1>Workspace could not render</h1><p>Your device recovery copy is retained. Reload to reconnect.</p><button onClick={() => location.reload()}>Reload workspace</button><Link href="/learn">Return to learning</Link></main> : this.props.children; }
}
export const date = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
export const shortId = (id: string) => id.slice(0, 8);
