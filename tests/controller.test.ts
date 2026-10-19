import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { Controller } from '../src/agent/controller';
import type { GameBridge } from '../src/game/bridge';
import { observation } from './fixtures/observation';
import { PROMPT_VERSION, channelOptions, DecisionError, type DecisionRequest, type DecisionResponse, type DecisionChannel } from '../shared/contracts';
function response(r:DecisionRequest,choice='hold'):DecisionResponse{return {requestId:r.requestId,episodeId:r.episodeId,controllerEpoch:r.controllerEpoch,observationId:r.observation.observationId,channel:r.channel,sequence:r.sequence,choice,targetHeading:channelOptions(r.observation)[r.channel][choice]?.targetHeading??null,targetPoint:channelOptions(r.observation)[r.channel][choice]?.targetPoint??null,optionScores:null,model:'fixture',modelVersion:null,usage:null,serverMs:5,promptVersion:PROMPT_VERSION,diagnostics:{request:{},response:{}}};}
function game(){return {readObservation:vi.fn(()=>({...structuredClone(observation),capturedAtMs:performance.now()})),setEpoch:vi.fn(),releaseControls:vi.fn(),releaseChannel:vi.fn(),applyChannel:vi.fn<GameBridge['applyChannel']>(async()=>({appliedTic:10,observedHeading:0,requestedHeading:null,executedHeading:0,angularError:null,endReason:'completed'}))};}
const delayed=(r:DecisionRequest,ms:number,choice='hold')=>new Promise<DecisionResponse>(resolve=>setTimeout(()=>resolve(response(r,choice)),ms));
describe('asynchronous channel scheduler',()=>{
  beforeEach(()=>vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']}));afterEach(()=>vi.useRealTimers());
  it('runs three requests concurrently but never two for one channel',async()=>{
    const g=game(),decide=vi.fn((r:DecisionRequest)=>delayed(r,1000));const c=new Controller(g,{decide});c.start();await vi.advanceTimersByTimeAsync(990);
    expect(decide.mock.calls.map(([r])=>r.channel)).toEqual(['view','action','movement']);c.stop();
  });
  it('keeps each lane at <=2/s and total <=6/s with fresh samples',async()=>{
    const g=game(),times:{t:number;c:DecisionChannel;captured:number}[]=[];const c=new Controller(g,{decide:async r=>{times.push({t:performance.now(),c:r.channel,captured:r.observation.capturedAtMs});return response(r);}});
    c.start();await vi.advanceTimersByTimeAsync(3000);c.stop();
    for(const sample of times){expect(times.filter(t=>t.t>=sample.t&&t.t<sample.t+1000).length).toBeLessThanOrEqual(6);expect(sample.captured).toBe(sample.t);}
    for(const channel of ['movement','view','action']){const lane=times.filter(t=>t.c===channel);for(let i=1;i<lane.length;i++)expect(lane[i].t-lane[i-1].t).toBeGreaterThanOrEqual(500);}
  });
  it('executes action while the view request is pending',async()=>{
    const g=game(),c=new Controller(g,{decide:r=>delayed(r,r.channel==='view'?1000:10,r.channel==='action'?'fire':'hold')});c.start();await vi.advanceTimersByTimeAsync(250);
    expect(g.applyChannel.mock.calls[0]?.slice(0,2)).toEqual(['action','fire']);c.stop();
  });
  it('uses snapshot age rather than just HTTP duration for TTL',async()=>{
    const g=game();g.readObservation.mockImplementation(()=>({...structuredClone(observation),capturedAtMs:0}));const c=new Controller(g,{decide:r=>delayed(r,450)});
    c.start();await vi.advanceTimersByTimeAsync(650);expect(c.traces.find(t=>t.request.channel==='action')?.reason).toMatch(/expired/);c.stop();
  });
  it('rejects TTL again at execution and releases only that lane',async()=>{
    const g=game();g.applyChannel.mockRejectedValue(Error('Action expired before a game tic.'));const c=new Controller(g,{decide:r=>delayed(r,450)});
    c.start();await vi.advanceTimersByTimeAsync(480);expect(g.releaseChannel).toHaveBeenCalledWith('view');expect(c.traces[0].status).toBe('rejected');c.stop();
  });
  it('releases only a timed-out lane while other requests continue',async()=>{
    const g=game(),c=new Controller(g,{decide:r=>r.channel==='view'?new Promise(()=>{}):Promise.resolve(response(r))});c.start();const initial=g.releaseControls.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1250);expect(g.releaseChannel).toHaveBeenCalledWith('view');expect(g.releaseControls).toHaveBeenCalledTimes(initial);expect(g.applyChannel.mock.calls.length).toBeGreaterThan(2);c.stop();
  });
  it.each(['channel','sequence','observationId','episodeId'] as const)('rejects wrong %s correlation',async field=>{
    const g=game(),c=new Controller(g,{decide:async r=>({...response(r),[field]:field==='sequence'?999:field==='channel'?'movement':'wrong'})});c.start();await vi.advanceTimersByTimeAsync(20);expect(g.applyChannel).not.toHaveBeenCalled();c.stop();
  });
  it('drops old responses across stop/restart and manual/visibility epochs',async()=>{
    const g=game(),c=new Controller(g,{decide:r=>delayed(r,100)});c.start();await vi.advanceTimersByTimeAsync(10);c.stop('suspended');await vi.advanceTimersByTimeAsync(200);
    expect(g.applyChannel).not.toHaveBeenCalled();expect(c.traces[0].status).toBe('rejected');c.start();await vi.advanceTimersByTimeAsync(110);expect(g.applyChannel).toHaveBeenCalledTimes(1);c.stop();
  });
  it('accepted wait invalidates all in-flight decisions and pauses all lanes for 600ms',async()=>{
    const g=game(),decide=vi.fn((r:DecisionRequest)=>r.channel==='view'?delayed(r,400):Promise.resolve(response(r,'wait'))),c=new Controller(g,{decide});c.start();
    await vi.advanceTimersByTimeAsync(700);expect(decide).toHaveBeenCalledTimes(2);expect(c.traces[0].status).toBe('rejected');expect(c.traces[1].status).toBe('applied');
    await vi.advanceTimersByTimeAsync(100);expect(decide.mock.calls.length).toBeGreaterThan(2);c.stop();
  });
  it('429 backs off every lane and never queues old observations',async()=>{
    const g=game(),decide=vi.fn(async(r:DecisionRequest)=>{if(r.sequence===1)throw new DecisionError('quota',429,1000);return response(r);}),c=new Controller(g,{decide});c.start();
    await vi.advanceTimersByTimeAsync(900);expect(decide).toHaveBeenCalledTimes(1);await vi.advanceTimersByTimeAsync(120);expect(decide.mock.calls[1][0].observation.capturedAtMs).toBeGreaterThanOrEqual(1000);c.stop();
  });
  it('accepted use cancels pre-activation choices and immediately observes the changed world',async()=>{
    const g=game();g.readObservation.mockImplementation(()=>({...structuredClone(observation),capturedAtMs:performance.now(),interactions:[{id:55,kind:'door',distance:40,bearing:0,inReach:true,canUseNow:true,activationAvailable:true,state:'closed',passable:false,openingHeight:0,requiredKey:null,keyAvailable:null}]}));
    const c=new Controller(g,{decide:r=>r.channel==='view'?delayed(r,400):Promise.resolve(response(r,r.channel==='action'&&r.sequence===1?'use':'hold'))});
    c.start();await vi.advanceTimersByTimeAsync(600);
    const use=c.traces.find(t=>t.response?.choice==='use')!;
    expect(use.status).toBe('applied');expect(c.traces[0].status).toBe('rejected');
    expect(g.applyChannel.mock.calls.some(call=>call[0]==='view'&&call[3]===1)).toBe(false);
    expect(c.traces.some(t=>t.request.controllerEpoch>use.request.controllerEpoch&&t.request.observation.capturedAtMs<600)).toBe(true);
    c.stop();
  });
  it('records release of an aligned active point when use advances the epoch',async()=>{
    const g=game();g.readObservation.mockImplementation(()=>({...structuredClone(observation),capturedAtMs:performance.now(),interactions:[{id:55,kind:'door',distance:40,bearing:0,inReach:true,canUseNow:true,activationAvailable:true,state:'closed',passable:false,openingHeight:0,requiredKey:null,keyAvailable:null}]}));
    g.applyChannel.mockImplementation(async(channel)=>({appliedTic:10,observedHeading:0,requestedHeading:channel==='view'?0:null,requestedPoint:channel==='view'?{x:40,y:0}:null,executedHeading:0,angularError:0,endReason:channel==='view'?'running':'completed'}));
    const c=new Controller(g,{decide:async r=>response(r,r.channel==='view'?'face_surface_55':r.channel==='action'?'use':'hold')});c.start();await vi.advanceTimersByTimeAsync(300);
    expect(c.traces[0].execution?.endReason).toBe('released');expect(c.traces[1].status).toBe('applied');c.stop();
  });
  it('stops on auth errors and retains the death result after release',async()=>{
    const g=game(),c=new Controller(g,{decide:async()=>{throw new DecisionError('auth',401);}});c.start();await vi.advanceTimersByTimeAsync(20);expect(c.state).toBe('error');c.stop('dead');c.stop();expect(c.outcome).toBe('dead');
  });
  it('wakes waiting lanes on the activated door becoming passable with a fresh observation',async()=>{
    const g=game();g.readObservation.mockImplementation(()=>({...structuredClone(observation),capturedAtMs:performance.now(),interactions:[{id:55,kind:'door',distance:40,bearing:0,inReach:true,canUseNow:true,activationAvailable:true,state:'opening',passable:performance.now()>=450,openingHeight:60,requiredKey:null,keyAvailable:null}],lastUse:{tic:1,targetId:55,result:'triggered',requiredKey:null}}));
    const decide=vi.fn((r:DecisionRequest)=>r.channel==='view'?delayed(r,400):Promise.resolve(response(r,r.channel==='action'&&r.sequence===1?'wait':'hold'))),c=new Controller(g,{decide});c.start();
    await vi.advanceTimersByTimeAsync(440);expect(decide).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60);const resumed=decide.mock.calls[2][0];
    expect(resumed.channel).toBe('movement');expect(resumed.observation.capturedAtMs).toBeGreaterThanOrEqual(450);expect(resumed.observation.capturedAtMs).toBeLessThan(486);expect(resumed.controllerEpoch).toBeGreaterThan(decide.mock.calls[1][0].controllerEpoch);c.stop();
  });
  it('does not wake for an unrelated passable door',async()=>{
    const g=game();g.readObservation.mockImplementation(()=>({...structuredClone(observation),capturedAtMs:performance.now(),interactions:[55,56].map(id=>({id,kind:'door',distance:40,bearing:0,inReach:true,canUseNow:true,activationAvailable:true,state:'opening',passable:id===56,openingHeight:60,requiredKey:null,keyAvailable:null})),lastUse:{tic:1,targetId:55,result:'triggered',requiredKey:null}}));
    const decide=vi.fn((r:DecisionRequest)=>r.channel==='view'?delayed(r,400):Promise.resolve(response(r,r.channel==='action'&&r.sequence===1?'wait':'hold'))),c=new Controller(g,{decide});c.start();
    await vi.advanceTimersByTimeAsync(700);expect(decide).toHaveBeenCalledTimes(2);await vi.advanceTimersByTimeAsync(100);expect(decide.mock.calls.length).toBeGreaterThan(2);c.stop();
  });
  it('reserves the first eligible request for movement when a door clears just before its lane deadline',async()=>{
    const g=game();g.readObservation.mockImplementation(()=>({...structuredClone(observation),capturedAtMs:performance.now(),interactions:[{id:55,kind:'door',distance:40,bearing:0,inReach:true,canUseNow:true,activationAvailable:true,state:'opening',passable:performance.now()>=800,openingHeight:60,requiredKey:null,keyAvailable:null}],lastUse:{tic:1,targetId:55,result:'triggered',requiredKey:null}}));
    const decide=vi.fn((r:DecisionRequest)=>delayed(r,r.channel==='action'?250:r.channel==='movement'?500:100,r.channel==='action'&&r.sequence===1?'wait':'hold')),c=new Controller(g,{decide});c.start();
    await vi.advanceTimersByTimeAsync(830);expect(decide).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(70);const oldMovement=decide.mock.calls[2][0],resumed=decide.mock.calls[3][0];
    expect(resumed.channel).toBe('movement');expect(resumed.observation.capturedAtMs-oldMovement.observation.capturedAtMs).toBeGreaterThanOrEqual(500);expect(resumed.observation.capturedAtMs-oldMovement.observation.capturedAtMs).toBeLessThanOrEqual(535);c.stop();
  });
  it('does not add a wait when the selected door became passable during HTTP',async()=>{
    const g=game();g.readObservation.mockImplementation(()=>({...structuredClone(observation),capturedAtMs:performance.now(),interactions:[{id:55,kind:'door',distance:40,bearing:0,inReach:true,canUseNow:true,activationAvailable:true,state:'opening',passable:performance.now()>=250,openingHeight:60,requiredKey:null,keyAvailable:null}],lastUse:{tic:1,targetId:55,result:'triggered',requiredKey:null}}));
    const decide=vi.fn((r:DecisionRequest)=>r.channel==='view'?delayed(r,400):delayed(r,100,r.channel==='action'&&r.sequence===1?'wait':'hold')),c=new Controller(g,{decide});c.start();
    await vi.advanceTimersByTimeAsync(500);expect(decide.mock.calls.length).toBeGreaterThan(2);expect(c.traces.find(t=>t.response?.choice==='wait')).toMatchObject({status:'rejected',reason:'Door is already passable.'});expect(g.applyChannel.mock.calls.some(call=>call[0]==='view'&&call[3]===1)).toBe(true);c.stop();
  });
  it('rejects a target point that differs from the model-selected snapshot option',async()=>{
    const g=game();g.readObservation.mockImplementation(()=>({...structuredClone(observation),capturedAtMs:performance.now(),objects:[{id:1,kind:'enemy',type:'TEST',distance:100,bearing:0}]}));
    const c=new Controller(g,{decide:async r=>({...response(r,'face_enemy_1'),targetPoint:{x:999,y:999}})});c.start();await vi.advanceTimersByTimeAsync(50);
    expect(g.applyChannel).not.toHaveBeenCalled();expect(c.traces[0].reason).toMatch(/point/);c.stop();
  });
  it.each(['episode','death'])('invalidates a door wait on %s rather than resuming old decisions',async(change)=>{
    const g=game();g.readObservation.mockImplementation(()=>({...structuredClone(observation),episodeId:change==='episode'&&performance.now()>=450?'new-episode':observation.episodeId,status:change==='death'&&performance.now()>=450?'dead':'playing',capturedAtMs:performance.now(),interactions:[{id:55,kind:'door',distance:40,bearing:0,inReach:true,canUseNow:true,activationAvailable:true,state:'opening',passable:false,openingHeight:20,requiredKey:null,keyAvailable:null}],lastUse:{tic:1,targetId:55,result:'triggered',requiredKey:null}}));
    const decide=vi.fn((r:DecisionRequest)=>r.channel==='view'?delayed(r,400):Promise.resolve(response(r,r.channel==='action'?'wait':'hold'))),c=new Controller(g,{decide});c.start();
    await vi.advanceTimersByTimeAsync(700);expect(c.state).toBe(change==='death'?'dead':'stopped');expect(decide).toHaveBeenCalledTimes(2);c.stop();
  });
});
