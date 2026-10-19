import { spawnSync } from 'node:child_process';
if(!process.env.FABRIC_WORKSPACE){console.error('Set FABRIC_WORKSPACE to your target workspace name. See docs/fabric.md.');process.exit(1);}
const p=spawnSync(process.execPath,['node_modules/@microsoft/rayfin-cli/scripts/main','up','--workspace',process.env.FABRIC_WORKSPACE],{stdio:'inherit'});
if(p.error)throw p.error;process.exit(p.status||0);
