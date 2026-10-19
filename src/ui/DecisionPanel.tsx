import { memo, useMemo, useEffect, useState } from 'react';
import { channelOptions, DECISION_CHANNELS, type DecisionTrace, type Observation } from '../../shared/contracts';
function percentile(values:number[],p:number){if(!values.length)return '—';const sorted=[...values].sort((a,b)=>a-b);return `${Math.round(sorted[Math.ceil(sorted.length*p)-1])} ms`;}
const label=(value:string)=>value.replaceAll('_',' ');
const names={movement:'Movement',view:'Look & search',action:'Action'};
export const DecisionPanel=memo(function DecisionPanel({traces,state,inputs=[]}:{traces:DecisionTrace[];state:string;inputs?:Observation['inputs']}){
  const [now,setNow]=useState(performance.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(performance.now()),500);return ()=>clearInterval(timer);},[]);
  const feed=useMemo(()=>Object.fromEntries(DECISION_CHANNELS.map(channel=>{
    const rows=traces.filter(t=>t.request.channel===channel);
    return [channel,{latest:rows.at(-1),answered:rows.findLast(t=>t.response),scored:rows.findLast(t=>t.response?.optionScores&&Object.keys(t.response.optionScores).length),applied:rows.findLast(t=>t.status==='applied'),latencies:rows.flatMap(t=>t.latencyMs===undefined?[]:[t.latencyMs])}];
  })),[traces]);
  const latest=traces.at(-1),scored=traces.findLast(t=>t.response?.optionScores),pending=state==='running'&&DECISION_CHANNELS.some(c=>feed[c].latest?.status==='pending');
  return <aside className="decision-panel" aria-label="Decision telemetry">
    <div className="panel-title"><span>DECISION TELEMETRY</span><span className={'request-state '+(pending?'updating':'')} data-testid="decision-status">{pending?'Updating':state==='running'?'Listening':'Idle'}</span></div>
    <div className="model-summary"><div className="eyebrow">MODEL DECISIONS</div>
      <dl className="model-choices" data-testid="model-choice">{DECISION_CHANNELS.map(channel=><div key={channel}><dt>{names[channel]}</dt><dd>{feed[channel].answered?.response?label(feed[channel].answered!.response!.choice):'—'}</dd></div>)}</dl>
      <div className="action-channels" aria-label="Simultaneous inputs">{DECISION_CHANNELS.map(channel=>{const input=inputs.find(v=>v.channel===channel);return <span key={channel}>{channel}: {input?.endReason==='blocked'?'blocked by collision':input?.active?label(feed[channel].applied?.response?.choice??'active'):'released'}</span>;})}</div>
    </div>
    <div className="scores"><div className="section-label">OPTION PROBABILITIES <span data-testid="score-snapshot">{scored?`TIC ${scored.request.observation.gameTic}`:'NO SAMPLE YET'}</span></div>
      <div className="probability-list" data-testid="probability-list">{DECISION_CHANNELS.map(channel=>{
        const lane=feed[channel],sample=lane.scored,source=sample??lane.answered;
        const options=source?channelOptions(source.request.observation)[channel]:channel==='action'?{hold:{},fire:{},use:{},wait:{}}:channel==='movement'?{hold:{},advance:{},retreat:{},strafe_left:{},strafe_right:{}}:{hold:{},aim_left:{},aim_right:{},turn_left:{},turn_right:{},turn_left_large:{},turn_right_large:{}};
        return <section className="probability-group" key={channel} aria-label={`${names[channel]} probabilities`}>
          <div className="probability-heading">{names[channel]} <span>{lane.latest?.status==='pending'?'updating':lane.latest?.status??'idle'}</span></div>
          <dl className="sample-stats"><div><dt>Tic</dt><dd>{sample?.request.observation.gameTic??'—'}</dd></div><div><dt>Age</dt><dd>{sample?`${Math.max(0,Math.round(now-sample.request.observation.capturedAtMs))} ms`:'—'}</dd></div><div><dt>p50</dt><dd>{percentile(lane.latencies,.5)}</dd></div><div><dt>p95</dt><dd>{percentile(lane.latencies,.95)}</dd></div></dl>
          {Object.keys(options).map(key=>{const score=sample?.response?.optionScores?.[key];return <div className={'score '+(sample?.response?.choice===key?'chosen':'')} key={key} data-action={`${channel}:${key}`}>
            <div><span title={label(key)}>{label(key)}</span><b data-testid={`probability-${channel}-${key}`}>{score===undefined?'—':`${(score*100).toFixed(1)}%`}</b></div>
            <div className="track"><i style={{transform:`scaleX(${score??0})`}}/></div></div>;})}
          {lane.latest?.reason&&<p className="request-note">{lane.latest.reason}</p>}
        </section>;
      })}</div>
      {latest?.reason&&<p className="request-note" data-testid="request-note">{latest.reason}</p>}
    </div>
    <div className="metrics"><div><span>APPLIED</span><b>{traces.filter(t=>t.status==='applied').length}</b></div><div><span>REJECTED</span><b>{traces.filter(t=>t.status==='rejected').length}</b></div></div>
  </aside>;
});
