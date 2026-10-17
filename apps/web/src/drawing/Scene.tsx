import { lazy, Suspense } from 'react';
import type { Scene } from '@trajectoryos/contracts';
import { Loading } from '../components/ui';
const NativeScene = lazy(() => import('./NativeScene'));
export function SceneView({ scene, name, onChange, readOnly, sceneKey }: { scene: Scene | null; name: string; onChange?: (scene: Scene) => void; readOnly?: boolean; sceneKey: string }) { return <Suspense fallback={<Loading label="Opening native drawing tools…" />}><NativeScene key={sceneKey} scene={scene} name={name} onChange={onChange} readOnly={readOnly} /></Suspense>; }
