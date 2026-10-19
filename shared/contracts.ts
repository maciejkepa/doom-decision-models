import { z } from 'zod';
import { KEY_COLORS, keyItem } from './keys';
export const SCHEMA_VERSION = 4 as const;
export const CATALOG_VERSION = 'tactics-9';
export const PROMPT_VERSION = 'tactics-9';
export const PARAMETERS = { ttlMs: 500, timeoutMs: 1200, maxHoldMs: 650, viewHoldMs:750, advanceSpeed:14,strafeSpeed:12,waitMs:600,waitPollMs:35,requestIntervalMs: 500, requestsPerSecond:6, sessionMs: 900_000 } as const;
const finite = z.number().finite();
const id = z.string().min(1).max(128);
export const weapons = ['fist','pistol','shotgun','chaingun','rocket','plasma','bfg','chainsaw','super_shotgun'] as const;
export const weaponSchema = z.enum(weapons);
const action = (code: number, tics: number, description: string, observeAfterMs=0) => ({ code, tics, description, observeAfterMs });
export const ACTIONS = {
  advance: action(1,7,'Walk forward for 7 tics.'), retreat: action(2,7,'Walk backward for 7 tics.'),
  strafe_left: action(3,7,'Strafe left for 7 tics.'), strafe_right: action(4,7,'Strafe right for 7 tics.'),
  turn_left: action(5,4,'Turn left approximately 14 degrees.'), turn_right: action(6,4,'Turn right approximately 14 degrees.'),
  fire: action(7,7,'Fire the current weapon for 7 tics.'), advance_fire: action(8,7,'Walk forward and fire for 7 tics.'),
  strafe_left_fire: action(9,7,'Strafe left and fire for 7 tics.'), strafe_right_fire: action(10,7,'Strafe right and fire for 7 tics.'),
  use: action(11,2,'Press use in front of you: doors or switches within reach.'), release: action(12,0,'Release all inputs.'),
  turn_left_large: action(13,8,'Turn left approximately 45 degrees.'), turn_right_large: action(14,8,'Turn right approximately 45 degrees.'),
  aim_left: action(15,1,'Turn left approximately 3.5 degrees.'), aim_right: action(16,1,'Turn right approximately 3.5 degrees.'),
  wait: action(17,0,'Release inputs and let the world evolve for 600 ms before observing again.',600),
  retreat_fire: action(18,7,'Walk backward and fire simultaneously for 7 tics, keeping the same heading.'),
  turn_left_fire: action(19,7,'Turn left approximately 12 degrees and fire simultaneously for 7 tics.'),
  turn_right_fire: action(29,7,'Turn right approximately 12 degrees and fire simultaneously for 7 tics.'),
  advance_turn_left_fire: action(30,7,'Walk forward, turn left approximately 12 degrees and fire simultaneously for 7 tics.'),
  advance_turn_right_fire: action(31,7,'Walk forward, turn right approximately 12 degrees and fire simultaneously for 7 tics.'),
  retreat_turn_left_fire: action(32,7,'Walk backward, turn left approximately 12 degrees and fire simultaneously for 7 tics.'),
  retreat_turn_right_fire: action(33,7,'Walk backward, turn right approximately 12 degrees and fire simultaneously for 7 tics.'),
  ...Object.fromEntries(weapons.map((w,i) => [`equip_${w}`, action(20+i,1,`Equip your ${w}.`)])),
} as Record<string, {code:number;tics:number;description:string;observeAfterMs:number}>;
// The AI uses orthogonal channels; the legacy catalog above is retained for engine diagnostics.
export const DECISION_CHANNELS=['movement','view','action'] as const;
export type DecisionChannel=typeof DECISION_CHANNELS[number];
export const MOVEMENT_OPTIONS={
  hold:action(0,0,'Keep translation released.'),advance:action(1,7,'Cautious forward walk (56% of the previous speed), renewed for at most 650 ms.'),retreat:action(2,7,'Walk backward at full walking speed.'),
  strafe_left:action(3,7,'Controlled sideways movement left at half the previous input speed.'),strafe_right:action(4,7,'Controlled sideways movement right at half the previous input speed.'),
};
export const VIEW_OPTIONS={
  hold:action(0,0,'Keep heading unchanged.'),aim_left:action(1,1,'Rotate left 3.5 degrees.'),aim_right:action(2,1,'Rotate right 3.5 degrees.'),
  turn_left:action(3,4,'Rotate left 14 degrees.'),turn_right:action(4,4,'Rotate right 14 degrees.'),
  turn_left_large:action(5,8,'Rotate left 45 degrees.'),turn_right_large:action(6,8,'Rotate right 45 degrees.'),
};
export const ACTIVITY_OPTIONS:Record<string,ReturnType<typeof action>>={
  hold:action(0,0,'Release fire and use.'),fire:action(1,10,'Hold fire for 10 tics independently of motion and view.'),
  use:action(2,2,'Press use once.'),wait:action(3,0,'Wait up to 600 ms with movement and view released. Observe sooner when the activated door becomes passable.',600),
  ...Object.fromEntries(weapons.map((w,i)=>[`equip_${w}`,action(20+i,1,`Equip ${w}.`)])),
};
export const controlsSchema=z.object({movement:z.enum(['hold','advance','retreat','strafe_left','strafe_right']),
  view:z.enum(['hold','aim_left','aim_right','turn_left','turn_right','turn_left_large','turn_right_large']),
  action:z.string().min(1).max(40)}).strict();
export type DecisionControls=z.infer<typeof controlsSchema>;
export function availableControls(owned:string[]):Record<DecisionChannel,Record<string,ReturnType<typeof action>>>{
  return {movement:MOVEMENT_OPTIONS,view:VIEW_OPTIONS,action:Object.fromEntries(Object.entries(ACTIVITY_OPTIONS).filter(([key])=>!key.startsWith('equip_')||owned.includes(key.slice(6))))};
}
export const angleDelta=(to:number,from:number)=>((to-from+540)%360)-180;
export const normalizeHeading=(angle:number)=>((angle%360)+360)%360;
export const pointSchema=z.object({x:finite,y:finite});
export type AimPoint=z.infer<typeof pointSchema>;
export const headingToPoint=(point:AimPoint,position:AimPoint)=>normalizeHeading(Math.round(Math.atan2(point.y-position.y,point.x-position.x)*180/Math.PI*10000)/10000);
export type ControlOption=ReturnType<typeof action>&{targetHeading:number|null;targetPoint:AimPoint|null};
export function canUseSurface(s:Observation['interactions'][number]){return s.canUseNow&&s.activationAvailable&&s.keyAvailable!==false&&(s.state==='closed'||s.state==='ready');}
/** The model selects a snapshot point or scan heading. No live target positions are read. */
export function channelOptions(o:Observation):Record<DecisionChannel,Record<string,ControlOption>>{
  const base=availableControls(o.player.ownedWeapons);
  const result=Object.fromEntries(DECISION_CHANNELS.map(channel=>[channel,Object.fromEntries(Object.entries(base[channel]).map(([key,value])=>[key,{...value,targetHeading:null,targetPoint:null}]))])) as Record<DecisionChannel,Record<string,ControlOption>>;
  if(!o.interactions.some(canUseSurface))delete result.action.use;
  const offsets:Record<string,number>={aim_left:3.5,aim_right:-3.5,turn_left:14,turn_right:-14,turn_left_large:45,turn_right_large:-45};
  for(const [key,offset]of Object.entries(offsets))result.view[key].targetHeading=normalizeHeading(o.player.angle+offset);
  const point=(distance:number,bearing:number):AimPoint=>{const radians=(o.player.angle+bearing)*Math.PI/180;return {x:Math.round((o.player.x+Math.cos(radians)*distance)*1000)/1000,y:Math.round((o.player.y+Math.sin(radians)*distance)*1000)/1000};};
  for(const enemy of o.objects.filter(v=>v.kind==='enemy'))result.view[`face_enemy_${enemy.id}`]={...action(7,0,`Aim at enemy ${enemy.id}'s observed position, bearing ${enemy.bearing.toFixed(2)} degrees. Compensate own translation for up to 750 ms. Enemy movement requires a new model choice.`),targetHeading:normalizeHeading(o.player.angle+enemy.bearing),targetPoint:point(enemy.distance,enemy.bearing)};
  for(const item of o.objects.filter(v=>v.kind==='item'&&keyItem(v.type)))result.view[`face_key_${item.id}`]={...action(7,0,`Face the visible ${keyItem(item.type)!.color} ${keyItem(item.type)!.kind} key at bearing ${item.bearing.toFixed(2)} degrees to approach and pick it up. This is not a door.`),targetHeading:normalizeHeading(o.player.angle+item.bearing),targetPoint:point(item.distance,item.bearing)};
  for(const surface of o.interactions)result.view[`face_surface_${surface.id}`]={...action(7,0,`Aim at observed ${surface.kind} ${surface.id}, bearing ${surface.bearing.toFixed(2)} degrees. Compensate own translation until the view lease ends.`),targetHeading:normalizeHeading(o.player.angle+surface.bearing),targetPoint:point(surface.distance,surface.bearing)};
  const turning=o.inputs.find(v=>v.channel==='view'&&v.active&&v.targetHeading!==null);
  if(turning&&Math.abs(angleDelta(turning.targetHeading!,o.player.angle))>.5)result.view.continue_turn={...action(7,0,'Continue the selected snapshot point or absolute turn without stacking a relative rotation.'),targetHeading:turning.targetPoint?headingToPoint(turning.targetPoint,o.player):turning.targetHeading,targetPoint:turning.targetPoint??null};
  return result;
}
export function formatControls(c:DecisionControls){return DECISION_CHANNELS.map(channel=>`${channel}: ${c[channel]}`).join(' | ');}
export const eventSchema = z.object({ seq: z.number().int(), tic: z.number().int(), type: z.enum(['damage','pickup','death','exit','restart','use','applied','expired']), value: finite });
export const observationSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION), episodeId: id, observationId: id, mapId: id, gameTic: z.number().int().nonnegative(),
  status: z.enum(['playing','dead','complete','loading']), capturedAtMs:finite.nonnegative(),
  inputs:z.array(z.object({channel:z.enum(DECISION_CHANNELS),sequence:z.number().int().nonnegative(),code:z.number().int(),active:z.boolean(),appliedTic:z.number().int(),remainingMs:finite.nonnegative(),targetHeading:finite.nullable(),targetPoint:pointSchema.nullable().optional(),endReason:z.enum(['idle','running','completed','expired','released','passed','superseded','blocked']),progress:finite.optional(),blockedTics:z.number().int().nonnegative().optional()})).max(3),
  player: z.object({ health: finite, armor: finite, ammo: z.array(finite).length(4), weapon: weaponSchema,
    ownedWeapons: z.array(weaponSchema).max(9), keys: z.array(z.boolean()).length(6), x: finite, y: finite, angle: finite }),
  objects: z.array(z.object({ id: finite, kind: z.enum(['enemy','item']), type: z.string().max(32), distance: finite.nonnegative(), bearing: finite })).max(12),
  truncatedObjects: z.number().int().nonnegative(),
  rays: z.array(z.object({ bearing: finite, distance: finite.nonnegative(),bodyDistance:finite.nonnegative().optional(), interaction: z.enum(['unknown','usable']) })).max(8),
  interactions: z.array(z.object({id:z.number().int().nonnegative(),kind:z.enum(['door','switch','surface']),distance:finite.nonnegative(),bearing:finite,
    inReach:z.boolean(),canUseNow:z.boolean(),activationAvailable:z.boolean(),state:z.enum(['closed','opening','open','closing','ready','activated']),
    passable:z.boolean().nullable(),openingHeight:finite.nullable(),requiredKey:z.enum(['blue','yellow','red']).nullable(),keyAvailable:z.boolean().nullable()})).max(8),
  truncatedInteractions:z.number().int().nonnegative(),
  lastUse:z.object({tic:z.number().int(),targetId:z.number().int().nullable(),result:z.enum(['no_target','unusable','key_required','triggered','no_visible_change']),requiredKey:z.enum(['blue','yellow','red']).nullable()}).nullable(),
  events: z.array(eventSchema).max(32),
  history: z.array(z.object({ action: z.string().max(160), healthDelta: finite, ammoDelta: finite, distance: finite,angleDelta:finite })).max(6),
  memory: z.object({ visitedCells: z.number().int().nonnegative(), currentVisits: z.number().int().nonnegative(),
    recentCells: z.array(z.string().max(40)).max(12), knownPassages: z.array(z.string().max(80)).max(16), stuck: z.boolean(),
    blockedMoves:z.number().int().nonnegative(),sinceProgressTics:z.number().int().nonnegative(),turnWithoutProgress:finite,
    headingVisits:z.array(z.number().int().nonnegative()).length(8),
    knownLocks:z.array(z.object({id:z.number().int(),requiredKey:z.enum(KEY_COLORS),keyAvailable:z.boolean(),lastSeenTic:z.number().int(),distance:finite,bearing:finite,passable:z.boolean().nullable()})).max(16).optional(),
    knownKeys:z.array(z.object({id:finite,color:z.enum(KEY_COLORS),kind:z.enum(['card','skull']),lastSeenTic:z.number().int(),distance:finite,bearing:finite,visible:z.boolean()})).max(12).optional(),
    recentlySeenEnemies:z.array(z.object({id:finite,type:z.string().max(32),lastSeenTic:z.number().int(),distance:finite,bearing:finite})).max(4) }),
}).strict();
export type Observation = z.infer<typeof observationSchema>;
export const requestSchema = z.object({ requestId:id, episodeId:id, controllerEpoch:z.number().int().nonnegative(),
  channel:z.enum(DECISION_CHANNELS),sequence:z.number().int().positive(),
  catalogVersion:z.literal(CATALOG_VERSION), observation:observationSchema }).strict().refine(r=>r.episodeId===r.observation.episodeId, 'Episode mismatch');
export type DecisionRequest = z.infer<typeof requestSchema>;
export const responseSchema = z.object({
  requestId:id, episodeId:id, controllerEpoch:z.number().int().nonnegative(), observationId:id,
  channel:z.enum(DECISION_CHANNELS),sequence:z.number().int().positive(),choice:z.string().min(1).max(80),targetHeading:finite.nullable(),targetPoint:pointSchema.nullable().optional(), optionScores:z.record(z.string(),finite).nullable(), model:z.string().nullable(), modelVersion:z.string().nullable(),
  usage:z.record(z.string(),finite).nullable(), serverMs:finite.nonnegative(), promptVersion:z.literal(PROMPT_VERSION),
  diagnostics:z.object({ request:z.unknown(), response:z.unknown() }),
});
export type DecisionResponse = z.infer<typeof responseSchema>;
export interface DecisionTransport { decide(request:DecisionRequest, signal:AbortSignal):Promise<DecisionResponse> }
export interface AppliedChannel {appliedTic:number;observedHeading:number;requestedHeading:number|null;requestedPoint?:AimPoint|null;executedTargetHeading?:number|null;executedHeading:number;angularError:number|null;endReason:string}
export interface DecisionTrace { request:DecisionRequest; response?:DecisionResponse; status:'pending'|'applied'|'rejected'|'error'; reason?:string; latencyMs?:number; ageMs?:number; appliedTic?:number; execution?:AppliedChannel }
export class DecisionError extends Error {
  constructor(message:string, public status=500, public retryAfterMs=0) { super(message); }
}
