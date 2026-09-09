// panels.js
// Opens/closes the floating overlay cards (tracklist, EQ, volume,
// spectrum analyzer) inside the player stage. This is purely UI state —
// it never touches audio, playback, or any other module's logic.

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

    // Only one floating panel open at a time keeps the stage readable —
    // opening a new one closes whatever was already showing.
    closeAll(btn);

    btn.setAttribute('aria-expanded', String(!isOpen));
    target.classList.toggle('is-open', !isOpen);
  });
});

// Close the open panel on Escape for keyboard users.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAll();
});
