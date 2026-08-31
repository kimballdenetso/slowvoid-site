/* ==========================================================================
   PANNER-VOLUME.JS
   Builds the GainNode + StereoPannerNode and wires the volume/pan
   sliders to them. Matches the .player__levels markup in css/player.css.

   Fires 'volumechange' on `document` on every volume change — this is
   the one event visualizer3d.js listens to for the volume-linked knob
   rotation (see project-plan.md Section 3.4). Pan has no listeners
   outside this module, so it doesn't need an event.
   ========================================================================== */

/**
 * @param {AudioContext} audioContext
 * @returns {{ inputNode: AudioNode, outputNode: AudioNode, gainNode: GainNode, pannerNode: StereoPannerNode }}
 */
export function initPannerVolume(audioContext) {
  const gainNode = audioContext.createGain();
  const pannerNode = audioContext.createStereoPanner();
  gainNode.connect(pannerNode);

  const volumeSlider = document.querySelector('.player__range--volume');
  const panSlider = document.querySelector('.player__range--pan');

  function setVolume(value) {
    // value is 0..1
    gainNode.gain.value = value;
    // Drives the live teal fill on the slider track (see player.css,
    // .player__range--volume's linear-gradient uses this custom prop).
    volumeSlider.style.setProperty('--fill', `${value * 100}%`);
  }

  function setPan(value) {
    // value is -1 (full left) .. 1 (full right)
    pannerNode.pan.value = value;
  }

  // Initialize from whatever the sliders' HTML `value` attributes say,
  // so markup and audio state agree on first load.
  setVolume(parseFloat(volumeSlider.value) / 100);
  setPan(parseFloat(panSlider.value));

  volumeSlider.addEventListener('input', () => {
    const value = parseFloat(volumeSlider.value) / 100;
    setVolume(value);
    document.dispatchEvent(new CustomEvent('volumechange', { detail: { value } }));
  });

  panSlider.addEventListener('input', () => {
    setPan(parseFloat(panSlider.value));
  });

  return {
    inputNode: gainNode,
    outputNode: pannerNode,
    gainNode,
    pannerNode,
  };
}
