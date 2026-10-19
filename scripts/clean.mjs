import { realpath, rm } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--dry-run')) throw new Error('Usage: npm run clean -- [--dry-run]');
const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const paths = ['dist', 'dist-server', 'dist-fabric', 'rayfin/functions/dist', 'engine/build', '.cache', 'test-results', 'playwright-report', 'artifacts/static-inspection.zip', 'artifacts/functions-inspection.zip'];
const targets = [];
for (const path of paths) {
  const target = resolve(root, path);
  let resolved;
  try { resolved = await realpath(target); }
  catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  const resolvedPath = relative(root, resolved);
  if (!resolvedPath || resolvedPath === '..' || resolvedPath.startsWith(`..${sep}`) || isAbsolute(resolvedPath)) {
    throw new Error(`Refusing to clean a path outside the project: ${target}`);
  }
  targets.push(target);
}
for (const target of targets) {
  console.log(`${args.includes('--dry-run') ? 'Would remove' : 'Removing'} ${target}`);
  if (!args.includes('--dry-run')) await rm(target, { recursive: true, force: true });
}
