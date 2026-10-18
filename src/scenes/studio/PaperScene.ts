import * as T from 'three';
import type { PointerSample } from '../../core/types';
import { StudioScene, clamp } from './StudioScene';
type Point = [number, number, number];
type Triangle = [Point, Point, Point];
interface Fold { base: Triangle[]; center: T.Vector2; normal: T.Vector2; progress: number; target: number; }

/** Triangle clipping at an arbitrary crease, followed by a rigid 3D fold. */
export class PaperScene extends StudioScene {
  readonly id = 'folded-paper'; readonly name = 'Papier plié';
  readonly knobLabel = 'Pli'; readonly knobOptions = ['Lent', 'Souple', 'Vif'];
  override readonly toolOptions = ['Plier', 'Déplier'];
  readonly hint = { title: 'Un geste, un nouveau volume', sub: 'Glisse un point de la feuille vers son nouvel emplacement.' };
  private triangles: Triangle[] = [];
  private history: Triangle[][] = [];
  private front!: T.Mesh<T.BufferGeometry, T.MeshStandardMaterial>;
  private back!: T.Mesh<T.BufferGeometry, T.MeshStandardMaterial>;
  private crease!: T.Line;
  private fold: Fold | null = null;
  private anchor: T.Vector2 | null = null;
  private activeId: number | null = null;
  protected build(): void {
    this.backdrop('#b9c2bf', -.35);
    this.front = new T.Mesh(new T.BufferGeometry(), new T.MeshStandardMaterial({ color: '#f0d4a2', roughness: .95, side: T.FrontSide }));
    this.back = new T.Mesh(this.front.geometry, new T.MeshStandardMaterial({ color: '#a44c58', roughness: .92, side: T.BackSide }));
    this.front.castShadow = this.back.castShadow = true; this.front.receiveShadow = true;
    this.world.add(this.front, this.back);
    this.crease = new T.Line(new T.BufferGeometry(), new T.LineDashedMaterial({ color: '#83524c', dashSize: .1, gapSize: .08, transparent: true, opacity: .65 }));
    this.world.add(this.crease); this.reset();
  }
  reset(): void {
    this.triangles = [[[-3,-3,0],[3,-3,0],[3,3,0]],[[-3,-3,0],[3,3,0],[-3,3,0]]];
    this.history = []; this.fold = null; this.anchor = null; this.activeId = null; this.crease.visible = false;
    this.draw(this.triangles); this.status('Glisse un point de la feuille vers un autre · jusqu’à 6 plis, tous réversibles');
  }
  override setPalette(index: number): void {
    super.setPalette(index); this.front.material.color.set(['#f0d4a2', '#a9c9c5', '#e5aebb'][this.palette]); this.back.material.color.set(['#a44c58', '#294c66', '#795586'][this.palette]);
  }
  override setTool(index: number): void {
    if (index === 1 && this.history.length && this.activeId === null) {
      this.triangles = this.history.pop()!; this.fold = null; this.draw(this.triangles); this.crease.visible = false;
      this.status(`${this.history.length} pli(s) · glisse pour continuer`);
    }
    super.setTool(0);
  }
  onInput(s: PointerSample): void {
    if (s.phase === 'start' && this.activeId === null && !this.fold) {
      if (this.history.length >= 6) { this.status('Six plis atteints · utilise Déplier ou Réinitialiser'); return; }
      const p = this.point(s);
      if (!this.contains(p)) return;
      this.activeId = s.id; this.anchor = p;
    }
    if (this.activeId !== s.id || !this.anchor) return;
    const p = this.point(s), delta = this.anchor.clone().sub(p);
    if (s.phase === 'end') {
      if (this.fold) { this.history.push(this.triangles); this.fold.target = 1; }
      this.anchor = null; this.activeId = null; return;
    }
    if (delta.length() < .25) return;
    const normal = delta.normalize(), center = this.anchor.clone().add(p).multiplyScalar(.5);
    this.fold = { base: this.triangles, center, normal, progress: .48, target: .48 };
    const tangent = new T.Vector2(-normal.y, normal.x).multiplyScalar(5);
    this.crease.geometry.dispose(); this.crease.geometry = new T.BufferGeometry().setFromPoints([new T.Vector3(center.x-tangent.x,center.y-tangent.y,.03),new T.Vector3(center.x+tangent.x,center.y+tangent.y,.03)]);
    this.crease.computeLineDistances(); this.crease.visible = true;
  }
  private contains(p: T.Vector2): boolean {
    return this.triangles.some(t => {
      const cross = (a: Point,b: Point): number => (b[0]-a[0])*(p.y-a[1])-(b[1]-a[1])*(p.x-a[0]);
      const a=cross(t[0],t[1]),b=cross(t[1],t[2]),c=cross(t[2],t[0]);return (a>=0&&b>=0&&c>=0)||(a<=0&&b<=0&&c<=0);
    });
  }
  private clip(t: Triangle, f: Fold, side: number): Point[] {
    const result: Point[] = [], distance = (p: Point): number => ((p[0]-f.center.x)*f.normal.x+(p[1]-f.center.y)*f.normal.y)*side;
    for(let i=0;i<3;i++) {
      const a=t[i],b=t[(i+1)%3],da=distance(a),db=distance(b);
      if(da>=0)result.push(a);
      if((da>=0)!==(db>=0)) { const k=da/(da-db);result.push([a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k,a[2]+(b[2]-a[2])*k]); }
    }
    return result;
  }
  private folded(f: Fold): Triangle[] {
    const result: Triangle[] = [], angle=f.progress*Math.PI;
    for(const triangle of f.base) for(const side of [-1,1]) {
      let polygon=this.clip(triangle,f,side);
      if(side===1)polygon=polygon.map(p=> {
        const d=(p[0]-f.center.x)*f.normal.x+(p[1]-f.center.y)*f.normal.y;
        return [p[0]+f.normal.x*d*(Math.cos(angle)-1),p[1]+f.normal.y*d*(Math.cos(angle)-1),p[2]+Math.sin(angle)*d+f.progress*.035] as Point;
      });
      for(let k=1;k<polygon.length-1;k++)result.push([polygon[0],polygon[k],polygon[k+1]]);
    }
    return result;
  }
  private draw(triangles: Triangle[]): void {
    const old=this.front.geometry, geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(triangles.flat(2),3));geometry.computeVertexNormals();
    this.front.geometry=geometry;this.back.geometry=geometry;old.dispose();
  }
  protected tick(dt: number): void {
    if(!this.fold)return;
    const f=this.fold;
    f.progress=clamp(f.progress+dt*[.65,1.1,2][this.level]*(f.target>.5?1:0),0,1);
    const triangles=this.folded(f);this.draw(triangles);
    if(f.progress>=1){this.triangles=triangles;this.fold=null;this.crease.visible=false;this.status(`${this.history.length} pli(s) · Déplier revient au précédent`);}
  }
}
