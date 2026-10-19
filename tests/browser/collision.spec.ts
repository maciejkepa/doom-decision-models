import {test,expect} from '@playwright/test';
import {interactionWad} from '../helpers/interaction-wad';
import type {Observation} from '../../shared/contracts';
test('footprint sensing and late collision feedback stop only the blocked translation',async({page})=>{
  const fixture=interactionWad({distance:40,special:0});await page.route('**/wall.wad',r=>r.fulfill({body:fixture.wad}));await page.goto('/');
  const r=await page.evaluate(async()=>{
    const path='/src/game/bridge.ts';const {BrowserDoom}=await import(/* @vite-ignore */path);const game=new BrowserDoom();
    await game.start(document.createElement('canvas'),new Uint8Array(await(await fetch('/wall.wad')).arrayBuffer()),'Full-map closed-door collision',3);
    const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));while((game.readObservation()?.gameTic??0)<25)await sleep(20);game.setEpoch(10);
    const initial=game.readObservation()!;
    await Promise.all([game.applyChannel('movement','advance',initial,1,10,performance.now()+500,new AbortController().signal),game.applyChannel('action','fire',initial,1,10,performance.now()+500,new AbortController().signal)]);
    const until=performance.now()+600;let after=game.readObservation()!;
    while(performance.now()<until&&after.inputs.find((i:{channel:string})=>i.channel==='movement')?.endReason!=='blocked'){await sleep(8);after=game.readObservation()!;}
    game.suspend(true);return {initial,after};
  });
  const ray=r.initial.rays.find((v:Observation['rays'][number])=>v.bearing===0)!;
  expect(r.initial.interactions.some((v:Observation['interactions'][number])=>v.id===fixture.id)).toBe(false);
  expect(ray.bodyDistance).toBeLessThan(ray.distance-10);
  const move=r.after.inputs.find((v:Observation['inputs'][number])=>v.channel==='movement')!,fire=r.after.inputs.find((v:Observation['inputs'][number])=>v.channel==='action')!;
  expect(move.endReason).toBe('blocked');expect(move.active).toBe(false);expect(move.progress).toBeGreaterThan(5);expect(move.blockedTics).toBeGreaterThanOrEqual(3);
  expect(fire.active).toBe(true);expect(r.after.gameTic-r.initial.gameTic).toBeLessThan(22);
});
test('AI advances cautiously while ordinary manual walking retains its speed',async({page})=>{
  const fixture=interactionWad({distance:160});await page.route('**/speed.wad',r=>r.fulfill({body:fixture.wad}));await page.goto('/');
  const r=await page.evaluate(async()=>{
    const path='/src/game/bridge.ts';const {BrowserDoom}=await import(/* @vite-ignore */path);const game=new BrowserDoom();
    await game.start(document.createElement('canvas'),new Uint8Array(await(await fetch('/speed.wad')).arrayBuffer()),'Full-map speed fixture',3);
    const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));while((game.readObservation()?.gameTic??0)<25)await sleep(20);game.setEpoch(10);
    const before=game.readObservation()!;const tic=(await game.applyChannel('movement','advance',before,1,10,performance.now()+500,new AbortController().signal)).appliedTic;
    while(game.readObservation()!.gameTic<tic+9)await sleep(3);game.releaseControls();const after=game.readObservation()!;
    game.setEpoch(11);game.restart(3);while(game.readObservation()!.episodeId===before.episodeId)await sleep(5);await sleep(100);
    const manualBefore=game.readObservation()!;game.manual(1);
    while(game.readObservation()!.gameTic<manualBefore.gameTic+10)await sleep(3);game.releaseControls();const manualAfter=game.readObservation()!;
    game.suspend(true);return {ai:Math.hypot(after.player.x-before.player.x,after.player.y-before.player.y),manual:Math.hypot(manualAfter.player.x-manualBefore.player.x,manualAfter.player.y-manualBefore.player.y)};
  });
  expect(r.ai).toBeGreaterThan(5);expect(r.ai).toBeLessThan(r.manual*.75);
});

test('reversing existing momentum is not reported as a stationary collision',async({page})=>{
  const fixture=interactionWad({distance:160});await page.route('**/reverse.wad',r=>r.fulfill({body:fixture.wad}));await page.goto('/');
  const r=await page.evaluate(async()=>{
    const path='/src/game/bridge.ts';const {BrowserDoom}=await import(/* @vite-ignore */path);const game=new BrowserDoom();
    await game.start(document.createElement('canvas'),new Uint8Array(await(await fetch('/reverse.wad')).arrayBuffer()),'Momentum reversal fixture',3);
    const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));while((game.readObservation()?.gameTic??0)<25)await sleep(20);game.setEpoch(10);
    const start=game.readObservation()!;game.manual(2);while(game.readObservation()!.gameTic<start.gameTic+12)await sleep(3);
    const before=game.readObservation()!;const tic=(await game.applyChannel('movement','advance',before,1,10,performance.now()+500,new AbortController().signal)).appliedTic;
    while(game.readObservation()!.gameTic<tic+5)await sleep(3);const after=game.readObservation()!;
    game.suspend(true);return {start,before,after};
  });
  expect(Math.hypot(r.before.player.x-r.start.player.x,r.before.player.y-r.start.player.y)).toBeGreaterThan(20);
  const move=r.after.inputs.find((v:Observation['inputs'][number])=>v.channel==='movement')!;
  expect(move.progress).toBeLessThan(0);expect(move.endReason).toBe('running');expect(move.blockedTics).toBe(0);
});
