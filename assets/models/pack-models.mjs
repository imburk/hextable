// How the files in this folder were made from the free CC0 packs they came from (see CREDITS.md). Not part of the game: nothing imports it and
// `npm run build` does not run it. It is kept so the files can be made again and checked against the packs:
//
//   node assets/models/pack-models.mjs <KayKit Adventurers 2.0 folder> <KayKit Skeletons 1.1 folder> <Quaternius Ultimate Monsters folder>
//
// Each folder is the unzipped pack (the one that holds License.txt). Run it from a directory of your own, never from inside a pack: it only
// reads from them. It does four things.
//   1. Copies four hero models and one skeleton model byte for byte (they are already binary glTF, and carry their own texture).
//   2. Makes `kaykit-rig-medium/Rig_Medium.glb`: the clips the game uses from KayKit's two shared animation files (General and MovementBasic,
//      the same two files in both packs), with their mannequin mesh left out. They move a skeleton by bone name, so they play on any KayKit
//      character. The clips of the two files are put into one file; the bones are matched by name.
//   3. Makes the two monster files from Quaternius's glTF files: one binary file each, with only the clips the game uses, and the texture
//      left as a file beside them (`Atlas_Monsters.png`, shared by both, the same file in every folder of the pack).
//   4. Copies the licence files.
// Nothing in a model is edited: the vertices, bones, weights and keyframes are the pack's own, copied as they are. Only what is left out differs.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }, COMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

export function readGlb(path) {
  const b = readFileSync(path);
  if (b.readUInt32LE(0) !== 0x46546c67) {                      // plain .gltf: one JSON file, its buffer a data: URI
    const json = JSON.parse(b.toString('utf8'));
    if (json.buffers.length !== 1 || !/^data:application\/octet-stream;base64,/.test(json.buffers[0].uri)) throw new Error(`${path}: expected one embedded buffer`);
    return { json, bin: Buffer.from(json.buffers[0].uri.split(',')[1], 'base64') };
  }
  let json, bin;
  for (let o = 12; o < b.length;) {
    const len = b.readUInt32LE(o), type = b.readUInt32LE(o + 4), data = b.subarray(o + 8, o + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8')); else if (type === 0x004e4942) bin = data;
    o += 8 + len;
  }
  return { json, bin };
}

export function writeGlb(path, json, bin) {
  const pad = (buf, byte) => Buffer.concat([buf, Buffer.alloc((4 - (buf.length % 4)) % 4, byte)]);
  const j = pad(Buffer.from(JSON.stringify(json), 'utf8'), 0x20), b = pad(bin, 0);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + j.length + 8 + b.length, 8);
  const ch = (len, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(len, 0); h.writeUInt32LE(type, 4); return h; };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.concat([head, ch(j.length, 0x4e4f534a), j, ch(b.length, 0x004e4942), b]));
}

// Makes a smaller file from one: keeps only the named clips (`clips`, null keeps all), leaves out the meshes, skins and materials (`noMesh`),
// and either keeps the picture inside (`image: 'embed'`) or points to a file (`image: 'uri:<name>'`). Every accessor left in use is copied
// into a new buffer, tightly, one after the other; nothing in them changes.
export function repack({ json, bin }, { clips = null, noMesh = false, image = 'embed' } = {}) {
  const src = structuredClone(json), out = { asset: { version: '2.0', generator: 'hextable pack-models.mjs, from a CC0 pack' }, scene: src.scene ?? 0, scenes: src.scenes, nodes: src.nodes };
  let anims = src.animations ?? [];
  if (clips) { anims = clips.map((n) => anims.find((a) => a.name === n) ?? (() => { throw new Error(`no clip ${n}`); })()); }
  if (!noMesh) { out.meshes = src.meshes; out.skins = src.skins; out.materials = src.materials; out.textures = src.textures; out.samplers = src.samplers; out.images = src.images; }
  else for (const n of out.nodes) { delete n.mesh; delete n.skin; }
  out.animations = anims.length ? anims : undefined;
  // Every accessor still in use, once: two with the same type, count and bytes (an animation's times, repeated for each bone) share one.
  const patches = [], want = new Set();
  const take = (get, set) => { const i = get(); if (i !== undefined) { want.add(i); patches.push(() => set(final.get(i))); } };
  for (const m of out.meshes ?? []) for (const p of m.primitives) {
    if (p.targets) throw new Error('morph targets are not handled');
    for (const k of Object.keys(p.attributes)) take(() => p.attributes[k], (v) => { p.attributes[k] = v; });
    take(() => p.indices, (v) => { p.indices = v; });
  }
  for (const s of out.skins ?? []) take(() => s.inverseBindMatrices, (v) => { s.inverseBindMatrices = v; });
  for (const a of out.animations ?? []) for (const s of a.samplers) { take(() => s.input, (v) => { s.input = v; }); take(() => s.output, (v) => { s.output = v; }); }
  const views = [], accessors = [], chunks = [], final = new Map(), seen = new Map();
  let at = 0;
  const push = (buf, extra = {}) => { const pad = (4 - (buf.length % 4)) % 4; views.push({ buffer: 0, byteOffset: at, byteLength: buf.length, ...extra }); chunks.push(buf, Buffer.alloc(pad)); at += buf.length + pad; return views.length - 1; };
  for (const old of [...want].sort((x, y) => x - y)) {
    const a = structuredClone(json.accessors[old]);
    if (a.sparse) throw new Error('sparse accessors are not handled');
    const bv = json.bufferViews[a.bufferView], el = SIZE[a.componentType] * COMP[a.type], stride = bv.byteStride || el, base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const tight = Buffer.alloc(a.count * el);
    for (let i = 0; i < a.count; i++) bin.copy(tight, i * el, base + i * stride, base + i * stride + el);
    const key = `${a.type}:${a.componentType}:${a.count}:${bv.target ?? 0}:${createHash('sha256').update(tight).digest('hex')}`;
    if (seen.has(key)) { final.set(old, seen.get(key)); continue; }
    const view = push(tight, bv.target ? { target: bv.target } : {});
    delete a.byteOffset; a.bufferView = view; accessors.push(a);
    final.set(old, accessors.length - 1); seen.set(key, accessors.length - 1);
  }
  for (const f of patches) f();
  out.accessors = accessors.length ? accessors : undefined;
  for (const img of out.images ?? []) {
    if (image === 'embed') { const bv = json.bufferViews[img.bufferView]; img.bufferView = push(bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength)); }
    else { delete img.bufferView; img.uri = image.replace(/^uri:/, ''); }
  }
  out.bufferViews = views.length ? views : undefined;
  out.buffers = [{ byteLength: at }];
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return { json: out, bin: Buffer.concat(chunks) };
}

// The clips of two shared animation files, in one file (bones matched by name, so the second file's clips are put on the first file's nodes).
function mergeClips(a, b, namesA, namesB) {
  const at = new Map(a.json.nodes.map((n, i) => [n.name, i])), nameB = (i) => b.json.nodes[i].name;
  const gap = (4 - (a.bin.length % 4)) % 4, shift = a.bin.length + gap;
  const joint = { json: structuredClone(a.json), bin: Buffer.concat([a.bin, Buffer.alloc(gap), b.bin]) };
  const j = joint.json, viewShift = j.bufferViews.length, accShift = j.accessors.length;
  j.bufferViews.push(...b.json.bufferViews.map((v) => ({ ...v, byteOffset: (v.byteOffset ?? 0) + shift })));
  j.accessors.push(...b.json.accessors.map((x) => ({ ...x, bufferView: x.bufferView + viewShift })));
  j.animations = a.json.animations.filter((x) => namesA.includes(x.name));
  for (const anim of b.json.animations.filter((x) => namesB.includes(x.name))) {
    const copy = structuredClone(anim);
    for (const s of copy.samplers) { s.input += accShift; s.output += accShift; }
    for (const c of copy.channels) {
      const i = at.get(nameB(c.target.node));
      if (i === undefined) throw new Error(`bone ${nameB(c.target.node)} is not in the first file`);
      c.target.node = i;
    }
    j.animations.push(copy);
  }
  return repack(joint, { noMesh: true });
}

export function main([adv, skel, mon]) {
  if (!adv || !skel || !mon) throw new Error('usage: node pack-models.mjs <Adventurers folder> <Skeletons folder> <Monsters folder>');
  const out = (...p) => join(HERE, ...p), report = [];
  const note = (p) => report.push(`${p.replace(HERE + '/', '')}  ${statSync(p).size}`);
  const copy = (from, to) => { mkdirSync(dirname(to), { recursive: true }); copyFileSync(from, to); note(to); };
  // 1 and 4: the hero and skeleton files, and the licences
  for (const h of ['Barbarian', 'Knight', 'Mage', 'Rogue']) copy(join(adv, 'Characters/gltf', `${h}.glb`), out('kaykit-adventurers', `${h}.glb`));
  copy(join(adv, 'License.txt'), out('kaykit-adventurers', 'License.txt'));
  copy(join(skel, 'characters/gltf/Skeleton_Minion.glb'), out('kaykit-skeletons', 'Skeleton_Minion.glb'));
  copy(join(skel, 'License.txt'), out('kaykit-skeletons', 'License.txt'));
  copy(join(mon, 'License.txt'), out('quaternius-monsters', 'License.txt'));
  copy(join(mon, 'Big/glTF/Atlas_Monsters.png'), out('quaternius-monsters', 'Atlas_Monsters.png'));
  // 2: the shared rig's clips. The two packs carry the same two files (checked below).
  const rig = (root, f) => join(root, 'Animations/gltf/Rig_Medium', f);
  for (const f of ['Rig_Medium_General.glb', 'Rig_Medium_MovementBasic.glb']) if (!readFileSync(rig(adv, f)).equals(readFileSync(rig(skel, f)))) throw new Error(`${f} differs between the two packs`);
  const merged = mergeClips(readGlb(rig(adv, 'Rig_Medium_General.glb')), readGlb(rig(adv, 'Rig_Medium_MovementBasic.glb')),
    ['Idle_A', 'Hit_A', 'Death_A', 'Throw', 'Use_Item'], ['Walking_A', 'Running_A']);
  writeGlb(out('kaykit-rig-medium', 'Rig_Medium.glb'), merged.json, merged.bin); note(out('kaykit-rig-medium', 'Rig_Medium.glb'));
  copy(join(adv, 'License.txt'), out('kaykit-rig-medium', 'License.txt'));
  // 3: the two monsters
  const tex = 'uri:Atlas_Monsters.png';
  const big = repack(readGlb(join(mon, 'Big/glTF/Orc.gltf')), { clips: ['Idle', 'Walk', 'Run', 'Punch', 'HitReact', 'Death'], image: tex });
  writeGlb(out('quaternius-monsters', 'Big_Orc.glb'), big.json, big.bin); note(out('quaternius-monsters', 'Big_Orc.glb'));
  const blob = repack(readGlb(join(mon, 'Blob/glTF/Orc.gltf')), { clips: ['Idle', 'Walk', 'Bite_Front', 'HitRecieve', 'Death'], image: tex });
  writeGlb(out('quaternius-monsters', 'Blob_Orc.glb'), blob.json, blob.bin); note(out('quaternius-monsters', 'Blob_Orc.glb'));
  console.log(report.join('\n'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
