// Compare recorded runs only. No model calls and no inferred/fabricated missing metrics.
import {readFile,writeFile} from 'node:fs/promises';
const [beforePath='artifacts/live-baseline-before-async-6.json',afterPath='artifacts/live-async-6-final.json',output='artifacts/async-6-comparison.json']=process.argv.slice(2);
function summarize(data){
  const rows=data.traces,answered=rows.filter(t=>t.response),latencies=answered.map(t=>t.latencyMs).sort((a,b)=>a-b),pct=p=>latencies[Math.max(0,Math.ceil(latencies.length*p)-1)]??null;
  const death=data.metadata.finalObservation?.events.find(e=>e.type==='death');
  const completedTurns=rows.filter(t=>t.request.channel==='view'&&t.response?.targetHeading!==null&&t.execution?.endReason==='completed');
  const usageSamples=answered.filter(t=>t.response.usage),tokens={};for(const sample of usageSamples)for(const [key,value]of Object.entries(sample.response.usage))tokens[key]=(tokens[key]??0)+value;
  return {promptVersion:data.metadata.promptVersion,parameters:data.metadata.parameters,httpRequests:rows.length,applied:rows.filter(t=>t.status==='applied').length,rejected:rows.filter(t=>t.status==='rejected').length,errors:rows.filter(t=>t.status==='error').length,
    latencyP50:pct(.5),latencyP95:pct(.95),ttlRejections:rows.filter(t=>t.reason?.includes('expired')).length,outcome:data.metadata.outcome,
    secondsFromFirstRequestToDeath:death?(death.tic-rows[0].request.observation.gameTic)/35:null,
    completedTurnSamples:completedTurns.length,maxCompletedHeadingError:completedTurns.length?Math.max(...completedTurns.map(t=>Math.abs(t.execution.angularError))):null,
    alreadyPassedDirections:rows.filter(t=>t.execution?.endReason==='passed').length,performance:data.metadata.performance??null,
    usage:{reportedRequests:usageSamples.length,totals:usageSamples.length?tokens:null}};
}
const before=summarize(JSON.parse(await readFile(beforePath,'utf8'))),after=summarize(JSON.parse(await readFile(afterPath,'utf8')));
const comparison={recordedAt:new Date().toISOString(),beforePath,afterPath,before,after,limitations:['Single sessions on the same full Freedoom E1M1 and difficulty, not a statistically controlled survival evaluation.','HTTP requests formerly contained three questions; new requests contain one. Counts and token usage need that context.','Missing baseline camera/FPS metrics remain null. Completed heading error measures the requested snapshot direction, not accuracy against a moving enemy.']};
await writeFile(output,JSON.stringify(comparison,null,2)+'\n');console.log(JSON.stringify(comparison,null,2));
