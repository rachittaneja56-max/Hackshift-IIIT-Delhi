import { createContext, useContext, useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react';
type Location = { path: string; search: string; navigate: (path: string) => void };
export const RouteContext = createContext<Location>({ path: '/', search: '', navigate: () => {} });
export function useRouter() { return useContext(RouteContext); }
export function Router({ children }: { children: React.ReactNode }) {
  const currentUrl = () => location.pathname + location.search + location.hash;
  const [url, setUrl] = useState(currentUrl);
  useEffect(() => { const fn = () => setUrl(currentUrl()); window.addEventListener('popstate', fn); return () => window.removeEventListener('popstate', fn); }, []);
  const navigate = (path: string) => { try { sessionStorage.setItem(`scroll:${url}`, String(window.scrollY)); } catch {} history.pushState(null, '', path); setUrl(currentUrl()); };
  useEffect(() => {
    let position = 0; try { position = Number(sessionStorage.getItem(`scroll:${url}`)) || 0; } catch {}
    const parsed = new URL(url, location.origin); let observer: MutationObserver | undefined;
    const focus = () => document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
    if (parsed.hash) { const scroll = () => { let id = ''; try { id = decodeURIComponent(parsed.hash.slice(1)); } catch {} const target = document.getElementById(id); if (target) { target.scrollIntoView(); observer?.disconnect(); return true; } return false; }; if (!scroll()) { observer = new MutationObserver(scroll); observer.observe(document.body, { childList: true, subtree: true }); } }
    else requestAnimationFrame(() => { window.scrollTo(0, position); focus(); });
    return () => observer?.disconnect();
  }, [url]);
  const parsed = new URL(url, location.origin);
  return <RouteContext.Provider value={{ path: parsed.pathname, search: parsed.search, navigate }}>{children}</RouteContext.Provider>;
}
export function Link({ href = '/', onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { navigate } = useRouter();
  const click = (e: MouseEvent<HTMLAnchorElement>) => { onClick?.(e); if (!e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && href.startsWith('/') && props.target !== '_blank') { e.preventDefault(); navigate(href); } };
  return <a {...props} href={href} onClick={click} />;
}
