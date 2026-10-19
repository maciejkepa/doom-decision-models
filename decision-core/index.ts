import { requestSchema, availableControls, channelOptions, DECISION_CHANNELS, formatControls, PROMPT_VERSION, DecisionError, type DecisionControls, type DecisionRequest, type DecisionResponse } from '../shared/contracts';
import { channelInstructions, modelState, channelCriteria } from './prompt';
export interface FoundryConfig { endpoint:string; deployment:string; timeoutMs:number; headers:()=>Promise<Record<string,string>> }
export function normalizeEndpoint(input:string) {
  const u = new URL(input);
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) throw new Error('Foundry endpoint must be an HTTPS resource URL.');
  u.pathname = u.pathname.replace(/\/providers\/microsoft\/v1\/systemone\/?$/, '').replace(/\/$/,'');
  if (u.pathname && u.pathname !== '/') throw new Error('Use the Foundry resource endpoint, not a project endpoint.');
  return u.origin;
}
export function buildBody(r:DecisionRequest, deployment:string) {
  const criteria=channelCriteria(r.observation);
  return {model:deployment,state:modelState(r.observation),questions:Object.fromEntries([r.channel].map(channel=>[
    channel,{type:'choice',instructions:channelInstructions[channel]+(channel==='view'?' Prefer face_enemy_ID, face_key_ID or a usable face_surface_ID for exact snapshot directions. Select the target explicitly. Do not fixate on a door whose key is missing. These options do not track moving targets. activeInputs shows a turn already in progress; avoid restarting a scan unnecessarily.':''),criteria:criteria[channel]},
  ]))};
}
/** Diagnostics contain JSON bodies only, never headers, URLs or credentials. */
export function redact(value:unknown, depth=0):unknown {
  if (depth>16) return '[depth limit]';
  if (Array.isArray(value)) return value.slice(0,128).map(v=>redact(v,depth+1));
  if (value && typeof value==='object') return Object.fromEntries(Object.entries(value).slice(0,128).map(([k,v])=>[k,/key|token|authorization|secret|credential/i.test(k) && k!=='keys' && !k.endsWith('_tokens') ? '[redacted]' : redact(v,depth+1)]));
  return typeof value==='string' ? value.slice(0,8192) : value;
}
export function parseAnswer(raw:unknown, allowed:Record<string,unknown>,question='action') {
  const payload=raw as { answers?:Record<string,{type?:unknown;choice?:unknown;probabilities?:unknown}>; model?:unknown; model_version?:unknown; usage?:unknown };
  const a=payload?.answers?.[question];
  if (a?.type!=='choice' || typeof a.choice!=='string' || !Object.hasOwn(allowed,a.choice)) throw new DecisionError('Foundry returned an invalid action.',502);
  let optionScores:Record<string,number>|null=null;
  // Only accept the explicit probabilities object. Preserve other formats in raw diagnostics until a live fixture verifies them.
  if(a.probabilities && typeof a.probabilities==='object' && !Array.isArray(a.probabilities)) {
    const entries=Object.entries(a.probabilities);
    if(entries.length && entries.every(([k,v])=>Object.hasOwn(allowed,k)&&typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1)) optionScores=Object.fromEntries(entries);
  }
  const usage=payload.usage && typeof payload.usage==='object' && !Array.isArray(payload.usage) ? Object.fromEntries(Object.entries(payload.usage).filter(([,v])=>typeof v==='number'&&Number.isFinite(v))) as Record<string,number> : null;
  return {choice:a.choice,optionScores,usage,model:typeof payload.model==='string'?payload.model:null,modelVersion:typeof payload.model_version==='string'?payload.model_version:null};
}
export function parseDecision(raw:unknown,owned:string[]){
  const allowed=availableControls(owned),controls={} as DecisionControls,scores:Record<string,number>={};
  let metadata:ReturnType<typeof parseAnswer>|undefined;
  for(const channel of DECISION_CHANNELS){
    const answer=parseAnswer(raw,allowed[channel],channel);controls[channel]=answer.choice as never;metadata=answer;
    if(answer.optionScores)for(const [key,value] of Object.entries(answer.optionScores))scores[`${channel}:${key}`]=value;
  }
  return {controls,choice:formatControls(controls),optionScores:Object.keys(scores).length?scores:null,
    model:metadata!.model,modelVersion:metadata!.modelVersion,usage:metadata!.usage};
}
export async function decide(input:unknown, config:FoundryConfig, signal?:AbortSignal):Promise<DecisionResponse> {
  const parsed=requestSchema.safeParse(input);
  if(!parsed.success) throw new DecisionError('Invalid observation or contract version.',400);
  const r=parsed.data;
  if(r.observation.status!=='playing') throw new DecisionError('The episode is not playing.',409);
  const started=performance.now();
  const deadline=AbortSignal.timeout(config.timeoutMs);
  const combined=signal?AbortSignal.any([signal,deadline]):deadline;
  const body=buildBody(r,config.deployment);
  if(JSON.stringify(body).length>16384)throw new DecisionError('Model input exceeds 16 KiB.',413);
  const abort = new Promise<never>((_,reject)=>combined.addEventListener('abort',()=>reject(new DecisionError('Decision deadline exceeded.',504)),{once:true}));
  const work=async():Promise<DecisionResponse>=>{
    const headers=await config.headers();
    combined.throwIfAborted();
    const res=await fetch(normalizeEndpoint(config.endpoint)+'/providers/microsoft/v1/systemone',{
      method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body),signal:combined,
    });
    if(!res.ok) {
      const retry=res.headers.get('retry-after');
      const delay=retry ? (Number.isFinite(Number(retry))?Number(retry)*1000:Math.max(0,Date.parse(retry)-Date.now())) : 0;
      throw new DecisionError(`Foundry HTTP ${res.status}.`,res.status,Number.isFinite(delay)?delay:0);
    }
    const text=await res.text();
    if(text.length>262144) throw new DecisionError('Foundry response exceeds size limit.',502);
    let raw:unknown;
    try { raw=JSON.parse(text); } catch { throw new DecisionError('Foundry returned invalid JSON.',502); }
    const options=channelOptions(r.observation)[r.channel];
    const answer=parseAnswer(raw,options,r.channel);
    return {...answer,channel:r.channel,sequence:r.sequence,targetHeading:options[answer.choice].targetHeading,targetPoint:options[answer.choice].targetPoint,requestId:r.requestId,episodeId:r.episodeId,controllerEpoch:r.controllerEpoch,observationId:r.observation.observationId,
      serverMs:performance.now()-started,promptVersion:PROMPT_VERSION,diagnostics:{request:redact(body),response:redact(raw)}};
  };
  try { return await Promise.race([work(),abort]); }
  catch(e) { if(combined.aborted) throw new DecisionError('Decision deadline exceeded.',504); throw e; }
}
