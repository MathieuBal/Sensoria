import * as T from 'three';
import type { PointerSample } from '../core/types';
import { StudioScene, clamp } from './studio/StudioScene';

const COUNT = 12;
const fragment = `
varying vec2 vUv;
uniform vec3 drops[12];
uniform vec2 extent, magnet;
uniform float strength, tension, time;
uniform vec3 tint;
void main() {
  vec2 p = (vUv - .5) * extent;
  float field = 0.;
  vec2 grad = vec2(0.);
  for (int i = 0; i < 12; i++) {
    vec2 d = p - drops[i].xy;
    float k = 2. / (drops[i].z * drops[i].z);
    float f = exp(-dot(d,d) * k);
    field += f; grad -= 2. * k * d * f;
  }
  vec3 background = mix(vec3(.025,.032,.046), vec3(.105,.123,.15), exp(-dot(p,p)*.14));
  background *= 1. - .24 * exp(-max(0., .45-field)*8.);
  float edge = smoothstep(.44,.47,field);
  float h = sqrt(max(.0001, log(max(field,.451)/.45))) * .27;
  vec2 slope = grad * .03645 / max(field*h,.025);
  // A hexagonal magnetic relief rises locally without a second geometry pass.
  float influence = strength * exp(-dot(p-magnet,p-magnet)*1.7);
  vec2 q = p * (12. + tension*4.);
  float wave = (cos(q.x) + cos(q.x*.5+q.y*.866) + cos(q.x*.5-q.y*.866)) / 3.;
  vec2 waveGrad = vec2(-sin(q.x)-.5*sin(q.x*.5+q.y*.866)-.5*sin(q.x*.5-q.y*.866), -.866*sin(q.x*.5+q.y*.866)+.866*sin(q.x*.5-q.y*.866))/3.;
  slope += waveGrad * (12.+tension*4.) * .11 * influence * pow(max(0.,wave),2.) * smoothstep(.5,1.2,field);
  vec3 normal = normalize(vec3(-slope,1.));
  vec3 reflected = reflect(vec3(0.,0.,-1.),normal);
  float strip = exp(-pow((reflected.x+.40)/.16,2.)) * smoothstep(-.5,.65,reflected.y);
  float strip2 = exp(-pow((reflected.x-.65)/.065,2.)) * (1.-smoothstep(-.4,.8,reflected.y));
  float softbox = pow(max(0.,dot(reflected,normalize(vec3(-.3,.65,1.)))),32.);
  float fresnel = pow(1.-normal.z,3.);
  vec3 metal = vec3(.018,.025,.034) + vec3(.73,.84,.95)*strip*.8 + tint*strip2*.65 + vec3(.9,.92,.95)*softbox*.5 + tint*fresnel*.38;
  gl_FragColor = vec4(mix(background,metal,edge),1.);
}`;

/** A bounded field shaded on the GPU, with second-order attraction in world units. */
export class FerroScene extends StudioScene {
  readonly id = 'living-paint'; readonly name = 'Ferrofluide';
  readonly knobLabel = 'Tension'; readonly knobOptions = ['Doux', 'Souple', 'Hérissé'];
  readonly hint = { title: 'Attire la matière', sub: 'Maintiens puis glisse doucement ; relâche pour la laisser se rassembler.' };
  private material!: T.ShaderMaterial;
  private drops = Array.from({ length: COUNT }, () => new T.Vector3());
  private velocity = Array.from({ length: COUNT }, () => new T.Vector2());
  private pointers = new Map<number, T.Vector2>();
  private magnet = new T.Vector2();
  private strength = 0;
  private extent = new T.Vector2(4.8, 4.8);
  protected build(): void {
    this.material = new T.ShaderMaterial({
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: fragment, depthTest: false, depthWrite: false,
      uniforms: { drops: { value: this.drops }, extent: { value: this.extent }, magnet: { value: this.magnet }, strength: { value: 0 }, tension: { value: 1 }, time: { value: 0 }, tint: { value: new T.Color('#8fbfd6') } }
    });
    const screen = new T.Mesh(new T.PlaneGeometry(2, 2), this.material);
    screen.frustumCulled = false; this.world.add(screen); this.reset();
  }
  override resize(w: number, h: number, dpr: number): void {
    super.resize(w, h, dpr);
    const small = Math.min(w,h);
    this.extent.set(4.8*w/small, 4.8*h/small);
  }
  override setPalette(index: number): void {
    super.setPalette(index); this.material.uniforms.tint.value.set(['#8fbfd6','#dfac7e','#ac9bdc'][this.palette]);
  }
  reset(): void {
    this.pointers.clear(); this.magnet.set(0,0); this.strength = 0;
    this.drops.forEach((p,i) => {
      const angle = i * Math.PI * 2 / COUNT, radius = i < 8 ? .66 : .25;
      p.set(Math.cos(angle)*radius, Math.sin(angle)*radius, .54 + (i%3)*.055);
      this.velocity[i].set(0,0);
    });
    this.status('Maintiens pour attirer · glisse pour étirer · relâche pour réunir');
  }
  onInput(s: PointerSample): void {
    if (s.phase === 'end') { this.pointers.delete(s.id); return; }
    if (s.phase !== 'start' && !this.pointers.has(s.id)) return;
    this.pointers.set(s.id, new T.Vector2((s.x/this.width-.5)*this.extent.x, (.5-s.y/this.height)*this.extent.y));
  }
  protected tick(dt: number): void {
    const active = this.pointers.size > 0;
    if (active) {
      const target = new T.Vector2(); for (const p of this.pointers.values()) target.add(p);
      target.multiplyScalar(1/this.pointers.size);
      this.magnet.lerp(target, 1-Math.exp(-dt*12));
    }
    this.strength += ((active?1:0)-this.strength)*(1-Math.exp(-dt*5));
    const steps = Math.max(1,Math.ceil(dt*120)), h = dt/steps;
    for(let step=0;step<steps;step++) this.drops.forEach((p,i) => {
      const a = i*Math.PI*2/COUNT + Math.sin(this.elapsed*.3)*.06;
      const radius = (i<8?.66:.25) * (1-this.strength*.4);
      const pull = this.strength * (.65 + .25*(i/COUNT));
      const tx = this.magnet.x*pull + Math.cos(a)*radius;
      const ty = this.magnet.y*pull + Math.sin(a)*radius;
      const v = this.velocity[i], spring = 20 + this.level*8;
      v.x += ((tx-p.x)*spring-v.x*7)*h; v.y += ((ty-p.y)*spring-v.y*7)*h;
      p.x = clamp(p.x+v.x*h, -this.extent.x/2+.45, this.extent.x/2-.45);
      p.y = clamp(p.y+v.y*h, -this.extent.y/2+.45, this.extent.y/2-.45);
    });
    this.material.uniforms.strength.value = this.strength;
    this.material.uniforms.tension.value = this.level;
  }
}
