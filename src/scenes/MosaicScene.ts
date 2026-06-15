import type { PointerSample, Scene, SceneContext, SceneSettings } from '../core/types';
import { PALETTES, samplePalette, type Rgb } from '../palettes';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/** Background colour, kept in sync with the PWA theme colour (#0b0d14). */
const BG: Rgb = { r: 11, g: 13, b: 20 };

/** Rotational sectors per symmetry level. Each is also mirrored (dihedral). */
const SECTORS = [4, 6, 8];

const SPEED_REF = 2.2; // reference gesture speed (CSS px/ms)
const COMET_MS = 950; // inertia lifetime after release
const COMET_TAU = 240; // velocity decay time-constant (ms)
const RESET_MS = 800;
const FADE_TAU = 8000; // gentle longevity fade keeps the canvas fresh for minutes
const PARTICLE_TAU = 520; // particle velocity damping
const SPRITE_N = 12; // pre-rendered glow sprites sampled across the palette
const SPRITE_SIZE = 64;
const DOUBLE_TAP_MS = 300;

/** A smoothed brush: keeps the previous point and midpoint for quadratic curves. */
interface Brush {
  x: number;
  y: number;
  mx: number;
  my: number;
  has: boolean;
}

interface Comet {
  brush: Brush;
  vx: number;
  vy: number;
  life: number;
  colorT: number;
  pressure: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  sprite: number;
}

const newBrush = (x = 0, y = 0): Brush => ({ x, y, mx: x, my: y, has: false });

/**
 * Tableau « Mosaïque infinie » — a generative kaleidoscope.
 *
 * Strokes are silky quadratic curves reproduced across N rotational sectors and
 * their mirrors, so even random gestures resolve into a pleasing symmetric
 * composition (§8). A separate FX layer carries drifting glints that keep the
 * surface alive without ever polluting the persistent composition — which keeps
 * the per-frame cost flat no matter how long the session runs (§6.3 / §10.1).
 *
 * Sensation features: speed-driven width & brightness, inertia after release,
 * double-tap "action forte" (burst + palette change, §3), 3 palettes, 3
 * symmetry levels, animated reset, optional light haptics on mobile.
 */
export class MosaicScene implements Scene {
  readonly id = 'mosaic';
  readonly name = 'Mosaïque infinie';
  readonly paletteCount = PALETTES.length;
  readonly knobLabel = 'Symétrie';
  readonly knobOptions = ['Doux', 'Riche', 'Dense'] as const;

  onPaletteChange?: (index: number) => void;

  private ctx!: CanvasRenderingContext2D; // persistent composition
  private fx!: CanvasRenderingContext2D; // transient effects
  private width = 0;
  private height = 0;
  private cx = 0;
  private cy = 0;
  private dpr = 1;
  private settings!: SceneSettings;
  private perf!: { quality: number };

  private paletteIndex = 0;
  private sectors = SECTORS[1];
  private auto = false;

  /** Precomputed rotation basis for the active symmetry. */
  private sectorCos: number[] = [];
  private sectorSin: number[] = [];

  private readonly strokes = new Map<number, Brush>();
  private readonly comets: Comet[] = [];
  private readonly particles: Particle[] = [];
  private particleSprites: HTMLCanvasElement[] = [];

  private colorBase = 0;

  private autoBrush: Brush | null = null;
  private autoT = 0;
  private autoColorT = 0;

  private resetting = false;
  private resetT = 0;
  private resetColor: Rgb = PALETTES[0].stops[0];

  private lastTapMs = -Infinity;
  private lastTapX = 0;
  private lastTapY = 0;

  // --- lifecycle -----------------------------------------------------------

  mount(context: SceneContext): void {
    this.ctx = context.ctx;
    this.fx = context.fx;
    this.settings = context.settings;
    this.perf = context.perf;
    this.dpr = context.dpr;
    this.paletteIndex = clamp(this.settings.palette, 0, this.paletteCount - 1);
    this.setSymmetry(this.settings.symmetry);
    this.auto = this.settings.auto;
    this.buildParticleSprites();
    this.clearToBackground();
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.cx = width / 2;
    this.cy = height / 2;
    this.dpr = dpr;
    this.clearToBackground(); // resizing clears the backing store
  }

  setPalette(index: number): void {
    this.paletteIndex = clamp(index, 0, this.paletteCount - 1);
    this.buildParticleSprites();
  }

  setSymmetry(level: number): void {
    this.sectors = SECTORS[clamp(level, 0, SECTORS.length - 1)];
    this.sectorCos = [];
    this.sectorSin = [];
    const step = (Math.PI * 2) / this.sectors;
    for (let i = 0; i < this.sectors; i++) {
      this.sectorCos.push(Math.cos(step * i));
      this.sectorSin.push(Math.sin(step * i));
    }
  }

  setAuto(on: boolean): void {
    this.auto = on;
    this.autoBrush = null; // re-seed on next frame
  }

  reset(): void {
    this.resetting = true;
    this.resetT = 0;
    this.resetColor = samplePalette(this.palette, this.colorBase);
    this.burst(this.cx, this.cy, this.colorBase, 60, 0.9 * this.dpr);
    this.haptic(24);
  }

  unmount(): void {
    this.strokes.clear();
    this.comets.length = 0;
    this.particles.length = 0;
  }

  // --- input ---------------------------------------------------------------

  onInput(s: PointerSample): void {
    if (this.resetting) return;
    const colorT = this.colorBase + s.id * 0.13 + this.speedNorm(s.speed) * 0.25;

    if (s.phase === 'start') {
      const now = performance.now();
      const isDouble =
        now - this.lastTapMs < DOUBLE_TAP_MS &&
        Math.hypot(s.x - this.lastTapX, s.y - this.lastTapY) < 70 * this.dpr;
      this.lastTapMs = now;
      this.lastTapX = s.x;
      this.lastTapY = s.y;

      if (isDouble) {
        // "Action forte" (§3): explosion + palette change.
        this.cyclePalette();
        this.burst(s.x, s.y, this.colorBase, 46, 0.7 * this.dpr);
        this.haptic(20);
        return;
      }

      const brush = newBrush();
      this.strokes.set(s.id, brush);
      this.drawStroke(brush, s.x, s.y, s.speed, colorT, 1, 1, s.pressure, false, 0, 0);
    } else if (s.phase === 'move') {
      const brush = this.strokes.get(s.id);
      if (!brush) return;
      this.drawStroke(brush, s.x, s.y, s.speed, colorT, 1, 1, s.pressure, true, s.vx, s.vy);
    } else {
      this.strokes.delete(s.id);
      if (s.speed > 0.12 * this.dpr) {
        this.comets.push({
          brush: newBrush(s.x, s.y),
          vx: s.vx,
          vy: s.vy,
          life: 1,
          colorT,
          pressure: s.pressure
        });
      }
    }
  }

  // --- frame ---------------------------------------------------------------

  update(dt: number, _timeMs: number): void {
    this.colorBase += dt * 0.00004;

    this.fx.clearRect(0, 0, this.width, this.height);
    this.updateParticles(dt);
    this.drawParticles();

    if (this.resetting) {
      this.stepReset(dt);
      return;
    }

    this.applyFade(dt);
    this.updateComets(dt);
    if (this.auto && this.strokes.size === 0) this.stepAuto(dt);
  }

  // --- internals -----------------------------------------------------------

  private get palette() {
    return PALETTES[this.paletteIndex];
  }

  private get maxParticles(): number {
    if (this.settings.reducedEffects) return 0;
    return Math.round(220 * clamp(this.perf.quality, 0.45, 1));
  }

  private speedNorm(speed: number): number {
    return clamp(speed / (SPEED_REF * this.dpr), 0, 1);
  }

  private clearToBackground(): void {
    if (!this.ctx) return;
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = `rgb(${BG.r},${BG.g},${BG.b})`;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  private applyFade(dt: number): void {
    // Gentle exponential fade prevents additive whiteout and keeps the cost of
    // a frame constant no matter how long the session runs.
    const k = 1 - Math.exp(-dt / FADE_TAU);
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(${BG.r},${BG.g},${BG.b},${k})`;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  private cyclePalette(): void {
    const next = (this.paletteIndex + 1) % this.paletteCount;
    this.setPalette(next);
    this.onPaletteChange?.(next);
  }

  private haptic(ms: number): void {
    if (this.settings.reducedEffects) return;
    navigator.vibrate?.(ms);
  }

  /**
   * Core brush step: draw a silky quadratic from the previous midpoint through
   * the previous raw point to the new midpoint, replicated across the dihedral
   * symmetry group. Width and brightness follow gesture speed.
   */
  private drawStroke(
    brush: Brush,
    x: number,
    y: number,
    speed: number,
    colorT: number,
    alphaMul: number,
    widthMul: number,
    pressure: number,
    emit: boolean,
    gvx: number,
    gvy: number
  ): void {
    const sn = this.speedNorm(speed);
    const reduced = this.settings.reducedEffects;
    const quality = this.perf.quality;

    const width = lerp(7, 2.2, sn) * this.dpr * widthMul * (0.7 + 0.6 * pressure);
    const base = samplePalette(this.palette, colorT);
    const bright = 0.7 + 0.6 * sn;
    const r = clamp(base.r * bright, 0, 255) | 0;
    const g = clamp(base.g * bright, 0, 255) | 0;
    const b = clamp(base.b * bright, 0, 255) | 0;
    const alpha = lerp(0.18, 0.5, sn) * alphaMul;
    const core = `rgba(${r},${g},${b},${alpha})`;
    const halo = `rgba(${r},${g},${b},${alpha * 0.4})`;
    const drawHalo = !reduced && quality > 0.6;

    if (!brush.has) {
      brush.x = x;
      brush.y = y;
      brush.mx = x;
      brush.my = y;
      brush.has = true;
      this.symStroke(x - this.cx, y - this.cy, x - this.cx, y - this.cy, x - this.cx, y - this.cy, core, halo, width, drawHalo);
      return;
    }

    const mx = (brush.x + x) / 2;
    const my = (brush.y + y) / 2;
    this.symStroke(
      brush.mx - this.cx,
      brush.my - this.cy,
      brush.x - this.cx,
      brush.y - this.cy,
      mx - this.cx,
      my - this.cy,
      core,
      halo,
      width,
      drawHalo
    );

    brush.mx = mx;
    brush.my = my;
    brush.x = x;
    brush.y = y;

    // Emit drifting glints from energetic gestures.
    if (emit && !reduced && quality > 0.5 && sn > 0.25 && Math.random() < sn * 0.9) {
      const ang = Math.atan2(gvy, gvx) + (Math.random() - 0.5) * 1.5;
      const sp = (0.04 + Math.random() * 0.16) * this.dpr * (0.5 + sn);
      const size = (8 + 14 * Math.random()) * this.dpr * (0.6 + 0.6 * sn);
      this.spawn(x, y, Math.cos(ang) * sp, Math.sin(ang) * sp, colorT + Math.random() * 0.1, size, 500 + Math.random() * 700);
    }
  }

  /** Stroke one quadratic across every rotation and mirror (centre-relative coords). */
  private symStroke(
    ax: number,
    ay: number,
    kx: number,
    ky: number,
    bx: number,
    by: number,
    core: string,
    halo: string,
    width: number,
    drawHalo: boolean
  ): void {
    const ctx = this.ctx;
    const { cx, cy, sectorCos: cs, sectorSin: sn, sectors: n } = this;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const c = cs[i];
      const s = sn[i];
      // rotation
      ctx.moveTo(cx + ax * c - ay * s, cy + ax * s + ay * c);
      ctx.quadraticCurveTo(cx + kx * c - ky * s, cy + kx * s + ky * c, cx + bx * c - by * s, cy + bx * s + by * c);
      // rotation of the mirrored point (y negated)
      ctx.moveTo(cx + ax * c + ay * s, cy + ax * s - ay * c);
      ctx.quadraticCurveTo(cx + kx * c + ky * s, cy + kx * s - ky * c, cx + bx * c + by * s, cy + bx * s - by * c);
    }
    if (drawHalo) {
      ctx.strokeStyle = halo;
      ctx.lineWidth = width * 2.4;
      ctx.stroke();
    }
    ctx.strokeStyle = core;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  private updateComets(dt: number): void {
    let w = 0;
    for (let i = 0; i < this.comets.length; i++) {
      const c = this.comets[i];
      c.life -= dt / COMET_MS;
      const sp = Math.hypot(c.vx, c.vy);
      const nx = c.brush.x + c.vx * dt;
      const ny = c.brush.y + c.vy * dt;
      c.colorT += dt * 0.00008;
      this.drawStroke(c.brush, nx, ny, sp, c.colorT, Math.max(0, c.life), 1, c.pressure, false, c.vx, c.vy);
      const fr = Math.exp(-dt / COMET_TAU);
      c.vx *= fr;
      c.vy *= fr;
      if (c.life > 0 && sp > 0.02 * this.dpr) this.comets[w++] = c;
    }
    this.comets.length = w;
  }

  private stepAuto(dt: number): void {
    this.autoT += dt;
    const t = this.autoT * 0.001;
    const m = 0.34;
    const tx = this.cx + Math.sin(t * 0.7) * Math.cos(t * 0.23) * this.width * m;
    const ty = this.cy + Math.cos(t * 0.53) * Math.sin(t * 0.31) * this.height * m;
    if (!this.autoBrush) this.autoBrush = newBrush(tx, ty);
    const px = this.autoBrush.x;
    const py = this.autoBrush.y;
    const speed = Math.hypot(tx - px, ty - py) / Math.max(1, dt);
    this.autoColorT += dt * 0.00006;
    this.drawStroke(this.autoBrush, tx, ty, speed, this.autoColorT, 1, 1, 0.5, true, (tx - px) / dt, (ty - py) / dt);
  }

  private stepReset(dt: number): void {
    this.resetT += dt;
    const p = Math.min(1, this.resetT / RESET_MS);
    const e = easeOutCubic(p);

    // Accelerating wipe of the composition back to calm.
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(${BG.r},${BG.g},${BG.b},${0.06 + 0.26 * e})`;
    ctx.fillRect(0, 0, this.width, this.height);

    // A bright ring blooms outward on the FX layer — the "satisfying" part.
    const fx = this.fx;
    const maxR = Math.hypot(this.width, this.height) / 2;
    const c = this.resetColor;
    fx.globalCompositeOperation = 'lighter';
    fx.strokeStyle = `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${(1 - e) * 0.7})`;
    fx.lineWidth = (2 + (1 - e) * 46) * this.dpr;
    fx.beginPath();
    fx.arc(this.cx, this.cy, e * maxR * 1.12, 0, Math.PI * 2);
    fx.stroke();
    fx.globalCompositeOperation = 'source-over';

    if (p >= 1) {
      this.resetting = false;
      this.comets.length = 0;
      this.strokes.clear();
      this.clearToBackground();
    }
  }

  // --- particles -----------------------------------------------------------

  private buildParticleSprites(): void {
    this.particleSprites = [];
    for (let i = 0; i < SPRITE_N; i++) {
      const col = samplePalette(this.palette, i / SPRITE_N);
      const cv = document.createElement('canvas');
      cv.width = SPRITE_SIZE;
      cv.height = SPRITE_SIZE;
      const g = cv.getContext('2d');
      if (!g) continue;
      const h = SPRITE_SIZE / 2;
      const grad = g.createRadialGradient(h, h, 0, h, h, h);
      grad.addColorStop(0, `rgba(${col.r | 0},${col.g | 0},${col.b | 0},1)`);
      grad.addColorStop(0.35, `rgba(${col.r | 0},${col.g | 0},${col.b | 0},0.5)`);
      grad.addColorStop(1, `rgba(${col.r | 0},${col.g | 0},${col.b | 0},0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
      this.particleSprites.push(cv);
    }
  }

  private spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    colorT: number,
    size: number,
    life: number
  ): void {
    if (this.particles.length >= this.maxParticles) return;
    const sprite = Math.floor((((colorT % 1) + 1) % 1) * SPRITE_N) % SPRITE_N;
    this.particles.push({ x, y, vx, vy, life, maxLife: life, size, sprite });
  }

  private burst(x: number, y: number, colorT: number, count: number, power: number): void {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = power * (0.25 + Math.random() * 0.9);
      const size = (10 + 16 * Math.random()) * this.dpr;
      this.spawn(x, y, Math.cos(ang) * sp, Math.sin(ang) * sp, colorT + Math.random(), size, 600 + Math.random() * 900);
    }
  }

  private updateParticles(dt: number): void {
    let w = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const fr = Math.exp(-dt / PARTICLE_TAU);
      p.vx *= fr;
      p.vy *= fr;
      this.particles[w++] = p;
    }
    this.particles.length = w;
  }

  private drawParticles(): void {
    if (this.particles.length === 0 || this.particleSprites.length === 0) return;
    const fx = this.fx;
    const { cx, cy, sectorCos: cs, sectorSin: sn, sectors: n } = this;
    fx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const t = p.life / p.maxLife;
      fx.globalAlpha = t * t * 0.85;
      const spr = this.particleSprites[p.sprite];
      const hs = p.size / 2;
      const ax = p.x - cx;
      const ay = p.y - cy;
      for (let i = 0; i < n; i++) {
        const c = cs[i];
        const s = sn[i];
        fx.drawImage(spr, cx + ax * c - ay * s - hs, cy + ax * s + ay * c - hs, p.size, p.size);
        fx.drawImage(spr, cx + ax * c + ay * s - hs, cy + ax * s - ay * c - hs, p.size, p.size);
      }
    }
    fx.globalAlpha = 1;
    fx.globalCompositeOperation = 'source-over';
  }
}
