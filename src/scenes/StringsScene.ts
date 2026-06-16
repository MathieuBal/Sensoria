import type { PointerSample, Scene, SceneContext, SceneSettings } from '../core/types';
import { PALETTES, samplePalette } from '../palettes';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

// Registry id stays 'sound-ribbons' (historical); the tableau is now « Cordes ».
const STRING_SPACING = [60, 40, 26]; // px (×dpr) between strings
const STRING_OMEGA = [0.013, 0.02, 0.03]; // base vibration speed (rad/ms)

interface Str {
  x0: number;
  a: number;
  v: number;
  omega: number;
  colorT: number;
  lit: number;
}

/**
 * Tableau « Cordes » — a string instrument. Light strings span the screen; a
 * gesture crossing a string plucks it into a damped standing-wave (mode 1 + a
 * touch of mode 3), pitch set by position. Double-tap strums. Knob = register.
 */
export class StringsScene implements Scene {
  readonly id = 'sound-ribbons';
  readonly name = 'Cordes';
  readonly paletteCount = PALETTES.length;
  readonly knobLabel = 'Registre';
  readonly knobOptions = ['Grave', 'Médium', 'Aigu'] as const;
  readonly supportsAuto = false;
  readonly hint = {
    title: 'Pince les cordes',
    sub: 'Balaie pour les faire vibrer · double-tap : gratte tout · Échap : réglages'
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

  private strings: Str[] = [];
  private readonly pointers = new Map<number, { x: number; px: number }>();
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
    for (const st of this.strings) {
      st.a = 0;
      st.v = 0;
      st.lit = 0;
    }
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
      this.pointers.set(s.id, { x: s.x, px: s.x });
      if (isDouble) {
        this.strum(1);
      } else {
        let best: Str | null = null;
        let bd = 1e9;
        for (const st of this.strings) {
          const d = Math.abs(st.x0 - s.x);
          if (d < bd) {
            bd = d;
            best = st;
          }
        }
        if (best && bd < 44 * this.dpr) this.pluck(best, 42 * this.dpr, s.x >= best.x0 ? 1 : -1);
      }
    } else if (s.phase === 'move') {
      const p = this.pointers.get(s.id);
      if (!p) return;
      p.px = p.x;
      p.x = s.x;
      this.crossPluck(p, s.x);
    } else {
      this.pointers.delete(s.id);
    }
  }

  update(dt: number, _t: number): void {
    this.frame(dt);
  }

  private get palette() {
    return PALETTES[this.paletteIndex];
  }

  private build(): void {
    this.strings = [];
    const spacing = STRING_SPACING[this.level] * this.dpr;
    const count = Math.max(4, Math.floor((this.width - spacing) / spacing));
    const margin = (this.width - (count - 1) * spacing) / 2;
    const baseOmega = STRING_OMEGA[this.level];
    for (let i = 0; i < count; i++) {
      this.strings.push({ x0: margin + i * spacing, a: 0, v: 0, omega: baseOmega * (0.82 + (i / count) * 0.55), colorT: i / count, lit: 0 });
    }
  }
  private pluck(st: Str, strength: number, dir: number): void {
    st.a = clamp(strength, 0, 72 * this.dpr) * dir;
    st.v = 0;
    st.lit = 1;
    navigator.vibrate?.(this.settings.reducedEffects ? 0 : 6);
  }
  private strum(dir: number): void {
    for (let i = 0; i < this.strings.length; i++) {
      const st = this.strings[i];
      st.a = (26 + Math.sin(i * 0.6) * 14) * this.dpr * dir;
      st.v = 0;
      st.lit = 1;
    }
    navigator.vibrate?.(this.settings.reducedEffects ? 0 : 22);
  }
  private crossPluck(p: { x: number; px: number }, x: number): void {
    const lo = Math.min(p.px, x);
    const hi = Math.max(p.px, x);
    const sp = Math.abs(x - p.px);
    if (sp < 0.5) return;
    for (const st of this.strings) if (st.x0 >= lo && st.x0 <= hi) this.pluck(st, 14 * this.dpr + sp * 0.9, x >= st.x0 ? 1 : -1);
  }

  private frame(dt: number): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#070611';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const reduced = this.settings.reducedEffects;
    const zeta = 0.022;
    const SEG = 22;
    const drawString = (st: Str): void => {
      ctx.beginPath();
      for (let s = 0; s <= SEG; s++) {
        const y = (s / SEG) * this.height;
        const shape = Math.sin((Math.PI * s) / SEG) + Math.sin((3 * Math.PI * s) / SEG) * 0.22;
        const x = st.x0 + st.a * shape;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    for (const st of this.strings) {
      st.v += (-st.omega * st.omega * st.a - 2 * zeta * st.omega * st.v) * dt;
      st.a += st.v * dt;
      st.lit = Math.max(0, st.lit - dt / 900);
      const peak = Math.abs(st.a);
      const c = samplePalette(this.palette, st.colorT);
      const bright = 0.12 + st.lit * 0.5 + Math.min(0.3, peak / (40 * this.dpr));
      if (!reduced && peak > 0.5) {
        ctx.strokeStyle = `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${bright * 0.4})`;
        ctx.lineWidth = (1 + peak / (16 * this.dpr)) * 2.4 * this.dpr;
        drawString(st);
      }
      ctx.strokeStyle = `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${bright})`;
      ctx.lineWidth = (reduced ? 1 : 1.4) * this.dpr;
      drawString(st);
    }
    ctx.globalCompositeOperation = 'source-over';
    this.fx.clearRect(0, 0, this.width, this.height);
  }
}
