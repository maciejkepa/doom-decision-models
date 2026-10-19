import { readdir,readFile,writeFile,mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { zipSync } from 'fflate';
await mkdir('artifacts',{recursive:true});
async function collect(dir,prefix='',filter=()=>true){
  const files={};
  for(const e of await readdir(dir,{withFileTypes:true})){
    const path=join(dir,e.name),name=prefix+e.name;
    if(!filter(name,e))continue;
    if(e.isDirectory())Object.assign(files,await collect(path,name+'/',filter));
    else if(e.isFile())files[name]=new Uint8Array(await readFile(path));
  }return files;
}
for(const [label,folder,limit,filter] of [
  ['static','dist-fabric',100,()=>true],
  ['functions','rayfin/functions',30,(name)=>!/(^|\/)(\.bin|\.cache)(\/|$)/.test(name)&&!name.startsWith('src/')&&!name.startsWith('local.settings')&&!name.endsWith('.tsbuildinfo')],
]){
  const files=await collect(folder,'',filter),zip=zipSync(files,{level:6});
  if(zip.byteLength>limit*1024*1024)throw Error(`${label} ZIP exceeds ${limit} MiB`);
  if(label==='functions'&&Object.keys(files).some(n=>/\.(wad|wasm)$/.test(n)))throw Error('Game assets leaked into Functions ZIP');
  await writeFile(`artifacts/${label}-inspection.zip`,zip);
  console.log(`${label}: ${(zip.byteLength/1024/1024).toFixed(2)} MiB compressed, ${Object.keys(files).length} files`);
}
