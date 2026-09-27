import { api, h, fillTokens, formatPrice, telHref, trackEvent } from './utils.js';
import { findVariant, isOfferLive, variantPrice } from './schema.js';
import { initMotion, observeReveals } from './motion.js';
import { initOrderDialog, openOrderDialog, orderButtons, setOrderSettings } from './order.js';

const $ = (selector) => document.querySelector(selector);
const valueAt = (object, path) => path.split('.').reduce((node, key) => node?.[key], object);
const TONES = ['mango', 'berry', 'pista', 'lilac'];
const BADGE_SHAPES = ['circle', 'star', 'squircle', 'flower'];

let text = (value) => value;
let currency = '';

async function start() {
  initOrderDialog();
  initNavigation();
  try {
    render(await api('/content'));
    initMotion();
    finishBoot();
    trackEvent('view');
  } catch (error) {
    showBootError(error);
  }
}

// ---------- loading screen ----------

function finishBoot() {
  const boot = $('#boot');
  document.body.classList.add('is-ready');
  boot.classList.add('is-done');
  boot.addEventListener('transitionend', () => boot.remove(), { once: true });
  setTimeout(() => boot.remove(), 800);
}

function showBootError(error) {
  const boot = $('#boot');
  boot.classList.add('has-error');
  $('#bootMessage').textContent = error.message || 'Something went wrong while loading.';
  $('#bootRetry').onclick = () => location.reload();
}

// ---------- rendering ----------

function render({ settings, products, memories, offers }) {
  const tokens = { brandName: settings.general.brandName, chefName: settings.general.chefName };
  text = (value) => fillTokens(value, tokens);
  setOrderSettings(settings);
  currency = settings.general.currency;

  document.title = text(settings.general.siteTitle);
  document.querySelector('meta[name="description"]').setAttribute('content', text(settings.general.siteDescription));

  for (const element of document.querySelectorAll('[data-bind]')) {
    const value = text(valueAt(settings, element.dataset.bind));
    element.textContent = value;
    element.hidden = !value;
  }
  for (const element of document.querySelectorAll('[data-brand]')) element.textContent = tokens.brandName;

  const liveOffers = offers.filter((offer) => isOfferLive(offer));
  renderHero(settings, tokens);
  renderOffers(liveOffers);
  renderStory(settings);
  renderFeatured(products, liveOffers);
  renderMenu(products, liveOffers);
  renderMemories(memories);
  renderWhy(settings);
  renderOrder(settings);
  renderContact(settings);
  renderFooter(settings, tokens);
  syncSectionsAndNav();
}

function renderHero(settings, tokens) {
  const art = $('#chef');
  const chef = $('#chefArt');
  if (settings.hero.image) {
    art.classList.add('chef--photo');
    chef.replaceWith(h('img', { class: 'chef__photo', id: 'chefArt', src: settings.hero.image, alt: text(settings.hero.imageAlt), width: 640, height: 640, fetchpriority: 'high' }));
  } else {
    chef.setAttribute('aria-label', `${tokens.chefName}, the chef, holding an ice cream cone and waving`);
  }
  $('#heroCtas').replaceChildren(...orderButtons(null, null));
}

function renderOffers(live) {
  $('#offers').dataset.empty = String(live.length === 0);
  $('#offersList').replaceChildren(...live.map((offer, index) =>
    h('li', { class: 'offer', 'data-reveal': '', style: { '--i': index } },
      offer.image ? h('div', { class: 'offer__media' }, h('img', { src: offer.image, alt: '', loading: 'lazy' })) : null,
      h('div', { class: 'offer__body' },
        h('span', { class: 'offer__badge' }, text(offer.discount)),
        h('h3', {}, text(offer.title)),
        offer.description ? h('p', {}, text(offer.description)) : null,
        offer.code ? h('p', { class: 'offer__code' }, 'Mention code ', h('strong', {}, offer.code)) : null))));
}

function renderStory(settings) {
  const paragraphs = text(settings.about.body).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  $('#storyBody').replaceChildren(...paragraphs.map((p) => h('p', {}, p)));
}

function productCard(product, index, offers, { animate = true, feature = false } = {}) {
  const placeholder = () => h('div', { class: 'card__placeholder', 'aria-hidden': 'true' });
  const picture = product.image ? h('img', { src: product.image, alt: product.name, width: 400, height: 400, loading: 'lazy', decoding: 'async' }) : placeholder();
  if (product.image) picture.addEventListener('error', () => picture.replaceWith(placeholder()), { once: true });

  const productOffers = offers.filter((o) => o.productId === product.id);
  const cardOffer = productOffers.find((o) => !o.variantValue) || productOffers[0];

  const variants = (product.variants || [])
    .map((v) => findVariant(v))
    .filter(Boolean)
    .map((w) => ({ ...w, price: variantPrice(product.pricePerUnit, w.grams), offer: productOffers.find((o) => o.variantValue === w.value) }));

  const classes = ['card', `tone-${TONES[index % TONES.length]}`, feature && 'card--feature', !product.available && 'is-unavailable'].filter(Boolean).join(' ');
  return h('li', { class: classes, 'data-reveal': animate ? '' : null, style: { '--i': index % 6 } },
    h('div', { class: 'card__media' }, picture,
      product.available ? null : h('span', { class: 'card__badge' }, 'Unavailable'),
      cardOffer ? h('span', { class: 'card__badge card__badge--offer' }, text(cardOffer.discount)) : null),
    h('div', { class: 'card__body' },
      h('h3', { class: 'card__name' }, product.name),
      product.description ? h('p', { class: 'card__desc' }, product.description) : null,
      h('ul', { class: 'variants' }, variants.map((v) =>
        h('li', {},
          h('button', {
            class: 'variant', type: 'button', disabled: !product.available,
            'aria-label': product.available ? `Order ${product.name}, ${v.label}, ${formatPrice(v.price, currency)}${v.offer ? `, ${v.offer.discount}` : ''}` : `${product.name}, ${v.label} is unavailable`,
            onclick: () => { trackEvent('order_click', { productId: product.id, variant: v.value }); openOrderDialog(product, v); },
          },
            h('span', { class: 'variant__w' }, v.label, v.offer ? h('span', { class: 'variant__tag' }, text(v.offer.discount)) : null),
            h('span', { class: 'variant__p' }, formatPrice(v.price, currency)))))),
    ),
  );
}

function renderFeatured(products, offers) {
  const featured = products.filter((p) => p.featured);
  $('#featuredList').replaceChildren(...featured.map((p, i) => productCard(p, i, offers, { feature: true })));
  $('#featured').dataset.empty = String(featured.length === 0);
}

function renderMenu(products, offers) {
  const list = $('#menuList');
  const chips = $('#menuChips');
  const categories = [...new Set(products.map((p) => p.category))];
  let active = 'All';

  const draw = (animate) => {
    const shown = active === 'All' ? products : products.filter((p) => p.category === active);
    list.replaceChildren(...shown.map((p, i) => productCard(p, i, offers, { animate })));
    if (animate) observeReveals(list);
    $('#menuEmpty').hidden = products.length > 0;
  };
  const drawChips = () => {
    chips.replaceChildren(...['All', ...categories].map((name) =>
      h('button', { class: 'chip', type: 'button', 'aria-pressed': String(name === active), onclick: () => { active = name; drawChips(); draw(false); } }, name)));
  };

  chips.hidden = categories.length < 2;
  drawChips();
  draw(true);
}

function renderMemories(memories) {
  $('#memoriesList').replaceChildren(...memories.map((memory, index) =>
    h('li', { class: 'memory', 'data-reveal': '', style: { '--i': index % 4 } },
      h('div', { class: 'memory__frame' },
        h('img', { src: memory.image, alt: memory.title, loading: 'lazy', decoding: 'async' })),
      h('div', { class: 'memory__text' },
        h('h3', {}, memory.title),
        memory.description ? h('p', {}, memory.description) : null))));
  $('#memories').dataset.empty = String(memories.length === 0);
}

function renderWhy(settings) {
  $('#whyList').replaceChildren(...settings.why.items.map((item, index) =>
    h('li', { class: `why__item tone-${TONES[(index + 1) % TONES.length]}`, 'data-reveal': '', style: { '--i': index } },
      h('span', { class: `badge badge--${BADGE_SHAPES[index % BADGE_SHAPES.length]}`, 'aria-hidden': 'true' }),
      h('h3', {}, text(item.title)),
      item.text ? h('p', {}, text(item.text)) : null)));
}

function renderOrder(settings) {
  $('#orderSteps').replaceChildren(...settings.order.steps.map((step, index) =>
    h('li', { class: 'step', 'data-reveal': '', style: { '--i': index } },
      h('h3', {}, text(step.title)),
      step.text ? h('p', {}, text(step.text)) : null)));
  $('#orderButtons').replaceChildren(...orderButtons(null, null, { className: 'btn--lg' }));
}

function socialLinks(settings) {
  const { instagram, facebook, youtube, others } = settings.social;
  return [['Instagram', instagram], ['Facebook', facebook], ['YouTube', youtube], ...others.map((o) => [o.label, o.url])].filter(([, url]) => url);
}

function renderContact(settings) {
  const { phone, whatsapp, email, address, hours, mapUrl } = settings.contact;
  const card = (label, content) => h('li', { class: 'contact__card', 'data-reveal': '' }, h('h3', {}, label), content);

  $('#contactList').replaceChildren(...[
    card('Phone', h('a', { href: telHref(phone) }, phone)),
    card('WhatsApp', h('a', { href: `https://wa.me/${String(whatsapp).replace(/\D/g, '')}`, target: '_blank', rel: 'noopener noreferrer' }, whatsapp)),
    email ? card('Email', h('a', { href: `mailto:${email}` }, email)) : null,
    address || mapUrl ? card('Location', [
      address ? h('p', {}, address) : null,
      mapUrl ? h('a', { href: mapUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Get directions') : null,
    ]) : null,
    hours ? card('Opening hours', h('p', {}, hours)) : null,
  ].filter(Boolean));

  const socials = socialLinks(settings);
  $('#contactSocial').replaceChildren(...socials.map(([label, url]) => h('a', { class: 'pill', href: url, target: '_blank', rel: 'noopener noreferrer' }, label)));
  $('#contactSocial').hidden = socials.length === 0;
}

function renderFooter(settings, tokens) {
  const socials = socialLinks(settings);
  $('#footerSocial').replaceChildren(...socials.map(([label, url]) => h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, label)));
  $('#footerSocial').hidden = socials.length === 0;
  $('#footerCopy').textContent = `\u00a9 ${new Date().getFullYear()} ${tokens.brandName}`;
}

// ---------- navigation and section transitions ----------

/** Hides empty sections (and their menu links) so the layout never shows a gap. */
function syncSectionsAndNav() {
  const sections = [...document.querySelectorAll('main > .s, footer.s')];
  for (const section of sections) section.hidden = section.dataset.empty === 'true';
  for (const link of document.querySelectorAll('[data-nav]')) link.hidden = $(`#${link.dataset.nav}`).hidden;
}

function initNavigation() {
  const nav = $('#nav');
  const burger = $('#burger');
  const setOpen = (open) => {
    nav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
  };
  burger.addEventListener('click', () => setOpen(burger.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', (event) => event.target.closest('a') && setOpen(false));
  document.addEventListener('keydown', (event) => event.key === 'Escape' && setOpen(false));
  $('#navOrder').addEventListener('click', () => openOrderDialog(null));
}

start();
