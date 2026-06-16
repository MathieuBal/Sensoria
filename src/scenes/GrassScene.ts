import type { PointerSample, Scene, SceneContext, SceneSettings } from '../core/types';
import { PALETTES, samplePalette } from '../palettes';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

// Registry id stays 'paper-cut' (historical); the tableau is now « Brise ».
const GRASS_SPEC = [
  { count: 620, hFrac: 0.16, wMul: 1.0, amb: 0.1 }, // Herbe — dense, short
  { count: 430, hFrac: 0.3, wMul: 1.5, amb: 0.13 }, // Blé
  { count: 280, hFrac: 0.5, wMul: 2.2, amb: 0.17 } // Roseaux — sparse, tall
];

interface Blade {
  x: number;
  by: number;
  h: number;
  d: number;
  w: number;
  seed: number;
  colorT: number;
  sway: number;
  swayV: number;
}

/**
 * Tableau « Brise » — a luminous meadow under a pale dawn sky. Hundreds of grass
 * blades stand in depth; the gesture is a gust that bends them in travelling
 * waves before they spring back. The only deliberately light tableau.
 */
export class GrassScene implements Scene {
  readonly id = 'paper-cut';
  readonly name = 'Brise';
  readonly paletteCount = PALETTES.length;
  readonly knobLabel = 'Pousse';
  readonly knobOptions = ['Herbe', 'Blé', 'Roseaux'] as const;
  readonly supportsAuto = false;
  readonly hint = {
    title: 'Lève le vent',
    sub: 'Balaie pour coucher les herbes · double-tap : rafale · Échap : réglages'
  };

  onPaletteChange?: (index: number) => void;

  private ctx!: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private horizon = 0;
  private settings!: SceneSettings;
  private paletteIndex = 0;
  private level = 1;

  private blades: Blade[] = [];
  private readonly pointers = new Map<number, { x: number; y: number; vx: number }>();
  private windT = 0;
  private gust = 0;
  private gustX = 0;
  private lastTapMs = -Infinity;
  private lastTapX = 0;
  private lastTapY = 0;

  mount(c: SceneContext): void {
    this.ctx = c.ctx;
    this.settings = c.settings;
    this.dpr = c.dpr;
    this.paletteIndex = clamp(this.settings.palette, 0, this.paletteCount - 1);
    this.level = clamp(this.settings.symmetry, 0, 2);
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.build();
  }

  setPalette(i: number): void {
    this.paletteIndex = clamp(i, 0, this.paletteCount - 1);
  }
  setSymmetry(i: number): void {
    this.level = clamp(i, 0, 2);
    this.build();
  }
  setAuto(_on: boolean): void {}
  reset(): void {
    this.gust = 0;
    this.build();
  }
  unmount(): void {
    this.pointers.clear();
  }

  onInput(s: PointerSample): void {
    if (s.phase === 'start') {
      const now = performance.now();
      const isDouble = now - this.lastTapMs < 300 && Math.hypot(s.x - this.lastTapX, s.y - this.lastTapY) < 80 * this.dpr;
      this.lastTapMs = now;
      this.lastTapX = s.x;
      this.lastTapY = s.y;
      this.pointers.set(s.id, { x: s.x, y: s.y, vx: 0 });
      if (isDouble) {
        this.gust = 1;
        this.gustX = s.x;
        navigator.vibrate?.(this.settings.reducedEffects ? 0 : 16);
      }
    } else if (s.phase === 'move') {
      const p = this.pointers.get(s.id);
      if (p) {
        p.vx = s.vx;
        p.x = s.x;
        p.y = s.y;
      }
    } else {
      this.pointers.delete(s.id);
    }
  }

  update(dt: number, _t: number): void {
    this.simulate(dt);
    this.render();
  }

  private get palette() {
    return PALETTES[this.paletteIndex];
  }

  private build(): void {
    const spec = GRASS_SPEC[this.level];
    this.horizon = this.height * 0.42;
    this.blades = [];
    for (let i = 0; i < spec.count; i++) {
      const d = Math.random();
      const by = this.horizon + d * (this.height - this.horizon);
      const h = (0.04 + d * spec.hFrac) * this.height;
      this.blades.push({ x: Math.random() * this.width, by, h, d, w: (1 + d * 1.6) * spec.wMul * this.dpr, seed: Math.random() * 6.28, colorT: 0.25 + Math.random() * 0.5, sway: 0, swayV: 0 });
    }
    this.blades.sort((a, b) => a.d - b.d);
  }

  private simulate(dt: number): void {
    const f = Math.min(2.4, dt / 16);
    const spec = GRASS_SPEC[this.level];
    this.windT += dt * 0.0016;
    if (this.gust > 0) this.gust = Math.max(0, this.gust - dt / 700);
    const ps = [...this.pointers.values()];
    for (const bl of this.blades) {
      let target = Math.sin(this.windT + bl.x * 0.006 + bl.seed) * spec.amb;
      for (const p of ps) {
        const dx = bl.x - p.x;
        const ad = Math.abs(dx);
        const infl = 230 * this.dpr;
        if (ad < infl) {
          const w = 1 - ad / infl;
          target += Math.sign(dx || 1) * w * (0.5 + Math.min(1.4, Math.abs(p.vx) * 0.5));
        }
      }
      if (this.gust > 0) {
        const ad = Math.abs(bl.x - this.gustX);
        const ring = (1 - this.gust) * 700 * this.dpr;
        if (Math.abs(ad - ring) < 130 * this.dpr) target += Math.sign(bl.x - this.gustX || 1) * this.gust * 1.1;
      }
      bl.swayV += (target - bl.sway) * 0.02 * f;
      bl.swayV *= Math.pow(0.9, f);
      bl.sway += bl.swayV * f;
    }
  }

  private render(): void {
    const ctx = this.ctx;
    const reduced = this.settings.reducedEffects;
    const sky = ctx.createLinearGradient(0, 0, 0, this.height);
    const hue = samplePalette(this.palette, 0.45);
    sky.addColorStop(0, `rgb(${(210 + hue.r * 0.06) | 0},${(216 + hue.g * 0.05) | 0},238)`);
    sky.addColorStop(0.5, 'rgb(236,228,238)');
    sky.addColorStop(1, `rgb(250,${(234 + hue.g * 0.02) | 0},214)`);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.width, this.height);
    const sun = samplePalette(this.palette, 0.7);
    const gg = ctx.createRadialGradient(this.width * 0.5, this.horizon, 0, this.width * 0.5, this.horizon, this.height * 0.5);
    gg.addColorStop(0, `rgba(${sun.r | 0},${sun.g | 0},${sun.b | 0},0.28)`);
    gg.addColorStop(1, `rgba(${sun.r | 0},${sun.g | 0},${sun.b | 0},0)`);
    ctx.fillStyle = gg;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.lineCap = 'round';
    for (const bl of this.blades) {
      const c = samplePalette(this.palette, bl.colorT);
      const dim = 0.45 + bl.d * 0.5;
      const haze = 1 - bl.d;
      const r = c.r * dim * (1 - haze * 0.55) + 210 * haze * 0.55;
      const g = c.g * dim * (1 - haze * 0.55) + 220 * haze * 0.55;
      const b = c.b * dim * (1 - haze * 0.55) + 235 * haze * 0.55;
      const bend = bl.sway * bl.h;
      const tipX = bl.x + bend;
      const tipY = bl.by - bl.h;
      ctx.strokeStyle = `rgba(${r | 0},${g | 0},${b | 0},${0.5 + bl.d * 0.5})`;
      ctx.lineWidth = bl.w;
      ctx.beginPath();
      ctx.moveTo(bl.x, bl.by);
      ctx.quadraticCurveTo(bl.x + bend * 0.4, bl.by - bl.h * 0.55, tipX, tipY);
      ctx.stroke();
      if (!reduced && bl.d > 0.5) {
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = bl.w * 0.4;
        ctx.beginPath();
        ctx.moveTo(bl.x + bend * 0.4, bl.by - bl.h * 0.55);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
      }
    }
  }
}
