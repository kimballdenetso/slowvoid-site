/* ==========================================================================
   PLAYER.JS
   Transport controls (prev/play/pause/stop/next), the scrubbable progress
   bar, and the total-time readout. Matches the markup contract documented
   at the top of css/player.css.

   Does NOT build any audio nodes itself — it's handed the plain <audio>
   element (for play/pause/seek) by main.js, so it has zero knowledge of
   the EQ or volume/pan chain sitting in between. The progress bar is now
   a plain fill line (no waveform), so this module no longer needs the
   shared AnalyserNode at all — main.js can keep passing it in, it's just
   unused here (eq-visualizer.js is still the one drawing from it).
   ========================================================================== */

/**
 * @param {Object} deps
 * @param {HTMLAudioElement} deps.audioEl
 * @param {Array<{id:string,title:string,artist:string,src:string}>} deps.tracks
 * @param {() => number} deps.getCurrentIndex
 * @param {(index: number) => void} deps.setCurrentIndex
 */
export function initPlayer({ audioEl, tracks, getCurrentIndex, setCurrentIndex }) {
  const playerEl = document.querySelector('.player');
  const playBtn = playerEl.querySelector('[data-action="play"]');
  const pauseBtn = playerEl.querySelector('[data-action="pause"]');
  const stopBtn = playerEl.querySelector('[data-action="stop"]');
  const prevBtn = playerEl.querySelector('[data-action="prev"]');
  const nextBtn = playerEl.querySelector('[data-action="next"]');
  const scrubInput = playerEl.querySelector('.player__scrub-input');
  const totalTimeEl = playerEl.querySelector('[data-time="total"]');

  let isScrubbing = false;
  let rafId = null;

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60)
      .toString()
      .padStart(2, '0');
    return `${mins}:${secs}`;
  }

  // Sets the CSS custom property player.css reads to paint the fill
  // line (accent teal 0..--progress, dark teal beyond it) — same
  // left-fills-in technique as .player__range--volume's --fill.
  function setProgressFill(percent) {
    scrubInput.style.setProperty('--progress', `${percent}%`);
  }

  function tick() {
    if (!isScrubbing) {
      const progress = audioEl.duration ? (audioEl.currentTime / audioEl.duration) * 100 : 0;
      scrubInput.value = String(progress);
      setProgressFill(progress);
    }
    rafId = requestAnimationFrame(tick);
  }

  function startLoop() {
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  // Deliberately never fully stop the loop — even paused, we keep
  // ticking so the fill/playhead reflect any programmatic seeks (e.g.
  // a comment-timestamp click) without waiting on an 'input' event.

  function setPlayingState(isPlaying) {
    playBtn.setAttribute('aria-pressed', String(isPlaying));
  }

  playBtn.addEventListener('click', () => {
    audioEl.play().catch(() => {
      /* Blocked by autoplay policy or no src yet — UI stays in sync via
         the audio element's own 'play'/'pause' events, nothing to do. */
    });
  });

  // Pause and Stop are deliberately identical — both just pause
  // playback. Stop keeps its own icon/label as a visual choice, but
  // no longer resets position to 0.
  function pausePlayback() {
    audioEl.pause();
  }

  pauseBtn.addEventListener('click', pausePlayback);
  stopBtn.addEventListener('click', pausePlayback);

  prevBtn.addEventListener('click', () => {
    const index = (getCurrentIndex() - 1 + tracks.length) % tracks.length;
    setCurrentIndex(index);
  });

  nextBtn.addEventListener('click', () => {
    const index = (getCurrentIndex() + 1) % tracks.length;
    setCurrentIndex(index);
  });

  // Scrubbing: pause the live-position updates while the visitor is
  // actively dragging, so the thumb doesn't fight their input.
  scrubInput.addEventListener('pointerdown', () => {
    isScrubbing = true;
  });

  scrubInput.addEventListener('input', () => {
    setProgressFill(parseFloat(scrubInput.value));
  });

  scrubInput.addEventListener('change', () => {
    if (!audioEl.duration) return;
    audioEl.currentTime = (parseFloat(scrubInput.value) / 100) * audioEl.duration;
    isScrubbing = false;
  });

  // Also handle keyboard seeking (arrow keys move the native range
  // input without an intermediate 'pointerdown'), which fires 'input'
  // and 'change' but never 'pointerdown' — isScrubbing simply stays
  // false in that case, which is fine since there's no drag to protect.

  audioEl.addEventListener('play', () => {
    setPlayingState(true);
  });

  audioEl.addEventListener('pause', () => {
    setPlayingState(false);
  });

  audioEl.addEventListener('ended', () => {
    setPlayingState(false);
    nextBtn.click();
  });

  audioEl.addEventListener('loadedmetadata', () => {
    totalTimeEl.textContent = formatTime(audioEl.duration);
  });

  // Comments.js dispatches this when a visitor clicks a timestamp
  // (either a scrub-bar marker or a comment in the list) to seek
  // playback without duplicating seek logic in comments.js itself.
  document.addEventListener('seektotimestamp', (event) => {
    const seconds = event.detail && event.detail.seconds;
    if (typeof seconds !== 'number' || !audioEl.duration) return;
    audioEl.currentTime = Math.max(0, Math.min(seconds, audioEl.duration));
  });

  startLoop();
}
