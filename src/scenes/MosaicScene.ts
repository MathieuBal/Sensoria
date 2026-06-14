import type { PointerSample, Scene, SceneContext, SceneSettings } from '../core/types';
import { PALETTES, samplePalette, type Rgb } from '../palettes';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/** Background colour, kept in sync with the PWA theme colour (#0b0d14). */
const BG: Rgb = { r: 11, g: 13, b: 20 };

/** Rotational sectors per symmetry level. Each is also mirrored. */
const SECTORS = [4, 6, 8];

/** Reference gesture speed (CSS px/ms) used to normalise expressiveness. */
const SPEED_REF = 2.2;
const COMET_MS = 900; // inertia lifetime after release
const COMET_TAU = 240; // velocity decay time-constant (ms)
const RESET_MS = 750;
const FADE_TAU = 7000; // gentle longevity fade keeps the scene fresh for minutes

interface Comet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  colorT: number;
  pressure: number;
}

/**
 * Tableau « Mosaïque infinie » — a generative kaleidoscope.
 *
 * Each stroke is reproduced across N rotational sectors and their mirrors, so
 * even random gestures resolve into a pleasing symmetric composition (§8).
 *
 * Definition of done (§10.1) implemented here:
 *  - mouse + touch via the shared InputManager (multi-touch aware);
 *  - unbroken strokes even on fast flicks (coalesced events + connected segments);
 *  - speed & direction modulate width and brightness;
 *  - 3 symmetry levels and 3 palettes;
 *  - matter keeps living after release (inertia comets);
 *  - animated, satisfying reset (expanding ring + fade);
 *  - constant per-frame cost → stays fluid after minutes;
 *  - rendering kept separate from the input engine.
 */
export class MosaicScene implements Scene {
  readonly id = 'mosaic';
  readonly name = 'Mosaïque infinie';
  readonly paletteCount = PALETTES.length;
  readonly symmetryLevels = SECTORS.length;

  private ctx!: CanvasRenderingContext2D;
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

  private readonly activePointers = new Set<number>();
  private readonly comets: Comet[] = [];

  private colorBase = 0;

  // Auto-mode wandering pointer.
  private autoT = 0;
  private autoX = NaN;
  private autoY = NaN;
  private autoColorT = 0;

  // Reset animation.
  private resetting = false;
  private resetT = 0;
  private resetColor: Rgb = PALETTES[0].stops[0];

  mount(context: SceneContext): void {
    this.ctx = context.ctx;
    this.settings = context.settings;
    this.perf = context.perf;
    this.dpr = context.dpr;
    this.paletteIndex = clamp(this.settings.palette, 0, this.paletteCount - 1);
    this.sectors = SECTORS[clamp(this.settings.symmetry, 0, SECTORS.length - 1)];
    this.auto = this.settings.auto;
    this.clearToBackground();
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.cx = width / 2;
    this.cy = height / 2;
    this.dpr = dpr;
    // Resizing the backing store clears it — repaint the background.
    this.clearToBackground();
  }

  setPalette(index: number): void {
    this.paletteIndex = clamp(index, 0, this.paletteCount - 1);
  }

  setSymmetry(level: number): void {
    this.sectors = SECTORS[clamp(level, 0, SECTORS.length - 1)];
  }

  setAuto(on: boolean): void {
    this.auto = on;
    if (on) {
      this.autoX = NaN; // re-seed from centre on next frame
      this.autoY = NaN;
    }
  }

  reset(): void {
    this.resetting = true;
    this.resetT = 0;
    this.resetColor = samplePalette(this.palette, this.colorBase);
  }

  unmount(): void {
    this.activePointers.clear();
    this.comets.length = 0;
  }

  onInput(s: PointerSample): void {
    if (this.resetting) return;
    const colorT = this.colorBase + s.id * 0.13 + this.speedNorm(s.speed) * 0.25;

    if (s.phase === 'start') {
      this.activePointers.add(s.id);
      this.paintSegment(s.x, s.y, s.x, s.y, s.speed, colorT, 1, 1, s.pressure);
    } else if (s.phase === 'move') {
      this.paintSegment(s.px, s.py, s.x, s.y, s.speed, colorT, 1, 1, s.pressure);
    } else {
      this.activePointers.delete(s.id);
      if (s.speed > 0.12 * this.dpr) {
        this.comets.push({
          x: s.x,
          y: s.y,
          vx: s.vx,
          vy: s.vy,
          life: 1,
          colorT,
          pressure: s.pressure
        });
      }
    }
  }

  update(dt: number, _timeMs: number): void {
    this.colorBase += dt * 0.00004;

    if (this.resetting) {
      this.stepReset(dt);
      return;
    }

    this.applyFade(dt);
    this.updateComets(dt);
    if (this.auto && this.activePointers.size === 0) this.stepAuto(dt);
  }

  // --- internals -----------------------------------------------------------

  private get palette() {
    return PALETTES[this.paletteIndex];
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

  private updateComets(dt: number): void {
    let w = 0;
    for (let i = 0; i < this.comets.length; i++) {
      const c = this.comets[i];
      const nx = c.x + c.vx * dt;
      const ny = c.y + c.vy * dt;
      const sp = Math.hypot(c.vx, c.vy);
      c.life -= dt / COMET_MS;
      c.colorT += dt * 0.00008;
      this.paintSegment(c.x, c.y, nx, ny, sp, c.colorT, Math.max(0, c.life), 1, c.pressure);
      c.x = nx;
      c.y = ny;
      const fr = Math.exp(-dt / COMET_TAU);
      c.vx *= fr;
      c.vy *= fr;
      if (c.life > 0 && sp > 0.02 * this.dpr) {
        this.comets[w++] = c; // keep, compacting in place to avoid allocation
      }
    }
    this.comets.length = w;
  }

  private stepAuto(dt: number): void {
    this.autoT += dt;
    const t = this.autoT * 0.001;
    const m = 0.34;
    // Layered sines give an organic, non-repeating wander within the frame.
    const tx = this.cx + (Math.sin(t * 0.7) * Math.cos(t * 0.23)) * this.width * m;
    const ty = this.cy + (Math.cos(t * 0.53) * Math.sin(t * 0.31)) * this.height * m;
    if (Number.isNaN(this.autoX)) {
      this.autoX = tx;
      this.autoY = ty;
    }
    const px = this.autoX;
    const py = this.autoY;
    this.autoX = tx;
    this.autoY = ty;
    const speed = Math.hypot(tx - px, ty - py) / Math.max(1, dt);
    this.autoColorT += dt * 0.00006;
    this.paintSegment(px, py, tx, ty, speed, this.autoColorT, 1, 1, 0.5);
  }

  private stepReset(dt: number): void {
    this.resetT += dt;
    const p = Math.min(1, this.resetT / RESET_MS);
    const e = easeOutCubic(p);
    const ctx = this.ctx;

    // Accelerating wipe back to calm.
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(${BG.r},${BG.g},${BG.b},${0.06 + 0.26 * e})`;
    ctx.fillRect(0, 0, this.width, this.height);

    // A bright ring blooms outward and fades — the "satisfying" part.
    const maxR = Math.hypot(this.width, this.height) / 2;
    const r = e * maxR * 1.12;
    const a = (1 - e) * 0.7;
    const c = this.resetColor;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${a})`;
    ctx.lineWidth = (2 + (1 - e) * 46) * this.dpr;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, r, 0, Math.PI * 2);
    ctx.stroke();

    if (p >= 1) {
      this.resetting = false;
      this.comets.length = 0;
      this.clearToBackground();
    }
  }

  /**
   * Draw one segment, replicated across every rotational sector and mirror.
   * Width and brightness follow gesture speed; a soft wide pass plus a bright
   * core pass produce a glow without the per-segment cost of shadow blur.
   */
  private paintSegment(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    speed: number,
    colorT: number,
    alphaMul = 1,
    widthMul = 1,
    pressure = 0.5
  ): void {
    const sn = this.speedNorm(speed);
    const quality = this.perf.quality;
    const reduced = this.settings.reducedEffects;

    // Slow gestures lay down calm, thick ribbons; fast ones leave thin, bright streaks.
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

    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Centre-relative coordinates so rotation/mirroring is a simple transform.
    const ax = x1 - this.cx;
    const ay = y1 - this.cy;
    const bx = x2 - this.cx;
    const by = y2 - this.cy;
    const step = (Math.PI * 2) / this.sectors;

    ctx.save();
    ctx.translate(this.cx, this.cy);
    for (let k = 0; k < this.sectors; k++) {
      ctx.save();
      ctx.rotate(step * k);
      this.strokeOne(ax, ay, bx, by, core, halo, width, drawHalo);
      ctx.scale(1, -1); // mirror within the sector
      this.strokeOne(ax, ay, bx, by, core, halo, width, drawHalo);
      ctx.restore();
    }
    ctx.restore();

    ctx.globalCompositeOperation = 'source-over';
  }

  private strokeOne(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    core: string,
    halo: string,
    width: number,
    drawHalo: boolean
  ): void {
    const ctx = this.ctx;
    if (drawHalo) {
      ctx.strokeStyle = halo;
      ctx.lineWidth = width * 2.4;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    ctx.strokeStyle = core;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
}
