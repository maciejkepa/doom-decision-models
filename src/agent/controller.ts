import { CATALOG_VERSION, PARAMETERS, DecisionError, DECISION_CHANNELS, channelOptions, angleDelta, responseSchema, type DecisionChannel, type DecisionRequest, type DecisionTrace, type DecisionTransport, type Observation } from '../../shared/contracts';
import type { GameBridge } from '../game/bridge';
import { headingToPoint } from '../../shared/contracts';
import { ExplorationMemory } from './memory';
export type ControllerState='stopped'|'running'|'complete'|'dead'|'timeout'|'error'|'suspended';
type Lane={sequence:number;busy:boolean;next:number;failures:number;abort?:AbortController};
type Parameters={ttlMs:number;timeoutMs:number;maxHoldMs:number;requestIntervalMs:number;sessionMs:number};
const order:DecisionChannel[]=['view','action','movement'];
function doorForWait(o:Observation){const opening=o.interactions.filter(s=>s.kind==='door'&&s.state==='opening'&&!s.passable);return o.interactions.find(s=>s.kind==='door'&&s.id===o.lastUse?.targetId)??(opening.length===1?opening[0]:undefined);}
export class Controller {
  epoch=0;state:ControllerState='stopped';traces:DecisionTrace[]=[];message='Ready';outcome:ControllerState|null=null;
  private lanes=Object.fromEntries(DECISION_CHANNELS.map(c=>[c,{sequence:0,busy:false,next:0,failures:0}])) as Record<DecisionChannel,Lane>;
  private timer?:ReturnType<typeof setTimeout>;private started=0;private backoff=0;private waiting=0;private starts:number[]=[];private cursor=0;
  private memory=new ExplorationMemory();private active=new Map<DecisionChannel,DecisionTrace>();
  private waitingDoor?:{episodeId:string;id:number};
  private movementPriority=false;
  constructor(private game:GameBridge,private transport:DecisionTransport,private changed:()=>void=()=>{},private params:Parameters=PARAMETERS){}
  start(){
    if(this.state==='running')return;this.stop();this.state='running';this.outcome=null;this.message='AI running';
    this.started=performance.now();this.backoff=this.waiting=0;this.waitingDoor=undefined;this.movementPriority=false;this.starts=[];this.cursor=0;
    for(const channel of DECISION_CHANNELS)this.lanes[channel]={sequence:this.lanes[channel].sequence,busy:false,next:0,failures:0};
    this.schedule(0);this.changed();
  }
  stop(state:ControllerState='stopped'){
    if(['dead','complete','timeout','error'].includes(state))this.outcome=state;
    else if(state==='stopped'&&this.state==='running')this.outcome='stopped';
    if(state==='dead')this.message='Player died';
    if(state==='complete')this.message='Level complete';
    if(state==='suspended')this.message='Paused';
    this.epoch++;this.state=state;this.waitingDoor=undefined;this.movementPriority=false;for(const lane of Object.values(this.lanes))lane.abort?.abort();
    clearTimeout(this.timer);this.game.setEpoch(this.epoch);this.game.releaseControls();
    for(const trace of this.active.values())if(trace.execution?.endReason==='running')trace.execution.endReason='released';
    this.active.clear();this.changed();
  }
  observe(o:Observation){
    for(const input of o.inputs){
      const trace=this.active.get(input.channel);if(!trace?.execution||trace.request.sequence!==input.sequence)continue;
      trace.execution.executedHeading=o.player.angle;
      const target=trace.execution.requestedPoint?headingToPoint(trace.execution.requestedPoint,o.player):trace.execution.requestedHeading;
      trace.execution.executedTargetHeading=target;
      trace.execution.angularError=target===null?null:angleDelta(target,o.player.angle);
      trace.execution.endReason=input.endReason;
      if(!input.active)this.active.delete(input.channel);
    }
  }
  private schedule(delay:number){clearTimeout(this.timer);if(this.state==='running')this.timer=setTimeout(()=>void this.step(),Math.max(0,delay));}
  async step(){
    if(this.state!=='running')return;
    const now=performance.now();if(now-this.started>=this.params.sessionMs){this.message='Session time limit reached';this.stop('timeout');return;}
    if(now<this.backoff){this.schedule(this.backoff-now);return;}
    if(now<this.waiting){
      const o=this.game.readObservation();
      if(o&&(o.status==='dead'||o.status==='complete')){this.stop(o.status);return;}
      if(this.waitingDoor&&o&&o.episodeId!==this.waitingDoor.episodeId){this.stop();return;}
      if(this.waitingDoor&&o?.interactions.some(s=>s.id===this.waitingDoor!.id&&s.kind==='door'&&s.passable===true)){this.waiting=0;this.waitingDoor=undefined;this.movementPriority=true;}
      else {this.schedule(Math.min(PARAMETERS.waitPollMs,this.waiting-now));return;}
    }
    this.waitingDoor=undefined;
    this.starts=this.starts.filter(t=>now-t<1000);
    if(this.starts.length>=6){this.schedule(1001-(now-this.starts[0]));return;}
    if(this.starts.length&&now-this.starts.at(-1)!<1000/6+5){this.schedule(1000/6+5-(now-this.starts.at(-1)!));return;}
    let channel:DecisionChannel|undefined;
    if(this.movementPriority){
      const lane=this.lanes.movement;
      if(lane.busy||now<lane.next){this.schedule(lane.busy?20:lane.next-now);return;}
      channel='movement';this.cursor=0;this.movementPriority=false;
    }
    for(let i=0;!channel&&i<3;i++){const candidate=order[(this.cursor+i)%3],lane=this.lanes[candidate];if(!lane.busy&&now>=lane.next){channel=candidate;this.cursor=(this.cursor+i+1)%3;break;}}
    if(!channel){this.schedule(20);return;}
    const raw=this.game.readObservation();if(!raw){this.schedule(30);return;}
    this.observe(raw);
    if(raw.status!=='playing'){if(raw.status==='loading'){this.schedule(50);return;}this.stop(raw.status==='dead'?'dead':'complete');return;}
    const observation=this.memory.enrich(raw),epoch=this.epoch,lane=this.lanes[channel],sequence=++lane.sequence;
    const request:DecisionRequest={requestId:crypto.randomUUID(),episodeId:observation.episodeId,controllerEpoch:epoch,catalogVersion:CATALOG_VERSION,channel,sequence,observation};
    const trace:DecisionTrace={request,status:'pending'};this.traces.push(trace);if(this.traces.length>1000)this.traces.shift();
    lane.busy=true;lane.next=now+this.params.requestIntervalMs;this.starts.push(now);
    const abort=lane.abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),this.params.timeoutMs);
    const aborted=new Promise<never>((_,reject)=>abort.signal.addEventListener('abort',()=>reject(new DecisionError('Request cancelled or timed out.',504)),{once:true}));
    this.changed();this.schedule(1000/6+5);
    try{
      const response=responseSchema.parse(await Promise.race([this.transport.decide(request,abort.signal),aborted]));
      trace.response=response;trace.latencyMs=performance.now()-now;
      const current=this.game.readObservation();if(current)this.observe(current);
      if(epoch!==this.epoch||this.state!=='running'||current?.episodeId!==request.episodeId||current.status!=='playing')throw Error('Episode or controller changed.');
      if(response.requestId!==request.requestId||response.episodeId!==request.episodeId||response.controllerEpoch!==epoch||response.observationId!==observation.observationId||response.channel!==channel||response.sequence!==sequence)throw Error('Response correlation mismatch.');
      const definition=channelOptions(observation)[channel][response.choice];
      if(!definition||response.targetHeading!==definition.targetHeading||(response.targetPoint?.x??null)!==(definition.targetPoint?.x??null)||(response.targetPoint?.y??null)!==(definition.targetPoint?.y??null))throw Error('Unsupported channel option or target heading/point.');
      const deadline=observation.capturedAtMs+this.params.ttlMs;
      if(performance.now()>deadline)throw Error('Observation expired.');
      const waitDoor=channel==='action'&&response.choice==='wait'?doorForWait(observation):undefined;
      if(waitDoor&&current.interactions.some(s=>s.id===waitDoor.id&&s.kind==='door'&&s.passable===true)){this.cursor=order.indexOf('movement');throw Error('Door is already passable.');}
      const previous=this.active.get(channel);
      trace.execution=await this.game.applyChannel(channel,response.choice,observation,sequence,epoch,deadline,abort.signal);
      if(previous?.execution?.endReason==='running')previous.execution.endReason='superseded';
      trace.appliedTic=trace.execution.appliedTic;trace.ageMs=performance.now()-observation.capturedAtMs;trace.status='applied';lane.failures=0;
      if(trace.execution.endReason==='running')this.active.set(channel,trace);else this.active.delete(channel);
      if(channel==='movement')this.memory.applied(current,response.choice);
      this.message=`${channel}: ${response.choice} applied at tic ${trace.appliedTic}`;
      if(channel==='action'&&(response.choice==='wait'||response.choice==='use')){
        // Pre-activation choices must not restart movement while the model
        // observes the newly opened door/switch and decides whether to wait.
        this.epoch++;for(const other of Object.values(this.lanes))other.abort?.abort();this.game.setEpoch(this.epoch);
        for(const active of this.active.values())if(active.execution?.endReason==='running')active.execution.endReason='released';
        if(trace.execution.endReason==='running')trace.execution.endReason='released';
        this.waitingDoor=undefined;
        if(response.choice==='wait'){
          const door=doorForWait(observation);
          if(door)this.waitingDoor={episodeId:observation.episodeId,id:door.id};
        }
        const after=this.game.readObservation(),alreadyPassable=this.waitingDoor&&after?.episodeId===this.waitingDoor.episodeId&&after.interactions.some(s=>s.id===this.waitingDoor!.id&&s.passable===true);
        const pause=response.choice==='wait'&&!alreadyPassable?PARAMETERS.waitMs:0;
        if(alreadyPassable)this.movementPriority=true;
        this.waiting=performance.now()+pause;this.active.clear();this.schedule(Math.min(pause,PARAMETERS.waitPollMs));
      }
    }catch(e){
      trace.latencyMs=performance.now()-now;trace.reason=e instanceof Error?e.message:'Decision failed';trace.status=trace.response||epoch!==this.epoch?'rejected':'error';
      if(epoch===this.epoch){
        this.game.releaseChannel(channel);const prior=this.active.get(channel);if(prior?.execution)prior.execution.endReason='released';this.active.delete(channel);this.message=trace.reason;
        if(e instanceof DecisionError&&[400,401,403,404,422].includes(e.status))this.stop('error');
        else if(e instanceof DecisionError&&(e.status===429||e.status>=500)){
          lane.failures++;const delay=Math.max(e.retryAfterMs,Math.min(10000,500*2**Math.min(lane.failures-1,5)));
          if(e.status===429)this.backoff=performance.now()+delay;else lane.next=performance.now()+delay;
          if(lane.failures>=6)this.stop('error');
        }
      }
    }finally{clearTimeout(timeout);lane.busy=false;this.changed();}
  }
}
