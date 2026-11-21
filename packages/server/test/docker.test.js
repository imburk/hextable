// The image's build stage must hold every folder scripts/build.mjs copies from. When a new one is added to the build
// and not to the Dockerfile and .dockerignore, `npm run build` passes here but fails on Railway (ENOENT on the folder),
// as happened with assets/models (#531): every deploy after it failed while CI stayed green.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../../', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');

test('every folder build.mjs copies from is copied into the Docker build stage and not ignored', () => {
  const build = read('scripts/build.mjs');
  const sources = [...build.matchAll(/cpSync\("([^"]+)"/g)].map((m) => m[1]);
  assert.ok(sources.length >= 3, 'build.mjs copies from at least the client, the rules and the models');
  const docker = read('Dockerfile');
  const stage = docker.slice(docker.indexOf('AS build'), docker.indexOf('RUN npm run build'));
  const copied = [...stage.matchAll(/^COPY (\S+) /gm)].map((m) => m[1]);
  const allowed = read('.dockerignore').split('\n').filter((l) => l.startsWith('!')).map((l) => l.slice(1).trim());
  for (const src of sources) {
    assert.ok(copied.some((c) => src === c || src.startsWith(c + '/')), `${src} is not copied in the Dockerfile's build stage`);
    assert.ok(allowed.some((a) => src === a || src.startsWith(a + '/')), `${src} is not let in by .dockerignore`);
  }
});

// The run-time stage holds only what the server imports. Walk every relative import reachable from the entry point and require
// that the stage copies each file to the same place (and .dockerignore lets it in). A file the server starts to import from a folder
// the stage does not copy (packages/client/modulezip.js is the planned one) would start the image and crash it, with CI green.
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(root);
const importsOf = (file) => {
  const text = readFileSync(file, 'utf8');
  const specs = [
    ...text.matchAll(/\b(?:import|export)\b[^'"`;()]*?\bfrom\s*["']([^"']+)["']/g),
    ...text.matchAll(/\bimport\s*["']([^"']+)["']/g),
    ...text.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
    ...text.matchAll(/new URL\(\s*["'](\.{1,2}\/[^"']+)["']\s*,\s*import\.meta\.url\s*\)/g),
  ].map((m) => m[1]);
  return specs.filter((s) => s.startsWith('./') || s.startsWith('../'));
};

test('every relative import reachable from the server entry point is copied into the run-time stage', () => {
  const docker = read('Dockerfile');
  const stage = docker.slice(docker.lastIndexOf('\nFROM '));
  // COPY a b ./  or  COPY src dest; a source that lands in a folder keeps its file name there.
  const copies = [...stage.matchAll(/^COPY (--from=\S+ )?(.+)$/gm)].flatMap((m) => {
    const parts = m[2].trim().split(/\s+/), to = parts.pop().replace(/^\.\/?$/, '').replace(/\/$/, '');
    return parts.map((src) => ({ fromBuild: Boolean(m[1]), src: src.replace(/^\/app\//, '').replace(/\/$/, ''), dest: parts.length > 1 || /\.\w+$/.test(src) ? join(to, src.split('/').pop()) : to }));
  });
  assert.ok(copies.length >= 3, 'the run-time stage copies the entry point, the rules and the server');
  const allowed = read('.dockerignore').split('\n').filter((l) => l.startsWith('!')).map((l) => l.slice(1).trim());
  const ignoredPatterns = read('.dockerignore').split('\n').filter((l) => l && !l.startsWith('#') && !l.startsWith('!') && l !== '*');
  const ignoredByPattern = (rel) => ignoredPatterns.some((p) => p.startsWith('**/') && (p.endsWith('.test.js') ? rel.endsWith(p.slice(3).replace('*', '')) : rel.split('/').includes(p.slice(3))));

  const shipped = (rel) => {
    // A copy from the build stage does not pass through .dockerignore; one from the checkout must be let in by it.
    return copies.some((c) => (rel === c.src || rel.startsWith(c.src + '/')) && join(c.dest, rel.slice(c.src.length)) === rel
      && (c.fromBuild || (allowed.some((a) => rel === a || rel.startsWith(a + '/')) && !ignoredByPattern(rel))));
  };

  const seen = new Set(), queue = ['docker-entrypoint.mjs'], problems = [];
  while (queue.length) {
    const rel = queue.pop();
    if (seen.has(rel)) continue;
    seen.add(rel);
    if (!shipped(rel)) { problems.push(`${rel} is imported at run time but the run-time stage does not copy it to the same path`); continue; }
    if (!rel.endsWith('.js') && !rel.endsWith('.mjs')) continue;
    for (const spec of importsOf(join(rootDir, rel))) {
      const target = relative(rootDir, resolve(dirname(join(rootDir, rel)), spec)).split('\\').join('/');
      // A built folder (dist/) is not in the checkout; the stage must still carry it, from the build stage.
      if (!existsSync(join(rootDir, target)) && !shipped(target)) { problems.push(`${rel} imports ${spec}, which is neither in the checkout nor copied from the build stage`); continue; }
      if (existsSync(join(rootDir, target))) queue.push(target);
    }
  }
  assert.ok(seen.size > 10 && seen.has('packages/server/src/index.js') && seen.has('packages/server/src/tables.js'), `the walk reached ${seen.size} files`);
  assert.deepEqual(problems, []);
});

// scripts/backup.mjs is run inside the container for a one-off backup (README, "Backups"): the run-time stage copies it, and the server file it imports.
test('the run-time stage carries scripts/backup.mjs and what it imports, and the entrypoint hands BACKUP_DIR to the node user', () => {
  const docker = read('Dockerfile');
  const stage = docker.slice(docker.lastIndexOf('\nFROM '));
  assert.match(stage, /^COPY scripts\/backup\.mjs scripts\/$/m);
  assert.ok(read('.dockerignore').split('\n').includes('!scripts/backup.mjs'));
  for (const spec of importsOf(join(rootDir, 'scripts/backup.mjs'))) {
    const target = relative(rootDir, resolve(rootDir, 'scripts', spec)).split('\\').join('/');
    assert.ok(target.startsWith('packages/server/src/') && existsSync(join(rootDir, target)), `${target} is inside the copied server folder`);
  }
  assert.match(read('docker-entrypoint.mjs'), /BACKUP_DIR/);
});
