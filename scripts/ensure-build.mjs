/** Build dist/ when it is missing or older than the code, so a leftover build is never served. */
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Newest modification time under the folders the build reads from (skipping dependencies and output). */
function newestSource() {
  let newest = 0;
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
      const path = join(dir, e.name);
      if (e.isDirectory()) walk(path);
      else newest = Math.max(newest, statSync(path).mtimeMs);
    }
  };
  for (const dir of ['launcher', 'apps', 'packages', 'scripts']) walk(dir);
  for (const f of ['package.json', 'package-lock.json']) newest = Math.max(newest, statSync(f).mtimeMs);
  return newest;
}

// A leftover dist/ from an older version must never be served: rebuild when it is missing or older than the code.
export function ensureBuild(force = false) {
  const built = existsSync('dist/index.html') ? statSync('dist/index.html').mtimeMs : 0;
  if (force || built < newestSource()) {
    console.log(built ? 'Source changed since the last build: rebuilding…\n' : 'Building Bohrified…\n');
    execSync('npm run build', { stdio: 'inherit' });
  }
}
