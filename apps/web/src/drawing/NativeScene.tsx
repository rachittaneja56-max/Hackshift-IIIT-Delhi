import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CaptureUpdateAction, Excalidraw, MainMenu, restoreElements } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { Scene } from '@trajectoryos/contracts';
import { sceneElementError, sceneError, serializeElements } from '../lib/scenes';
import { SceneSession } from './scene-session';
import '@excalidraw/excalidraw/index.css';
// Native binding repair must never mutate the queue's local/server snapshots.
const restore = (scene: Scene | null) => restoreElements(serializeElements(scene?.elements ?? []).elements as unknown as readonly ExcalidrawElement[], null, { repairBindings: true });
const appearance = () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

export default function NativeScene({ scene, onChange, readOnly = false, name }: { scene: Scene | null; onChange?: (scene: Scene) => void; readOnly?: boolean; name: string }) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(appearance);
  // Invalid recovered imports stay intact until the explicit removal action.
  const unsupported = scene?.elements.some(element => sceneElementError(element)) ?? false;
  const initial = useMemo(() => unsupported ? [] : restore(scene), []);
  const session = useRef<SceneSession | null>(null);
  if (!session.current) session.current = new SceneSession(scene, initial);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(sceneError(scene));
  const bindApi = useCallback((value: ExcalidrawImperativeAPI) => setApi(value), []);

  useLayoutEffect(() => {
    if (!api || !session.current!.needsReplacement(scene)) return;
    if (unsupported) return;
    const elements = restore(scene);
    session.current!.reset(elements);
    api.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER });
    api.history.clear();
    api.scrollToContent(elements, { fitToViewport: true });
    setValidationError(sceneError(scene));
    setPasteError(null);
  }, [api, scene, unsupported]);

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(appearance()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const change = (elements: readonly ExcalidrawElement[]) => {
    const value = session.current!.change(elements);
    if (!value || readOnly || unsupported) return;
    setValidationError(sceneError(value));
    setPasteError(null);
    onChange?.(value);
  };
  if (unsupported) return <div className="notice warning" role="alert">This scene contains unsupported data. Your full device copy is retained. Use the recovery download and explicit removal action above to reopen the drawing tools.</div>;

  return <div className={`native-scene ${readOnly ? 'readonly' : ''}`}>
    {(pasteError || validationError) && <div className="scene-warning" role="alert">{pasteError || validationError}</div>}
    <Excalidraw name={name} excalidrawAPI={bindApi} initialData={{ elements: initial, appState: { viewBackgroundColor: '#fffefa' }, scrollToContent: true }} theme={theme} viewModeEnabled={readOnly} autoFocus={!readOnly} handleKeyboardGlobally={false} aiEnabled={false} validateEmbeddable={false} onLinkOpen={(_element, event) => event.preventDefault()} UIOptions={{ tools: { image: false }, canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false, changeViewBackgroundColor: false } }} onChange={change} onPaste={data => {
      const incoming = data.elements ? serializeElements(data.elements) : null;
      const error = data.files?.length ? 'Image/file paste is unsupported. Your existing scene is retained.' : incoming && sceneError(incoming);
      if (error) { setPasteError(error); return false; }
      return true;
    }}>
      <MainMenu>{!readOnly && <MainMenu.DefaultItems.ClearCanvas />}<MainMenu.DefaultItems.Help /></MainMenu>
    </Excalidraw>
  </div>;
}
