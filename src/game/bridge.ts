import { ACTIONS, availableControls, channelOptions, canUseSurface, angleDelta, headingToPoint, DECISION_CHANNELS, observationSchema, type AppliedChannel, type DecisionChannel, type DecisionControls, type Observation } from '../../shared/contracts';
export interface GameBridge {
  readObservation():Observation|null;
  setEpoch(epoch:number):void;
  releaseControls():void;
  releaseChannel(channel:DecisionChannel):void;
  applyChannel(channel:DecisionChannel,choice:string,observation:Observation,sequence:number,epoch:number,deadline:number,signal:AbortSignal):Promise<AppliedChannel>;
}
interface DoomModule {
  FS:{writeFile(path:string,bytes:Uint8Array):void}; callMain(args:string[]):void; UTF8ToString(ptr:number):string;
  _db_observation():number; _db_apply(code:number,tics:number,epoch:number,deadline:number):number;
  _db_applied():number; _db_release():void; _db_epoch(epoch:number):void;
  _db_apply_channels(movement:number,movementTics:number,view:number,viewTics:number,action:number,actionTics:number,epoch:number,deadline:number):number;
  _db_channel_remaining(channel:number):number;
  _db_apply_channel(channel:number,code:number,seq:number,target:number,origin:number,epoch:number,deadline:number,pointMode:number,pointX:number,pointY:number):number;
  _db_release_channel(channel:number):void;_db_channel_applied(channel:number,seq:number):number;_db_perf(metric:number):number;
  _db_input_stat(channel:number,metric:number):number;
  _db_suspend(value:number):void; _db_manual(bits:number):void; _db_restart(skill:number,epoch:number):void; _db_audio(enabled:number):void;
}
export class BrowserDoom implements GameBridge {
  private module?:DoomModule;
  private episodeId=crypto.randomUUID();
  private epoch=0;
  private engineEpisode=0;
  private resumeAfterTic:number|null=null;
  metadata:{wadName:string;sha256:string;skill:number;engine:unknown}|null=null;
  async start(canvas:HTMLCanvasElement,wad:Uint8Array,name:string,skill:number) {
    if(this.module)throw Error('An engine is already loaded. Restart the level or reload to choose another IWAD.');
    const view=new DataView(wad.buffer,wad.byteOffset,wad.byteLength);
    if(wad.length<12||new TextDecoder().decode(wad.slice(0,4))!=='IWAD')throw Error('Select a valid IWAD file.');
    const entries=view.getInt32(4,true),offset=view.getInt32(8,true);
    if(entries<1||entries>100000||offset<12||offset+entries*16>wad.length)throw Error('Invalid IWAD directory.');
    let e1m1=false;for(let i=0;i<entries;i++){
      const at=offset+i*16,start=view.getInt32(at,true),length=view.getInt32(at+4,true);
      if(start<0||length<0||start+length>wad.length)throw Error('Invalid IWAD lump.');
      if(new TextDecoder().decode(wad.slice(at+8,at+16)).replace(/\0/g,'')==='E1M1')e1m1=true;
    }
    if(!e1m1)throw Error('This version requires a Doom episode IWAD with E1M1.');
    const base=new URL(import.meta.env.BASE_URL+'engine/',document.baseURI);
    const manifest=await (await fetch(new URL('manifest.json',base))).json();
    const url=new URL('doom.js',base).href;
    const factory=(await import(/* @vite-ignore */ url)).default;
    canvas.width=640;canvas.height=400;
    const module:DoomModule=await factory({canvas,noInitialRun:true,locateFile:(file:string)=>new URL(file,base).href,print:()=>{},printErr:(line:string)=>console.debug('[Doom]',line)});
    module.FS.writeFile('/game.wad',wad);
    module.callMain(['-iwad','/game.wad','-warp','1','1','-skill',String(skill),'-nomusic']);
    this.module=module;
    this.metadata={wadName:name,sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(wad)))).map(v=>v.toString(16).padStart(2,'0')).join(''),skill,engine:manifest};
  }
  readObservation():Observation|null {
    if(!this.module)return null;
    const raw=JSON.parse(this.module.UTF8ToString(this.module._db_observation()));
    if(!raw.player)return null;
    if(this.resumeAfterTic!==null){if(raw.gameTic<=this.resumeAfterTic)return null;this.resumeAfterTic=null;}
    if(this.engineEpisode!==raw.engineEpisode){this.engineEpisode=raw.engineEpisode;this.episodeId=crypto.randomUUID();}
    delete raw.engineEpisode;
    return observationSchema.parse({...raw,episodeId:this.episodeId,observationId:`${this.engineEpisode}:${raw.gameTic}`,history:[],memory:{visitedCells:0,currentVisits:0,recentCells:[],knownPassages:[],stuck:false,blockedMoves:0,sinceProgressTics:0,turnWithoutProgress:0,headingVisits:Array(8).fill(0),recentlySeenEnemies:[]}});
  }
  setEpoch(epoch:number){this.epoch=epoch;this.module?._db_epoch(epoch);}
  releaseControls(){this.module?._db_release();}
  releaseChannel(channel:DecisionChannel){this.module?._db_release_channel(DECISION_CHANNELS.indexOf(channel));}
  readPerformance(){return {fps:this.module?._db_perf(0)??0,tps:this.module?._db_perf(1)??0,frameMs:this.module?._db_perf(2)??0,frameIntervalP95Ms:this.module?._db_perf(3)??0,renderP95Ms:this.module?._db_perf(4)??0,simulationP95Ms:this.module?._db_perf(5)??0,snapshotMs:this.module?._db_perf(6)??0,inputGaps:Object.fromEntries(DECISION_CHANNELS.map((c,i)=>[c,{leaseExpirations:this.module?._db_input_stat(i,0)??0,expiredIdleMs:this.module?._db_input_stat(i,1)??0}]))};}
  async applyChannel(channel:DecisionChannel,choice:string,observation:Observation,sequence:number,epoch:number,deadline:number,signal:AbortSignal):Promise<AppliedChannel>{
    const m=this.module,current=this.readObservation(),definition=channelOptions(observation)[channel][choice],index=DECISION_CHANNELS.indexOf(channel);
    if(!m||!current||!definition||signal.aborted||current.episodeId!==observation.episodeId)throw Error('Engine or option is unavailable.');
    if(choice.startsWith('equip_')&&!current.player.ownedWeapons.includes(choice.slice(6) as never))throw Error('Weapon unavailable.');
    if(channel==='action'&&(choice==='use'||choice==='wait')){
      if(current.inputs.some(v=>v.active&&(v.channel==='movement'||v.channel==='view'&&!(v.targetPoint&&v.targetHeading!==null&&Math.abs(angleDelta(v.targetHeading,current.player.angle))<=.5))))throw Error('Interaction requires stationary movement and view.');
      if(choice==='use'&&!current.interactions.some(canUseSurface))throw Error('Surface is no longer ready for use.');
    }
    if(!m._db_apply_channel(index,definition.code,sequence,definition.targetHeading??0,observation.player.angle,epoch,deadline,Number(definition.targetPoint!==null),definition.targetPoint?.x??0,definition.targetPoint?.y??0))throw Error('Engine rejected the channel.');
    const appliedTic=await new Promise<number>((resolve,reject)=>{
      const poll=()=>{
        if(signal.aborted||epoch!==this.epoch){reject(Error('Controller generation changed.'));return;}
        const tic=m._db_channel_applied(index,sequence);
        if(tic===-2){reject(Error('Engine rejected input at the tic boundary.'));return;}
        if(tic>=0){resolve(tic);return;}
        if(performance.now()>deadline){m._db_release_channel(index);reject(Error('Action expired before a game tic.'));return;}
        setTimeout(poll,4);
      };poll();
    });
    const after=this.readObservation()!,input=after.inputs.find(v=>v.channel===channel);
    const executedTargetHeading=definition.targetPoint?headingToPoint(definition.targetPoint,after.player):definition.targetHeading;
    return {appliedTic,observedHeading:observation.player.angle,requestedHeading:definition.targetHeading,requestedPoint:definition.targetPoint,executedTargetHeading,executedHeading:after.player.angle,angularError:executedTargetHeading===null?null:angleDelta(executedTargetHeading,after.player.angle),endReason:input?.endReason??'running'};
  }
  suspend(value:boolean){
    if(!value&&this.module){const raw=JSON.parse(this.module.UTF8ToString(this.module._db_observation()));this.resumeAfterTic=raw.gameTic??null;}
    this.module?._db_suspend(Number(value));
  }
  manual(bits:number){this.module?._db_manual(bits);}
  audio(value:boolean){this.module?._db_audio(Number(value));}
  restart(skill:number){this.module?._db_restart(skill,this.epoch);}
  readInputTics(){return DECISION_CHANNELS.map((_,i)=>this.module?._db_channel_remaining(i)??0);}
  async applyControls(controls:DecisionControls,epoch:number,deadline:number,signal:AbortSignal):Promise<number>{
    const m=this.module,o=this.readObservation();if(!m||!o||signal.aborted)throw Error('Engine is unavailable.');
    const options=availableControls(o.player.ownedWeapons);
    const [movement,view,action]=DECISION_CHANNELS.map(channel=>options[channel][controls[channel]]);
    if(!movement||!view||!action||!m._db_apply_channels(movement.code,movement.tics,view.code,view.tics,action.code,action.tics,epoch,deadline))throw Error('Engine rejected the controls.');
    return this.confirmApplied(m,epoch,deadline,signal);
  }
  async applyAction(action:string,epoch:number,deadline:number,signal:AbortSignal):Promise<number>{
    const m=this.module,definition=ACTIONS[action];
    if(!m||!definition||signal.aborted||!m._db_apply(definition.code,definition.tics,epoch,deadline))throw Error('Engine rejected the action.');
    return this.confirmApplied(m,epoch,deadline,signal);
  }
  private confirmApplied(m:DoomModule,epoch:number,deadline:number,signal:AbortSignal):Promise<number>{
    return new Promise((resolve,reject)=>{
      const poll=()=>{
        if(signal.aborted||epoch!==this.epoch){reject(Error('Controller generation changed.'));return;}
        const tic=m._db_applied();
        if(tic>=0){resolve(tic);return;}
        if(performance.now()>deadline){m._db_release();reject(Error('Action expired before a game tic.'));return;}
        setTimeout(poll,4);
      };poll();
    });
  }
}
