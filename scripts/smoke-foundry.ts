import { loadEnvFile } from 'node:process';
import { mkdir,writeFile } from 'node:fs/promises';
import { loadConfig } from '../server/config';
import { redact } from '../decision-core';
try{loadEnvFile('.env.local');}catch{}
const config=loadConfig();
const headers=await config.headers();
const body={model:config.deployment,state:{task:'Connectivity check',instruction:'Select release to leave the game controls untouched.'},questions:{action:{type:'choice',instructions:'Choose release for this connectivity check.',criteria:{release:'Release all controls.',advance:'Walk forward.'}}}};
const started=performance.now();
const res=await fetch(config.endpoint+'/providers/microsoft/v1/systemone',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
const raw=await res.text();
if(!res.ok){console.error(`Foundry HTTP ${res.status}. Check deployment, credentials and permissions.`);process.exit(1);}
const payload=JSON.parse(raw);
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/foundry-smoke.json',JSON.stringify({source:'live-foundry',time:new Date().toISOString(),latencyMs:performance.now()-started,request:body,response:redact(payload)},null,2));
console.log(JSON.stringify({status:res.status,latencyMs:Math.round(performance.now()-started),answerFields:Object.keys(payload.answers?.action||{}),model:payload.model,fixture:'artifacts/foundry-smoke.json'}));
