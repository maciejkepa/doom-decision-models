import {observation} from './observation';
import type {TacticalCase} from './tactics';
function wall(side:number){
  const o=structuredClone(observation);o.gameTic=100;o.memory.stuck=true;o.memory.blockedMoves=3;o.memory.sinceProgressTics=90;
  o.memory.headingVisits=[8,0,0,0,0,0,0,0];
  o.history=Array.from({length:3},()=>({action:'movement: advance | view: hold | action: hold',healthDelta:0,ammoDelta:0,distance:0,angleDelta:0}));
  o.rays=[-135,-90,-45,0,45,90,135,180].map(bearing=>({bearing,distance:bearing*side>0?256:16,interaction:'unknown' as const}));return o;
}
const blind=structuredClone(observation);blind.gameTic=100;blind.player.health=45;
blind.events=[{seq:1,tic:99,type:'damage',value:15}];blind.memory.recentlySeenEnemies=[{id:1,type:'POSS',lastSeenTic:80,distance:180,bearing:-100}];
blind.memory.headingVisits=[5,0,0,0,0,0,0,0];
blind.rays=[-135,-90,-45,0,45,90,135,180].map(bearing=>({bearing,distance:256,interaction:'unknown' as const}));
export const searchCases:TacticalCase[]=[
  {name:'failed advance against wall, uninspected opening left',observation:wall(1),expected:{movement:['hold','strafe_left'],view:['turn_left_large','turn_left'],action:['hold']}},
  {name:'failed advance against wall, uninspected opening right',observation:wall(-1),expected:{movement:['hold','strafe_right'],view:['turn_right_large','turn_right'],action:['hold']}},
  {name:'damage with no visible enemy, last seen target to right',observation:blind,expected:{view:['turn_right_large'],action:['hold']}},
];
