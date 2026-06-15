import './style.css';
import { InputManager } from './core/InputManager';
import { RenderLoop } from './core/RenderLoop';
import { SettingsStore } from './core/SettingsStore';
import { SceneManager } from './core/SceneManager';
import { CaptureManager } from './core/CaptureManager';
import { PerformanceMonitor } from './core/PerformanceMonitor';
import { Controls } from './ui/Controls';
import { Gallery } from './ui/Gallery';
import { SCENES } from './scenes/registry';

/**
 * Sensoria — application shell.
 *
 * A home gallery (Phase 1 navigation) opens any tableau full-screen on the
 * shared socle (input / render / settings). Each tableau is an interchangeable
 * Scene; switching is just mount/unmount on the SceneManager.
 */

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const fxCanvas = document.getElementById('fx') as HTMLCanvasElement;
const cursorEl = document.getElementById('cursor') as HTMLElement;

const settings = new SettingsStore();
const perf = new PerformanceMonitor();
const perfView = {
  get quality(): number {
    return perf.value;
  }
};

// A mutable settings view kept in sync with the store for the scenes.
const settingsView = { ...settings.get() };
settings.subscribe((s) => Object.assign(settingsView, s));

const sceneManager = new SceneManager(canvas, fxCanvas, settingsView, perfView);
const input = new InputManager(canvas, () => dpr);
const capture = new CaptureManager(canvas);
const controls = new Controls(settings, capture);

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
resize();

// --- Navigation -------------------------------------------------------------
const gallery = new Gallery(
  document.getElementById('gallery') as HTMLElement,
  SCENES,
  enterScene
);

function enterScene(id: string): void {
  const meta = SCENES.find((m) => m.id === id);
  if (!meta?.available || !meta.create) return;
  const scene = meta.create();
  sceneManager.mount(scene);
  controls.bind(scene);
  controls.showHint();
  document.body.classList.add('in-scene');
  gallery.hide();
}

function exitScene(): void {
  sceneManager.unmountCurrent();
  (document.getElementById('panel') as HTMLElement).hidden = true;
  document.body.classList.remove('in-scene');
  gallery.show();
}

document.getElementById('back')?.addEventListener('click', exitScene);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('in-scene')) {
    // Escape closes an open panel first, otherwise returns to the gallery.
    const panel = document.getElementById('panel') as HTMLElement;
    if (!panel.hidden) panel.hidden = true;
    else exitScene();
  }
});

// --- Input ------------------------------------------------------------------
input.on((sample) => {
  if (!sceneManager.scene) return;
  controls.dismissHint();
  sceneManager.input(sample);
});

// Soft cursor halo (mouse only, scene only via CSS).
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

// --- Frame loop -------------------------------------------------------------
const loop = new RenderLoop((dt, time) => {
  perf.sample(dt);
  sceneManager.update(dt, time);
});
loop.start();

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
