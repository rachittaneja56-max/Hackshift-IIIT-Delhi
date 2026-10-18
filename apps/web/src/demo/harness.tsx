import { createRoot } from 'react-dom/client';
import { AppRoutes, Header } from '../app/App';
import { RouteContext, Router, useRouter } from '../app/router';
import '../styles.css';

// Development harness only. No authentication or API requests. Exercise actual
// AppRoutes, including sample links; the real private tool needs a signed-in app.
function Harness() {
  const route = useRouter();
  const path = route.path === '/src/demo/harness.html' ? new URLSearchParams(route.search).get('screen') === 'opportunities' ? '/opportunities' : '/demo/journey' : route.path;
  const allowed = path === '/opportunities' || path === '/demo/journey';
  return <RouteContext.Provider value={{ ...route, path }}><Header account={false} />{allowed ? <AppRoutes /> : <main><h1>Open your signed-in workspace to use private tools.</h1><a href="/src/demo/harness.html?screen=opportunities">Return to the sample opportunities</a></main>}</RouteContext.Provider>;
}
createRoot(document.getElementById('demo-root')!).render(<Router><Harness /></Router>);
