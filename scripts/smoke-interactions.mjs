// Paid diagnostic: real Decision-1 controls the full map from a test spawn facing a door.
// No scripted inputs. Keys mode adds a blue lock and a card behind the diagnostic spawn.
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {interactionWad} from '../tests/helpers/interaction-wad.ts';
const keys=process.argv.includes('--keys');
const fixture=interactionWad(keys?{distance:40,special:26,key:{type:5,distance:-80}}:{distance:40});
const output=keys?'live-keys':'live-interactions';
const browser=await chromium.launch();await mkdir('artifacts',{recursive:true});
try{
  const page=await browser.newPage();
  await page.route('**/interaction-test.wad',route=>route.fulfill({body:fixture.wad}));
  await page.goto(process.env.APP_URL||'http://127.0.0.1:5173');
  const result=await page.evaluate(async({id,spawn,keys})=>{
    const bridgePath='/src/game/bridge.ts',controllerPath='/src/agent/controller.ts',transportPath='/src/transports/local.ts';
    const {BrowserDoom}=await import(/* @vite-ignore */bridgePath);
    const {Controller}=await import(/* @vite-ignore */controllerPath);
    const {localTransport}=await import(/* @vite-ignore */transportPath);
    const game=new BrowserDoom(),canvas=document.createElement('canvas');document.querySelector('main').replaceChildren(canvas);
    await game.start(canvas,new Uint8Array(await(await fetch('/interaction-test.wad')).arrayBuffer()),'Diagnostic door spawn; full E1M1 geometry',3);
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));while((game.readObservation()?.gameTic??0)<25)await sleep(30);
    const initial=game.readObservation();const controller=new Controller(game,localTransport);controller.start();
    const started=performance.now();let crossed=false,opening=false,passable=false,openingAtMs=null,passableAtMs=null,keyAcquiredAtMs=null;
    while(performance.now()-started<15000&&controller.state==='running'){
      await sleep(50);const o=game.readObservation();if(!o)continue;
      const s=o.interactions.find(v=>v.id===id);opening ||= s?.state==='opening';passable ||= s?.passable===true;
      if(keys&&o.player.keys[0]&&keyAcquiredAtMs===null)keyAcquiredAtMs=Math.round(performance.now()-started);
      if(s?.state==='opening'&&openingAtMs===null)openingAtMs=Math.round(performance.now()-started);
      if(s?.passable===true&&passableAtMs===null)passableAtMs=Math.round(performance.now()-started);
      if(o.player.y<spawn.y-64){crossed=true;break;}
    }
    controller.stop();await sleep(50);game.suspend(true);
    const advances=controller.traces.filter(t=>t.status==='applied'&&t.request.channel==='movement'&&t.response.choice==='advance').map(t=>t.request.observation.capturedAtMs+t.ageMs-started);
    return {fixture:keys?'Full Freedoom E1M1 geometry, blue lock ahead, blue card placed 80 units behind diagnostic spawn, other things disabled':'Freedoom E1M1 geometry; diagnostic door spawn; other things disabled',initial,opening,passable,crossed,keyAcquiredAtMs,openingAtMs,passableAtMs,passableToAdvanceMs:passableAtMs===null?null:Math.round((advances.find(t=>t>=passableAtMs)??NaN)-passableAtMs),elapsedMs:Math.round(performance.now()-started),final:game.readObservation(),traces:controller.traces};
  },{id:fixture.id,spawn:fixture.spawn,keys});
  await page.screenshot({path:`artifacts/${output}.png`});
  await writeFile(`artifacts/${output}.json`,JSON.stringify({date:new Date().toISOString(),...result},null,2));
  const actions=result.traces.filter(t=>t.status==='applied').map(t=>({channel:t.request.channel,choice:t.response.choice,tic:t.appliedTic}));
  console.log(JSON.stringify({opening:result.opening,passable:result.passable,crossed:result.crossed,keyAcquiredAtMs:result.keyAcquiredAtMs,openingAtMs:result.openingAtMs,passableAtMs:result.passableAtMs,passableToAdvanceMs:result.passableToAdvanceMs,elapsedMs:result.elapsedMs,actions}));
  if(!result.crossed||!result.opening||!actions.some(a=>a.choice==='wait'))process.exitCode=1;
  if(keys&&(result.keyAcquiredAtMs===null||result.initial.player.keys.some(Boolean)||!result.initial.interactions.some(s=>s.id===fixture.id&&s.requiredKey==='blue'&&s.keyAvailable===false)))process.exitCode=1;
}finally{await browser.close();}
