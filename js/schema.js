/**
 * Single source of truth for everything an admin can edit.
 *
 * The admin panel builds its forms from these definitions and the API
 * validates every write against the very same definitions, so the two
 * can never drift apart. This file is plain ES module code with no
 * DOM or Node dependencies, so it runs in the browser and on the server.
 */

const TOKEN_HELP = 'You can use {brandName} and {chefName}.';

export const SETTINGS_PAGES = [
  {
    id: 'website',
    title: 'Website settings',
    intro: 'Brand, hero, story and the text shown on each section of the homepage.',
    groups: [
      {
        id: 'general',
        title: 'General',
        fields: [
          { key: 'brandName', label: 'Brand name', type: 'text', max: 60, required: true },
          { key: 'chefName', label: 'Chef name', type: 'text', max: 60, required: true },
          { key: 'siteTitle', label: 'Website title', type: 'text', max: 120, required: true, help: `Shown in the browser tab and search results. ${TOKEN_HELP}` },
          { key: 'siteDescription', label: 'Website description', type: 'longtext', max: 300, rows: 3, help: `Shown under the title in search results. ${TOKEN_HELP}` },
          { key: 'currency', label: 'Currency symbol', type: 'text', max: 4, required: true, help: 'Shown before every price, for example ₹.' },
        ],
      },
      {
        id: 'hero',
        title: 'Hero',
        fields: [
          { key: 'title', label: 'Hero title', type: 'text', max: 80, required: true, help: TOKEN_HELP },
          { key: 'subtitle', label: 'Hero subtitle', type: 'text', max: 80, help: TOKEN_HELP },
          { key: 'description', label: 'Hero description', type: 'longtext', max: 300, rows: 3, help: TOKEN_HELP },
          { key: 'image', label: 'Hero image', type: 'image', help: 'Optional. Leave empty to show the animated chef illustration.' },
          { key: 'imageAlt', label: 'Hero image description', type: 'text', max: 140, help: 'Describes the hero image for people using screen readers.' },
        ],
      },
      {
        id: 'about',
        title: 'About / story',
        fields: [
          { key: 'title', label: 'Story title', type: 'text', max: 80, required: true },
          { key: 'body', label: 'Story text', type: 'longtext', max: 1500, rows: 8, help: `Separate paragraphs with a blank line. ${TOKEN_HELP}` },
        ],
      },
      {
        id: 'why',
        title: 'Why choose us',
        fields: [
          { key: 'title', label: 'Section title', type: 'text', max: 80, required: true },
          {
            key: 'items',
            label: 'Reasons',
            type: 'repeater',
            maxItems: 6,
            addLabel: 'Add reason',
            itemLabel: 'Reason',
            fields: [
              { key: 'title', label: 'Title', type: 'text', max: 60, required: true },
              { key: 'text', label: 'Text', type: 'longtext', max: 200, rows: 2 },
            ],
          },
        ],
      },
      {
        id: 'order',
        title: 'How ordering works',
        fields: [
          {
            key: 'steps',
            label: 'Steps',
            type: 'repeater',
            maxItems: 5,
            addLabel: 'Add step',
            itemLabel: 'Step',
            fields: [
              { key: 'title', label: 'Title', type: 'text', max: 60, required: true },
              { key: 'text', label: 'Text', type: 'longtext', max: 200, rows: 2 },
            ],
          },
        ],
      },
      {
        id: 'sections',
        title: 'Section headings',
        fields: [
          { key: 'featuredTitle', label: 'Featured: title', type: 'text', max: 80 },
          { key: 'featuredSubtitle', label: 'Featured: subtitle', type: 'text', max: 160 },
          { key: 'menuTitle', label: 'Menu: title', type: 'text', max: 80 },
          { key: 'menuSubtitle', label: 'Menu: subtitle', type: 'text', max: 160 },
          { key: 'memoriesTitle', label: 'Memories: title', type: 'text', max: 80 },
          { key: 'memoriesSubtitle', label: 'Memories: subtitle', type: 'text', max: 160 },
          { key: 'orderTitle', label: 'Ordering: title', type: 'text', max: 80 },
          { key: 'orderSubtitle', label: 'Ordering: subtitle', type: 'text', max: 160 },
          { key: 'contactTitle', label: 'Contact: title', type: 'text', max: 80 },
          { key: 'contactSubtitle', label: 'Contact: subtitle', type: 'text', max: 160 },
        ],
      },
      {
        id: 'footer',
        title: 'Footer',
        fields: [
          { key: 'tagline', label: 'Footer tagline', type: 'text', max: 120, help: TOKEN_HELP },
          { key: 'note', label: 'Footer note', type: 'text', max: 160, help: TOKEN_HELP },
        ],
      },
    ],
  },
  {
    id: 'contact',
    title: 'Contact & ordering',
    intro: 'Where customers reach you. The phone and WhatsApp buttons across the site use these values.',
    groups: [
      {
        id: 'contact',
        title: 'Contact and ordering',
        fields: [
          { key: 'phone', label: 'Phone number', type: 'phone', required: true, help: 'Include the country code, for example +91 98765 43210.' },
          { key: 'whatsapp', label: 'WhatsApp number', type: 'whatsapp', required: true, help: 'Include the country code, for example 91 98765 43210.' },
          { key: 'whatsappMessage', label: 'Default WhatsApp message', type: 'longtext', max: 400, rows: 3, required: true, help: `The chosen ice cream and its price are added below this message. ${TOKEN_HELP}` },
          { key: 'email', label: 'Email', type: 'email' },
          { key: 'address', label: 'Address', type: 'longtext', max: 240, rows: 2 },
          { key: 'mapUrl', label: 'Location link (Google Maps)', type: 'url', placeholder: 'https://maps.app.goo.gl/…', help: 'Open your place in Google Maps, tap Share, and paste the link here. Customers get a Get directions button.' },
          { key: 'hours', label: 'Opening hours', type: 'text', max: 120 },
        ],
      },
    ],
  },
  {
    id: 'social',
    title: 'Social links',
    intro: 'Links shown in the contact section and footer. Empty links are hidden.',
    groups: [
      {
        id: 'social',
        title: 'Social profiles',
        fields: [
          { key: 'instagram', label: 'Instagram', type: 'url', placeholder: 'https://instagram.com/…' },
          { key: 'facebook', label: 'Facebook', type: 'url', placeholder: 'https://facebook.com/…' },
          { key: 'youtube', label: 'YouTube', type: 'url', placeholder: 'https://youtube.com/…' },
          {
            key: 'others',
            label: 'Other links',
            type: 'repeater',
            maxItems: 6,
            addLabel: 'Add link',
            itemLabel: 'Link',
            fields: [
              { key: 'label', label: 'Name', type: 'text', max: 40, required: true },
              { key: 'url', label: 'Web address', type: 'url', required: true },
            ],
          },
        ],
      },
    ],
  },
];

export const WEIGHT_VARIANTS = [
  { value: '250ml', label: '250 ml', grams: 250 },
  { value: '500ml', label: '500 ml', grams: 500 },
  { value: '1l', label: '1 L', grams: 1000 },
  { value: '2l', label: '2 L', grams: 2000 },
  { value: '3l', label: '3 L', grams: 3000 },
  { value: '4l', label: '4 L', grams: 4000 },
  { value: '5l', label: '5 L', grams: 5000 },
  { value: '6l', label: '6 L', grams: 6000 },
  { value: '7l', label: '7 L', grams: 7000 },
  { value: '8l', label: '8 L', grams: 8000 },
  { value: '9l', label: '9 L', grams: 9000 },
  { value: '10l', label: '10 L', grams: 10000 },
];

/** Looks up a variant by its stored value. */
export function findVariant(value) {
  return WEIGHT_VARIANTS.find((w) => w.value === value);
}

/** The price of one weight option, calculated from the price per 100 ml. */
export function variantPrice(pricePerUnit, grams) {
  return Math.round(((Number(pricePerUnit) || 0) * grams) / 100 * 100) / 100;
}

export const PRODUCT_FIELDS = [
  { key: 'name', label: 'Name', type: 'text', max: 80, required: true },
  { key: 'description', label: 'Description', type: 'longtext', max: 300, rows: 3 },
  { key: 'pricePerUnit', label: 'Price per 100 ml', type: 'number', min: 0, max: 100000, step: '0.01', required: true, help: 'The price for each weight below is worked out from this automatically.' },
  { key: 'variants', label: 'Weight options', type: 'checkboxGroup', options: WEIGHT_VARIANTS, required: true, help: 'Pick which weights customers can order. Each price is calculated for you.' },
  { key: 'category', label: 'Category', type: 'text', max: 40, required: true, suggestions: true, help: 'Choose an existing category, or select "Add new…" to type one.' },
  { key: 'image', label: 'Image', type: 'image' },
  { key: 'available', label: 'Available to order', type: 'checkbox' },
  { key: 'featured', label: 'Show in featured', type: 'checkbox' },
  { key: 'order', label: 'Display order', type: 'number', min: 0, max: 100000, integer: true, help: 'Lower numbers appear first. Leave empty to add at the end.' },
];

export const MEMORY_FIELDS = [
  { key: 'title', label: 'Title', type: 'text', max: 80, required: true },
  { key: 'description', label: 'Description', type: 'longtext', max: 500, rows: 3 },
  { key: 'image', label: 'Image', type: 'image', required: true },
  { key: 'order', label: 'Display order', type: 'number', min: 0, max: 100000, integer: true, help: 'Lower numbers appear first. Leave empty to add at the end.' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[\d\s\-().]+$/;
const IMAGE_RE = /^(\/api\/media\/[\w-]+|\/assets\/[\w\-./]+|https:\/\/\S+)$/;

const isEmpty = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
const digitsOf = (v) => String(v).replace(/\D/g, '');

/** Validates one value against a field definition. Returns { value } or { error }. */
export function validateField(field, raw) {
  const { label, type } = field;

  switch (type) {
    case 'text':
    case 'longtext':
    case 'email':
    case 'phone':
    case 'whatsapp':
    case 'url':
    case 'image':
    case 'password':
    case 'productSelect':
    case 'variantSelect': {
      const text = type === 'password' ? String(raw ?? '') : (isEmpty(raw) ? '' : String(raw).trim());
      if (!text) return field.required ? { error: `${label} is required.` } : { value: '' };
      const max = field.max || (type === 'url' || type === 'image' ? 500 : (type === 'productSelect' || type === 'variantSelect') ? 40 : 200);
      if (text.length > max) return { error: `${label} must be ${max} characters or fewer.` };
      if (type === 'password' && field.min && text.length < field.min) return { error: `${label} must be at least ${field.min} characters.` };
      if (type === 'email' && !EMAIL_RE.test(text)) return { error: `${label} must be a valid email address.` };
      if (type === 'phone') {
        const n = digitsOf(text).length;
        if (!PHONE_RE.test(text) || n < 7 || n > 15) return { error: `${label} must be a valid phone number with 7 to 15 digits.` };
      }
      if (type === 'whatsapp') {
        const digits = digitsOf(text);
        if (!PHONE_RE.test(text) || digits.length < 8 || digits.length > 15 || digits.startsWith('0')) {
          return { error: `${label} must include the country code, for example 91 98765 43210.` };
        }
      }
      if (type === 'url') {
        try {
          if (!/^https?:$/.test(new URL(text).protocol)) throw new Error('protocol');
        } catch {
          return { error: `${label} must be a full web address starting with https://` };
        }
      }
      if (type === 'image' && !IMAGE_RE.test(text)) return { error: `${label} must be an uploaded image.` };
      return { value: text };
    }

    case 'number': {
      if (isEmpty(raw)) return field.required ? { error: `${label} is required.` } : { value: null };
      const n = Number(raw);
      if (!Number.isFinite(n)) return { error: `${label} must be a number.` };
      if (field.integer && !Number.isInteger(n)) return { error: `${label} must be a whole number.` };
      if (field.min !== undefined && n < field.min) return { error: `${label} must be ${field.min} or more.` };
      if (field.max !== undefined && n > field.max) return { error: `${label} must be ${field.max} or less.` };
      return { value: field.integer ? n : Math.round(n * 100) / 100 };
    }

    case 'checkbox':
      return { value: raw === true || raw === 'true' || raw === 'on' };

    case 'date': {
      const text = isEmpty(raw) ? '' : String(raw).trim();
      if (!text) return field.required ? { error: `${label} is required.` } : { value: '' };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text))) return { error: `${label} must be a valid date.` };
      return { value: text };
    }

    case 'checkboxGroup': {
      const allowed = new Set((field.options || []).map((o) => o.value));
      const chosen = Array.isArray(raw) ? raw.filter((v) => allowed.has(v)) : [];
      if (field.required && chosen.length === 0) return { error: `Select at least one option for ${label}.` };
      // Keep the canonical option order, regardless of the order checkboxes were ticked.
      return { value: field.options.filter((o) => chosen.includes(o.value)).map((o) => o.value) };
    }

    case 'repeater': {
      const rows = Array.isArray(raw) ? raw : [];
      const cleaned = [];
      for (const [i, row] of rows.entries()) {
        const blank = field.fields.every((sub) => isEmpty(row?.[sub.key]));
        if (blank) continue;
        const item = {};
        for (const sub of field.fields) {
          const r = validateField(sub, row?.[sub.key]);
          if (r.error) return { error: `${field.itemLabel || 'Item'} ${i + 1}: ${r.error}` };
          item[sub.key] = r.value;
        }
        cleaned.push(item);
      }
      if (field.maxItems && cleaned.length > field.maxItems) return { error: `${label}: add at most ${field.maxItems}.` };
      return { value: cleaned };
    }

    default:
      return { error: `${label} has an unsupported type.` };
  }
}

/** Validates a flat object (a product or a memory). Returns { value, errors }. */
export function validateObject(fields, input) {
  const value = {};
  const errors = {};
  for (const field of fields) {
    const result = validateField(field, input?.[field.key]);
    if (result.error) errors[field.key] = result.error;
    else value[field.key] = result.value;
  }
  return { value, errors: Object.keys(errors).length ? errors : null };
}

/** Whether an offer should currently be shown: active, and today falls within its date range (if set). */
export function isOfferLive(offer, today = new Date().toISOString().slice(0, 10)) {
  if (!offer.active) return false;
  if (offer.startDate && today < offer.startDate) return false;
  if (offer.endDate && today > offer.endDate) return false;
  return true;
}

export const validateProduct = (input) => validateObject(PRODUCT_FIELDS, input);
export const OFFER_FIELDS = [
  { key: 'title', label: 'Title', type: 'text', max: 80, required: true },
  { key: 'discount', label: 'Discount badge', type: 'text', max: 30, required: true, help: 'Short text shown on the badge, e.g. "20% off" or "Buy 1 Get 1".' },
  { key: 'description', label: 'Description', type: 'longtext', max: 300, rows: 3 },
  { key: 'productId', label: 'Applies to', type: 'productSelect', help: 'Optional. Pick a menu item this offer is for. Leave empty for a general offer.' },
  { key: 'variantValue', label: 'Weight / volume', type: 'variantSelect', help: 'Optional. Limit the offer to one weight or volume option of the item above.' },
  { key: 'code', label: 'Code to mention', type: 'text', max: 30, help: 'Optional. Shown to customers to mention when ordering. Leave empty if there is no code.' },
  { key: 'image', label: 'Image', type: 'image' },
  { key: 'startDate', label: 'Starts on', type: 'date', help: 'Leave empty to start immediately.' },
  { key: 'endDate', label: 'Ends on', type: 'date', help: 'Leave empty to run with no end date.' },
  { key: 'active', label: 'Active', type: 'checkbox', help: 'Turn off to hide this offer without deleting it.' },
  { key: 'order', label: 'Display order', type: 'number', min: 0, max: 100000, integer: true, help: 'Lower numbers appear first. Leave empty to add at the end.' },
];

export const validateMemory = (input) => validateObject(MEMORY_FIELDS, input);
export const validateOffer = (input) => validateObject(OFFER_FIELDS, input);

/**
 * Validates a (possibly partial) settings update and merges it into the
 * current settings. Groups or fields that are absent keep their current value.
 */
export function validateSettings(input, current) {
  const value = structuredClone(current || {});
  const errors = {};
  for (const page of SETTINGS_PAGES) {
    for (const group of page.groups) {
      const source = input?.[group.id];
      if (!source || typeof source !== 'object') continue;
      value[group.id] ??= {};
      for (const field of group.fields) {
        if (!(field.key in source)) continue;
        const result = validateField(field, source[field.key]);
        if (result.error) errors[`${group.id}.${field.key}`] = result.error;
        else value[group.id][field.key] = result.value;
      }
    }
  }
  return { value, errors: Object.keys(errors).length ? errors : null };
}
