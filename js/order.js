import { h, fillTokens, formatPrice, telHref, trackEvent, whatsappHref } from './utils.js';
import { variantPrice } from './schema.js';

let settings = null;

export const setOrderSettings = (next) => {
  settings = next;
};

const tokens = () => ({ brandName: settings.general.brandName, chefName: settings.general.chefName });

/** The WhatsApp text: the configured default message plus the chosen ice cream and weight. */
export function buildMessage(product, variant) {
  const base = fillTokens(settings.contact.whatsappMessage, tokens());
  if (!product) return base;
  const price = formatPrice(variant ? variantPrice(product.pricePerUnit, variant.grams) : product.pricePerUnit, settings.general.currency);
  const weight = variant ? ` (${variant.label})` : '';
  return `${base}\n\n${product.name}${weight} - ${price}`;
}

/** The two ordering links. They are real anchors, so no browser pop-up blocker can interfere. */
export function orderButtons(product, variant, { className = '' } = {}) {
  const extra = product ? { productId: product.id } : {};
  return [
    h('a', { class: `btn btn--wa ${className}`, href: whatsappHref(settings.contact.whatsapp, buildMessage(product, variant)), target: '_blank', rel: 'noopener noreferrer', onclick: () => trackEvent('order_whatsapp', extra) }, 'Order via WhatsApp'),
    h('a', { class: `btn btn--phone ${className}`, href: telHref(settings.contact.phone), onclick: () => trackEvent('order_phone', extra) }, 'Order via Phone'),
  ];
}

/** Opens the ordering dialog, for one ice cream and weight, or (with no product) for a general order. */
export function openOrderDialog(product, variant) {
  const dialog = document.getElementById('orderDialog');
  const title = product ? `Order ${product.name}${variant ? ` \u2014 ${variant.label}` : ''}` : `Order from ${settings.general.brandName}`;
  const close = () => dialog.close();

  dialog.replaceChildren(
    h('div', { class: 'dialog__head' },
      h('h2', { class: 'dialog__title', id: 'orderDialogTitle' }, title),
      h('button', { class: 'dialog__close', type: 'button', 'aria-label': 'Close', onclick: close }, '\u00d7')),
    product && variant ? h('p', { class: 'dialog__price' }, formatPrice(variantPrice(product.pricePerUnit, variant.grams), settings.general.currency)) : null,
    h('p', { class: 'dialog__label' }, 'Your WhatsApp message'),
    h('p', { class: 'dialog__message' }, buildMessage(product, variant)),
    h('div', { class: 'dialog__actions' }, orderButtons(product, variant)),
  );
  dialog.setAttribute('aria-labelledby', 'orderDialogTitle');
  dialog.showModal();
}

export function initOrderDialog() {
  const dialog = document.getElementById('orderDialog');
  // A click on the dimmed backdrop (the dialog element itself) closes it.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}
