// Copies package.json's version into the native projects, so a store build never needs a manual edit:
//   Android: versionName = version, versionCode = major * 10000 + minor * 100 + patch (0.20.1 -> 2001)
//   iOS:     MARKETING_VERSION = version, CURRENT_PROJECT_VERSION = the same integer
// The stores require the build number to grow with every upload, which this derivation guarantees as long as
// minor and patch stay below 100. Run by `npm run build:mobile`; harmless to run again.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
if (!match) {
  console.error(`package.json version "${version}" is not major.minor.patch`);
  process.exit(1);
}
const [major, minor, patch] = match.slice(1).map(Number);
if (minor > 99 || patch > 99) {
  console.error(`minor and patch must stay below 100 for the derived build number (got ${version})`);
  process.exit(1);
}
const code = major * 10000 + minor * 100 + patch;

function rewrite(file, replacements) {
  if (!existsSync(file)) {
    console.warn(`sync-mobile-version: ${file} not found, skipped (run \`npx cap add\` first)`);
    return;
  }
  let text = readFileSync(file, 'utf8');
  for (const [pattern, value] of replacements) {
    if (!pattern.test(text)) {
      console.error(`sync-mobile-version: nothing to update for ${pattern} in ${file}`);
      process.exit(1);
    }
    text = text.replace(pattern, value);
  }
  writeFileSync(file, text);
}

rewrite('android/app/build.gradle', [
  [/versionCode\s+\d+/, `versionCode ${code}`],
  [/versionName\s+"[^"]*"/, `versionName "${version}"`],
]);
rewrite('ios/App/App.xcodeproj/project.pbxproj', [
  [/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`],
  [/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${code};`],
]);
console.log(`Mobile version ${version} (build ${code})`);
