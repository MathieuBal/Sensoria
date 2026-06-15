import type { PointerSample, Scene, SceneContext, SceneSettings } from '../core/types';
import { PALETTES, samplePalette } from '../palettes';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

const GARDEN_FADE_TAU = 14000;
const GARDEN_TIP_CAP = 380; // hard ceiling on live growing tips
const GARDEN_BLOOM_CAP = 260; // hard ceiling on bloom particles
const GARDEN_MODE = [
  { speed: 0.1, jitter: 0.16, fork: 0.05, bloom: 18, gen: 5, w: 4.2, jag: false },
  { speed: 0.13, jitter: 0.1, fork: 0.03, bloom: 34, gen: 4, w: 3.4, jag: false },
  { speed: 0.32, jitter: 0.05, fork: 0.1, bloom: 10, gen: 3, w: 2.2, jag: true }
];

interface Tip {
  x: number;
  y: number;
  ang: number;
  gen: number;
  len: number;
  maxLen: number;
  w: number;
  colorT: number;
  life: number;
  vmul: number;
}

interface Bloom {
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
 * Tableau « Jardin de lumière » — procedural growth of light.
 *
 * Gestures sprout "tips" that advance, branch and bloom into flowers at their
 * ends, drawn additively onto a slowly fading canvas. Growth is hard-bounded
 * (caps + linear continuation) so a long stroke can't explode into a thicket.
 * The knob switches the growth style: Vigne / Fleur / Foudre.
 */
export class LightGardenScene implements Scene {
  readonly id = 'light-garden';
  readonly name = 'Jardin de lumière';
  readonly paletteCount = PALETTES.length;
  readonly knobLabel = 'Croissance';
  readonly knobOptions = ['Vigne', 'Fleur', 'Foudre'] as const;
  readonly supportsAuto = false;
  readonly hint = {
    title: 'Fais pousser la lumière',
    sub: 'Glisse pour faire croître · double-tap : éclosion · Échap : réglages'
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

  private readonly tips: Tip[] = [];
  private readonly blooms: Bloom[] = [];
  private readonly last = new Map<number, { x: number; y: number }>();
  private colorBase = 0;
  private lastTapMs = -Infinity;
  private lastTapX = 0;
  private lastTapY = 0;
  private lastSeedMs = 0;

  mount(context: SceneContext): void {
    this.ctx = context.ctx;
    this.fx = context.fx;
    this.settings = context.settings;
    this.dpr = context.dpr;
    this.paletteIndex = clamp(this.settings.palette, 0, this.paletteCount - 1);
    this.level = clamp(this.settings.symmetry, 0, 2);
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.clearBg();
  }

  setPalette(index: number): void {
    this.paletteIndex = clamp(index, 0, this.paletteCount - 1);
  }

  setSymmetry(level: number): void {
    this.level = clamp(level, 0, 2);
  }

  setAuto(_on: boolean): void {
    /* no auto mode */
  }

  reset(): void {
    this.tips.length = 0;
    this.blooms.length = 0;
    this.clearBg();
    this.fx.clearRect(0, 0, this.width, this.height);
  }

  unmount(): void {
    this.tips.length = 0;
    this.blooms.length = 0;
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
      this.lastSeedMs = now;
      if (isDouble) {
        for (let k = 0; k < 4; k++) this.seed(s.x, s.y, Math.random() * Math.PI * 2, this.mode.gen);
        if (!this.settings.reducedEffects) navigator.vibrate?.(16);
      } else {
        this.seed(s.x, s.y, null, this.mode.gen);
      }
    } else if (s.phase === 'move') {
      const p = this.last.get(s.id);
      if (!p) return;
      // Throttle seeding by distance AND time, cap dragged depth → no thicket.
      const now = performance.now();
      const dx = s.x - p.x;
      const dy = s.y - p.y;
      if (Math.hypot(dx, dy) > 34 * this.dpr && now - this.lastSeedMs > 55) {
        this.seed(s.x, s.y, Math.atan2(dy, dx), Math.min(this.mode.gen, 3));
        p.x = s.x;
        p.y = s.y;
        this.lastSeedMs = now;
      }
    } else {
      this.last.delete(s.id);
    }
  }

  update(dt: number, _timeMs: number): void {
    this.colorBase += dt * 0.00003;
    this.applyFade(dt);
    this.grow(dt);
    this.updateBlooms(dt);
  }

  // --- internals -----------------------------------------------------------

  private get palette() {
    return PALETTES[this.paletteIndex];
  }

  private get mode() {
    return GARDEN_MODE[this.level];
  }

  private clearBg(): void {
    if (!this.ctx) return;
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = '#050610';
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  private applyFade(dt: number): void {
    const k = 1 - Math.exp(-dt / GARDEN_FADE_TAU);
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = `rgba(5,6,16,${k})`;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  private spawnTip(x: number, y: number, ang: number, gen: number, colorT: number): void {
    if (gen <= 0 || this.tips.length >= GARDEN_TIP_CAP) return;
    const m = this.mode;
    this.tips.push({
      x,
      y,
      ang,
      gen,
      len: 0,
      maxLen: (60 + Math.random() * 120) * this.dpr * (0.6 + gen * 0.12),
      w: m.w * this.dpr * (0.5 + gen * 0.12),
      colorT,
      life: 1,
      vmul: 0.8 + Math.random() * 0.5
    });
  }

  private bloom(x: number, y: number, colorT: number, size: number): void {
    if (this.settings.reducedEffects || this.blooms.length >= GARDEN_BLOOM_CAP) return;
    const n = 4 + ((Math.random() * 5) | 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (0.02 + Math.random() * 0.1) * this.dpr;
      this.blooms.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 0.01 * this.dpr,
        life: 1,
        maxLife: 700 + Math.random() * 700,
        size: size * (0.4 + Math.random() * 0.8) * this.dpr,
        colorT: colorT + Math.random() * 0.15
      });
    }
  }

  private seed(x: number, y: number, dirAng: number | null, gen: number): void {
    const colorT = this.colorBase + Math.random() * 0.1;
    const base = dirAng != null ? dirAng : -Math.PI / 2 + (Math.random() - 0.5) * 0.8;
    this.spawnTip(x, y, base, gen, colorT);
    if (Math.random() < 0.3) this.spawnTip(x, y, base + (Math.random() - 0.5) * 0.5, gen - 1, colorT + 0.05);
  }

  private grow(dt: number): void {
    const m = this.mode;
    const reduced = this.settings.reducedEffects;
    const glow = !reduced && this.tips.length < 220; // drop halo pass under load
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    let w = 0;
    for (let i = 0; i < this.tips.length; i++) {
      const t = this.tips[i];
      const px = t.x;
      const py = t.y;
      t.ang += (Math.random() - 0.5) * m.jitter + (m.jag && Math.random() < 0.2 ? (Math.random() - 0.5) * 1.2 : 0);
      const stp = m.speed * dt * t.vmul * this.dpr;
      t.x += Math.cos(t.ang) * stp;
      t.y += Math.sin(t.ang) * stp;
      t.len += stp;
      const c = samplePalette(this.palette, t.colorT);
      const a = 0.5 * t.life;
      const lw = Math.max(0.6, t.w * (1 - (t.len / t.maxLen) * 0.6));
      if (glow) {
        ctx.strokeStyle = `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${a * 0.35})`;
        ctx.lineWidth = lw * 2.6;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(t.x, t.y);
        ctx.stroke();
      }
      ctx.strokeStyle = `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${a})`;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
      // Mid-branch side shoot (child two generations shallower).
      if (t.gen > 1 && t.len > t.maxLen * 0.4 && Math.random() < m.fork) {
        this.spawnTip(t.x, t.y, t.ang + (Math.random() < 0.5 ? 1 : -1) * (0.4 + Math.random() * 0.5), t.gen - 2, t.colorT + 0.04);
      }
      const off = t.x < -40 || t.y < -40 || t.x > this.width + 40 || t.y > this.height + 40;
      if (t.len >= t.maxLen || off) {
        if (!off && t.gen > 1) {
          this.spawnTip(t.x, t.y, t.ang + (Math.random() - 0.5) * 0.6, t.gen - 1, t.colorT + 0.05);
          if (Math.random() < 0.3) {
            this.spawnTip(t.x, t.y, t.ang + (Math.random() < 0.5 ? 1 : -1) * (0.5 + Math.random() * 0.4), t.gen - 2, t.colorT + 0.08);
          }
        }
        if (!off && (t.gen <= 1 || Math.random() < 0.5)) this.bloom(t.x, t.y, t.colorT, m.bloom);
        continue;
      }
      this.tips[w++] = t;
    }
    this.tips.length = w;
    ctx.globalCompositeOperation = 'source-over';
  }

  private updateBlooms(dt: number): void {
    const fx = this.fx;
    fx.clearRect(0, 0, this.width, this.height);
    if (!this.blooms.length) return;
    fx.globalCompositeOperation = 'lighter';
    let w = 0;
    for (let i = 0; i < this.blooms.length; i++) {
      const p = this.blooms[i];
      p.life -= dt / p.maxLife;
      if (p.life <= 0) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.00004 * dt * this.dpr;
      const c = samplePalette(this.palette, p.colorT);
      const r = p.size * (0.6 + p.life * 0.6);
      const g = fx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${p.life * 0.9})`);
      g.addColorStop(0.4, `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${p.life * 0.4})`);
      g.addColorStop(1, `rgba(${c.r | 0},${c.g | 0},${c.b | 0},0)`);
      fx.fillStyle = g;
      fx.beginPath();
      fx.arc(p.x, p.y, r, 0, Math.PI * 2);
      fx.fill();
      this.blooms[w++] = p;
    }
    this.blooms.length = w;
    fx.globalCompositeOperation = 'source-over';
  }
}
