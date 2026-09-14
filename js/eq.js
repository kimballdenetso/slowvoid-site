/* ==========================================================================
   EQ.JS
   Builds the 10-band BiquadFilterNode chain and generates the band UI
   (sliders + freq labels) into .eq__bands, matching the markup contract
   documented at the top of css/eq.css.

   The ten bands are generated here from FREQUENCIES rather than
   hand-written ten times in index.html — one source of truth for the
   band list, and adding/removing a band later is a one-line change.

   No dedicated in-panel on/off control — activation now follows
   #panel-eq's own open/closed state, driven by the panel-toggle button
   in the player features row (panels.js owns opening/closing the
   panel itself; this module just listens to the same button to also
   flip the audio bypass). Fires 'eqactivated' / 'eqdeactivated' on
   `document` when that happens — visualizer3d.js listens for these to
   reveal/hide a piece of the 3D model (see project-plan.md Section 3.4).
   ========================================================================== */

const FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const FREQUENCY_LABELS = ['31', '62', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];

/**
 * @param {AudioContext} audioContext
 * @returns {{ inputNode: AudioNode, outputNode: AudioNode, filters: BiquadFilterNode[], bandsElement: HTMLElement }}
 */
export function initEQ(audioContext) {
  const eqEl = document.querySelector('.eq');
  const bandsEl = eqEl.querySelector('.eq__bands');
  const resetBtn = eqEl.querySelector('[data-action="eq-reset"]');
  const resetColumn = bandsEl.querySelector('.eq__band--reset');
  // No in-panel on/off button anymore — the EQ is "on" whenever its
  // floating panel is open, so we hook the same toggle button
  // panels.js already wires up for showing/hiding #panel-eq, rather
  // than carrying a second control that does something similar.
  const panelEl = document.getElementById('panel-eq');
  const panelToggleBtn = document.querySelector('[data-panel-toggle="eq"]');

  // --- Build the filter chain -------------------------------------------
  const filters = FREQUENCIES.map((freq) => {
    const filter = audioContext.createBiquadFilter();
    filter.type = 'peaking';
    filter.frequency.value = freq;
    filter.Q.value = 1.0;
    filter.gain.value = 0;
    return filter;
  });

  for (let i = 0; i < filters.length - 1; i++) {
    filters[i].connect(filters[i + 1]);
  }

  // --- Build the band UI ---------------------------------------------
  const sliders = [];

  FREQUENCIES.forEach((freq, i) => {
    const band = document.createElement('div');
    band.className = 'eq__band';

    const sliderWrap = document.createElement('div');
    sliderWrap.className = 'eq__slider-wrap';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'eq__slider';
    slider.id = `band-${freq}`;
    slider.min = '-12';
    slider.max = '12';
    slider.step = '0.5';
    slider.value = '0';
    slider.style.setProperty('--fill', '50%'); // 0dB sits at the midpoint of -12..12
    slider.setAttribute('aria-orientation', 'vertical');
    slider.setAttribute('aria-label', `${FREQUENCY_LABELS[i]} Hz gain`);
    slider.dataset.freq = String(freq);

    const freqLabel = document.createElement('span');
    freqLabel.className = 'eq__freq-label';
    freqLabel.textContent = FREQUENCY_LABELS[i];

    function applyValue(value) {
      const clamped = Math.min(12, Math.max(-12, value));
      if (parseFloat(slider.value) === clamped) return;
      slider.value = String(clamped);
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }

    slider.addEventListener('input', () => {
      const value = parseFloat(slider.value);
      filters[i].gain.value = value;
      // Same fill technique as the volume slider (player.css /
      // panner-volume.js) — percentage of this slider's own min..max
      // range, since the rotate transform doesn't change how the
      // underlying horizontal input reports its value.
      const percent = ((value - (-12)) / (12 - -12)) * 100;
      slider.style.setProperty('--fill', `${percent}%`);
      bandsEl.dispatchEvent(new CustomEvent('eq:changed', { bubbles: true }));
    });

    // Pointer interaction lives on the wrap, not the (pointer-events:
    // none) slider itself — see the comment in eq.css. Value is derived
    // directly from the pointer's vertical position within the wrap, so
    // it can't be misread as belonging to an adjacent band the way the
    // native rotated input's own click handling could be.
    function valueFromPointer(clientY) {
      const rect = sliderWrap.getBoundingClientRect();
      let percent = 1 - (clientY - rect.top) / rect.height; // top = max, bottom = min
      percent = Math.min(1, Math.max(0, percent));
      const raw = -12 + percent * 24;
      return Math.round(raw / 0.5) * 0.5; // snap to the 0.5dB step
    }

    sliderWrap.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      slider.focus();
      sliderWrap.setPointerCapture(e.pointerId);
      sliderWrap.classList.add('is-dragging');
      applyValue(valueFromPointer(e.clientY));
    });

    sliderWrap.addEventListener('pointermove', (e) => {
      if (!sliderWrap.hasPointerCapture(e.pointerId)) return;
      applyValue(valueFromPointer(e.clientY));
    });

    function endDrag(e) {
      if (sliderWrap.hasPointerCapture(e.pointerId)) {
        sliderWrap.releasePointerCapture(e.pointerId);
      }
      sliderWrap.classList.remove('is-dragging');
    }

    sliderWrap.addEventListener('pointerup', endDrag);
    sliderWrap.addEventListener('pointercancel', endDrag);

    sliderWrap.appendChild(slider);
    band.append(sliderWrap, freqLabel);
    bandsEl.insertBefore(band, resetColumn);

    sliders.push(slider);
  });

  // --- Activate / deactivate ------------------------------------------
  // Deactivating doesn't tear down the graph — it just zeroes every
  // filter's gain (flat response) and remembers the prior values so
  // re-activating restores exactly what the visitor had dialed in.
  let isActive = false;
  let savedGains = filters.map(() => 0);

  function setActive(active) {
    isActive = active;

    if (active) {
      filters.forEach((filter, i) => {
        filter.gain.value = savedGains[i];
      });
      document.dispatchEvent(new CustomEvent('eqactivated'));
    } else {
      savedGains = filters.map((filter) => filter.gain.value);
      filters.forEach((filter) => {
        filter.gain.value = 0;
      });
      document.dispatchEvent(new CustomEvent('eqdeactivated'));
    }
    bandsEl.dispatchEvent(new CustomEvent('eq:changed', { bubbles: true }));
  }

  if (panelToggleBtn && panelEl) {
    panelToggleBtn.addEventListener('click', () => {
      // panels.js's own click listener on this same button (attached
      // earlier, before this module runs) has already flipped
      // #panel-eq's open/closed state by the time this fires, so read
      // it directly rather than tracking a separate on/off flag here.
      setActive(panelEl.classList.contains('is-open'));
    });
  }

  resetBtn.addEventListener('click', () => {
    filters.forEach((filter) => {
      filter.gain.value = 0;
    });
    sliders.forEach((slider) => {
      slider.value = '0';
      slider.style.setProperty('--fill', '50%');
    });
    savedGains = filters.map(() => 0);
    bandsEl.dispatchEvent(new CustomEvent('eq:changed', { bubbles: true }));
  });

  return {
    inputNode: filters[0],
    outputNode: filters[filters.length - 1],
    filters,
    bandsElement: bandsEl,
  };
}
