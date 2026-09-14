/* ==========================================================================
   DJ-FILTER.JS
   Self-contained "DJ style" filter effect: a single BiquadFilterNode
   that sweeps between lowpass and highpass, wired into the shared
   audio graph between the EQ and the volume/pan stage (see main.js's
   buildAudioGraph), plus the three-knob UI that drives it (#panel-filter
   in index.html / css/dj-filter.css).

   Same ownership pattern as eq.js / panner-volume.js: this module owns
   both its slice of the audio graph AND the DOM wiring for its own
   panel — main.js just calls initFilter(audioContext) and splices the
   returned inputNode/outputNode into the chain.

   Three knobs:
     A — wet/dry amount (0 – 1, linear). At A=0 the signal passes
         through untouched regardless of F/Q.
     F — filter cutoff, DJ-mixer style: the knob's LEFT half sweeps a
         LOWPASS down from wide-open to 20 Hz as it turns further left;
         the RIGHT half sweeps a HIGHPASS up from 20 Hz to wide-open as
         it turns further right; dead CENTER (12 o'clock — see the
         knob's own geometry in dj-filter.css) is flat/no effect. So
         turning it either direction from center engages more filtering.
     Q — filter.Q (0.1 – 24, logarithmic taper), resonance of whichever
         filter (lowpass or highpass) the F knob currently has engaged.

   Implemented as a wet/dry blend (dry gain + filtered/wet gain, summed
   at outputNode) so Amount has something to be an amount OF, on top of
   F's own center-detent bypass.
   ========================================================================== */

const FREQ_MIN = 20;
const FREQ_MAX = 20000;
const Q_MIN = 0.1;
const Q_MAX = 24;

// Knob sweep: 8 o'clock to 4 o'clock, clockwise, passing through 12 —
// in "degrees clockwise from 12 o'clock" terms, -120deg to +120deg.
const ANGLE_MIN = -120;
const ANGLE_MAX = 120;

// Drag distance (px) for a full sweep from one end of a knob to the
// other — smaller = more sensitive.
const DRAG_RANGE_PX = 160;

// Smoothing applied to every knob -> AudioParam write, so turning a
// knob fast doesn't click/zipper.
const RAMP_SECONDS = 0.01;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Logarithmic taper: 0..1 -> min..max, exponential spacing — used for
// both F and Q so the knob feels even across its full range instead of
// bunching most of the audible change into the first few degrees.
function logTaper(value01, min, max) {
  return min * Math.pow(max / min, value01);
}

function inverseLogTaper(actual, min, max) {
  return Math.log(actual / min) / Math.log(max / min);
}

function formatHz(hz) {
  return hz >= 1000
    ? `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)} kHz`
    : `${Math.round(hz)} Hz`;
}

/**
 * Maps the Frequency knob's 0..1 value onto a DJ-mixer style bipolar
 * sweep: 0 = full left (lowpass, most extreme cut), 0.5 = dead center
 * (flat/no effect), 1 = full right (highpass, most extreme cut).
 */
function freqKnobToFilter(value01) {
  const centered = value01 * 2 - 1; // -1 (full left) .. 0 (center) .. 1 (full right)
  if (centered <= 0) {
    const t = -centered; // 0 at center .. 1 at full left
    return { type: 'lowpass', frequency: logTaper(1 - t, FREQ_MIN, FREQ_MAX), centered };
  }
  const t = centered; // 0 at center .. 1 at full right
  return { type: 'highpass', frequency: logTaper(t, FREQ_MIN, FREQ_MAX), centered };
}

function formatFilterState({ type, frequency, centered }) {
  if (Math.abs(centered) < 0.02) return 'Off (flat)';
  return `${type === 'lowpass' ? 'LP' : 'HP'} ${formatHz(frequency)}`;
}

/**
 * Wires a single knob element: pointer drag (vertical, up = increase)
 * plus keyboard arrows/Home/End for accessibility. Calls onChange(v)
 * with a 0..1 value on every change and keeps the rotation + ARIA
 * value in sync via the shared --knob-angle custom property (read by
 * css/dj-filter.css's .dj-filter__knob-dial).
 */
function wireKnob(knobEl, initialValue01, onChange) {
  let value01 = clamp(initialValue01, 0, 1);

  function render() {
    const angle = ANGLE_MIN + value01 * (ANGLE_MAX - ANGLE_MIN);
    knobEl.style.setProperty('--knob-angle', `${angle}deg`);
    knobEl.setAttribute('aria-valuenow', value01.toFixed(3));
  }

  function setValue(next) {
    value01 = clamp(next, 0, 1);
    render();
    onChange(value01);
  }

  knobEl.addEventListener('pointerdown', (e) => {
    knobEl.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startValue = value01;

    function onMove(moveEvent) {
      const deltaY = startY - moveEvent.clientY; // dragging up increases value
      setValue(startValue + deltaY / DRAG_RANGE_PX);
    }
    function onUp() {
      knobEl.removeEventListener('pointermove', onMove);
      knobEl.removeEventListener('pointerup', onUp);
      knobEl.removeEventListener('pointercancel', onUp);
    }

    knobEl.addEventListener('pointermove', onMove);
    knobEl.addEventListener('pointerup', onUp);
    knobEl.addEventListener('pointercancel', onUp);
  });

  knobEl.addEventListener('keydown', (e) => {
    const STEP = 0.02;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      setValue(value01 + STEP);
      e.preventDefault();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      setValue(value01 - STEP);
      e.preventDefault();
    } else if (e.key === 'Home') {
      setValue(0);
      e.preventDefault();
    } else if (e.key === 'End') {
      setValue(1);
      e.preventDefault();
    }
  });

  render();
}

/**
 * Builds the filter's slice of the audio graph and wires up its
 * panel's three knobs (if #panel-filter's markup is present — same
 * defensive pattern as main.js's setTextIfPresent, so this module
 * still works if the panel markup ever changes). Returns
 * { inputNode, outputNode } for main.js to splice into the shared
 * chain, same shape as initEQ()/initPannerVolume().
 */
export function initFilter(audioContext) {
  const inputNode = audioContext.createGain();
  const outputNode = audioContext.createGain();

  const filterNode = audioContext.createBiquadFilter();
  filterNode.type = 'lowpass';
  filterNode.frequency.value = FREQ_MAX; // centered F knob = wide-open lowpass = effectively flat
  filterNode.Q.value = logTaper(0.3, Q_MIN, Q_MAX);

  const dryGain = audioContext.createGain();
  const wetGain = audioContext.createGain();
  dryGain.gain.value = 1; // Amount starts at 0 — fully dry, filter inaudible until raised
  wetGain.gain.value = 0;

  inputNode.connect(dryGain);
  inputNode.connect(filterNode);
  filterNode.connect(wetGain);
  dryGain.connect(outputNode);
  wetGain.connect(outputNode);

  function setAmount(value01) {
    const now = audioContext.currentTime;
    wetGain.gain.setTargetAtTime(value01, now, RAMP_SECONDS);
    dryGain.gain.setTargetAtTime(1 - value01, now, RAMP_SECONDS);
  }

  const panel = document.getElementById('panel-filter');
  if (panel) {
    const freqKnob = panel.querySelector('[data-knob="freq"]');
    const qKnob = panel.querySelector('[data-knob="q"]');
    const amountKnob = panel.querySelector('[data-knob="amount"]');

    if (freqKnob) {
      wireKnob(freqKnob, 0.5, (v) => {
        const filterState = freqKnobToFilter(v);
        filterNode.type = filterState.type;
        filterNode.frequency.setTargetAtTime(filterState.frequency, audioContext.currentTime, RAMP_SECONDS);
        freqKnob.setAttribute('aria-valuetext', formatFilterState(filterState));
      });
    }

    if (qKnob) {
      wireKnob(
        qKnob,
        inverseLogTaper(filterNode.Q.value, Q_MIN, Q_MAX),
        (v) => {
          const q = logTaper(v, Q_MIN, Q_MAX);
          filterNode.Q.setTargetAtTime(q, audioContext.currentTime, RAMP_SECONDS);
          qKnob.setAttribute('aria-valuetext', q.toFixed(1));
        }
      );
    }

    if (amountKnob) {
      wireKnob(amountKnob, 0, (v) => {
        setAmount(v);
        amountKnob.setAttribute('aria-valuetext', `${Math.round(v * 100)}%`);
      });
    }
  }

  return { inputNode, outputNode };
}
