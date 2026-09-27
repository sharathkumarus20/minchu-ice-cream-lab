/**
 * Scroll motion: reveal-on-scroll, gentle parallax and the sticky header state.
 * Everything is skipped when the visitor prefers reduced motion.
 */
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let revealObserver = null;

/** Adds .is-in to [data-reveal] elements as they enter the viewport. Safe to call again after new content renders. */
export function observeReveals(root = document) {
  const targets = root.querySelectorAll('[data-reveal]:not(.is-in)');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-in'));
    return;
  }
  revealObserver ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        revealObserver.unobserve(entry.target);
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
  );
  targets.forEach((el) => revealObserver.observe(el));
}

/** Moves [data-speed] elements at a different rate from the page while they are on screen. */
function initParallax() {
  if (reduceMotion) return;
  const items = [...document.querySelectorAll('[data-speed]')];
  const visible = new Set();
  let frame = 0;

  const update = () => {
    frame = 0;
    const middle = window.innerHeight / 2;
    for (const el of visible) {
      const box = el.getBoundingClientRect();
      const offset = (box.top + box.height / 2 - middle) * Number(el.dataset.speed);
      el.style.setProperty('--py', `${offset.toFixed(1)}px`);
    }
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  const watcher = new IntersectionObserver((entries) => {
    for (const entry of entries) (entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target));
    schedule();
  });
  items.forEach((el) => watcher.observe(el));
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
}

function initHeader() {
  const header = document.querySelector('.topbar');
  const toggle = () => header.classList.toggle('is-stuck', window.scrollY > 8);
  toggle();
  window.addEventListener('scroll', toggle, { passive: true });
}

export function initMotion() {
  initHeader();
  initParallax();
  observeReveals();
}
