import type { PointerSample, Scene, SceneContext, SceneSettings } from '../core/types';
import { PALETTES, samplePalette } from '../palettes';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

const JELLY_COUNT = [1, 1, 4];
const JELLY_PULSE = [0.0016, 0.003, 0.0024];

interface Node {
  x: number;
  y: number;
  ox: number;
  oy: number;
}
interface Tentacle {
  frac: number;
  nodes: Node[];
  seg: number;
}
interface Jelly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  R: number;
  baseR: number;
  phase: number;
  colorT: number;
  heading: number;
  seed: number;
  tentacles: Tentacle[];
  rx: number;
  ry: number;
  alpha: number;
  flash: number;
}

/**
 * Tableau « Méduse lumineuse » — a bioluminescent creature with an oriented,
 * squash-and-stretch bell, burst propulsion and trailing Verlet tentacles that
 * follows the touch. Knob = mood (Calme / Vive / Essaim).
 */
export class JellyfishScene implements Scene {
  readonly id = 'jellyfish';
  readonly name = 'Méduse lumineuse';
  readonly paletteCount = PALETTES.length;
  readonly knobLabel = 'Humeur';
  readonly knobOptions = ['Calme', 'Vive', 'Essaim'] as const;
  readonly supportsAuto = false;
  readonly hint = {
    title: 'Guide la méduse',
    sub: 'Glisse : elle te suit · double-tap : pulse lumineux · Échap : réglages'
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

  private readonly jellies: Jelly[] = [];
  private target: { x: number; y: number } | null = null;
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
    if (this.jellies.length === 0) this.rebuild();
  }

  setPalette(i: number): void {
    this.paletteIndex = clamp(i, 0, this.paletteCount - 1);
  }
  setSymmetry(i: number): void {
    this.level = clamp(i, 0, 2);
    this.rebuild();
  }
  setAuto(_on: boolean): void {}
  reset(): void {
    this.target = null;
    this.rebuild();
  }
  unmount(): void {
    this.target = null;
  }

  onInput(s: PointerSample): void {
    if (s.phase === 'start') {
      const now = performance.now();
      const isDouble = now - this.lastTapMs < 300 && Math.hypot(s.x - this.lastTapX, s.y - this.lastTapY) < 80 * this.dpr;
      this.lastTapMs = now;
      this.lastTapX = s.x;
      this.lastTapY = s.y;
      this.target = { x: s.x, y: s.y };
      if (isDouble) {
        for (const j of this.jellies) {
          j.phase = 0;
          j.flash = 1;
        }
        navigator.vibrate?.(this.settings.reducedEffects ? 0 : 18);
      }
    } else if (s.phase === 'move') {
      this.target = { x: s.x, y: s.y };
    }
    // on 'end' the last target stays as a gentle attractor
  }

  update(dt: number, _t: number): void {
    this.simulate(dt);
    this.render();
  }

  private get palette() {
    return PALETTES[this.paletteIndex];
  }

  private makeJelly(x: number, y: number, scale: number): Jelly {
    const R = (38 + Math.random() * 24) * scale * this.dpr;
    const nT = 9;
    const tentacles: Tentacle[] = [];
    for (let k = 0; k < nT; k++) {
      const frac = (k / (nT - 1) - 0.5) * 1.6;
      const segs = 13;
      const nodes: Node[] = [];
      const ax = x + frac * R;
      const ay = y + R * 0.5;
      for (let s = 0; s <= segs; s++) nodes.push({ x: ax, y: ay + s * (R * 0.16), ox: ax, oy: ay + s * (R * 0.16) });
      tentacles.push({ frac, nodes, seg: R * 0.16 });
    }
    return { x, y, vx: 0, vy: 0, R, baseR: R, phase: Math.random() * 6.28, colorT: Math.random(), heading: -Math.PI / 2 + (Math.random() - 0.5), seed: Math.random() * 100, tentacles, rx: R, ry: R, alpha: 0, flash: 0 };
  }
  private rebuild(): void {
    this.jellies.length = 0;
    const cnt = JELLY_COUNT[this.level];
    for (let i = 0; i < cnt; i++) {
      this.jellies.push(this.makeJelly((0.3 + Math.random() * 0.4) * this.width, (0.4 + Math.random() * 0.4) * this.height, cnt > 1 ? 0.66 : 1));
    }
  }

  private simulate(dt: number): void {
    const pulseK = JELLY_PULSE[this.level];
    const f = Math.min(2.4, dt / 16);
    const now = performance.now();
    for (const j of this.jellies) {
      j.phase += dt * pulseK;
      const pulse = Math.sin(j.phase);
      j.rx = j.baseR * (1 + pulse * 0.18);
      j.ry = j.baseR * 0.92 * (1 - pulse * 0.16);
      j.R = (j.rx + j.ry) * 0.5;
      j.heading += Math.sin(now * 0.0004 + j.seed) * 0.045 * f;
      if (this.target) {
        const ta = Math.atan2(this.target.y - j.y, this.target.x - j.x);
        let diff = ta - j.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        j.heading += diff * 0.06 * f;
      }
      const contract = Math.max(0, -Math.cos(j.phase));
      const push = (0.05 + contract * 1.05) * this.dpr * f;
      j.vx += Math.cos(j.heading) * push;
      j.vy += Math.sin(j.heading) * push;
      j.vx *= 0.94;
      j.vy *= 0.94;
      const sp = Math.hypot(j.vx, j.vy);
      const maxS = 7 * this.dpr;
      if (sp > maxS) {
        j.vx = (j.vx / sp) * maxS;
        j.vy = (j.vy / sp) * maxS;
      }
      j.x += j.vx * f;
      j.y += j.vy * f;
      const m = Math.max(j.rx, j.ry);
      if (j.x < m) {
        j.x = m;
        j.vx = Math.abs(j.vx);
        j.heading = 0;
      } else if (j.x > this.width - m) {
        j.x = this.width - m;
        j.vx = -Math.abs(j.vx);
        j.heading = Math.PI;
      }
      if (j.y < m) {
        j.y = m;
        j.vy = Math.abs(j.vy);
        j.heading = Math.PI / 2;
      } else if (j.y > this.height - m) {
        j.y = this.height - m;
        j.vy = -Math.abs(j.vy);
        j.heading = -Math.PI / 2;
      }
      if (j.flash) j.flash = Math.max(0, j.flash - dt / 600);
      j.alpha = j.heading + Math.PI / 2;
      const ca = Math.cos(j.alpha);
      const sa = Math.sin(j.alpha);
      for (const tn of j.tentacles) {
        const lx = tn.frac * j.rx;
        const ly = j.ry * 0.5;
        const rim = tn.nodes[0];
        rim.x = j.x + lx * ca - ly * sa;
        rim.y = j.y + lx * sa + ly * ca;
        for (let s = 1; s < tn.nodes.length; s++) {
          const p = tn.nodes[s];
          const nx = p.x + (p.x - p.ox) * 0.88 + Math.sin(j.phase * 1.3 + s * 0.5) * 0.02 * this.dpr;
          const ny = p.y + (p.y - p.oy) * 0.88 + 0.01 * this.dpr * dt * 0.06;
          p.ox = p.x;
          p.oy = p.y;
          p.x = nx;
          p.y = ny;
        }
        for (let it = 0; it < 3; it++) {
          for (let s = 1; s < tn.nodes.length; s++) {
            const a = tn.nodes[s - 1];
            const b = tn.nodes[s];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d = Math.hypot(dx, dy) + 0.001;
            const diff = ((d - tn.seg) / d) * 0.5;
            const ox = dx * diff;
            const oy = dy * diff;
            if (s - 1 > 0) {
              a.x += ox;
              a.y += oy;
            }
            b.x -= ox;
            b.y -= oy;
          }
        }
      }
    }
    this.colorBase += dt * 0.00002;
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#03030e';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalCompositeOperation = 'lighter';
    const reduced = this.settings.reducedEffects;
    for (const j of this.jellies) {
      const c = samplePalette(this.palette, (j.colorT + this.colorBase) % 1);
      const c2 = samplePalette(this.palette, (j.colorT + 0.35 + this.colorBase) % 1);
      const glow = 0.5 + j.flash * 0.5;
      ctx.lineCap = 'round';
      for (const tn of j.tentacles) {
        ctx.beginPath();
        ctx.moveTo(tn.nodes[0].x, tn.nodes[0].y);
        for (let s = 1; s < tn.nodes.length; s++) ctx.lineTo(tn.nodes[s].x, tn.nodes[s].y);
        ctx.strokeStyle = `rgba(${c2.r | 0},${c2.g | 0},${c2.b | 0},${0.32 * glow})`;
        ctx.lineWidth = 2.2 * this.dpr;
        ctx.stroke();
      }
      if (!reduced) {
        const hg = ctx.createRadialGradient(j.x, j.y, 0, j.x, j.y, j.R * 1.6);
        hg.addColorStop(0, `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${0.4 * glow})`);
        hg.addColorStop(1, `rgba(${c.r | 0},${c.g | 0},${c.b | 0},0)`);
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(j.x, j.y, j.R * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.save();
      ctx.translate(j.x, j.y);
      ctx.rotate(j.alpha);
      ctx.beginPath();
      ctx.ellipse(0, 0, j.rx, j.ry, 0, Math.PI, Math.PI * 2);
      ctx.closePath();
      const bg = ctx.createLinearGradient(0, -j.ry, 0, j.ry * 0.5);
      bg.addColorStop(0, `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${0.8 * glow})`);
      bg.addColorStop(1, `rgba(${c2.r | 0},${c2.g | 0},${c2.b | 0},${0.1 * glow})`);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.2 * glow})`;
      ctx.lineWidth = 1.2 * this.dpr;
      for (let rr = 1; rr <= 3; rr++) {
        ctx.beginPath();
        ctx.ellipse(0, 0, j.rx * (rr / 4), j.ry * (rr / 4), 0, Math.PI, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(${c2.r | 0},${c2.g | 0},${c2.b | 0},${0.55 * glow})`;
      const lobes = 7;
      for (let l = 0; l <= lobes; l++) {
        const lxp = -j.rx + 2 * j.rx * (l / lobes);
        ctx.beginPath();
        ctx.arc(lxp, 0, j.rx * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
    this.fx.clearRect(0, 0, this.width, this.height);
  }
}
