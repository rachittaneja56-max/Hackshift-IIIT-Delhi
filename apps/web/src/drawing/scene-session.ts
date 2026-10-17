import type { Scene } from '@trajectoryos/contracts';
import { serializeElements } from '../lib/scenes.ts';

// Excalidraw emits changes for restoration, camera and tool updates as well as edits.
export class SceneSession {
  private source: string;
  private current: string;
  private initializing = true;

  constructor(scene: Scene | null, restored: readonly unknown[]) {
    this.source = JSON.stringify(scene);
    this.current = JSON.stringify(serializeElements(restored));
  }

  needsReplacement(scene: Scene | null): boolean {
    const source = JSON.stringify(scene);
    if (source === this.source) return false;
    this.source = source;
    return JSON.stringify(serializeElements(scene?.elements ?? [])) !== this.current;
  }

  reset(restored: readonly unknown[]) {
    this.current = JSON.stringify(serializeElements(restored));
    this.initializing = true;
  }

  change(elements: readonly unknown[]): Scene | null {
    const next = serializeElements(elements), serialized = JSON.stringify(next);
    if (this.initializing) {
      this.initializing = false;
      this.current = serialized;
      return null;
    }
    if (serialized === this.current) return null;
    this.current = serialized;
    return next;
  }
}
