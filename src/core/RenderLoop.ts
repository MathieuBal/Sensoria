type FrameCallback = (dt: number, timeMs: number) => void;

/**
 * requestAnimationFrame loop with a clamped delta time, automatic pause when
 * the tab/app is hidden, and a frame budget hook.
 *
 * Keeping a single shared loop (rather than one per scene) avoids drift and
 * lets the PerformanceMonitor reason about a single frame cadence.
 */
export class RenderLoop {
  private readonly cb: FrameCallback;
  private rafId = 0;
  private last = 0;
  private running = false;
  /** Cap on dt to avoid huge jumps after a pause (ms). */
  private readonly maxDt = 1000 / 20;

  constructor(cb: FrameCallback) {
    this.cb = cb;
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  dispose(): void {
    this.stop();
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private readonly onVisibility = (): void => {
    // Suspend work in the background to save battery (perf constraint §6.3).
    if (document.hidden) this.stop();
    else this.start();
  };

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    const dt = Math.min(this.maxDt, now - this.last);
    this.last = now;
    this.cb(dt, now);
    this.rafId = requestAnimationFrame(this.tick);
  };
}
