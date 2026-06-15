import type { PointerSample, Scene, SceneContext, SceneSettings } from '../core/types';
import { PALETTES, samplePalette } from '../palettes';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

const CLOTH_STIFF = [2, 3, 5]; // constraint iterations: Voile / Coton / Soie

interface CPoint {
  x: number;
  y: number;
  ox: number;
  oy: number;
  pin: boolean;
}
interface CPointer {
  x: number;
  y: number;
  px: number;
  py: number;
}

/**
 * Tableau « Toile de tissu » — a hanging cloth (Verlet grid + spring
 * constraints) you push, dent and tension, with a travelling satin sheen and an
 * ambient breeze. Knob = stiffness (Voile / Coton / Soie).
 */
export class ClothScene implements Scene {
  readonly id = 'cloth';
  readonly name = 'Toile de tissu';
  readonly paletteCount = PALETTES.length;
  readonly knobLabel = 'Étoffe';
  readonly knobOptions = ['Voile', 'Coton', 'Soie'] as const;
  readonly supportsAuto = false;
  readonly hint = {
    title: 'Pousse le tissu',
    sub: 'Glisse pour le déformer · double-tap : bourrasque · Échap : réglages'
  };

  onPaletteChange?: (index: number) => void;

  private ctx!: CanvasRenderingContext2D;
  private fx!: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private settings!: SceneSettings;
  private paletteIndex = 0;
  private level = 1;

  private cols = 0;
  private rows = 0;
  private spacing = 0;
  private originX = 0;
  private originY = 0;
  private P: CPoint[] = [];
  private readonly pointers = new Map<number, CPointer>();
  private lastTapMs = -Infinity;
  private lastTapX = 0;
  private lastTapY = 0;
  private gust = 0;

  mount(c: SceneContext): void {
    this.ctx = c.ctx;
    this.fx = c.fx;
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
  }
  setAuto(_on: boolean): void {}
  reset(): void {
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
      this.pointers.set(s.id, { x: s.x, y: s.y, px: s.x, py: s.y });
      if (isDouble) {
        this.gust = 1;
        navigator.vibrate?.(this.settings.reducedEffects ? 0 : 16);
      }
    } else if (s.phase === 'move') {
      const p = this.pointers.get(s.id);
      if (p) {
        p.px = p.x;
        p.py = p.y;
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
  private idx(c: number, r: number): number {
    return r * this.cols + c;
  }

  private build(): void {
    this.spacing = Math.max(20 * this.dpr, Math.min(this.width, this.height) / 26);
    this.cols = Math.max(6, Math.floor((this.width * 0.74) / this.spacing));
    this.rows = Math.max(5, Math.floor((this.height * 0.6) / this.spacing));
    this.originX = (this.width - (this.cols - 1) * this.spacing) / 2;
    this.originY = this.height * 0.12;
    this.P = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = this.originX + c * this.spacing;
        const y = this.originY + r * this.spacing;
        this.P.push({ x, y, ox: x, oy: y, pin: r === 0 && (c % 3 === 0 || c === this.cols - 1) });
      }
    }
  }

  private satisfy(a: CPoint, b: CPoint): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) + 0.0001;
    const diff = ((d - this.spacing) / d) * 0.5;
    const ox = dx * diff;
    const oy = dy * diff;
    if (!a.pin) {
      a.x += ox;
      a.y += oy;
    }
    if (!b.pin) {
      b.x -= ox;
      b.y -= oy;
    }
  }

  private simulate(dt: number): void {
    const f = Math.min(2.2, dt / 16);
    const grav = 0.16 * this.dpr * f;
    const drag = 0.99;
    const ps = [...this.pointers.values()];
    if (this.gust > 0) this.gust = Math.max(0, this.gust - dt / 500);
    const now = performance.now();
    const gx = (Math.sin(now * 0.0006) * 0.09 + this.gust * Math.sin(now * 0.02) * 1.4) * this.dpr;
    for (const p of this.P) {
      if (p.pin) continue;
      const vx = (p.x - p.ox) * drag;
      const vy = (p.y - p.oy) * drag;
      p.ox = p.x;
      p.oy = p.y;
      p.x += vx + gx * 0.4;
      p.y += vy + grav;
      for (const pt of ps) {
        const dx = p.x - pt.x;
        const dy = p.y - pt.y;
        const d = Math.hypot(dx, dy);
        const R = 90 * this.dpr;
        if (d < R) {
          const w = 1 - d / R;
          p.x += (pt.x - pt.px) * w;
          p.y += (pt.y - pt.py) * w;
        }
      }
    }
    const iters = CLOTH_STIFF[this.level];
    for (let it = 0; it < iters; it++) {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const i = this.idx(c, r);
          if (c < this.cols - 1) this.satisfy(this.P[i], this.P[i + 1]);
          if (r < this.rows - 1) this.satisfy(this.P[i], this.P[i + this.cols]);
        }
      }
    }
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#06060f';
    ctx.fillRect(0, 0, this.width, this.height);
    const reduced = this.settings.reducedEffects;
    const now = performance.now();
    for (let r = 0; r < this.rows - 1; r++) {
      for (let c = 0; c < this.cols - 1; c++) {
        const a = this.P[this.idx(c, r)];
        const b = this.P[this.idx(c + 1, r)];
        const d = this.P[this.idx(c + 1, r + 1)];
        const e = this.P[this.idx(c, r + 1)];
        const area = Math.abs((b.x - a.x) * (e.y - a.y) - (e.x - a.x) * (b.y - a.y));
        const rest = this.spacing * this.spacing;
        const strain = clamp(area / rest, 0, 2);
        const sheen = Math.pow(Math.max(0, Math.sin((c / this.cols) * Math.PI * 4 - now * 0.0016 + (a.y - this.originY) * 0.004)), 6) * (0.18 + this.level * 0.12);
        const shade = clamp(0.15 + (1 - Math.abs(1 - strain)) * 0.46 + sheen, 0, 0.96);
        const col = samplePalette(this.palette, (c / this.cols) * 0.7 + (r / this.rows) * 0.18);
        ctx.fillStyle = `rgba(${col.r | 0},${col.g | 0},${col.b | 0},${shade})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(d.x, d.y);
        ctx.lineTo(e.x, e.y);
        ctx.closePath();
        ctx.fill();
      }
    }
    if (!reduced) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(165,180,252,0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const p = this.P[this.idx(c, r)];
          if (c === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
      }
      for (let c = 0; c < this.cols; c++) {
        for (let r = 0; r < this.rows; r++) {
          const p = this.P[this.idx(c, r)];
          if (r === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
      }
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    this.fx.clearRect(0, 0, this.width, this.height);
  }
}
