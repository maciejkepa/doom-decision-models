import {test,expect} from '@playwright/test';
import {interactionWad} from '../helpers/interaction-wad';
import type {Observation} from '../../shared/contracts';
test('precise heading executor wraps north, brakes, and never repeats an already completed delayed turn',async({page})=>{
  const fixture=interactionWad({distance:96});await page.route('**/quiet.wad',r=>r.fulfill({body:fixture.wad}));await page.goto('/');
  const result=await page.evaluate(async()=>{
    const path='/src/game/bridge.ts';const {BrowserDoom}=await import(/* @vite-ignore */path);
    const game=new BrowserDoom();await game.start(document.createElement('canvas'),new Uint8Array(await(await fetch('/quiet.wad')).arrayBuffer()),'Quiet full-map fixture',3);
    const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));while((game.readObservation()?.gameTic??0)<25)await sleep(20);game.setEpoch(10);let seq=0;
    const delta=(a:number,b:number)=>(a-b+540)%360-180;
    // Synthetic direction marker, not a hidden enemy sensor; tests the executor without inference.
    const face=async(heading:number)=>{const o=game.readObservation()!;o.objects=[{id:999,kind:'enemy',type:'TEST',distance:100,bearing:delta(heading,o.player.angle)}];await game.applyChannel('view','face_enemy_999',o,++seq,10,performance.now()+500,new AbortController().signal);await sleep(720);return game.readObservation()!;};
    for(let i=0;i<5&&Math.abs(delta(359,game.readObservation()!.player.angle))>45;i++){const angle=game.readObservation()!.player.angle;await face((angle+Math.sign(delta(359,angle))*45+360)%360);}
    const north=await face(359),crossed=await face(.25);
    const original=game.readObservation()!,start=original.player.angle;
    const first=await game.applyChannel('view','turn_left_large',original,++seq,10,performance.now()+500,new AbortController().signal);
    await sleep(680);const finished=game.readObservation()!;
    // Deliberately permit late execution here to isolate heading rebasing from scheduler TTL.
    const repeated=await game.applyChannel('view','turn_left_large',original,++seq,10,performance.now()+500,new AbortController().signal);
    await sleep(200);const afterRepeat=game.readObservation()!,perf=game.readPerformance();
    const stable1=game.readObservation()!,stable2=game.readObservation()!;
    game.suspend(true);return {north:north.player.angle,crossed:crossed.player.angle,start,finished:finished.player.angle,afterRepeat:afterRepeat.player.angle,first,repeated,perf,sameId:stable1.observationId===stable2.observationId,capturedAge:performance.now()-stable2.capturedAtMs};
  });
  expect(Math.abs((result.north-359+540)%360-180)).toBeLessThanOrEqual(.5);
  expect(Math.abs((result.crossed-.25+540)%360-180)).toBeLessThanOrEqual(.5);
  expect((result.finished-result.start+540)%360-180).toBeCloseTo(45,0);
  expect(result.repeated.endReason).toBe('passed');expect(result.afterRepeat).toBeCloseTo(result.finished,2);
  expect(result.sameId).toBe(true);expect(result.capturedAge).toBeLessThan(100);
  // Wall-clock FPS depends on host/browser load; keep the measurement without
  // making this deterministic heading regression depend on a benchmark floor.
  await test.info().attach('render-performance',{body:JSON.stringify(result.perf),contentType:'application/json'});
  expect(result.perf.tps).toBeGreaterThan(0);expect(result.perf.fps).toBeGreaterThan(0);
});
test('partial camera updates and timeout release preserve movement/fire; every lease expires',async({page})=>{
  const fixture=interactionWad({distance:96});await page.route('**/quiet.wad',r=>r.fulfill({body:fixture.wad}));await page.goto('/');
  const result=await page.evaluate(async()=>{
    const path='/src/game/bridge.ts';const {BrowserDoom}=await import(/* @vite-ignore */path);
    const game=new BrowserDoom();await game.start(document.createElement('canvas'),new Uint8Array(await(await fetch('/quiet.wad')).arrayBuffer()),'Quiet fixture',3);
    const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));while((game.readObservation()?.gameTic??0)<25)await sleep(20);game.setEpoch(10);
    const apply=(channel:'movement'|'view'|'action',choice:string,seq:number)=>game.applyChannel(channel,choice,game.readObservation()!,seq,10,performance.now()+500,new AbortController().signal);
    const before=game.readObservation()!;await Promise.all([apply('movement','retreat',1),apply('action','fire',1)]);
    await apply('view','turn_left',1);await sleep(100);const releaseTic=game.readObservation()!.gameTic;game.releaseChannel('view');while(game.readObservation()!.gameTic<=releaseTic)await sleep(4);const partial=game.readObservation()!;
    let stale=false;try{await apply('action','hold',1);}catch{stale=true;}
    await sleep(750);const expired=game.readObservation()!;game.suspend(true);return {before,partial,expired,stale};
  });
  expect(result.partial.inputs.find((i:Observation['inputs'][number])=>i.channel==='movement')?.active).toBe(true);expect(result.partial.inputs.find((i:Observation['inputs'][number])=>i.channel==='action')?.active).toBe(true);
  expect(result.partial.inputs.find((i:Observation['inputs'][number])=>i.channel==='view')?.active).toBe(false);expect(result.stale).toBe(true);
  expect(result.expired.inputs.every((i:Observation['inputs'][number])=>!i.active)).toBe(true);expect(result.expired.player.ammo[0]).toBeLessThan(result.before.player.ammo[0]);
});
test('native interaction checks stationary inputs at execution and supports use/wait/pass',async({page})=>{
  const fixture=interactionWad({distance:40});await page.route('**/door.wad',r=>r.fulfill({body:fixture.wad}));await page.goto('/');
  const result=await page.evaluate(async()=>{
    const path='/src/game/bridge.ts';const {BrowserDoom}=await import(/* @vite-ignore */path);
    const game=new BrowserDoom();await game.start(document.createElement('canvas'),new Uint8Array(await(await fetch('/door.wad')).arrayBuffer()),'Door fixture',3);
    const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));while((game.readObservation()?.gameTic??0)<25)await sleep(20);game.setEpoch(10);
    let seq=0;const apply=(channel:'movement'|'view'|'action',choice:string)=>game.applyChannel(channel,choice,game.readObservation()!,++seq,10,performance.now()+500,new AbortController().signal);
    const before=game.readObservation()!;await apply('movement','advance');let blocked=false;try{await apply('action','use');}catch{blocked=true;}
    await apply('movement','hold');await apply('view','hold');await apply('action','use');await sleep(100);const opening=game.readObservation()!;
    await apply('action','wait');await sleep(650);const waited=game.readObservation()!;
    for(let i=0;i<5&&!game.readObservation()!.interactions.some((s:{passable:boolean})=>s.passable);i++)await sleep(200);
    await apply('movement','advance');const until=performance.now()+1800;
    while(game.readObservation()!.player.y>=before.player.y-64&&performance.now()<until)await sleep(20);
    const crossed=game.readObservation()!;game.suspend(true);return {before,blocked,opening,waited,crossed};
  });
  expect(result.blocked).toBe(true);expect(result.opening.lastUse?.result).toBe('triggered');
  expect(result.waited.interactions[0].openingHeight).toBeGreaterThan(result.opening.interactions[0].openingHeight);
  expect(result.crossed.player.y).toBeLessThan(result.before.player.y-64);
});

test('an aligned snapshot-point lease permits actual door use without a needless camera wait',async({page})=>{
  const fixture=interactionWad({distance:40});await page.route('**/aligned-door.wad',r=>r.fulfill({body:fixture.wad}));await page.goto('/');
  const result=await page.evaluate(async(id)=>{
    const path='/src/game/bridge.ts';const {BrowserDoom}=await import(/* @vite-ignore */path);const game=new BrowserDoom();
    await game.start(document.createElement('canvas'),new Uint8Array(await(await fetch('/aligned-door.wad')).arrayBuffer()),'Aligned point door fixture',3);
    const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));while((game.readObservation()?.gameTic??0)<25)await sleep(20);game.setEpoch(10);
    await game.applyChannel('view',`face_surface_${id}`,game.readObservation()!,1,10,performance.now()+500,new AbortController().signal);
    const until=performance.now()+600;
    while(Math.abs(((game.readObservation()!.inputs.find((i:{channel:string})=>i.channel==='view')!.targetHeading!-game.readObservation()!.player.angle+540)%360)-180)>.5&&performance.now()<until)await sleep(5);
    const aligned=game.readObservation()!;const applied=await game.applyChannel('action','use',aligned,1,10,performance.now()+500,new AbortController().signal);
    const after=game.readObservation()!;await sleep(120);const opening=game.readObservation()!;
    let repeatedUse='';try{await game.applyChannel('action','use',aligned,2,10,performance.now()+500,new AbortController().signal);}catch(e){repeatedUse=e instanceof Error?e.message:String(e);}
    await sleep(120);const later=game.readObservation()!;game.suspend(true);return {aligned,applied,after,opening,later,repeatedUse};
  },fixture.id);
  expect(result.aligned.inputs.find((i:{channel:string})=>i.channel==='view')?.active).toBe(true);
  expect(result.applied.appliedTic).toBeGreaterThanOrEqual(result.aligned.gameTic);expect(result.after.lastUse?.result).toBe('triggered');
  expect(result.repeatedUse).toContain('no longer ready');expect(result.later.interactions[0].openingHeight).toBeGreaterThan(result.opening.interactions[0].openingHeight!);
});
