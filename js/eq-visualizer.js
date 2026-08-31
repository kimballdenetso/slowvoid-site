/* ==========================================================================
   EQ-VISUALIZER.JS
   Draws the combined frequency-response curve for the 10-band chain onto
   .eq__visualizer-canvas (see css/eq.css for the reserved box).

   This reads each filter's getFrequencyResponse() rather than analyzing
   live audio — it's a plot of what the EQ *would do* to any signal at
   its current settings, which is standard for EQ UIs and means the
   curve is visible and accurate even when nothing is playing.

   Redraws whenever any band changes (eq.js dispatches 'eq:changed' on
   .eq__bands for every slider move, activate/deactivate, and reset).
   ========================================================================== */

const SAMPLE_COUNT = 200;
const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const DB_RANGE = 15; // curve is clamped to ±15dB for a readable scale

/**
 * @param {HTMLCanvasElement} canvas
 * @param {BiquadFilterNode[]} filters
 */
export function initEQVisualizer(canvas, filters) {
  const ctx = canvas.getContext('2d');
  const bandsEl = document.querySelector('.eq__bands');

  // Precompute the log-spaced frequency sample points once — they never
  // change, only the resulting magnitude does.
  const sampleFrequencies = new Float32Array(SAMPLE_COUNT);
  const minLog = Math.log10(MIN_FREQ);
  const maxLog = Math.log10(MAX_FREQ);
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const t = i / (SAMPLE_COUNT - 1);
    sampleFrequencies[i] = Math.pow(10, minLog + t * (maxLog - minLog));
  }

  const magResponse = new Float32Array(SAMPLE_COUNT);
  const phaseResponse = new Float32Array(SAMPLE_COUNT); // required by the API, unused
  const combinedMagnitude = new Float32Array(SAMPLE_COUNT);

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw() {
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    ctx.clearRect(0, 0, width, height);

    const styles = getComputedStyle(canvas);
    const lineColor = styles.getPropertyValue('--color-accent').trim() || '#73CBC5';
    const gridColor = styles.getPropertyValue('--color-teal-dark').trim() || '#2C434D';

    // Zero-dB reference line
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Combine every filter's response by multiplying magnitudes
    // (equivalent to summing dB across the series chain).
    combinedMagnitude.fill(1);
    filters.forEach((filter) => {
      filter.getFrequencyResponse(sampleFrequencies, magResponse, phaseResponse);
      for (let i = 0; i < SAMPLE_COUNT; i++) {
        combinedMagnitude[i] *= magResponse[i];
      }
    });

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const db = 20 * Math.log10(combinedMagnitude[i] || 0.0001);
      const clamped = Math.max(-DB_RANGE, Math.min(DB_RANGE, db));
      const x = (i / (SAMPLE_COUNT - 1)) * width;
      const y = height / 2 - (clamped / DB_RANGE) * (height / 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  resizeCanvas();
  draw();

  window.addEventListener('resize', () => {
    resizeCanvas();
    draw();
  });

  // eq.js dispatches this on every slider move, toggle, and reset.
  bandsEl.addEventListener('eq:changed', draw);

  return { redraw: draw };
}
