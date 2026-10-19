import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
for(const folder of ['public/engine','public/assets']){
  const manifest=JSON.parse(await readFile(folder+'/manifest.json','utf8'));
  for(const [name,expected] of Object.entries(manifest.files)){
    const actual=createHash('sha256').update(await readFile(folder+'/'+name)).digest('hex');
    if(actual!==expected)throw Error(`Hash mismatch: ${folder}/${name}\nExpected: ${expected}\nActual:   ${actual}`);
    console.log(`Verified ${folder}/${name}`);
  }
}
