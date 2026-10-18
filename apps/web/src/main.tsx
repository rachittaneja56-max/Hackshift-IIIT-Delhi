import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import LandingEntry from './landing/LandingEntry';
import './styles.css';

// Native editor fonts are served from the installed, version-matched package.
Object.assign(window, { EXCALIDRAW_ASSET_PATH: `${import.meta.env.BASE_URL}excalidraw-assets/` });
try {
  const appearance = localStorage.getItem('trajectoryos:theme') ?? 'system';
  document.documentElement.dataset.theme = appearance === 'dark' || (appearance === 'system' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
} catch {
  document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element.");
}

createRoot(rootElement).render(<StrictMode><LandingEntry /></StrictMode>);
