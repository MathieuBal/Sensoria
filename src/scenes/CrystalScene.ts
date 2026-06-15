import type { PointerSample, Scene, SceneContext, SceneSettings } from '../core/types';
import { PALETTES, samplePalette } from '../palettes';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

const CRYS_CAP = 520;
const CRYS_FOLD = [4, 6, 8];
const CRYS_SPEED = 0.07;

interface Front {
  x: number;
  y: number;
  ang: number;
  gen: number;
  len: number;
  maxLen: number;
  w: number;
  colorT: number;
}
interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  len: number;
  ang: number;
  colorT: number;
}

/**
 * Tableau « Cristaux » — faceted frost dendrites spread from each touch, angles
 * snapped to an N-fold lattice. Knob = lattice (Cubique 4 / Hexa 6 / Étoilé 8).
 */
export class CrystalScene implements Scene {
  readonly id = 'crystals';
  readonly name = 'Cristaux';
  readonly paletteCount = PALETTES.length;
  readonly knobLabel = 'Réseau';
  readonly knobOptions = ['Cubique', 'Hexa', 'Étoilé'] as const;
  readonly supportsAuto = false;
  readonly hint = {
    title: 'Fais givrer',
    sub: 'Touche pour cristalliser · double-tap : éclat · Échap : réglages'
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

  private readonly fronts: Front[] = [];
  private readonly shards: Shard[] = [];
  private readonly last = new Map<number, { x: number; y: number }>();
  private colorBase = 0;
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
    this.clearBg();
  }

  setPalette(i: number): void {
    this.paletteIndex = clamp(i, 0, this.paletteCount - 1);
  }
  setSymmetry(i: number): void {
    this.level = clamp(i, 0, 2);
  }
  setAuto(_on: boolean): void {}
  reset(): void {
    this.fronts.length = 0;
    this.shards.length = 0;
    this.clearBg();
    this.fx.clearRect(0, 0, this.width, this.height);
  }
  unmount(): void {
    this.fronts.length = 0;
    this.shards.length = 0;
    this.last.clear();
  }

  onInput(s: PointerSample): void {
    if (s.phase === 'start') {
      const now = performance.now();
      const isDouble = now - this.lastTapMs < 300 && Math.hypot(s.x - this.lastTapX, s.y - this.lastTapY) < 80 * this.dpr;
      this.lastTapMs = now;
      this.lastTapX = s.x;
      this.lastTapY = s.y;
      this.last.set(s.id, { x: s.x, y: s.y });
      if (isDouble) this.fracture(s.x, s.y);
      else this.seed(s.x, s.y);
    } else if (s.phase === 'move') {
      const p = this.last.get(s.id);
      if (!p) return;
      if (Math.hypot(s.x - p.x, s.y - p.y) > 46 * this.dpr) {
        this.seed(s.x, s.y);
        p.x = s.x;
        p.y = s.y;
      }
    } else {
      this.last.delete(s.id);
    }
  }

  update(dt: number, _t: number): void {
    this.colorBase += dt * 0.00002;
    this.grow(dt);
    this.updateShards(dt);
  }

  private get palette() {
    return PALETTES[this.paletteIndex];
  }
  private clearBg(): void {
    if (!this.ctx) return;
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = '#05060f';
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  private spawnFront(x: number, y: number, ang: number, gen: number, colorT: number): void {
    if (gen <= 0 || this.fronts.length >= CRYS_CAP) return;
    this.fronts.push({ x, y, ang, gen, len: 0, maxLen: (38 + Math.random() * 64) * this.dpr * (0.55 + gen * 0.12), w: (0.7 + gen * 0.4) * this.dpr, colorT });
  }
  private seed(x: number, y: number): void {
    const fold = CRYS_FOLD[this.level];
    const colorT = this.colorBase + Math.random() * 0.12;
    const base = Math.random() * Math.PI * 2;
    for (let k = 0; k < fold; k++) this.spawnFront(x, y, base + (k * (Math.PI * 2)) / fold, 4, colorT);
  }
  private fracture(x: number, y: number): void {
    if (this.settings.reducedEffects) return;
    const n = 14 + ((Math.random() * 10) | 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.06 + Math.random() * 0.26) * this.dpr;
      this.shards.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, maxLife: 420 + Math.random() * 520, len: (6 + Math.random() * 16) * this.dpr, ang: a, colorT: this.colorBase + Math.random() });
    }
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(200,225,255,0.5)';
    ctx.lineWidth = 2 * this.dpr;
    ctx.beginPath();
    ctx.arc(x, y, 30 * this.dpr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    navigator.vibrate?.(18);
  }

  private grow(dt: number): void {
    const fold = CRYS_FOLD[this.level];
    const stepA = (Math.PI * 2) / fold;
    const reduced = this.settings.reducedEffects;
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    let w = 0;
    for (let i = 0; i < this.fronts.length; i++) {
      const f = this.fronts[i];
      const px = f.x;
      const py = f.y;
      f.ang = Math.round(f.ang / stepA) * stepA + (Math.random() - 0.5) * 0.05;
      const sp = CRYS_SPEED * dt * this.dpr;
      f.x += Math.cos(f.ang) * sp;
      f.y += Math.sin(f.ang) * sp;
      f.len += sp;
      const c = samplePalette(this.palette, f.colorT);
      const br = (c.r + 460) / 3;
      const bg = (c.g + 470) / 3;
      const bb = (c.b + 500) / 3;
      if (!reduced) {
        ctx.strokeStyle = `rgba(${br | 0},${bg | 0},${bb | 0},0.16)`;
        ctx.lineWidth = f.w * 3;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(f.x, f.y);
        ctx.stroke();
      }
      ctx.strokeStyle = `rgba(${br | 0},${bg | 0},${bb | 0},0.7)`;
      ctx.lineWidth = f.w;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(f.x, f.y);
      ctx.stroke();
      if (f.gen > 1 && f.len > f.maxLen * 0.4 && Math.random() < 0.05) {
        const side = Math.random() < 0.5 ? 1 : -1;
        this.spawnFront(f.x, f.y, f.ang + side * stepA, f.gen - 1, f.colorT + 0.03);
      }
      const off = f.x < -20 || f.y < -20 || f.x > this.width + 20 || f.y > this.height + 20;
      if (f.len >= f.maxLen || off) {
        if (!off && f.gen > 1) {
          this.spawnFront(f.x, f.y, f.ang, f.gen - 1, f.colorT + 0.04);
          if (Math.random() < 0.6) this.spawnFront(f.x, f.y, f.ang + (Math.random() < 0.5 ? 1 : -1) * stepA, f.gen - 1, f.colorT + 0.05);
        }
        if (!off && !reduced) {
          ctx.fillStyle = `rgba(${br | 0},${bg | 0},${bb | 0},0.5)`;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.w * 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
        continue;
      }
      this.fronts[w++] = f;
    }
    this.fronts.length = w;
    ctx.globalCompositeOperation = 'source-over';
  }

  private updateShards(dt: number): void {
    const fx = this.fx;
    fx.clearRect(0, 0, this.width, this.height);
    if (!this.shards.length) return;
    fx.globalCompositeOperation = 'lighter';
    fx.lineCap = 'round';
    let w = 0;
    for (let i = 0; i < this.shards.length; i++) {
      const s = this.shards[i];
      s.life -= dt / s.maxLife;
      if (s.life <= 0) continue;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.99;
      s.vy *= 0.99;
      const c = samplePalette(this.palette, s.colorT);
      fx.strokeStyle = `rgba(${((c.r + 400) / 2.4) | 0},${((c.g + 420) / 2.4) | 0},${((c.b + 460) / 2.4) | 0},${s.life * 0.8})`;
      fx.lineWidth = 1.6 * this.dpr;
      fx.beginPath();
      fx.moveTo(s.x, s.y);
      fx.lineTo(s.x - Math.cos(s.ang) * s.len, s.y - Math.sin(s.ang) * s.len);
      fx.stroke();
      this.shards[w++] = s;
    }
    this.shards.length = w;
    fx.globalCompositeOperation = 'source-over';
  }
}
