import type { PointerSample, Scene, SceneContext, SceneSettings } from '../core/types';
import { PALETTES, samplePalette } from '../palettes';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const LAKE_SCALE = 4;
// Fluid-like solver: waves propagate & interfere, then DISSIPATE back to calm.
const LAKE_DAMP = [0.992, 0.986, 0.978]; // Vif / Doux / Profond
const LAKE_VISC = [0.014, 0.032, 0.06];
const LAKE_EDGE = 22; // absorbing shore width, in grid cells

/**
 * Tableau « Lac nocturne » — a height-field water simulation.
 *
 * A wave-equation solver runs on a down-sampled grid (LAKE_SCALE) that is
 * up-scaled smoothly to the screen. Touching the surface stamps disturbances;
 * waves propagate, interfere and dissipate, with absorbing shores so the basin
 * always settles back to calm instead of ringing forever.
 */
export class NightLakeScene implements Scene {
  readonly id = 'night-lake';
  readonly name = 'Lac nocturne';
  readonly paletteCount = PALETTES.length;
  readonly knobLabel = 'Onde';
  readonly knobOptions = ['Vif', 'Doux', 'Profond'] as const;
  readonly supportsAuto = false;
  readonly hint = {
    title: "Effleure l'eau",
    sub: 'Touche et glisse pour rider la surface · Échap : réglages'
  };

  onPaletteChange?: (index: number) => void;

  private ctx!: CanvasRenderingContext2D;
  private fx!: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private cssW = 0;
  private cssH = 0;
  private gw = 0;
  private gh = 0;
  private settings!: SceneSettings;

  private bufA = new Float32Array(0);
  private bufB = new Float32Array(0);
  private img: ImageData | null = null;
  private buf: HTMLCanvasElement | null = null;
  private bufCtx: CanvasRenderingContext2D | null = null;
  private rowR = new Float32Array(0);
  private rowG = new Float32Array(0);
  private rowB = new Float32Array(0);

  private paletteIndex = 0;
  private level = 1;
  private readonly last = new Map<number, { x: number; y: number }>();

  mount(context: SceneContext): void {
    this.ctx = context.ctx;
    this.fx = context.fx;
    this.settings = context.settings;
    this.dpr = context.dpr;
    this.paletteIndex = clamp(this.settings.palette, 0, this.paletteCount - 1);
    this.level = clamp(this.settings.symmetry, 0, 2);
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.cssW = width / dpr;
    this.cssH = height / dpr;
    this.fx.clearRect(0, 0, width, height);
    this.buildGrid();
  }

  setPalette(index: number): void {
    this.paletteIndex = clamp(index, 0, this.paletteCount - 1);
    this.buildBase();
  }

  setSymmetry(level: number): void {
    this.level = clamp(level, 0, 2);
  }

  setAuto(_on: boolean): void {
    /* contemplative scene — no auto mode */
  }

  reset(): void {
    this.bufA.fill(0);
    this.bufB.fill(0);
  }

  unmount(): void {
    this.last.clear();
  }

  onInput(s: PointerSample): void {
    if (s.phase === 'start') {
      this.last.set(s.id, { x: s.x, y: s.y });
      this.disturb(s.x, s.y, 300, 3);
    } else if (s.phase === 'move') {
      const p = this.last.get(s.id);
      if (!p) return;
      // Stamp along the moved segment so a fast drag leaves a continuous wake.
      const dist = Math.hypot(s.x - p.x, s.y - p.y);
      const steps = Math.min(8, Math.max(1, Math.round(dist / (8 * this.dpr))));
      const amp = 60 + clamp(s.speed / this.dpr, 0, 2.5) * 120;
      for (let k = 1; k <= steps; k++) {
        const f = k / steps;
        this.disturb(p.x + (s.x - p.x) * f, p.y + (s.y - p.y) * f, amp / steps + amp * 0.4, 2);
      }
      p.x = s.x;
      p.y = s.y;
    } else {
      this.last.delete(s.id);
    }
  }

  update(_dt: number, _timeMs: number): void {
    this.step();
    this.render();
  }

  // --- internals -----------------------------------------------------------

  private get palette() {
    return PALETTES[this.paletteIndex];
  }

  private buildBase(): void {
    if (this.gh === 0) return;
    this.rowR = new Float32Array(this.gh);
    this.rowG = new Float32Array(this.gh);
    this.rowB = new Float32Array(this.gh);
    const top = samplePalette(this.palette, 0.62);
    const bot = samplePalette(this.palette, 0.16);
    for (let y = 0; y < this.gh; y++) {
      const t = y / Math.max(1, this.gh - 1);
      this.rowR[y] = lerp(top.r * 0.12, bot.r * 0.2, t) + 3;
      this.rowG[y] = lerp(top.g * 0.14, bot.g * 0.22, t) + 6;
      this.rowB[y] = lerp(top.b * 0.2, bot.b * 0.28, t) + 12;
    }
  }

  private buildGrid(): void {
    if (!this.cssW || !this.cssH) return;
    this.gw = Math.max(8, Math.ceil(this.cssW / LAKE_SCALE));
    this.gh = Math.max(8, Math.ceil(this.cssH / LAKE_SCALE));
    const n = this.gw * this.gh;
    this.bufA = new Float32Array(n);
    this.bufB = new Float32Array(n);
    this.buf = document.createElement('canvas');
    this.buf.width = this.gw;
    this.buf.height = this.gh;
    this.bufCtx = this.buf.getContext('2d');
    this.img = this.bufCtx ? this.bufCtx.createImageData(this.gw, this.gh) : null;
    this.buildBase();
  }

  private disturb(sx: number, sy: number, amp: number, rad: number): void {
    const gx = Math.round(sx / this.dpr / LAKE_SCALE);
    const gy = Math.round(sy / this.dpr / LAKE_SCALE);
    const r = Math.max(1, rad | 0);
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const px = gx + x;
        const py = gy + y;
        if (px < 1 || py < 1 || px >= this.gw - 1 || py >= this.gh - 1) continue;
        const d = Math.sqrt(x * x + y * y);
        if (d > r) continue;
        this.bufA[py * this.gw + px] -= amp * (1 - d / r);
      }
    }
  }

  private step(): void {
    const src = this.bufA;
    const dst = this.bufB;
    const damp = LAKE_DAMP[this.level];
    const visc = LAKE_VISC[this.level];
    const gw = this.gw;
    for (let y = 1; y < this.gh - 1; y++) {
      let i = y * gw + 1;
      for (let x = 1; x < gw - 1; x++, i++) {
        const avg = (src[i - 1] + src[i + 1] + src[i - gw] + src[i + gw]) * 0.25;
        let v = avg * 2 - dst[i]; // wave equation (propagation)
        v += (avg - v) * visc; // viscosity: cohere & smooth
        v *= damp; // linear loss -> settles to calm
        if (v > 60 || v < -60) v *= 0.97; // extra loss on big swells
        const m = x < y ? x : y;
        const e2 = gw - 1 - x < this.gh - 1 - y ? gw - 1 - x : this.gh - 1 - y;
        const edge = m < e2 ? m : e2;
        if (edge < LAKE_EDGE) v *= 0.55 + 0.45 * (edge / LAKE_EDGE); // absorbing shore
        dst[i] = v;
      }
    }
    this.bufA = dst;
    this.bufB = src;
  }

  private render(): void {
    if (!this.img || !this.bufCtx || !this.buf) return;
    const data = this.img.data;
    const cur = this.bufA;
    const reduced = this.settings.reducedEffects;
    const gw = this.gw;
    let i = 0;
    for (let y = 0; y < this.gh; y++) {
      const br = this.rowR[y];
      const bg = this.rowG[y];
      const bb = this.rowB[y];
      for (let x = 0; x < gw; x++, i++) {
        const h = cur[i];
        const dx = x > 0 && x < gw - 1 ? cur[i - 1] - cur[i + 1] : 0;
        const dy = y > 0 && y < this.gh - 1 ? cur[i - gw] - cur[i + gw] : 0;
        const spec = dx * 1.0 - dy * 0.55;
        const glint = !reduced && spec > 0 ? spec * spec : 0;
        const r = br + h * 9 + dx * 40 + glint;
        const g = bg + h * 12 + dx * 46 + glint;
        const b = bb + h * 17 + dx * 56 + glint * 1.1;
        const o = i << 2;
        data[o] = r < 0 ? 0 : r > 255 ? 255 : r;
        data[o + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
        data[o + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
        data[o + 3] = 255;
      }
    }
    this.bufCtx.putImageData(this.img, 0, 0);
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.drawImage(this.buf, 0, 0, this.gw, this.gh, 0, 0, this.width, this.height);
  }
}
