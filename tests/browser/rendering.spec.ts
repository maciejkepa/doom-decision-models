import {test,expect} from '@playwright/test';
import {interactionWad} from '../helpers/interaction-wad';
import {mkdir,writeFile} from 'node:fs/promises';

test('interpolated walking never draws the view actor over the world',async({page})=>{
  // Neutral stone/metal scene with no things except the player. Green pixels
  // filling the view are the player's uniform, not an enemy, pickup or texture.
  const fixture=interactionWad({distance:160});
  await page.route('**/render-fixture.wad',r=>r.fulfill({body:fixture.wad}));await page.goto('/');
  const result=await page.evaluate(async()=>{
    const path='/src/game/bridge.ts';const {BrowserDoom}=await import(/* @vite-ignore */path);
    const canvas=document.createElement('canvas');document.body.append(canvas);
    const game=new BrowserDoom();await game.start(canvas,new Uint8Array(await(await fetch('/render-fixture.wad')).arrayBuffer()),'Neutral rendering fixture',3);game.audio(false);
    const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));while((game.readObservation()?.gameTic??0)<25)await sleep(20);
    const context=canvas.getContext('2d')!,counts:number[]=[];
    const sample=()=>{
      const pixels=context.getImageData(0,0,640,240).data;let green=0;
      for(let i=0;i<pixels.length;i+=4)if(pixels[i+1]>=60&&pixels[i+1]>pixels[i]*1.5&&pixels[i+1]>pixels[i+2]*1.5)green++;
      counts.push(green);
    };
    sample();const before=game.readObservation()!;
    // Sample every displayed frame, including frames between simulation tics.
    for(const bits of [1,2,17,33]){
      game.manual(bits);
      const until=performance.now()+450;
      while(performance.now()<until){await new Promise<void>(r=>requestAnimationFrame(()=>r()));sample();}
    }
    game.releaseControls();const after=game.readObservation()!;game.suspend(true);
    return {baseline:counts[0],maxGreen:Math.max(...counts),frames:counts.length,before,after};
  });
  await mkdir('artifacts',{recursive:true});
  await writeFile(`artifacts/rendering-${test.info().project.name}.json`,JSON.stringify({baselineGreenPixels:result.baseline,maxGreenPixels:result.maxGreen,sampledFrames:result.frames},null,2));
  expect(result.frames).toBeGreaterThan(50);
  expect(Math.hypot(result.after.player.x-result.before.player.x,result.after.player.y-result.before.player.y)).toBeGreaterThan(10);
  // Allow small green details in the full-map background, never a giant body.
  expect(result.maxGreen).toBeLessThan(640*240*.03);
});
