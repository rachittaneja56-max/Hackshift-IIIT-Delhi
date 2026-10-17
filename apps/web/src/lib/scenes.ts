import { ArtifactSchema, SceneSchema, type Artifact, type Scene } from '@trajectoryos/contracts';
export const drawableTypes = new Set(['rectangle', 'ellipse', 'diamond', 'text', 'arrow', 'line', 'freedraw']);
function bounded(value: unknown, depth = 0): boolean {
  if (depth > 12) return false;
  if (value == null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= 1e12;
  if (typeof value === 'string') return value.length <= 16000;
  if (Array.isArray(value)) return value.length <= 2048 && value.every(v => bounded(v, depth + 1));
  if (typeof value === 'object') return Object.entries(value).length <= 100 && Object.entries(value).every(([key, item]) => key.length <= 100 && !['__proto__', 'prototype', 'constructor', 'files', 'fileId'].includes(key) && bounded(item, depth + 1));
  return false;
}
const boundedTimestamp = 1e12;
function normalizeUpdated(elements: unknown[]): Scene['elements'] {
  const copied = JSON.parse(JSON.stringify(elements)) as Scene['elements'];
  for (const element of copied) if (typeof element.updated === 'number' && Math.abs(element.updated) > boundedTimestamp) element.updated = Math.sign(element.updated) * boundedTimestamp;
  return copied;
}
export function sceneError(scene: Scene | null): string | null {
  if (!scene) return null;
  if (!SceneSchema.safeParse(scene).success) return 'A scene may contain at most 200 elements.';
  for (const [index, element] of scene.elements.entries()) {
    const reason = sceneElementError(element);
    if (reason) return `Element ${index + 1}: ${reason} Your drawing remains on this device.`;
  }
  return null;
}
export function sceneElementError(element: Record<string, unknown>): string | null {
  if (typeof element.id !== 'string' || !element.id.length || element.id.length > 128) return 'Invalid element identifier.';
  if (typeof element.type !== 'string' || !drawableTypes.has(element.type)) return `Unsupported element type “${String(element.type)}”. Use simple shapes, text, arrows, lines and freehand only.`;
  if (!bounded(element)) return 'Element data exceeds the supported safety limits.';
  if (element.link !== undefined && element.link !== null) return 'Linked elements are not supported.';
  return null;
}
// Retain deletion tombstones, IDs and bindings. Excalidraw's millisecond `updated` timestamp is
// normalized to the API's documented numeric bound; it is not used for collaboration here.
export function serializeElements(elements: readonly unknown[]): Scene { return { engine: 'excalidraw', formatVersion: 1, elements: normalizeUpdated([...elements]) }; }
export function artifactError(artifact: Artifact, revision = 1): string | null {
  const parsed = ArtifactSchema.safeParse(artifact);
  if (!parsed.success) return parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
  const error = sceneError(artifact.hld) ?? sceneError(artifact.lld); if (error) return error;
  if (new TextEncoder().encode(JSON.stringify({ expectedRevision: revision, artifact })).length > 1024 * 1024) return 'This save exceeds the 1 MiB request limit. Reduce diagram detail before saving.';
  return null;
}
export const drawableCount = (scene: Scene | null) => scene?.elements.filter(e => e.isDeleted !== true && typeof e.type === 'string' && drawableTypes.has(e.type)).length ?? 0;
// Device recovery may contain an invalid import or too many elements. Keep that work recoverable,
// while the normal API/save boundary still enforces every contract bound.
export function recoveryArtifact(value: unknown): Artifact {
  if (!value || typeof value !== 'object' || !('hld' in value) || !('lld' in value)) throw new Error('Invalid recovery record.');
  const base = ArtifactSchema.parse({ ...value, hld: null, lld: null });
  const scene = (candidate: unknown): Scene | null => {
    if (candidate === null) return null;
    if (!candidate || typeof candidate !== 'object' || !('engine' in candidate) || candidate.engine !== 'excalidraw' || !('formatVersion' in candidate) || candidate.formatVersion !== 1 || !('elements' in candidate) || !Array.isArray(candidate.elements) || !candidate.elements.every(e => e && typeof e === 'object' && !Array.isArray(e))) throw new Error('Invalid recovery scene.');
    return { engine: 'excalidraw', formatVersion: 1, elements: normalizeUpdated(candidate.elements) };
  };
  return { ...base, hld: scene(value.hld), lld: scene(value.lld) };
}
