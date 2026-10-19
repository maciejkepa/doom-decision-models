import { UserDataFunctions,AudienceType,type RayfinContext } from '@microsoft/fabric-user-data-functions';
import { decide } from '../../../decision-core';
import { DecisionError } from '../../../shared/contracts';
import { settings } from './settings';
import { InferenceLimiter } from '../../../shared/inference-limiter';
const udf=new UserDataFunctions();
const limiter=new InferenceLimiter();
udf.func('decision',async(ctx:RayfinContext<Record<string,never>,AudienceType.AzureAI>,payload:string):Promise<string>=>{
  // Per-instance protection only. Foundry quotas and Fabric access enforce the deployment boundary.
  if(payload.length>65536)return JSON.stringify({error:'Payload exceeds 64 KiB.',status:413});
  let input:unknown;try{input=JSON.parse(payload);}catch{return JSON.stringify({error:'Invalid JSON.',status:400});}
  const release=limiter.acquire();if(!release)return JSON.stringify({error:'Function instance inference limit.',status:429,retryAfterMs:1000});
  try{
    return JSON.stringify(await decide(input,{...settings,headers:async():Promise<Record<string,string>>=>{
      if(settings.auth==='key'){const key=ctx.getSecret('FOUNDRY_API_KEY');if(!key)throw new DecisionError('Configure FOUNDRY_API_KEY in Fabric.',503);return {'api-key':key};}
      return {Authorization:`Bearer ${ctx.Tokens.AzureAI}`};
    }}));
  }catch(e){const error=e instanceof DecisionError?e:new DecisionError('Function could not access Foundry. Check app identity and configuration.',502);return JSON.stringify({error:error.message,status:error.status,retryAfterMs:error.retryAfterMs});}
  finally{release();}
},[]);
