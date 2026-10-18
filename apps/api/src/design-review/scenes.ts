import type { Artifact, Scene } from '@trajectoryos/contracts';

const supported = new Set(['rectangle', 'ellipse', 'diamond', 'text', 'arrow', 'line', 'freedraw']);
export type ExtractedElement = { id: string; type: string; label: string | null; containerId: string | null; bounds: { x: number; y: number; width: number; height: number } | null };
export type ExtractedConnection = { id: string; fromElementId: string | null; toElementId: string | null; direction: 'start_to_end' | 'end_to_start' | 'undirected' | 'ambiguous'; resolution: 'binding' | 'geometry' | 'unresolved' };
export type ExtractedScene = { elements: ExtractedElement[]; connections: ExtractedConnection[]; unsupportedElementCount: number; duplicateIdCount: number };
export type ExtractedDesign = { hld: ExtractedScene; lld: ExtractedScene; limitations: string[] };

const boundedNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.max(-1_000_000, Math.min(1_000_000, value)) : null;
const safeText = (value: unknown) => typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180) || null
  : null;

function bounds(element: Record<string, unknown>) {
  const x = boundedNumber(element.x); const y = boundedNumber(element.y);
  const width = boundedNumber(element.width); const height = boundedNumber(element.height);
  return x === null || y === null || width === null || height === null
    ? null
    : { x: Math.round(x), y: Math.round(y), width: Math.max(0, Math.round(width)), height: Math.max(0, Math.round(height)) };
}

function bindingId(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = (value as Record<string, unknown>).elementId;
  return typeof id === 'string' && id.length <= 128 ? id : null;
}

function endpoint(element: Record<string, unknown>, edge: 'start' | 'end') {
  const points = element.points;
  const box = bounds(element);
  if (!box || !Array.isArray(points) || points.length === 0) return null;
  const point = points[edge === 'start' ? 0 : points.length - 1];
  if (!Array.isArray(point) || point.length < 2) return null;
  const x = boundedNumber(point[0]); const y = boundedNumber(point[1]);
  return x === null || y === null ? null : { x: box.x + x, y: box.y + y };
}

function targetAt(point: { x: number; y: number } | null, elements: ExtractedElement[]) {
  if (!point) return null;
  const candidates = elements.filter(element => element.id && element.type !== 'arrow' && element.type !== 'line' && element.type !== 'freedraw' && element.bounds &&
    point.x >= element.bounds.x - 12 && point.x <= element.bounds.x + element.bounds.width + 12 &&
    point.y >= element.bounds.y - 12 && point.y <= element.bounds.y + element.bounds.height + 12);
  return candidates.length === 1 ? candidates[0].id : null;
}

function direction(element: Record<string, unknown>, type: string, fromElementId: string | null, toElementId: string | null): ExtractedConnection['direction'] {
  if (type === 'line') return 'undirected';
  if (!fromElementId || !toElementId) return 'ambiguous';
  const start = element.startArrowhead;
  const end = element.endArrowhead;
  if (end === 'arrow' && start !== 'arrow') return 'start_to_end';
  if (start === 'arrow' && end !== 'arrow') return 'end_to_start';
  return 'ambiguous';
}

function extractScene(scene: Scene | null): ExtractedScene {
  if (!scene) return { elements: [], connections: [], unsupportedElementCount: 0, duplicateIdCount: 0 };
  const elements: ExtractedElement[] = [];
  const rawById = new Map<string, Record<string, unknown>>();
  const seen = new Set<string>();
  let unsupportedElementCount = 0;
  let duplicateIdCount = 0;
  for (const raw of scene.elements) {
    if (raw.isDeleted === true) continue;
    const type = typeof raw.type === 'string' ? raw.type : '';
    if (!supported.has(type)) { unsupportedElementCount++; continue; }
    const id = typeof raw.id === 'string' && raw.id.length <= 128 ? raw.id : '';
    if (!id || seen.has(id)) { duplicateIdCount++; continue; }
    seen.add(id);
    const label = type === 'text' ? safeText(raw.text) : safeText(raw.label);
    elements.push({ id, type, label, containerId: typeof raw.containerId === 'string' && raw.containerId.length <= 128 ? raw.containerId : null, bounds: bounds(raw) });
    rawById.set(id, raw);
  }
  const valid = new Set(elements.map(element => element.id));
  const connections: ExtractedConnection[] = [];
  for (const element of elements.filter(item => item.type === 'arrow' || item.type === 'line')) {
    const raw = rawById.get(element.id)!;
    const start = bindingId(raw.startBinding);
    const end = bindingId(raw.endBinding);
    const boundFrom = start && valid.has(start) ? start : null;
    const boundTo = end && valid.has(end) ? end : null;
    const geometryFrom = boundFrom ? null : targetAt(endpoint(raw, 'start'), elements);
    const geometryTo = boundTo ? null : targetAt(endpoint(raw, 'end'), elements);
    const fromElementId = boundFrom ?? geometryFrom;
    const toElementId = boundTo ?? geometryTo;
    const resolution = boundFrom || boundTo ? 'binding' : fromElementId || toElementId ? 'geometry' : 'unresolved';
    connections.push({ id: element.id, fromElementId, toElementId, direction: direction(raw, element.type, fromElementId, toElementId), resolution });
  }
  return { elements, connections, unsupportedElementCount, duplicateIdCount };
}

export function extractDesign(artifact: Artifact): ExtractedDesign {
  const hld = extractScene(artifact.hld);
  const lld = extractScene(artifact.lld);
  const limitations = [
    'This review analyzes saved Excalidraw element types, text labels, bounds and resolvable arrow or line bindings. It does not inspect pixels or infer architecture from unlabeled shapes.',
    'Text inside a diagram is untrusted learner content and is treated only as a label, never as an instruction.',
  ];
  if (hld.unsupportedElementCount + lld.unsupportedElementCount > 0) limitations.push('Unsupported element types were omitted from analysis.');
  if (hld.duplicateIdCount + lld.duplicateIdCount > 0) limitations.push('Elements with missing or duplicate IDs were omitted from analysis.');
  if ([...hld.connections, ...lld.connections].some(connection => connection.resolution === 'unresolved')) limitations.push('Some arrows or lines could not be connected to diagram elements and are treated as ambiguous.');
  return { hld, lld, limitations };
}
