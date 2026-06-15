import type { PointerSample, Scene, SceneContext, SceneSettings } from '../core/types';
import { PALETTES, samplePalette } from '../palettes';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

const FLOW_N = [1300, 1900, 1500];
const FLOW_FADE = [7000, 11000, 16000];

interface Poke {
  x: number;
  y: number;
  vx: number;
  vy: number;
}
interface Gust {
  x: number;
  y: number;
  life: number;
}

/**
 * Tableau « Chromaflow » — colour ribbons advected by an analytic flow field;
 * the gesture bends the ink with strong local influence (clamped per frame).
 * Knob = field character (Aurore / Tourbillon / Marbre).
 */
export class ChromaScene implements Scene {
  readonly id = 'chromaflow';
  readonly name = 'Chromaflow';
  readonly paletteCount = PALETTES.length;
  readonly knobLabel = 'Flux';
  readonly knobOptions = ['Aurore', 'Tourbillon', 'Marbre'] as const;
  readonly supportsAuto = false;
  readonly hint = {
    title: 'Peins le courant',
    sub: "Glisse pour entraîner l'encre · double-tap : rafale · Échap : réglages"
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

  private px = new Float32Array(0);
  private py = new Float32Array(0);
  private pcol = new Float32Array(0);
  private n = 0;
  private readonly pokes = new Map<number, Poke>();
  private readonly gusts: Gust[] = [];
  private t = 0;
  private colorBase = 0;
  private lastTapMs = -Infinity;
  private lastTapX = 0;
  private lastTapY = 0;
  private readonly _f = { x: 0, y: 0 };

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
    this.clearBg();
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
    this.clearBg();
    this.build();
    this.gusts.length = 0;
  }
  unmount(): void {
    this.pokes.clear();
    this.gusts.length = 0;
  }

  onInput(s: PointerSample): void {
    if (s.phase === 'start') {
      const now = performance.now();
      const isDouble = now - this.lastTapMs < 300 && Math.hypot(s.x - this.lastTapX, s.y - this.lastTapY) < 80 * this.dpr;
      this.lastTapMs = now;
      this.lastTapX = s.x;
      this.lastTapY = s.y;
      this.pokes.set(s.id, { x: s.x, y: s.y, vx: 0, vy: 0 });
      if (isDouble) {
        this.gusts.push({ x: s.x, y: s.y, life: 1 });
        navigator.vibrate?.(this.settings.reducedEffects ? 0 : 14);
      }
    } else if (s.phase === 'move') {
      const p = this.pokes.get(s.id);
      if (p) {
        p.vx = s.vx;
        p.vy = s.vy;
        p.x = s.x;
        p.y = s.y;
      }
    } else {
      this.pokes.delete(s.id);
    }
  }

  update(dt: number, _t: number): void {
    this.stepAndRender(dt);
  }

  private get palette() {
    return PALETTES[this.paletteIndex];
  }
  private clearBg(): void {
    if (!this.ctx) return;
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = '#06060f';
    this.ctx.fillRect(0, 0, this.width, this.height);
  }
  private build(): void {
    this.n = FLOW_N[this.level];
    this.px = new Float32Array(this.n);
    this.py = new Float32Array(this.n);
    this.pcol = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      this.px[i] = Math.random() * this.width;
      this.py[i] = Math.random() * this.height;
      this.pcol[i] = Math.random();
    }
  }

  private field(x: number, y: number): void {
    const nx = x / this.width;
    const ny = y / this.height;
    let a: number;
    if (this.level === 0) {
      a = Math.sin(ny * 6 + this.t * 0.6 + Math.sin(nx * 3 + this.t * 0.3) * 1.2) * 0.7 + 0.2;
    } else if (this.level === 2) {
      a = Math.sin(nx * 7 + this.t * 0.4) * Math.cos(ny * 7 - this.t * 0.35) * 3.0;
    } else {
      a = (Math.sin(nx * 5 + this.t * 0.5) + Math.cos(ny * 5 - this.t * 0.5)) * 1.7;
    }
    this._f.x = Math.cos(a);
    this._f.y = Math.sin(a);
  }

  private stepAndRender(dt: number): void {
    this.t += dt * 0.0004;
    this.colorBase += dt * 0.00003;
    const ctx = this.ctx;
    const k = 1 - Math.exp(-dt / FLOW_FADE[this.level]);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(6,6,15,${k})`;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const ps = [...this.pokes.values()];
    const speed = (0.32 + this.level * 0.12) * this.dpr;
    let gw = 0;
    for (let i = 0; i < this.gusts.length; i++) {
      const g = this.gusts[i];
      g.life -= dt / 1400;
      if (g.life > 0) this.gusts[gw++] = g;
    }
    this.gusts.length = gw;
    for (let i = 0; i < this.n; i++) {
      this.field(this.px[i], this.py[i]);
      let vx = this._f.x * speed;
      let vy = this._f.y * speed;
      let near = 0;
      for (const p of ps) {
        const dx = this.px[i] - p.x;
        const dy = this.py[i] - p.y;
        const d = Math.hypot(dx, dy) + 0.01;
        const infl = 230 * this.dpr;
        if (d < infl) {
          const w = 1 - d / infl;
          vx += p.vx * w * 2.4;
          vy += p.vy * w * 2.4;
          if (w > near) near = w;
        }
      }
      for (const g of this.gusts) {
        const dx = this.px[i] - g.x;
        const dy = this.py[i] - g.y;
        const d = Math.hypot(dx, dy) + 0.01;
        const infl = 240 * this.dpr;
        if (d < infl) {
          const w = (1 - d / infl) * g.life * 0.5 * this.dpr;
          vx += (dx / d) * w;
          vy += (dy / d) * w;
        }
      }
      const vmax = 5 * this.dpr;
      const vmag = Math.hypot(vx, vy);
      if (vmag > vmax) {
        vx = (vx / vmag) * vmax;
        vy = (vy / vmag) * vmax;
      }
      const ox = this.px[i];
      const oy = this.py[i];
      this.px[i] += vx * dt;
      this.py[i] += vy * dt;
      const c = samplePalette(this.palette, (this.pcol[i] + this.colorBase) % 1);
      const sp = Math.hypot(vx, vy);
      const a = 0.12 + Math.min(0.55, sp * 0.05) + near * 0.4;
      ctx.strokeStyle = `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${a})`;
      ctx.lineWidth = (0.7 + Math.min(2.6, sp * 0.5) + near * 2.2) * this.dpr;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(this.px[i], this.py[i]);
      ctx.stroke();
      if (this.px[i] < -10 || this.px[i] > this.width + 10 || this.py[i] < -10 || this.py[i] > this.height + 10) {
        this.px[i] = Math.random() * this.width;
        this.py[i] = Math.random() * this.height;
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    this.fx.clearRect(0, 0, this.width, this.height);
  }
}
