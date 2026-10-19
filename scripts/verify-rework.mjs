import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5178','--strictPort'],{stdio:['ignore','pipe','pipe']});
let browser;
try {
  await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(d.toString().includes('Local:'))resolve();});server.on('exit',code=>reject(Error(`Vite exited: ${code}`)));server.stderr.on('data',d=>process.stderr.write(d));});
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}: {})});
  const page=await browser.newPage({viewport:{width:1000,height:760},hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('net::ERR'))errors.push(m.text());});
  await page.route('https://fonts.googleapis.com/**',r=>r.abort());await page.route('https://fonts.gstatic.com/**',r=>r.abort());
  await page.addInitScript(()=>{
    window.audioContexts=[];
    const Native=window.AudioContext;
    window.AudioContext=class extends Native {
      constructor(...args){super(...args);window.audioContexts.push(this);this.meter=this.createAnalyser();}
      createGain(){const gain=super.createGain();gain.connect(this.meter);return gain;}
    };
  });
  await page.goto('http://127.0.0.1:5178');
  await mkdir('test-results',{recursive:true});
  const results=[];
  for(const mobile of [false,true]) {
    await page.setViewportSize(mobile?{width:390,height:844}:{width:1000,height:760});
    for(const i of [7,8,14,18]) {
      await page.locator('.card').nth(i).click();await page.locator('#scene-guide').waitFor({state:'visible'});
      const title=await page.locator('#guide-title').textContent();
      await page.getByRole('button',{name:'Explorer',exact:true}).click();
      if(i===18)assert.equal(await page.locator('#scene-tools').isVisible(),false);
      if(i===8) {
        const before=await page.evaluate(()=>window.audioContexts.length);
        await page.getByRole('button',{name:'Son doux',exact:true}).click();
        await page.waitForFunction(n=>window.audioContexts.length===n+1&&window.audioContexts.at(-1).state==='running',before);
      }
      const {width:w,height:h}=page.viewportSize();
      const session=mobile?await page.context().newCDPSession(page):null;
      const point=(k)=>({x:w*(.2+k*.6/24),y:h*(.55+Math.sin(k*.3)*.12)});
      const p=point(0);
      if(session)await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});
      else {await page.mouse.move(p.x,p.y);await page.mouse.down();}
      for(let k=1;k<=24;k++) {
        const p=point(k);
        if(session)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...p,id:1}]});
        else await page.mouse.move(p.x,p.y);
      }
      if(i===8) {
        const peak=await page.evaluate(()=>{const c=window.audioContexts.at(-1),data=new Float32Array(c.meter.fftSize);c.meter.getFloatTimeDomainData(data);return Math.max(...data.map(Math.abs));});
        assert.ok(peak>0,'Musical gesture must generate a non-silent signal');
      }
      await page.screenshot({path:`test-results/rework-${i}-${mobile?'mobile':'desktop'}.png`});
      if(session) {await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();}
      else await page.mouse.up();
      if(i===7){await page.waitForTimeout(1200);await page.screenshot({path:`test-results/rework-ferro-rest-${mobile?'mobile':'desktop'}.png`});}
      if(i===8) {await page.getByRole('button',{name:'Silence',exact:true}).click();}
      await page.getByRole('button',{name:'Réglages',exact:true}).click();
      await page.locator('#symmetry button').last().click();await page.locator('#palettes button').last().click();
      await page.getByRole('button',{name:'Réinitialiser',exact:true}).click();
      await page.getByRole('button',{name:'Fermer',exact:true}).click();
      await page.getByRole('button',{name:'Retour à la galerie'}).click();
      if(i===8)assert.equal(await page.evaluate(()=>window.audioContexts.at(-1).state),'closed');
      results.push(`${mobile?'mobile':'desktop'}: ${title}`);
    }
  }
  const state=await page.evaluate(async()=>{
    const {FerroScene}=await import('/src/scenes/FerroScene.ts');
    const {BalanceScene}=await import('/src/scenes/studio/BalanceScene.ts');
    const {GrassScene}=await import('/src/scenes/GrassScene.ts');
    const {StringsScene}=await import('/src/scenes/StringsScene.ts');
    const canvas=document.createElement('canvas'),fxCanvas=document.createElement('canvas');canvas.width=800;canvas.height=600;fxCanvas.width=800;fxCanvas.height=600;
    const context={canvas,fxCanvas,ctx:canvas.getContext('2d'),fx:fxCanvas.getContext('2d'),width:800,height:600,dpr:1,settings:{palette:0,symmetry:1,auto:false,reducedEffects:false},perf:{quality:1}};
    const sample=(x,y,phase='move')=>({id:0,x,y,px:x-4,py:y-2,vx:.1,vy:.1,speed:.2,dt:16,pressure:.5,phase,synthetic:false});
    const setup=s=>{s.mount(context);s.resize(800,600,1);return s;};
    const ferro=setup(new FerroScene());
    ferro.onInput(sample(650,300,'start'));for(let i=0;i<240;i++)ferro.tick(1/60);
    const pulled=ferro.drops.reduce((sum,p)=>sum+p.x,0)/12;
    if(pulled<.7||ferro.drops.some(p=>!Number.isFinite(p.x)))throw Error('Magnetic response');
    ferro.onInput(sample(650,300,'end'));for(let i=0;i<600;i++)ferro.tick(1/60);
    const resting=ferro.drops.reduce((sum,p)=>sum+p.x,0)/12;
    if(Math.abs(resting)>.05)throw Error('Fluid does not return');ferro.unmount();
    const balance=setup(new BalanceScene());balance.update(16);balance.world.updateMatrixWorld(true);
    const w=balance.weights[0],p=w.mesh.getWorldPosition(w.mesh.position.clone()).project(balance.camera);
    const x=(p.x+1)*400,y=(1-p.y)*300,before=w.x;
    balance.onInput(sample(x,y,'start'));if(balance.picked!==w)throw Error('Cannot grab weight');
    balance.onInput(sample(x+65,y));balance.onInput(sample(x+65,y,'end'));
    if(Math.abs(w.x-before)<.3||balance.picked!==null||balance.toolOptions)throw Error('Direct manipulation failed');
    for(let i=0;i<1200;i++)balance.tick(1/60);if(!balance.angles.every(Number.isFinite))throw Error('Unstable balance');balance.unmount();
    const grass=setup(new GrassScene());for(let i=0;i<500;i++)grass.emit(400,300,10,2,-1);
    if(grass.motes.length>180)throw Error('Unbounded wind particles');
    for(let i=0;i<620;i++)grass.simulate(1000/60);if(grass.motes.length)throw Error('Wind particles never expire');grass.unmount();
    const strings=setup(new StringsScene());const st=strings.strings[3];
    strings.onInput(sample(st.x0,300,'start'));strings.onInput(sample(st.x0+20,300));
    if(st.a<15)throw Error('Cannot stretch string');strings.onInput(sample(st.x0+20,300,'end'));
    for(let i=0;i<1000;i++)strings.update(1000/60,0);
    if(!Number.isFinite(st.a)||Math.abs(st.a)>1)throw Error('String fails to settle');
    if(strings.audio.context!==null)throw Error('Audio started without consent');strings.unmount();
    return {ferro:{pulled,resting},balanceDrag:true,windBounded:true,stringsSettle:true};
  });
  assert.deepEqual(errors,[]);console.log(JSON.stringify({results,state,errors},null,2));
} finally {await browser?.close();server.kill();}
