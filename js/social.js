/* ==========================================================================
   SOCIAL.JS
   Renders the streaming/social link grid into .site-header__links from a
   single config array (same pattern as eq.js generating its bands — one
   source of truth instead of hand-written repeated markup), and improves
   keyboard/screen-reader focus behavior when jumping to the #contact
   anchor. Smooth scrolling itself is handled by base.css's
   `html { scroll-behavior: smooth }` — no JS needed for that part.
   ========================================================================== */

/* --------------------------------------------------------------------------
   CONFIG — update URLs here. Order matches the design's 2-column grid,
   read left-to-right, top-to-bottom.
   -------------------------------------------------------------------------- */
const SOCIAL_LINKS = [
  { label: 'Bandcamp', url: 'https://bandcamp.com/' },
  { label: 'Apple Music', url: 'https://music.apple.com/' },
  { label: 'Spotify', url: 'https://open.spotify.com/' },
  { label: 'YouTube', url: 'https://youtube.com/' },
  { label: 'Insta', url: 'https://instagram.com/' },
  { label: 'TikTok', url: 'https://tiktok.com/' },
];

function renderSocialLinks() {
  const container = document.querySelector('.site-header__links');
  if (!container) return;

  SOCIAL_LINKS.forEach(({ label, url }) => {
    const link = document.createElement('a');
    link.className = 'btn';
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = label.toUpperCase();
    container.appendChild(link);
  });
}

/* --------------------------------------------------------------------------
   Contact anchor: clicking a link to #contact should move keyboard/
   screen-reader focus to the contact section's heading, not just scroll
   the page — the browser's default anchor behavior scrolls but doesn't
   reliably move focus, which matters for anyone not using a mouse.
   -------------------------------------------------------------------------- */
function initContactAnchorFocus() {
  const contactLinks = document.querySelectorAll('a[href="#contact"]');
  const contactSection = document.getElementById('contact');
  if (!contactSection) return;

  contactLinks.forEach((link) => {
    link.addEventListener('click', () => {
      // Let the native smooth-scroll happen, then move focus once the
      // target is in view rather than fighting the scroll.
      window.setTimeout(() => {
        contactSection.setAttribute('tabindex', '-1');
        contactSection.focus({ preventScroll: true });
      }, 400);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  renderSocialLinks();
  initContactAnchorFocus();
});
