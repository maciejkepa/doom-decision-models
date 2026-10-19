import { chromium } from '@playwright/test';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
const base=process.env.APP_URL||'http://127.0.0.1:5173';
const duration=Number(process.argv.find(v=>v.startsWith('--duration-ms='))?.slice(14)||process.env.LIVE_DURATION_MS||60000);
const ttl=Number(process.env.LIVE_TTL_MS||500);
const runId=(process.argv.find(v=>v.startsWith('--run-id='))?.slice(9)||process.env.LIVE_RUN_ID||String(ttl)).replace(/[^a-zA-Z0-9_-]/g,'_');
await mkdir('artifacts',{recursive:true});
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.getByRole('button',{name:'Launch E1M1'}).click();
  await page.getByRole('button',{name:'Start AI',exact:false}).waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('[role=status]')?.textContent?.includes('Level ready'),{},{timeout:45000});
  const settings=page.locator('details.settings').first();if(!await settings.getAttribute('open'))await settings.locator('summary').click();
  await page.getByLabel('Observation TTL (ms)').fill(String(ttl));
  await page.getByRole('button',{name:'Start AI',exact:false}).click();
  const samples=[];const start=Date.now();
  while(Date.now()-start<duration){await page.waitForTimeout(Math.min(10000,duration-(Date.now()-start)));samples.push({atMs:Date.now()-start,text:await page.getByLabel('Render performance',{exact:true}).textContent().catch(()=>null)});console.log(`Live ${Math.round((Date.now()-start)/1000)}s: ${await page.getByRole('status').textContent()}`);}
  const gameplayDurationMs=Date.now()-start;
  await page.getByRole('button',{name:'Stop AI',exact:false}).click();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export JSON',exact:true}).click();
  const file=await download;const path=`artifacts/live-${runId}.json`;await file.saveAs(path);
  // Capture after export: screenshot work must not skew the live FPS/TPS sample.
  await page.screenshot({path:`artifacts/live-${runId}.png`,fullPage:true});
  const data=JSON.parse(await readFile(path,'utf8'));const traces=data.traces;
  const latencies=traces.filter(t=>t.response).map(t=>t.latencyMs).sort((a,b)=>a-b);
  const p=x=>latencies[Math.max(0,Math.ceil(latencies.length*x)-1)]??null;
  const report={date:new Date().toISOString(),browser:browser.version(),ttlMs:ttl,durationMs:gameplayDurationMs,total:traces.length,applied:traces.filter(t=>t.status==='applied').length,rejected:traces.filter(t=>t.status==='rejected').length,errors:traces.filter(t=>t.status==='error').length,latencyP50:p(.5),latencyP95:p(.95),lastObservation:data.metadata.finalObservation?.player??traces.at(-1)?.request.observation.player,uniqueActions:[...new Set(traces.filter(t=>t.status==='applied').map(t=>t.response.choice))],pageErrors:errors,completed:traces.some(t=>t.request.observation.status==='complete')};
  report.outcome=data.metadata.outcome;report.completed=data.metadata.outcome==='complete';
  const firstEnemy=traces.find(t=>t.request.observation.objects.some(o=>o.kind==='enemy'));
  const firstFire=traces.find(t=>t.status==='applied'&&t.response.choice.includes('fire'));
  report.firstEnemyTic=firstEnemy?.request.observation.gameTic??null;
  report.firstFireTic=firstFire?.appliedTic??null;
  report.healthAtFirstFire=firstFire?.request.observation.player.health??null;
  report.actionCounts=Object.fromEntries(report.uniqueActions.map(action=>[action,traces.filter(t=>t.status==='applied'&&t.response.choice===action).length]));
  const applied=traces.filter(t=>t.status==='applied');
  report.controlCounts=Object.fromEntries(['movement','view','action'].map(channel=>[channel,Object.fromEntries([...new Set(applied.map(t=>(t.request.channel===channel?t.response.choice:t.response.controls?.[channel])).filter(Boolean))].map(choice=>[choice,applied.filter(t=>(t.request.channel===channel?t.response.choice:t.response.controls?.[channel])===choice).length]))]));
  report.visibleEnemyMovement=applied.filter(t=>t.request.channel==='movement'&&t.request.observation.objects.some(o=>o.kind==='enemy')).map(t=>({choice:t.response.choice,tic:t.appliedTic,nearestEnemy:Math.min(...t.request.observation.objects.filter(o=>o.kind==='enemy').map(o=>o.distance))}));
  report.advanceIntoVisibleEnemy=report.visibleEnemyMovement.filter(t=>t.choice==='advance').length;
  report.nativeBlockedMovements=applied.filter(t=>t.request.channel==='movement'&&t.execution?.endReason==='blocked').length;
  report.repeatedAdvanceAfterNativeBlock=applied.filter(t=>t.request.channel==='movement'&&t.response.choice==='advance'&&t.request.observation.inputs.some(i=>i.channel==='movement'&&i.endReason==='blocked')).length;
  report.evasiveFireSamples=traces.filter(t=>t.request.observation.inputs.some(i=>i.channel==='movement'&&i.active&&[2,3,4].includes(i.code))&&t.request.observation.inputs.some(i=>i.channel==='action'&&i.active&&i.code===1)).length;
  const pointErrors=traces.flatMap(t=>{
    const o=t.request.observation,view=o.inputs.find(i=>i.channel==='view'&&i.active&&i.targetPoint&&i.targetHeading!==null);
    return view&&o.inputs.some(i=>i.channel==='movement'&&i.active&&[3,4].includes(i.code))?[Math.abs((view.targetHeading-o.player.angle+540)%360-180)]:[];
  }).sort((a,b)=>a-b);
  const aimPercentile=p=>pointErrors[Math.max(0,Math.ceil(pointErrors.length*p)-1)]??null;
  report.snapshotPointDuringStrafe={samples:pointErrors.length,errorP50Degrees:aimPercentile(.5),errorP95Degrees:aimPercentile(.95),maximumErrorDegrees:pointErrors.at(-1)??null};
  report.blockedObservations=traces.filter(t=>t.request.observation.memory.stuck).length;
  report.advanceWhileBlocked=applied.filter(t=>t.request.observation.memory.stuck&&(t.request.channel==='movement'?t.response.choice:t.response.controls?.movement)==='advance').length;
  report.searchTurnsWithoutVisibleEnemies=applied.filter(t=>!t.request.observation.objects.some(o=>o.kind==='enemy')&&(t.request.channel==='view'&&t.response.choice!=='hold'||t.response.controls?.view&&t.response.controls.view!=='hold')).length;
  report.performanceSamples=samples;report.performance=data.metadata.performance??null;
  report.channels=Object.fromEntries(['movement','view','action'].map(channel=>{const rows=traces.filter(t=>t.request.channel===channel);const times=rows.filter(t=>t.response).map(t=>t.latencyMs).sort((a,b)=>a-b);const pct=p=>times[Math.max(0,Math.ceil(times.length*p)-1)]??null;return [channel,{requests:rows.length,applied:rows.filter(t=>t.status==='applied').length,rejected:rows.filter(t=>t.status==='rejected').length,latencyP50:pct(.5),latencyP95:pct(.95)}];}));
  report.expiredObservations=traces.filter(t=>t.reason?.includes('expired')).length;
  report.viewCompletions=applied.filter(t=>t.request.channel==='view'&&t.response.choice!=='hold').map(t=>({choice:t.response.choice,sequence:t.request.sequence,ageMs:t.ageMs,errorDegrees:t.execution?.angularError,endReason:t.execution?.endReason}));
  await writeFile(`artifacts/live-${runId}-report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  if(errors.length||!report.applied)process.exitCode=1;
}finally{await browser.close();}
