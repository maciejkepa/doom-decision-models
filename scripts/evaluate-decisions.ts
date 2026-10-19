// Explicit paid evaluation: synthetic sensor situations, real Foundry decisions. Never controls the game.
import { loadEnvFile } from 'node:process';
import { mkdir,writeFile } from 'node:fs/promises';
import { buildBody,parseAnswer,redact } from '../decision-core';
import { loadConfig } from '../server/config';
import { CATALOG_VERSION, PROMPT_VERSION, channelOptions, DECISION_CHANNELS, type DecisionChannel, type DecisionRequest } from '../shared/contracts';
import { tacticalCases } from '../tests/fixtures/tactics';
import { interactionCases } from '../tests/fixtures/interactions';
import { combatCases } from '../tests/fixtures/combat';
import { searchCases } from '../tests/fixtures/search';
import { navigationCases } from '../tests/fixtures/navigation';
import { keyCases } from '../tests/fixtures/keys';
try{loadEnvFile('.env.local');}catch{}
const config=loadConfig(),headers=await config.headers();
const results=[];
const interactionsOnly=process.argv.includes('--interactions');
const combatOnly=process.argv.includes('--combat');
const searchOnly=process.argv.includes('--search');
const navigationOnly=process.argv.includes('--navigation');
const keysOnly=process.argv.includes('--keys');
for(const scenario of keysOnly?keyCases:navigationOnly?navigationCases:interactionsOnly?interactionCases:combatOnly?combatCases:searchOnly?searchCases:tacticalCases){
  const request:DecisionRequest={requestId:crypto.randomUUID(),episodeId:scenario.observation.episodeId,controllerEpoch:1,channel:'action',sequence:1,catalogVersion:CATALOG_VERSION,observation:scenario.observation};
  const current=buildBody(request,config.deployment);
  const variants=[[PROMPT_VERSION,current]] as const;
  for(const [version,body] of variants){
    const start=performance.now();
    const res=await fetch(config.endpoint+'/providers/microsoft/v1/systemone',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
    if(!res.ok)throw Error(`Foundry HTTP ${res.status}`);
    const raw=await res.json();const controls:Record<string,string>={};const scores:Record<string,number>={};
    for(const channel of DECISION_CHANNELS){
      const b=buildBody({...request,channel},config.deployment);
      const reply=channel==='action'?raw:await (await fetch(config.endpoint+'/providers/microsoft/v1/systemone',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(b),signal:AbortSignal.timeout(10000)})).json();
      const a=parseAnswer(reply,channelOptions(scenario.observation)[channel],channel);controls[channel]=a.choice;
      for(const [key,value]of Object.entries(a.optionScores??{}))scores[channel+':'+key]=value;
    }
    const answer={controls,optionScores:scores,usage:null};
    if(results.length===0&&process.argv.includes('--save-fixture'))await writeFile('tests/fixtures/foundry-async-action-live.json',JSON.stringify({source:'live-foundry',time:new Date().toISOString(),request:redact(body),response:redact(raw)},null,2));
    const passed=Object.entries(scenario.expected).every(([channel,values])=>values.includes(answer.controls[channel as DecisionChannel]));
    const result={name:scenario.name,version,controls:answer.controls,expected:scenario.expected,passed,latencyMs:Math.round(performance.now()-start),probabilities:answer.optionScores,usage:answer.usage};
    results.push(result);console.log(JSON.stringify(result));
  }
}
await mkdir('artifacts',{recursive:true});
await writeFile(`artifacts/${keysOnly?'keys':navigationOnly?'navigation':interactionsOnly?'interaction':combatOnly?'combat':searchOnly?'search':'tactical'}-evaluation-${PROMPT_VERSION}.json`,JSON.stringify({date:new Date().toISOString(),kind:'synthetic observations with real inference',results},null,2));
const current=results.filter(r=>r.version===PROMPT_VERSION);
console.log(`Current prompt: ${current.filter(r=>r.passed).length}/${current.length} tactical cases passed.`);
if(current.some(r=>!r.passed))process.exitCode=1;
