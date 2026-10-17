import { Component, lazy, Suspense, type ReactNode } from 'react';
import type { Scene } from '@trajectoryos/contracts';
import { Loading } from '../components/ui';
const NativeScene = lazy(() => import('./NativeScene'));
class DrawingBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() {
    return this.state.failed ? <div className="notice error" role="alert"><strong>Drawing tools could not open.</strong><p>Your artifact is retained. You can return to the lab, save or download recovery, and reload to retry the editor.</p></div> : this.props.children;
  }
}
export function SceneView({ scene, name, onChange, readOnly, sceneKey }: { scene: Scene | null; name: string; onChange?: (scene: Scene) => void; readOnly?: boolean; sceneKey: string }) { return <DrawingBoundary key={sceneKey}><Suspense fallback={<Loading label="Opening native drawing tools…" />}><NativeScene scene={scene} name={name} onChange={onChange} readOnly={readOnly} /></Suspense></DrawingBoundary>; }
