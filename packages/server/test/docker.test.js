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
