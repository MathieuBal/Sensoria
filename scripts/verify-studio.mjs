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
  await page.goto('http://127.0.0.1:5178');
  await mkdir('test-results',{recursive:true});
  assert.equal(await page.locator('.card').count(),22);
  const results=[];
  for(const mobile of [false,true]) {
    await page.setViewportSize(mobile?{width:390,height:844}:{width:1000,height:760});
    for(let i=16;i<22;i++) {
      await page.locator('.card').nth(i).click();
      await page.locator('#scene-guide').waitFor({state:'visible'});
      const title=await page.locator('#guide-title').textContent();
      assert.ok((await page.locator('#guide-concept').textContent()).length>60);
      await page.getByRole('button',{name:'Explorer',exact:true}).click();
      await page.waitForTimeout(150);
      const box=await page.locator('#stage').boundingBox();
      const x=box.width*.4,y=box.height*.5;
      if(mobile) {
        const session=await page.context().newCDPSession(page);
        const touch=(type,x,y)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});
        await touch('touchStart',x,y);
        for(let k=0;k<16;k++)await touch('touchMove',x+box.width*.2*k/16,y+Math.sin(k*.3)*box.height*.1);
        await touch('touchEnd',0,0);await session.detach();
      } else {
        await page.mouse.move(x,y);await page.mouse.down();
        for(let k=0;k<16;k++)await page.mouse.move(x+box.width*.2*k/16,y+Math.sin(k*.3)*box.height*.1);
        await page.mouse.up();
      }
      await page.waitForTimeout(450);
      await page.screenshot({path:`test-results/studio-${i}-${mobile?'mobile':'desktop'}.png`});
      assert.equal(await page.locator('#studio-stage').count(),1);
      await page.getByRole('button',{name:'Réglages',exact:true}).click();
      await page.locator('#symmetry button').last().click();
      await page.locator('#palettes button').last().click();
      await page.locator('#reduced').check();await page.locator('#reduced').uncheck();
      await page.getByRole('button',{name:'Réinitialiser',exact:true}).click();
      await page.getByRole('button',{name:'Fermer',exact:true}).click();
      await page.getByRole('button',{name:'Comprendre cette scène'}).click();await page.keyboard.press('Escape');
      assert.equal(await page.locator('#scene-guide').isVisible(),false);
      await page.getByRole('button',{name:'Retour à la galerie'}).click();
      assert.equal(await page.locator('#studio-stage').isVisible(),false);
      results.push(`${mobile?'mobile':'desktop'}: ${title}`);
    }
  }
  await page.setViewportSize({width:1000,height:760});
  for(let i=0;i<16;i++) {
    await page.locator('.card').nth(i).click();
    await page.locator('#scene-guide').waitFor({state:'visible'});
    await page.getByRole('button',{name:'Explorer',exact:true}).click();
    await page.mouse.move(400,350);await page.mouse.down();await page.mouse.move(550,400,{steps:8});await page.mouse.up();
    await page.getByRole('button',{name:'Retour à la galerie'}).click();
  }
  // Deterministic state checks complement screenshots: these are real scene instances.
  const state=await page.evaluate(async()=>{
    const {ClayScene}=await import('/src/scenes/studio/ClayScene.ts');
    const {PaperScene}=await import('/src/scenes/studio/PaperScene.ts');
    const {BalanceScene}=await import('/src/scenes/studio/BalanceScene.ts');
    const {EchoScene}=await import('/src/scenes/studio/EchoScene.ts');
    const canvas=document.createElement('canvas'),fxCanvas=document.createElement('canvas');canvas.width=800;canvas.height=600;fxCanvas.width=800;fxCanvas.height=600;
    const context={canvas,fxCanvas,ctx:canvas.getContext('2d'),fx:fxCanvas.getContext('2d'),width:800,height:600,dpr:1,settings:{palette:0,symmetry:1,auto:false,reducedEffects:false},perf:{quality:1}};
    const sample=(x,y,phase='move')=>({id:1,x,y,px:x-4,py:y-2,vx:.1,vy:.1,speed:.2,dt:16,pressure:.5,phase,synthetic:false});
    const setup=s=>{s.mount(context);s.resize(800,600,1);return s;};
    const step=(s,n=60)=>{for(let i=0;i<n;i++)s.update(1000/60,i*1000/60);};
    const clay=setup(new ClayScene()),mid=5100,before=clay.heights[mid];clay.onInput(sample(400,300,'start'));step(clay);clay.onInput(sample(400,300,'end'));const after=clay.heights[mid];if(!(after<before-.1))throw Error('Clay did not deform');clay.unmount();
    const paper=setup(new PaperScene());paper.onInput(sample(250,300,'start'));paper.onInput(sample(450,310));paper.onInput(sample(450,310,'end'));step(paper,100);if(paper.history.length!==1)throw Error('Fold not committed');paper.setTool(1);if(paper.history.length!==0||paper.triangles.length!==2)throw Error('Undo failed');paper.unmount();
    const balance=setup(new BalanceScene());balance.weights[0].mass=2.3;step(balance,600);if(!balance.angles.every(Number.isFinite)||Math.abs(balance.angles[0])<.1)throw Error('Balance torque');const angles=[...balance.angles];balance.unmount();
    const echo=setup(new EchoScene());for(let j=0;j<7;j++){echo.onInput(sample(250,280,'start'));for(let i=0;i<12;i++)echo.onInput(sample(250+i*20,280+Math.sin(i)*60));echo.onInput(sample(500,300,'end'));step(echo,5);}if(echo.echoes.length!==5)throw Error('Unbounded echoes');const scale=echo.echoes[0].beads.instanceMatrix.array[0];if(Math.abs(scale)>1.81)throw Error('Echo size exceeds design limit');echo.setTool(1);const time=echo.echoes[0].time;step(echo);if(echo.echoes[0].time!==time)throw Error('Pause ignored');echo.unmount();
    return {clay:{before,after},balance:angles,foldUndo:true,echoCap:5,echoPause:true};
  });
  assert.deepEqual(errors,[]);
  const fallback=await browser.newPage();
  await fallback.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args);};
  });
  await fallback.goto('http://127.0.0.1:5178');
  await fallback.locator('.card').nth(16).click();
  await fallback.getByText('Ce tableau n’a pas pu démarrer.',{exact:false}).waitFor();
  await fallback.locator('.card').first().click();
  await fallback.getByRole('button',{name:'Explorer',exact:true}).click();
  await fallback.getByRole('button',{name:'Retour à la galerie'}).click();
  await fallback.close();
  console.log(JSON.stringify({results,legacyScenes:16,webglFallback:true,state,errors},null,2));
} finally {await browser?.close();server.kill();}
