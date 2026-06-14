import type { PointerSample, InputPhase } from './types';

type Listener = (sample: PointerSample) => void;

interface Track {
  id: number;
  x: number;
  y: number;
  t: number;
  vx: number;
  vy: number;
}

/**
 * Unified pointer engine for PC and mobile.
 *
 * - Built on Pointer Events so mouse, pen and multi-touch share one path.
 * - Emits {@link PointerSample}s in device pixels with smoothed velocity.
 * - Velocity is exponentially smoothed so fast flicks stay expressive without
 *   jitter, which the scene uses to modulate width, brightness and inertia.
 *
 * The InputManager is deliberately scene-agnostic — it knows nothing about
 * what is drawn, satisfying the "isolate the input engine" definition of done.
 */
export class InputManager {
  private readonly el: HTMLElement;
  private readonly tracks = new Map<number, Track>();
  private readonly listeners = new Set<Listener>();
  private dprProvider: () => number;

  /** Smoothing factor for velocity (0 = none, 1 = frozen). */
  private readonly velSmoothing = 0.6;

  constructor(el: HTMLElement, dprProvider: () => number) {
    this.el = el;
    this.dprProvider = dprProvider;
    this.attach();
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** True while at least one pointer is pressed — used to pause auto mode. */
  get active(): boolean {
    return this.tracks.size > 0;
  }

  private attach(): void {
    const opts: AddEventListenerOptions = { passive: false };
    this.el.addEventListener('pointerdown', this.onDown, opts);
    this.el.addEventListener('pointermove', this.onMove, opts);
    this.el.addEventListener('pointerup', this.onUp, opts);
    this.el.addEventListener('pointercancel', this.onUp, opts);
    this.el.addEventListener('pointerleave', this.onUp, opts);
    // Block native gestures (scroll, pinch-zoom, context menu) over the canvas.
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  dispose(): void {
    this.el.removeEventListener('pointerdown', this.onDown);
    this.el.removeEventListener('pointermove', this.onMove);
    this.el.removeEventListener('pointerup', this.onUp);
    this.el.removeEventListener('pointercancel', this.onUp);
    this.el.removeEventListener('pointerleave', this.onUp);
    this.tracks.clear();
    this.listeners.clear();
  }

  private toLocal(e: PointerEvent): { x: number; y: number } {
    const rect = this.el.getBoundingClientRect();
    const dpr = this.dprProvider();
    return {
      x: (e.clientX - rect.left) * dpr,
      y: (e.clientY - rect.top) * dpr
    };
  }

  private readonly onDown = (e: PointerEvent): void => {
    e.preventDefault();
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
    const { x, y } = this.toLocal(e);
    this.tracks.set(e.pointerId, { id: e.pointerId, x, y, t: e.timeStamp, vx: 0, vy: 0 });
    this.emit('start', e, x, y, 0, 0, 0);
  };

  private readonly onMove = (e: PointerEvent): void => {
    const track = this.tracks.get(e.pointerId);
    if (!track) return; // ignore hover moves with no button pressed
    e.preventDefault();

    // Coalesced events give every intermediate position from the OS, which
    // keeps the stroke continuous even on very fast flicks.
    const events =
      typeof e.getCoalescedEvents === 'function' && e.getCoalescedEvents().length > 0
        ? e.getCoalescedEvents()
        : [e];

    for (const ev of events) {
      const { x, y } = this.toLocal(ev);
      const dt = Math.max(1, ev.timeStamp - track.t);
      const instVx = (x - track.x) / dt;
      const instVy = (y - track.y) / dt;
      track.vx = track.vx * this.velSmoothing + instVx * (1 - this.velSmoothing);
      track.vy = track.vy * this.velSmoothing + instVy * (1 - this.velSmoothing);
      this.emit('move', ev, x, y, track.vx, track.vy, dt, track.x, track.y);
      track.x = x;
      track.y = y;
      track.t = ev.timeStamp;
    }
  };

  private readonly onUp = (e: PointerEvent): void => {
    const track = this.tracks.get(e.pointerId);
    if (!track) return;
    e.preventDefault();
    this.emit('end', e, track.x, track.y, track.vx, track.vy, 0);
    this.tracks.delete(e.pointerId);
  };

  private emit(
    phase: InputPhase,
    e: PointerEvent,
    x: number,
    y: number,
    vx: number,
    vy: number,
    dt: number,
    px = x,
    py = y
  ): void {
    const sample: PointerSample = {
      id: e.pointerId,
      phase,
      x,
      y,
      px,
      py,
      vx,
      vy,
      speed: Math.hypot(vx, vy),
      dt,
      pressure: e.pressure > 0 ? e.pressure : 0.5,
      synthetic: false
    };
    for (const l of this.listeners) l(sample);
  }

  /** Broadcast a synthetic sample (auto mode). */
  inject(sample: PointerSample): void {
    for (const l of this.listeners) l(sample);
  }
}
