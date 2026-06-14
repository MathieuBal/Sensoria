import './style.css';
import { InputManager } from './core/InputManager';
import { RenderLoop } from './core/RenderLoop';
import { SettingsStore } from './core/SettingsStore';
import { SceneManager } from './core/SceneManager';
import { CaptureManager } from './core/CaptureManager';
import { PerformanceMonitor } from './core/PerformanceMonitor';
import { MosaicScene } from './scenes/MosaicScene';
import { Controls } from './ui/Controls';

/**
 * Sensoria — wiring of the reusable socle for the first tableau.
 *
 * Phase 0 (prototype "sensation") + Phase 1 (socle) from the roadmap:
 * a single full-screen scene plugged onto a shared input / render / settings
 * foundation. Adding a new tableau later means only writing a new Scene.
 */

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const fxCanvas = document.getElementById('fx') as HTMLCanvasElement;
const cursorEl = document.getElementById('cursor') as HTMLElement;

const settings = new SettingsStore();
const perf = new PerformanceMonitor();
// `perf` exposes a live `quality` value to scenes via a thin view object.
const perfView = {
  get quality(): number {
    return perf.value;
  }
};

const sceneManager = new SceneManager(canvas, fxCanvas, createLiveSettingsView(), perfView);

function createLiveSettingsView() {
  // SceneManager needs a mutable settings object kept in sync with the store,
  // so scenes always read the latest palette / reducedEffects values.
  const view = { ...settings.get() };
  settings.subscribe((s) => Object.assign(view, s));
  return view;
}

// --- Responsive backing store (device pixels, capped DPR for perf) ----------
let dpr = 1;
function resize(): void {
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = Math.round(window.innerWidth * dpr);
  const h = Math.round(window.innerHeight * dpr);
  for (const c of [canvas, fxCanvas]) {
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    c.style.width = `${window.innerWidth}px`;
    c.style.height = `${window.innerHeight}px`;
  }
  sceneManager.resize(w, h, dpr);
}

// --- Input ------------------------------------------------------------------
const input = new InputManager(canvas, () => dpr);
const capture = new CaptureManager(canvas);

// --- Scene ------------------------------------------------------------------
const scene = new MosaicScene();
sceneManager.mount(scene);
resize();

const controls = new Controls(settings, scene, capture);

// Keep the palette UI in sync when the scene cycles palette itself (double-tap).
scene.onPaletteChange = (i) => controls.reflectPalette(i);

input.on((sample) => {
  controls.dismissHint();
  sceneManager.input(sample);
});

// --- Soft cursor halo (mouse only) -----------------------------------------
window.addEventListener(
  'pointermove',
  (e) => {
    if (e.pointerType !== 'mouse') {
      cursorEl.style.opacity = '0';
      return;
    }
    cursorEl.style.opacity = '1';
    cursorEl.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
  },
  { passive: true }
);
window.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse') cursorEl.classList.add('is-down');
});
window.addEventListener('pointerup', () => cursorEl.classList.remove('is-down'));
window.addEventListener('pointerleave', () => (cursorEl.style.opacity = '0'));

// --- Frame loop -------------------------------------------------------------
const loop = new RenderLoop((dt, time) => {
  perf.sample(dt);
  sceneManager.update(dt, time);
});
loop.start();

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
