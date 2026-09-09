/* ==========================================================================
   PARALLAX.JS
   A very subtle scroll-driven parallax on the two fixed "SLOWVOID" side
   strips (css/chrome.css .side-text-wrap). Fully decorative and fully
   independent of every other module — same "own island" pattern as
   social.js — so it can be added or removed without touching anything
   else.

   How it talks to CSS: this file only ever sets one thing, the
   --side-text-parallax custom property on <html>. chrome.css reads that
   variable inside .side-text-wrap's existing transform. If this script
   fails to load for any reason, the property is simply absent and the
   strips sit in their normal static position (see the var(...,  0px)
   fallback in chrome.css) — nothing breaks.
   ========================================================================== */

const PARALLAX_FACTOR = 0.06; // subtle: strips drift at ~6% of scroll speed
const MAX_OFFSET_PX = 40; // caps the drift so it never reads as a "broken" layout

const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

let ticking = false;

function setOffset(px) {
  document.documentElement.style.setProperty('--side-text-parallax', `${px}px`);
}

function applyParallax() {
  ticking = false;
  const offset = Math.max(
    -MAX_OFFSET_PX,
    Math.min(MAX_OFFSET_PX, window.scrollY * PARALLAX_FACTOR)
  );
  setOffset(offset);
}

function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(applyParallax);
}

function enable() {
  window.addEventListener('scroll', onScroll, { passive: true });
  applyParallax(); // handles a page load that restores mid-scroll
}

function disable() {
  window.removeEventListener('scroll', onScroll);
  setOffset(0);
}

// Respect prefers-reduced-motion both at load and if it's toggled mid-session.
if (!reduceMotionQuery.matches) {
  enable();
}

reduceMotionQuery.addEventListener('change', (e) => {
  if (e.matches) {
    disable();
  } else {
    enable();
  }
});
