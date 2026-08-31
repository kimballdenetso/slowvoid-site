/* ==========================================================================
   EQ.JS
   Builds the 10-band BiquadFilterNode chain and generates the band UI
   (sliders + gain readouts + freq labels) into .eq__bands, matching the
   markup contract documented at the top of css/eq.css.

   The ten bands are generated here from FREQUENCIES rather than
   hand-written ten times in index.html — one source of truth for the
   band list, and adding/removing a band later is a one-line change.

   Fires 'eqactivated' / 'eqdeactivated' on `document` when the EQ is
   toggled on/off — visualizer3d.js listens for these to reveal/hide a
   piece of the 3D model (see project-plan.md Section 3.4).
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
  const toggleBtn = eqEl.querySelector('.eq__toggle');
  const resetBtn = eqEl.querySelector('[data-action="eq-reset"]');
  const resetColumn = bandsEl.querySelector('.eq__band--reset');

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
  const gainReadouts = [];

  FREQUENCIES.forEach((freq, i) => {
    const band = document.createElement('div');
    band.className = 'eq__band';

    const gainValue = document.createElement('output');
    gainValue.className = 'eq__gain-value';
    gainValue.textContent = '0dB';
    gainValue.setAttribute('for', `band-${freq}`);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'eq__slider';
    slider.id = `band-${freq}`;
    slider.min = '-12';
    slider.max = '12';
    slider.step = '0.5';
    slider.value = '0';
    slider.setAttribute('aria-orientation', 'vertical');
    slider.setAttribute('aria-label', `${FREQUENCY_LABELS[i]} Hz gain`);
    slider.dataset.freq = String(freq);

    const freqLabel = document.createElement('span');
    freqLabel.className = 'eq__freq-label';
    freqLabel.textContent = FREQUENCY_LABELS[i];

    slider.addEventListener('input', () => {
      const value = parseFloat(slider.value);
      filters[i].gain.value = value;
      gainValue.textContent = `${value > 0 ? '+' : ''}${value}dB`;
      bandsEl.dispatchEvent(new CustomEvent('eq:changed', { bubbles: true }));
    });

    band.append(gainValue, slider, freqLabel);
    bandsEl.insertBefore(band, resetColumn);

    sliders.push(slider);
    gainReadouts.push(gainValue);
  });

  // --- Activate / deactivate ------------------------------------------
  // Deactivating doesn't tear down the graph — it just zeroes every
  // filter's gain (flat response) and remembers the prior values so
  // re-activating restores exactly what the visitor had dialed in.
  let isActive = false;
  let savedGains = filters.map(() => 0);

  function setActive(active) {
    isActive = active;
    toggleBtn.setAttribute('aria-pressed', String(active));

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

  toggleBtn.addEventListener('click', () => setActive(!isActive));

  resetBtn.addEventListener('click', () => {
    filters.forEach((filter) => {
      filter.gain.value = 0;
    });
    sliders.forEach((slider) => {
      slider.value = '0';
    });
    gainReadouts.forEach((output) => {
      output.textContent = '0dB';
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
