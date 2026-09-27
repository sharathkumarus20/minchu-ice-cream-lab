/**
 * Local and Docker server: serves the static site and the same API that runs
 * as a Netlify Function in production. Zero dependencies.
 */
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi } from './api-core.mjs';
import { createFsStore } from './store-fs.mjs';
import { createSupabaseStore } from './store-supabase.mjs';
import seed from '../data/seed.json' with { type: 'json' };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Minimal .env loader. Values already present in the environment win. */
function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!match || line.trim().startsWith('#')) continue;
    process.env[match[1]] ??= match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
loadEnvFile(path.join(root, '.env'));

const port = Number(process.env.PORT) || 8080;
const dataDir = path.resolve(root, process.env.DATA_DIR || 'data/store');
const store = process.env.SUPABASE_URL
  ? createSupabaseStore({ url: process.env.SUPABASE_URL, secretKey: process.env.SUPABASE_SECRET_KEY })
  : createFsStore(dataDir);
const handleApi = createApi({ store, seed, env: process.env });

// Only these paths are public. Server code, .env and data are never served.
const PUBLIC_ENTRIES = new Set(['index.html', 'admin', 'css', 'js', 'assets']);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

// Mirrors the headers in netlify.toml so problems show up locally too.
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

async function serveStatic(urlPath, res) {
  let relative = decodeURIComponent(urlPath).replace(/^\/+/, '');
  if (relative === '' || relative.endsWith('/')) relative += 'index.html';
  const normalized = path.normalize(relative);
  const top = normalized.split(path.sep)[0];
  const file = path.join(root, normalized);
  if (!PUBLIC_ENTRIES.has(top) || !file.startsWith(root + path.sep)) return notFound(res);

  try {
    const body = await readFile(file);
    const headers = { ...SECURITY_HEADERS, 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' };
    if (top === 'admin') Object.assign(headers, { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' });
    else if (top === 'assets') headers['Cache-Control'] = 'public, max-age=86400';
    res.writeHead(200, headers).end(body);
  } catch (error) {
    if (error.code === 'EISDIR' || (error.code === 'ENOENT' && !path.extname(file))) {
      // /admin -> /admin/
      res.writeHead(301, { Location: urlPath.replace(/\/?$/, '/') }).end();
    } else notFound(res);
  }
}

const notFound = (res) => res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain' }).end('Not found');

async function toRequest(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  const init = { method: req.method, headers };
  if (!['GET', 'HEAD'].includes(req.method)) init.body = body;
  return new Request(`http://${req.headers.host || 'localhost'}${req.url}`, init);
}

http
  .createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    try {
      if (pathname.startsWith('/api/')) {
        const response = await handleApi(await toRequest(req));
        const headers = Object.fromEntries(response.headers);
        res.writeHead(response.status, { ...SECURITY_HEADERS, ...headers });
        res.end(Buffer.from(await response.arrayBuffer()));
      } else {
        await serveStatic(pathname, res);
      }
    } catch (error) {
      console.error(error);
      res.writeHead(500).end('Server error');
    }
  })
  .listen(port, () => console.log(`Smriti is running at http://localhost:${port}  (admin: /admin/)`));
