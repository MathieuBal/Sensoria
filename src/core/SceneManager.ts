import type { PointerSample, Scene, SceneContext, SceneSettings } from './types';

/**
 * Owns the active tableau and routes lifecycle, resize, frames and input to it
 * (§6.1 SceneManager). Built to host many scenes so the gallery can switch
 * between tableaux later; the prototype simply mounts one.
 */
export class SceneManager {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly settings: SceneSettings;
  private readonly perf: { quality: number };
  private current: Scene | null = null;
  private width = 0;
  private height = 0;
  private dpr = 1;

  constructor(
    canvas: HTMLCanvasElement,
    settings: SceneSettings,
    perf: { quality: number }
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
    this.settings = settings;
    this.perf = perf;
  }

  mount(scene: Scene): void {
    if (this.current) this.current.unmount();
    this.current = scene;
    const context: SceneContext = {
      canvas: this.canvas,
      ctx: this.ctx,
      width: this.width,
      height: this.height,
      dpr: this.dpr,
      settings: this.settings,
      perf: this.perf
    };
    scene.mount(context);
    scene.resize(this.width, this.height, this.dpr);
    scene.setPalette(this.settings.palette);
    scene.setSymmetry(this.settings.symmetry);
    scene.setAuto(this.settings.auto);
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.current?.resize(width, height, dpr);
  }

  update(dt: number, timeMs: number): void {
    this.current?.update(dt, timeMs);
  }

  input(sample: PointerSample): void {
    this.current?.onInput(sample);
  }

  get scene(): Scene | null {
    return this.current;
  }
}
