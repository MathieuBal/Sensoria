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

const settings = new SettingsStore();
const perf = new PerformanceMonitor();
// `perf` exposes a live `quality` value to scenes via a thin view object.
const perfView = {
  get quality(): number {
    return perf.value;
  }
};

const sceneManager = new SceneManager(canvas, createLiveSettingsView(), perfView);

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
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
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

input.on((sample) => {
  controls.dismissHint();
  sceneManager.input(sample);
});

// --- Frame loop -------------------------------------------------------------
const loop = new RenderLoop((dt, time) => {
  perf.sample(dt);
  sceneManager.update(dt, time);
});
loop.start();

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
