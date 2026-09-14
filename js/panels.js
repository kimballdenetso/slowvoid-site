// panels.js
// Opens/closes the floating overlay cards (tracklist, EQ, volume,
// spectrum analyzer) inside the player stage. This is purely UI state —
// it never touches audio, playback, or any other module's logic.
//
// Panels are independent: opening one no longer closes the others, so
// any combination can be visible at once and simply stacks (z-index
// order follows DOM order — see css/chrome.css for the shared
// .floating-panel positioning each one stacks within).

const toggles = document.querySelectorAll('[data-panel-toggle]');

function closeAll(except) {
  toggles.forEach((btn) => {
    if (btn === except) return;
    const targetId = btn.getAttribute('aria-controls');
    const target = document.getElementById(targetId);
    btn.setAttribute('aria-expanded', 'false');
    target?.classList.remove('is-open');
  });
}

toggles.forEach((btn) => {
  btn.addEventListener('click', () => {
    const targetId = btn.getAttribute('aria-controls');
    const target = document.getElementById(targetId);
    if (!target) return;

    const isOpen = btn.getAttribute('aria-expanded') === 'true';

    btn.setAttribute('aria-expanded', String(!isOpen));
    target.classList.toggle('is-open', !isOpen);
  });
});

// Close every open panel on Escape for keyboard users.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAll();
});
