// The dry run: a homebrew spell cast once in a throw-away game, and again and again with other seeds
// (docs/specs/homebrew.md, Decision 7, row H7, task B6).
//
//   dryRun(kind, entry, { seed, pack, slot, level, runs }) -> { ok, ... }
//
// `ok: false` carries `problems` (sentences): the entry was refused by the registry's checks and nothing ran.
// `ok: true` carries what happened:
//   events    the raw events of the first cast, in the order a table would see them (the client words them);
//   summary   { text, lines, targets, damage, healing, ... }: a short plain account of that cast;
//   repeated  the same spell cast again with seeds seed+1, seed+2 ...: how many runs, average damage, how often saves held,
//             and `stopped`, a sentence, when a ceiling ended the repeats early (and `stopped: null` when none did).
//
// How it works: `newGame(seed)` makes a small game of its own; the entry is installed through the registry (`loadPack`,
// `overlayOf`, `using`), so everything that reads content inside `using` sees it and nothing outside does; the pregenerated
// wizard is given the spell and casts it through `apply()` at dummies laid out to fit its target (creatures, an area of
// each shape, or itself). Foes are goblin warriors with a little more health; the wizard's three companions of the
// starting party stand in as friends, and are hurt, so a healing spell has something to mend. The game is built from the seed
// alone, so the same seed gives the same bytes. Nothing but that game is touched: the content lookups come back as they were.
//
// Pure: no I/O, no clock, no randomness of its own. Bounded: the registry's checks (budget, strict lint, work) run first;
// then the dry run has its own ceilings (`DRYRUN_LIMITS`) on repeats and on events, and says when one stopped it.
import { workOf } from './schema.js';
import { CONTENT, SPELLS } from './index.js';
import { loadPack, overlayOf, using } from './registry.js';
import { apply, current, FT } from '../engine.js';
import { newGame } from '../scenario.js';

export const DRYRUN_LIMITS = Object.freeze({
  runs: 200,            // casts in one dry run, the first one included
  work: 10000,          // work in all: each cast counts the events of the first cast (at least its worst steps, workOf, for a lighter one) and 5 for making the game
  events: 20000,        // events in all the casts together
  shown: 400,           // events returned for the first cast
  seed: 2 ** 31,        // seeds are whole numbers below this
});
const BASE_WORK = 5;
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SOURCE = /^homebrew:([a-z0-9]+(-[a-z0-9]+)*)$/;
const DM = Object.freeze({ role: 'dm', userId: 'dm' });
const CASTER = 'wizard', FRIENDS = ['fighter', 'rogue', 'cleric'];
const FOE_HP = 25, ROSTER = 10;                 // foes carry this many Hit Points; at most this many dummies are laid out

// ---------- small helpers ----------
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const wholeIn = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
const round1 = (x) => Math.round(x * 10) / 10;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const hexDist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
const ring = (c, n) => {                         // the hexes exactly n away from c, n >= 1
  const out = [];
  let h = { q: c.q - n, r: c.r + n };            // start at the south-west corner and walk the six sides
  for (const [dq, dr] of [[1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]]) for (let i = 0; i < n; i++) { out.push(h); h = { q: h.q + dq, r: h.r + dr }; }
  return out;
};
const unique = (list) => { const seen = new Set([ '0,0' ]); return list.filter((h) => { const k = `${h.q},${h.r}`; if (seen.has(k)) return false; seen.add(k); return true; }); };
const disc = (c, n) => [{ ...c }, ...Array.from({ length: n }, (_, i) => ring(c, i + 1)).flat()];

// ---------- the pack the entry is tried in ----------
// A lone entry is tried in a pack of its own, named for the pack its `source` says; with `pack` (a whole pack document) the
// entry is tried inside that pack, so a spell that names a monster of the pack finds it. Both go through `loadPack`.
function packFor(entry, pack) {
  if (pack !== undefined) {
    if (!isObj(pack)) return { problems: ['pack: the pack given is not a pack document'] };
    return { doc: pack };
  }
  const src = isObj(entry) && typeof entry.source === 'string' ? SOURCE.exec(entry.source) : null;
  const id = src ? src[1] : 'dryrun';
  return { doc: { format: 'hextable-pack', v: 1, pack: { id, name: 'Dry run', version: 1, license: 'CC0, by the author', attribution: 'Made for a dry run.' }, spells: [entry] } };
}

// ---------- the game ----------
const flatten = (s, n) => {                      // the valley around the middle is plain grass, so every spot is free
  const tiles = s.map.levels[0].tiles;
  for (const k of Object.keys(tiles)) { const [q, r] = k.split(',').map(Number); if (hexDist({ q, r }, { q: 0, r: 0 }) <= n) tiles[k] = { t: 'grass', lift: 0.6 }; }
};
const spots = (sp) => {
  // Where creatures stand so the spell has something to meet: `near` first (inside the area or in reach), then a few outside.
  const at = (n) => ({ q: n, r: 0 });
  if (sp.aim === 'area') {
    const a = sp.area, reach = Math.max(1, Math.round(a.size / FT));
    const fromSelf = a.shape === 'cone' || a.shape === 'line' || (a.shape === 'cube' && !(sp.range > 0));
    if (a.shape === 'emanation') return { hex: undefined, list: [...ring({ q: 0, r: 0 }, 1), ...ring({ q: 0, r: 0 }, Math.min(reach, 5)), ...ring({ q: 0, r: 0 }, Math.min(reach, 5) + 2)] };
    if (fromSelf) {
      const len = Math.min(reach, 12);
      const list = [];
      for (let k = 1; k <= len + 2; k++) list.push(at(k), { q: k, r: -1 }, { q: k - 1, r: 1 });
      return { hex: { q: 1, r: 0 }, list };
    }
    const d = Math.min(Math.floor(sp.range / FT), 6), centre = at(Math.max(d, 2));
    return { hex: centre, list: [centre, ...ring(centre, 1), ...ring(centre, Math.min(Math.max(1, Math.round(reach / 2)), 4)), ...ring(centre, Math.min(Math.round(reach / FT) + 2, 6))] };
  }
  if (sp.aim === 'creature') {
    const d = Math.max(1, Math.min(Math.floor((typeof sp.range === 'number' ? sp.range : FT) / FT), 4)), near = at(d);
    return { hex: undefined, list: [near, ...disc(near, 2).slice(1)] };
  }
  return { hex: undefined, list: [] };
};
const spotted = (sp) => { const o = spots(sp); return { ...o, list: unique(o.list) }; };

function setup(sp, seed, opts) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== 'party') delete s.entities[id];
  flatten(s, 12);
  apply(s, { type: 'setting', key: 'autoEngage', value: false }, DM);
  const place = (id, to) => { const r = apply(s, { type: 'place', actor: id, to: { q: to.q, r: to.r } }, DM); if (!r.ok) throw new Error(`could not place ${id}: ${r.error}`); };
  place(CASTER, { q: 0, r: 0 });
  const wiz = s.entities[CASTER];
  wiz.slots = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [n, 4]));
  wiz.slotsMax = { ...wiz.slots };
  if (opts.level !== 1) wiz.level = opts.level;
  wiz.spells.push(sp.id);
  const { hex, list } = spotted(sp);
  const crowd = [];                              // who stands where: [id, role]
  const heal = sp.heals || !sp.harmful;
  if (sp.aim === 'self' || sp.aim === 'object') {
    // nobody needed: a self spell (a teleport wants a place to go, named below), or one aimed at an object (it is put below)
  } else {
    const most = sp.aim === 'creature' ? Math.min(sp.count ?? 1, ROSTER) : ROSTER;
    const friends = sp.aim === 'creature' ? (heal ? Math.min(most, FRIENDS.length) : 0) : Math.min(2, FRIENDS.length);
    const foes = sp.aim === 'creature' ? (heal ? 0 : most) : Math.min(ROSTER - friends, list.length - friends);
    // Friends take the first spots of an area (inside it), then foes fill the rest; a creature spell's targets stand close.
    const order = sp.aim === 'area' ? list : list;
    let n = 0;
    for (let i = 0; i < friends; i++) { const id = FRIENDS[i], w = s.entities[id]; place(id, order[n++]); w.hp = Math.max(1, Math.ceil(w.hpMax / 2)); crowd.push([id, 'friend']); }
    for (let i = 0; i < foes; i++) {
      const r = apply(s, { type: 'spawn', monster: 'goblin-warrior', at: order[n++] }, DM);
      if (!r.ok) throw new Error(`could not place a dummy: ${r.error}`);
      const id = r.events[0].id; s.entities[id].hp = s.entities[id].hpMax = FOE_HP; crowd.push([id, 'foe']);
    }
    // A friend that is not in the area is moved off to the side, out of everything.
    for (const id of FRIENDS) if (!crowd.some(([c]) => c === id)) place(id, { q: -9, r: 4 + FRIENDS.indexOf(id) });
  }
  if (sp.aim === 'self' || sp.aim === 'object') for (const id of FRIENDS) place(id, { q: -9, r: 4 + FRIENDS.indexOf(id) });
  // A spell aimed at an object (Knock) is given one to work on: a locked chest two spaces from the caster.
  if (sp.aim === 'object') s.map.objects.push({ id: 'dryrun-chest', def: 'chest', level: s.map.levels[0].id, at: { q: 2, r: 0 }, state: 'locked' });
  // The fight needs a foe to go on. One stands far off to the north-east, out of reach of everything (not part of the crowd).
  if (!crowd.some(([, role]) => role === 'foe')) {
    const r = apply(s, { type: 'spawn', monster: 'goblin-warrior', at: { q: 9, r: -6 } }, DM);
    if (!r.ok) throw new Error(`could not place a distant dummy: ${r.error}`);
  }
  const r = apply(s, { type: 'startEncounter', center: { q: 0, r: 0 }, radius: 10 }, DM);
  if (!r.ok) throw new Error(`could not start the dummy fight: ${r.error}`);
  for (let i = 0; i < 40 && current(s) !== CASTER; i++) {
    const e = apply(s, { type: 'endTurn', actor: current(s) }, DM);
    if (!e.ok) throw new Error(`could not reach the caster's turn: ${e.error}`);
  }
  if (current(s) !== CASTER) throw new Error('could not reach the caster\'s turn');
  // A spell aimed at the dead (Revivify) is given a body to work on: the first friend, fallen a moment ago.
  if (sp.def?.target?.creature?.dead === true) for (const [id] of crowd) { const t = s.entities[id]; t.hp = 0; t.dead = true; if (Number.isFinite(s.clock)) t.diedAt = s.clock; }
  return { s, crowd, hex, wiz };
}

// What the cast is asked to do, from the spell's profile: who to aim at, where, which choice, which slot.
function castOf(sp, game, opts) {
  const a = { type: 'cast', actor: CASTER, spell: sp.id };
  if (sp.level > 0) a.slot = opts.slot ?? sp.level;
  const ids = game.crowd.map(([id]) => id);
  if (sp.aim === 'creature') a.targets = ids.slice(0, Math.max(1, Math.min(ids.length, sp.count ?? 1)));
  else if (sp.aim === 'area' && game.hex) a.hex = game.hex;
  else if (sp.aim === 'object') a.object = 'dryrun-chest';
  else if (sp.aim === 'self' && sp.teleport) a.hex = { q: Math.max(1, Math.min(Math.floor(sp.teleport.feet / FT / 2), 6)), r: 0 };
  const pick = sp.def.choice;
  if (pick) a.choice = (pick.from ?? CONTENT_CHOICES[pick.of])[0];
  return a;
}
const CONTENT_CHOICES = Object.freeze({
  skill: ['athletics'], ability: ['str'], damageType: ['fire'], condition: ['poisoned'], command: ['halt'], curse: ['str'],
});

// ---------- one cast ----------
function castOnce(sp, seed, opts) {
  const game = setup(sp, seed, opts);
  const action = castOf(sp, game, opts);
  const names = Object.fromEntries(Object.entries(game.s.entities).map(([id, e]) => [id, e.name]));
  const before = Object.fromEntries(Object.entries(game.s.entities).map(([id, e]) => [id, { hp: e.hp, temp: e.tempHp ?? 0 }]));
  const r = apply(game.s, action, DM);
  return { ok: r.ok, error: r.ok ? null : r.error, events: r.ok ? r.events : [], names, before, crowd: game.crowd, action, state: game.s };
}

const friendSet = (crowd) => new Set(crowd.filter(([, r]) => r === 'friend').map(([id]) => id));
// ---------- reading the events ----------
function tally(events, friends = new Set()) {
  const t = { friendDamage: 0, hits: 0, misses: 0, crits: 0, saves: 0, saved: 0, damage: 0, healing: 0, temp: 0, conditions: 0, manual: 0, down: 0, moved: 0 };
  for (const e of events) {
    if (e.type === 'attack') { if (e.hit) t.hits++; else t.misses++; if (e.crit) t.crits++; }
    else if (e.type === 'save') { t.saves++; if (e.success) t.saved++; }
    else if (e.type === 'damage') { t.damage += e.amount ?? 0; if (friends.has(e.target)) t.friendDamage += e.amount ?? 0; }
    else if (e.type === 'heal') t.healing += e.amount ?? 0;
    else if (e.type === 'tempHp') t.temp += e.amount ?? 0;
    else if (e.type === 'cond') t.conditions++;
    else if (e.type === 'manual') t.manual++;
    else if (e.type === 'down' || e.type === 'died') t.down++;
    else if (e.type === 'moved' || e.type === 'fell') t.moved++;
  }
  return t;
}
const nameIn = (names, id) => names[id] ?? (typeof id === 'string' ? id : 'someone');
const COND = { blinded: 'blinded', charmed: 'charmed', deafened: 'deafened', exhaustion: 'exhausted', frightened: 'frightened', grappled: 'grappled', incapacitated: 'incapacitated', invisible: 'invisible',
  paralyzed: 'paralyzed', petrified: 'petrified', poisoned: 'poisoned', prone: 'knocked prone', restrained: 'restrained', stunned: 'stunned', unconscious: 'unconscious' };
const cap = (s) => String(s).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 300);

function summarise(sp, run, level, slot) {
  const { events, names, crowd } = run, lines = [], n = (id) => nameIn(names, id), role = Object.fromEntries(crowd);
  const t = tally(events, friendSet(crowd)), cast = events.find((e) => e.type === 'cast');
  const targets = (cast?.targets ?? []).map((id) => ({ id, name: n(id), role: role[id] ?? (id === CASTER ? 'caster' : 'other') }));
  const how = slot > sp.level ? ` with a level ${slot} slot` : '';
  lines.push(`${n(CASTER)} (level ${level}) casts ${sp.name}${how}.`);
  if (cast) {
    if (targets.length) lines.push(`Reached ${plural(targets.length, 'creature')}: ${targets.map((x) => `${x.name} (${x.role === 'friend' ? 'a friend' : x.role === 'foe' ? 'a foe' : x.role})`).join(', ')}.`);
    else lines.push(sp.aim === 'self' ? 'It is aimed at the caster alone.' : 'It reached nobody.');
    const missed = crowd.filter(([id]) => !(cast.targets ?? []).includes(id));
    if (sp.aim === 'area' && missed.length) lines.push(`Standing outside it: ${missed.map(([id]) => n(id)).join(', ')}.`);
  }
  for (const e of events) {
    if (e.type === 'attack') lines.push(`${n(e.actor)} attacks ${n(e.target)}: ${e.nat === undefined ? '' : `rolled ${e.nat}, `}${e.total ?? '?'}${e.ac === undefined ? '' : ` against AC ${e.ac}`}: ${e.crit ? 'a critical hit' : e.hit ? 'a hit' : 'a miss'}.`);
    else if (e.type === 'save') lines.push(`${n(e.id)} saves on ${String(e.abil).toUpperCase()}: ${e.roll === false ? 'fails automatically' : `${e.total ?? '?'} against DC ${e.dc}`}: ${e.success ? 'saved' : 'failed'}.`);
    else if (e.type === 'damage') lines.push(`${n(e.target)} takes ${e.amount} ${e.dtype} damage${e.note ? ` (${cap(e.note)})` : ''}.`);
    else if (e.type === 'heal') lines.push(`${n(e.target)} regains ${e.amount} Hit Points.`);
    else if (e.type === 'tempHp') lines.push(e.amount > 0 ? `${n(e.id)} gains ${e.amount} Temporary Hit Points.` : `${n(e.id)} loses its Temporary Hit Points.`);
    else if (e.type === 'cond') lines.push(`${n(e.id)} is ${COND[e.cond] ?? e.cond}.`);
    else if (e.type === 'condEnd') lines.push(`${n(e.id)} is no longer ${COND[e.cond] ?? e.cond}.`);
    else if (e.type === 'moved') lines.push(`${n(e.id)} is ${e.teleport ? 'teleported' : e.forced ? 'moved by force' : 'moved'}.`);
    else if (e.type === 'fell') lines.push(`${n(e.id)} falls ${e.feet} feet.`);
    else if (e.type === 'down') lines.push(`${n(e.id)} drops to 0 Hit Points.`);
    else if (e.type === 'died') lines.push(`${n(e.id)} dies.`);
    else if (e.type === 'effectStart') lines.push(`${e.name} takes hold${e.conc ? ` (${n(e.source)} concentrates)` : ''}: ${cap(e.lasts)}.`);
    else if (e.type === 'summoned') lines.push(`${n(e.by)} summons a creature.`);
    else if (e.type === 'countered') lines.push(`${sp.name} was countered.`);
    else if (e.type === 'manual') lines.push(`The DM does this (${cap(e.name)}): ${cap(e.text)}`);
  }
  if (sp.def.zone) lines.push('It leaves a zone behind that acts when a creature enters it or starts or ends a turn there; this dry run casts once and stops, so the zone is not played.');
  if (!events.some((e) => ['attack', 'save', 'damage', 'heal', 'tempHp', 'cond', 'moved', 'fell', 'summoned', 'effectStart', 'manual'].includes(e.type))) lines.push('The engine did nothing visible with it.');
  const handed = events.filter((e) => e.type === 'manual').map((e) => ({ name: cap(e.name), text: cap(e.text) }));
  return { lines, targets, handedToDM: handed, friendDamage: t.friendDamage, hits: t.hits, misses: t.misses, saves: t.saves, saved: t.saved, damage: t.damage, healing: t.healing, tempHp: t.temp, conditions: t.conditions };
}

// ---------- the repeats ----------
function repeat(sp, seed, opts, first, workEach) {
  const L = DRYRUN_LIMITS, want = opts.runs;
  const sum = { friendDamage: 0, runs: 0, damage: 0, healing: 0, saves: 0, saved: 0, hits: 0, attacks: 0, manual: 0, conditions: 0, minDamage: Infinity, maxDamage: 0, refused: 0 };
  let events = 0, work = 0, stopped = null;
  const take = (run) => {
    sum.runs++;
    if (!run.ok) { sum.refused++; return; }
    const t = tally(run.events, friendSet(run.crowd));
    sum.friendDamage += t.friendDamage; sum.damage += t.damage; sum.healing += t.healing; sum.saves += t.saves; sum.saved += t.saved; sum.hits += t.hits; sum.attacks += t.hits + t.misses;
    sum.manual += t.manual ? 1 : 0; sum.conditions += t.conditions;
    sum.minDamage = Math.min(sum.minDamage, t.damage); sum.maxDamage = Math.max(sum.maxDamage, t.damage);
    events += run.events.length;
  };
  take(first); work += workEach;
  for (let i = 1; i < want; i++) {
    if (work + workEach > L.work) { stopped = `stopped after ${plural(sum.runs, 'cast')}: the work ceiling (${L.work}) for a spell this heavy`; break; }
    if (events >= L.events) { stopped = `stopped after ${plural(sum.runs, 'cast')}: the event ceiling (${L.events})`; break; }
    take(castOnce(sp, seed + i, opts)); work += workEach;
  }
  const ran = sum.runs - sum.refused;
  return {
    requested: want, runs: sum.runs, stopped, firstSeed: seed, lastSeed: seed + sum.runs - 1,
    avgDamage: ran ? round1(sum.damage / ran) : 0, avgFriendDamage: ran ? round1(sum.friendDamage / ran) : 0, minDamage: ran ? sum.minDamage : 0, maxDamage: ran ? sum.maxDamage : 0, avgHealing: ran ? round1(sum.healing / ran) : 0,
    saves: sum.saves, savesMade: sum.saved, saveRate: sum.saves ? round1((100 * sum.saved) / sum.saves) : null,
    attacks: sum.attacks, hits: sum.hits, hitRate: sum.attacks ? round1((100 * sum.hits) / sum.attacks) : null,
    castsHandedToDM: sum.manual, refusedCasts: sum.refused,
  };
}
function repeatedLine(rp) {
  const parts = [`Over ${plural(rp.runs, 'cast')} (seeds ${rp.firstSeed} to ${rp.lastSeed})`];
  const facts = [];
  if (rp.avgDamage || rp.maxDamage) facts.push(`average damage ${rp.avgDamage} per cast (${rp.minDamage} to ${rp.maxDamage})`);
  if (rp.avgFriendDamage) facts.push(`${rp.avgFriendDamage} of that falls on the friends standing in it`);
  if (rp.avgHealing) facts.push(`average healing ${rp.avgHealing} per cast`);
  if (rp.saves) facts.push(`saves held ${rp.savesMade} of ${rp.saves} (${rp.saveRate}%)`);
  if (rp.attacks) facts.push(`attacks hit ${rp.hits} of ${rp.attacks} (${rp.hitRate}%)`);
  if (rp.castsHandedToDM) facts.push(`something was handed to the DM in ${rp.castsHandedToDM} of them`);
  if (rp.refusedCasts) facts.push(`the engine refused ${rp.refusedCasts} of them`);
  if (!facts.length) facts.push('there was no damage, healing, save or attack to count');
  return `${parts[0]}: ${facts.join('; ')}.${rp.stopped ? ` The repeats ${rp.stopped}.` : ''}`;
}

// ---------- the entry point ----------
export function dryRun(kind, entry, opts = {}) {
  try { return run(kind, entry, opts); }
  catch (err) { return { ok: false, problems: [`dry run: could not run (${String(err?.message ?? err).slice(0, 200)})`] }; }
}

function run(kind, entry, opts) {
  if (kind !== 'spell' && kind !== 'spells') return { ok: false, problems: [`dry run: only a spell can be tried so far, not "${typeof kind === 'string' ? kind.slice(0, 40) : kind}"`] };
  if (!isObj(opts)) return { ok: false, problems: ['dry run: the options are an object'] };
  const L = DRYRUN_LIMITS, bad = [];
  const seed = opts.seed ?? 1, level = opts.level ?? 1, runs = opts.runs ?? L.runs;
  if (!wholeIn(seed, 0, L.seed - 1)) bad.push(`dry run: the seed is a whole number from 0 to ${L.seed - 1}`);
  if (!wholeIn(level, 1, 20)) bad.push('dry run: the caster\'s level is a whole number from 1 to 20');
  if (!wholeIn(runs, 1, L.runs)) bad.push(`dry run: the number of casts is a whole number from 1 to ${L.runs}`);
  if (opts.slot !== undefined && !wholeIn(opts.slot, 1, 9)) bad.push('dry run: the slot is a whole number from 1 to 9');
  if (bad.length) return { ok: false, problems: bad };
  // The registry's checks run first. A refused entry returns its sentences and nothing is run.
  const made = packFor(entry, opts.pack);
  if (made.problems) return { ok: false, problems: made.problems };
  const loaded = loadPack(made.doc);
  if (!loaded.ok) return { ok: false, problems: loaded.problems };
  const id = isObj(entry) ? entry.id : undefined;
  if (typeof id !== 'string' || !loaded.pack.ids.includes(id)) return { ok: false, problems: [`dry run: the spell "${String(id).slice(0, 80)}" is not in the pack`] };
  if (!(made.doc.spells ?? []).some((e) => e?.id === id)) return { ok: false, problems: [`dry run: "${id}" is not a spell of the pack`] };
  const overlay = overlayOf([loaded.pack]);
  const spec = (made.doc.spells ?? []).find((e) => e.id === id);
  const work = Math.max(1, workOf('spells', spec).work);
  return using(overlay, () => {
    const sp = SPELLS[id];
    const slot = sp.level > 0 ? opts.slot ?? sp.level : 0;
    if (opts.slot !== undefined && sp.level > 0 && slot < sp.level) return { ok: false, problems: [`dry run: ${sp.name} is a level ${sp.level} spell; a level ${slot} slot is too low`] };
    const base = { id, name: sp.name, tier: sp.def.tier, seed, level, slot };
    if (sp.time === 'reaction') {
      return { ok: true, ...base, ran: false, events: [], summary: { text: `${sp.name} is cast as a Reaction, in answer to something another creature does. The dry run does not stage that, so it did not run; read it with the reader instead.`, lines: [], targets: [], handedToDM: [] }, repeated: null };
    }
    const first = castOnce(sp, seed, { slot, level, runs });
    if (!first.ok) {
      const text = `The engine refused the cast: ${cap(first.error)}`;
      return { ok: true, ...base, ran: false, events: [], summary: { text, lines: [text], targets: [], handedToDM: [] }, repeated: null };
    }
    const sum = summarise(sp, first, level, slot);
    const rp = repeat(sp, seed, { slot, level, runs }, first, BASE_WORK + Math.max(work, first.events.length));
    const shown = first.events.length > L.shown;
    const lines = [...sum.lines];
    if (shown) lines.push(`The cast made ${first.events.length} events; the first ${L.shown} are returned.`);
    if (rp.runs > 1 || rp.stopped) lines.push(repeatedLine(rp));
    return { ok: true, ...base, ran: true, events: shown ? first.events.slice(0, L.shown) : first.events, truncated: shown, summary: { ...sum, lines, text: lines.join('\n') }, repeated: rp };
  });
}

// What a spell of the pack does in a dry run, one result for each spell, in the pack's order. A refused pack gives one refusal.
export function dryRunPack(pack, opts = {}) {
  const spells = isObj(pack) && Array.isArray(pack.spells) ? pack.spells : [];
  if (!isObj(pack)) return { ok: false, problems: ['pack: is not a pack document'], results: [] };
  const loaded = loadPack(pack);
  if (!loaded.ok) return { ok: false, problems: loaded.problems, results: [] };
  return { ok: true, problems: [], results: spells.map((e) => dryRun('spell', e, { ...opts, pack })) };
}
