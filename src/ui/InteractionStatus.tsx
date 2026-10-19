import type { Observation } from '../../shared/contracts';
const feedback={no_target:'No target in reach',unusable:'Surface unavailable',key_required:'Key required',triggered:'Activated',no_visible_change:'No visible change'};
export function InteractionStatus({observation:o}:{observation:Observation|null}){
  if(!o)return null;
  const recent=o.lastUse&&o.gameTic-o.lastUse.tic<175?o.lastUse:null;
  return <div className="interaction-status" aria-label="Nearby interactions">
    <strong>Nearby interactions</strong>
    {o.interactions.length?o.interactions.slice(0,3).map(s=><div className="interaction-row" key={s.id}><span>{s.kind}</span><span>{s.state}</span><span>{Math.round(s.distance)} units</span><span>{s.keyAvailable===false?`needs ${s.requiredKey} key`:s.passable?'passage clear':s.state==='opening'?'not yet passable':!s.activationAvailable?'already activated':s.canUseNow?'use within reach':s.inReach?'turn to face it':'approach to use'}</span></div>):<span>No surfaces</span>}
    {recent&&<div className="interaction-feedback"><span>{feedback[recent.result]}</span>{recent.requiredKey&&<span>Required key: {recent.requiredKey}</span>}</div>}
  </div>;
}
