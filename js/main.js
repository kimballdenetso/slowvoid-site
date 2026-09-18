/* ==========================================================================
   MAIN.JS
   App entry point. Owns:
     - the track list (single source of truth for titles/artists/audio src)
     - the shared AudioContext + the master node graph
     - wiring player.js / eq.js / panner-volume.js together
     - loading tracks and dispatching 'trackchange'

   Load order in index.html (all as type="module"):
     <script type="module" src="js/main.js"></script>
   main.js imports the others directly, so it's the only <script> tag needed.

   Shared node graph (see project-plan.md Section 4):
     <audio> → MediaElementAudioSourceNode
             → [10x BiquadFilterNode chain]   (eq.js)
             → [DJ filter: lowpass + wet/dry] (dj-filter.js, F/Q/Amount knobs)
             → GainNode                        (panner-volume.js, volume)
             → StereoPannerNode                (panner-volume.js, pan)
             → AnalyserNode                    (feeds player.js's timing bar AND js/spectrum-analyzer.js's LED bar graph)
             → AudioContext.destination

   Cross-module events (all dispatched on `document`):
     'trackchange'    { detail: { trackId, index } }   — fired here in main.js
     'volumechange'   { detail: { value } }             — fired by panner-volume.js
     'eqactivated'    (no detail)                       — fired by eq.js
     'eqdeactivated'  (no detail)                       — fired by eq.js
   These are the only channel visualizer3d.js and comments.js need to hook
   into the audio/player state — neither of them touches the audio graph.
   ========================================================================== */

import { initPlayer } from './player.js';
import { initEQ } from './eq.js';
import { initFilter } from './dj-filter.js';
import { initSpectrumAnalyzer } from './spectrum-analyzer.js';
import { initPannerVolume } from './panner-volume.js';
import { initPlaylist } from './playlist.js';
import './comments.js'; // self-initializing: wires its own DOM listeners on import

/* --------------------------------------------------------------------------
   TRACK LIST
   Add/reorder tracks here. Audio files live in /assets/audio/.
   -------------------------------------------------------------------------- */
const TRACKS = [
  { id: 'celest-01', title: 'Celest 01', artist: 'Celest', src: 'assets/audio/Celest_01.mp3' },
  { id: 'celest-02', title: 'Celest 02', artist: 'Celest', src: 'assets/audio/Celest_02.mp3' },
  { id: 'celest-03', title: 'Celest 03', artist: 'Celest', src: 'assets/audio/Celest_03.mp3' },
  { id: 'celest-04', title: 'Celest 04', artist: 'Celest', src: 'assets/audio/Celest_04.mp3' },
  { id: 'celest-05', title: 'Celest 05', artist: 'Celest', src: 'assets/audio/Celest_05.mp3' },
];

let audioContext;
let currentTrackIndex = 0;
const audioEl = document.getElementById('track-audio');

/**
 * Builds the AudioContext and the full node graph once, wiring in the
 * EQ chain and the volume/pan chain built by their own modules.
 * Returns the pieces other modules need (the analyser, the eq filters).
 */
function buildAudioGraph() {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const sourceNode = audioContext.createMediaElementSource(audioEl);

  const analyserNode = audioContext.createAnalyser();
  analyserNode.fftSize = 2048;

  // A second, separate tap for the spectrum visualizer, tuned
  // independently from the analyser above (which player.js's timing
  // bar also relies on) — see js/spectrum-analyzer.js for what these
  // settings control. Keeping this as its own node means retuning the
  // visualizer's responsiveness can never affect anything else that
  // reads analyserNode.
  const spectrumAnalyserNode = audioContext.createAnalyser();
  spectrumAnalyserNode.fftSize = 2048;
  spectrumAnalyserNode.smoothingTimeConstant = 0.35; // default is 0.8 — much snappier
  spectrumAnalyserNode.minDecibels = -60;              // was -40 — a bit more headroom below the floor
  spectrumAnalyserNode.maxDecibels = -20;

  const eq = initEQ(audioContext);
  const filter = initFilter(audioContext);
  const levels = initPannerVolume(audioContext);

  sourceNode.connect(eq.inputNode);
  eq.outputNode.connect(filter.inputNode);
  filter.outputNode.connect(levels.inputNode);
  levels.outputNode.connect(analyserNode);
  levels.outputNode.connect(spectrumAnalyserNode); // parallel tap — doesn't need its own
                                                     // connection onward to produce sound,
                                                     // analyserNode already routes to destination
  analyserNode.connect(audioContext.destination);

  return { analyserNode, spectrumAnalyserNode, eq, filter, levels };
}

/**
 * Writes text to an element if it exists, no-ops otherwise — lets
 * loadTrack() keep working even if the current-track display markup
 * changes or is removed (e.g. the track list's own highlighted row
 * being the only "now playing" indicator), instead of throwing and
 * halting init() partway through, which used to also take down the
 * player and comments (both wired up later in the same function).
 */
function setTextIfPresent(selector, text) {
  const el = document.querySelector(selector);
  if (el) el.textContent = text;
}

/**
 * Swaps the <audio> element's source and updates the title/artist text.
 * Does NOT auto-play — browsers require a user gesture to start audio,
 * and the person may be mid-way through arranging things before playing.
 */
function loadTrack(index, { autoplay = false } = {}) {
  const track = TRACKS[index];
  const wasPlaying = !audioEl.paused;

  audioEl.src = track.src;
  setTextIfPresent('.player__title', track.title);
  setTextIfPresent('.player__artist', track.artist);

  document.dispatchEvent(
    new CustomEvent('trackchange', { detail: { trackId: track.id, index } })
  );

  if (autoplay || wasPlaying) {
    audioEl.play().catch(() => {
      /* Autoplay was blocked — the transport UI still reflects paused
         state correctly since player.js listens to the audio element's
         own 'pause' event, so nothing else needs to happen here. */
    });
  }
}

/**
 * Most browsers require a user gesture before an AudioContext can
 * produce sound. We build the graph on load (so nodes exist and can be
 * wired to the UI immediately) but explicitly resume the context on the
 * first interaction anywhere on the page.
 */
function resumeAudioContextOnce() {
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume();
  }
  document.removeEventListener('pointerdown', resumeAudioContextOnce);
  document.removeEventListener('keydown', resumeAudioContextOnce);
}

/**
 * Single source of truth for "switch to this track" — used by
 * player.js (prev/next/ended-auto-advance) and playlist.js (clicking a
 * track in the list). Keeping this in one place means both can never
 * fall out of sync with each other or with currentTrackIndex.
 */
function selectTrack(index) {
  currentTrackIndex = index;
  loadTrack(index, { autoplay: true });
}

/**
 * Keyboard shortcuts for the player's four "extras" toggle buttons
 * (LIST/EQ/VIZ/FILTER, .player__features in player.css), one letter
 * each — the first letter of the button's own name. Reuses each
 * button's real .click(), so this fires the exact same panels.js
 * (open/close) and eq.js (activate/deactivate) handlers a mouse click
 * would, rather than duplicating that logic here.
 *
 * Ignored while a modifier key is held (so it doesn't fight browser/
 * OS shortcuts) and while focus is on a form field (so typing "e" in
 * the comment box or the admin login password doesn't fire it).
 */
const PANEL_SHORTCUTS = {
  l: 'tracklist', // LIST
  e: 'eq',        // EQ
  v: 'spectrum',  // VIZ
  f: 'filter',    // FILTER
};

function isTypingTarget(el) {
  return Boolean(el) && (el.matches('input, textarea, select') || el.isContentEditable);
}

function initPanelShortcuts() {
  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;

    const panelName = PANEL_SHORTCUTS[event.key.toLowerCase()];
    if (!panelName) return;

    const toggleBtn = document.querySelector(`[data-panel-toggle="${panelName}"]`);
    if (toggleBtn) toggleBtn.click();
  });
}

function init() {
  const graph = buildAudioGraph();

  initPlayer({
    audioEl,
    analyserNode: graph.analyserNode,
    tracks: TRACKS,
    getCurrentIndex: () => currentTrackIndex,
    setCurrentIndex: selectTrack,
  });

  initPlaylist({
    tracks: TRACKS,
    setCurrentIndex: selectTrack,
  });

  const eqCanvas = document.querySelector('.eq__visualizer-canvas');
  if (eqCanvas) {
    initSpectrumAnalyzer(eqCanvas, graph.spectrumAnalyserNode);
  }

  loadTrack(currentTrackIndex);

  initPanelShortcuts();

  document.addEventListener('pointerdown', resumeAudioContextOnce);
  document.addEventListener('keydown', resumeAudioContextOnce);
}

document.addEventListener('DOMContentLoaded', init);
