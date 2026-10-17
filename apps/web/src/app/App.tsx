import { useEffect, useState } from 'react';
import { ClerkProvider, ClerkLoaded, ClerkLoading, ClerkFailed, ClerkDegraded, SignIn, UserButton, useAuth } from '@clerk/react';
import { apiOrigin } from '../lib/api';
import { ApiProvider } from './context';
import { Link, Router, useRouter } from './router';
import { ErrorBoundary, Loading } from '../components/ui';
import { LearnHome, LessonReader } from '../learning/pages';
import { LabLanding, AttemptWorkspace } from '../attempts/workspace';
import { HistoryPage, EvidencePage } from '../evidence/pages';
import { MentorPreview, CareerPreview } from '../previews/pages';
function SystemAppearance() {
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { let preference = 'system'; try { preference = localStorage.getItem('trajectoryos:theme') ?? 'system'; } catch {} document.documentElement.dataset.theme = preference === 'dark' || (preference === 'system' && media.matches) ? 'dark' : 'light'; };
    apply(); media.addEventListener('change', apply); window.addEventListener('storage', apply);
    return () => { media.removeEventListener('change', apply); window.removeEventListener('storage', apply); };
  }, []);
  return null;
}
export function ThemeButton() {
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('trajectoryos:theme') ?? 'system'; } catch { return 'system'; } });
  useEffect(() => { const media = matchMedia('(prefers-color-scheme: dark)'); const apply = () => document.documentElement.dataset.theme = theme === 'system' ? media.matches ? 'dark' : 'light' : theme; apply(); media.addEventListener('change', apply); try { localStorage.setItem('trajectoryos:theme', theme); } catch {} return () => media.removeEventListener('change', apply); }, [theme]);
  return <button className="theme-button" aria-label={`Appearance: ${theme}. Change appearance`} title={`Appearance: ${theme}`} onClick={() => setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system')}>{theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◐'}</button>;
}
export function Header({ account = true }: { account?: boolean }) {
  const { path, search } = useRouter(); const selected = new URLSearchParams(search).get('attempt') ?? path.match(/\/(?:lab|evidence)\/attempts\/([^/]+)/)?.[1]; const ctx = selected ? `?attempt=${encodeURIComponent(selected)}` : '';
  if (/\/design\/(hld|lld)$/.test(path)) return null;
  return <header className="site-header"><Link className="brand" href="/learn"><span className="brand-mark" aria-hidden="true">t<span>↗</span></span>Trajectory<span className="brand-os">Os</span></Link><nav aria-label="Main navigation">{[['/learn', 'Learn'], ['/lab', 'Engineering Lab'], ['/evidence', 'My Evidence']].map(([href, label]) => <Link key={href} href={href} aria-current={path.startsWith(href) ? 'page' : undefined}>{label}</Link>)}</nav><nav className="preview-nav" aria-label="Product previews"><Link href={`/mentors/preview${ctx}`} aria-current={path.startsWith('/mentors') ? 'page' : undefined}>Mentors <small>Preview</small></Link><Link href={`/career/preview${ctx}`} aria-current={path.startsWith('/career') ? 'page' : undefined}>Career <small>Preview</small></Link></nav><div className="account"><ThemeButton />{account && <UserButton />}</div></header>;
}
export function AppRoutes() {
  const { path } = useRouter(); const attemptMatch = path.match(/^\/lab\/attempts\/([^/]+)(?:\/design\/(hld|lld))?$/); const evidenceMatch = path.match(/^\/evidence\/attempts\/([^/]+)$/); const lessonMatch = path.match(/^\/learn\/([^/]+)\/(\d+)$/);
  if (attemptMatch) return <AttemptWorkspace key={attemptMatch[1]} id={attemptMatch[1]} scene={attemptMatch[2] as 'hld' | 'lld' | undefined} />;
  if (evidenceMatch) return <EvidencePage key={evidenceMatch[1]} id={evidenceMatch[1]} />;
  if (lessonMatch) return <LessonReader slug={lessonMatch[1]} version={Number(lessonMatch[2])} />;
  if (path === '/lab') return <LabLanding />;
  if (path === '/evidence') return <HistoryPage />;
  if (path === '/mentors/preview') return <MentorPreview />;
  if (path === '/career/preview') return <CareerPreview />;
  if (path === '/learn' || path === '/') return <LearnHome />;
  return <main id="main-content" tabIndex={-1} className="page"><h1>That page is unavailable.</h1><Link href="/learn">Return to learning →</Link></main>;
}
function AuthenticatedApp() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  if (!isLoaded) return <><Header account={false} /><main id="main-content" tabIndex={-1} className="page"><Loading label="Initializing your secure session…" /></main></>;
  if (!isSignedIn) return <><Header account={false} /><main id="main-content" tabIndex={-1} className="auth-page"><div><span className="eyebrow">A workspace for engineering judgment</span><h1>Your next step<br />starts with a question.</h1><p>Learn the failure. Draw the boundary.<br />Investigate the code. Explain the evidence.</p><p className="muted">Sign in to keep your attempts, diagrams and evidence together.</p></div><SignIn routing="hash" /></main></>;
  return <ApiProvider key={userId}><Header /><AppRoutes /></ApiProvider>;
}
function ClerkStatus() {
  return <><ClerkLoading><Header account={false} /><main id="main-content" tabIndex={-1} className="page"><Loading label="Initializing your secure session…" /></main></ClerkLoading><ClerkFailed><Header account={false} /><main id="main-content" tabIndex={-1} className="page"><h1>Authentication could not initialize.</h1><p>Check your connection and the Clerk publishable configuration, then reload. Your device recovery copies are retained.</p><button onClick={() => location.reload()}>Reload sign-in</button></main></ClerkFailed><ClerkDegraded><div className="notice warning">The authentication service is degraded. Requests may need a retry.</div></ClerkDegraded><ClerkLoaded><AuthenticatedApp /></ClerkLoaded></>;
}
function Setup() {
  return <><Header account={false} /><main id="main-content" tabIndex={-1} className="page setup"><span className="eyebrow">Frontend configuration</span><h1>Connect your engineering workspace.</h1><p>Clerk and the API need public frontend configuration before the application can sign in or load your work.</p><pre>{`# apps/web/.env.local\nVITE_API_BASE_URL=http://127.0.0.1:3000\nVITE_CLERK_PUBLISHABLE_KEY=<your Clerk publishable key>`}</pre><p>Use <code>http://127.0.0.1:5173</code> consistently in Clerk authorized origins and the backend CORS configuration. Restart Vite after updating configuration.</p><p className="muted">Only the public publishable key belongs here. Provider keys, the Clerk secret and the database URL stay on the server.</p></main></>;
}
export default function App() {
  let configured = false;
  try { apiOrigin(import.meta.env.VITE_API_BASE_URL ?? ''); configured = /^pk_(test|live)_/.test(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? ''); } catch {}
  return <ErrorBoundary><Router><SystemAppearance /><a href="#main-content" className="skip-link">Skip to workspace</a>{configured ? <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}><ClerkStatus /></ClerkProvider> : <Setup />}</Router></ErrorBoundary>;
}
