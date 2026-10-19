import { expect, it } from 'vitest';
import { ExplorationMemory } from '../src/agent/memory';
import { hasKey, keyInventory, keyItem } from '../shared/keys';
import { observation } from './fixtures/observation';

it('identifies all card/skull sprites and the engine inventory order', () => {
  for (const [sprite, color, index] of [['BKEY','blue',0],['YKEY','yellow',1],['RKEY','red',2],['BSKU','blue',3],['YSKU','yellow',4],['RSKU','red',5]] as const) {
    expect(keyItem(sprite)?.color).toBe(color);
    const keys=Array<boolean>(6).fill(false);keys[index]=true;
    expect(hasKey(keys,color)).toBe(true);expect(Object.values(keyInventory(keys)).filter(Boolean)).toHaveLength(1);
  }
  expect(keyItem('BON1')).toBeNull();
});
it('remembers only observed locks/keys after turning away, then updates them from actual inventory', () => {
  const memory=new ExplorationMemory(),o=structuredClone(observation);
  o.interactions=[{id:55,kind:'door',distance:40,bearing:0,inReach:true,canUseNow:true,activationAvailable:true,state:'closed',passable:false,openingHeight:0,requiredKey:'blue',keyAvailable:false}];
  o.objects=[{id:9,kind:'item',type:'BKEY',distance:100,bearing:90}];
  memory.enrich(o);
  const away={...structuredClone(observation),gameTic:35,player:{...o.player,angle:90}};
  let remembered=memory.enrich(away).memory;
  expect(remembered.knownLocks).toEqual([expect.objectContaining({id:55,requiredKey:'blue',keyAvailable:false,distance:40,bearing:-90,lastSeenTic:1})]);
  expect(remembered.knownKeys).toEqual([expect.objectContaining({id:9,color:'blue',visible:false,distance:100,bearing:0,lastSeenTic:1})]);
  away.player.keys=[false,false,false,true,false,false];remembered=memory.enrich({...away,gameTic:40}).memory;
  expect(remembered.knownLocks![0].keyAvailable).toBe(true);expect(remembered.knownKeys).toEqual([]);
  expect(memory.enrich({...away,episodeId:'next'}).memory.knownLocks).toEqual([]);
  memory.enrich(o);expect(memory.enrich({...o,mapId:'E1M2',objects:[],interactions:[]}).memory.knownKeys).toEqual([]);
});
it('bounds lock/key memory and does not infer unknown key locations from door color', () => {
  const memory=new ExplorationMemory(),o=structuredClone(observation);
  const surface={id:0,kind:'door' as const,distance:40,bearing:0,inReach:true,canUseNow:true,activationAvailable:true,state:'closed' as const,passable:false,openingHeight:0,requiredKey:'blue' as const,keyAvailable:false};
  for(let i=0;i<40;i++)memory.enrich({...o,gameTic:i+1,interactions:[{...surface,id:i}],objects:i<20?[{id:i,kind:'item',type:'BKEY',distance:100,bearing:0}]:[]});
  const result=memory.enrich({...o,gameTic:50});expect(result.memory.knownLocks).toHaveLength(16);expect(result.memory.knownKeys).toHaveLength(12);
  const unknown=new ExplorationMemory().enrich({...o,interactions:[surface]});expect(unknown.memory.knownKeys).toEqual([]);
});
