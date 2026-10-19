import { observation } from './observation';
import type { Observation,DecisionChannel } from '../../shared/contracts';
export interface TacticalCase {name:string;observation:Observation;expected:Partial<Record<DecisionChannel,string[]>>}
const open=():Observation=>({...structuredClone(observation),gameTic:100,rays:[-135,-90,-45,0,45,90,135,180].map(bearing=>({bearing,distance:256,interaction:'unknown' as const}))});
const enemy=(bearing:number):Observation=>({...open(),objects:[{id:1,kind:'enemy',type:'POSS',distance:550,bearing}]});
const wall=(side:number):Observation=>{
  const o=open();o.rays=o.rays.map(r=>({...r,distance:r.bearing*side>0?256:16}));
  o.history=Array.from({length:3},()=>({action:'advance',healthDelta:0,ammoDelta:0,distance:0,angleDelta:0}));o.memory.stuck=true;o.memory.blockedMoves=3;o.memory.sinceProgressTics=90;return o;
};
export const tacticalCases:TacticalCase[]=[
  {name:'distant centered enemy, full health',observation:enemy(0),expected:{action:['fire']}},
  {name:'enemy to left',observation:enemy(30),expected:{view:['face_enemy_1','turn_left','turn_left_large']}},
  {name:'enemy to right',observation:enemy(-30),expected:{view:['face_enemy_1','turn_right','turn_right_large']}},
  {name:'fine aim left',observation:enemy(7),expected:{view:['face_enemy_1','aim_left']}},
  {name:'wall ahead, opening left',observation:wall(1),expected:{movement:['hold','strafe_left'],view:['turn_left','turn_left_large']}},
  {name:'wall ahead, opening right',observation:wall(-1),expected:{movement:['hold','strafe_right'],view:['turn_right','turn_right_large']}},
  {name:'clear corridor',observation:open(),expected:{movement:['advance']}},
];
