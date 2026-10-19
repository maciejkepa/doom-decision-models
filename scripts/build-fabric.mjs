import { spawnSync } from 'node:child_process';
for(const args of [['scripts/build-functions.mjs'],['node_modules/typescript/bin/tsc','--noEmit'],['node_modules/vite/bin/vite.js','build','--mode','fabric','--outDir','dist-fabric']]){
  const p=spawnSync(process.execPath,args,{stdio:'inherit'});if(p.error)throw p.error;if(p.status)process.exit(p.status);
}
