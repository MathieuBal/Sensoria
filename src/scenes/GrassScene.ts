import type { PointerSample, Scene, SceneContext, SceneSettings } from '../core/types';
const MEADOWS = [
  { sky: '#c8dce6', horizon: '#f7edcf', ground: '#c4cc99', stem: [82,116,66], flower: '#f3c3b7', leaf: '#91ad70' },
  { sky: '#e1c7bc', horizon: '#f8dfad', ground: '#c4ad76', stem: [133,115,59], flower: '#e5aa89', leaf: '#ada064' },
  { sky: '#c7c7e0', horizon: '#e9dfed', ground: '#a7b6a2', stem: [85,117,103], flower: '#d4b3de', leaf: '#8caa9b' }
];

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

// Registry id stays 'paper-cut' (historical); the tableau is now « Brise ».
const GRASS_SPEC = [
  { count: 360, hFrac: 0.16, wMul: 1.0, amb: 0.1 }, // Herbe — dense, short
  { count: 280, hFrac: 0.3, wMul: 1.5, amb: 0.13 }, // Blé
  { count: 200, hFrac: 0.5, wMul: 2.2, amb: 0.17 } // Roseaux — sparse, tall
];

interface Mote { x: number; y: number; vx: number; vy: number; angle: number; spin: number; size: number; age: number; kind: number; }

interface Blade {
  x: number;
  by: number;
  h: number;
  d: number;
  w: number;
  seed: number;
  colorT: number;
  sway: number;
  swayV: number;
}

/**
 * Tableau « Brise » — a luminous meadow under a pale dawn sky. Hundreds of grass
 * blades stand in depth; the gesture is a gust that bends them in travelling
 * waves before they spring back. The only deliberately light tableau.
 */
export class GrassScene implements Scene {
  readonly id = 'paper-cut';
  readonly name = 'Brise';
  readonly paletteCount = MEADOWS.length;
  readonly knobLabel = 'Pousse';
  readonly knobOptions = ['Herbe', 'Blé', 'Roseaux'] as const;
  readonly supportsAuto = false;
  readonly hint = {
    title: 'Lève le vent',
    sub: 'Balaie pour emporter pétales et graines · double-tap pour une grande rafale'
  };

  onPaletteChange?: (index: number) => void;

  private ctx!: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private horizon = 0;
  private settings!: SceneSettings;
  private paletteIndex = 0;
  private level = 1;

  private blades: Blade[] = [];
  private motes: Mote[] = [];
  private emitDistance = 0;
  private readonly pointers = new Map<number, { x: number; y: number; vx: number }>();
  private windT = 0;
  private gust = 0;
  private gustX = 0;
  private lastTapMs = -Infinity;
  private lastTapX = 0;
  private lastTapY = 0;

  mount(c: SceneContext): void {
    this.ctx = c.ctx;
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
    this.gust = 0; this.pointers.clear(); this.motes = []; this.emitDistance = 0;
    this.build();
  }
  unmount(): void {
    this.pointers.clear(); this.motes = [];
  }

  onInput(s: PointerSample): void {
    if (s.phase === 'start') {
      const now = performance.now();
      const isDouble = now - this.lastTapMs < 300 && Math.hypot(s.x - this.lastTapX, s.y - this.lastTapY) < 80 * this.dpr;
      this.lastTapMs = now;
      this.lastTapX = s.x;
      this.lastTapY = s.y;
      this.pointers.set(s.id, { x: s.x, y: s.y, vx: 0 });
      this.emit(s.x,s.y,isDouble?32:12,0,-1);
      if (isDouble) {
        this.gust = 1;
        this.gustX = s.x;
        navigator.vibrate?.(this.settings.reducedEffects ? 0 : 16);
      }
    } else if (s.phase === 'move') {
      const p = this.pointers.get(s.id);
      if (p) {
        const dx = s.x-p.x, dy = s.y-p.y;
        this.emitDistance += Math.hypot(dx,dy)/this.dpr;
        if (this.emitDistance > 7) { this.emit(s.x,s.y,Math.min(8,Math.floor(this.emitDistance/7)),dx,dy); this.emitDistance = 0; }
        p.vx = s.vx;
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

  private emit(x: number, y: number, count: number, dx: number, dy: number): void {
    const limit = this.settings.reducedEffects ? 70 : 180;
    for (let i=0;i<count;i++) {
      if (this.motes.length >= limit) this.motes.shift();
      this.motes.push({ x:x+(Math.random()-.5)*30*this.dpr, y:y+(Math.random()-.5)*30*this.dpr,
        vx:clamp(dx*8,-220*this.dpr,220*this.dpr)+(Math.random()-.5)*70*this.dpr,
        vy:clamp(dy*8,-180*this.dpr,120*this.dpr)-(35+Math.random()*65)*this.dpr,
        angle:Math.random()*6.28, spin:(Math.random()-.5)*3, size:(4+Math.random()*6)*this.dpr,
        age:0, kind:Math.floor(Math.random()*3) });
    }
  }

  private get palette() {
    return MEADOWS[this.paletteIndex];
  }

  private build(): void {
    const spec = GRASS_SPEC[this.level];
    this.horizon = this.height * 0.55;
    this.pointers.clear();
    this.blades = [];
    for (let i = 0; i < spec.count; i++) {
      const d = Math.random();
      const by = this.horizon + d * (this.height - this.horizon);
      const h = (0.04 + d * spec.hFrac) * this.height;
      this.blades.push({ x: Math.random() * this.width, by, h, d, w: (1 + d * 1.6) * spec.wMul * this.dpr, seed: Math.random() * 6.28, colorT: 0.25 + Math.random() * 0.5, sway: 0, swayV: 0 });
    }
    this.blades.sort((a, b) => a.d - b.d);
  }

  private simulate(dt: number): void {
    const f = Math.min(2.4, dt / 16);
    const spec = GRASS_SPEC[this.level];
    this.windT += dt * 0.0016;
    if (this.gust > 0) this.gust = Math.max(0, this.gust - dt / 700);
    const ps = [...this.pointers.values()];
    const seconds = Math.min(dt,50)/1000;
    for (const mote of this.motes) {
      for (const p of ps) {
        const dx=mote.x-p.x, dy=mote.y-p.y, distance=Math.hypot(dx,dy);
        if (distance < 180*this.dpr) {
          const force=(1-distance/(180*this.dpr))*seconds;
          mote.vx += (clamp(p.vx,-2,2)*140*this.dpr+dx)*force;
          mote.vy -= 100*this.dpr*force;
        }
      }
      const breeze = (20 + Math.sin(this.windT*.6 + mote.y/this.height*4)*25)*this.dpr;
      mote.vx += (breeze-mote.vx)*(1-Math.exp(-seconds*.7));
      mote.vy += ((mote.kind===0?-12:8)*this.dpr-mote.vy)*(1-Math.exp(-seconds*.45));
      mote.x += mote.vx*seconds; mote.y += mote.vy*seconds;
      mote.angle += mote.spin*seconds; mote.age += seconds;
    }
    this.motes = this.motes.filter(m => m.age<9 && m.x>-80*this.dpr && m.x<this.width+80*this.dpr && m.y>-80*this.dpr && m.y<this.height+80*this.dpr);
    for (const bl of this.blades) {
      let target = Math.sin(this.windT + bl.x * 0.006 + bl.seed) * spec.amb;
      for (const p of ps) {
        const dx = bl.x - p.x;
        const ad = Math.abs(dx);
        const infl = 230 * this.dpr;
        if (ad < infl) {
          const w = 1 - ad / infl;
          target += Math.sign(dx || 1) * w * (0.5 + Math.min(1.4, Math.abs(p.vx) * 0.5));
        }
      }
      if (this.gust > 0) {
        const ad = Math.abs(bl.x - this.gustX);
        const ring = (1 - this.gust) * 700 * this.dpr;
        if (Math.abs(ad - ring) < 130 * this.dpr) target += Math.sign(bl.x - this.gustX || 1) * this.gust * 1.1;
      }
      bl.swayV += (target - bl.sway) * 0.02 * f;
      bl.swayV *= Math.pow(0.9, f);
      bl.sway += bl.swayV * f;
    }
  }

  private render(): void {
    const ctx = this.ctx;
    const reduced = this.settings.reducedEffects;
    const sky = ctx.createLinearGradient(0, 0, 0, this.height);
    sky.addColorStop(0, this.palette.sky);
    sky.addColorStop(.55, this.palette.horizon);
    sky.addColorStop(1, this.palette.ground);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.width, this.height);
    const gg = ctx.createRadialGradient(this.width * .65, this.horizon*.6, 0, this.width*.65, this.horizon*.6, this.height*.5);
    gg.addColorStop(0, 'rgba(255,248,215,.5)'); gg.addColorStop(1, 'rgba(255,248,215,0)');
    ctx.fillStyle = gg; ctx.fillRect(0,0,this.width,this.height);
    ctx.lineCap = 'round';
    for (const bl of this.blades) {
      const c = { r: this.palette.stem[0]+bl.colorT*30, g: this.palette.stem[1]+bl.colorT*35, b: this.palette.stem[2]+bl.colorT*16 };
      const dim = 0.45 + bl.d * 0.5;
      const haze = 1 - bl.d;
      const r = c.r * dim * (1 - haze * 0.55) + 210 * haze * 0.55;
      const g = c.g * dim * (1 - haze * 0.55) + 220 * haze * 0.55;
      const b = c.b * dim * (1 - haze * 0.55) + 235 * haze * 0.55;
      const bend = bl.sway * bl.h;
      const tipX = bl.x + bend;
      const tipY = bl.by - bl.h*(.65+.35*Math.cos(bl.sway));
      ctx.strokeStyle = `rgba(${r | 0},${g | 0},${b | 0},${0.5 + bl.d * 0.5})`;
      ctx.lineWidth = bl.w;
      ctx.beginPath();
      ctx.moveTo(bl.x, bl.by);
      ctx.quadraticCurveTo(bl.x + bend * 0.4, bl.by - bl.h * 0.55, tipX, tipY);
      ctx.stroke();
      if (bl.d > .25 && bl.seed < 1.2) {
        ctx.fillStyle = bl.seed < .6 ? this.palette.flower : '#f3dfae';
        const petal = (3+bl.d*4)*this.dpr;
        for (let i=0;i<5;i++) {
          const a = i*Math.PI*2/5 + bl.sway*.3;
          ctx.beginPath(); ctx.ellipse(tipX+Math.cos(a)*petal,tipY+Math.sin(a)*petal,petal,petal*.55,a,0,Math.PI*2);ctx.fill();
        }
        ctx.fillStyle = '#b98850';ctx.beginPath();ctx.arc(tipX,tipY,petal*.5,0,Math.PI*2);ctx.fill();
      }
      if (!reduced && bl.d > 0.5) {
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = bl.w * 0.4;
        ctx.beginPath();
        ctx.moveTo(bl.x + bend * 0.4, bl.by - bl.h * 0.55);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
      }
    }
    for (const mote of this.motes) {
      ctx.save();ctx.translate(mote.x,mote.y);ctx.rotate(mote.angle);
      ctx.globalAlpha = Math.min(1,(9-mote.age)/2);
      const size = mote.size;
      if (mote.kind===0) {
        ctx.strokeStyle = '#fffdf0';ctx.lineWidth = this.dpr;
        for(let i=0;i<7;i++) { const a=i*Math.PI/6;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*size, -Math.sin(a)*size);ctx.stroke(); }
        ctx.strokeStyle = '#847b60';ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,size*1.4);ctx.stroke();
      } else {
        ctx.fillStyle = mote.kind===1?this.palette.flower:this.palette.leaf;
        ctx.beginPath();ctx.ellipse(0,0,size,size*(.25+.3*Math.abs(Math.cos(mote.age*2))),0,0,Math.PI*2);ctx.fill();
      }
      ctx.restore();
    }
  }
}

