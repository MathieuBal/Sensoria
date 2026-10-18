import * as T from 'three';
import type { PointerSample } from '../../core/types';
import { StudioScene } from './StudioScene';
interface Echo { points:T.Vector3[]; line:T.Line; beads:T.InstancedMesh; time:number; duration:number; age:number; }
/** Gesture loops become layered kinetic scores; all buffers and history are bounded. */
export class EchoScene extends StudioScene {
  readonly id='gesture-echoes';readonly name='Échos du geste';
  readonly knobLabel='Tempo';readonly knobOptions=['Lent','Fluide','Vif'];
  override readonly toolOptions=['Tracer','Pause','Retirer'];
  readonly hint={title:'Compose un mouvement',sub:'Trace puis relâche : ton geste devient une boucle.'};
  private echoes:Echo[]=[];private drawing:T.Vector3[]=[];private activeId:number|null=null;
  private preview!:T.Line;private drawTime=0;private paused=false;
  protected build():void {
    this.world.background=new T.Color('#0c1424');
    this.preview=new T.Line(new T.BufferGeometry(),new T.LineBasicMaterial({color:'#f1d9b3',transparent:true,opacity:.8}));this.world.add(this.preview);
    this.status('Trace puis relâche · 5 boucles se répondent dans le temps');
  }
  reset():void {for(const e of this.echoes)this.remove(e);this.echoes=[];this.drawing=[];this.activeId=null;this.paused=false;this.preview.geometry.dispose();this.preview.geometry=new T.BufferGeometry();super.setTool(0);}
  private remove(e:Echo):void {this.world.remove(e.line,e.beads);e.line.geometry.dispose();(e.line.material as T.Material).dispose();e.beads.geometry.dispose();(e.beads.material as T.Material).dispose();}
  override setTool(index:number):void {
    if(index===1){this.paused=!this.paused;super.setTool(this.paused?1:0);this.status(this.paused?'Boucles en pause · appuie sur Pause pour reprendre':'Trace un autre geste pour enrichir la composition');}
    else if(index===2){const old=this.echoes.pop();if(old)this.remove(old);super.setTool(this.paused?1:0);}
    else{this.paused=false;super.setTool(0);}
  }
  onInput(s:PointerSample):void {
    if(s.phase==='start'&&this.activeId===null){this.activeId=s.id;this.drawing=[];this.drawTime=0;}
    if(this.activeId!==s.id)return;
    if(s.phase==='end'){this.finish();this.activeId=null;return;}
    if(this.drawing.length>=280){this.finish();this.activeId=null;return;}
    const p=this.point(s),v=new T.Vector3(p.x,p.y,Math.sin(this.drawTime*2)*.3);
    if(!this.drawing.length||v.distanceTo(this.drawing[this.drawing.length-1])>.05){this.drawing.push(v);this.preview.geometry.dispose();this.preview.geometry=new T.BufferGeometry().setFromPoints(this.drawing);}
  }
  private finish():void {
    if(this.drawing.length<3){this.drawing=[];this.preview.geometry.dispose();this.preview.geometry=new T.BufferGeometry();return;}
    if(this.echoes.length>=5)this.remove(this.echoes.shift()!);
    // Close smoothly rather than teleporting from end to beginning.
    const curve=new T.CatmullRomCurve3(this.drawing.map(p=>p.clone()),true,'centripetal');const points=curve.getPoints(240);
    const hue=(this.echoes.length*.17+this.palette*.3)%1,color=new T.Color().setHSL(hue,.65,.65);
    const line=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color,transparent:true,opacity:.25}));
    const beads=new T.InstancedMesh(new T.SphereGeometry(.07,12,8),new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:1.3,roughness:.35}),32);
    beads.instanceMatrix.setUsage(T.DynamicDrawUsage);beads.frustumCulled=false;
    this.world.add(line,beads);this.echoes.push({points,line,beads,time:0,duration:Math.max(2,Math.min(7,this.drawTime*1.5)),age:0});this.drawing=[];this.preview.geometry.dispose();this.preview.geometry=new T.BufferGeometry();
  }
  protected tick(dt:number):void {
    if(this.activeId!==null)this.drawTime+=dt;
    const transform=new T.Object3D();
    for(const e of this.echoes){
      if(!this.paused){e.time+=dt*[.5,1,1.7][this.level];e.age+=dt;}
      const life=Math.min(1,Math.max(0,1-(e.age-70)/20));(e.line.material as T.LineBasicMaterial).opacity=.24*life;
      for(let i=0;i<32;i++){
        const phase=((e.time/e.duration-i*.008)%1+1)%1,index=phase*(e.points.length-1),lo=Math.floor(index);
        transform.position.copy(e.points[lo]).lerp(e.points[(lo+1)%e.points.length],index-lo);
        transform.position.z+=Math.sin(e.time*.4)*.12;
        transform.scale.setScalar(Math.max(.01,life*(1-i/36)*(i===0?1.8:1)));
        transform.updateMatrix();e.beads.setMatrixAt(i,transform.matrix);
      }
      e.beads.instanceMatrix.needsUpdate=true;
    }
    this.echoes=this.echoes.filter(e=>{if(e.age>90){this.remove(e);return false;}return true;});
  }
}
