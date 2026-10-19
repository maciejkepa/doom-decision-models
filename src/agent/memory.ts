import {formatControls,type DecisionControls,type Observation} from '../../shared/contracts';
import { KeyMemory } from './key-memory';
export class ExplorationMemory {
  private keyMemory=new KeyMemory();
  private episode='';private cells=new Map<string,number>();private recent:string[]=[];private passages=new Set<string>();
  private lastCell='';private previous?:{observation:Observation;action:string};private history:Observation['history']=[];
  private headings=new Map<string,number[]>();private blocked=0;private progressTic=0;private turned=0;private last?:Observation;
  private enemies=new Map<number,{id:number;type:string;x:number;y:number;tic:number}>();
  private failedHeading=0;private failedIntent='';
  private lastBlockedSequence=-1;
  enrich(o:Observation):Observation {
    if(this.episode!==o.episodeId){this.episode=o.episodeId;this.cells.clear();this.recent=[];this.passages.clear();this.lastCell='';this.previous=undefined;this.history=[];this.headings.clear();this.enemies.clear();this.blocked=0;this.progressTic=o.gameTic;this.turned=0;this.last=undefined;this.lastBlockedSequence=-1;}
    const nativeMove=o.inputs.find(v=>v.channel==='movement'&&v.sequence>0&&v.progress!==undefined);
    if(nativeMove?.endReason==='blocked'&&nativeMove.sequence!==this.lastBlockedSequence){
      this.lastBlockedSequence=nativeMove.sequence;this.blocked++;this.failedHeading=o.player.angle;
    }else if(nativeMove?.active&&(nativeMove.progress??0)>=8)this.blocked=0;
    const cell=`${Math.floor(o.player.x/128)},${Math.floor(o.player.y/128)}`;
    if(cell!==this.lastCell){
      this.cells.set(cell,(this.cells.get(cell)||0)+1);
      if(this.cells.size>4096){const oldest=this.cells.keys().next().value!;this.cells.delete(oldest);this.headings.delete(oldest);}
      this.recent.push(cell);this.recent=this.recent.slice(-12);
      if(this.lastCell)this.passages.add(`${this.lastCell} -> ${cell}`);
      if(this.passages.size>256)this.passages.delete(this.passages.values().next().value!);
      this.lastCell=cell;
    }
    // Another lane can observe immediately after translation starts. Give ordinary
    // movement acceleration four tics before calling <8 units a blocked attempt.
    if(this.previous&&o.gameTic-this.previous.observation.gameTic>=4){
      const p=this.previous.observation.player;
      const dx=o.player.x-p.x,dy=o.player.y-p.y,radians=p.angle*Math.PI/180;
      const intent=this.previous.action.match(/advance|retreat|strafe_left|strafe_right/)?.[0];
      const forward=dx*Math.cos(radians)+dy*Math.sin(radians),left=-dx*Math.sin(radians)+dy*Math.cos(radians);
      const progress=intent==='advance'?forward:intent==='retreat'?-forward:intent==='strafe_left'?left:intent==='strafe_right'?-left:null;
      if(progress!==null&&!nativeMove){
        if(progress<8){
          const differentDirection=intent!==this.failedIntent||Math.abs(((p.angle-this.failedHeading+540)%360)-180)>=30;
          this.blocked=differentDirection?1:this.blocked+1;this.failedHeading=p.angle;this.failedIntent=intent!;
        }else this.blocked=0;
      }
      this.history.push({action:this.previous.action,healthDelta:o.player.health-p.health,ammoDelta:o.player.ammo.reduce((a,b)=>a+b,0)-p.ammo.reduce((a,b)=>a+b,0),distance:Math.hypot(dx,dy),angleDelta:((o.player.angle-p.angle+540)%360)-180});
      this.history=this.history.slice(-6);this.previous=undefined;
    }
    if(this.last){
      if(Math.hypot(o.player.x-this.last.player.x,o.player.y-this.last.player.y)>=8){this.progressTic=o.gameTic;this.turned=0;}
      else this.turned+=Math.abs(((o.player.angle-this.last.player.angle+540)%360)-180);
    }
    // A different facing is a new movement opportunity, not proof the old wall disappeared.
    if(this.blocked&&Math.abs(((o.player.angle-this.failedHeading+540)%360)-180)>=30)this.blocked=0;
    const visits=this.headings.get(cell)??Array<number>(8).fill(0);
    for(let i=0;i<8;i++)if(this.last?.gameTic!==o.gameTic&&Math.abs(((i*45-o.player.angle+540)%360)-180)<=40)visits[i]++;
    this.headings.set(cell,visits);this.last=o;
    const visible=new Set<number>();
    for(const enemy of o.objects.filter(v=>v.kind==='enemy')){
      visible.add(enemy.id);const a=(o.player.angle+enemy.bearing)*Math.PI/180;
      this.enemies.set(enemy.id,{id:enemy.id,type:enemy.type,x:o.player.x+Math.cos(a)*enemy.distance,y:o.player.y+Math.sin(a)*enemy.distance,tic:o.gameTic});
    }
    for(const [id,e] of this.enemies)if(o.gameTic-e.tic>175)this.enemies.delete(id);
    while(this.enemies.size>32)this.enemies.delete(this.enemies.keys().next().value!);
    const remembered=[...this.enemies.values()].filter(e=>!visible.has(e.id)).sort((a,b)=>b.tic-a.tic||a.id-b.id).slice(0,4).map(e=>({id:e.id,type:e.type,lastSeenTic:e.tic,distance:Math.hypot(e.x-o.player.x,e.y-o.player.y),bearing:((Math.atan2(e.y-o.player.y,e.x-o.player.x)*180/Math.PI-o.player.angle+540)%360)-180}));
    return {...o,history:[...this.history],memory:{visitedCells:this.cells.size,currentVisits:this.cells.get(cell)||0,recentCells:[...this.recent],knownPassages:[...this.passages].slice(-16),stuck:this.blocked>=2,
      blockedMoves:this.blocked,sinceProgressTics:Math.max(0,o.gameTic-this.progressTic),turnWithoutProgress:this.turned,headingVisits:[...visits],recentlySeenEnemies:remembered,...this.keyMemory.observe(o)}};
  }
  applied(o:Observation,action:string|DecisionControls){this.previous={observation:o,action:typeof action==='string'?action:formatControls(action)};}
}
