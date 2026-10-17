import { cp, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const editorDist = dirname(require.resolve('@excalidraw/excalidraw'));
const target = fileURLToPath(new URL('../public/excalidraw-assets/', import.meta.url));
await mkdir(target, { recursive: true });
await cp(join(editorDist, 'fonts'), join(target, 'fonts'), { recursive: true });
try { await cp(resolve(editorDist, '../../LICENSE'), join(target, 'LICENSE')); }
catch (error) { if (error.code !== 'ENOENT') throw error; } // Some published builds include only per-font notices.
console.log('Prepared local fonts from installed Excalidraw package.');
