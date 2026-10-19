import {test,expect} from '@playwright/test';
import {interactionWad} from '../helpers/interaction-wad';
import {mkdir,writeFile} from 'node:fs/promises';

for(const side of ['left','right'] as const)test(`snapshot-point aiming compensates ${side} strafe during delayed view updates`,async({page})=>{
  const fixture=interactionWad({distance:160,angleOffset:side==='right'?90:270});
  await page.route('**/aim.wad',route=>route.fulfill({body:fixture.wad}));await page.goto('/');
  const result=await page.evaluate(async(side)=>{
    const path='/src/game/bridge.ts';const {BrowserDoom}=await import(/* @vite-ignore */path);
    const game=new BrowserDoom();await game.start(document.createElement('canvas'),new Uint8Array(await(await fetch('/aim.wad')).arrayBuffer()),'Snapshot point mechanics fixture',3);
    const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));while((game.readObservation()?.gameTic??0)<25)await sleep(20);
    const delta=(a:number,b:number)=>(a-b+540)%360-180;
    const trial=async(pointMode:boolean,epoch:number)=>{
      game.setEpoch(epoch);const initial=game.readObservation()!;
      await game.applyChannel('view',side==='right'?'turn_left':'turn_right',initial,1,epoch,performance.now()+500,new AbortController().signal);
      const alignmentLimit=performance.now()+1100;
      while(game.readObservation()!.inputs.find((i:{channel:string})=>i.channel==='view')?.active&&performance.now()<alignmentLimit)await sleep(5);
      const original=game.readObservation()!;original.objects=[{id:999,kind:'enemy',type:'TEST',distance:192,bearing:0}];
      const angle=original.player.angle*Math.PI/180,target={x:Math.round((original.player.x+Math.cos(angle)*192)*1000)/1000,y:Math.round((original.player.y+Math.sin(angle)*192)*1000)/1000};
      await game.applyChannel('view',pointMode?'face_enemy_999':'hold',original,2,epoch,performance.now()+500,new AbortController().signal);
      await Promise.all([game.applyChannel('movement',`strafe_${side}`,original,1,epoch,performance.now()+500,new AbortController().signal),game.applyChannel('action','fire',original,1,epoch,performance.now()+500,new AbortController().signal)]);
      // Observe first, then let translation continue while HTTP would be in flight.
      // The controller's source-TTL checks have separate tests. This isolates
      // native compensation even if the host stalls during the simulated HTTP.
      await sleep(280);const applied=await game.applyChannel('view',pointMode?'face_enemy_999':'hold',original,3,epoch,performance.now()+500,new AbortController().signal);
      await sleep(70);const concurrent=game.readObservation()!;
      const samples:{error:number;point:unknown;tic:number}[]=[];let last=-1;const until=performance.now()+350;
      while(performance.now()<until){
        const o=game.readObservation()!,view=o.inputs.find((i:{channel:string})=>i.channel==='view')!;
        if(o.gameTic!==last){last=o.gameTic;const desired=Math.atan2(target.y-o.player.y,target.x-o.player.x)*180/Math.PI;samples.push({error:Math.abs(delta(desired,o.player.angle)),point:view.targetPoint,tic:o.gameTic});}
        await sleep(5);
      }
      const after=game.readObservation()!;await sleep(450);const expired=game.readObservation()!;game.releaseControls();
      const errors=samples.map(s=>s.error).sort((a,b)=>a-b);
      return {samples,target,applied,concurrent,expired,p95:errors[Math.ceil(errors.length*.95)-1],distance:Math.hypot(after.player.x-original.player.x,after.player.y-original.player.y)};
    };
    const baseline=await trial(false,10),oldEpisode=game.readObservation()!.episodeId;
    game.restart(3);while(game.readObservation()!.episodeId===oldEpisode)await sleep(5);await sleep(120);
    const compensated=await trial(true,11);game.suspend(true);return {baseline,compensated};
  },side);
  await test.info().attach('own-motion-aiming',{body:JSON.stringify(result),contentType:'application/json'});
  await mkdir('artifacts',{recursive:true});await writeFile(`artifacts/aiming-${side}-${test.info().project.name}.json`,JSON.stringify(result,null,2));
  expect(result.baseline.distance).toBeGreaterThan(20);expect(result.compensated.distance).toBeGreaterThan(20);
  expect(result.compensated.samples.length).toBeGreaterThanOrEqual(6);
  expect(result.baseline.p95).toBeGreaterThan(5);expect(result.compensated.p95).toBeLessThanOrEqual(2);
  expect(result.compensated.samples.every(s=>JSON.stringify(s.point)===JSON.stringify(result.compensated.target))).toBe(true);
  expect(result.compensated.concurrent.inputs.find((i:{channel:string})=>i.channel==='action')?.active).toBe(true);
  expect(result.compensated.expired.inputs.find((i:{channel:string})=>i.channel==='view')?.active).toBe(false);
});
