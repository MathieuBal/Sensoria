import type { PointerSample, Scene, SceneContext, SceneSettings } from '../core/types';
import { PALETTES, samplePalette } from '../palettes';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

const SAND_SCALE = [7, 5, 4];
const EMPTY = 0;
const SAND = 1;
const WATER = 2;
const WALL = 3;

/**
 * Tableau « Monde miniature » — a falling-sand cellular automaton under glass.
 * Cells: empty / sand / water / wall. Sand piles & slides, water flows & finds
 * its level, sand sinks through water. Double-tap cycles material. Knob = grain.
 */
export class TerrariumScene implements Scene {
  readonly id = 'terrarium';
  readonly name = 'Monde miniature';
  readonly paletteCount = PALETTES.length;
  readonly knobLabel = 'Grain';
  readonly knobOptions = ['Gros', 'Moyen', 'Fin'] as const;
  readonly supportsAuto = false;
  readonly hint = {
    title: 'Façonne le monde',
    sub: 'Glisse pour verser · double-tap : sable / eau / roche · Échap : réglages'
  };

  onPaletteChange?: (index: number) => void;

  private ctx!: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private gw = 0;
  private gh = 0;
  private cellPx = 5;
  private settings!: SceneSettings;
  private paletteIndex = 0;
  private level = 1;

  private cell = new Uint8Array(0);
  private tint = new Float32Array(0);
  private buf: HTMLCanvasElement | null = null;
  private bufCtx: CanvasRenderingContext2D | null = null;
  private img: ImageData | null = null;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private material = SAND;
  private lastTapMs = -Infinity;
  private lastTapX = 0;
  private lastTapY = 0;
  private flip = 0;

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
      this.pointers.set(s.id, { x: s.x, y: s.y });
      if (isDouble) {
        this.material = this.material === SAND ? WATER : this.material === WATER ? WALL : SAND;
        navigator.vibrate?.(this.settings.reducedEffects ? 0 : 14);
      } else {
        this.paint(s.x, s.y, this.material);
      }
    } else if (s.phase === 'move') {
      const p = this.pointers.get(s.id);
      if (!p) return;
      const steps = Math.min(10, Math.max(1, Math.round(Math.hypot(s.x - p.x, s.y - p.y) / this.cellPx)));
      for (let k = 1; k <= steps; k++) this.paint(p.x + ((s.x - p.x) * k) / steps, p.y + ((s.y - p.y) * k) / steps, this.material);
      p.x = s.x;
      p.y = s.y;
    } else {
      this.pointers.delete(s.id);
    }
  }

  update(_dt: number, _t: number): void {
    this.simulate();
    this.render();
  }

  private get palette() {
    return PALETTES[this.paletteIndex];
  }

  private build(): void {
    this.cellPx = SAND_SCALE[this.level] * this.dpr;
    this.gw = Math.max(20, Math.floor(this.width / this.cellPx));
    this.gh = Math.max(20, Math.floor(this.height / this.cellPx));
    this.cell = new Uint8Array(this.gw * this.gh);
    this.tint = new Float32Array(this.gw * this.gh);
    this.buf = document.createElement('canvas');
    this.buf.width = this.gw;
    this.buf.height = this.gh;
    this.bufCtx = this.buf.getContext('2d');
    this.img = this.bufCtx ? this.bufCtx.createImageData(this.gw, this.gh) : null;
    for (let x = 0; x < this.gw; x++) this.cell[(this.gh - 1) * this.gw + x] = WALL;
    for (let y = 0; y < this.gh; y++) {
      this.cell[y * this.gw] = WALL;
      this.cell[y * this.gw + this.gw - 1] = WALL;
    }
  }

  private paint(cssx: number, cssy: number, mat: number): void {
    const gx = Math.floor(cssx / this.cellPx);
    const gy = Math.floor(cssy / this.cellPx);
    const r = 3;
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const px = gx + x;
        const py = gy + y;
        if (px < 1 || py < 1 || px >= this.gw - 1 || py >= this.gh - 1) continue;
        if (Math.hypot(x, y) > r) continue;
        const i = py * this.gw + px;
        if (mat === EMPTY) {
          if (this.cell[i] !== WALL) this.cell[i] = EMPTY;
        } else if (this.cell[i] === EMPTY || mat === WALL) {
          if (Math.random() < 0.7 || mat === WALL) {
            this.cell[i] = mat;
            this.tint[i] = Math.random();
          }
        }
      }
    }
  }

  private simulate(): void {
    this.flip ^= 1;
    const { cell, tint, gw, gh } = this;
    for (let y = gh - 2; y >= 1; y--) {
      for (let xi = 1; xi < gw - 1; xi++) {
        const x = this.flip ? xi : gw - 1 - xi;
        const i = y * gw + x;
        const m = cell[i];
        if (m !== SAND && m !== WATER) continue;
        const below = i + gw;
        if (cell[below] === EMPTY) {
          cell[below] = m;
          tint[below] = tint[i];
          cell[i] = EMPTY;
          continue;
        }
        if (m === SAND && cell[below] === WATER) {
          cell[below] = SAND;
          cell[i] = WATER;
          const t = tint[below];
          tint[below] = tint[i];
          tint[i] = t;
          continue;
        }
        const dir = Math.random() < 0.5 ? -1 : 1;
        const dl = i + gw - 1;
        const dr = i + gw + 1;
        const first = dir < 0 ? dl : dr;
        const second = dir < 0 ? dr : dl;
        if (cell[first] === EMPTY) {
          cell[first] = m;
          tint[first] = tint[i];
          cell[i] = EMPTY;
          continue;
        }
        if (cell[second] === EMPTY) {
          cell[second] = m;
          tint[second] = tint[i];
          cell[i] = EMPTY;
          continue;
        }
        if (m === WATER) {
          const le = i - 1;
          const ri = i + 1;
          const sideFirst = dir < 0 ? le : ri;
          const sideSecond = dir < 0 ? ri : le;
          if (cell[sideFirst] === EMPTY) {
            cell[sideFirst] = WATER;
            tint[sideFirst] = tint[i];
            cell[i] = EMPTY;
          } else if (cell[sideSecond] === EMPTY) {
            cell[sideSecond] = WATER;
            tint[sideSecond] = tint[i];
            cell[i] = EMPTY;
          }
        }
      }
    }
  }

  private render(): void {
    if (!this.img || !this.bufCtx || !this.buf) return;
    const data = this.img.data;
    const s2 = this.palette.stops[Math.min(2, this.palette.stops.length - 1)];
    for (let i = 0; i < this.gw * this.gh; i++) {
      const o = i << 2;
      const m = this.cell[i];
      let r: number;
      let g: number;
      let b: number;
      if (m === EMPTY) {
        r = 6;
        g = 7;
        b = 18;
      } else if (m === WALL) {
        r = 30;
        g = 32;
        b = 52;
      } else if (m === SAND) {
        const c = samplePalette(this.palette, 0.08 + this.tint[i] * 0.12);
        r = c.r * 0.9 + 30;
        g = c.g * 0.8 + 24;
        b = c.b * 0.6;
      } else {
        r = s2.r * 0.4;
        g = s2.g * 0.5 + 30;
        b = s2.b * 0.7 + 60;
      }
      data[o] = Math.min(255, r);
      data[o + 1] = Math.min(255, g);
      data[o + 2] = Math.min(255, b);
      data[o + 3] = 255;
    }
    this.bufCtx.putImageData(this.img, 0, 0);
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buf, 0, 0, this.gw, this.gh, 0, 0, this.width, this.height);
    if (!this.settings.reducedEffects) {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(0, 0, this.width, this.height);
      g.addColorStop(0, 'rgba(255,255,255,0.05)');
      g.addColorStop(0.25, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}
