/* ==========================================================================
   PLAYLIST.JS
   Generates the track list from main.js's TRACKS array (one source of
   truth — nothing here is hand-written per track) and lets a visitor
   click any track to jump straight to it, instead of only prev/next.

   Reuses the exact same setCurrentIndex callback main.js already passes
   to player.js, so selecting from the list, hitting "next", and a track
   ending and auto-advancing all go through one code path and can never
   fall out of sync with each other.

   Listens for 'trackchange' (dispatched by main.js) to move the
   aria-current highlight — it doesn't decide when tracks change, only
   reflects it and offers a way to request a change.
   ========================================================================== */

/**
 * @param {Object} deps
 * @param {Array<{id:string,title:string,artist:string,src:string}>} deps.tracks
 * @param {(index: number) => void} deps.setCurrentIndex
 */
export function initPlaylist({ tracks, setCurrentIndex }) {
  const playlistEl = document.querySelector('.playlist');
  if (!playlistEl) return;

  const listEl = playlistEl.querySelector('.playlist__list');
  const buttons = [];

  tracks.forEach((track, index) => {
    const item = document.createElement('li');
    item.className = 'playlist__item';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'playlist__track-btn';
    button.dataset.trackId = track.id;
    button.setAttribute('aria-current', 'false');

    const number = document.createElement('span');
    number.className = 'playlist__track-number';
    number.textContent = String(index + 1).padStart(2, '0');

    const info = document.createElement('span');
    info.className = 'playlist__track-info';

    const title = document.createElement('span');
    title.className = 'playlist__track-title';
    title.textContent = track.title;

    const artist = document.createElement('span');
    artist.className = 'playlist__track-artist';
    artist.textContent = track.artist;

    info.append(title, artist);
    button.append(number, info);
    item.appendChild(button);
    listEl.appendChild(item);

    button.addEventListener('click', () => {
      setCurrentIndex(index);
    });

    buttons.push(button);
  });

  document.addEventListener('trackchange', (event) => {
    const { trackId } = event.detail;
    buttons.forEach((button) => {
      button.setAttribute('aria-current', String(button.dataset.trackId === trackId));
    });
  });
}
