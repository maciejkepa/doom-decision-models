import { expect,it } from 'vitest';
import { ExplorationMemory } from '../src/agent/memory';
import { observation } from './fixtures/observation';
it('counts cell entries, describes failed movement and forgets previous episodes',()=>{
  const memory=new ExplorationMemory();let o=memory.enrich(structuredClone(observation));
  expect(memory.enrich(o).memory.currentVisits).toBe(1);
  for(let i=0;i<3;i++){memory.applied(o,'advance');o=memory.enrich({...structuredClone(observation),gameTic:o.gameTic+4});}
  expect(o.memory.stuck).toBe(true);
  o=memory.enrich({...observation,player:{...observation.player,x:200}});expect(o.memory.knownPassages).toEqual(['0,0 -> 1,0']);
  o=memory.enrich({...observation,episodeId:'next'});expect(o.history).toEqual([]);expect(o.memory.knownPassages).toEqual([]);
});
it('does not label fresh movement as blocked when another lane observes during acceleration',()=>{
  const memory=new ExplorationMemory(),initial=memory.enrich(structuredClone(observation));memory.applied(initial,'advance');
  const early=memory.enrich({...structuredClone(observation),gameTic:2,player:{...observation.player,x:1}});
  expect(early.memory.blockedMoves).toBe(0);expect(early.history).toHaveLength(0);
  const moving=memory.enrich({...structuredClone(observation),gameTic:5,player:{...observation.player,x:12}});
  expect(moving.memory.blockedMoves).toBe(0);expect(moving.history).toHaveLength(1);
});
it('detects failed forward intent despite backward knockback and retains observed headings',()=>{
  const memory=new ExplorationMemory();let o=memory.enrich(structuredClone(observation));
  for(let i=1;i<=2;i++){
    memory.applied(o,{movement:'advance',view:'hold',action:'fire'});
    o=memory.enrich({...structuredClone(observation),gameTic:i*12,player:{...observation.player,x:-i*20}});
  }
  expect(o.memory.blockedMoves).toBe(2);expect(o.memory.stuck).toBe(true);
  o=memory.enrich({...o,gameTic:36,player:{...o.player,angle:90}});
  expect(o.memory.headingVisits[2]).toBeGreaterThan(0);expect(o.memory.turnWithoutProgress).toBeGreaterThan(0);
  expect(o.memory.blockedMoves).toBe(0);expect(o.memory.stuck).toBe(false);
});
it('remembers only observed enemy locations, recomputes their bearing and expires them',()=>{
  const memory=new ExplorationMemory();
  memory.enrich({...structuredClone(observation),objects:[{id:1,kind:'enemy',type:'POSS',distance:100,bearing:0}]});
  let o=memory.enrich({...structuredClone(observation),gameTic:30,player:{...observation.player,angle:90}});
  expect(o.memory.recentlySeenEnemies[0]).toMatchObject({id:1,distance:100,bearing:-90});
  o=memory.enrich({...o,gameTic:200});expect(o.memory.recentlySeenEnemies).toEqual([]);
});
it('detects a late native collision after early progress was already consumed, once per sequence',()=>{
  const memory=new ExplorationMemory();memory.enrich(structuredClone(observation));
  const input={channel:'movement' as const,sequence:1,code:1,active:true,appliedTic:1,remainingMs:400,targetHeading:null,endReason:'running' as const,progress:10,blockedTics:0};
  const moving={...structuredClone(observation),gameTic:8,inputs:[input]};memory.applied(moving,'advance');
  memory.enrich({...moving,gameTic:12,player:{...moving.player,x:12}});
  const blocked={...moving,gameTic:20,inputs:[{...input,active:false,endReason:'blocked' as const,blockedTics:3,progress:18}]};
  expect(memory.enrich(blocked).memory.blockedMoves).toBe(1);expect(memory.enrich({...blocked,gameTic:21}).memory.blockedMoves).toBe(1);
  expect(memory.enrich({...blocked,gameTic:22,inputs:[{...input,sequence:2,progress:9}]}).memory.blockedMoves).toBe(0);
});
