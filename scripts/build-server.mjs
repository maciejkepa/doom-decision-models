import { build } from 'esbuild';
await build({entryPoints:['server/index.ts'],outdir:'dist-server',bundle:true,platform:'node',target:'node24',format:'esm',packages:'external'});
