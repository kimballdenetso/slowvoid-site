/* ==========================================================================
   VISUALIZER3D.JS
   The 3D model. Per the project plan this is NOT audio-reactive — it
   responds only to:
     - EQ activation/deactivation  → shows/hides a piece of the model
     - Volume slider value          → rotates a knob mesh on the model
     - Cursor position over canvas  → subtle whole-model parallax rotation

   One persistent .glb model (no swapping — see project-plan.md Section
   3.4/7). The exact mesh names below are placeholders until the real
   model is built; if a named mesh isn't found, that one behavior is
   skipped with a console warning rather than breaking the whole scene —
   idle rotation and cursor parallax still work even before the model has
   a rigged knob/reveal piece. Fine detail here is Phase 2 work; this is
   the "basic version" the project plan calls for in Phase 1.

   Loaded via CDN ESM builds so no bundler/build step is needed — this
   works as-is on Bluehost or MAMP, just needs internet access at runtime
   for the Three.js library itself (the .glb model is served locally).
   ========================================================================== */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* --------------------------------------------------------------------------
   CONFIG — update these once the real model exists.
   -------------------------------------------------------------------------- */
const MODEL_URL = 'assets/models/model.glb';
const KNOB_MESH_NAME = 'Knob';        // rotated by the volume slider
const REVEAL_MESH_NAME = 'EQReveal';  // shown/hidden by EQ activation

const KNOB_MIN_DEGREES = -135;
const KNOB_MAX_DEGREES = 135;
const MAX_PARALLAX_RADIANS = 0.25; // how far cursor movement can rotate the whole model
const PARALLAX_EASE = 0.06;        // lower = smoother/laggier follow

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function initVisualizer3D() {
  const container = document.querySelector('.visualizer3d');
  if (!container) return;

  const canvas = container.querySelector('.visualizer3d__canvas');
  container.classList.add('is-loading');

  // --- Renderer / scene / camera ---------------------------------------
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 6);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
  keyLight.position.set(3, 4, 5);
  scene.add(keyLight);

  let modelRoot = null;
  let knobMesh = null;
  let revealMesh = null;

  function resize() {
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
  }

  // --- Load the model ----------------------------------------------------
  const loader = new GLTFLoader();
  loader.load(
    MODEL_URL,
    (gltf) => {
      modelRoot = gltf.scene;
      scene.add(modelRoot);

      knobMesh = modelRoot.getObjectByName(KNOB_MESH_NAME);
      if (!knobMesh) {
        console.warn(
          `visualizer3d.js: no mesh named "${KNOB_MESH_NAME}" found — volume won't visibly rotate anything until the model has one.`
        );
      }

      revealMesh = modelRoot.getObjectByName(REVEAL_MESH_NAME);
      if (revealMesh) {
        revealMesh.visible = false; // hidden until the EQ is activated
      } else {
        console.warn(
          `visualizer3d.js: no mesh named "${REVEAL_MESH_NAME}" found — EQ activation won't reveal anything until the model has one.`
        );
      }

      container.classList.remove('is-loading');
      resize();
    },
    undefined,
    (error) => {
      console.error('visualizer3d.js: failed to load model', error);
      showFallback();
    }
  );

  function showFallback() {
    container.classList.remove('is-loading');
    container.classList.add('has-error');
    const message = document.createElement('p');
    message.className = 'visualizer3d__fallback-message';
    message.textContent = 'Visual unavailable right now.';
    container.appendChild(message);
  }

  // --- Cursor parallax (idle state) --------------------------------------
  let targetRotationX = 0;
  let targetRotationY = 0;
  let currentRotationX = 0;
  let currentRotationY = 0;

  container.addEventListener('pointermove', (event) => {
    const rect = container.getBoundingClientRect();
    const offsetX = (event.clientX - rect.left) / rect.width - 0.5; // -0.5..0.5
    const offsetY = (event.clientY - rect.top) / rect.height - 0.5;
    targetRotationY = offsetX * MAX_PARALLAX_RADIANS * 2;
    targetRotationX = offsetY * MAX_PARALLAX_RADIANS * 2;
  });

  container.addEventListener('pointerleave', () => {
    targetRotationX = 0;
    targetRotationY = 0;
  });

  // --- Volume → knob rotation ---------------------------------------------
  document.addEventListener('volumechange', (event) => {
    if (!knobMesh) return;
    const value = Math.max(0, Math.min(1, event.detail.value)); // 0..1
    const degrees = KNOB_MIN_DEGREES + value * (KNOB_MAX_DEGREES - KNOB_MIN_DEGREES);
    knobMesh.rotation.z = THREE.MathUtils.degToRad(degrees);
  });

  // --- EQ activation → reveal/hide ----------------------------------------
  document.addEventListener('eqactivated', () => {
    if (revealMesh) revealMesh.visible = true;
  });

  document.addEventListener('eqdeactivated', () => {
    if (revealMesh) revealMesh.visible = false;
  });

  // --- Render loop ---------------------------------------------------------
  function animate() {
    requestAnimationFrame(animate);

    if (modelRoot) {
      if (prefersReducedMotion) {
        // Skip the smoothed chase entirely — snap straight to target
        // (still subtle, since MAX_PARALLAX_RADIANS is small) rather
        // than running a continuous animation loop's worth of motion.
        modelRoot.rotation.x = targetRotationX;
        modelRoot.rotation.y = targetRotationY;
      } else {
        currentRotationX += (targetRotationX - currentRotationX) * PARALLAX_EASE;
        currentRotationY += (targetRotationY - currentRotationY) * PARALLAX_EASE;
        modelRoot.rotation.x = currentRotationX;
        modelRoot.rotation.y = currentRotationY;
      }
    }

    renderer.render(scene, camera);
  }

  window.addEventListener('resize', resize);
  resize();
  animate();
}

document.addEventListener('DOMContentLoaded', initVisualizer3D);
