import type { PointerSample, Scene, SceneContext, SceneSettings } from '../core/types';
import { PALETTES, samplePalette } from '../palettes';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

const SOUND_FREQ = [0.018, 0.04, 0.085]; // Grave / Médium / Aigu
const SOUND_RIBBONS = 5;

interface TrailPoint {
  x: number;
  y: number;
  sp: number;
  life: number;
}

/**
 * Tableau « Rubans sonores » — the gesture becomes a vibrating waveform: a
 * trail of samples drawn as parallel ribbons offset by a travelling sine whose
 * frequency/amplitude track gesture speed. Knob = pitch register.
 */
export class SoundScene implements Scene {
  readonly id = 'sound-ribbons';
  readonly name = 'Rubans sonores';
  readonly paletteCount = PALETTES.length;
  readonly knobLabel = 'Registre';
  readonly knobOptions = ['Grave', 'Médium', 'Aigu'] as const;
  readonly supportsAuto = false;
  readonly hint = {
    title: 'Joue le mouvement',
    sub: 'Glisse vite pour monter dans les aigus · double-tap : vibrato'
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

  private readonly trail: TrailPoint[] = [];
  private readonly last = new Map<number, number>();
  private tms = 0;
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
    this.trail.length = 0;
    this.clearBg();
    this.fx.clearRect(0, 0, this.width, this.height);
  }
  unmount(): void {
    this.trail.length = 0;
    this.last.clear();
  }

  onInput(s: PointerSample): void {
    if (s.phase === 'start') {
      const now = performance.now();
      const isDouble = now - this.lastTapMs < 300 && Math.hypot(s.x - this.lastTapX, s.y - this.lastTapY) < 80 * this.dpr;
      this.lastTapMs = now;
      this.lastTapX = s.x;
      this.lastTapY = s.y;
      this.last.set(s.id, 1);
      this.pushPoint(s.x, s.y, s.speed);
      if (isDouble) {
        for (const t of this.trail) t.sp = t.sp + 1.6 * this.dpr;
        navigator.vibrate?.(this.settings.reducedEffects ? 0 : 14);
      }
    } else if (s.phase === 'move') {
      this.pushPoint(s.x, s.y, s.speed);
    } else {
      this.last.delete(s.id);
    }
  }

  update(dt: number, _t: number): void {
    this.frame(dt);
  }

  private get palette() {
    return PALETTES[this.paletteIndex];
  }
  private clearBg(): void {
    if (!this.ctx) return;
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = '#06060f';
    this.ctx.fillRect(0, 0, this.width, this.height);
  }
  private pushPoint(x: number, y: number, sp: number): void {
    const p = this.trail[this.trail.length - 1];
    if (p) {
      const d = Math.hypot(x - p.x, y - p.y);
      const step = 9 * this.dpr;
      if (d > step) {
        const k = Math.min(6, Math.floor(d / step));
        for (let i = 1; i <= k; i++) this.trail.push({ x: p.x + ((x - p.x) * i) / k, y: p.y + ((y - p.y) * i) / k, sp, life: 1 });
        return;
      }
    }
    this.trail.push({ x, y, sp, life: 1 });
  }

  private frame(dt: number): void {
    this.tms += dt;
    this.colorBase += dt * 0.00004;
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(6,6,15,${1 - Math.exp(-dt / 5200)})`;
    ctx.fillRect(0, 0, this.width, this.height);
    let w = 0;
    for (let i = 0; i < this.trail.length; i++) {
      const p = this.trail[i];
      p.life -= dt / 4200;
      if (p.life > 0) this.trail[w++] = p;
    }
    this.trail.length = w;
    if (this.trail.length < 2) {
      this.fx.clearRect(0, 0, this.width, this.height);
      return;
    }
    const arc = new Float32Array(this.trail.length);
    for (let i = 1; i < this.trail.length; i++) arc[i] = arc[i - 1] + Math.hypot(this.trail[i].x - this.trail[i - 1].x, this.trail[i].y - this.trail[i - 1].y);
    const freq = SOUND_FREQ[this.level] / this.dpr;
    const omega = this.tms * 0.012;
    const reduced = this.settings.reducedEffects;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let k = 0; k < SOUND_RIBBONS; k++) {
      const lane = k - (SOUND_RIBBONS - 1) / 2;
      const c = samplePalette(this.palette, (this.colorBase + k / SOUND_RIBBONS) % 1);
      ctx.beginPath();
      for (let i = 0; i < this.trail.length; i++) {
        const p = this.trail[i];
        const a = this.trail[Math.max(0, i - 1)];
        const b = this.trail[Math.min(this.trail.length - 1, i + 1)];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const dl = Math.hypot(dx, dy) + 0.001;
        dx /= dl;
        dy /= dl;
        const nx = -dy;
        const ny = dx;
        const amp = (6 + Math.min(2.2, p.sp) * 26) * this.dpr;
        const wave = Math.sin(arc[i] * freq - omega) * amp;
        const off = lane * 5 * this.dpr + wave * (0.5 + Math.abs(lane) * 0.32);
        const X = p.x + nx * off;
        const Y = p.y + ny * off;
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      }
      const tipLife = this.trail[this.trail.length - 1].life;
      ctx.strokeStyle = `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${0.5 * tipLife + 0.15})`;
      ctx.lineWidth = (reduced ? 1.4 : 2.2) * this.dpr;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    this.fx.clearRect(0, 0, this.width, this.height);
  }
}
