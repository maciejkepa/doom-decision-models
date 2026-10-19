import { DecisionError, responseSchema, type DecisionTransport } from '../../shared/contracts';
export const localTransport:DecisionTransport={async decide(request,signal){
  const res=await fetch('api/decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal});
  const data=await res.json();
  if(!res.ok)throw new DecisionError(data.error||`HTTP ${res.status}`,res.status,data.retryAfterMs||0);
  return responseSchema.parse(data);
}};
