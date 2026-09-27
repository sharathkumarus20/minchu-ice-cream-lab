/** Small helpers shared by the public site and the admin panel. */

export class ApiError extends Error {
  constructor(message, status, fields) {
    super(message);
    this.status = status;
    this.fields = fields || null;
  }
}

/**
 * Calls the JSON API. Sends the custom header the server requires on every
 * write, and fires "session-expired" when a signed-in admin is logged out.
 */
export async function api(path, { method = 'GET', body, raw } = {}) {
  const headers = {};
  let payload;
  if (method !== 'GET') headers['X-Requested-With'] = 'smriti-admin';
  if (raw) {
    headers['Content-Type'] = raw.type;
    payload = raw;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`/api${path}`, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('session-expired'));
    throw new ApiError(data?.error || 'The request failed. Please try again.', response.status, data?.fields);
  }
  return data;
}

/**
 * Creates a DOM element. Children can be strings, nodes, arrays or null.
 * Text is always inserted as text, never as HTML.
 */
export function h(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') element.className = value;
    else if (key === 'style') for (const [name, v] of Object.entries(value)) element.style.setProperty(name, v);
    else if (key.startsWith('on') && typeof value === 'function') element.addEventListener(key.slice(2).toLowerCase(), value);
    else element.setAttribute(key, value === true ? '' : value);
  }
  append(element, children);
  return element;
}

function append(parent, children) {
  for (const child of children) {
    if (Array.isArray(child)) append(parent, child);
    else if (child !== null && child !== undefined && child !== false) parent.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
}

export const clear = (element) => element.replaceChildren();

/** Replaces {brandName} style tokens in configurable text. */
export function fillTokens(text, values) {
  return String(text ?? '').replace(/\{(\w+)\}/g, (match, key) => (key in values ? values[key] : match));
}

export function formatPrice(price, currency) {
  const amount = Number.isInteger(price) ? String(price) : Number(price).toFixed(2);
  return `${currency}${amount}`;
}

/**
 * Fires an anonymous analytics beacon (a page view or an order-button click).
 * Uses sendBeacon so it survives the page navigating away (e.g. a tel: link);
 * failures are swallowed because analytics must never break the site.
 */
export function trackEvent(type, extra = {}) {
  try {
    const payload = JSON.stringify({ type, ...extra });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/track', new Blob([payload], { type: 'application/json' }));
    else fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {});
  } catch {
    /* analytics is best-effort */
  }
}

const digitsOnly = (value) => String(value || '').replace(/\D/g, '');

/** tel: link. Keeps a leading + so the dialer treats it as an international number. */
export function telHref(phone) {
  const trimmed = String(phone || '').trim();
  return `tel:${trimmed.startsWith('+') ? '+' : ''}${digitsOnly(trimmed)}`;
}

/**
 * wa.me opens the WhatsApp app on Android and iPhone, and WhatsApp Desktop or
 * WhatsApp Web on Windows, Mac and Linux, so one link works everywhere.
 */
export function whatsappHref(number, message) {
  return `https://wa.me/${digitsOnly(number)}?text=${encodeURIComponent(message)}`;
}
