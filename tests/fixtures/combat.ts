import {observation} from './observation';
import type {TacticalCase} from './tactics';
function threat(bearing=0){
  const o=structuredClone(observation);o.gameTic=100;o.player.health=20;
  o.objects=[{id:1,kind:'enemy',type:'POSS',distance:80,bearing}];
  o.rays=[-135,-90,-45,0,45,90,135,180].map(bearing=>({bearing,distance:bearing===180?256:24,interaction:'unknown' as const}));
  o.events=[{seq:1,tic:99,type:'damage',value:15}];
  o.history=[{action:'fire',healthDelta:-15,ammoDelta:-1,distance:0,angleDelta:0}];return o;
}
const right=threat();right.rays=right.rays.map(r=>({...r,distance:r.bearing===-90?256:24}));
const distant=threat();distant.player.health=100;distant.objects[0].distance=550;distant.events=[];distant.history=[];
export const combatCases:TacticalCase[]=[
  {name:'close centered threat, low health, clear behind',observation:threat(),expected:{movement:['retreat'],action:['fire']}},
  {name:'close centered threat, low health, only right side clear',observation:right,expected:{movement:['strafe_right'],action:['fire']}},
  {name:'close left threat, low health, clear behind',observation:threat(15),expected:{movement:['retreat'],view:['face_enemy_1','turn_left'],action:['fire']}},
  {name:'close right threat, low health, clear behind',observation:threat(-15),expected:{movement:['retreat'],view:['face_enemy_1','turn_right'],action:['fire']}},
  {name:'distant centered threat, no incoming damage',observation:distant,expected:{action:['fire']}},
];
