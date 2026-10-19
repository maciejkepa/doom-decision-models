import { memo, useEffect, useRef, useState } from 'react';
import { BrowserDoom } from '../game/bridge';
import { Controller } from '../agent/controller';
import { InteractionStatus } from './InteractionStatus';
import { DecisionPanel } from './DecisionPanel';
import { localTransport } from '../transports/local';
import { PARAMETERS, CATALOG_VERSION, PROMPT_VERSION, type DecisionTrace, type Observation } from '../../shared/contracts';
const fabric=import.meta.env.MODE==='fabric';
function download(name:string,value:string,type='application/json'){
  const url=URL.createObjectURL(new Blob([value],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const TraceRows=memo(function TraceRows({traces,onSelect}:{traces:DecisionTrace[];onSelect:(trace:DecisionTrace)=>void}){return <tbody>{[...traces].reverse().slice(0,100).map(t=><tr key={t.request.requestId} onClick={()=>onSelect(t)} tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')onSelect(t);}}><td>{t.request.channel}</td><td>{t.request.observation.gameTic}</td><td>{t.response?.choice||'—'}</td><td><span className={'result '+t.status}>{t.status}</span></td><td>{t.latencyMs===undefined?'—':Math.round(t.latencyMs)+' ms'}</td><td>{t.appliedTic??'—'}</td></tr>)}</tbody>;});
export function App(){
  const canvas=useRef<HTMLCanvasElement>(null),game=useRef(new BrowserDoom()),controller=useRef<Controller|null>(null);
  const [loaded,setLoaded]=useState(false),[loading,setLoading]=useState(false),[wad,setWad]=useState<File|null>(null),[skill,setSkill]=useState(3);
  const [observation,setObservation]=useState<Observation|null>(null),[traces,setTraces]=useState<DecisionTrace[]>([]),[state,setState]=useState('stopped');
  const [message,setMessage]=useState('Ready'),[ready,setReady]=useState(false),[deployment,setDeployment]=useState('Decision-1');
  const [manual,setManual]=useState(false),[audio,setAudio]=useState(true),[hidden,setHidden]=useState(false),[selected,setSelected]=useState<DecisionTrace|null>(null);
  const [ttl,setTtl]=useState<number>(PARAMETERS.ttlMs),[timeout,setTimeoutMs]=useState<number>(PARAMETERS.timeoutMs);
  const manualRef=useRef(false);manualRef.current=manual;
  const current=traces.at(-1);
  const [performanceStats,setPerformanceStats]=useState({fps:0,tps:0,frameMs:0});
  const refresh=()=>{const c=controller.current;if(c){setTraces([...c.traces]);setState(c.state);setMessage(c.message);}};
  useEffect(()=>{
    let disposed=false;
    if(!fabric)fetch('api/health').then(r=>r.json()).then(h=>{if(!disposed){setReady(h.ready);setDeployment(h.deployment||'Not configured');}}).catch(()=>setMessage('Local API unavailable'));
    else import('../transports/fabric').then(m=>m.initializeFabric()).then(()=>{if(!disposed)setMessage('Sign in to Fabric to enable Decision-1.');}).catch(e=>setMessage(e.message));
    const timer=setInterval(()=>{
      try{const o=game.current.readObservation();if(o){setObservation(o);controller.current?.observe(o);setPerformanceStats(game.current.readPerformance());if(controller.current?.state==='running'&&o.status!=='playing')controller.current.stop(o.status==='dead'?'dead':o.status==='complete'?'complete':'stopped');}}catch(e){setMessage(e instanceof Error?e.message:'Invalid engine observation');controller.current?.stop('error');}
    },100);
    const visibility=()=>{setHidden(document.hidden);if(document.hidden){controller.current?.stop('suspended');game.current.suspend(true);setManual(false);}else setMessage('Paused');};
    document.addEventListener('visibilitychange',visibility);
    const keys=new Set<string>();
    const keybits:Record<string,number>={KeyW:1,ArrowUp:1,KeyS:2,ArrowDown:2,KeyA:4,KeyD:8,ArrowLeft:16,ArrowRight:32,ControlLeft:64,ControlRight:64,Space:128};
    const send=()=>game.current.manual([...keys].reduce((n,k)=>n|(keybits[k]||0),0));
    const keydown=(e:KeyboardEvent)=>{if(!manualRef.current||!keybits[e.code]||e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)return;e.preventDefault();keys.add(e.code);send();};
    const keyup=(e:KeyboardEvent)=>{keys.delete(e.code);if(manualRef.current)send();};
    const blur=()=>{keys.clear();game.current.releaseControls();};
    window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',blur);
    return()=>{disposed=true;clearInterval(timer);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',blur);controller.current?.stop();};
  },[]);
  async function startLevel(){
    setLoading(true);setMessage('Loading E1M1…');
    try{
      const bytes=wad?new Uint8Array(await wad.arrayBuffer()):new Uint8Array(await(await fetch(import.meta.env.BASE_URL+'assets/freedoom1.wad')).arrayBuffer());
      await game.current.start(canvas.current!,bytes,wad?.name||'Freedoom Phase 1 0.13.0',skill);
      game.current.audio(audio);setLoaded(true);setMessage('Level ready');
    }catch(e){setMessage(e instanceof Error?e.message:'Engine failed to load.');}finally{setLoading(false);}
  }
  async function startAI(){
    setManual(false);game.current.releaseControls();game.current.suspend(false);
    if(controller.current?.state==='running')return;
    try{
      const transport=fabric?(await import('../transports/fabric')).fabricTransport:localTransport;
      controller.current?.stop();
      const previous=controller.current;
      const c=new Controller(game.current,transport,refresh,{...PARAMETERS,ttlMs:ttl,timeoutMs:timeout});
      if(previous){c.epoch=previous.epoch;c.traces=previous.traces;}
      controller.current=c;c.start();
    }catch(e){setMessage(e instanceof Error?e.message:'Cannot start AI.');}
  }
  function stop(){controller.current?.stop();game.current.releaseControls();setManual(false);setMessage('AI stopped');}
  function restart(){controller.current?.stop();game.current.releaseControls();game.current.restart(skill);setManual(false);setMessage('E1M1 restarted');}
  function takeManual(){controller.current?.stop();game.current.releaseControls();game.current.suspend(false);setManual(!manual);setMessage(!manual?'Manual control':'Manual controls released');}
  function exportTrace(jsonl=false){
    const metadata={exportedAt:new Date().toISOString(),engine:game.current.metadata,promptVersion:PROMPT_VERSION,catalogVersion:CATALOG_VERSION,parameters:{...PARAMETERS,ttlMs:ttl,timeoutMs:timeout},transport:fabric?'fabric':'local',outcome:controller.current?.outcome||state,performance:game.current.readPerformance(),finalObservation:game.current.readObservation()};
    download(`doom-decision-trace.${jsonl?'jsonl':'json'}`,jsonl?[JSON.stringify({metadata}),...traces.map(t=>JSON.stringify(t))].join('\n'):JSON.stringify({metadata,traces},null,2));
  }
  return <div className="app">
    <header><a className="brand" href="./"><span className="brand-mark">D/1</span><span>DOOM<span className="brand-sub">DECISION LAB</span></span></a><div className="header-meta"><span className="chip">MICROSOFT FOUNDRY</span><span className={'status-dot '+(ready?'on':'')}/><span>{ready?deployment:'Foundry not ready'}</span></div></header>
    <main>{fabric&&!ready&&<button onClick={()=>import('../transports/fabric').then(m=>m.signInFabric()).then(()=>setReady(true)).catch(e=>setMessage(e.message))}>Sign in to Fabric</button>}<div className="intro"><h1>DOOM: Decision-1 on Foundry</h1><span className="mode-label">{fabric?'FABRIC':'LOCAL'}</span></div>
    <div className="workspace"><section className="game-panel"><div className="panel-title"><span><span className="live-dot"/> E1M1 <small> / {wad?.name||'FREEDOOM PHASE 1'}</small></span><span>{hidden?'SUSPENDED':manual?'MANUAL':state.toUpperCase()}</span></div>
      <div className="canvas-wrap"><canvas ref={canvas} aria-label="Doom gameplay" tabIndex={0}/>{!loaded&&<div className="welcome"><div className="crosshair">+</div><h2>E1M1</h2><p>{wad?.name||'Freedoom Phase 1'}</p><button className="primary" disabled={loading} onClick={startLevel}>{loading?'Loading level…':'Launch E1M1'}</button></div>}</div>
      <div className="telemetry"><div><span>HEALTH</span><b className={(observation?.player.health??100)<30?'danger':''}>{observation?.player.health??'—'}</b></div><div><span>ARMOR</span><b>{observation?.player.armor??'—'}</b></div><div><span>WEAPON</span><b className="small-value">{observation?.player.weapon.replaceAll('_',' ')??'—'}</b></div><div><span>AMMO</span><b className="small-value">{observation?.player.ammo.join(' / ')??'—'}</b></div><div><span>GAME TIC</span><b>{observation?.gameTic??'—'}</b></div></div>
      <div className="controls"><button className="primary" disabled={!loaded||!ready||hidden||state==='running'||observation?.status==='dead'||observation?.status==='complete'} onClick={startAI}>▶ Start AI</button><button disabled={!loaded} onClick={stop}>■ Stop AI</button><button disabled={!loaded} onClick={restart}>↻ Restart</button><button className={manual?'selected':''} disabled={!loaded||hidden} onClick={takeManual}>Manual</button><button aria-label="Toggle audio" onClick={()=>{setAudio(!audio);game.current.audio(!audio);}}>Audio {audio?'on':'off'}</button><button aria-label="Fullscreen" onClick={()=>void canvas.current?.requestFullscreen()}>⛶</button></div>
      <dl className="performance-stats" aria-label="Render performance"><div><dt>FPS</dt><dd>{performanceStats.fps.toFixed(0)}</dd></div><div><dt>TPS</dt><dd>{performanceStats.tps.toFixed(0)}</dd></div><div><dt>Render</dt><dd>{performanceStats.frameMs.toFixed(1)} ms</dd></div></dl><div className="session-message" role="status">{message}</div>
      {loaded&&<InteractionStatus observation={observation}/>}
    </section>
    <DecisionPanel traces={traces} state={state} inputs={observation?.inputs}/></div>
    <details className="settings" open={!loaded}><summary>Session settings</summary><div className="settings-grid"><label>Game data<input type="file" accept=".wad" disabled={loaded} onChange={e=>setWad(e.target.files?.[0]||null)}/></label><label>Difficulty<select value={skill} disabled={loaded} onChange={e=>setSkill(Number(e.target.value))}>{['I’m Too Young to Die','Hey, Not Too Rough','Hurt Me Plenty','Ultra-Violence','Nightmare!'].map((s,i)=><option key={s} value={i+1}>{s}</option>)}</select></label><label>Observation TTL (ms)<input type="number" min={100} max={2000} step={50} value={ttl} disabled={state==='running'} onChange={e=>setTtl(Math.min(2000,Math.max(100,Number(e.target.value))))}/></label><label>Request timeout (ms)<input type="number" min={500} max={10000} step={100} value={timeout} disabled={state==='running'} onChange={e=>setTimeoutMs(Math.min(10000,Math.max(500,Number(e.target.value))))}/></label></div></details>
    <section className="history-panel"><div className="panel-title"><span>DECISION TRACE <small> / {traces.length}</small></span><div><button onClick={()=>exportTrace(false)}>Export JSON</button><button onClick={()=>exportTrace(true)}>JSONL</button></div></div><div className="history-scroll"><table><thead><tr><th>CHANNEL</th><th>OBSERVATION TIC</th><th>PROPOSED ACTION</th><th>RESULT</th><th>LATENCY</th><th>APPLIED TIC</th></tr></thead><TraceRows traces={traces} onSelect={setSelected}/></table>{!traces.length&&<p className="empty centered">No decisions</p>}</div></section>
    <details className="settings"><summary>Engine sensors and events</summary><pre>{JSON.stringify({objects:observation?.objects,rays:observation?.rays,events:observation?.events,memory:current?.request.observation.memory},null,2)}</pre></details>
    {selected&&<div className="modal-backdrop" onClick={()=>setSelected(null)}><section className="modal" role="dialog" aria-modal="true" aria-label="Decision detail" onClick={e=>e.stopPropagation()}><div className="panel-title"><span>OBSERVATION → DECISION → EXECUTION</span><button onClick={()=>setSelected(null)}>Close</button></div><pre>{JSON.stringify(selected,null,2)}</pre></section></div>}
    </main></div>;
}
