import { RayfinClient,resolveRayfinConfig } from '@microsoft/rayfin-client';
import { ensureSignedInWithFabric } from '@microsoft/rayfin-auth-provider-fabric';
import { DecisionError,responseSchema,type DecisionTransport } from '../../shared/contracts';
import type { AppFunctionsSchema } from '../../rayfin/functions/src/types';
let client:RayfinClient<Record<string,never>,AppFunctionsSchema>|undefined;
let config:Awaited<ReturnType<typeof resolveRayfinConfig>>;
export async function initializeFabric(){
  if(client)return;
  config=await resolveRayfinConfig({apiUrl:import.meta.env.VITE_RAYFIN_API_URL,publishableKey:import.meta.env.VITE_RAYFIN_PUBLISHABLE_KEY,workspaceId:import.meta.env.VITE_FABRIC_WORKSPACE_ID,itemId:import.meta.env.VITE_FABRIC_ITEM_ID},{configUrl:new URL('rayfin.config.json',document.baseURI).href});
  if(!config.baseUrl||!config.publishableKey)throw Error('Configure the Fabric API URL and publishable key or deploy rayfin.config.json.');
  client=new RayfinClient<Record<string,never>,AppFunctionsSchema>({...config,baseUrl:config.baseUrl,publishableKey:config.publishableKey,authStorage:true});
}
export async function signInFabric(){
  await initializeFabric();
  const runtime=client!.runtimeConfig;
  const workspaceId=runtime?.workspaceId||import.meta.env.VITE_FABRIC_WORKSPACE_ID;
  const projectId=runtime?.itemId||import.meta.env.VITE_FABRIC_ITEM_ID;
  if(!workspaceId||!projectId)throw Error('Configure the Fabric workspace and item IDs.');
  await ensureSignedInWithFabric(client!.auth,{workspaceId,projectId,fabricPortalUrl:runtime?.portalUrl||'https://app.fabric.microsoft.com',returnOrigin:location.origin,callbackUrl:new URL('.',document.baseURI).href});
}
export const fabricTransport:DecisionTransport={async decide(request,signal){
  await initializeFabric();signal.throwIfAborted();
  // SDK 1.36.2 supports a request timeout, but not AbortSignal. Epoch/TTL still reject late results.
  const result=await client!.functions.decision.invoke({payload:JSON.stringify(request)},{timeoutMs:1200});
  signal.throwIfAborted();
  const envelope=JSON.parse(result);
  if(envelope.error)throw new DecisionError(envelope.error,envelope.status,envelope.retryAfterMs);
  return responseSchema.parse(envelope);
}};
