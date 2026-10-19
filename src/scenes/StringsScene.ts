import type { PointerSample, Scene, SceneContext, SceneSettings } from '../core/types';
import { PluckedAudio } from '../core/PluckedAudio';
import { PALETTES, samplePalette } from '../palettes';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

// Registry id stays 'sound-ribbons' (historical); the tableau is now « Cordes ».
const STRING_COUNT = 10;
const STRING_OMEGA = [0.013, 0.02, 0.03]; // base vibration speed (rad/ms)

interface Str {
  x0: number;
  a: number;
  v: number;
  omega: number;
  colorT: number;
  lit: number;
  lastPluck: number;
  pickY: number;
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
    sub: 'Active Son doux, pince une corde puis relâche · balaie pour jouer un accord'
  };

  readonly toolOptions = ['Silence', 'Son doux'];
  selectedTool = 0;
  onToolChange?: (index: number) => void;
  private audio: PluckedAudio | null = null;
  private audioRequest = 0;
  private rings: { x: number; y: number; age: number; color: number }[] = [];
  private spacing = 1;
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
  private readonly pointers = new Map<number, { x: number; px: number; y: number; held: Str | null }>();
  private lastTapMs = -Infinity;
  private lastTapX = 0;
  private lastTapY = 0;

  mount(c: SceneContext): void {
    this.audio = new PluckedAudio();
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
  setTool(index: number): void {
    const request = ++this.audioRequest;
    this.selectedTool = index === 1 ? 1 : 0; this.onToolChange?.(this.selectedTool);
    void this.audio?.enable(this.selectedTool === 1).then(enabled => {
      if (request !== this.audioRequest) return;
      this.selectedTool = enabled ? 1 : 0; this.onToolChange?.(this.selectedTool);
    });
  }
  reset(): void {
    this.pointers.clear(); this.rings = []; this.audio?.clear();
    for (const st of this.strings) {
      st.a = 0;
      st.v = 0;
      st.lit = 0;
    }
  }
  unmount(): void {
    this.audioRequest++; this.audio?.dispose(); this.audio = null;
    this.pointers.clear();
  }

  onInput(s: PointerSample): void {
    if (s.phase === 'start') {
      const now = performance.now();
      const isDouble = now - this.lastTapMs < 300 && Math.hypot(s.x - this.lastTapX, s.y - this.lastTapY) < 80 * this.dpr;
      this.lastTapMs = now;
      this.lastTapX = s.x;
      this.lastTapY = s.y;
      this.pointers.set(s.id, { x: s.x, px: s.x, y: s.y, held: null });
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
        if (best && bd < this.spacing*.6) {
          const pointer = this.pointers.get(s.id)!;
          if (![...this.pointers.values()].some(p => p.held === best)) pointer.held = best;
          this.pluck(best, 32 * this.dpr, s.x >= best.x0 ? 1 : -1, s.y);
        }
      }
    } else if (s.phase === 'move') {
      const p = this.pointers.get(s.id);
      if (!p) return;
      p.px = p.x;
      p.x = s.x;
      p.y = s.y;
      if (p.held && Math.abs(s.x-p.held.x0) < this.spacing*.85) {
        p.held.pickY = clamp(s.y/this.height,.08,.92); p.held.a = clamp(s.x-p.held.x0, -80*this.dpr, 80*this.dpr); p.held.v = 0; p.held.lit = 1;
      } else {
        if (p.held) { this.pluck(p.held, Math.abs(p.held.a), Math.sign(p.held.a)||1, s.y); p.held = null; }
        this.crossPluck(p, s.x);
      }
    } else {
      const p = this.pointers.get(s.id);
      if (p?.held) this.pluck(p.held, Math.max(12*this.dpr,Math.abs(p.held.a)), Math.sign(p.held.a)||1, p.y);
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
    this.pointers.clear();
    const count = this.width / this.dpr < 600 ? 7 : STRING_COUNT;
    const spacing = this.width*.78/(count-1); this.spacing = spacing;
    const margin = (this.width - (count - 1) * spacing) / 2;
    const baseOmega = STRING_OMEGA[this.level];
    for (let i = 0; i < count; i++) {
      this.strings.push({ x0: margin + i * spacing, a: 0, v: 0, omega: baseOmega * (0.82 + (i / count) * 0.55), colorT: i / count, lit: 0, lastPluck: -Infinity, pickY: .5 });
    }
  }
  private pluck(st: Str, strength: number, dir: number, y = this.height*.5): void {
    st.pickY = clamp(y/this.height,.08,.92);
    st.a = clamp(strength, 0, 72 * this.dpr) * dir;
    st.v = 0;
    st.lit = 1;
    const now = performance.now();
    if (now-st.lastPluck > 55) {
      st.lastPluck = now; this.audio?.play(this.strings.indexOf(st),this.level,strength/(72*this.dpr));
      if (this.rings.length >= 30) this.rings.shift();
      this.rings.push({ x: st.x0, y, age: 0, color: st.colorT });
    }
    navigator.vibrate?.(this.settings.reducedEffects ? 0 : 6);
  }
  private strum(dir: number): void {
    for (let i = 0; i < this.strings.length; i++) {
      const st = this.strings[i];
      this.pluck(st,(26+Math.sin(i*.6)*14)*this.dpr,dir);
    }
    navigator.vibrate?.(this.settings.reducedEffects ? 0 : 22);
  }
  private crossPluck(p: { x: number; px: number; y: number }, x: number): void {
    const lo = Math.min(p.px, x);
    const hi = Math.max(p.px, x);
    const sp = Math.abs(x - p.px);
    if (sp < 0.5) return;
    for (const st of this.strings) if (st.x0 >= lo && st.x0 <= hi) this.pluck(st, 14 * this.dpr + sp * 0.9, x >= st.x0 ? 1 : -1, p.y);
  }

  private frame(dt: number): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#070611';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const reduced = this.settings.reducedEffects;
    const zeta = 0.065;
    const SEG = 22;
    const drawString = (st: Str): void => {
      ctx.beginPath();
      for (let s = 0; s <= SEG; s++) {
        const y = (s / SEG) * this.height;
        const t = s/SEG;
        const shape = t < st.pickY ? Math.sin(t/st.pickY*Math.PI/2) : Math.sin((1-t)/(1-st.pickY)*Math.PI/2);
        const x = st.x0 + st.a * shape;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    for (const st of this.strings) {
      const held = [...this.pointers.values()].some(p => p.held === st);
      if (!held) {
        const steps = Math.max(1,Math.ceil(dt/8)), h = Math.min(dt,50)/steps;
        for (let i=0;i<steps;i++) { st.v += (-st.omega*st.omega*st.a-2*zeta*st.omega*st.v)*h; st.a += st.v*h; }
      }
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
    this.rings = this.rings.filter(r => r.age < 1);
    for (const ring of this.rings) {
      ring.age += dt/1000; const c = samplePalette(this.palette,ring.color);
      ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${Math.max(0,1-ring.age)*.35})`;
      ctx.lineWidth = this.dpr; ctx.beginPath();
      ctx.arc(ring.x,ring.y,(8+ring.age*70)*this.dpr,0,Math.PI*2);ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    this.fx.clearRect(0, 0, this.width, this.height);
  }
}

