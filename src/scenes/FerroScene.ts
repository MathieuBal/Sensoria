import type { PointerSample, Scene, SceneContext, SceneSettings } from '../core/types';
import { PALETTES, samplePalette } from '../palettes';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

// Registry id stays 'living-paint' (historical); the tableau is now « Ferrofluide ».
const FERRO_SCALE = 7;
const FERRO_BLOBS = [15, 19, 25];
const FERRO_TENSION = [0.78, 1.0, 1.35]; // pointer pull / spikiness

interface Blob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}
interface Droplet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
}

/**
 * Tableau « Ferrofluide » — a glossy black magnetic fluid (metaballs) that
 * gathers into one mass and bulges toward the finger into living spikes, then
 * slumps back. Dark, reflective, rim-lit. Knob = surface tension.
 */
export class FerroScene implements Scene {
  readonly id = 'living-paint';
  readonly name = 'Ferrofluide';
  readonly paletteCount = PALETTES.length;
  readonly knobLabel = 'Tension';
  readonly knobOptions = ['Doux', 'Vif', 'Hérissé'] as const;
  readonly supportsAuto = false;
  readonly hint = {
    title: 'Aimante le fluide',
    sub: 'Maintiens : il se hérisse en pointes · double-tap : éclaboussure · Échap : réglages'
  };

  onPaletteChange?: (index: number) => void;

  private ctx!: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private gw = 0;
  private gh = 0;
  private cellSz = 7;
  private settings!: SceneSettings;
  private paletteIndex = 0;
  private level = 1;

  private field = new Float32Array(0);
  private buf: HTMLCanvasElement | null = null;
  private bufCtx: CanvasRenderingContext2D | null = null;
  private img: ImageData | null = null;
  private readonly blobs: Blob[] = [];
  private readonly droplets: Droplet[] = [];
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private cx0 = 0;
  private cy0 = 0;
  private colorBase = 0;
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
    this.droplets.length = 0;
    this.build();
  }
  unmount(): void {
    this.pointers.clear();
    this.droplets.length = 0;
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
        for (let k = 0; k < 12; k++) {
          const a = Math.random() * Math.PI * 2;
          const sp = (0.4 + Math.random() * 1.1) * this.dpr;
          this.droplets.push({ x: s.x, y: s.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: (6 + Math.random() * 10) * this.dpr, life: 1 });
        }
        navigator.vibrate?.(this.settings.reducedEffects ? 0 : 18);
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

  private build(): void {
    this.cellSz = FERRO_SCALE * this.dpr;
    this.gw = Math.max(8, Math.ceil(this.width / this.cellSz));
    this.gh = Math.max(8, Math.ceil(this.height / this.cellSz));
    this.field = new Float32Array(this.gw * this.gh);
    this.buf = document.createElement('canvas');
    this.buf.width = this.gw;
    this.buf.height = this.gh;
    this.bufCtx = this.buf.getContext('2d');
    this.img = this.bufCtx ? this.bufCtx.createImageData(this.gw, this.gh) : null;
    this.cx0 = this.width / 2;
    this.cy0 = this.height / 2;
    this.blobs.length = 0;
    const count = FERRO_BLOBS[this.level];
    const baseR = Math.min(this.width, this.height) * (0.085 - this.level * 0.012);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.random() * Math.min(this.width, this.height) * 0.18;
      this.blobs.push({ x: this.cx0 + Math.cos(a) * rr, y: this.cy0 + Math.sin(a) * rr, vx: 0, vy: 0, r: baseR * (0.7 + Math.random() * 0.6) });
    }
  }

  private simulate(dt: number): void {
    const f = Math.min(2.4, dt / 16);
    const tension = FERRO_TENSION[this.level];
    let mx = 0;
    let my = 0;
    for (const b of this.blobs) {
      mx += b.x;
      my += b.y;
    }
    mx /= this.blobs.length;
    my /= this.blobs.length;
    const ps = [...this.pointers.values()];
    for (const b of this.blobs) {
      let ax = (mx - b.x) * 0.004 + (this.cx0 - b.x) * 0.001;
      let ay = (my - b.y) * 0.004 + (this.cy0 - b.y) * 0.001;
      for (const p of ps) {
        const dx = p.x - b.x;
        const dy = p.y - b.y;
        const d = Math.hypot(dx, dy) + 1;
        const pull = (0.05 + 0.16 * tension) * Math.min(1, (240 * this.dpr) / d);
        ax += (dx / d) * pull;
        ay += (dy / d) * pull;
      }
      b.vx = (b.vx + ax * f) * 0.86;
      b.vy = (b.vy + ay * f) * 0.86;
      const sp = Math.hypot(b.vx, b.vy);
      const maxS = 9 * this.dpr;
      if (sp > maxS) {
        b.vx = (b.vx / sp) * maxS;
        b.vy = (b.vy / sp) * maxS;
      }
      b.x += b.vx * f;
      b.y += b.vy * f;
      const m = b.r * 0.5;
      if (b.x < m) {
        b.x = m;
        b.vx *= -0.4;
      } else if (b.x > this.width - m) {
        b.x = this.width - m;
        b.vx *= -0.4;
      }
      if (b.y < m) {
        b.y = m;
        b.vy *= -0.4;
      } else if (b.y > this.height - m) {
        b.y = this.height - m;
        b.vy *= -0.4;
      }
    }
    let w = 0;
    for (let i = 0; i < this.droplets.length; i++) {
      const d = this.droplets[i];
      d.life -= dt / 900;
      if (d.life <= 0) continue;
      d.vy += 0.02 * this.dpr * f;
      d.x += d.vx * f;
      d.y += d.vy * f;
      this.droplets[w++] = d;
    }
    this.droplets.length = w;
    this.colorBase += dt * 0.00003;
  }

  private computeField(): void {
    this.field.fill(0);
    const ps = [...this.pointers.values()];
    const spikeR = (40 + 70 * FERRO_TENSION[this.level]) * this.dpr;
    for (let gy = 0; gy < this.gh; gy++) {
      const wy = (gy + 0.5) * this.cellSz;
      for (let gx = 0; gx < this.gw; gx++) {
        const wx = (gx + 0.5) * this.cellSz;
        let v = 0;
        for (const b of this.blobs) {
          const dx = wx - b.x;
          const dy = wy - b.y;
          v += (b.r * b.r) / (dx * dx + dy * dy + 1);
        }
        for (const p of ps) {
          const dx = wx - p.x;
          const dy = wy - p.y;
          v += (spikeR * spikeR) / (dx * dx + dy * dy + 1);
        }
        for (const d of this.droplets) {
          const dx = wx - d.x;
          const dy = wy - d.y;
          v += ((d.r * d.r) / (dx * dx + dy * dy + 1)) * d.life;
        }
        this.field[gx + gy * this.gw] = v;
      }
    }
  }

  private render(): void {
    if (!this.img || !this.bufCtx || !this.buf) return;
    this.computeField();
    const data = this.img.data;
    const reduced = this.settings.reducedEffects;
    const rim = samplePalette(this.palette, this.colorBase % 1);
    const rim2 = samplePalette(this.palette, (this.colorBase + 0.3) % 1);
    for (let gy = 0; gy < this.gh; gy++) {
      for (let gx = 0; gx < this.gw; gx++) {
        const i = gx + gy * this.gw;
        const v = this.field[i];
        const o = i << 2;
        if (v < 1) {
          data[o + 3] = 0;
          continue;
        }
        if (v < 1.5) {
          const e = (v - 1) / 0.5;
          const k = 1 - e;
          data[o] = Math.min(255, rim.r * k + rim2.r * e * 0.4 + 30);
          data[o + 1] = Math.min(255, rim.g * k + rim2.g * e * 0.4 + 30);
          data[o + 2] = Math.min(255, rim.b * k + rim2.b * e * 0.4 + 40);
          data[o + 3] = 255;
        } else {
          const spec = reduced ? 0 : Math.max(0, 1 - (gy / this.gh) * 1.4) * 70 + Math.max(0, Math.sin((gx / this.gw) * 6.28)) * 8;
          data[o] = 14 + rim.r * 0.05 + spec;
          data[o + 1] = 14 + rim.g * 0.05 + spec;
          data[o + 2] = 24 + rim.b * 0.06 + spec;
          data[o + 3] = 255;
        }
      }
    }
    this.bufCtx.putImageData(this.img, 0, 0);
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    const bg = ctx.createRadialGradient(this.cx0, this.cy0, 0, this.cx0, this.cy0, Math.hypot(this.width, this.height) / 2);
    bg.addColorStop(0, '#0a0a18');
    bg.addColorStop(1, '#03030a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.buf, 0, 0, this.gw, this.gh, 0, 0, this.width, this.height);
  }
}
