import { DefaultAzureCredential } from '@azure/identity';
import { normalizeEndpoint, type FoundryConfig } from '../decision-core';
export function loadConfig(env=process.env):FoundryConfig {
  const endpoint=normalizeEndpoint(env.FOUNDRY_RESOURCE_ENDPOINT || '');
  const deployment=env.FOUNDRY_DEPLOYMENT?.trim();
  if(!deployment) throw new Error('Set FOUNDRY_DEPLOYMENT in .env.local.');
  const auth=env.FOUNDRY_AUTH || 'entra';
  if(!['entra','key'].includes(auth)) throw new Error('FOUNDRY_AUTH must be entra or key.');
  if(auth==='key'&&!env.FOUNDRY_API_KEY) throw new Error('Set FOUNDRY_API_KEY.');
  const credential=auth==='entra'?new DefaultAzureCredential():null;
  let cached:{token:string;expiresOnTimestamp:number}|null=null;
  let acquiring:Promise<{token:string;expiresOnTimestamp:number}>|null=null;
  async function headers():Promise<Record<string,string>> {
    if(auth==='key')return {'api-key':env.FOUNDRY_API_KEY!};
    // AzureCliCredential does not cache access tokens. Avoid launching az on every game decision.
    if(!cached||cached.expiresOnTimestamp<Date.now()+60000){
      acquiring??=credential!.getToken('https://cognitiveservices.azure.com/.default');
      try{cached=await acquiring;}finally{acquiring=null;}
    }
    return {Authorization:`Bearer ${cached.token}`};
  }
  const timeoutMs=Number(env.DECISION_TIMEOUT_MS || 1200);
  if(!Number.isFinite(timeoutMs)||timeoutMs<100||timeoutMs>10000) throw new Error('DECISION_TIMEOUT_MS must be 100–10000.');
  return {endpoint,deployment,timeoutMs,headers};
}
