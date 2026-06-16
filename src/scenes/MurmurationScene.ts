import type { PointerSample, Scene, SceneContext, SceneSettings } from '../core/types';
import { PALETTES, samplePalette } from '../palettes';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

// Registry id stays 'chromaflow' (historical); the tableau is now « Nuée ».
const MURM_N = [240, 430, 680];
const MURM_TOPO = 7; // topological neighbour count
const MURM_BLIND = -0.35; // dot(heading, dirToNeighbour) below this = behind, ignored

/**
 * Tableau « Nuée » — a dusk murmuration of starlings, built on the science of
 * collective motion: topological neighbours (~7), a rear blind cone, periphery
 * leading, and a near-lossless "Trafalgar" alarm wave. The finger is a hawk.
 * Knob = flock size (Petite / Moyenne / Immense).
 */
export class MurmurationScene implements Scene {
  readonly id = 'chromaflow';
  readonly name = 'Nuée';
  readonly paletteCount = PALETTES.length;
  readonly knobLabel = 'Volée';
  readonly knobOptions = ['Petite', 'Moyenne', 'Immense'] as const;
  readonly supportsAuto = false;
  readonly hint = {
    title: 'Effraie la nuée',
    sub: 'Glisse au milieu des oiseaux · double-tap : envol · Échap : réglages'
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

  private bx = new Float32Array(0);
  private by = new Float32Array(0);
  private bvx = new Float32Array(0);
  private bvy = new Float32Array(0);
  private alarm = new Float32Array(0);
  private alarmPrev = new Float32Array(0);
  private n = 0;
  private readonly grid = new Map<number, number[]>();
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private readonly candJ = new Int32Array(96);
  private readonly candD = new Float32Array(96);
  private cell = 60;
  private lastTapMs = -Infinity;
  private lastTapX = 0;
  private lastTapY = 0;
  private scare = 0;
  private scareX = 0;
  private scareY = 0;
  private colorBase = 0;

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
    this.scare = 0;
    this.build();
  }
  unmount(): void {
    this.pointers.clear();
    this.grid.clear();
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
        this.scare = 1;
        this.scareX = s.x;
        this.scareY = s.y;
        navigator.vibrate?.(this.settings.reducedEffects ? 0 : 16);
      }
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

  update(dt: number, _t: number): void {
    this.simulate(dt);
    this.render();
  }

  private get palette() {
    return PALETTES[this.paletteIndex];
  }
  private key(cx: number, cy: number): number {
    return cx * 100000 + cy;
  }

  private build(): void {
    this.n = MURM_N[this.level];
    const n = this.n;
    this.bx = new Float32Array(n);
    this.by = new Float32Array(n);
    this.bvx = new Float32Array(n);
    this.bvy = new Float32Array(n);
    this.alarm = new Float32Array(n);
    this.alarmPrev = new Float32Array(n);
    const cxc = this.width * 0.5;
    const cyc = this.height * 0.42;
    const rad = Math.min(this.width, this.height) * 0.2;
    const heading0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * rad;
      this.bx[i] = cxc + Math.cos(a) * rr;
      this.by[i] = cyc + Math.sin(a) * rr;
      const h = heading0 + (Math.random() - 0.5) * 0.6;
      this.bvx[i] = Math.cos(h) * this.dpr;
      this.bvy[i] = Math.sin(h) * this.dpr;
    }
    this.cell = Math.max(40, Math.sqrt((this.width * this.height) / n) * 1.6);
  }

  private simulate(dt: number): void {
    const f = Math.min(2.4, dt / 16);
    const { bx, by, bvx, bvy, alarm, alarmPrev, candJ, candD, n, cell, dpr } = this;
    this.grid.clear();
    let mx = 0;
    let my = 0;
    for (let i = 0; i < n; i++) {
      mx += bx[i];
      my += by[i];
      const k = this.key(Math.floor(bx[i] / cell), Math.floor(by[i] / cell));
      let a = this.grid.get(k);
      if (!a) {
        a = [];
        this.grid.set(k, a);
      }
      a.push(i);
    }
    mx /= n;
    my /= n;
    alarmPrev.set(alarm);
    const cruise = (2.4 + this.level * 0.2) * dpr;
    const maxTurn = 0.16 * f;
    const margin = Math.min(this.width, this.height) * 0.13;
    const farR = Math.min(this.width, this.height) * 0.46;
    const ps = [...this.pointers.values()];
    if (this.scare > 0) this.scare = Math.max(0, this.scare - dt / 600);

    for (let i = 0; i < n; i++) {
      const hx = bvx[i];
      const hy = bvy[i];
      const hl = Math.hypot(hx, hy) + 1e-4;
      const hux = hx / hl;
      const huy = hy / hl;
      const gcx = Math.floor(bx[i] / cell);
      const gcy = Math.floor(by[i] / cell);
      let candN = 0;
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const arr = this.grid.get(this.key(gcx + ox, gcy + oy));
          if (!arr) continue;
          for (let a = 0; a < arr.length; a++) {
            const j = arr[a];
            if (j === i) continue;
            const dx = bx[j] - bx[i];
            const dy = by[j] - by[i];
            const d2 = dx * dx + dy * dy;
            if (d2 < 0.01) continue;
            const inv = 1 / Math.sqrt(d2);
            if (hux * dx * inv + huy * dy * inv < MURM_BLIND) continue;
            if (candN < 96) {
              candJ[candN] = j;
              candD[candN] = d2;
              candN++;
            }
          }
        }
      }
      const take = Math.min(MURM_TOPO, candN);
      for (let a = 0; a < take; a++) {
        let mi = a;
        for (let b = a + 1; b < candN; b++) if (candD[b] < candD[mi]) mi = b;
        if (mi !== a) {
          const tj = candJ[a];
          candJ[a] = candJ[mi];
          candJ[mi] = tj;
          const td = candD[a];
          candD[a] = candD[mi];
          candD[mi] = td;
        }
      }
      let sepx = 0;
      let sepy = 0;
      let alx = 0;
      let aly = 0;
      let cox = 0;
      let coy = 0;
      let maxNbrAlarm = 0;
      for (let a = 0; a < take; a++) {
        const j = candJ[a];
        const d2 = candD[a];
        const dx = bx[j] - bx[i];
        const dy = by[j] - by[i];
        alx += bvx[j];
        aly += bvy[j];
        cox += bx[j];
        coy += by[j];
        const inv = 1 / (d2 + 60 * dpr);
        sepx -= dx * inv;
        sepy -= dy * inv;
        if (alarmPrev[j] > maxNbrAlarm) maxNbrAlarm = alarmPrev[j];
      }
      let ax = 0;
      let ay = 0;
      if (take > 0) {
        alx /= take;
        aly /= take;
        cox = cox / take - bx[i];
        coy = coy / take - by[i];
        const al = Math.hypot(alx, aly) + 1e-4;
        ax += (alx / al) * cruise;
        ay += (aly / al) * cruise;
        ax += cox * 0.022;
        ay += coy * 0.022;
        const sl = Math.hypot(sepx, sepy);
        if (sl > 1e-4) {
          ax += (sepx / sl) * cruise;
          ay += (sepy / sl) * cruise;
        }
      }
      const cdx = mx - bx[i];
      const cdy = my - by[i];
      const cd = Math.hypot(cdx, cdy) + 1e-4;
      if (cd > farR) {
        const w = (cd - farR) / farR;
        ax += (cdx / cd) * cruise * (0.7 + w);
        ay += (cdy / cd) * cruise * (0.7 + w);
      }
      if (bx[i] < margin) ax += (1 - bx[i] / margin) * cruise * 1.6;
      else if (bx[i] > this.width - margin) ax -= (1 - (this.width - bx[i]) / margin) * cruise * 1.6;
      if (by[i] < margin) ay += (1 - by[i] / margin) * cruise * 1.6;
      else if (by[i] > this.height - margin) ay -= (1 - (this.height - by[i]) / margin) * cruise * 1.6;
      ax += (Math.random() - 0.5) * 0.22 * dpr;
      ay += (Math.random() - 0.5) * 0.22 * dpr;

      let newAlarm = 0;
      for (const p of ps) {
        const dx = bx[i] - p.x;
        const dy = by[i] - p.y;
        const d = Math.hypot(dx, dy) + 0.01;
        const infl = 185 * dpr;
        if (d < infl) {
          const w = 1 - d / infl;
          ax += (dx / d) * w * cruise * 3.2;
          ay += (dy / d) * w * cruise * 3.2;
          newAlarm = Math.max(newAlarm, w);
        }
      }
      if (this.scare > 0) {
        const dx = bx[i] - this.scareX;
        const dy = by[i] - this.scareY;
        const d = Math.hypot(dx, dy) + 0.01;
        const infl = 360 * dpr;
        if (d < infl) {
          const w = (1 - d / infl) * this.scare;
          ax += (dx / d) * w * cruise * 4.2;
          ay += (dy / d) * w * cruise * 4.2;
          newAlarm = Math.max(newAlarm, w);
        }
      }
      const periph = 1 + (MURM_TOPO - take) * 0.06;
      const relayed = maxNbrAlarm * Math.min(0.995, 0.95 * periph);
      newAlarm = Math.max(newAlarm, relayed, alarmPrev[i] - dt / 900);
      alarm[i] = clamp(newAlarm, 0, 1);

      const dvx = bvx[i] + ax * 0.05 * f;
      const dvy = bvy[i] + ay * 0.05 * f;
      const curA = Math.atan2(bvy[i], bvx[i]);
      let diff = Math.atan2(dvy, dvx) - curA;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const lim = maxTurn * (1 + alarm[i] * 1.4);
      const na = curA + clamp(diff, -lim, lim);
      const speed = cruise * (1 + alarm[i] * 0.7);
      bvx[i] = Math.cos(na) * speed;
      bvy[i] = Math.sin(na) * speed;
      bx[i] += bvx[i] * f;
      by[i] += bvy[i] * f;
      if (bx[i] < 0) bx[i] = 0;
      else if (bx[i] > this.width) bx[i] = this.width;
      if (by[i] < 0) by[i] = 0;
      else if (by[i] > this.height) by[i] = this.height;
    }
    this.colorBase += dt * 0.00002;
  }

  private render(): void {
    const ctx = this.ctx;
    const top = samplePalette(this.palette, 0.55);
    const bot = samplePalette(this.palette, 0.12);
    const g = ctx.createLinearGradient(0, 0, 0, this.height);
    g.addColorStop(0, `rgb(${(top.r * 0.3 + 26) | 0},${(top.g * 0.28 + 28) | 0},${(top.b * 0.34 + 44) | 0})`);
    g.addColorStop(0.62, `rgb(${(bot.r * 0.45 + 60) | 0},${(bot.g * 0.38 + 46) | 0},${(bot.b * 0.4 + 56) | 0})`);
    g.addColorStop(1, `rgb(${(bot.r * 0.7 + 96) | 0},${(bot.g * 0.55 + 74) | 0},${(bot.b * 0.45 + 60) | 0})`);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.width, this.height);
    const c = samplePalette(this.palette, this.colorBase % 1);
    const baseR = c.r * 0.18 + 8;
    const baseG = c.g * 0.18 + 8;
    const baseB = c.b * 0.2 + 16;
    for (let i = 0; i < this.n; i++) {
      const ang = Math.atan2(this.bvy[i], this.bvx[i]);
      const s = 3.4 * this.dpr;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const x = this.bx[i];
      const y = this.by[i];
      const al = this.alarm[i];
      ctx.fillStyle = `rgba(${(baseR + al * 90) | 0},${(baseG + al * 70) | 0},${(baseB + al * 50) | 0},0.92)`;
      ctx.beginPath();
      ctx.moveTo(x + ca * s * 1.7, y + sa * s * 1.7);
      ctx.lineTo(x - ca * s - sa * s, y - sa * s + ca * s);
      ctx.lineTo(x - ca * s * 0.5, y - sa * s * 0.5);
      ctx.lineTo(x - ca * s + sa * s, y - sa * s - ca * s);
      ctx.closePath();
      ctx.fill();
    }
    this.fx.clearRect(0, 0, this.width, this.height);
  }
}
