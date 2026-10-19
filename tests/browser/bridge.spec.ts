import { test,expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Independent geometry check against the distributed full E1M1, not a miniature arena.
function hiddenThings(){
  const wad=readFileSync('public/assets/freedoom1.wad'),count=wad.readInt32LE(4),directory=wad.readInt32LE(8);
  const lumps=Array.from({length:count},(_,i)=>{const at=directory+i*16;return {name:wad.toString('ascii',at+8,at+16).replace(/\0/g,''),start:wad.readInt32LE(at),size:wad.readInt32LE(at+4)};});
  const map=lumps.findIndex(l=>l.name==='E1M1');
  const lump=(name:string)=>{const l=lumps.slice(map+1,map+11).find(l=>l.name===name)!;return wad.subarray(l.start,l.start+l.size);};
  const vertices=lump('VERTEXES'),lines=lump('LINEDEFS'),things=lump('THINGS');
  const vertex=(i:number)=>({x:vertices.readInt16LE(i*4),y:vertices.readInt16LE(i*4+2)});
  const points=Array.from({length:things.length/10},(_,i)=>({x:things.readInt16LE(i*10),y:things.readInt16LE(i*10+2),angle:things.readInt16LE(i*10+4),type:things.readInt16LE(i*10+6),flags:things.readInt16LE(i*10+8)}));
  const player=points.find(p=>p.type===1)!;
  const walls=Array.from({length:lines.length/14},(_,i)=>i*14).filter(i=>lines.readUInt16LE(i+12)===65535).map(i=>[vertex(lines.readUInt16LE(i)),vertex(lines.readUInt16LE(i+2))]);
  const cross=(a:{x:number;y:number},b:{x:number;y:number},c:{x:number;y:number})=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const relevant=new Set([3001,3002,3003,3004,3005,3006,9,16,58,2011,2012,2014,2015,2018,2019,2007,2008,2010,2048,2049,2046,2001,2002,2003,2004,2005,2006]);
  return points.filter(p=>relevant.has(p.type)&&(p.flags&2)).map(p=>({...p,distance:Math.hypot(p.x-player.x,p.y-player.y),bearing:Math.atan2(p.y-player.y,p.x-player.x)*180/Math.PI-player.angle})).filter(p=>p.distance<1024&&Math.abs(p.bearing)<45&&walls.some(([a,b])=>cross(player,p,a)*cross(player,p,b)<0&&cross(a,b,player)*cross(a,b,p)<0));
}
test('native bridge enforces FOV, wall occlusion, expiry, epochs and real suspension',async({page})=>{
  await page.goto('/');
  const hidden=hiddenThings();expect(hidden.length).toBeGreaterThan(0);
  const result=await page.evaluate(async()=>{
    const path='/src/game/bridge.ts';const {BrowserDoom}=await import(/* @vite-ignore */path);
    const game=new BrowserDoom(),canvas=document.createElement('canvas');document.body.append(canvas);
    await game.start(canvas,new Uint8Array(await(await fetch('/assets/freedoom1.wad')).arrayBuffer()),'Freedoom test',3);
    const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
    // Let the normal weapon-raise animation finish before testing an actual shot.
    while((game.readObservation()?.gameTic??0)<25)await sleep(30);
    const initial=game.readObservation();game.setEpoch(10);
    const tic=await game.applyAction('fire',10,performance.now()+500,new AbortController().signal);await sleep(600);
    const afterFire=game.readObservation();await sleep(300);const afterExpiry=game.readObservation();
    let staleRejected=false;try{await game.applyAction('advance',9,performance.now()+500,new AbortController().signal);}catch{staleRejected=true;}
    let ttlRejected=false;try{await game.applyAction('advance',10,performance.now()-1,new AbortController().signal);}catch{ttlRejected=true;}
    game.manual(16);await sleep(1500);game.releaseControls();await sleep(60);const turned=game.readObservation();
    game.suspend(true);const paused=game.readObservation();await sleep(400);const pausedLater=game.readObservation();
    game.suspend(false);await sleep(150);const resumed=game.readObservation();
    game.setEpoch(11);game.restart(3);await sleep(100);const restart=game.readObservation();game.suspend(true);
    return {initial,tic,afterFire,afterExpiry,staleRejected,ttlRejected,turned,paused,pausedLater,resumed,restart};
  });
  expect(result.initial.mapId).toBe('E1M1');expect(result.initial.objects.length).toBeGreaterThan(0);
  for(const candidate of hidden)expect(result.initial.objects.some((o:{distance:number;bearing:number})=>Math.abs(o.distance-candidate.distance)<.1&&Math.abs(o.bearing-candidate.bearing)<.1)).toBe(false);
  expect(result.afterFire.player.ammo[0]).toBeLessThan(50);expect(result.afterExpiry.player.ammo[0]).toBe(result.afterFire.player.ammo[0]);
  expect(result.staleRejected).toBe(true);expect(result.ttlRejected).toBe(true);
  expect(result.turned.player.angle).toBeGreaterThan(120);
  expect(result.turned.objects.every((o:{bearing:number})=>Math.abs(o.bearing)<=45)).toBe(true);
  expect(result.turned.objects.some((o:{id:number})=>result.initial.objects.some((before:{id:number})=>before.id===o.id))).toBe(false);
  expect(result.pausedLater.gameTic).toBe(result.paused.gameTic);
  expect(result.resumed.gameTic-result.paused.gameTic).toBeLessThan(8);
  expect(result.restart.episodeId).not.toBe(result.initial.episodeId);expect(result.restart.player.ammo[0]).toBe(50);
});

test('model actions rotate the camera by their catalog angle and then expire',async({page})=>{
  await page.goto('/');
  const turns=await page.evaluate(async()=>{
    const path='/src/game/bridge.ts';const {BrowserDoom}=await import(/* @vite-ignore */path);
    const game=new BrowserDoom(),canvas=document.createElement('canvas');document.body.append(canvas);
    await game.start(canvas,new Uint8Array(await(await fetch('/assets/freedoom1.wad')).arrayBuffer()),'Freedoom rotation test',3);
    const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
    while((game.readObservation()?.gameTic??0)<25)await sleep(30);
    game.setEpoch(10);
    const turns=[];
    for(const action of ['aim_left','aim_right','turn_left','turn_right','turn_left_large','turn_right_large']){
      const before=game.readObservation()!.player.angle;
      await game.applyAction(action,10,performance.now()+500,new AbortController().signal);
      await sleep(350);const after=game.readObservation()!.player.angle;
      await sleep(100);const expired=game.readObservation()!.player.angle;
      turns.push({action,delta:(after-before+540)%360-180,drift:(expired-after+540)%360-180});
    }
    game.suspend(true);return turns;
  });
  const expected:Record<string,number>={aim_left:3.515625,aim_right:-3.515625,turn_left:14.0625,turn_right:-14.0625,turn_left_large:45,turn_right_large:-45};
  for(const turn of turns){expect(turn.delta).toBeCloseTo(expected[turn.action],1);expect(turn.drift).toBeCloseTo(0,1);}
});

test('combined actions move, turn and fire together, then release every input',async({page})=>{
  await page.goto('/');
  const results=await page.evaluate(async()=>{
    const path='/src/game/bridge.ts';const {BrowserDoom}=await import(/* @vite-ignore */path);
    const game=new BrowserDoom(),canvas=document.createElement('canvas');document.body.append(canvas);
    await game.start(canvas,new Uint8Array(await(await fetch('/assets/freedoom1.wad')).arrayBuffer()),'Freedoom combined controls test',3);
    const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
    while((game.readObservation()?.gameTic??0)<25)await sleep(30);
    game.setEpoch(10);const results=[];
    for(const action of ['advance_fire','retreat_fire','strafe_left_fire','strafe_right_fire','turn_left_fire','turn_right_fire','advance_turn_left_fire','retreat_turn_right_fire','advance_turn_right_fire','retreat_turn_left_fire']){
      const before=game.readObservation()!;
      const applied=await game.applyAction(action,10,performance.now()+500,new AbortController().signal);
      await sleep(350);const after=game.readObservation()!;
      await sleep(200);const expired=game.readObservation()!;
      const radians=before.player.angle*Math.PI/180,dx=after.player.x-before.player.x,dy=after.player.y-before.player.y;
      results.push({action,applied,forward:dx*Math.cos(radians)+dy*Math.sin(radians),left:-dx*Math.sin(radians)+dy*Math.cos(radians),
        rotation:(after.player.angle-before.player.angle+540)%360-180,ammoUsed:before.player.ammo[0]-after.player.ammo[0],
        expiredAmmo:expired.player.ammo[0]-after.player.ammo[0],expiredRotation:(expired.player.angle-after.player.angle+540)%360-180});
    }
    game.suspend(true);return results;
  });
  for(const r of results){
    expect(r.applied).toBeGreaterThan(0);expect(r.ammoUsed).toBeGreaterThan(0);
    expect(r.expiredAmmo).toBe(0);expect(r.expiredRotation).toBeCloseTo(0,1);
    if(r.action.startsWith('advance'))expect(r.forward).toBeGreaterThan(8);
    if(r.action.startsWith('retreat'))expect(r.forward).toBeLessThan(-8);
    if(r.action.startsWith('strafe_left'))expect(r.left).toBeGreaterThan(8);
    if(r.action.startsWith('strafe_right'))expect(r.left).toBeLessThan(-8);
    if(r.action.includes('turn_left'))expect(r.rotation).toBeCloseTo(12.3046875,1);
    else if(r.action.includes('turn_right'))expect(r.rotation).toBeCloseTo(-12.3046875,1);
    else expect(r.rotation).toBeCloseTo(0,1);
  }
});

test('independent movement, view and action channels expire at separate tics and reject stale epochs',async({page})=>{
  await page.goto('/');
  const r=await page.evaluate(async()=>{
    const path='/src/game/bridge.ts';const {BrowserDoom}=await import(/* @vite-ignore */path);
    const game=new BrowserDoom(),canvas=document.createElement('canvas');document.body.append(canvas);
    await game.start(canvas,new Uint8Array(await(await fetch('/assets/freedoom1.wad')).arrayBuffer()),'Freedoom independent channel test',3);
    const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));while((game.readObservation()?.gameTic??0)<25)await sleep(30);
    game.setEpoch(10);const before=game.readObservation();
    const controls={movement:'retreat' as const,view:'aim_left' as const,action:'fire'};
    const tic=await game.applyControls(controls,10,performance.now()+500,new AbortController().signal);
    const initialTics=game.readInputTics();
    let rejected=false;try{await game.applyControls({...controls,action:'equip_bfg'},10,performance.now()+500,new AbortController().signal);}catch{rejected=true;}
    while((game.readObservation()?.gameTic??0)<tic+7)await sleep(4);
    const laterTics=game.readInputTics();await sleep(350);const after=game.readObservation(),expiredTics=game.readInputTics();
    game.setEpoch(11);let stale=false;try{await game.applyControls(controls,10,performance.now()+500,new AbortController().signal);}catch{stale=true;}
    game.suspend(true);return {before,after,initialTics,laterTics,expiredTics,rejected,stale};
  });
  expect(r.initialTics[1]).toBe(0);expect(r.initialTics[0]).toBeGreaterThan(0);expect(r.initialTics[2]).toBeGreaterThan(r.initialTics[0]);
  expect(r.laterTics[0]).toBe(0);expect(r.laterTics[1]).toBe(0);expect(r.laterTics[2]).toBeGreaterThan(0);
  expect(r.expiredTics).toEqual([0,0,0]);expect(r.after.player.ammo[0]).toBeLessThan(r.before.player.ammo[0]);
  expect((r.after.player.angle-r.before.player.angle+360)%360).toBeCloseTo(3.515625,1);
  expect(r.rejected).toBe(true);expect(r.stale).toBe(true);
});
