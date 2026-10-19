import {test,expect} from '@playwright/test';
import {interactionWad} from '../helpers/interaction-wad';

test('full-map door is discovered beyond use range, opens after use, and progresses while waiting',async({page})=>{
  const fixture=interactionWad({distance:96});
  await page.route('**/interaction-test.wad',route=>route.fulfill({body:fixture.wad}));await page.goto('/');
  const result=await page.evaluate(async(id)=>{
    const path='/src/game/bridge.ts';const {BrowserDoom}=await import(/* @vite-ignore */path);
    const game=new BrowserDoom(),canvas=document.createElement('canvas');document.body.append(canvas);
    await game.start(canvas,new Uint8Array(await(await fetch('/interaction-test.wad')).arrayBuffer()),'Diagnostic spawn in full E1M1',3);
    const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));while((game.readObservation()?.gameTic??0)<25)await sleep(30);
    game.setEpoch(10);const act=(action:string)=>game.applyAction(action,10,performance.now()+500,new AbortController().signal);
    const initial=game.readObservation();await act('use');await sleep(100);const outOfRange=game.readObservation();
    await act('advance');await sleep(400);const near=game.readObservation();
    await act('use');await sleep(60);const opening=game.readObservation();
    await act('wait');await sleep(620);const waited=game.readObservation();
    for(let i=0;i<3&&!game.readObservation()?.interactions.find((s:{id:number})=>s.id===id)?.passable;i++){await act('wait');await sleep(620);}
    const open=game.readObservation();await act('advance');await sleep(450);const crossed=game.readObservation();
    game.setEpoch(11);game.restart(3);await sleep(150);const restarted=game.readObservation();game.suspend(true);
    return {initial,outOfRange,near,opening,waited,open,crossed,restarted};
  },fixture.id);
  const surface=(o:typeof result.initial)=>o.interactions.find((s:{id:number})=>s.id===fixture.id);
  expect(surface(result.initial)).toMatchObject({kind:'door',state:'closed',inReach:false,canUseNow:false});
  expect(result.outOfRange.lastUse.result).toBe('no_target');
  expect(surface(result.near)).toMatchObject({canUseNow:true,inReach:true,passable:false});
  expect(surface(result.opening)).toMatchObject({state:'opening',passable:false});
  expect(result.opening.lastUse).toMatchObject({targetId:fixture.id,result:'triggered'});
  expect(surface(result.waited).openingHeight).toBeGreaterThan(surface(result.opening).openingHeight);
  expect(result.waited.gameTic).toBeGreaterThan(result.opening.gameTic+15);
  expect(surface(result.open)).toMatchObject({passable:true});
  expect(result.crossed.player.y).toBeLessThan(result.near.player.y-40);
  expect(result.restarted.lastUse).toBeNull();expect(surface(result.restarted).state).toBe('closed');
});

for(const scenario of [
  {name:'walk-only trigger',options:{special:88},visible:false,result:'unusable'},
  {name:'secret surface',options:{secret:true},visible:false,result:null},
  {name:'locked door',options:{special:26},visible:true,result:'key_required'},
  {name:'nearby switch outside the exact use ray',options:{kind:'switch' as const,angleOffset:45},visible:true,result:'no_target'},
  {name:'visible exit switch without disclosing its function',options:{kind:'switch' as const},visible:true,result:'triggered'},
])test(`interaction sensor handles ${scenario.name}`,async({page})=>{
  const fixture=interactionWad(scenario.options);
  await page.route('**/interaction-test.wad',route=>route.fulfill({body:fixture.wad}));await page.goto('/');
  const result=await page.evaluate(async()=>{
    const path='/src/game/bridge.ts';const {BrowserDoom}=await import(/* @vite-ignore */path);
    const game=new BrowserDoom(),canvas=document.createElement('canvas');document.body.append(canvas);
    await game.start(canvas,new Uint8Array(await(await fetch('/interaction-test.wad')).arrayBuffer()),'Diagnostic interaction fixture',3);
    const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));while((game.readObservation()?.gameTic??0)<25)await sleep(30);
    const before=game.readObservation();game.setEpoch(10);await game.applyAction('use',10,performance.now()+500,new AbortController().signal);await sleep(80);
    const after=game.readObservation();game.suspend(true);return {before,after};
  });
  expect(result.before.interactions.some((s:{id:number})=>s.id===fixture.id)).toBe(scenario.visible);
  if(scenario.result)expect(result.after.lastUse.result).toBe(scenario.result);
  if(scenario.result==='key_required'){
    expect(result.before.lastUse).toBeNull();expect(result.after.lastUse.requiredKey).toBe('blue');
    expect(result.before.interactions.find((s:{id:number})=>s.id===fixture.id)).toMatchObject({requiredKey:'blue',keyAvailable:false});
    expect(result.after.interactions.find((s:{id:number})=>s.id===fixture.id)).toMatchObject({state:'closed',passable:false,requiredKey:'blue',keyAvailable:false});
  }
  if(fixture.special===11){
    expect(result.before.interactions.find((s:{id:number})=>s.id===fixture.id).kind).toBe('switch');
    if(scenario.result==='triggered')expect(result.after.status).toBe('complete');
    else expect(result.before.interactions.find((s:{id:number})=>s.id===fixture.id)).toMatchObject({inReach:true,canUseNow:false});
  }
});
