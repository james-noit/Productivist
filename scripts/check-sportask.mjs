// Self-check of the Sportask domain core (docs/sportask/PLAN.md section 12): bundles scripts/sportask-check.ts with the esbuild that
// @angular/build already ships and runs it with Node. Exits non-zero on the first failed assertion.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outfile = resolve(root, 'node_modules/.cache/sportask-check.mjs');
mkdirSync(dirname(outfile), { recursive: true });

await build({
  entryPoints: [resolve(root, 'scripts/sportask-check.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  logLevel: 'warning',
});

const run = spawnSync(process.execPath, [outfile], { stdio: 'inherit' });
if (run.status !== 0) {
  console.error('\ncheck:sportask FAILED');
  process.exit(run.status ?? 1);
}
