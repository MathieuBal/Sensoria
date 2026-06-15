import type { PointerSample, Scene, SceneContext, SceneSettings } from '../core/types';
import { PALETTES, samplePalette } from '../palettes';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

const COSMOS_N = [1400, 2200, 1800];
const COSMOS_SWIRL = [0.9, 0.45, 0.2];
const COSMOS_PULL = [0.5, 1.5, 0.35];

interface Flare {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  colorT: number;
}

/**
 * Tableau « Portail cosmique » — stars orbit a core; touch warps gravity with
 * an accretion swirl, double-tap = supernova. Knob = regime (Spirale / Trou
 * noir / Nébuleuse). The most on-brand Constella tableau.
 */
export class CosmosScene implements Scene {
  readonly id = 'cosmic-portal';
  readonly name = 'Portail cosmique';
  readonly paletteCount = PALETTES.length;
  readonly knobLabel = 'Régime';
  readonly knobOptions = ['Spirale', 'Trou noir', 'Nébuleuse'] as const;
  readonly supportsAuto = false;
  readonly hint = {
    title: 'Courbe la gravité',
    sub: 'Maintiens pour attirer les étoiles · double-tap : supernova'
  };

  onPaletteChange?: (index: number) => void;

  private ctx!: CanvasRenderingContext2D;
  private fx!: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private cx = 0;
  private cy = 0;
  private dpr = 1;
  private settings!: SceneSettings;
  private paletteIndex = 0;
  private level = 1;

  private sx = new Float32Array(0);
  private sy = new Float32Array(0);
  private svx = new Float32Array(0);
  private svy = new Float32Array(0);
  private scol = new Float32Array(0);
  private ssz = new Float32Array(0);
  private n = 0;
  private readonly wells = new Map<number, { x: number; y: number }>();
  private readonly flares: Flare[] = [];
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
    this.cx = width / 2;
    this.cy = height / 2;
    this.dpr = dpr;
    this.clearBg();
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
    this.flares.length = 0;
    this.clearBg();
    this.build();
  }
  unmount(): void {
    this.wells.clear();
    this.flares.length = 0;
  }

  onInput(s: PointerSample): void {
    if (s.phase === 'start') {
      const now = performance.now();
      const isDouble = now - this.lastTapMs < 300 && Math.hypot(s.x - this.lastTapX, s.y - this.lastTapY) < 80 * this.dpr;
      this.lastTapMs = now;
      this.lastTapX = s.x;
      this.lastTapY = s.y;
      if (isDouble) this.supernova(s.x, s.y);
      else this.wells.set(s.id, { x: s.x, y: s.y });
    } else if (s.phase === 'move') {
      const w = this.wells.get(s.id);
      if (w) {
        w.x = s.x;
        w.y = s.y;
      }
    } else {
      this.wells.delete(s.id);
    }
  }

  update(dt: number, _t: number): void {
    this.simulate(dt);
    this.render();
  }

  private get palette() {
    return PALETTES[this.paletteIndex];
  }
  private clearBg(): void {
    if (!this.ctx) return;
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = '#02020c';
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  private build(): void {
    this.n = COSMOS_N[this.level];
    const n = this.n;
    this.sx = new Float32Array(n);
    this.sy = new Float32Array(n);
    this.svx = new Float32Array(n);
    this.svy = new Float32Array(n);
    this.scol = new Float32Array(n);
    this.ssz = new Float32Array(n);
    const maxR = Math.hypot(this.width, this.height) / 2;
    for (let i = 0; i < n; i++) {
      let r: number;
      let a = Math.random() * Math.PI * 2;
      if (this.level === 0) {
        const arm = (i % 2) * Math.PI;
        r = Math.pow(Math.random(), 0.6) * maxR;
        a = r * 0.012 + arm + (Math.random() - 0.5) * 0.6;
      } else if (this.level === 2) {
        r = Math.pow(Math.random(), 0.5) * maxR;
      } else {
        r = (0.18 + Math.random() * 0.82) * maxR;
      }
      this.sx[i] = this.cx + Math.cos(a) * r;
      this.sy[i] = this.cy + Math.sin(a) * r;
      const orb = Math.sqrt((420 * this.dpr) / (r + 30 * this.dpr)) * (this.level === 1 ? 1.1 : 0.8);
      this.svx[i] = -Math.sin(a) * orb;
      this.svy[i] = Math.cos(a) * orb;
      this.scol[i] = (r / maxR) * 0.8 + Math.random() * 0.15;
      this.ssz[i] = (0.6 + Math.random() * 1.7) * this.dpr;
    }
  }

  private supernova(x: number, y: number): void {
    if (!this.settings.reducedEffects) {
      for (let i = 0; i < 60; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (0.4 + Math.random() * 1.6) * this.dpr;
        this.flares.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, maxLife: 500 + Math.random() * 700, size: (1 + Math.random() * 2.5) * this.dpr, colorT: Math.random() });
      }
      navigator.vibrate?.(24);
    }
    for (let i = 0; i < this.n; i++) {
      const dx = this.sx[i] - x;
      const dy = this.sy[i] - y;
      const d = Math.hypot(dx, dy) + 0.01;
      if (d < 260 * this.dpr) {
        const f = (1 - d / (260 * this.dpr)) * 3 * this.dpr;
        this.svx[i] += (dx / d) * f;
        this.svy[i] += (dy / d) * f;
      }
    }
  }

  private simulate(dt: number): void {
    const swirl = COSMOS_SWIRL[this.level];
    const pull = COSMOS_PULL[this.level];
    const ws = [...this.wells.values()];
    const maxSpeed = 4.5 * this.dpr;
    const k = 600 * this.dpr;
    for (let i = 0; i < this.n; i++) {
      let ax = 0;
      let ay = 0;
      let dx = this.cx - this.sx[i];
      let dy = this.cy - this.sy[i];
      let d = Math.hypot(dx, dy) + 8 * this.dpr;
      const g = (k * pull) / (d * d);
      ax += (dx / d) * g;
      ay += (dy / d) * g;
      ax += (-dy / d) * swirl * (k / (d * d)) * 0.6;
      ay += (dx / d) * swirl * (k / (d * d)) * 0.6;
      for (const w of ws) {
        dx = w.x - this.sx[i];
        dy = w.y - this.sy[i];
        d = Math.hypot(dx, dy) + 6 * this.dpr;
        const f = Math.min(0.5 * this.dpr, (2600 * this.dpr) / (d * d));
        ax += (dx / d) * f;
        ay += (dy / d) * f;
        ax += (-dy / d) * f * 0.7;
        ay += (dx / d) * f * 0.7;
      }
      this.svx[i] += ax * dt * 0.06;
      this.svy[i] += ay * dt * 0.06;
      const sp = Math.hypot(this.svx[i], this.svy[i]);
      if (sp > maxSpeed) {
        this.svx[i] = (this.svx[i] / sp) * maxSpeed;
        this.svy[i] = (this.svy[i] / sp) * maxSpeed;
      }
      this.sx[i] += this.svx[i] * dt * 0.06;
      this.sy[i] += this.svy[i] * dt * 0.06;
      const m = 60 * this.dpr;
      if (this.sx[i] < -m) this.sx[i] = this.width + m;
      else if (this.sx[i] > this.width + m) this.sx[i] = -m;
      if (this.sy[i] < -m) this.sy[i] = this.height + m;
      else if (this.sy[i] > this.height + m) this.sy[i] = -m;
    }
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(2,2,12,0.34)';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalCompositeOperation = 'lighter';
    const reduced = this.settings.reducedEffects;
    for (let i = 0; i < this.n; i++) {
      const c = samplePalette(this.palette, this.scol[i]);
      const sp = Math.hypot(this.svx[i], this.svy[i]);
      const tl = reduced ? 0 : Math.min(7, sp * 1.4);
      ctx.strokeStyle = `rgba(${c.r | 0},${c.g | 0},${c.b | 0},0.8)`;
      ctx.lineWidth = this.ssz[i];
      ctx.beginPath();
      ctx.moveTo(this.sx[i] - this.svx[i] * tl * 0.06, this.sy[i] - this.svy[i] * tl * 0.06);
      ctx.lineTo(this.sx[i], this.sy[i]);
      ctx.stroke();
    }
    const cr = 70 * this.dpr;
    const cc = samplePalette(this.palette, 0.5);
    const cg = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, cr);
    cg.addColorStop(0, 'rgba(255,255,255,0.9)');
    cg.addColorStop(0.3, `rgba(${cc.r | 0},${cc.g | 0},${cc.b | 0},0.5)`);
    cg.addColorStop(1, `rgba(${cc.r | 0},${cc.g | 0},${cc.b | 0},0)`);
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, cr, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    const fx = this.fx;
    fx.clearRect(0, 0, this.width, this.height);
    if (this.flares.length) {
      fx.globalCompositeOperation = 'lighter';
      let w = 0;
      for (let i = 0; i < this.flares.length; i++) {
        const p = this.flares[i];
        p.life -= 16 / p.maxLife;
        if (p.life <= 0) continue;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.985;
        p.vy *= 0.985;
        const c = samplePalette(this.palette, p.colorT);
        fx.globalAlpha = p.life;
        fx.fillStyle = `rgb(${c.r | 0},${c.g | 0},${c.b | 0})`;
        fx.beginPath();
        fx.arc(p.x, p.y, p.size * (0.5 + p.life), 0, Math.PI * 2);
        fx.fill();
        this.flares[w++] = p;
      }
      this.flares.length = w;
      fx.globalAlpha = 1;
      fx.globalCompositeOperation = 'source-over';
    }
  }
}
