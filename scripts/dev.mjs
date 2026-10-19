import { spawn } from 'node:child_process';
const children=[
  spawn(process.execPath,['--env-file-if-exists=.env.local','--import','tsx','server/index.ts'],{stdio:'inherit'}),
  spawn(process.execPath,['node_modules/vite/bin/vite.js'],{stdio:'inherit'}),
];
let closing=false;
function close(code=0){if(closing)return;closing=true;for(const c of children)c.kill();setTimeout(()=>process.exit(code),300).unref();}
for(const c of children){c.on('error',e=>{console.error(e.message);close(1);});c.on('exit',code=>close(code||0));}
process.on('SIGINT',()=>close());process.on('SIGTERM',()=>close());
