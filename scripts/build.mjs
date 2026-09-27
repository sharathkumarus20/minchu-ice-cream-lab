/**
 * Netlify build step: copies only the public site into dist/.
 * Server code, data, scripts and .env are never published.
 */
import { cp, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const entry of ['index.html', 'admin', 'css', 'js', 'assets']) {
  await cp(path.join(root, entry), path.join(dist, entry), { recursive: true });
}
console.log('Built public site into dist/');
