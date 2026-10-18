import { lazy, Suspense } from 'react';
import { Router, useRouter } from '../app/router';
import { ErrorBoundary } from '../components/ui';
import { LandingPage } from './LandingPage';

const PrivateApp = lazy(() => import('../app/App'));

export function EntryRoutes() {
  const { path } = useRouter();
  if (path === '/') return <><a href="#main-content" className="skip-link">Skip to content</a><LandingPage /></>;
  return <Suspense fallback={<main id="main-content" tabIndex={-1} className="page"><p>Opening your secure workspace…</p></main>}><PrivateApp /></Suspense>;
}

export default function LandingEntry() {
  return <ErrorBoundary><Router><EntryRoutes /></Router></ErrorBoundary>;
}
