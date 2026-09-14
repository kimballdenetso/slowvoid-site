/* ==========================================================================
   SPECTRUM-ANALYZER.JS
   Replaces the old EQ-response-curve visualizer with a classic
   late-90s/2000s LED-block spectrum analyzer: one column per band,
   each column an 8-segment bar graph, plus a single brighter "peak"
   segment per column that holds briefly then falls — the standard
   Winamp/hi-fi-rack look.

   Reads live levels straight from the shared AnalyserNode (the same
   node player.js's timing bar and this module both hang off of — see
   main.js's node graph diagram), NOT from the EQ's filter chain, so
   this reflects what's actually playing rather than the EQ's response
   curve. Bands sample the analyser at the same 10 center frequencies
   as the EQ (see FREQUENCIES in js/eq.js — kept as a separate literal
   here since the two modules don't otherwise depend on each other;
   keep them in sync if that list ever changes).
   ========================================================================== */

const FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

const ROWS = 8;
const BLOCK_W = 15;
const BLOCK_H = 5;
const GAP = 2;
const PEAK_HOLD_MS = 500;     // how long a peak sits still before it starts falling
const PEAK_FALL_STEP_MS = 60; // how often it drops one more row after that

/**
 * Shapes the raw 0..1 amplitude reading before it's turned into a
 * block count — this is the "response curve." Exponents below 1
 * (e.g. 0.5, a sqrt-like curve) boost quiet signal disproportionately,
 * making the display twitchy even at low levels. Exponents above 1
 * do the opposite: they pin loud signal near the top and let quieter
 * signal fall away much faster, which reads as "sitting high most of
 * the time, with a noticeable drop in quiet passages" — the current
 * setting.
 *
 * Tune EXPONENT directly, or replace the function body entirely with
 * your own curve/lookup table — whatever you return here (clamped
 * 0..1) becomes the bar height.
 */
const RESPONSE_CURVE_EXPONENT = 1.8;
function responseCurve(normalized) {
  return Math.pow(Math.min(1, Math.max(0, normalized)), RESPONSE_CURVE_EXPONENT);
}

/**
 * Per-band ceiling drop. Same underlying goal as an additive boost —
 * make the naturally weaker highs read taller — but implemented
 * differently: instead of adding dB to the signal, each successively
 * higher band (they're spaced ~1 octave apart) gets its OWN,
 * progressively lower ceiling for normalization purposes. A given
 * signal level then maps closer to 1.0 for a high band than it would
 * for a low band, because it's being measured against a smaller
 * window, not because it was artificially amplified. The floor
 * (minDb, set in main.js) stays the same for every band — only the
 * top of each band's window comes down.
 */
const PER_OCTAVE_CEILING_DROP_DB = 4;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {AnalyserNode} analyserNode
 */
export function initSpectrumAnalyzer(canvas, analyserNode) {
  if (!canvas || !analyserNode) {
    console.error('initSpectrumAnalyzer: missing canvas or analyserNode', { canvas, analyserNode });
    return;
  }

  try {
    const cols = FREQUENCIES.length;
  const width = cols * BLOCK_W + (cols - 1) * GAP;
  const height = ROWS * BLOCK_H + (ROWS - 1) * GAP;

  // Drawn at exact block-grid resolution (no stretching) so every
  // segment stays a crisp, hard-edged rectangle — see the matching
  // css/chrome.css rule, which no longer forces this canvas to 100%.
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  const freqData = new Uint8Array(analyserNode.frequencyBinCount);

  // Map each target frequency to the nearest FFT bin once up front —
  // the bin width is fixed for the lifetime of this AnalyserNode.
  const binHz = analyserNode.context.sampleRate / analyserNode.fftSize;
  const binForBand = FREQUENCIES.map((freq) =>
    Math.min(analyserNode.frequencyBinCount - 1, Math.round(freq / binHz))
  );

  // getByteFrequencyData's bytes are a linear remap of this dB
  // window — read it directly off the node so the math below always
  // matches whatever main.js has configured. dbRange (using the
  // node's real, single ceiling) is what's needed to decode a raw
  // byte back into an actual dB value; bandRange (using each band's
  // own, progressively lower ceiling) is what's used afterward to
  // normalize that dB value to 0..1 for display.
  const minDb = analyserNode.minDecibels;
  const maxDb = analyserNode.maxDecibels;
  const dbRange = maxDb - minDb;
  const bandMaxDb = FREQUENCIES.map((_, i) => maxDb - i * PER_OCTAVE_CEILING_DROP_DB);
  const bandRange = bandMaxDb.map((bandMax) => bandMax - minDb);

  // Read the two colors once from the CSS custom properties rather
  // than hardcoding hex here, so a re-theme in base.css is picked up
  // automatically without touching this file.
  const rootStyles = getComputedStyle(document.documentElement);
  const colorLevel = rootStyles.getPropertyValue('--color-teal-dark').trim();
  const colorPeak = rootStyles.getPropertyValue('--color-teal').trim();
  const peakRow = new Array(cols).fill(0);   // 0..ROWS, row index of this column's held peak
  const peakSince = new Array(cols).fill(0); // timestamp the current peak was last raised/stepped

  function rowY(rowIndex) {
    // row 0 is the bottom-most block
    return height - (rowIndex + 1) * BLOCK_H - rowIndex * GAP;
  }

  function draw(now) {
    requestAnimationFrame(draw);
    try {
      analyserNode.getByteFrequencyData(freqData);
      ctx.clearRect(0, 0, width, height);

      // Visible "unlit LED" background for every block, drawn first —
      // otherwise the whole canvas reads as simply blank whenever the
      // signal is quiet (or before the AudioContext has resumed), which
      // looks indistinguishable from broken. Real hardware meters keep
      // their off segments clearly visible for the same reason — this
      // needs real contrast against the stage photo behind it, not
      // just a faint tint.
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = colorLevel;
      for (let col = 0; col < cols; col++) {
        const x = col * (BLOCK_W + GAP);
        for (let row = 0; row < ROWS; row++) {
          ctx.fillRect(x, rowY(row), BLOCK_W, BLOCK_H);
        }
      }
      ctx.globalAlpha = 1;

      for (let col = 0; col < cols; col++) {
        const byteValue = freqData[binForBand[col]]; // 0..255
        const db = minDb + (byteValue / 255) * dbRange;
        const raw = Math.min(1, Math.max(0, (db - minDb) / bandRange[col]));
        const amplitude = responseCurve(raw);
        const level = Math.min(ROWS, Math.round(amplitude * ROWS));

        // Peak-hold: jump up instantly with the level, then sit for
        // PEAK_HOLD_MS before dropping one row at a time — never below
        // the current live level.
        if (level >= peakRow[col]) {
          peakRow[col] = level;
          peakSince[col] = now;
        } else if (now - peakSince[col] > PEAK_HOLD_MS) {
          peakRow[col] = Math.max(level, peakRow[col] - 1);
          peakSince[col] = now - PEAK_HOLD_MS + PEAK_FALL_STEP_MS;
        }

        const x = col * (BLOCK_W + GAP);

        ctx.fillStyle = colorLevel;
        for (let row = 0; row < level; row++) {
          ctx.fillRect(x, rowY(row), BLOCK_W, BLOCK_H);
        }

        if (peakRow[col] > 0) {
          ctx.fillStyle = colorPeak;
          ctx.fillRect(x, rowY(peakRow[col] - 1), BLOCK_W, BLOCK_H);
        }
      }
    } catch (err) {
      // Surface this instead of silently dying every frame — a
      // canvas/audio-graph error here shouldn't be invisible.
      console.error('spectrum-analyzer draw error:', err);
    }
  }

  requestAnimationFrame(draw);
  } catch (err) {
    console.error('initSpectrumAnalyzer setup error:', err);
  }
}
