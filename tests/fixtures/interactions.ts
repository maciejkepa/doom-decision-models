import { observation } from './observation';
import type { Observation } from '../../shared/contracts';
import type { TacticalCase } from './tactics';
const door=(patch:Partial<Observation['interactions'][number]>={}):Observation=>{
  const o=structuredClone(observation);o.gameTic=100;
  o.rays=[{bearing:0,distance:40,interaction:'usable'},{bearing:90,distance:256,interaction:'unknown'},{bearing:-90,distance:256,interaction:'unknown'}];
  o.interactions=[{id:55,kind:'door',distance:40,bearing:0,inReach:true,canUseNow:true,activationAvailable:true,state:'closed',passable:false,openingHeight:0,requiredKey:null,keyAvailable:null,...patch}];return o;
};
const opening=door({state:'opening',openingHeight:20});opening.lastUse={tic:96,targetId:55,result:'triggered',requiredKey:null};
const passable=door({state:'opening',openingHeight:64,passable:true});passable.rays[0].distance=256;passable.lastUse={tic:99,targetId:55,result:'triggered',requiredKey:null};
const locked=door({requiredKey:'blue',keyAvailable:false});locked.lastUse={tic:96,targetId:55,result:'key_required',requiredKey:'blue'};
const distant=door({distance:120,inReach:false,canUseNow:false});distant.rays[0].distance=120;
const switched=door({kind:'switch',state:'activated',activationAvailable:false,canUseNow:false,passable:null,openingHeight:null});switched.lastUse={tic:99,targetId:55,result:'triggered',requiredKey:null};
export const interactionCases:TacticalCase[]=[
  {name:'closed door within use ray',observation:door(),expected:{movement:['hold'],view:['hold','face_surface_55'],action:['use']}},
  {name:'door opening, not yet passable',observation:opening,expected:{movement:['hold'],view:['hold','face_surface_55'],action:['wait']}},
  {name:'door opening, already passable despite fresh activation',observation:passable,expected:{movement:['advance'],action:['hold']}},
  {name:'ready switch within use ray',observation:door({kind:'switch',state:'ready',passable:null,openingHeight:null}),expected:{movement:['hold'],view:['hold','face_surface_55'],action:['use']}},
  {name:'freshly activated switch, effect not yet observed',observation:switched,expected:{movement:['hold'],view:['hold','face_surface_55'],action:['wait']}},
  {name:'distant door beyond use range',observation:distant,expected:{movement:['advance']}},
  {name:'near surface off to left, use ray misses',observation:door({bearing:30,canUseNow:false}),expected:{view:['face_surface_55','turn_left','turn_left_large']}},
  {name:'door requires a missing key',observation:locked,expected:{action:['hold']}},
];
