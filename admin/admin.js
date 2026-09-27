import { api, h, formatPrice } from '../js/utils.js';
import { MEMORY_FIELDS, OFFER_FIELDS, PRODUCT_FIELDS, SETTINGS_PAGES, WEIGHT_VARIANTS, findVariant, isOfferLive, variantPrice, validateField } from '../js/schema.js';

const app = document.getElementById('app');
const state = { content: null, email: '' };
let fieldCounter = 0;

// ---------- small UI helpers ----------

function toast(message, type = 'success') {
  const item = h('div', { class: `toast ${type === 'error' ? 'toast--error' : ''}` }, message);
  document.getElementById('toasts').append(item);
  setTimeout(() => item.remove(), 4500);
}

function setBusy(button, busy, label) {
  button.dataset.label ??= button.textContent;
  button.disabled = busy;
  button.setAttribute('aria-busy', String(busy));
  button.textContent = busy ? label : button.dataset.label;
}

function confirmAction({ title, message, confirmLabel }) {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'modal modal--sm', role: 'alertdialog', 'aria-labelledby': 'confirmTitle' },
      h('form', { method: 'dialog', class: 'modal__inner' },
        h('h2', { id: 'confirmTitle' }, title),
        h('p', {}, message),
        h('div', { class: 'modal__actions' },
          h('button', { class: 'btn', value: 'cancel', autofocus: true }, 'Cancel'),
          h('button', { class: 'btn btn--danger', value: 'ok' }, confirmLabel))));
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(dialog.returnValue === 'ok');
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

async function compressImage(file, maxSide = 1600) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const toBlob = (type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  const webp = await toBlob('image/webp', 0.82);
  return webp && webp.type === 'image/webp' ? webp : toBlob('image/jpeg', 0.85);
}

// ---------- form fields (built from the shared schema) ----------

function createField(def, value, { suggestions = [], onDeleteSuggestion, productOptions = [], variantOptions = [] } = {}) {
  const id = `field-${++fieldCounter}`;
  const errorEl = h('p', { class: 'field__error', id: `${id}-error`, role: 'alert', hidden: true });
  const helpEl = def.help ? h('p', { class: 'field__help', id: `${id}-help` }, def.help) : null;
  const describedBy = [helpEl && `${id}-help`, `${id}-error`].filter(Boolean).join(' ');
  const labelEl = h('label', { class: 'field__label', for: id }, def.label, def.required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null);
  const field = { def, path: def.key };
  let control = null;

  const finish = (el) => {
    field.el = el;
    return field;
  };

  if (def.type === 'longtext') {
    control = h('textarea', { id, rows: def.rows || 3, maxlength: def.max, 'aria-describedby': describedBy });
    control.value = value ?? '';
    field.read = () => control.value;
    finish(h('div', { class: 'field' }, labelEl, control, helpEl, errorEl));
  } else if (def.type === 'checkbox') {
    control = h('input', { type: 'checkbox', id, class: 'switch', 'aria-describedby': describedBy });
    control.checked = Boolean(value);
    field.read = () => control.checked;
    finish(h('div', { class: 'field' }, h('div', { class: 'field--checkbox' }, control, h('label', { for: id }, def.label)), helpEl, errorEl));
  } else if (def.type === 'image') {
    finish(buildImageField(field, def, id, value, labelEl, helpEl, errorEl, describedBy));
  } else if (def.type === 'repeater') {
    finish(buildRepeater(field, def, value, helpEl, errorEl));
  } else if (def.type === 'checkboxGroup') {
    finish(buildCheckboxGroup(field, def, value, helpEl, errorEl));
  } else if (def.suggestions) {
    finish(buildSuggestField(field, def, id, value, suggestions, labelEl, helpEl, errorEl, describedBy, onDeleteSuggestion));
  } else if (def.type === 'productSelect') {
    control = h('select', { id, 'aria-describedby': describedBy },
      h('option', { value: '' }, '— No specific item —'),
      productOptions.map((p) => h('option', { value: p.id }, p.name)));
    control.value = productOptions.some((p) => p.id === value) ? value : '';
    field.read = () => control.value;
    finish(h('div', { class: 'field' }, labelEl, control, helpEl, errorEl));
  } else if (def.type === 'variantSelect') {
    const options = variantOptions;
    control = h('select', { id, disabled: options.length === 0, 'aria-describedby': describedBy },
      h('option', { value: '' }, options.length ? '— Any weight / volume —' : '— Pick a menu item first —'),
      options.map((o) => h('option', { value: o.value }, o.label)));
    control.value = options.some((o) => o.value === value) ? value : '';
    field.read = () => control.value;
    field.refresh = (nextOptions) => {
      const current = control.value;
      control.disabled = nextOptions.length === 0;
      control.replaceChildren(
        h('option', { value: '' }, nextOptions.length ? '— Any weight / volume —' : '— Pick a menu item first —'),
        ...nextOptions.map((o) => h('option', { value: o.value }, o.label)));
      control.value = nextOptions.some((o) => o.value === current) ? current : '';
    };
    finish(h('div', { class: 'field' }, labelEl, control, helpEl, errorEl));
  } else if (def.type === 'password') {
    control = h('input', { type: 'password', id, maxlength: def.max, placeholder: def.placeholder, autocomplete: 'off', 'aria-describedby': describedBy });
    control.value = value ?? '';
    field.read = () => control.value;
    const toggle = h('button', {
      type: 'button', class: 'password__toggle', 'aria-label': 'Show password', 'aria-pressed': 'false',
      onclick: () => {
        const showing = control.type === 'text';
        control.type = showing ? 'password' : 'text';
        toggle.setAttribute('aria-pressed', String(!showing));
        toggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
        toggle.textContent = showing ? 'Show' : 'Hide';
      },
    }, 'Show');
    finish(h('div', { class: 'field' }, labelEl, h('div', { class: 'password' }, control, toggle), helpEl, errorEl));
  } else {
    const inputType = { number: 'number', email: 'email', phone: 'tel', whatsapp: 'tel', url: 'url' }[def.type] || 'text';
    control = h('input', { type: inputType, id, maxlength: def.max, min: def.min, max: def.type === 'number' ? def.max : null, step: def.step || (def.integer ? '1' : null), placeholder: def.placeholder, autocomplete: 'off', 'aria-describedby': describedBy });
    control.value = value ?? '';
    field.read = () => control.value;
    finish(h('div', { class: 'field' }, labelEl, control, helpEl, errorEl));
  }

  field.check ??= () => validateField(def, field.read());
  field.commit ??= async () => field.read();
  field.focus = () => (control || field.el.querySelector('input, textarea, button'))?.focus();
  field.setError = (message) => {
    errorEl.textContent = message || '';
    errorEl.hidden = !message;
    field.el.classList.toggle('has-error', Boolean(message));
    control?.setAttribute('aria-invalid', message ? 'true' : 'false');
  };
  return field;
}

function buildImageField(field, def, id, value, labelEl, helpEl, errorEl, describedBy) {
  const image = { url: value || '', file: null, preview: null };
  const preview = h('div', { class: 'imgfield__preview' });
  const input = h('input', { type: 'file', id, accept: 'image/jpeg,image/png,image/webp', 'aria-describedby': describedBy });
  const removeButton = h('button', { class: 'btn btn--sm', type: 'button', onclick: () => {
    if (image.preview) URL.revokeObjectURL(image.preview);
    image.preview = null;
    image.url = '';
    image.file = null;
    field.setError('');
    draw();
  } }, 'Remove image');
  const chooseLabel = h('label', { class: 'btn btn--sm', for: id }, 'Choose image');

  const draw = () => {
    const src = image.preview || image.url;
    preview.replaceChildren(src ? h('img', { src, alt: '' }) : 'No image');
    removeButton.hidden = !src;
  };
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    // Saving waits for this to finish, so a fast click on Save never misses the new image.
    image.processing = (async () => {
      try {
        image.file = await compressImage(file);
        if (image.preview) URL.revokeObjectURL(image.preview);
        image.preview = URL.createObjectURL(image.file);
        field.setError('');
      } catch {
        field.setError('That file could not be read as an image. Try a JPEG, PNG or WebP file.');
      }
      input.value = '';
      draw();
    })();
  });
  draw();

  field.ready = () => image.processing;
  field.read = () => (image.file ? '/api/media/pending' : image.url);
  // The image is uploaded only when the form is saved, so cancelled edits leave nothing behind.
  field.commit = async () => {
    if (image.file) {
      const { url } = await api('/upload', { method: 'POST', raw: image.file });
      image.url = url;
      image.file = null;
    }
    return image.url;
  };
  return h('div', { class: 'field' }, h('span', { class: 'field__label' }, def.label, def.required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null),
    h('div', { class: 'imgfield' }, preview, h('div', { class: 'actions' }, input, chooseLabel, removeButton)), helpEl, errorEl);
}

const NEW_OPTION = '__new__';

function buildSuggestField(field, def, id, value, suggestions, labelEl, helpEl, errorEl, describedBy, onDeleteSuggestion) {
  const hasValue = value != null && value !== '';
  const isKnown = hasValue && suggestions.includes(value);
  let current = isKnown ? value : (hasValue ? NEW_OPTION : '');

  const textId = `${id}-new`;
  const text = h('input', { type: 'text', id: textId, maxlength: def.max, placeholder: `New ${def.label.toLowerCase()}`, hidden: current !== NEW_OPTION, 'aria-describedby': describedBy });
  if (current === NEW_OPTION) text.value = value;

  const button = h('button', { type: 'button', class: 'suggestfield__toggle', id, 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-describedby': describedBy },
    h('span', {}, current && current !== NEW_OPTION ? current : `Choose ${def.label.toLowerCase()}…`));
  const list = h('ul', { class: 'suggestfield__list', role: 'listbox', hidden: true });
  const wrap = h('div', { class: 'suggestfield' }, button, list);

  const close = () => { list.hidden = true; button.setAttribute('aria-expanded', 'false'); };
  const selectValue = (v) => {
    current = v;
    button.firstChild.textContent = v === NEW_OPTION ? `Choose ${def.label.toLowerCase()}…` : v;
    text.hidden = v !== NEW_OPTION;
    if (v === NEW_OPTION) { text.value = ''; text.focus(); }
    close();
  };

  const renderList = () => {
    list.replaceChildren(
      ...suggestions.map((s) => h('li', { role: 'option', 'aria-selected': String(s === current) },
        h('button', { type: 'button', class: 'suggestfield__option', onclick: () => selectValue(s) }, s),
        onDeleteSuggestion ? h('button', {
          type: 'button', class: 'suggestfield__delete', 'aria-label': `Delete category “${s}”`,
          onclick: async (event) => {
            event.stopPropagation();
            const ok = await confirmAction({ title: `Delete “${s}”?`, message: `This removes the category from all ice creams using it. This cannot be undone.`, confirmLabel: 'Delete' });
            if (!ok) return;
            await onDeleteSuggestion(s);
            suggestions = suggestions.filter((c) => c !== s);
            if (current === s) selectValue('');
            renderList();
          },
        }, '✕') : null)),
      h('li', { role: 'option', 'aria-selected': String(current === NEW_OPTION) },
        h('button', { type: 'button', class: 'suggestfield__option', onclick: () => selectValue(NEW_OPTION) }, '+ Add new…')));
  };
  renderList();

  button.addEventListener('click', () => {
    const opening = list.hidden;
    list.hidden = !opening;
    button.setAttribute('aria-expanded', String(opening));
  });
  document.addEventListener('click', (event) => { if (!wrap.contains(event.target)) close(); });

  field.read = () => (current === NEW_OPTION ? text.value : current);
  return h('div', { class: 'field' }, labelEl, wrap, text, helpEl, errorEl);
}

function buildCheckboxGroup(field, def, value, helpEl, errorEl) {
  const selected = new Set(Array.isArray(value) ? value : []);
  const boxes = def.options.map((opt) => {
    const cid = `field-${++fieldCounter}`;
    const box = h('input', { type: 'checkbox', id: cid, value: opt.value });
    box.checked = selected.has(opt.value);
    return { opt, box, row: h('label', { class: 'checkgroup__item', for: cid }, box, opt.label) };
  });
  field.read = () => boxes.filter((b) => b.box.checked).map((b) => b.opt.value);
  return h('fieldset', { class: 'field' },
    h('legend', {}, def.label, def.required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null),
    h('div', { class: 'checkgroup' }, boxes.map((b) => b.row)), helpEl, errorEl);
}

function buildRepeater(field, def, value, helpEl, errorEl) {
  const rowsEl = h('div', { class: 'repeater__rows' });
  const rows = [];
  const addButton = h('button', { class: 'btn btn--sm', type: 'button', onclick: () => addRow({}) }, def.addLabel || 'Add');

  const refresh = () => {
    addButton.disabled = rows.length >= def.maxItems;
  };
  const addRow = (item) => {
    const subs = def.fields.map((sub) => createField(sub, item[sub.key]));
    const row = h('div', { class: 'repeater__row' },
      h('div', { class: 'repeater__fields' }, subs.map((s) => s.el)),
      h('div', { class: 'actions' }, h('button', { class: 'btn btn--sm link-danger', type: 'button', onclick: () => {
        rows.splice(rows.findIndex((r) => r.row === row), 1);
        row.remove();
        refresh();
      } }, `Remove ${(def.itemLabel || 'item').toLowerCase()}`)));
    rows.push({ row, subs });
    rowsEl.append(row);
    refresh();
  };
  (value || []).forEach(addRow);

  field.read = () => rows.map(({ subs }) => Object.fromEntries(subs.map((s) => [s.def.key, s.read()])));
  return h('fieldset', { class: 'field' }, h('legend', {}, def.label), rowsEl, h('div', { class: 'actions' }, addButton), helpEl, errorEl);
}

/**
 * Validates every field, uploads pending images, then calls save(values).
 * Server-side field errors are shown on the matching field.
 */
async function submitFields(fields, { button, formError, save }) {
  formError.hidden = true;
  await Promise.all(fields.map((f) => f.ready?.()));
  fields.forEach((f) => f.setError(''));
  let firstInvalid = null;
  for (const f of fields) {
    const result = f.check();
    if (result.error) {
      f.setError(result.error);
      firstInvalid ??= f;
    }
  }
  if (firstInvalid) {
    firstInvalid.focus();
    formError.textContent = 'Fix the highlighted fields and save again.';
    formError.hidden = false;
    return false;
  }

  setBusy(button, true, 'Saving…');
  try {
    const values = {};
    for (const f of fields) values[f.path] = await f.commit();
    await save(values);
    return true;
  } catch (error) {
    let placed = false;
    for (const f of fields) {
      const message = error.fields?.[f.path];
      if (message) {
        f.setError(message);
        placed = true;
      }
    }
    formError.textContent = placed ? 'Fix the highlighted fields and save again.' : error.message;
    formError.hidden = false;
    return false;
  } finally {
    setBusy(button, false);
  }
}

// ---------- data ----------

async function loadContent() {
  state.content = await api('/content');
  document.title = `${state.content.settings.general.brandName} admin`;
}

const categories = () => [...new Set(state.content.products.map((p) => p.category))];

// ---------- login ----------

function showLogin(notice = '') {
  document.title = 'Admin sign in';
  const error = h('p', { class: 'form-error', role: 'alert', hidden: !notice }, notice);
  const email = h('input', { type: 'email', id: 'loginEmail', autocomplete: 'username', required: true });
  const password = h('input', { type: 'password', id: 'loginPassword', autocomplete: 'current-password', required: true });
  const submit = h('button', { class: 'btn btn--primary', type: 'submit' }, 'Sign in');

  const form = h('form', { class: 'form', novalidate: true, onsubmit: async (event) => {
    event.preventDefault();
    error.hidden = true;
    if (!email.value.trim() || !password.value) {
      error.textContent = 'Enter your email and password.';
      error.hidden = false;
      return;
    }
    setBusy(submit, true, 'Signing in…');
    try {
      const me = await api('/auth/login', { method: 'POST', body: { email: email.value, password: password.value } });
      state.email = me.email;
      await loadContent();
      showShell();
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
      password.value = '';
      password.focus();
    } finally {
      setBusy(submit, false);
    }
  } },
    error,
    h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'loginEmail' }, 'Email'), email),
    h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'loginPassword' }, 'Password'), password),
    submit);

  app.replaceChildren(h('main', { class: 'login' }, h('div', { class: 'login__card' },
    h('h1', {}, 'Admin sign in'), h('p', { class: 'muted' }, 'Sign in to manage your website.'), form)));
  email.focus();
}

// ---------- shell and routing ----------

const ROUTES = [
  { id: 'dashboard', label: 'Dashboard', render: renderDashboard },
  { id: 'products', label: 'Products', render: renderProducts },
  { id: 'memories', label: 'Memories', render: renderMemories },
  { id: 'offers', label: 'Offers', render: renderOffers },
  ...SETTINGS_PAGES.map((page) => ({ id: page.id, label: page.title, render: (view) => renderSettings(view, page) })),
  { id: 'account', label: 'Admin login', render: renderAccount },
];

function showShell() {
  const signOut = h('button', { class: 'btn btn--sm', type: 'button', onclick: async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    showLogin();
  } }, 'Sign out');

  app.replaceChildren(
    h('a', { class: 'skip', href: '#view' }, 'Skip to content'),
    h('header', { class: 'top' },
      h('strong', {}, `${state.content.settings.general.brandName} admin`),
      h('div', { class: 'top__actions' }, h('a', { class: 'btn btn--sm', href: '/', target: '_blank', rel: 'noopener' }, 'View website'), signOut)),
    h('div', { class: 'layout' },
      h('nav', { class: 'side', 'aria-label': 'Admin sections' }, ROUTES.map((r) => h('a', { href: `#/${r.id}`, 'data-route': r.id }, r.label))),
      h('main', { class: 'view', id: 'view', tabindex: '-1' })));
  route();
}

function route() {
  const view = document.getElementById('view');
  if (!view) return;
  const id = location.hash.replace(/^#\//, '') || 'dashboard';
  const current = ROUTES.find((r) => r.id === id) || ROUTES[0];
  for (const link of document.querySelectorAll('[data-route]')) {
    if (link.dataset.route === current.id) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  view.replaceChildren();
  current.render(view);
}

const pageHead = (title, subtitle, ...actions) =>
  h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, title), subtitle ? h('p', {}, subtitle) : null), h('div', { class: 'actions' }, actions));

// ---------- dashboard ----------

function renderDashboard(view) {
  const { products, memories, offers, settings } = state.content;
  const stat = (value, label) => h('div', { class: 'stat' }, h('strong', {}, String(value)), h('span', {}, label));
  view.append(
    pageHead('Dashboard', 'A quick look at your website.'),
    h('div', { class: 'stats' },
      stat(products.length, 'Ice creams'),
      stat(products.filter((p) => p.available).length, 'Available to order'),
      stat(products.filter((p) => p.featured).length, 'Featured'),
      stat(memories.length, 'Memories'),
      stat(offers.filter((o) => isOfferLive(o)).length, 'Live offers')));

  const analyticsPanel = h('section', { class: 'panel' }, h('h2', {}, 'Analytics'), h('p', { class: 'muted' }, 'Loading\u2026'));
  view.append(analyticsPanel);
  loadAnalyticsPanel(analyticsPanel, products);

  view.append(
    h('section', { class: 'panel' }, h('h2', {}, 'Ordering'),
      h('p', { class: 'muted' }, `Phone: ${settings.contact.phone}. WhatsApp: ${settings.contact.whatsapp}.`),
      h('div', { class: 'actions' }, h('a', { class: 'btn btn--sm', href: '#/contact' }, 'Change contact and ordering'))),
    h('section', { class: 'panel' }, h('h2', {}, 'Quick actions'),
      h('div', { class: 'actions' },
        h('a', { class: 'btn btn--sm', href: '#/products' }, 'Manage ice creams'),
        h('a', { class: 'btn btn--sm', href: '#/memories' }, 'Manage memories'),
        h('a', { class: 'btn btn--sm', href: '#/offers' }, 'Manage offers'),
        h('a', { class: 'btn btn--sm', href: '#/website' }, 'Edit website text'),
        h('a', { class: 'btn btn--sm', href: '#/social' }, 'Edit social links'))));
}

function last7Dates() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
}

async function loadAnalyticsPanel(panel, products) {
  let analytics;
  try {
    analytics = await api('/analytics');
  } catch (error) {
    panel.replaceChildren(h('h2', {}, 'Analytics'), h('p', { class: 'muted' }, 'Could not load analytics right now.'));
    return;
  }

  const days = analytics.days || {};
  const week = last7Dates().map((date) => ({ date, visits: days[date]?.visits || 0 }));
  const sum = (field) => week.reduce((total, d) => total + (days[d.date]?.[field] || 0), 0);
  const visitsToday = days[week[6].date]?.visits || 0;
  const whatsapp = week.reduce((total, d) => total + (days[d.date]?.whatsapp || 0), 0);
  const phone = week.reduce((total, d) => total + (days[d.date]?.phone || 0), 0);
  const channelTotal = whatsapp + phone;
  const waPct = channelTotal ? Math.round((whatsapp / channelTotal) * 100) : 0;

  const nameById = Object.fromEntries(products.map((p) => [p.id, p.name]));
  const top = Object.entries(analytics.products || {})
    .map(([id, v]) => ({ name: nameById[id] || '(deleted item)', clicks: v.clicks || 0 }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 5);

  const maxVisits = Math.max(1, ...week.map((d) => d.visits));
  const stat = (value, label) => h('div', { class: 'stat' }, h('strong', {}, String(value)), h('span', {}, label));

  panel.replaceChildren(
    h('h2', {}, 'Analytics'),
    h('p', { class: 'muted' }, 'Counts of page visits and order-button taps. No personal visitor data is collected.'),
    h('div', { class: 'stats' },
      stat(visitsToday, 'Visits today'),
      stat(sum('visits'), 'Visits (7 days)'),
      stat(sum('orderClicks'), 'Order taps (7 days)')),
    h('div', { class: 'panel-row' },
      h('div', {}, h('h3', {}, 'Visits, last 7 days'),
        h('div', { class: 'chart7' }, week.map((d) =>
          h('div', { class: 'chart7__col' },
            h('div', { class: 'chart7__bar', style: { height: `${Math.round((d.visits / maxVisits) * 100)}%` }, title: `${d.date}: ${d.visits} visits` }),
            h('span', { class: 'chart7__label' }, d.date.slice(5)))))),
      h('div', {}, h('h3', {}, 'WhatsApp vs Phone (7 days)'),
        channelTotal
          ? h('div', {}, h('div', { class: 'split' }, h('div', { class: 'split__seg split__seg--wa', style: { width: `${waPct}%` } }), h('div', { class: 'split__seg split__seg--ph', style: { width: `${100 - waPct}%` } })), h('p', { class: 'muted' }, `${whatsapp} WhatsApp \u00b7 ${phone} Phone`))
          : h('p', { class: 'muted' }, 'No order button taps yet.'))),
    h('div', {}, h('h3', {}, 'Top flavours by taps'),
      top.length
        ? h('ol', { class: 'toplist' }, top.map((t, i) => h('li', {}, h('span', {}, `${i + 1}. ${t.name}`), h('strong', {}, `${t.clicks}`))))
        : h('p', { class: 'muted' }, 'No taps yet. Once customers tap a weight to order, their favourites will show up here.')));
}

// ---------- products and memories ----------

async function deleteCategory(name) {
  const affected = state.content.products.filter((p) => p.category === name);
  await Promise.all(affected.map((p) => api(`/products/${p.id}`, { method: 'PUT', body: { ...p, category: 'Uncategorized' } })));
  await loadContent();
}

const variantOptionsFor = (productId) => {
  const product = state.content.products.find((p) => p.id === productId);
  return (product?.variants || []).map((v) => findVariant(v)).filter(Boolean).map((v) => ({ value: v.value, label: v.label }));
};

async function openItemForm({ kind, fields, item, title }) {
  const defaults = { products: { available: true, featured: false }, offers: { active: true } };
  const values = item || defaults[kind] || {};
  const built = fields.map((def) => createField(def, values[def.key], {
    suggestions: categories(),
    productOptions: state.content.products,
    variantOptions: def.type === 'variantSelect' ? variantOptionsFor(values.productId) : undefined,
    onDeleteSuggestion: kind === 'products' && def.key === 'category' ? deleteCategory : undefined,
  }));

  if (kind === 'offers') {
    const productField = built.find((f) => f.def.key === 'productId');
    const variantField = built.find((f) => f.def.key === 'variantValue');
    if (productField && variantField) {
      productField.el.querySelector('select').addEventListener('change', (event) => {
        variantField.refresh(variantOptionsFor(event.target.value));
      });
    }
  }

  const formError = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const saveButton = h('button', { class: 'btn btn--primary', type: 'submit' }, 'Save');
  let saved = false;

  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'modal', 'aria-labelledby': 'itemTitle' },
      h('form', { class: 'modal__inner form', novalidate: true, onsubmit: async (event) => {
        event.preventDefault();
        saved = await submitFields(built, {
          button: saveButton,
          formError,
          save: (payload) => api(item ? `/${kind}/${item.id}` : `/${kind}`, { method: item ? 'PUT' : 'POST', body: payload }),
        });
        if (saved) dialog.close();
      } },
        h('h2', { id: 'itemTitle' }, title),
        formError,
        built.map((f) => f.el),
        h('div', { class: 'modal__actions' }, h('button', { class: 'btn', type: 'button', onclick: () => dialog.close() }, 'Cancel'), saveButton)));
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(saved);
    });
    document.body.append(dialog);
    dialog.showModal();
    built[0].focus();
  });
}

async function deleteItem(kind, item, label) {
  const name = item.name || item.title;
  const ok = await confirmAction({ title: `Delete “${name}”?`, message: `This removes the ${label} from your website. This cannot be undone.`, confirmLabel: `Delete ${label}` });
  if (!ok) return;
  try {
    await api(`/${kind}/${item.id}`, { method: 'DELETE' });
    await loadContent();
    toast(`Deleted “${name}”.`);
    route();
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function editItem(kind, fields, item, title, label) {
  if (await openItemForm({ kind, fields, item, title })) {
    await loadContent();
    toast(item ? `Saved changes to ${label}.` : `Added ${label}.`);
    route();
  }
}

const priceRange = (product, currency) => {
  const prices = (product.variants || [])
    .map((v) => findVariant(v))
    .filter(Boolean)
    .map((w) => variantPrice(product.pricePerUnit, w.grams));
  if (!prices.length) return '\u2014';
  const low = Math.min(...prices), high = Math.max(...prices);
  return low === high ? formatPrice(low, currency) : `${formatPrice(low, currency)}\u2013${formatPrice(high, currency)}`;
};

function renderProducts(view) {  const { products, settings } = state.content;
  const add = () => editItem('products', PRODUCT_FIELDS, null, 'Add ice cream', 'the ice cream');

  view.append(pageHead('Products', 'Your menu. Changes appear on the website as soon as you save.', h('button', { class: 'btn btn--primary', type: 'button', onclick: add }, 'Add ice cream')));
  if (!products.length) {
    view.append(h('div', { class: 'empty' }, h('p', {}, 'No ice creams yet. Add your first one to build the menu.'), h('button', { class: 'btn btn--primary', type: 'button', onclick: add }, 'Add ice cream')));
    return;
  }

  const rows = products.map((p) => {
    const toggle = h('input', { class: 'switch', type: 'checkbox', 'aria-label': `${p.name} is available to order` });
    toggle.checked = p.available;
    toggle.addEventListener('change', async () => {
      toggle.disabled = true;
      try {
        await api(`/products/${p.id}`, { method: 'PUT', body: { ...p, available: toggle.checked } });
        p.available = toggle.checked;
        toast(`${p.name} is now ${p.available ? 'available' : 'unavailable'}.`);
      } catch (error) {
        toggle.checked = p.available;
        toast(error.message, 'error');
      } finally {
        toggle.disabled = false;
      }
    });
    return h('tr', {},
      h('td', { 'data-label': 'Image' }, p.image ? h('img', { class: 'thumb', src: p.image, alt: '' }) : h('div', { class: 'thumb' })),
      h('td', { 'data-label': 'Name' }, h('div', {}, h('strong', {}, p.name), p.featured ? h('span', { class: 'badge' }, 'Featured') : null), h('div', { class: 'muted' }, p.category)),
      h('td', { 'data-label': 'Price' }, priceRange(p, settings.general.currency)),
      h('td', { 'data-label': 'Order' }, String(p.order)),
      h('td', { 'data-label': 'Available' }, toggle),
      h('td', { 'data-label': 'Actions' }, h('div', { class: 'row-actions' },
        h('button', { class: 'btn btn--sm', type: 'button', 'aria-label': `Edit ${p.name}`, onclick: () => editItem('products', PRODUCT_FIELDS, p, 'Edit ice cream', 'the ice cream') }, 'Edit'),
        h('button', { class: 'btn btn--sm link-danger', type: 'button', 'aria-label': `Delete ${p.name}`, onclick: () => deleteItem('products', p, 'ice cream') }, 'Delete'))));
  });
  view.append(h('table', { class: 'table' },
    h('caption', { class: 'sr-only' }, 'Ice creams'),
    h('thead', {}, h('tr', {}, ['Image', 'Name', 'Price', 'Order', 'Available', 'Actions'].map((t) => h('th', { scope: 'col' }, t)))),
    h('tbody', {}, rows)));
}

function renderMemories(view) {
  const { memories } = state.content;
  const add = () => editItem('memories', MEMORY_FIELDS, null, 'Add memory', 'the memory');

  view.append(pageHead('Memories', 'Photos and stories shown in the memories gallery.', h('button', { class: 'btn btn--primary', type: 'button', onclick: add }, 'Add memory')));
  if (!memories.length) {
    view.append(h('div', { class: 'empty' }, h('p', {}, 'No memories yet. The memories section stays hidden until you add one.'), h('button', { class: 'btn btn--primary', type: 'button', onclick: add }, 'Add memory')));
    return;
  }
  view.append(h('div', { class: 'cards' }, memories.map((m) =>
    h('article', { class: 'mcard' },
      h('img', { src: m.image, alt: '', loading: 'lazy' }),
      h('div', { class: 'mcard__body' },
        h('strong', {}, m.title),
        m.description ? h('p', { class: 'muted' }, m.description) : null,
        h('p', { class: 'muted' }, `Display order: ${m.order}`),
        h('div', { class: 'row-actions' },
          h('button', { class: 'btn btn--sm', type: 'button', 'aria-label': `Edit ${m.title}`, onclick: () => editItem('memories', MEMORY_FIELDS, m, 'Edit memory', 'the memory') }, 'Edit'),
          h('button', { class: 'btn btn--sm link-danger', type: 'button', 'aria-label': `Delete ${m.title}`, onclick: () => deleteItem('memories', m, 'memory') }, 'Delete')))))));
}

function renderOffers(view) {
  const { offers } = state.content;
  const add = () => editItem('offers', OFFER_FIELDS, null, 'Add offer', 'the offer');

  view.append(pageHead('Offers', 'Promotions shown on the website. Only active offers within their dates are shown to visitors.', h('button', { class: 'btn btn--primary', type: 'button', onclick: add }, 'Add offer')));
  if (!offers.length) {
    view.append(h('div', { class: 'empty' }, h('p', {}, 'No offers yet. Add one to show a promotion banner on the website.'), h('button', { class: 'btn btn--primary', type: 'button', onclick: add }, 'Add offer')));
    return;
  }

  const rows = offers.map((o) => {
    const toggle = h('input', { class: 'switch', type: 'checkbox', 'aria-label': `${o.title} is active` });
    toggle.checked = o.active;
    toggle.addEventListener('change', async () => {
      toggle.disabled = true;
      try {
        await api(`/offers/${o.id}`, { method: 'PUT', body: { ...o, active: toggle.checked } });
        o.active = toggle.checked;
        toast(`${o.title} is now ${o.active ? 'active' : 'inactive'}.`);
      } catch (error) {
        toggle.checked = o.active;
        toast(error.message, 'error');
      } finally {
        toggle.disabled = false;
      }
    });
    const dates = [o.startDate, o.endDate].filter(Boolean).join(' \u2192 ') || 'No date limit';
    const live = isOfferLive(o);
    return h('tr', {},
      h('td', { 'data-label': 'Offer' }, h('div', {}, h('strong', {}, o.title), live ? h('span', { class: 'badge' }, 'Live now') : null), h('div', { class: 'muted' }, o.discount)),
      h('td', { 'data-label': 'Code' }, o.code || '\u2014'),
      h('td', { 'data-label': 'Dates' }, dates),
      h('td', { 'data-label': 'Active' }, toggle),
      h('td', { 'data-label': 'Actions' }, h('div', { class: 'row-actions' },
        h('button', { class: 'btn btn--sm', type: 'button', 'aria-label': `Edit ${o.title}`, onclick: () => editItem('offers', OFFER_FIELDS, o, 'Edit offer', 'the offer') }, 'Edit'),
        h('button', { class: 'btn btn--sm link-danger', type: 'button', 'aria-label': `Delete ${o.title}`, onclick: () => deleteItem('offers', o, 'offer') }, 'Delete'))));
  });

  view.append(h('table', { class: 'table' },
    h('caption', { class: 'sr-only' }, 'Offers'),
    h('thead', {}, h('tr', {}, ['Offer', 'Code', 'Dates', 'Active', 'Actions'].map((t) => h('th', { scope: 'col' }, t)))),
    h('tbody', {}, rows)));
}

// ---------- settings pages ----------

function renderSettings(view, page) {
  const built = [];
  const formError = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const saveButton = h('button', { class: 'btn btn--primary', type: 'submit' }, 'Save changes');

  const groups = page.groups.map((group) => {
    const fields = group.fields.map((def) => {
      const field = createField(def, state.content.settings[group.id]?.[def.key]);
      field.path = `${group.id}.${def.key}`;
      built.push(field);
      return field;
    });
    return h('fieldset', { class: 'group' }, h('legend', {}, group.title), fields.map((f) => f.el));
  });

  view.append(
    pageHead(page.title, page.intro),
    h('form', { novalidate: true, onsubmit: async (event) => {
      event.preventDefault();
      const ok = await submitFields(built, {
        button: saveButton,
        formError,
        save: async (values) => {
          const payload = {};
          for (const [path, value] of Object.entries(values)) {
            const [group, key] = path.split('.');
            (payload[group] ??= {})[key] = value;
          }
          const result = await api('/settings', { method: 'PUT', body: payload });
          state.content.settings = result.settings;
        },
      });
      if (ok) {
        toast('Settings saved. They are live on the website now.');
        route();
      }
    } }, formError, groups, h('div', { class: 'savebar' }, saveButton)));
}

const ACCOUNT_FIELDS = [
  { key: 'email', label: 'Admin email', type: 'email', max: 200, required: true },
  { key: 'currentPassword', label: 'Current password', type: 'password', max: 200, required: true, help: 'Required to confirm any change.' },
  { key: 'newPassword', label: 'New password', type: 'password', max: 200, min: 8, help: 'Leave empty to keep your current password. At least 8 characters.' },
];

function renderAccount(view) {
  const built = ACCOUNT_FIELDS.map((def) => {
    const value = def.key === 'email' ? state.email : '';
    const field = createField(def, value);
    field.path = def.key;
    return field;
  });
  const formError = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const saveButton = h('button', { class: 'btn btn--primary', type: 'submit' }, 'Update login');

  view.append(
    pageHead('Admin login', 'Change the email and password used to sign in to this admin panel.'),
    h('form', { novalidate: true, onsubmit: async (event) => {
      event.preventDefault();
      const ok = await submitFields(built, {
        button: saveButton,
        formError,
        save: async (values) => {
          const result = await api('/auth/credentials', { method: 'PUT', body: values });
          state.email = result.email;
        },
      });
      if (ok) {
        toast('Admin login updated.');
        built.find((f) => f.path === 'currentPassword').el.querySelector('input').value = '';
        built.find((f) => f.path === 'newPassword').el.querySelector('input').value = '';
      }
    } }, formError, built.map((f) => f.el), h('div', { class: 'savebar' }, saveButton)));
}

// ---------- start ----------

window.addEventListener('hashchange', route);
window.addEventListener('session-expired', () => showLogin('Your session expired. Sign in again.'));

(async function init() {
  try {
    const me = await api('/auth/me');
    state.email = me.email;
    await loadContent();
    showShell();
  } catch (error) {
    if (error.status === 401) showLogin();
    else app.replaceChildren(h('p', { class: 'boot-note' }, error.message));
  }
})();
