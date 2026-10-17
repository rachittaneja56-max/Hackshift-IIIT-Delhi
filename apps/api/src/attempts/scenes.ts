import type { Artifact } from "@trajectoryos/contracts";
import { ApiError } from "../errors.js";

const types = new Set(["rectangle", "ellipse", "diamond", "text", "arrow", "line", "freedraw"]);
// Preserve Excalidraw vendor fields while bounding every nested value. No file/image/URL payloads.
export function validateScenes(artifact: Artifact) {
  function bounded(value: unknown, depth = 0): boolean {
    if (depth > 12) return false;
    if (value == null || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value) && Math.abs(value) <= 1e12;
    if (typeof value === "string") return value.length <= 16000;
    if (Array.isArray(value)) return value.length <= 2048 && value.every(v => bounded(v, depth + 1));
    if (typeof value === "object") return Object.entries(value).length <= 100 && Object.entries(value).every(
      ([key, item]) => key.length <= 100 && !["__proto__", "prototype", "constructor", "files", "fileId"].includes(key) && bounded(item, depth + 1));
    return false;
  }
  for (const scene of [artifact.hld, artifact.lld]) {
    if (!scene) continue;
    for (const element of scene.elements) {
      if (typeof element.id !== "string" || !element.id.length || element.id.length > 128 ||
        typeof element.type !== "string" || !types.has(element.type) || !bounded(element) ||
        (element.link !== undefined && element.link !== null)) {
        throw new ApiError(422, "VALIDATION_FAILED", "Use bounded simple Excalidraw elements with IDs and no external files or links.");
      }
    }
  }
}
