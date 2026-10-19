import { observation } from './observation';
import type { TacticalCase } from './tactics';
import { KEY_COLORS } from '../../shared/keys';

const locked=()=>{
  const o=structuredClone(observation);o.gameTic=100;
  o.rays=[{bearing:0,distance:40,bodyDistance:24,interaction:'usable' as const},{bearing:90,distance:256,bodyDistance:240,interaction:'unknown' as const},{bearing:-90,distance:256,bodyDistance:240,interaction:'unknown' as const},{bearing:180,distance:256,bodyDistance:240,interaction:'unknown' as const}];
  o.interactions=[{id:55,kind:'door',distance:40,bearing:0,inReach:true,canUseNow:true,activationAvailable:true,state:'closed',passable:false,openingHeight:0,requiredKey:'blue',keyAvailable:false}];
  return o;
};
const visible=locked();visible.objects=[{id:9,kind:'item',type:'BKEY',distance:100,bearing:35}];
const centered=locked();centered.objects=[{id:9,kind:'item',type:'BKEY',distance:70,bearing:0}];centered.interactions[0].bearing=40;centered.interactions[0].distance=120;centered.interactions[0].canUseNow=false;centered.rays[0]={bearing:0,distance:256,bodyDistance:240,interaction:'unknown'};
const remembered=locked();remembered.memory.knownKeys=[{id:9,color:'blue',kind:'card',distance:100,bearing:-90,lastSeenTic:50,visible:false}];
const skull=locked();skull.player.keys[3]=true;skull.interactions[0].keyAvailable=true;

export const keyCases:TacticalCase[]=[
  ...KEY_COLORS.map(color=>{const o=locked();o.interactions[0].requiredKey=color;return {name:`${color} lock before any use, no key location known`,observation:o,expected:{movement:['hold','retreat','strafe_left','strafe_right'],view:['turn_left_large','turn_right_large'],action:['hold']}};}),
  {name:'missing blue key visible to the left of the lock',observation:visible,expected:{movement:['hold'],view:['face_key_9'],action:['hold']}},
  {name:'needed visible key aligned in a clear passage',observation:centered,expected:{movement:['advance'],view:['hold','face_key_9'],action:['hold']}},
  {name:'matching key last seen right, currently out of sight',observation:remembered,expected:{view:['turn_right_large'],action:['hold']}},
  {name:'blue skull already satisfies the blue card lock',observation:skull,expected:{movement:['hold'],view:['hold','face_surface_55'],action:['use']}},
];
