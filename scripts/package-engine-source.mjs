import { readdir,readFile,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { createHash } from 'node:crypto';
const files={};
files['SOURCE-README.txt']=new TextEncoder().encode('Corresponding engine source for DOOM: Decision-1 on Foundry.\nInstall and activate Emscripten 4.0.10, then run: node scripts/build-engine.mjs\nNode 24 is required. No npm dependencies are needed for that build command.\nThe build downloads pinned SDL ports through emsdk and writes public/engine/doom.js and doom.wasm.\nSee docs/engine-build.md and THIRD_PARTY_NOTICES.md for provenance and licenses.\n');
async function add(dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    if(['build','.git'].includes(entry.name))continue;
    const path=join(dir,entry.name);
    if(entry.isDirectory())await add(path);
    else files[path.replaceAll('\\','/')]=new Uint8Array(await readFile(path));
  }
}
await add('engine');
for(const file of ['scripts/build-engine.mjs','docs/engine-build.md','LICENSE','THIRD_PARTY_NOTICES.md'])files[file]=new Uint8Array(await readFile(file));
const zip=zipSync(files,{level:6});
await writeFile('public/engine/source.zip',zip);
const manifest=JSON.parse(await readFile('public/engine/manifest.json','utf8'));
manifest.files['source.zip']=createHash('sha256').update(zip).digest('hex');
await writeFile('public/engine/manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(`Packaged corresponding engine source (${Object.keys(files).length} files).`);
