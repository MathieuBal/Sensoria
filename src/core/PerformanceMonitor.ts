/**
 * Lightweight frame-rate watchdog (§6.3 / §7 perf constraints).
 *
 * Tracks a smoothed FPS and exposes a 0..1 `quality` knob that scenes can use
 * to scale particle counts, sub-stepping or glow. Quality drifts down when
 * frames are consistently slow and recovers slowly when there is headroom, so
 * the experience "degrades cleanly" instead of stuttering.
 */
export class PerformanceMonitor {
  private fpsEma = 60;
  private quality = 1;
  private accum = 0;
  private frames = 0;

  /** Feed one frame's delta time (ms). */
  sample(dt: number): void {
    if (dt <= 0) return;
    const fps = 1000 / dt;
    this.fpsEma = this.fpsEma * 0.9 + fps * 0.1;

    this.accum += dt;
    this.frames++;
    if (this.accum < 500) return; // re-evaluate twice per second
    this.accum = 0;
    this.frames = 0;

    if (this.fpsEma < 45) {
      this.quality = Math.max(0.4, this.quality - 0.1);
    } else if (this.fpsEma > 56) {
      this.quality = Math.min(1, this.quality + 0.05);
    }
  }

  get value(): number {
    return this.quality;
  }

  get fps(): number {
    return this.fpsEma;
  }
}
