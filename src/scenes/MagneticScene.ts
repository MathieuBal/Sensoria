import type { PointerSample, Scene, SceneContext, SceneSettings } from '../core/types';
import { PALETTES, samplePalette } from '../palettes';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Target grain counts per "Densité" level (scaled by quality at build time). */
const DENSITY = [1100, 2200, 3600];
const BUCKETS = 6; // colour buckets for field-line shading

// Force model (device-px, time in ms).
const ATTRACT = 1.4; // pull strength near a source
const MAX_ACCEL = 0.03; // accel cap to keep the system stable
const SPRING = 0.000022; // pull back to home cell
const DAMP_TAU = 150; // velocity damping time-constant
const TAIL = 7; // field-line length per unit velocity

interface Source {
  x: number;
  y: number;
}

/**
 * Tableau « Champ magnétique » — thousands of grains that draw the field lines
 * around the pointer(s) (§4.5). Drag attracts the grains; a double-tap drops a
 * persistent pole; releasing lets them spring back to their lattice.
 *
 * The whole field is recomposed every frame from typed arrays, with grains
 * batched into a few colour buckets so several thousand field-lines cost only a
 * handful of stroke calls.
 */
export class MagneticScene implements Scene {
  readonly id = 'magnetic';
  readonly name = 'Champ magnétique';
  readonly paletteCount = PALETTES.length;
  readonly knobLabel = 'Densité';
  readonly knobOptions = ['Fin', 'Moyen', 'Dense'] as const;

  onPaletteChange?: (index: number) => void;

  private ctx!: CanvasRenderingContext2D;
  private fx!: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private settings!: SceneSettings;
  private perf!: { quality: number };

  private paletteIndex = 0;
  private level = 1;

  // Grain state (Structure of Arrays for cache-friendly iteration).
  private hx = new Float32Array(0);
  private hy = new Float32Array(0);
  private px = new Float32Array(0);
  private py = new Float32Array(0);
  private vx = new Float32Array(0);
  private vy = new Float32Array(0);
  private bucket = new Uint8Array(0);
  private count = 0;

  private bucketColors: string[] = [];

  private readonly pointers = new Map<number, Source>();
  private readonly poles: Source[] = [];

  private lastTapMs = -Infinity;
  private lastTapX = 0;
  private lastTapY = 0;

  mount(context: SceneContext): void {
    this.ctx = context.ctx;
    this.fx = context.fx;
    this.settings = context.settings;
    this.perf = context.perf;
    this.dpr = context.dpr;
    this.paletteIndex = clamp(this.settings.palette, 0, this.paletteCount - 1);
    this.level = clamp(this.settings.symmetry, 0, DENSITY.length - 1);
    this.buildColors();
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.buildGrid();
  }

  setPalette(index: number): void {
    this.paletteIndex = clamp(index, 0, this.paletteCount - 1);
    this.buildColors();
  }

  setSymmetry(level: number): void {
    this.level = clamp(level, 0, DENSITY.length - 1);
    this.buildGrid();
  }

  setAuto(_on: boolean): void {
    /* an automatic pole could be added later; idle field is already calm */
  }

  reset(): void {
    this.poles.length = 0;
    for (let i = 0; i < this.count; i++) {
      this.px[i] = this.hx[i];
      this.py[i] = this.hy[i];
      this.vx[i] = 0;
      this.vy[i] = 0;
    }
    navigator.vibrate?.(this.settings.reducedEffects ? 0 : 18);
  }

  unmount(): void {
    this.pointers.clear();
    this.poles.length = 0;
  }

  onInput(s: PointerSample): void {
    if (s.phase === 'start') {
      const now = performance.now();
      const isDouble =
        now - this.lastTapMs < 300 && Math.hypot(s.x - this.lastTapX, s.y - this.lastTapY) < 80 * this.dpr;
      this.lastTapMs = now;
      this.lastTapX = s.x;
      this.lastTapY = s.y;
      if (isDouble) {
        this.togglePole(s.x, s.y);
        navigator.vibrate?.(this.settings.reducedEffects ? 0 : 16);
        return;
      }
      this.pointers.set(s.id, { x: s.x, y: s.y });
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

  update(dt: number, _timeMs: number): void {
    this.simulate(dt);
    this.render();
  }

  // --- internals -----------------------------------------------------------

  private buildColors(): void {
    this.bucketColors = [];
    for (let b = 0; b < BUCKETS; b++) {
      const c = samplePalette(this.palette, b / BUCKETS);
      const a = 0.22 + 0.6 * (b / (BUCKETS - 1));
      this.bucketColors.push(`rgba(${c.r | 0},${c.g | 0},${c.b | 0},${a})`);
    }
  }

  private get palette() {
    return PALETTES[this.paletteIndex];
  }

  private buildGrid(): void {
    if (this.width === 0 || this.height === 0) return;
    const target = Math.round(DENSITY[this.level] * clamp(this.perf.quality, 0.5, 1));
    const spacing = Math.max(6, Math.sqrt((this.width * this.height) / target));
    const cols = Math.max(1, Math.floor(this.width / spacing));
    const rows = Math.max(1, Math.floor(this.height / spacing));
    const n = cols * rows;
    this.count = n;
    this.hx = new Float32Array(n);
    this.hy = new Float32Array(n);
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.bucket = new Uint8Array(n);
    const ox = (this.width - (cols - 1) * spacing) / 2;
    const oy = (this.height - (rows - 1) * spacing) / 2;
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = ox + c * spacing;
        const y = oy + r * spacing;
        this.hx[i] = x;
        this.hy[i] = y;
        this.px[i] = x;
        this.py[i] = y;
        i++;
      }
    }
  }

  private togglePole(x: number, y: number): void {
    const near = 60 * this.dpr;
    const idx = this.poles.findIndex((p) => Math.hypot(p.x - x, p.y - y) < near);
    if (idx >= 0) this.poles.splice(idx, 1);
    else if (this.poles.length < 6) this.poles.push({ x, y });
  }

  private simulate(dt: number): void {
    const damp = Math.exp(-dt / DAMP_TAU);
    const k = ATTRACT * this.dpr;
    const maxA = MAX_ACCEL * this.dpr;
    // Active sources = live pointers + persistent poles.
    const sources: Source[] = [...this.pointers.values(), ...this.poles];
    const ns = sources.length;
    const maxSpeed = 2.5 * this.dpr;

    for (let i = 0; i < this.count; i++) {
      let ax = (this.hx[i] - this.px[i]) * SPRING;
      let ay = (this.hy[i] - this.py[i]) * SPRING;
      for (let j = 0; j < ns; j++) {
        const dx = sources[j].x - this.px[i];
        const dy = sources[j].y - this.py[i];
        const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
        const a = Math.min(maxA, k / d);
        ax += (dx / d) * a;
        ay += (dy / d) * a;
      }
      let nvx = (this.vx[i] + ax * dt) * damp;
      let nvy = (this.vy[i] + ay * dt) * damp;
      const sp = Math.hypot(nvx, nvy);
      if (sp > maxSpeed) {
        nvx = (nvx / sp) * maxSpeed;
        nvy = (nvy / sp) * maxSpeed;
      }
      this.vx[i] = nvx;
      this.vy[i] = nvy;
      this.px[i] += nvx * dt;
      this.py[i] += nvy * dt;
      this.bucket[i] = Math.min(BUCKETS - 1, (clamp(sp / maxSpeed, 0, 1) * BUCKETS) | 0);
    }
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#070a12';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.25 * this.dpr;
    const tail = TAIL; // multiplies velocity (device px/ms) → field-line length
    for (let b = 0; b < BUCKETS; b++) {
      ctx.beginPath();
      for (let i = 0; i < this.count; i++) {
        if (this.bucket[i] !== b) continue;
        const x = this.px[i];
        const y = this.py[i];
        ctx.moveTo(x - this.vx[i] * tail, y - this.vy[i] * tail);
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = this.bucketColors[b];
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    // Poles glow on the FX layer.
    const fx = this.fx;
    fx.clearRect(0, 0, this.width, this.height);
    if (this.poles.length) {
      fx.globalCompositeOperation = 'lighter';
      for (const p of this.poles) {
        const r = 26 * this.dpr;
        const g = fx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, 'rgba(255,255,255,0.8)');
        g.addColorStop(0.4, 'rgba(180,200,255,0.35)');
        g.addColorStop(1, 'rgba(180,200,255,0)');
        fx.fillStyle = g;
        fx.beginPath();
        fx.arc(p.x, p.y, r, 0, Math.PI * 2);
        fx.fill();
      }
      fx.globalCompositeOperation = 'source-over';
    }
  }
}
