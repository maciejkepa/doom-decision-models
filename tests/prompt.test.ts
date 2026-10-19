import { expect,it } from 'vitest';
import { modelState } from '../decision-core/prompt';
import { buildBody } from '../decision-core';
import { request,observation } from './fixtures/observation';
import {channelOptions} from '../shared/contracts';
import { keyCases } from './fixtures/keys';
it('preserves both bearing signs and named clearances without selecting an action',()=>{
  const o=structuredClone(observation);
  o.objects=[{id:1,kind:'enemy',type:'POSS',bearing:-30,distance:550},{id:2,kind:'item',type:'BON1',bearing:12,distance:20}];
  o.rays=[{bearing:-90,distance:16,interaction:'unknown'}];
  const state=modelState(o);
  expect(state.visibleEnemies).toEqual([{id:1,type:'POSS',distanceUnits:550,bearingDegrees:-30,side:'right'}]);
  expect(state.visibleItems).toHaveLength(1);
  expect(state.navigation[0]).toEqual({direction:'right',bearingDegrees:-90,clearanceUnits:16,centerRayUnits:16,nearbyUsableSurface:false});
  expect(state).not.toHaveProperty('recommendedAction');
});
it('reports body clearance and ranged threats without selecting a substitute move',()=>{
  const o=structuredClone(observation);o.rays=[{bearing:0,distance:200,bodyDistance:10,interaction:'unknown'},{bearing:-90,distance:160,bodyDistance:144,interaction:'unknown'}];
  o.objects=[{id:1,kind:'enemy',type:'POSS',distance:95,bearing:0}];
  const state=modelState(o);expect(state.localPassages.ahead).toBe('blocked');expect(state.movementGeometry).toMatchObject({aheadUnits:10,rightUnits:144,forwardBlocked:true});
  expect(state.combatFacts).toMatchObject({loadedRangedWeapon:true,nearestVisibleEnemyDistance:95});expect(state).not.toHaveProperty('recommendedAction');
});
it('offers continuation of the existing absolute heading and reports its remaining angle',()=>{
  const o=structuredClone(observation);o.inputs=[{channel:'view',sequence:2,code:5,active:true,appliedTic:1,remainingMs:600,targetHeading:45,endReason:'running'}];
  expect(channelOptions(o).view.continue_turn.targetHeading).toBe(45);expect(modelState(o).searchFacts).toMatchObject({turnInProgress:true,remainingTurnDegrees:45});
  expect(buildBody({...request,channel:'view',observation:o},'deployment').questions.view.criteria).toHaveProperty('continue_turn');
  o.inputs[0].active=false;expect(channelOptions(o).view).not.toHaveProperty('continue_turn');
});
it('uses current weapon ammunition and excludes old or irrelevant engine events',()=>{
  const o=structuredClone(observation);o.gameTic=100;o.player.weapon='shotgun';o.player.ammo=[50,0,0,0];
  o.events=[{seq:1,tic:1,type:'damage',value:10},{seq:2,tic:99,type:'applied',value:1},{seq:3,tic:99,type:'damage',value:3}];
  const state=modelState(o);expect(state.player.weaponAmmo).toBe(0);expect(state.recentEvents).toEqual([o.events[2]]);
});
it('keeps valid movement and aiming options available regardless of tactical situation',()=>{
  const r=structuredClone(request);r.observation.memory.stuck=true;
  r.observation.objects=[{id:1,kind:'enemy',type:'POSS',bearing:5,distance:500}];
  const questions={...buildBody({...r,channel:'movement'},'deployment').questions,...buildBody({...r,channel:'view'},'deployment').questions,...buildBody({...r,channel:'action'},'deployment').questions};
  expect(questions.movement.criteria).toHaveProperty('advance');expect(questions.action.criteria).toHaveProperty('fire');
  for(const key of ['aim_left','aim_right','turn_left_large','turn_right_large'])expect(questions.view.criteria).toHaveProperty(key);
  expect(questions.action.criteria).not.toHaveProperty('equip_bfg');
});
it('preserves use alignment, observed motion, passability and key feedback without assuming activation',()=>{
  const o=structuredClone(observation);o.gameTic=100;
  o.interactions=[{id:55,kind:'door',distance:40,bearing:30,inReach:true,canUseNow:false,activationAvailable:true,state:'opening',passable:false,openingHeight:20,requiredKey:null,keyAvailable:null}];
  o.lastUse={tic:65,targetId:55,result:'key_required',requiredKey:'blue'};
  const state=modelState(o);expect(state.interactionSurfaces[0]).toMatchObject({canUseNow:false,state:'opening',passable:false});
  expect(state.lastUse).toMatchObject({result:'key_required',ageMs:1000,requiredKey:'blue'});
});
it('keeps a selected snapshot point fixed while own movement changes its required heading',()=>{
  const o=structuredClone(observation);o.player.x=100;o.player.y=200;o.player.angle=90;o.objects=[{id:1,kind:'enemy',type:'TEST',distance:100,bearing:0}];
  const selected=channelOptions(o).view.face_enemy_1;expect(selected.targetPoint).toEqual({x:100,y:300});
  o.player.x=150;o.inputs=[{channel:'view',sequence:1,code:7,active:true,appliedTic:1,remainingMs:600,targetHeading:116.5651,targetPoint:selected.targetPoint,endReason:'running'}];
  const continued=channelOptions(o).view.continue_turn;expect(continued.targetPoint).toEqual(selected.targetPoint);expect(continued.targetHeading).toBeCloseTo(116.5651,3);expect(selected.targetHeading).toBe(90);
});
it('allows immediate passage through an opening door without fresh-activation waiting',()=>{
  const o=structuredClone(observation);o.gameTic=100;o.lastUse={tic:99,targetId:55,result:'triggered',requiredKey:null};
  o.interactions=[{id:55,kind:'door',distance:40,bearing:0,inReach:true,canUseNow:true,activationAvailable:true,state:'opening',passable:true,openingHeight:60,requiredKey:null,keyAvailable:null}];
  expect(modelState(o).interactionFacts).toMatchObject({freshActivation:false,passableDoors:[55],openingImpassable:[]});
  o.interactions[0].passable=false;expect(modelState(o).interactionFacts.freshActivation).toBe(true);
  o.interactions[0].passable=true;o.interactions[0].kind='switch';expect(modelState(o).interactionFacts.freshActivation).toBe(true);
});
it('only offers use for a ready, reachable surface and cannot toggle an opening door again',()=>{
  const o=structuredClone(observation);o.interactions=[{id:55,kind:'door',distance:40,bearing:0,inReach:true,canUseNow:true,activationAvailable:true,state:'closed',passable:false,openingHeight:0,requiredKey:null,keyAvailable:null}];
  expect(channelOptions(o).action).toHaveProperty('use');
  for(const state of ['opening','open','closing'] as const){o.interactions[0].state=state;expect(channelOptions(o).action).not.toHaveProperty('use');expect(buildBody({...request,observation:o},'deployment').questions.action.criteria).not.toHaveProperty('use');}
  o.interactions[0].state='closed';o.interactions[0].keyAvailable=false;expect(channelOptions(o).action).not.toHaveProperty('use');
});
it('explains a missing colored key before use and never treats the lock as a timed mechanism',()=>{
  const o=keyCases[0].observation,state=modelState(o);
  expect(state.lastUse).toBeNull();expect(state.keyFacts).toMatchObject({inventory:{blue:false,yellow:false,red:false},missingColors:['blue'],missingKeyDoorAhead:true,visibleKeys:[],lastSeenKeys:[]});
  expect(state.interactionFacts).toMatchObject({useReady:false,doorImpassable:false,freshActivation:false});
  expect(channelOptions(o).action).not.toHaveProperty('use');
  expect(buildBody({...request,channel:'view',observation:o},'test').questions.view.criteria.face_surface_55).toContain('missing blue key');
});
it('names a visible matching key and offers an exact snapshot heading without exposing unseen key targets',()=>{
  const o=keyCases[3].observation,state=modelState(o);
  expect(state.visibleItems[0].key).toEqual({color:'blue',kind:'card'});expect(state.keyFacts.visibleKeys[0]).toMatchObject({id:9,color:'blue',needed:true,bearingDegrees:35});
  expect(channelOptions(o).view.face_key_9.targetHeading).toBe(35);expect(channelOptions(o).view.face_key_9.targetPoint).not.toBeNull();
  const remembered=keyCases[5].observation;expect(channelOptions(remembered).view).not.toHaveProperty('face_key_9');expect(modelState(remembered).keyFacts.lastSeenKeys[0]).toMatchObject({visible:false,bearing:-90,needed:true});
});
it('accepts a matching skull and removes the missing-key goal after acquisition',()=>{
  const state=modelState(keyCases[6].observation);
  expect(state.keyFacts.inventory.blue).toBe(true);expect(state.keyFacts.missingColors).toEqual([]);expect(state.interactionFacts.useReady).toBe(true);
  expect(channelOptions(keyCases[6].observation).action).toHaveProperty('use');
});
