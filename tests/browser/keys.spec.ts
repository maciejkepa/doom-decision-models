import { test, expect } from '@playwright/test';
import { interactionWad } from '../helpers/interaction-wad';
import type { Observation } from '../../shared/contracts';

for (const scenario of [
  { name:'blue card',special:26,type:5,index:0,color:'blue',unlocks:true },
  { name:'blue skull',special:26,type:40,index:3,color:'blue',unlocks:true },
  { name:'yellow card',special:27,type:6,index:1,color:'yellow',unlocks:true },
  { name:'red skull',special:28,type:38,index:5,color:'red',unlocks:true },
  { name:'red key cannot unlock blue door',special:26,type:13,index:2,color:'blue',unlocks:false },
]) test(`visible lock and pickup: ${scenario.name}`,async({page})=>{
  const fixture=interactionWad({special:scenario.special,key:{type:scenario.type,distance:20}});
  await page.route('**/key-test.wad',r=>r.fulfill({body:fixture.wad}));await page.goto('/');
  const result=await page.evaluate(async({id,index})=>{
    const path='/src/game/bridge.ts';const {BrowserDoom}=await import(/* @vite-ignore */path);
    const contractsPath='/shared/contracts.ts';const {channelOptions}=await import(/* @vite-ignore */contractsPath);
    const game=new BrowserDoom(),canvas=document.createElement('canvas');document.body.append(canvas);
    await game.start(canvas,new Uint8Array(await(await fetch('/key-test.wad')).arrayBuffer()),'Key pickup diagnostic',3);
    const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));while((game.readObservation()?.gameTic??0)<25)await sleep(30);
    game.setEpoch(10);const before:Observation=game.readObservation()!;
    const beforeUseAllowed=Object.hasOwn(channelOptions(before).action,'use');
    const key=before.objects.find(v=>v.kind==='item'&&['BKEY','YKEY','RKEY','BSKU','YSKU','RSKU'].includes(v.type));
    if(!key)throw Error('Diagnostic key must be visible before pickup.');
    const faced=await game.applyChannel('view',`face_key_${key.id}`,before,1,10,performance.now()+500,new AbortController().signal);
    game.manual(1);const deadline=performance.now()+1200;
    while(!game.readObservation()!.player.keys[index]&&performance.now()<deadline)await sleep(15);
    game.manual(0);await sleep(100);const pickedUp:Observation=game.readObservation()!;
    let rejected=false,reason:string|null=null;
    try{await game.applyChannel('action','use',pickedUp,1,10,performance.now()+500,new AbortController().signal);}catch(error){rejected=true;reason=String(error);}
    await sleep(100);const after:Observation=game.readObservation()!;game.suspend(true);
    return {before:before.interactions.find(s=>s.id===id),beforeKeys:before.player.keys,beforeUseAllowed,keys:pickedUp.player.keys,pickedUp:pickedUp.interactions.find(s=>s.id===id),after:after.interactions.find(s=>s.id===id),lastUse:after.lastUse,rejected,reason,faced};
  },{id:fixture.id,index:scenario.index});
  expect(result.beforeKeys.some(Boolean)).toBe(false);expect(result.beforeUseAllowed).toBe(false);
  expect(result.before).toMatchObject({requiredKey:scenario.color,keyAvailable:false});
  expect(result.faced.appliedTic).toBeGreaterThan(0);expect(result.faced.requestedPoint).not.toBeNull();
  expect(result.keys[scenario.index]).toBe(true);expect(result.pickedUp?.keyAvailable).toBe(scenario.unlocks);
  expect(result.rejected,result.reason??undefined).toBe(!scenario.unlocks);
  if(scenario.unlocks){expect(result.lastUse?.result).toBe('triggered');expect(result.after?.openingHeight).toBeGreaterThan(0);}
  else{expect(result.after).toMatchObject({state:'closed',keyAvailable:false});expect(result.lastUse).toBeNull();}
});

for(const options of [{special:26,secret:true},{special:26,angleOffset:180}])test(`hidden lock is not disclosed: ${JSON.stringify(options)}`,async({page})=>{
  const fixture=interactionWad(options);await page.route('**/key-test.wad',r=>r.fulfill({body:fixture.wad}));await page.goto('/');
  const visible=await page.evaluate(async(id)=>{
    const path='/src/game/bridge.ts';const {BrowserDoom}=await import(/* @vite-ignore */path);
    const game=new BrowserDoom(),canvas=document.createElement('canvas');document.body.append(canvas);
    await game.start(canvas,new Uint8Array(await(await fetch('/key-test.wad')).arrayBuffer()),'Hidden lock diagnostic',3);
    const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));while((game.readObservation()?.gameTic??0)<25)await sleep(30);
    const result=(game.readObservation() as Observation).interactions.some(s=>s.id===id);game.suspend(true);return result;
  },fixture.id);expect(visible).toBe(false);
});
