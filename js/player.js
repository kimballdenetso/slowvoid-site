/* ==========================================================================
   PLAYER.JS
   Transport controls (prev/play/pause/stop/next), the scrubbable timing
   visualizer, and the current/total time readout. Matches the markup
   contract documented at the top of css/player.css.

   Does NOT build any audio nodes itself — it's handed the shared
   AnalyserNode by main.js (read-only, for drawing) and the plain <audio>
   element (for play/pause/seek), so it has zero knowledge of the EQ or
   volume/pan chain sitting in between.
   ========================================================================== */

/**
 * @param {Object} deps
 * @param {HTMLAudioElement} deps.audioEl
 * @param {AnalyserNode} deps.analyserNode
 * @param {Array<{id:string,title:string,artist:string,src:string}>} deps.tracks
 * @param {() => number} deps.getCurrentIndex
 * @param {(index: number) => void} deps.setCurrentIndex
 */
export function initPlayer({ audioEl, analyserNode, tracks, getCurrentIndex, setCurrentIndex }) {
  const playerEl = document.querySelector('.player');
  const playBtn = playerEl.querySelector('[data-action="play"]');
  const pauseBtn = playerEl.querySelector('[data-action="pause"]');
  const stopBtn = playerEl.querySelector('[data-action="stop"]');
  const prevBtn = playerEl.querySelector('[data-action="prev"]');
  const nextBtn = playerEl.querySelector('[data-action="next"]');
  const scrubInput = playerEl.querySelector('.player__scrub-input');
  const canvas = playerEl.querySelector('.player__timeline-canvas');
  const canvasCtx = canvas.getContext('2d');
  const currentTimeEl = playerEl.querySelector('[data-time="current"]');
  const totalTimeEl = playerEl.querySelector('[data-time="total"]');

  const timeDomainData = new Uint8Array(analyserNode.fftSize);
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

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawTimeline() {
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    canvasCtx.clearRect(0, 0, width, height);

    // Pull brand colors from CSS custom properties rather than
    // hardcoding hex values here, so base.css stays the only source of
    // truth for the palette.
    const styles = getComputedStyle(canvas);
    const waveColor = styles.getPropertyValue('--color-teal-dark').trim() || '#2C434D';
    const progressColor = styles.getPropertyValue('--color-accent').trim() || '#73CBC5';

    analyserNode.getByteTimeDomainData(timeDomainData);

    // Waveform: raw time-domain amplitude across the full width.
    canvasCtx.strokeStyle = waveColor;
    canvasCtx.lineWidth = 1;
    canvasCtx.beginPath();
    const sliceWidth = width / timeDomainData.length;
    let x = 0;
    for (let i = 0; i < timeDomainData.length; i++) {
      const normalized = timeDomainData[i] / 128.0; // 0..2, 1 == silence
      const y = (normalized * height) / 2;
      if (i === 0) canvasCtx.moveTo(x, y);
      else canvasCtx.lineTo(x, y);
      x += sliceWidth;
    }
    canvasCtx.stroke();

    // Played-portion overlay, translucent so the waveform underneath
    // still reads through it.
    const progress = audioEl.duration ? audioEl.currentTime / audioEl.duration : 0;
    canvasCtx.fillStyle = progressColor;
    canvasCtx.globalAlpha = 0.18;
    canvasCtx.fillRect(0, 0, width * progress, height);
    canvasCtx.globalAlpha = 1;
  }

  function tick() {
    if (!isScrubbing) {
      const progress = audioEl.duration ? (audioEl.currentTime / audioEl.duration) * 100 : 0;
      scrubInput.value = String(progress);
      currentTimeEl.textContent = formatTime(audioEl.currentTime);
    }
    drawTimeline();
    rafId = requestAnimationFrame(tick);
  }

  function startLoop() {
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  // Deliberately never fully stop the loop — even paused, we keep
  // redrawing so the waveform reflects the current playhead position
  // and any AnalyserNode changes (e.g. EQ toggling) show up live.

  function setPlayPauseUI(isPlaying) {
    playBtn.hidden = isPlaying;
    pauseBtn.hidden = !isPlaying;
  }

  playBtn.addEventListener('click', () => {
    audioEl.play().catch(() => {
      /* Blocked by autoplay policy or no src yet — UI stays in sync via
         the audio element's own 'play'/'pause' events, nothing to do. */
    });
  });

  pauseBtn.addEventListener('click', () => {
    audioEl.pause();
  });

  stopBtn.addEventListener('click', () => {
    audioEl.pause();
    audioEl.currentTime = 0;
    scrubInput.value = '0';
    currentTimeEl.textContent = formatTime(0);
    drawTimeline();
  });

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
    if (!audioEl.duration) return;
    const previewTime = (parseFloat(scrubInput.value) / 100) * audioEl.duration;
    currentTimeEl.textContent = formatTime(previewTime);
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
    setPlayPauseUI(true);
  });

  audioEl.addEventListener('pause', () => {
    setPlayPauseUI(false);
  });

  audioEl.addEventListener('ended', () => {
    setPlayPauseUI(false);
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

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  startLoop();
}
