import { randomBytes } from 'node:crypto';
import { createSessionToken, hashPassword, parseCookies, readSessionToken, verifyPassword } from './auth.mjs';
import { validateMemory, validateOffer, validateProduct, validateSettings } from '../js/schema.js';

const COOKIE_NAME = 'smriti_session';
const SESSION_SECONDS = 8 * 60 * 60;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;
const IMAGE_SIGNATURES = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/webp': (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
};
const COLLECTIONS = {
  products: { validate: validateProduct, label: 'ice cream' },
  memories: { validate: validateMemory, label: 'memory' },
  offers: { validate: validateOffer, label: 'offer' },
};
const TRACK_TYPES = new Set(['view', 'order_click', 'order_whatsapp', 'order_phone']);
const ID_RE = /^[\w-]{1,40}$/;

const BASE_HEADERS = { 'x-content-type-options': 'nosniff' };

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...BASE_HEADERS, ...headers },
  });

const fail = (status, message, fields) => json({ error: message, ...(fields ? { fields } : {}) }, status);

const sortByOrder = (items) =>
  [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name ?? a.title).localeCompare(String(b.name ?? b.title)));

const isUploadedMedia = (url) => typeof url === 'string' && url.startsWith('/api/media/');

/**
 * Builds the request handler. Everything environment specific is injected:
 *  - store: storage adapter (file system locally, Netlify Blobs in production)
 *  - seed:  default content used the first time the site is opened
 *  - env:   configuration (ADMIN_EMAIL, ADMIN_PASSWORD_HASH, SESSION_SECRET, MAX_UPLOAD_MB)
 */
export function createApi({ store, seed, env }) {
  const failedLogins = new Map();
  const maxUploadBytes = Math.max(1, Number(env.MAX_UPLOAD_MB) || 4) * 1024 * 1024;

  async function load(key) {
    let value = await store.getJSON(key);
    if (value == null) {
      value = structuredClone(seed[key]);
      await store.setJSON(key, value);
    }
    return value;
  }

  /** Admin credentials live in the store so they can be changed at runtime; env vars are only the initial defaults. */
  async function loadCredentials() {
    let value = await store.getJSON('credentials');
    if (value == null) {
      value = { email: String(env.ADMIN_EMAIL || '').trim().toLowerCase(), passwordHash: env.ADMIN_PASSWORD_HASH || '' };
      if (value.email && value.passwordHash) await store.setJSON('credentials', value);
    }
    return value;
  }

  async function loadContent() {
    const [settings, products, memories, offers] = await Promise.all([load('settings'), load('products'), load('memories'), load('offers')]);
    return { settings, products: sortByOrder(products), memories: sortByOrder(memories), offers: sortByOrder(offers) };
  }

  async function dropReplacedMedia(previousUrl, nextUrl) {
    if (isUploadedMedia(previousUrl) && previousUrl !== nextUrl) {
      await store.deleteMedia(previousUrl.slice('/api/media/'.length)).catch(() => {});
    }
  }

  // ---------- sessions & request guards ----------

  function currentSession(request) {
    const token = parseCookies(request.headers.get('cookie') || '')[COOKIE_NAME];
    return readSessionToken(token, env.SESSION_SECRET);
  }

  function configurationError() {
    if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
      return fail(500, 'The server is missing SESSION_SECRET (32+ characters).');
    }
    return null;
  }

  /** Blocks cross-site form posts: requires our custom header and a matching Origin. */
  function sameOriginError(request, url) {
    if (request.headers.get('x-requested-with') !== 'smriti-admin') return fail(403, 'Request blocked.');
    const origin = request.headers.get('origin');
    if (origin) {
      let originHost = '';
      try {
        originHost = new URL(origin).host;
      } catch {
        /* falls through to the mismatch below */
      }
      if (originHost !== url.host) return fail(403, 'Request blocked.');
    }
    return null;
  }

  const clientKey = (request) =>
    request.headers.get('x-nf-client-connection-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local';

  const cookieHeader = (value, url, maxAge) =>
    `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${url.protocol === 'https:' ? '; Secure' : ''}`;

  // ---------- route handlers ----------

  async function login(request, url) {
    const misconfigured = configurationError();
    if (misconfigured) return misconfigured;

    const key = clientKey(request);
    const record = failedLogins.get(key);
    if (record && record.count >= MAX_FAILED_LOGINS && record.until > Date.now()) {
      return fail(429, 'Too many failed attempts. Try again in a few minutes.');
    }

    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const credentials = await loadCredentials();
    // Always run the password check so timing does not reveal whether the email matched.
    const passwordOk = await verifyPassword(password, credentials.passwordHash);
    const emailOk = Boolean(credentials.email) && email === credentials.email;

    if (!emailOk || !passwordOk) {
      const count = (record && record.until > Date.now() ? record.count : 0) + 1;
      failedLogins.set(key, { count, until: Date.now() + LOCKOUT_MS });
      await new Promise((resolve) => setTimeout(resolve, 400));
      return fail(401, 'Incorrect email or password.');
    }

    failedLogins.delete(key);
    const token = createSessionToken({ email, exp: Date.now() + SESSION_SECONDS * 1000 }, env.SESSION_SECRET);
    return json({ email }, 200, { 'set-cookie': cookieHeader(token, url, SESSION_SECONDS) });
  }

  async function changeCredentials(request) {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail(400, 'Send the new credentials as JSON.');

    const currentPassword = String(body.currentPassword || '');
    const credentials = await loadCredentials();
    if (!(await verifyPassword(currentPassword, credentials.passwordHash))) {
      return fail(401, 'Your current password is incorrect.');
    }

    const nextEmail = body.email != null ? String(body.email).trim().toLowerCase() : credentials.email;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(nextEmail)) return fail(422, 'Enter a valid email address.', { email: 'Enter a valid email address.' });

    const newPassword = String(body.newPassword || '');
    let nextHash = credentials.passwordHash;
    if (newPassword) {
      if (newPassword.length < 8) return fail(422, 'The new password must be at least 8 characters.', { newPassword: 'Must be at least 8 characters.' });
      nextHash = await hashPassword(newPassword);
    }

    await store.setJSON('credentials', { email: nextEmail, passwordHash: nextHash });

    // Existing sessions were signed with the old email; issue a fresh one so this device stays signed in.
    const url = new URL(request.url);
    const token = createSessionToken({ email: nextEmail, exp: Date.now() + SESSION_SECONDS * 1000 }, env.SESSION_SECRET);
    return json({ email: nextEmail }, 200, { 'set-cookie': cookieHeader(token, url, SESSION_SECONDS) });
  }

  async function serveMedia(id) {
    if (!/^[\w-]+$/.test(id)) return fail(404, 'Not found.');
    const media = await store.getMedia(id);
    if (!media) return fail(404, 'Not found.');
    return new Response(media.data, {
      headers: {
        'content-type': media.contentType,
        'cache-control': 'public, max-age=31536000, immutable',
        'content-security-policy': "default-src 'none'",
        ...BASE_HEADERS,
      },
    });
  }

  async function upload(request) {
    const contentType = (request.headers.get('content-type') || '').split(';')[0].trim();
    const check = IMAGE_SIGNATURES[contentType];
    if (!check) return fail(415, 'Upload a JPEG, PNG or WebP image.');
    const bytes = Buffer.from(await request.arrayBuffer());
    if (bytes.length === 0) return fail(400, 'The image is empty.');
    if (bytes.length > maxUploadBytes) return fail(413, `The image is larger than ${Math.round(maxUploadBytes / 1048576)} MB.`);
    if (!check(bytes)) return fail(415, 'That file is not a valid image.');
    const id = `m${Date.now().toString(36)}${randomBytes(6).toString('hex')}`;
    await store.setMedia(id, bytes, contentType);
    return json({ url: `/api/media/${id}` }, 201);
  }

  async function saveSettings(request) {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail(400, 'Send the settings as JSON.');
    const current = await load('settings');
    const { value, errors } = validateSettings(body, current);
    if (errors) return fail(422, 'Please fix the highlighted fields.', errors);
    await store.setJSON('settings', value);
    await dropReplacedMedia(current.hero?.image, value.hero?.image);
    return json({ settings: value });
  }

  async function saveItem(kind, id, request) {
    const { validate, label } = COLLECTIONS[kind];
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return fail(400, `Send the ${label} as JSON.`);
    const { value, errors } = validate(body);
    if (errors) return fail(422, 'Please fix the highlighted fields.', errors);

    const items = await load(kind);
    const index = id ? items.findIndex((item) => item.id === id) : -1;
    if (id && index === -1) return fail(404, `That ${label} no longer exists.`);

    const previousImage = index >= 0 ? items[index].image : undefined;
    if (value.order === null) {
      value.order = index >= 0 ? items[index].order : items.reduce((max, item) => Math.max(max, item.order ?? 0), 0) + 1;
    }
    const saved = { ...value, id: id || `${kind[0]}${Date.now().toString(36)}${randomBytes(3).toString('hex')}` };
    if (index >= 0) items[index] = saved;
    else items.push(saved);

    await store.setJSON(kind, items);
    await dropReplacedMedia(previousImage, saved.image);
    return json({ item: saved }, index >= 0 ? 200 : 201);
  }

  async function removeItem(kind, id) {
    const items = await load(kind);
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return fail(404, 'That item no longer exists.');
    const [removed] = items.splice(index, 1);
    await store.setJSON(kind, items);
    await dropReplacedMedia(removed.image, undefined);
    return json({ deleted: id });
  }

  // ---------- analytics: anonymous, aggregate counters only (no personal data is collected) ----------

  async function track(request) {
    const body = await request.json().catch(() => null);
    const type = body?.type;
    if (!TRACK_TYPES.has(type)) return fail(400, 'Unknown event.');
    const productId = typeof body?.productId === 'string' && ID_RE.test(body.productId) ? body.productId : null;

    const analytics = await load('analytics');
    const today = new Date().toISOString().slice(0, 10);
    const day = (analytics.days[today] ??= { visits: 0, orderClicks: 0, whatsapp: 0, phone: 0 });

    if (type === 'view') day.visits += 1;
    else if (type === 'order_click') {
      day.orderClicks += 1;
      if (productId) (analytics.products[productId] ??= { clicks: 0 }).clicks += 1;
    } else if (type === 'order_whatsapp') day.whatsapp += 1;
    else if (type === 'order_phone') day.phone += 1;

    await store.setJSON('analytics', analytics);
    return json({ ok: true });
  }

  // ---------- router ----------

  async function route(request) {
    const url = new URL(request.url);
    const path = ('/' + url.pathname.replace(/^\/api\/?/, '')).replace(/\/+$/, '') || '/';
    const { method } = request;

    if (method === 'GET') {
      if (path === '/health') return json({ ok: true });
      if (path === '/content') return json(await loadContent(), 200, { 'cache-control': 'no-cache' });
      if (path.startsWith('/media/')) return serveMedia(path.slice('/media/'.length));
      if (path === '/auth/me') {
        const session = currentSession(request);
        return session ? json({ email: session.email }) : fail(401, 'Not signed in.');
      }
      if (path === '/analytics') {
        const session = currentSession(request);
        return session ? json(await load('analytics')) : fail(401, 'Not signed in.');
      }
      return fail(404, 'Not found.');
    }

    if (!['POST', 'PUT', 'DELETE'].includes(method)) return fail(405, 'Method not allowed.');

    // Anonymous analytics beacon: sendBeacon cannot set custom headers, so this is
    // deliberately exempt from the same-origin check below. It only ever increments
    // counters, so there is nothing here for a forged request to meaningfully abuse.
    if (method === 'POST' && path === '/track') return track(request);

    const blocked = sameOriginError(request, url);
    if (blocked) return blocked;

    if (method === 'POST' && path === '/auth/login') return login(request, url);
    if (method === 'POST' && path === '/auth/logout') return json({ ok: true }, 200, { 'set-cookie': cookieHeader('', url, 0) });

    // Everything below changes content and requires a valid admin session.
    if (!currentSession(request)) return fail(401, 'Your session has expired. Sign in again.');

    if (method === 'POST' && path === '/upload') return upload(request);
    if (method === 'PUT' && path === '/settings') return saveSettings(request);
    if (method === 'PUT' && path === '/auth/credentials') return changeCredentials(request);

    const match = path.match(/^\/(products|memories|offers)(?:\/([\w-]+))?$/);
    if (match) {
      const [, kind, id] = match;
      if (method === 'POST' && !id) return saveItem(kind, null, request);
      if (method === 'PUT' && id) return saveItem(kind, id, request);
      if (method === 'DELETE' && id) return removeItem(kind, id);
    }
    return fail(404, 'Not found.');
  }

  return async function handle(request) {
    try {
      return await route(request);
    } catch (error) {
      console.error('API error:', error);
      return fail(500, 'Something went wrong. Please try again.');
    }
  };
}
