import { useEffect, useMemo, useRef, useState } from 'react';
import { Excalidraw, MainMenu, restoreElements } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { Scene } from '@trajectoryos/contracts';
import { sceneError, serializeElements } from '../lib/scenes';
import '@excalidraw/excalidraw/index.css';
export default function NativeScene({ scene, onChange, readOnly = false, name }: { scene: Scene | null; onChange?: (scene: Scene) => void; readOnly?: boolean; name: string }) {
  const api = useRef<ExcalidrawImperativeAPI | null>(null); const callback = useRef(onChange); callback.current = onChange;
  const [theme, setTheme] = useState<'light' | 'dark'>(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  const initial = useMemo(() => restoreElements((scene?.elements ?? []) as unknown as readonly ExcalidrawElement[], null, { repairBindings: true }), []);
  const last = useRef(JSON.stringify(serializeElements(initial))); const [error, setError] = useState<string | null>(sceneError(scene));
  const change = (elements: readonly ExcalidrawElement[]) => { if (readOnly) return; const value = serializeElements(elements), serialized = JSON.stringify(value); if (last.current === serialized) return; last.current = serialized; setError(sceneError(value)); callback.current?.(value); };
  useEffect(() => { const observer = new MutationObserver(() => setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); return () => { observer.disconnect(); if (api.current && !readOnly) change(api.current.getSceneElementsIncludingDeleted()); }; }, []);
  return <div className={`native-scene ${readOnly ? 'readonly' : ''}`}>{error && <div className="scene-warning" role="alert">{error}</div>}<Excalidraw name={name} excalidrawAPI={value => { api.current = value; }} initialData={{ elements: initial, appState: { viewBackgroundColor: theme === 'dark' ? '#20231f' : '#fffefa' }, scrollToContent: readOnly }} theme={theme} viewModeEnabled={readOnly} autoFocus={!readOnly} handleKeyboardGlobally={false} aiEnabled={false} validateEmbeddable={false} onLinkOpen={(_element, event) => event.preventDefault()} UIOptions={{ tools: { image: false }, canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false } }} onChange={change} onPaste={data => { if (data.files?.length) { setError('Image/file paste is unsupported. Your existing scene is retained.'); return false; } return true; }}>
    <MainMenu><MainMenu.DefaultItems.ClearCanvas /><MainMenu.DefaultItems.ChangeCanvasBackground /><MainMenu.DefaultItems.Help /></MainMenu>
  </Excalidraw></div>;
}
