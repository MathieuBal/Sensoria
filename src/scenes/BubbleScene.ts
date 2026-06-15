import type { PointerSample, Scene, SceneContext, SceneSettings } from '../core/types';
import { PALETTES, samplePalette } from '../palettes';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const rrand = (a: number, b: number): number => a + Math.random() * (b - a);

const BUBBLE_CAP = 130;
const BUBBLE_TARGET = [24, 42, 68];
const BUBBLE_RMIN = [16, 12, 9];
const BUBBLE_RMAX = [50, 38, 27];

interface Bubble {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  colorT: number;
  ph: number;
  dead: boolean;
}
interface Drop {
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
 * Tableau « Bulles » — iridescent soap bubbles rise, repel, merge (area
 * conserved) and pop. Knob = ambient density (Calme / Moyen / Foule). (§4.14)
 */
export class BubbleScene implements Scene {
  readonly id = 'bubbles';
  readonly name = 'Bulles';
  readonly paletteCount = PALETTES.length;
  readonly knobLabel = 'Densité';
  readonly knobOptions = ['Calme', 'Moyen', 'Foule'] as const;
  readonly supportsAuto = false;
  readonly hint = {
    title: 'Souffle les bulles',
    sub: 'Glisse pour les pousser · double-tap : éclate · Échap : réglages'
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

  private readonly bubbles: Bubble[] = [];
  private readonly drops: Drop[] = [];
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private spawnAccum = 0;
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
    if (this.bubbles.length === 0) {
      for (let i = 0; i < BUBBLE_TARGET[this.level]; i++) {
        this.bubbles.push(
          this.makeBubble(rrand(0, width), rrand(0, height), rrand(BUBBLE_RMIN[this.level], BUBBLE_RMAX[this.level]) * dpr)
        );
      }
    }
  }

  setPalette(i: number): void {
    this.paletteIndex = clamp(i, 0, this.paletteCount - 1);
  }
  setSymmetry(i: number): void {
    this.level = clamp(i, 0, 2);
  }
  setAuto(_on: boolean): void {}
  reset(): void {
    this.bubbles.length = 0;
    this.drops.length = 0;
    for (let i = 0; i < BUBBLE_TARGET[this.level]; i++) this.spawnBottom();
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
      this.pointers.set(s.id, { x: s.x, y: s.y });
      if (isDouble) {
        for (const b of this.bubbles) if (!b.dead && Math.hypot(b.x - s.x, b.y - s.y) < 130 * this.dpr) this.pop(b);
      } else {
        for (let k = 0; k < 3; k++) this.spawnAt(s.x + rrand(-30, 30) * this.dpr, s.y + rrand(-30, 30) * this.dpr);
      }
    } else if (s.phase === 'move') {
      const p = this.pointers.get(s.id);
      if (p) {
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

  private makeBubble(x: number, y: number, r: number): Bubble {
    return { x, y, r, vx: (Math.random() - 0.5) * 0.03 * this.dpr, vy: -rrand(0.01, 0.05) * this.dpr, colorT: Math.random(), ph: Math.random() * 6.28, dead: false };
  }
  private spawnBottom(): void {
    if (this.bubbles.length >= BUBBLE_CAP) return;
    const r = rrand(BUBBLE_RMIN[this.level], BUBBLE_RMAX[this.level]) * this.dpr;
    this.bubbles.push(this.makeBubble(rrand(r, this.width - r), this.height + r, r));
  }
  private spawnAt(x: number, y: number): void {
    if (this.bubbles.length >= BUBBLE_CAP) return;
    this.bubbles.push(this.makeBubble(x, y, rrand(BUBBLE_RMIN[this.level], BUBBLE_RMAX[this.level]) * this.dpr));
  }
  private pop(b: Bubble): void {
    b.dead = true;
    if (this.settings.reducedEffects) return;
    const n = 5 + ((Math.random() * 7) | 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.05 + Math.random() * 0.2) * this.dpr;
      this.drops.push({ x: b.x + Math.cos(a) * b.r * 0.7, y: b.y + Math.sin(a) * b.r * 0.7, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, maxLife: 400 + Math.random() * 500, size: (1.5 + Math.random() * 3) * this.dpr, colorT: b.colorT });
    }
    navigator.vibrate?.(10);
  }

  private simulate(dt: number): void {
    const rmax = BUBBLE_RMAX[this.level] * 1.7 * this.dpr;
    const ptrs = [...this.pointers.values()];
    for (const b of this.bubbles) {
      if (b.dead) continue;
      b.vy -= 0.000012 * dt * this.dpr * (0.6 + b.r / (30 * this.dpr));
      b.ph += dt * 0.002;
      b.vx += Math.sin(b.ph) * 0.00012 * dt * this.dpr;
      for (const p of ptrs) {
        const dx = b.x - p.x;
        const dy = b.y - p.y;
        const d = Math.hypot(dx, dy) + 0.01;
        const infl = 150 * this.dpr;
        if (d < infl) {
          const f = (1 - d / infl) * 0.006 * dt * this.dpr;
          b.vx += (dx / d) * f;
          b.vy += (dy / d) * f;
        }
      }
      const fr = Math.exp(-dt / 900);
      b.vx *= fr;
      b.vy *= fr;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < b.r) {
        b.x = b.r;
        b.vx = Math.abs(b.vx) * 0.6;
      }
      if (b.x > this.width - b.r) {
        b.x = this.width - b.r;
        b.vx = -Math.abs(b.vx) * 0.6;
      }
      if (b.y < -b.r) b.dead = true;
    }
    const toAdd: Bubble[] = [];
    for (let i = 0; i < this.bubbles.length; i++) {
      const a = this.bubbles[i];
      if (a.dead) continue;
      for (let j = i + 1; j < this.bubbles.length; j++) {
        const b = this.bubbles[j];
        if (b.dead) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) + 0.01;
        const mind = a.r + b.r;
        if (d >= mind) continue;
        if (d < mind * 0.55) {
          const nr = Math.sqrt(a.r * a.r + b.r * b.r);
          a.dead = true;
          b.dead = true;
          if (nr > rmax) {
            this.pop(a);
            this.pop(b);
          } else {
            const m = this.makeBubble((a.x * a.r + b.x * b.r) / mind, (a.y * a.r + b.y * b.r) / mind, nr);
            m.vx = (a.vx + b.vx) * 0.5;
            m.vy = (a.vy + b.vy) * 0.5;
            m.colorT = (a.colorT + b.colorT) * 0.5;
            toAdd.push(m);
          }
          break;
        } else {
          const push = (mind - d) * 0.012 * dt;
          const nx = dx / d;
          const ny = dy / d;
          a.vx -= nx * push;
          a.vy -= ny * push;
          b.vx += nx * push;
          b.vy += ny * push;
        }
      }
    }
    let w = 0;
    for (let i = 0; i < this.bubbles.length; i++) if (!this.bubbles[i].dead) this.bubbles[w++] = this.bubbles[i];
    this.bubbles.length = w;
    for (const m of toAdd) if (this.bubbles.length < BUBBLE_CAP) this.bubbles.push(m);
    this.spawnAccum += dt;
    if (this.spawnAccum > 380 && this.bubbles.length < BUBBLE_TARGET[this.level]) {
      this.spawnBottom();
      this.spawnAccum = 0;
    }
    let dw = 0;
    for (let i = 0; i < this.drops.length; i++) {
      const p = this.drops[i];
      p.life -= dt / p.maxLife;
      if (p.life <= 0) continue;
      p.vy += 0.00004 * dt * this.dpr;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      this.drops[dw++] = p;
    }
    this.drops.length = dw;
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#06070f';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.bubbles) {
      if (b.dead) continue;
      const c1 = samplePalette(this.palette, b.colorT);
      const c2 = samplePalette(this.palette, b.colorT + 0.4);
      const g = ctx.createRadialGradient(b.x, b.y, b.r * 0.55, b.x, b.y, b.r);
      g.addColorStop(0, `rgba(${c1.r | 0},${c1.g | 0},${c1.b | 0},0)`);
      g.addColorStop(0.78, `rgba(${c1.r | 0},${c1.g | 0},${c1.b | 0},0.05)`);
      g.addColorStop(0.93, `rgba(${c1.r | 0},${c1.g | 0},${c1.b | 0},0.5)`);
      g.addColorStop(1, `rgba(${c2.r | 0},${c2.g | 0},${c2.b | 0},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      const hx = b.x - b.r * 0.32;
      const hy = b.y - b.r * 0.36;
      const hr = b.r * 0.26;
      const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
      hg.addColorStop(0, 'rgba(255,255,255,0.55)');
      hg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(hx, hy, hr, 0, Math.PI * 2);
      ctx.fill();
    }
    const fx = this.fx;
    fx.clearRect(0, 0, this.width, this.height);
    if (this.drops.length) {
      fx.globalCompositeOperation = 'lighter';
      for (const p of this.drops) {
        const c = samplePalette(this.palette, p.colorT);
        fx.globalAlpha = p.life * 0.8;
        fx.fillStyle = `rgb(${c.r | 0},${c.g | 0},${c.b | 0})`;
        fx.beginPath();
        fx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        fx.fill();
      }
      fx.globalAlpha = 1;
      fx.globalCompositeOperation = 'source-over';
    }
  }
}
