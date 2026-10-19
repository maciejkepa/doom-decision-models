import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { decide } from '../decision-core';
import { DecisionError } from '../shared/contracts';
import { loadConfig } from './config';
import { InferenceLimiter } from '../shared/inference-limiter';
let config:ReturnType<typeof loadConfig>|undefined;
try { config=loadConfig(); } catch { console.warn('Foundry is not configured. Configure .env.local, then restart the API.'); }
if(config)void config.headers().catch(()=>console.warn('Azure credentials are not ready. Sign in with az login or configure an API key.'));
const port=Number(process.env.PORT || 8787);
const root=resolve('dist');
const mime:Record<string,string>={'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.wad':'application/octet-stream'};
const limiter=new InferenceLimiter();
const server=createServer(async(req,res)=>{
  const json=(status:number,value:unknown)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
  // Loopback only; reject DNS rebinding and cross-origin inference requests.
  if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) return json(403,{error:'Invalid host.'});
  if(req.headers.origin&&!['http://127.0.0.1:5173','http://localhost:5173',`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(req.headers.origin)) return json(403,{error:'Invalid origin.'});
  const path=new URL(req.url || '/',`http://127.0.0.1:${port}`).pathname;
  if(path==='/api/health'&&req.method==='GET') return json(200,{ready:!!config,deployment:config?.deployment??null,auth:process.env.FOUNDRY_AUTH||'entra',liveVerified:false});
  if(path==='/api/decision'&&req.method==='POST') {
    if(!config) return json(503,{error:'Configure Foundry in .env.local and restart the API.'});
    if(!req.headers['content-type']?.startsWith('application/json')) return json(415,{error:'Use application/json.'});
    const release=limiter.acquire();
    if(!release)return json(429,{error:'Local inference limit.',retryAfterMs:1000});
    const abort=new AbortController();
    res.on('close',()=>{if(!res.writableEnded) abort.abort();});
    try {
      const chunks:Buffer[]=[]; let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>65536) throw new DecisionError('Payload exceeds 64 KiB.',413);chunks.push(chunk);}
      let body:unknown;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new DecisionError('Invalid JSON.',400);}
      json(200,await decide(body,config,abort.signal));
    } catch(e) {const err=e instanceof DecisionError?e:new DecisionError('Inference failed. Check server credentials and deployment.',502);if(!res.destroyed)json(err.status,{error:err.message,retryAfterMs:err.retryAfterMs});}
    finally {release();}
    return;
  }
  if(path.startsWith('/api/')) return json(404,{error:'Not found.'});
  if(req.method!=='GET'&&req.method!=='HEAD') return json(405,{error:'Method not allowed.'});
  try {
    const file=resolve(root,'.'+decodeURIComponent(path==='/'?'/index.html':path));
    if(!file.startsWith(root+sep)) return json(403,{error:'Invalid path.'});
    const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);
  } catch {json(404,{error:'Not found. Use npm run dev or build the frontend first.'});}
});
server.requestTimeout=5000;server.headersTimeout=5000;
server.listen(port,'127.0.0.1',()=>console.log(`Local API: http://127.0.0.1:${port}`));
for(const event of ['SIGINT','SIGTERM'] as const) process.on(event,()=>server.close(()=>process.exit(0)));
