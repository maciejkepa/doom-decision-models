import { readFile,writeFile,mkdir,copyFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root=resolve('engine/vendor/doomgeneric/doomgeneric');
const build=resolve('engine/build');await mkdir(build,{recursive:true});await mkdir('public/engine',{recursive:true});
const make=await readFile(join(root,'Makefile.emscripten'),'utf8');
const sources=make.match(/SRC_DOOM = (.*)/)[1].trim().split(/\s+/).filter(x=>x!=='doomgeneric_emscripten.o').map(x=>join(root,x.replace(/\.o$/,'.c')));
// Generate patched copies. Vendored upstream remains byte-for-byte unchanged.
for(const [name,transform] of [
  // Interpolation can put the view actor >MINZ ahead of the render camera.
  // Exclude that actor explicitly; its first-person weapon is drawn separately.
  ['r_things.c',s=>s.replace('    // transform the origin point','    if (thing == viewplayer->mo) return;\n\n    // transform the origin point')],
  ['r_main.c',s=>'#include "bridge.h"\n'+s.replace('viewangle = player->mo->angle + viewangleoffset;','viewangle = player->mo->angle;').replace('    viewsin = finesine[viewangle>>ANGLETOFINESHIFT];','    DB_RenderView(&viewx, &viewy, &viewz, &viewangle);\n    viewangle += viewangleoffset;\n    viewsin = finesine[viewangle>>ANGLETOFINESHIFT];')],
  ['d_net.c',s=>'#include "bridge.h"\n'+s.replace('    G_Ticker ();','    DB_Input(&cmds[consoleplayer]);\n    G_Ticker ();\n    DB_Snapshot();')],
  ['g_game.c',s=>'#include "bridge.h"\n'+s.replace(/(void G_(?:Secret)?ExitLevel\s*\(void\)\s*\{)/g,'$1\n    DB_Event(3,0);')],
  ['p_inter.c',s=>'#include "bridge.h"\n'+s.replace(/P_RemoveMobj\s*\(special\);/,'DB_Event(1, special->type);\n    P_RemoveMobj (special);')],
  ['p_map.c',s=>'#include "bridge.h"\n#include "interactions.h"\n'+s.replace(/P_UseSpecialLine\s*\(\s*usething,\s*in->d.line,\s*side\s*\);/,'DB_Event(5, DB_UseLine(usething, in->d.line, side));').replace('usething = player->mo;','DB_UseBegin();\n    usething = player->mo;')],
]){
  const source=await readFile(join(root,name),'utf8'),patched=transform(source);
  if(patched===source||patched.slice(patched.indexOf('\n')+1)===source)throw Error(`Patch did not apply: ${name}`);
  await writeFile(join(build,name),patched);sources[sources.indexOf(join(root,name))]=join(build,name);
}
const exports=['_main','_db_observation','_db_apply','_db_apply_channels','_db_channel_remaining','_db_release','_db_epoch','_db_suspend','_db_manual','_db_restart','_db_applied','_db_audio','_db_apply_channel','_db_release_channel','_db_channel_applied','_db_input_stat','_db_perf'];
const args=[...sources,resolve('engine/bridge.c'),resolve('engine/interactions.c'),resolve('engine/browser.c'),resolve('engine/render.c'),'-I'+root,'-I'+resolve('engine'),'-O2','-DFEATURE_SOUND','-Wno-incompatible-function-pointer-types','-Wno-int-conversion','-sUSE_SDL=2','-sUSE_SDL_MIXER=2','-sSDL2_MIXER_FORMATS=[]','-sALLOW_MEMORY_GROWTH=1','-sINITIAL_MEMORY=67108864','-sSTACK_SIZE=1048576','-sMODULARIZE=1','-sEXPORT_ES6=1','-sEXPORT_NAME=createDoom','-sENVIRONMENT=web','-sFORCE_FILESYSTEM=1','-sINVOKE_RUN=0','-sEXIT_RUNTIME=0','-sEXPORTED_FUNCTIONS='+JSON.stringify(exports),'-sEXPORTED_RUNTIME_METHODS='+JSON.stringify(['FS','callMain','UTF8ToString']),'-o',resolve('public/engine/doom.js')];
const emsdk=process.env.EMSDK||resolve('.tools/emsdk');
const windows=process.platform==='win32';
const python=process.env.EMSDK_PYTHON||join(emsdk,'python/3.13.3_64bit/python.exe');
const result=spawnSync(windows?python:'emcc',windows?[join(emsdk,'upstream/emscripten/emcc.py'),...args]:args,{stdio:'inherit',env:{...process.env,EMSDK:emsdk,EMSDK_PYTHON:python}});
if(result.error)throw result.error;if(result.status)process.exit(result.status);
// Emscripten on Windows can emit CRLF. Hash the same LF bytes Git distributes.
const javascript=resolve('public/engine/doom.js');
await writeFile(javascript,(await readFile(javascript,'utf8')).replaceAll('\r\n','\n'));
const files={};for(const file of ['doom.js','doom.wasm'])files[file]=createHash('sha256').update(await readFile('public/engine/'+file)).digest('hex');
await writeFile('public/engine/manifest.json',JSON.stringify({bridgeVersion:'bridge-9',upstream:'e257a09527062bfb986b6e5e0780839b6cbd5b71',emscripten:'4.0.10',files},null,2)+'\n');
