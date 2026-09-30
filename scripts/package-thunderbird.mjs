// Assembles dist/thunderbird (extension files + the Angular build under app/) and zips it
// to dist/productivist.xpi. Run after `ng build --base-href ./` (see `npm run build:tb`).
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const out = 'dist/thunderbird';
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync('extension', out, { recursive: true });
cpSync('dist/productivist/browser', `${out}/app`, { recursive: true });

// Keep the add-on version in lockstep with package.json.
const manifestPath = `${out}/manifest.json`;
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.version = version;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

rmSync('dist/productivist.xpi', { force: true });
execFileSync('zip', ['-r', '-q', '../productivist.xpi', '.'], { cwd: out, stdio: 'inherit' });
console.log(`Built dist/productivist.xpi (v${version})`);
