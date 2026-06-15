import type { PointerSample, Scene, SceneContext, SceneSettings } from '../core/types';
import { PALETTES, samplePalette } from '../palettes';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

const POWDER_N = [950, 1300, 1650];
const POWDER_SPREAD = [0.1, 0.3, 0.65];
const POWDER_BURN_MS = 1100;

interface PPointer {
  x: number;
  y: number;
  px: number;
  py: number;
}

/**
 * Tableau « Poudre réactive » — powder you stir; a spark ignites a chain
 * reaction via a neighbour grid (cold → burning → spent → cold). Knob =
 * volatility (Sable / Braise / Poudre).
 */
export class PowderScene implements Scene {
  readonly id = 'reactive-powder';
  readonly name = 'Poudre réactive';
  readonly paletteCount = PALETTES.length;
  readonly knobLabel = 'Volatilité';
  readonly knobOptions = ['Sable', 'Braise', 'Poudre'] as const;
  readonly supportsAuto = false;
  readonly hint = {
    title: 'Enflamme la poudre',
    sub: 'Glisse pour remuer · double-tap : étincelle · Échap : réglages'
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

  private gx = new Float32Array(0);
  private gy = new Float32Array(0);
  private gvx = new Float32Array(0);
  private gvy = new Float32Array(0);
  private gst = new Uint8Array(0); // 0 cold, 1 burning, 2 spent
  private ght = new Float32Array(0);
  private gco = new Float32Array(0);
  private n = 0;
  private readonly pointers = new Map<number, PPointer>();
  private readonly grid = new Map<number, number[]>();
  private cell = 40;
  private lastTapMs = -Infinity;
  private lastTapX = 0;
  private lastTapY = 0;

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
    if (this.n === 0) this.build();
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
    this.build();
  }
  unmount(): void {
    this.pointers.clear();
    this.grid.clear();
  }

  onInput(s: PointerSample): void {
    if (s.phase === 'start') {
      const now = performance.now();
      const isDouble = now - this.lastTapMs < 300 && Math.hypot(s.x - this.lastTapX, s.y - this.lastTapY) < 80 * this.dpr;
      this.lastTapMs = now;
      this.lastTapX = s.x;
      this.lastTapY = s.y;
      this.pointers.set(s.id, { x: s.x, y: s.y, px: s.x, py: s.y });
      if (isDouble) this.igniteAround(s.x, s.y, 70 * this.dpr);
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
  private key(cx: number, cy: number): number {
    return cx * 100000 + cy;
  }
  private build(): void {
    this.n = POWDER_N[this.level];
    const n = this.n;
    this.gx = new Float32Array(n);
    this.gy = new Float32Array(n);
    this.gvx = new Float32Array(n);
    this.gvy = new Float32Array(n);
    this.gst = new Uint8Array(n);
    this.ght = new Float32Array(n);
    this.gco = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.gx[i] = Math.random() * this.width;
      this.gy[i] = Math.random() * this.height;
      this.gco[i] = Math.random();
    }
    this.cell = 42 * this.dpr;
  }
  private ignite(i: number): void {
    if (this.gst[i] === 0) {
      this.gst[i] = 1;
      this.ght[i] = POWDER_BURN_MS * (0.7 + Math.random() * 0.6);
    }
  }
  private igniteAround(x: number, y: number, r: number): void {
    for (let i = 0; i < this.n; i++) if (this.gst[i] === 0 && Math.hypot(this.gx[i] - x, this.gy[i] - y) < r) this.ignite(i);
    navigator.vibrate?.(this.settings.reducedEffects ? 0 : 18);
  }

  private simulate(dt: number): void {
    const f = Math.min(2.4, dt / 16);
    const drag = 0.9;
    const ptrs = [...this.pointers.values()];
    this.grid.clear();
    for (let i = 0; i < this.n; i++) {
      const burning = this.gst[i] === 1;
      if (burning) this.gvy[i] -= 0.05 * this.dpr * f;
      else this.gvy[i] += 0.012 * this.dpr * f;
      for (const p of ptrs) {
        const dx = this.gx[i] - p.x;
        const dy = this.gy[i] - p.y;
        const d = Math.hypot(dx, dy);
        const R = 84 * this.dpr;
        if (d < R) {
          const w = 1 - d / R;
          this.gvx[i] += (p.x - p.px) * w * 0.5 * f;
          this.gvy[i] += (p.y - p.py) * w * 0.5 * f;
          const stirSp = Math.hypot(p.x - p.px, p.y - p.py);
          if (this.gst[i] === 0 && stirSp > 6 * this.dpr && Math.random() < 0.02 * (this.level + 1)) this.ignite(i);
        }
      }
      this.gvx[i] *= drag;
      this.gvy[i] *= drag;
      this.gx[i] += this.gvx[i] * f;
      this.gy[i] += this.gvy[i] * f;
      if (this.gx[i] < 0) {
        this.gx[i] = 0;
        this.gvx[i] *= -0.4;
      } else if (this.gx[i] > this.width) {
        this.gx[i] = this.width;
        this.gvx[i] *= -0.4;
      }
      if (this.gy[i] < 0) {
        this.gy[i] = 0;
        this.gvy[i] *= -0.4;
      } else if (this.gy[i] > this.height) {
        this.gy[i] = this.height;
        this.gvy[i] *= -0.3;
      }
      if (this.gst[i] !== 2) {
        const k = this.key(Math.floor(this.gx[i] / this.cell), Math.floor(this.gy[i] / this.cell));
        let arr = this.grid.get(k);
        if (!arr) {
          arr = [];
          this.grid.set(k, arr);
        }
        arr.push(i);
      }
    }
    const spread = POWDER_SPREAD[this.level] * (dt / 16);
    for (let i = 0; i < this.n; i++) {
      if (this.gst[i] !== 1) continue;
      this.ght[i] -= dt;
      const cx = Math.floor(this.gx[i] / this.cell);
      const cy = Math.floor(this.gy[i] / this.cell);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const arr = this.grid.get(this.key(cx + ox, cy + oy));
          if (!arr) continue;
          for (const j of arr) {
            if (this.gst[j] !== 0) continue;
            if (Math.hypot(this.gx[i] - this.gx[j], this.gy[i] - this.gy[j]) < this.cell && Math.random() < spread) this.ignite(j);
          }
        }
      }
      if (this.ght[i] <= 0) {
        this.gst[i] = 2;
        this.ght[i] = 2600 + Math.random() * 2600;
      }
    }
    for (let i = 0; i < this.n; i++)
      if (this.gst[i] === 2) {
        this.ght[i] -= dt;
        if (this.ght[i] <= 0) {
          this.gst[i] = 0;
          this.gco[i] = Math.random();
        }
      }
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#07060c';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalCompositeOperation = 'lighter';
    const reduced = this.settings.reducedEffects;
    for (let i = 0; i < this.n; i++) {
      let r: number;
      let g: number;
      let b: number;
      let a: number;
      let sz = 1.6 * this.dpr;
      if (this.gst[i] === 1) {
        const t = clamp(this.ght[i] / POWDER_BURN_MS, 0, 1);
        r = 255;
        g = 140 + 90 * t;
        b = 40 + 60 * (1 - t);
        a = 0.9;
        sz = (2.2 + 1.6 * t) * this.dpr;
      } else if (this.gst[i] === 2) {
        r = 70;
        g = 50;
        b = 60;
        a = 0.5;
      } else {
        const c = samplePalette(this.palette, this.gco[i]);
        r = c.r;
        g = c.g;
        b = c.b;
        a = 0.55;
      }
      ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${a})`;
      ctx.beginPath();
      ctx.arc(this.gx[i], this.gy[i], sz, 0, Math.PI * 2);
      ctx.fill();
      if (this.gst[i] === 1 && !reduced) {
        const hg = ctx.createRadialGradient(this.gx[i], this.gy[i], 0, this.gx[i], this.gy[i], 9 * this.dpr);
        hg.addColorStop(0, 'rgba(255,180,80,0.5)');
        hg.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(this.gx[i], this.gy[i], 9 * this.dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    this.fx.clearRect(0, 0, this.width, this.height);
  }
}
