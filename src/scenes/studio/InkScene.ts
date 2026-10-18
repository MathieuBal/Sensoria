import * as T from 'three';
import type { PointerSample } from '../../core/types';
import { StudioScene } from './StudioScene';
const vertex = `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
const fragment = `
precision highp float;
varying vec2 vUv;
uniform sampler2D source,velocity,pressure,divergence;
uniform vec2 texel,point,force;
uniform vec3 pigment;
uniform float dt,radius,decay,aspect;
uniform int operation;
vec2 vel(vec2 uv){return (texture2D(velocity,clamp(uv,texel,1.-texel)).xy-.5)*2.;}
float pres(vec2 uv){return (texture2D(pressure,clamp(uv,texel,1.-texel)).r-.5)*2.;}
void main(){
 vec2 uv=vUv;
 if(operation==0){ // semi-Lagrangian advection, bounded bilinear sampling
  vec2 pos=clamp(uv-dt*vel(uv),texel,1.-texel);
  vec4 value=texture2D(source,pos);
  gl_FragColor=vec4((value.xy-.5)*decay+.5,0.,1.);
 }else if(operation==1){
  float l=vel(uv-vec2(texel.x,0.)).x,r=vel(uv+vec2(texel.x,0.)).x;
  float b=vel(uv-vec2(0.,texel.y)).y,t=vel(uv+vec2(0.,texel.y)).y;
  gl_FragColor=vec4(.5+.25*(r-l+t-b),0.,0.,1.);
 }else if(operation==2){ // Jacobi pressure projection
  float sum=pres(uv-vec2(texel.x,0.))+pres(uv+vec2(texel.x,0.))+pres(uv-vec2(0.,texel.y))+pres(uv+vec2(0.,texel.y));
  float div=(texture2D(divergence,uv).r-.5)*2.;
  gl_FragColor=vec4(.5+(sum-div)*.125,0.,0.,1.);
 }else if(operation==3){
  vec2 gradient=vec2(pres(uv+vec2(texel.x,0.))-pres(uv-vec2(texel.x,0.)),pres(uv+vec2(0.,texel.y))-pres(uv-vec2(0.,texel.y)))*.5;
  vec2 v=vel(uv)-gradient;
  if(uv.x<texel.x*2.||uv.x>1.-texel.x*2.)v.x=0.;
  if(uv.y<texel.y*2.||uv.y>1.-texel.y*2.)v.y=0.;
  gl_FragColor=vec4(clamp(v,-.9,.9)*.5+.5,0.,1.);
 }else if(operation==4){
  vec2 pos=clamp(uv-dt*vel(uv),texel,1.-texel);
  gl_FragColor=texture2D(source,pos)*decay;
 }else{
  vec2 d=uv-point;d.x*=aspect;
  float w=exp(-dot(d,d)/(radius*radius));
  vec4 old=texture2D(source,uv);
  if(operation==5)gl_FragColor=vec4(clamp((old.xy-.5)*2.+force*w,-.9,.9)*.5+.5,0.,1.);
  else gl_FragColor=clamp(old+vec4(pigment,1.)*w*.28,0.,1.);
 }
}`;
const display = `varying vec2 vUv;uniform sampler2D dye;void main(){vec4 c=texture2D(dye,vUv);vec3 paper=vec3(.94,.90,.82);vec3 ink=exp(-c.rgb*3.2);vec3 color=paper*ink;float grain=fract(sin(dot(vUv,vec2(127.1,311.7)))*43758.5453);gl_FragColor=vec4(color+(grain-.5)*.008,1.);}`;
interface Pair { read: T.WebGLRenderTarget; write: T.WebGLRenderTarget; }
interface Splat { x:number;y:number;vx:number;vy:number;ink:boolean; }

/** GPU fluid: velocity advection, pressure projection and pigment transport. */
export class InkScene extends StudioScene {
  readonly id='floating-ink'; readonly name='Encres flottantes';
  readonly knobLabel='Fluidité'; readonly knobOptions=['Visqueuse','Souple','Libre'];
  override readonly toolOptions=['Encre','Remuer','Peigne'];
  readonly hint={title:'Peins dans le courant',sub:'Dépose l’encre puis étire-la avec le courant.'};
  private velocity!:Pair; private dye!:Pair; private pressure!:Pair; private divergence!:T.WebGLRenderTarget;
  private compute!:T.ShaderMaterial; private display!:T.ShaderMaterial;
  private quadScene=new T.Scene(); private quadCamera=new T.Camera();
  private queue:Splat[]=[]; private accumulator=0; private active=new Set<number>();
  private targets:T.WebGLRenderTarget[]=[];
  protected build():void {
    const size=this.context.settings.reducedEffects?128:192;
    const type=this.renderer.extensions.has('EXT_color_buffer_float')?T.HalfFloatType:T.UnsignedByteType;
    const make=(resolution=size):T.WebGLRenderTarget=>{const target=new T.WebGLRenderTarget(resolution,resolution,{type,minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:false,stencilBuffer:false});this.targets.push(target);return target;};
    const pair=(resolution=size):Pair=>({read:make(resolution),write:make(resolution)});
    this.velocity=pair();this.dye=pair(this.context.settings.reducedEffects?256:512);this.pressure=pair();this.divergence=make();
    this.compute=new T.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,depthTest:false,depthWrite:false,uniforms:{source:{value:null},velocity:{value:null},pressure:{value:null},divergence:{value:this.divergence.texture},texel:{value:new T.Vector2(1/size,1/size)},point:{value:new T.Vector2()},force:{value:new T.Vector2()},pigment:{value:new T.Vector3()},dt:{value:1/60},radius:{value:.035},decay:{value:1},aspect:{value:1},operation:{value:0}}});
    this.quadScene.add(new T.Mesh(new T.PlaneGeometry(2,2),this.compute));
    this.display=new T.ShaderMaterial({vertexShader:vertex,fragmentShader:display,depthTest:false,depthWrite:false,uniforms:{dye:{value:this.dye.read.texture}}});
    const screen=new T.Mesh(new T.PlaneGeometry(2,2),this.display);screen.frustumCulled=false;this.world.add(screen);this.reset();
  }
  protected override restore():void { this.reset(); }
  private swap(pair:Pair):void {[pair.read,pair.write]=[pair.write,pair.read];}
  private pass(operation:number,target:T.WebGLRenderTarget,source:T.Texture):void {
    const u=this.compute.uniforms;u.operation.value=operation;u.source.value=source;u.velocity.value=this.velocity.read.texture;u.pressure.value=this.pressure.read.texture;
    this.renderer.setRenderTarget(target);this.renderer.render(this.quadScene,this.quadCamera);
  }
  reset():void {
    const color=new T.Color();this.renderer.getClearColor(color);
    for(const target of this.targets){this.renderer.setRenderTarget(target);this.renderer.setClearColor(target===this.dye.read||target===this.dye.write?0x000000:new T.Color(.5,.5,.5),1);this.renderer.clear();}
    this.renderer.setRenderTarget(null);this.renderer.setClearColor(color);this.queue=[];this.active.clear();this.accumulator=0;
    // A small initial composition makes the fluid discoverable before drawing.
    for(let i=0;i<3;i++)this.queue.push({x:.35+i*.15,y:.5+Math.sin(i*2)*.12,vx:0,vy:0,ink:true});
    this.status('Dépose une couleur · Remuer et Peigne étirent les pigments');
  }
  onInput(s:PointerSample):void {
    if(s.phase==='end'){this.active.delete(s.id);return;}
    if(s.phase==='start')this.active.add(s.id);
    if(!this.active.has(s.id))return;
    const count=this.selectedTool===2?5:1;
    for(let i=0;i<count;i++){
      if(this.queue.length>=24)this.queue.shift();
      this.queue.push({x:s.x/this.width+(i-(count-1)/2)*.045,y:1-s.y/this.height,vx:(s.x-s.px)/this.width*14,vy:-(s.y-s.py)/this.height*14,ink:this.selectedTool===0});
    }
  }
  protected tick(dt:number):void {
    this.accumulator+=dt;if(this.accumulator<1/40)return;
    const step=Math.min(this.accumulator,.05);this.accumulator=0;
    const u=this.compute.uniforms;u.aspect.value=this.width/this.height;u.dt.value=step;
    for(const s of this.queue){
      u.point.value.set(s.x,s.y);u.force.value.set(s.vx,s.vy);u.radius.value=this.selectedTool===2?.016:.028;
      this.pass(5,this.velocity.write,this.velocity.read.texture);this.swap(this.velocity);
      if(s.ink){
        const colors=[[.08,.55,.74],[.62,.15,.3],[.66,.36,.04]];const color=colors[this.palette];u.pigment.value.set(...color as [number,number,number]);
        this.pass(6,this.dye.write,this.dye.read.texture);this.swap(this.dye);
      }
    }
    this.queue.length=0;
    u.decay.value=Math.exp(-step*[2.5,1,.3][this.level]);this.pass(0,this.velocity.write,this.velocity.read.texture);this.swap(this.velocity);
    this.pass(1,this.divergence,this.velocity.read.texture);
    const iterations=this.context.settings.reducedEffects?6:12;
    for(let i=0;i<iterations;i++){this.pass(2,this.pressure.write,this.pressure.read.texture);this.swap(this.pressure);}
    this.pass(3,this.velocity.write,this.velocity.read.texture);this.swap(this.velocity);
    u.decay.value=Math.exp(-step*.006);this.pass(4,this.dye.write,this.dye.read.texture);this.swap(this.dye);
    this.display.uniforms.dye.value=this.dye.read.texture;this.renderer.setRenderTarget(null);
  }
  override unmount():void {
    this.targets.forEach(t=>t.dispose());this.targets=[];
    this.quadScene.traverse(o=>{const m=o as T.Mesh;if(m.geometry)m.geometry.dispose();});this.compute?.dispose();this.quadScene.clear();
    super.unmount();
  }
}
