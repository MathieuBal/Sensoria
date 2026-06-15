import type { PointerSample, Scene, SceneContext, SceneSettings } from '../core/types';
import { PALETTES, type Rgb } from '../palettes';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Fog opacity per "Buée" level. */
const FOG_LEVELS = [0.42, 0.6, 0.78];
/** How fast condensation creeps back, per level (alpha per second). */
const REFOG_LEVELS = [0.01, 0.03, 0.06];

interface Drop {
  x: number;
  y: number;
  r: number;
  vy: number;
  vx: number;
  life: number;
}

/**
 * Tableau « Verre liquide » — a foggy pane you wipe with the gesture, with
 * droplets that are born under the finger, slide down under gravity and clear
 * trails through the condensation (§4.4).
 *
 * Rendering model differs from the kaleidoscope: the frame is fully recomposed
 * every tick (background → fog layer → droplets), so cost stays flat and the
 * fog can be erased with `destination-out` on an offscreen buffer.
 */
export class LiquidGlassScene implements Scene {
  readonly id = 'liquid-glass';
  readonly name = 'Verre liquide';
  readonly paletteCount = PALETTES.length;
  readonly knobLabel = 'Buée';
  readonly knobOptions = ['Légère', 'Moyenne', 'Dense'] as const;

  onPaletteChange?: (index: number) => void;

  private ctx!: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private settings!: SceneSettings;

  private paletteIndex = 0;
  private level = 1;

  private bg!: CanvasGradient;
  private fog!: HTMLCanvasElement;
  private fogCtx!: CanvasRenderingContext2D;
  private dropSprite!: HTMLCanvasElement;

  private readonly drops: Drop[] = [];
  private readonly last = new Map<number, { x: number; y: number }>();
  private refogAccum = 0;

  private lastTapMs = -Infinity;
  private lastTapX = 0;
  private lastTapY = 0;

  mount(context: SceneContext): void {
    this.ctx = context.ctx;
    this.settings = context.settings;
    this.dpr = context.dpr;
    this.paletteIndex = clamp(this.settings.palette, 0, this.paletteCount - 1);
    this.level = clamp(this.settings.symmetry, 0, FOG_LEVELS.length - 1);
    this.fog = document.createElement('canvas');
    this.fogCtx = this.fog.getContext('2d')!;
    this.buildDropSprite();
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.fog.width = width;
    this.fog.height = height;
    this.buildBackground();
    this.refog();
  }

  setPalette(index: number): void {
    this.paletteIndex = clamp(index, 0, this.paletteCount - 1);
    this.buildBackground();
  }

  setSymmetry(level: number): void {
    this.level = clamp(level, 0, FOG_LEVELS.length - 1);
    this.refog();
  }

  setAuto(_on: boolean): void {
    /* auto mode is a no-op for this contemplative scene */
  }

  reset(): void {
    // The condensation visibly creeping back over the glass is the cue.
    this.drops.length = 0;
    this.refog();
  }

  unmount(): void {
    this.drops.length = 0;
    this.last.clear();
  }

  onInput(s: PointerSample): void {
    if (s.phase === 'start') {
      const now = performance.now();
      const isDouble =
        now - this.lastTapMs < 300 && Math.hypot(s.x - this.lastTapX, s.y - this.lastTapY) < 80 * this.dpr;
      this.lastTapMs = now;
      this.lastTapX = s.x;
      this.lastTapY = s.y;
      this.last.set(s.id, { x: s.x, y: s.y });
      this.wipe(s.x, s.y, s.x, s.y, 0);
      if (isDouble) {
        // "Projeter une pluie" — a cluster of fresh droplets.
        for (let i = 0; i < 14; i++) {
          this.addDrop(s.x + (Math.random() - 0.5) * 120 * this.dpr, s.y + (Math.random() - 0.5) * 80 * this.dpr);
        }
        navigator.vibrate?.(this.settings.reducedEffects ? 0 : 16);
      } else {
        this.addDrop(s.x, s.y);
      }
    } else if (s.phase === 'move') {
      const p = this.last.get(s.id);
      if (!p) return;
      this.wipe(p.x, p.y, s.x, s.y, s.speed);
      // Fast strokes fling off droplets.
      if (Math.random() < clamp(s.speed / (1.5 * this.dpr), 0, 1) * 0.5) this.addDrop(s.x, s.y);
      p.x = s.x;
      p.y = s.y;
    } else {
      this.last.delete(s.id);
    }
  }

  update(dt: number, _timeMs: number): void {
    // Condensation slowly creeps back where it was wiped.
    this.refogAccum += dt;
    if (this.refogAccum > 120) {
      this.creepFog(this.refogAccum / 1000);
      this.refogAccum = 0;
    }
    this.updateDrops(dt);
    this.render();
  }

  // --- internals -----------------------------------------------------------

  private get palette() {
    return PALETTES[this.paletteIndex];
  }

  private rgb(c: Rgb, a = 1): string {
    return `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${a})`;
  }

  private buildBackground(): void {
    if (!this.ctx) return;
    const g = this.ctx.createLinearGradient(0, 0, this.width, this.height);
    const s = this.palette.stops;
    g.addColorStop(0, this.rgb(s[0]));
    g.addColorStop(0.5, this.rgb(s[Math.min(2, s.length - 1)]));
    g.addColorStop(1, this.rgb(s[s.length - 1]));
    this.bg = g;
  }

  private refog(): void {
    if (!this.fogCtx) return;
    const f = this.fogCtx;
    f.clearRect(0, 0, this.width, this.height);
    f.globalCompositeOperation = 'source-over';
    f.fillStyle = `rgba(226,234,242,${FOG_LEVELS[this.level]})`;
    f.fillRect(0, 0, this.width, this.height);
    // Speckle the condensation so it reads as real misted glass.
    const speckles = Math.round((this.width * this.height) / (900 * this.dpr));
    for (let i = 0; i < speckles; i++) {
      const a = Math.random() * 0.06;
      f.fillStyle = `rgba(255,255,255,${a})`;
      const r = (0.5 + Math.random() * 1.5) * this.dpr;
      f.beginPath();
      f.arc(Math.random() * this.width, Math.random() * this.height, r, 0, Math.PI * 2);
      f.fill();
    }
  }

  private creepFog(seconds: number): void {
    const f = this.fogCtx;
    f.globalCompositeOperation = 'source-over';
    f.fillStyle = `rgba(226,234,242,${REFOG_LEVELS[this.level] * seconds})`;
    f.fillRect(0, 0, this.width, this.height);
  }

  private wipe(x1: number, y1: number, x2: number, y2: number, speed: number): void {
    const f = this.fogCtx;
    const w = (16 + clamp(speed / this.dpr, 0, 2) * 14) * this.dpr;
    f.globalCompositeOperation = 'destination-out';
    f.strokeStyle = 'rgba(0,0,0,1)';
    f.lineCap = 'round';
    f.lineWidth = w;
    f.beginPath();
    f.moveTo(x1, y1);
    f.lineTo(x2, y2);
    f.stroke();
    f.globalCompositeOperation = 'source-over';
  }

  private addDrop(x: number, y: number): void {
    if (this.drops.length > 260) return;
    this.drops.push({
      x,
      y,
      r: (5 + Math.random() * 10) * this.dpr,
      vy: 0,
      vx: (Math.random() - 0.5) * 0.02 * this.dpr,
      life: 1
    });
  }

  private updateDrops(dt: number): void {
    const f = this.fogCtx;
    f.globalCompositeOperation = 'destination-out';
    let w = 0;
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i];
      // Heavier drops fall faster; they only start sliding past a threshold.
      d.vy += (0.00006 * d.r) * dt;
      if (d.vy > 0.02 * this.dpr) {
        d.y += d.vy * dt;
        d.x += d.vx * dt + Math.sin(d.y * 0.05) * 0.02 * this.dpr;
        // The sliding drop clears a channel through the fog.
        f.beginPath();
        f.arc(d.x, d.y, d.r * 0.7, 0, Math.PI * 2);
        f.fill();
      }
      d.r -= 0.0008 * this.dpr * dt; // slow evaporation
      if (d.y - d.r < this.height && d.r > 1.5 * this.dpr) this.drops[w++] = d;
    }
    this.drops.length = w;
    f.globalCompositeOperation = 'source-over';
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    // Background "behind" the glass.
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, this.width, this.height);
    // Misted glass.
    ctx.drawImage(this.fog, 0, 0);
    // Droplets as little lenses.
    for (const d of this.drops) {
      const s = d.r * 2.6;
      ctx.drawImage(this.dropSprite, d.x - s / 2, d.y - s / 2, s, s);
    }
  }

  private buildDropSprite(): void {
    const size = 96;
    const cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    const g = cv.getContext('2d')!;
    const h = size / 2;
    // Lens shadow + bright off-centre highlight = a convincing water bead.
    const shade = g.createRadialGradient(h, h, 0, h, h, h);
    shade.addColorStop(0, 'rgba(255,255,255,0.05)');
    shade.addColorStop(0.7, 'rgba(10,20,30,0.18)');
    shade.addColorStop(1, 'rgba(10,20,30,0)');
    g.fillStyle = shade;
    g.beginPath();
    g.arc(h, h, h * 0.75, 0, Math.PI * 2);
    g.fill();
    const hi = g.createRadialGradient(h * 0.7, h * 0.7, 0, h * 0.7, h * 0.7, h * 0.5);
    hi.addColorStop(0, 'rgba(255,255,255,0.9)');
    hi.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hi;
    g.beginPath();
    g.arc(h * 0.7, h * 0.7, h * 0.45, 0, Math.PI * 2);
    g.fill();
    this.dropSprite = cv;
  }
}
