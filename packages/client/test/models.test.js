// Creature models (docs/specs/renderer.md, Decision 4 and R12): the pure half of models.js (which model a creature gets, which clip plays for a beat, how big it is
// drawn, the setting) and the starter pack's data in themes.js, and that every file the pack names is in assets/models/ with its licence beside it.
// The loading and the playing need a browser: `SMOKE_ONLY=models npm run smoke`.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), client = join(here, '..'), root = join(here, '../../..'), tmp = mkdtempSync(join(tmpdir(), 'models-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
for (const f of ['models.js', 'three-build.js', 'floors.js', 'themes.js']) cpSync(join(client, f), join(tmp, f));
writeFileSync(join(tmp, 'package.json'), '{"type":"module"}');
after(() => rmSync(tmp, { recursive: true, force: true }));
const M = await import(pathToFileURL(join(tmp, 'models.js')).href);
const { THEMES } = await import(pathToFileURL(join(tmp, 'themes.js')).href);
const { UNIT } = await import(pathToFileURL(join(tmp, 'three-build.js')).href);
const pack = THEMES.classic.models;

test('a creature gets the model of its monster id, then its type, then its own look, then its class', () => {
  const p = { models: { a: {}, b: {}, c: {}, d: {} }, byId: { gob: 'a' }, byType: { fey: 'b', undead: 'b' }, byClass: { fighter: 'd', wizard: 'c' } };
  assert.equal(M.modelFor(p, { tpl: 'gob' }, () => 'fey'), 'a', 'the id wins over the type');
  assert.equal(M.modelFor(p, { tpl: 'other' }, () => 'fey'), 'b', 'then the type');
  assert.equal(M.modelFor(p, { tpl: 'other' }, () => 'beast'), null, 'a type the pack does not have is a pawn');
  assert.equal(M.modelFor(p, { kind: 'pc', cls: 'Fighter', look: { model: 'c' } }), 'c', 'a character\'s own look comes before its class');
  assert.equal(M.modelFor(p, { kind: 'pc', cls: 'Fighter' }), 'd');
  assert.equal(M.modelFor(p, { kind: 'pc', cls: 'Wizard 3 / Fighter 2' }), 'c', 'the first class word the pack knows');
  assert.equal(M.modelFor(p, { kind: 'pc', cls: 'Warlock' }), null);
  assert.equal(M.modelFor(p, { kind: 'npc', cls: 'Fighter' }), null, 'a class is for characters');
  assert.equal(M.modelFor(p, { tpl: 'gob', look: { model: 'nothing' } }), 'a');
  assert.equal(M.modelFor({ models: { a: {} }, byId: { x: 'gone' } }, { tpl: 'x' }), null, 'a model the pack does not hold is never answered');
  assert.equal(M.modelFor(undefined, { tpl: 'gob' }), null);
  assert.equal(M.modelFor(p, { tpl: 'toString', look: { model: 'constructor' } }), null, 'only the pack\'s own names count');
});

test('the starter pack draws the four starting heroes, the valley\'s goblins and skeletons, and an ogre', () => {
  const g = (e) => M.modelFor(pack, e);
  assert.equal(new Set(['fighter', 'rogue', 'cleric', 'wizard'].map((cls) => g({ kind: 'pc', cls }))).size, 4, 'four different heroes');
  assert.equal(g({ tpl: 'goblin-warrior' }), 'goblin');
  assert.equal(g({ tpl: 'skeleton' }), 'skeleton');
  assert.equal(g({ tpl: 'ogre' }), 'ogre');
  assert.equal(g({ tpl: 'wolf' }), null, 'no wolf: a pawn');
});

test('a beat with no clip falls back, and getting up plays the fall backwards', () => {
  const kay = pack.models.knight.clips, orc = pack.models.goblin.clips;
  assert.deepEqual(M.clipFor(kay, 'idle'), { name: 'Idle_A', reverse: false });
  assert.deepEqual(M.clipFor(kay, 'shoot'), { name: 'Throw', reverse: false }, 'no shoot: attack');
  assert.deepEqual(M.clipFor(orc, 'run'), { name: 'Walk', reverse: false }, 'no run: walk');
  assert.deepEqual(M.clipFor({ fall: 'Fell' }, 'die'), { name: 'Fell', reverse: false }, 'no die: fall');
  assert.deepEqual(M.clipFor({ die: 'Dead' }, 'fall'), { name: 'Dead', reverse: false });
  assert.deepEqual(M.clipFor(kay, 'stand'), { name: 'Death_A', reverse: true });
  assert.deepEqual(M.clipFor({ stand: 'Up', die: 'D' }, 'stand'), { name: 'Up', reverse: false });
  assert.equal(M.clipFor(kay, 'dodge'), null, 'nothing to play');
  assert.equal(M.clipFor({}, 'idle'), null);
  assert.equal(M.clipFor({ shoot: 'S' }, 'cast'), null, 'no cast and no attack: none');
  assert.equal(M.clipFor({ walk: 'W', run: 'R' }, 'fly').name, 'W');
});

test('a model is drawn at its footprint or its height, whichever is smaller', () => {
  const man = { w: 1.4, h: 2.2 };
  assert.ok(Math.abs(M.fit(man, 'medium') - (5 / 2.2) * UNIT) < 1e-9, 'a person: the height, 5 ft');
  assert.ok(Math.abs(M.fit({ w: 3, h: 2 }, 'medium') - (5 / 3) * UNIT) < 1e-9, 'a wide thing: the width, 5 ft across');
  assert.ok(Math.abs(M.fit({ w: 3.27, h: 3.05 }, 'large') - (9 / 3.27) * UNIT) < 1e-9, 'an ogre: 9 ft across fills its three hexes');
  assert.ok(Math.abs(M.fit({ w: 3.27, h: 3.05 }, 'large', 'square') - (10 / 3.27) * UNIT) < 1e-9, 'on squares a Large creature is 2 by 2');
  assert.ok(M.fit(man, 'huge') > M.fit(man, 'large') && M.fit(man, 'large') > M.fit(man, 'medium'));
  assert.ok(M.fit(man, 'unheard-of') > 0 && Number.isFinite(M.fit({ w: 0, h: 0 }, 'medium')));
});

test('the setting: the address, then the device, else on', () => {
  assert.equal(M.modelsMode('', undefined), 'on');
  assert.equal(M.modelsMode('?models=off', 'on'), 'off');
  assert.equal(M.modelsMode('?models=on', 'off'), 'on');
  assert.equal(M.modelsMode('', 'off'), 'off');
  assert.equal(M.modelsMode('?models=maybe', 'junk'), 'on');
});

test('the pack names only files that are in assets/models, with a licence beside each folder\'s files', () => {
  const files = [...Object.values(pack.rigs), ...Object.values(pack.models).map((m) => m.file)];
  for (const f of files) assert.ok(existsSync(join(root, 'assets/models', f)), `${f} is in assets/models`);
  for (const dir of new Set(files.map((f) => dirname(f)))) assert.ok(existsSync(join(root, 'assets/models', dir, 'License.txt')), `${dir} has its licence`);
  for (const m of Object.values(pack.models)) {
    if (m.rig) assert.ok(pack.rigs[m.rig], 'a model names a rig the pack has');
    assert.ok(m.clips.idle, 'every model idles');
  }
  for (const id of [...Object.values(pack.byId), ...Object.values(pack.byClass), ...Object.values(pack.byType)]) assert.ok(pack.models[id], `${id} is a model of the pack`);
  const credits = readFileSync(join(root, 'assets/models/CREDITS.md'), 'utf8');
  for (const dir of new Set(files.map((f) => dirname(f)))) assert.ok(credits.includes(`\`${dir}/\``), `CREDITS.md names ${dir}`);
  assert.ok(Object.values(THEMES).every((t) => t.models === pack), 'every theme has the starter pack');
});

test('only CC0 packs are here: no file of the Quaternius Asset License packs', () => {
  const credits = readFileSync(join(root, 'assets/models/CREDITS.md'), 'utf8');
  for (const dir of ['kaykit-adventurers', 'kaykit-skeletons', 'kaykit-rig-medium', 'quaternius-monsters']) {
    assert.match(readFileSync(join(root, 'assets/models', dir, 'License.txt'), 'utf8'), /CC0|Creative Commons Zero/i, `${dir}/License.txt is a CC0 licence`);
    assert.ok(credits.includes(dir));
  }
  for (const dir of ['bestiary', 'fantasy-races', 'fantasy-props', 'quaternius-bestiary']) assert.ok(!existsSync(join(root, 'assets/models', dir)));
});

test('the parts of a model that share a skeleton and a material are one draw; another material stays its own', async () => {
  const THREE = await import(pathToFileURL(join(client, 'vendor/three/three.module.js')).href);
  const BGU = await import(pathToFileURL(join(client, 'vendor/three/BufferGeometryUtils.js')).href);
  const bone = new THREE.Bone(), skeleton = new THREE.Skeleton([bone]), skin = new THREE.Material();
  const part = (mat, n) => {
    const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 9).map((_, i) => i % 7);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(pos.slice(), 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 12), 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(n * 12).fill(0.25), 4));
    const m = new THREE.SkinnedMesh(g, mat); return m;
  };
  const scene = new THREE.Group(); scene.add(bone);
  const glow = new THREE.Material();
  for (const m of [part(skin, 2), part(skin, 3), part(glow, 1), part(skin, 4)]) { scene.add(m); m.bind(skeleton); }
  assert.equal(M.mergeSkinned(THREE, BGU, scene), 1, 'one group had more than one part');
  const left = []; scene.traverse((o) => { if (o.isSkinnedMesh) left.push(o); });
  assert.equal(left.length, 2);
  const joined = left.find((m) => m.material === skin);
  assert.equal(joined.geometry.attributes.position.count, (2 + 3 + 4) * 3, 'every vertex of the parts is kept');
  assert.equal(joined.skeleton, skeleton);
});
