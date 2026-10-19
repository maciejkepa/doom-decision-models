import {observation} from './observation';
import type {Observation} from '../../shared/contracts';
import type {TacticalCase} from './tactics';
const open=():Observation=>({...structuredClone(observation),gameTic:100,rays:[-135,-90,-45,0,45,90,135,180].map(bearing=>({bearing,distance:256,bodyDistance:240,interaction:'unknown' as const}))});
const distant=open();distant.objects=[{id:1,kind:'enemy',type:'POSS',distance:500,bearing:0}];
const close=open();close.player.health=56;close.objects=[{id:1,kind:'enemy',type:'POSS',distance:95,bearing:0}];
const multiple=open();multiple.player.health=80;multiple.player.weapon='shotgun';multiple.player.ownedWeapons.push('shotgun');multiple.player.ammo[1]=4;multiple.objects=[{id:1,kind:'enemy',type:'POSS',distance:256,bearing:0},{id:2,kind:'enemy',type:'TROO',distance:320,bearing:-12}];
const corner=open();corner.rays=corner.rays.map(r=>({...r,distance:r.bearing===0?200:r.distance,bodyDistance:r.bearing<=0?4:160}));
corner.inputs=[{channel:'movement',sequence:1,code:1,active:false,appliedTic:70,remainingMs:0,targetHeading:null,endReason:'blocked',progress:18,blockedTics:3}];
const blind=open();blind.player.health=50;blind.events=[{seq:1,tic:99,type:'damage',value:12}];blind.memory.recentlySeenEnemies=[{id:1,type:'POSS',distance:200,bearing:-100,lastSeenTic:80}];
const scanning=open();scanning.inputs=[{channel:'view',sequence:1,code:5,active:true,appliedTic:99,remainingMs:650,targetHeading:45,endReason:'running'}];
const tight=open();tight.rays=tight.rays.map(r=>({...r,bodyDistance:r.bearing===0?113:r.bodyDistance}));tight.memory.sinceProgressTics=800;
const approach=structuredClone(tight);approach.interactions=[{id:577,kind:'door',distance:91,bearing:35,inReach:false,canUseNow:false,activationAvailable:true,state:'closed',passable:false,openingHeight:0,requiredKey:null,keyAvailable:null}];
export const navigationCases:TacticalCase[]=[
 {name:'loaded pistol, distant visible enemy, all escape space open',observation:distant,expected:{movement:['strafe_left','strafe_right'],action:['fire']}},
 {name:'95-unit enemy with open forward ray and healthy player',observation:close,expected:{movement:['retreat'],action:['fire']}},
 {name:'loaded shotgun and several visible enemies, preserve distance',observation:multiple,expected:{movement:['strafe_left','strafe_right','retreat'],action:['fire']}},
 {name:'center ray open but player footprint blocked, left escape',observation:corner,expected:{movement:['hold','strafe_left'],view:['turn_left_large','turn_left']}},
 {name:'unseen incoming damage and last-known attacker behind right',observation:blind,expected:{movement:['hold','strafe_left','strafe_right','retreat'],view:['turn_right_large']}},
 {name:'open corridor with no threat or interaction',observation:open(),expected:{movement:['advance'],view:['hold']}},
 {name:'finish an existing search turn without translating or stacking',observation:scanning,expected:{movement:['hold'],view:['continue_turn']}},
 {name:'tight traversable corridor after quiet idling is not a blocked wall',observation:tight,expected:{movement:['advance'],view:['hold']}},
 {name:'off-axis closed door outside reach needs alignment, not indefinite waiting',observation:approach,expected:{movement:['advance','hold'],view:['face_surface_577']}},
];
