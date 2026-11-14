// Views: what a given person at the table is allowed to know.
//
//   view(state, viewer)                -> a state safe to send to that viewer
//   viewEvents(events, state, viewer)  -> the events that viewer may see, redacted
//
// `viewer` is { role, userId }, the same shape apply() takes as ctx. The DM gets
// the state and events untouched. Everyone else gets a copy built field by field
// from allow lists, so anything not listed here is never sent: a field added to
// the game state later stays private until someone lists it.
//
// The engine never reads a view and never produces one. Design: docs/specs/hidden-information.md
import { HEX, gridOf, col, parse } from './grid.js';
import { conditionDef, visibleConditions } from './modifiers.js';
import { concealed } from './space.js';
import { memoryOf, partyView, sightRule, tileSent } from './vision.js';
import { lightAt, lightSources } from './sight.js';
import { shownTo } from './handouts.js';
import { playerConclusion } from './rewards.js';
import { barriers, objectDef, objectHexes, objectSegment } from './walls.js';

const isDM = (viewer) => viewer?.role === 'dm';

// How a viewer may know a creature: 'open' (full record), 'seen' (what you could
// tell by looking) or 'hidden' (not at all). A missing creature counts as hidden.
export function classify(state, id) {
  const e = state.entities[id];
  if (!e) return 'hidden';
  if (e.side === 'party') return 'open';
  if (concealed(state.map, e)) return 'hidden';             // hidden by the DM, hiding, or somewhere not yet seen
  // Under the los and light table rules, also any creature nobody in the party can see now.
  return sightRule(state) !== 'rooms' && !partyView(state).creatures.has(id) ? 'hidden' : 'seen';
}

export const healthOf = (e) =>
  e.dead ? 'dead' : e.hp <= 0 ? 'down' : e.hp <= e.maxHp / 2 ? 'bloodied' : 'healthy';
const seenHp = (e) => (!e.dead && e.hp > 0 ? 1 : 0);      // keeps up(e) true or false without the number


// A creature not of the party that has taken a form (Wild Shape) looks like the Beast and nothing
// else: its name, stat block and size are the Beast's, and neither its own name, its look, nor
// that it is in a form is sent. Players who saw it change were told so by the `form` event; the
// view does not remember for them. The party's own forms are in their open records.
const inForm = (e) => !!e.form && e.side !== 'party';
export const seenName = (e) => (inForm(e) ? e.form.name ?? e.name : e.name);

function seenRecord(e) {
  const cond = {};
  for (const c of visibleConditions(e)) cond[c] = true;         // which conditions show is decided by their data
  const form = inForm(e);
  return {
    id: e.id, name: seenName(e), kind: form ? 'npc' : e.kind, side: e.side, tpl: form ? e.form.block : e.tpl, size: e.size,
    pos: { q: e.pos.q, r: e.pos.r, z: e.pos.z }, look: e.look && !form ? structuredClone(e.look) : undefined,
    dead: !!e.dead, hp: seenHp(e), health: healthOf(e), cond,
    ...(e.light ? { light: { bright: e.light.bright, dim: e.light.dim } } : {}),     // a carried light is plain to see
    ...(e.remains ? { remains: e.remains } : {}),                                    // a frozen statue or dust where it fell is plain to see
  };
}

// A creature the party cannot see takes its turn. Under the table rule `unseenTurns: 'say'` (the
// default) players are told what a DM would say at a table, "something moves where you cannot
// see": the order shows one slot `{ someone: true }` while such a turn is taken, placed after the
// last creature they can see that comes before it, and holding no id, no name, no number. A run of
// unseen turns one after another is one slot and one `turn` event, so how many there are is not
// told. Under `quiet` nothing is said: the order shows no one's turn (`turn: -1`).
export const unseenTurns = (state) => state.settings?.unseenTurns ?? 'say';

function viewEncounter(state) {
  const enc = state.encounter;
  if (!enc) return null;
  const currentId = enc.order[enc.turn]?.id ?? null;
  const order = [];
  let slot = -1;                                    // where an unseen turn shows: after the last seen creature before it
  enc.order.forEach((o, i) => {
    const c = classify(state, o.id);
    if (c === 'open') order.push({ id: o.id, init: o.init, dex: o.dex });
    else if (c === 'seen') order.push({ id: o.id });
    if (i < enc.turn && c !== 'hidden') slot = order.length;
  });
  const activeHidden = currentId !== null && classify(state, currentId) === 'hidden';
  let turn = order.findIndex((o) => o.id === currentId);
  if (activeHidden && unseenTurns(state) === 'say') {
    // Before every seen creature, the run wraps round from the end of the order.
    const at = slot === -1 ? order.length : slot;
    order.splice(at, 0, { someone: true });
    turn = at;
  }
  const activeOpen = currentId !== null && classify(state, currentId) === 'open';
  return {
    id: enc.id, center: { q: enc.center.q, r: enc.center.r }, radius: enc.radius,
    arena: Object.fromEntries(Object.keys(enc.arena).filter((k) => shownMap(state).cols.has(k)).map((k) => [k, 1])), round: enc.round,
    turn,
    // What the active creature has left is its own business unless it is one of ours.
    // Zeros, not null, so the engine's helpers run on a view without special cases.
    // Attacks a Multiattack or Extra Attack left (`budget.attacks`) go with the rest, and only then.
    budget: activeOpen ? structuredClone(enc.budget) : { move: 0, action: 0, bonus: 0 },
    // What an unseen creature has done with its turn is not theirs to know either.
    // A flag that names a creature the party does not know of (`hit:<attacker>:<target>`, `attacked:<id>`) is left out.
    flags: activeHidden ? {} : Object.fromEntries(Object.entries(enc.flags).filter(([k]) => !k.split(':').some((x) => state.entities[x] && classify(state, x) === 'hidden'))),
    order,
  };
}

// Whether the turn before this one (a `turn` event, live or from the record) was one players
// could not see when it was taken. Read from the record, where each entry keeps the creatures
// players did not know of then. The start of a fight, or nothing found, counts as seen.
function turnBeforeUnseen(state, ev) {
  const tl = state.timeline ?? [];
  let i = tl.lastIndexOf(ev);
  if (i < 0) for (i = tl.length - 1; i >= 0; i--) { const x = tl[i]; if (x.type === 'turn' && x.id === ev.id && x.round === ev.round) break; }
  for (let j = i - 1; j >= 0; j--) {
    const x = tl[j];
    if (x.type === 'encounterStart' || x.type === 'encounterEnd') return false;
    if (x.type === 'turn') return Array.isArray(x.unseen) && x.unseen.includes(x.id);
  }
  return false;
}

export function view(state, viewer) {
  if (isDM(viewer)) return state;
  return { ...playerView(state), handouts: viewHandouts(state, viewer), reactions: viewReactions(state, viewer), prompt: viewPrompt(state, viewer) };
}

// An action waiting for a reaction to be answered (reactions.js; engine.js, apply), as this viewer
// may know of it. The player who controls the creature being asked gets the question:
// { n, reactor, trigger, options: [{ reaction, name, slots?, ac? }], by?, attack?, total?, ac?,
// crit?, spell? } (answer with { type: 'react', prompt: n, take, slot? }). `by` is left out where
// the party cannot see who set it off. Every other player gets only { waiting: true }: the table
// waits, but not on whom or for what, nor what action is waiting; and only when the party can
// perceive what set it off (its creature and the waiting action's actor are known to the party),
// so that a hidden creature's attack does not show itself by making the table wait. When the party
// cannot, the asked player still gets the question and every other player null. Nothing waits:
// null. The DM has the whole record in the state (`pending`) and gets it here too.
export function viewPrompt(state, viewer) {
  const p = state.pending;
  if (!p) return null;
  if (isDM(viewer)) return { n: p.n, ...structuredClone(p.ask), action: structuredClone(p.action) };
  const t = state.entities[p.ask.reactor];
  if (!t || typeof viewer?.userId !== 'string' || t.owner !== viewer.userId) return perceived(state, p) ? { waiting: true } : null;
  const q = p.ask, out = { n: p.n, reactor: t.id, trigger: q.trigger, options: q.options.map((o) => pick(o, ['reaction', 'name', 'slots', 'ac'])) };
  if (typeof q.by === 'string' && classify(state, q.by) !== 'hidden') out.by = q.by;
  // `dtype`: the damage type its own creature is taking (Superior Hunter's Defense).
  for (const k of ['attack', 'total', 'ac', 'crit', 'spell', 'dtype']) if (q[k] !== undefined) out[k] = q[k];
  return structuredClone(out);
}

// Whether the party can perceive what a waiting question was set off by: the creature that set it
// off and the creature whose action waits, where each is named, are not hidden from the party.
function perceived(state, p) {
  const who = [p.ask?.by, p.action?.actor].filter((x) => typeof x === 'string');
  return who.every((id) => classify(state, id) !== 'hidden');
}

// The standing instructions for reactions (reactions.js) of the creatures this viewer controls,
// and of nobody else's: { [creature id]: { [reaction id]: when } }. Only what was set is kept;
// anything absent is the default. Like handouts, the one part of a player's view that is theirs alone.
export function viewReactions(state, viewer) {
  const out = {};
  if (typeof viewer?.userId !== 'string') return out;
  for (const [id, e] of Object.entries(state.entities)) if (e.owner === viewer.userId && e.reactions) out[id] = structuredClone(e.reactions);
  return out;
}

// The scene going on, as players are told of it: its title and picture and who is in it, with
// names and portraits. Never the DM's notes on anyone, nor anything of a scene that is not open
// (one being prepared, or set aside): to a player that is no scene at all. The transcript is the `say` events.
export function viewScene(state) {
  const sc = state.scene;
  if (!sc?.open) return null;
  return { id: sc.id, title: sc.title, ...(sc.image !== undefined && { image: sc.image }),
    present: sc.present.map((p) => ({ id: p.id, name: p.name, ...(p.portrait !== undefined && { portrait: p.portrait }) })), open: true };
}
// What every player is sent, but for the handouts shown to each: the party sees as one, so a table
// server builds this once per change and gives it to all its players (packages/server/src/tables.js).
export function playerView(state) {
  const entities = {};
  for (const [id, e] of Object.entries(state.entities)) {
    const c = classify(state, id);
    if (c === 'open') {
      entities[id] = structuredClone(e);
      delete entities[id].reactions;                     // standing instructions are their controller's and the DM's (viewReactions)
      if (e.follow && classify(state, e.follow) !== 'open') delete entities[id].follow;     // only ever a party member, but never point at what they cannot see
    }
    else if (c === 'seen') entities[id] = seenRecord(e);
  }
  return {
    // No `seq`: it counts creatures as they are added, so it would tick when the DM adds a hidden one.
    version: state.version, clock: state.clock,
    settings: structuredClone(state.settings),
    map: structuredClone(shownMap(state).doc),
    entities,
    encounter: viewEncounter(state),
    // The rewards of the last fight: that they are waiting, or what the DM published (rewards.js).
    conclusion: playerConclusion(state.conclusion, (f) => (state.entities[f.id] ? seenName(state.entities[f.id]) : f.name)),
    effects: viewEffects(state),
    scene: viewScene(state),
    ...(sightRule(state) !== 'rooms' ? { sight: structuredClone(shownMap(state).sight) } : {}),
  };
}

// Handouts shown to this viewer, without the list of who else has them.
export function viewHandouts(state, viewer) {
  return (state.handouts ?? []).filter((h) => shownTo(h, viewer?.userId))
    .map((h) => ({ id: h.id, title: h.title, ...(h.text !== undefined && { text: h.text }), ...(h.asset !== undefined && { asset: h.asset }) }));
}

// ---------- the map ----------
// Players are sent the hexes of revealed regions and of no region, the stretches of wall beside
// those hexes, the objects that touch them, and the regions already revealed. Nothing else: an
// unrevealed room is simply absent. Built once and kept until the map or what is revealed changes.
// A cell's corner, in feet from its centre, and a hair more: `G.cornerReach` of the map's grid
// (5/√3 on hexes; docs/specs/square-grid.md, E7). On squares the stretch is the part inside the
// square itself and a hair round it (half a side and 0.02 ft each way), not a circle through its
// corners, which would reach a foot into the square beyond (review of #262, L2).
const reachOf = (G) => G.cornerReach + 0.02;
export const SQUARE_CLIP = 2.5 + 0.02;
// The stretches of a wall that lie within `reach` of any of these cell centres, or, with
// `box` set, within `box` feet of one along each axis (a square).
export function clipWall(w, centres, reach = reachOf(HEX), box = 0) {
  const REACH = reach;
  const [ax, ay] = w.a, dx = w.b[0] - ax, dy = w.b[1] - ay, len2 = dx * dx + dy * dy, spans = [];
  for (const [cx, cy] of centres) {
    if (box) {                                                     // the segment's part inside the box round this centre
      let t0 = 0, t1 = 1;
      for (const [d, v, c] of [[dx, ax, cx], [dy, ay, cy]]) {
        if (Math.abs(d) < 1e-12) { if (Math.abs(v - c) > box) { t0 = 1; t1 = 0; } continue; }
        let u0 = (c - box - v) / d, u1 = (c + box - v) / d;
        if (u0 > u1) [u0, u1] = [u1, u0];
        t0 = Math.max(t0, u0); t1 = Math.min(t1, u1);
      }
      if (t0 <= t1) spans.push([t0, t1]);
      continue;
    }
    const fx = ax - cx, fy = ay - cy;
    if (!len2) { if (fx * fx + fy * fy <= REACH * REACH) spans.push([0, 1]); continue; }
    const b = 2 * (fx * dx + fy * dy), disc = b * b - 4 * len2 * (fx * fx + fy * fy - REACH * REACH);
    if (disc < 0) continue;
    const root = Math.sqrt(disc), t0 = Math.max(0, (-b - root) / (2 * len2)), t1 = Math.min(1, (-b + root) / (2 * len2));
    if (t0 <= t1) spans.push([t0, t1]);
  }
  spans.sort((p, q) => p[0] - q[0]);
  const merged = [];
  for (const sp of spans) { const last = merged.at(-1); if (last && sp[0] <= last[1] + 1e-9) last[1] = Math.max(last[1], sp[1]); else merged.push([...sp]); }
  const whole = merged.length === 1 && merged[0][0] === 0 && merged[0][1] === 1;
  return merged.map(([t0, t1], i) => ({ id: whole ? w.id : `${w.id}~${i}`, level: w.level, kind: w.kind, a: [ax + dx * t0, ay + dy * t0], b: [ax + dx * t1, ay + dy * t1] }));
}
const stateDef = (o, st) => objectDef(o)?.states[st];
const mapCache = new WeakMap();
// Under the los and light rules (vision.js) a thing is sent as it is while the party sees it, and
// as it was when last seen otherwise; one never seen is not sent (a door: once a tile beside it is).
// Tiles under the light rule are only those the party has made out (map.seen). `live` is the things
// in view now, for events; `sight` is what the party sees now, for the renderer.
function shownMap(state) {
  const map = state.map, rule = sightRule(state), pv = partyView(state), mem = rule === 'rooms' ? null : memoryOf(map);
  const sig = `${rule}|${pv.n}|${barriers(map).sig}|${map.regions.map((r) => `${r.id}:${r.revealed ? 1 : 0}:${r.hexes.length}`).join()}|${map.levels.map((l) => `${Object.keys(l.tiles).length}:${l.name}:${l.z}:${l.image ? JSON.stringify(l.image) : ''}`).join()}` +
    (mem ? `|${[...mem.tiles.values()].reduce((a, x) => a + x.size, 0)}|${JSON.stringify(mem.objects)}` : '');
  const had = mapCache.get(map);
  if (had?.sig === sig) return had;
  const stateOf = (o) => (rule === 'rooms' || pv.objects.has(o.id) ? o.state : mem.objects[o.id]);       // undefined: not known
  const G = gridOf(map), cols = new Set(), levels = [], centres = new Map();
  for (const l of map.levels) {
    const tiles = {}, cs = [];
    for (const k in l.tiles) { const h = parse(k); if (tileSent(state, l.id, h, rule)) { tiles[k] = { ...l.tiles[k] }; cols.add(k); cs.push(G.center(h)); } }
    // A level with nothing shown is not mentioned, and neither is its background picture.
    if (cs.length) { levels.push({ id: l.id, name: l.name, z: l.z, tiles, ...(l.image && { image: { asset: l.image.asset, feet: [...l.image.feet], origin: [...l.image.origin] } }) }); centres.set(l.id, cs); }
  }
  const has = (levelId, h) => !!levels.find((l) => l.id === levelId)?.tiles[col(h)];
  const hiddenNow = (o) => { const st = stateOf(o) ?? o.state; return !!stateDef(o, st)?.hidden && ['move', 'sight'].every((w) => stateDef(o, st).blocks.includes(w)); };
  const doc = {
    format: map.format, id: map.id, name: map.name, grid: map.grid, cellFeet: map.cellFeet, levels,
    // An undiscovered door is sent as the wall it passes for. Walls are sorted and renumbered so
    // that nothing about a wall's name or place in the list says which one is not a wall.
    walls: [...map.walls, ...map.objects.filter((o) => objectSegment(o, G) && hiddenNow(o))
      .map((o) => ({ id: o.id, level: o.level, kind: 'wall', a: objectSegment(o, G)[0], b: objectSegment(o, G)[1] }))]
      .flatMap((w) => (centres.has(w.level) ? clipWall(w, centres.get(w.level), reachOf(G), G.kind === 'square' ? SQUARE_CLIP : 0) : []))
      // Every piece runs from its lower end to its higher one (x, then y), so its direction says
      // nothing of how it was drawn: a secret door's piece is the grid's, a wall's its drawer's
      // (review of #262, M2).
      .map((w) => (w.a[0] > w.b[0] || (w.a[0] === w.b[0] && w.a[1] > w.b[1]) ? { ...w, a: w.b, b: w.a } : w))
      .sort((p, q) => p.a[0] - q.a[0] || p.a[1] - q.a[1] || p.b[0] - q.b[0] || p.b[1] - q.b[1] || (p.kind < q.kind ? -1 : p.kind > q.kind ? 1 : 0))
      .map((w, i) => ({ ...w, id: `w${i}` })),
    // Objects in a hidden state are not sent at all. Of the rest, only the fields named here (an
    // allow list, so a field added later is not sent until someone decides it may be): never a DC,
    // never what an object is wired to, and where a ladder or stairs lead only once that place is.
    objects: map.objects.filter((o) => { const st = stateOf(o); return st !== undefined && !stateDef(o, st)?.hidden && objectHexes(o, G).some((h) => has(o.level, h)); })
      .map((o) => {
        const out = { id: o.id, def: o.def, level: o.level, at: structuredClone(o.at), state: stateOf(o) };
        for (const k of ['edge', 'seg', 'name', 'key']) if (o[k] !== undefined) out[k] = structuredClone(o[k]);
        if (o.to && levels.some((l) => l.tiles[col(o.to)] && (o.to.z === undefined || l.z === o.to.z))) out.to = structuredClone(o.to);
        return out;
      }),
    regions: map.regions.filter((r) => r.revealed).map((r) => ({ id: r.id, name: r.name, level: r.level, hexes: rule === 'light' ? r.hexes.filter((k) => has(r.level, parse(k))) : [...r.hexes], revealed: true })),
    starts: [],
  };
  // What the party sees now: under los the tiles in someone's line of sight, under light those made
  // out, with the light of each that is not bright. Only tiles that are sent.
  let sight;
  if (rule !== 'rooms') {
    const now = {}, light = {}, sources = rule === 'light' ? lightSources(state) : null;
    for (const t of pv.seen.values()) {
      if (!has(t.level, t)) continue;
      (now[t.level] ??= []).push(col(t));
      if (sources) { const l = lightAt(state, t, sources); if (l !== 'bright') (light[t.level] ??= {})[col(t)] = l; }
    }
    for (const l of Object.values(now)) l.sort();
    sight = { rule, now, ...(sources ? { light } : {}) };
  }
  const nowCols = new Set(rule === 'rooms' ? [] : [...pv.seen.values()].filter((t) => has(t.level, t)).map((t) => col(t)));
  const out = { sig, doc, cols, live: rule === 'rooms' ? null : pv.objects, sight, nowCols };
  mapCache.set(map, out);
  return out;
}

// A lasting effect is sent to players if it comes from, or sits on, one of their own. Of what
// it does they see everything on their own characters and, on other creatures, only the
// conditions they could see by looking.
function viewEffects(state) {
  const out = [];
  for (const fx of state.effects ?? []) {
    const src = classify(state, fx.source);
    if (src !== 'open' && !fx.parts.some((p) => classify(state, p.target) === 'open')) continue;
    const parts = [];
    for (const p of fx.parts) {
      const c = classify(state, p.target);
      // `ends.who` (the creature whose turn the part ends with) is left out when that creature is hidden from the party.
      if (c === 'open') { const q = structuredClone(p); if (q.ends?.who !== undefined && classify(state, q.ends.who) === 'hidden') delete q.ends.who; parts.push(q); }
      else if (c === 'seen' && p.cond && conditionDef(p.cond)?.visible) parts.push({ target: p.target, cond: p.cond, ...(p.ended ? { ended: true } : {}) });
    }
    out.push({ id: fx.id, name: fx.name, spell: fx.spell, ...(src === 'hidden' ? {} : { source: fx.source }), conc: fx.conc, lasts: fx.lasts,
      until: fx.until ? { ...fx.until } : null, parts });
  }
  return out;
}

// ---------- events ----------

const pick = (ev, keys) => {
  const out = {};
  for (const k of keys) if (ev[k] !== undefined) out[k] = ev[k];
  return out;
};

// Event types a player receives unchanged. A type not named in this file is dropped.
const AS_IS = new Set(['moved', 'stood', 'std', 'note', 'down', 'died', 'claimed', 'released',
  'rest', 'time', 'encounterEnd', 'spawned', 'placed', 'deathSave', 'revealed', 'map', 'region', 'fell', 'speed', 'size', 'edited', 'follow', 'marchingOrder', 'light', 'hid', 'remains',
  'xp', 'levelReady', 'conclusionSkipped']);   // XP and levels are only ever a party character's; a skip says nothing but that

export function viewEvents(events, state, viewer) {
  if (isDM(viewer)) return events;
  // The faces of a damage, healing or Temporary Hit Points roll (docs/specs/dice.md) go with the
  // event only where the player has the number they add up to: always if one of theirs rolled
  // them (with `rolled`, what the dice made before halving or Resistance); otherwise only if the
  // faces and bonus make exactly the amount they are told. `by` is never sent.
  const facesFor = (ev) => {
    if (!ev.dice) return {};
    const ours = ev.by !== undefined && ev.by !== null && cls(ev.by) === 'open';
    if (ours) return { dice: structuredClone(ev.dice), bonus: ev.bonus, ...(ev.rolled !== undefined ? { rolled: ev.rolled } : {}) };
    return ev.rolled === undefined ? { dice: structuredClone(ev.dice), bonus: ev.bonus } : {};
  };
  // A record entry names the creatures the party did not know of when it happened (`unseen`, from
  // apply()): they stay unknown in it, whatever is known of them now. `unseen` itself is never sent.
  let was = null;
  const cls = (id) => (was?.includes(id) ? 'hidden' : classify(state, id));
  const sm = shownMap(state), byRule = sightRule(state) !== 'rooms';
  // Cells named by an area, only where they are sent, under every rule (under `rooms` too, DEBT
  // P26: an area reaching into a region not yet revealed does not show its cells there).
  const hexesOf = (hs) => (!hs ? hs : hs.filter((h) => sm.cols.has(col(h))).map((h) => ({ q: h.q, r: h.r })));
  const kept = [];
  // Timeline entries are events with the in-world time `t` added; the time survives redaction.
  const out = { push(e) { delete e.unseen; if (this.ev.t !== undefined) e.t = this.ev.t; kept.push(e); }, ev: null };
  let lastTurnHidden = null;               // whether the last turn in this list was unseen (null: none yet)
  let caster = null;                       // who cast the spell (or used the action) that the following saves answer
  for (const ev of events) {
    out.ev = ev;
    was = Array.isArray(ev.unseen) ? ev.unseen : null;
    if (ev.type === 'cast' || ev.type === 'act' || ev.type === 'attack') caster = ev.actor;      // a save on a hit answers the attacker
    if (ev.type === 'turn') {
      const hidden = cls(ev.id) === 'hidden', before = lastTurnHidden ?? turnBeforeUnseen(state, ev);
      lastTurnHidden = hidden;
      if (!hidden) { out.push(structuredClone(ev)); continue; }
      // Something moves where they cannot see: once for a run of such turns, and never who.
      if (unseenTurns(state) === 'say' && !before) out.push({ type: 'turn', round: ev.round, someone: true });
      continue;
    }
    if (ev.type === 'encounterStart' || ev.type === 'encounterEnd') lastTurnHidden = false;
    if ([ev.id, ev.actor, ev.target].some((id) => id !== undefined && id !== null && cls(id) === 'hidden')) continue;      // a null actor is a thing on the map, not a creature

    switch (ev.type) {
      case 'attack': {
        const targetOpen = cls(ev.target) === 'open';
        if (cls(ev.actor) === 'open') {
          const e = structuredClone(ev);
          if (!targetOpen) delete e.ac;
          out.push(e);
        } else {
          out.push(pick(ev, ['type', 'actor', 'target', 'name', 'hit', 'crit', 'mode', 'why', 'opportunity', 'cover', ...(targetOpen ? ['ac'] : [])]));
        }
        break;
      }
      case 'damage':
      case 'heal': {
        const e = { ...pick(ev, ['type', 'target', 'amount', 'dtype', 'note', 'hp']), ...facesFor(ev) };
        if (cls(ev.target) === 'seen') { const t = state.entities[ev.target]; e.hp = ev.hp > 0 ? 1 : 0; e.health = healthOf(t); }
        out.push(e);
        break;
      }
      case 'save':
        if (cls(ev.id) === 'open') out.push(structuredClone(ev));
        else out.push(pick(ev, ['type', 'id', 'abil', 'success', ...(caster !== null && cls(caster) === 'open' ? ['dc'] : [])]));
        break;
      case 'reaction':                                 // a creature took a Reaction: who, what, and against whom, as anyone watching would see
        out.push({ ...pick(ev, ['type', 'id', 'reaction', 'name', 'trigger']),
          ...(ev.against !== undefined && cls(ev.against) !== 'hidden' ? { against: ev.against } : {}),
          ...(ev.amount !== undefined && cls(ev.id) === 'open' ? { amount: ev.amount, ...facesFor(ev) } : {}) });
        break;
      case 'cast':
        out.push({ ...pick(ev, ['type', 'actor', 'spell', 'name', 'slot', 'reaction', 'item']),
          hexes: hexesOf(ev.hexes),
          targets: (ev.targets || []).filter((id) => cls(id) !== 'hidden') });
        break;
      case 'act':                                      // a creature used one of its actions: its name and where, never its numbers
        out.push({ ...pick(ev, ['type', 'actor', 'name']),
          hexes: ev.hexes ? hexesOf(ev.hexes) : null,
          targets: (ev.targets || []).filter((id) => cls(id) !== 'hidden') });
        break;
      case 'encounterStart':
        out.push({ type: ev.type, ...(ev.fight !== undefined && { fight: ev.fight, where: ev.where }), center: ev.center, radius: ev.radius,
          order: ev.order.filter((o) => cls(o.id) !== 'hidden').map((o) => (cls(o.id) === 'open' ? { ...o } : { id: o.id })) });
        break;
      case 'joined':
        out.push(cls(ev.id) === 'open' ? { ...ev } : { type: ev.type, id: ev.id });
        break;
      case 'cond':
      case 'condEnd':                                  // gaining or losing a condition, if it is one you could see
        if (cls(ev.id) === 'open' || conditionDef(ev.cond)?.visible) out.push(structuredClone(ev));
        break;
      case 'effectStart':
      case 'effectEnd': {                              // a lasting effect that involves one of ours
        const targets = (ev.targets || []).filter((id) => cls(id) !== 'hidden');
        if (cls(ev.source) === 'open' || targets.some((id) => cls(id) === 'open')) out.push({ ...pick(ev, ['type', 'fx', 'name', 'source', 'conc', 'lasts', 'why']), targets });
        break;
      }
      case 'form':                                     // a creature takes a shape or leaves it (Wild Shape): told where the creature is known
        if (cls(ev.id) !== 'hidden') out.push(pick(ev, ['type', 'id', 'form', 'name']));
        break;
      case 'concentration':
        if (cls(ev.id) === 'open') out.push(structuredClone(ev));
        break;
      case 'tempHp':                                   // Temporary Hit Points gained or lost: hit points of a creature not theirs are private
        if (cls(ev.id) === 'open') {
          const e = structuredClone(ev);
          delete e.dice; delete e.bonus; delete e.rolled; delete e.by;
          out.push({ ...e, ...facesFor(ev) });
        }
        break;
      case 'reactionAsked':                            // a question about a reaction: to the player asked, never anyone else
        if (typeof viewer?.userId === 'string' && ev.to === viewer.userId) {
          const v = viewPrompt({ ...state, pending: { n: ev.n, ask: ev.ask } }, viewer);
          if (v && !v.waiting) out.push({ type: ev.type, id: ev.id, n: ev.n, ask: v });
        }
        break;
      case 'countered':                                // a spell failed to Counterspell: whose, and by whom where known; which spell only if it was theirs
        out.push({ ...pick(ev, ['type', 'id']), ...(cls(ev.id) === 'open' ? pick(ev, ['spell', 'name']) : {}),
          ...(ev.by !== undefined && cls(ev.by) !== 'hidden' ? { by: ev.by } : {}) });
        break;
      case 'manual':                                   // what the DM must apply by hand
        // Everyone sees what a spell does when the engine cannot apply it. Notes about what
        // the engine left out of a spell it did apply are for the DM alone.
        // What a creature that is not one of theirs does by hand is the DM's to tell: a monster's
        // action text carries its numbers. A thing on the map (actor null) is not a creature.
        if (!ev.partial && (ev.actor === null || ev.actor === undefined || cls(ev.actor) === 'open')) out.push(pick(ev, ['type', 'actor', 'name', 'text']));
        break;
      case 'check':                                    // a check by one of ours: the roll, never the DC; the outcome only where it will show anyway
        if (cls(ev.id) === 'open') { const e = structuredClone(ev); delete e.dc; if (e.secret) delete e.success; out.push(e); }
        break;
      case 'noticed':
      case 'triggered':
      case 'object':                                   // something on the map changed state or went off, if they can see it
        // Under the los and light rules only while it is in view: one remembered is shown as it was.
        if (sm.live ? sm.live.has(ev.object) : sm.doc.objects.some((o) => o.id === ev.object)) out.push(structuredClone(ev));
        break;
      case 'moved':                                    // under los and light, a creature not theirs is seen only where it is in view
        if (byRule && cls(ev.id) !== 'open') {
          const path = ev.path.filter((h) => sm.nowCols.has(col(h)));
          if (path.length) out.push({ ...structuredClone(ev), path });
        } else out.push(structuredClone(ev));
        break;
      case 'unhidden': {                               // a creature stopped hiding; who found it, only if they know of the finder
        const e = pick(ev, ['type', 'id', 'why']);
        if (ev.by !== undefined && cls(ev.by) !== 'hidden') e.by = ev.by;
        out.push(e);
        break;
      }
      case 'chronicle':
        if (ev.public === true) out.push(structuredClone(ev));
        break;
      case 'conclusion': {                             // the published rewards, shaped as the player's card (rewards.js)
        const { id, ...shaped } = playerConclusion({ ...ev, id: ev.fight, published: true }, (f) => (state.entities[f.id] ? seenName(state.entities[f.id]) : f.name));
        void id;
        out.push({ type: 'conclusion', ...shaped });
        break;
      }
      case 'gear':                                     // an item came or went, for a creature of theirs; who with, if they know of them
        if (cls(ev.id) === 'open') out.push({ ...pick(ev, ['type', 'id', 'item', 'taken', 'why', 'key', 'pack', 'nameOnly']), ...(ev.with !== undefined && cls(ev.with) !== 'hidden' ? { with: ev.with } : {}) });
        break;
      case 'item':                                     // a magic item used (E18): all of it for one of theirs; for another they see, what it used, never its charges
        if (cls(ev.id) === 'open') out.push(pick(ev, ['type', 'id', 'key', 'item', 'pack', 'use', 'level', 'target', 'charges', 'max', 'consumed']));
        else out.push(pick(ev, ['type', 'id', 'item', 'use', 'level', 'target', 'consumed']));
        break;
      case 'recharged':                                // an item's charges back at dawn (#284): a party creature's only
        if (cls(ev.id) === 'open') out.push(pick(ev, ['type', 'id', 'key', 'item', 'pack', 'gained', 'charges', 'max', 'dice', 'rolls']));
        break;
      case 'equip':                                    // a magic item put on or taken off, attuning chosen, an Attunement made or ended:
      case 'attuning':                                 // a party creature's, whose sheet the party is sent; never another's
      case 'attuned':
        if (cls(ev.id) === 'open') out.push(pick(ev, ['type', 'id', 'key', 'item', 'on', 'end', 'cleared', 'failed']));
        break;
      case 'privateNote':                              // a note is between the two people it names, and the DM
        if (typeof viewer?.userId === 'string' && (ev.from === viewer.userId || ev.to === viewer.userId)) out.push(pick(ev, ['type', 'from', 'to', 'text']));
        break;
      case 'sceneStart':
      case 'sceneEdit':
      case 'sceneEnd':                                 // a scene began, was renamed or ended: its title, as everyone sees it
        if (ev.prep !== true) out.push(pick(ev, ['type', 'scene', 'title', 'why']));    // never one not open (scenes.js)
        break;
      case 'sceneNpc':                                 // someone came or left, or a name or face changed; not a change to the DM's notes
        if (ev.prep !== true && (ev.change !== 'edited' || ev.changed?.some((k) => k !== 'notes'))) out.push(pick(ev, ['type', 'scene', 'npc', 'name', 'change']));
        break;
      case 'say':                                      // what is said at the table, everyone hears
        out.push(pick(ev, ['type', 'from', 'as', 'name', 'text', 'scene', 'line']));
        break;
      case 'checkAsked':                               // a request for a check is between the player who asked and the DM
        if (typeof viewer?.userId === 'string' && ev.by === viewer.userId) out.push(pick(ev, ['type', 'actor', 'skill', 'by']));
        break;
      case 'handoutShown':                             // that a handout was shown, to those it was shown to; never who else
        if (ev.to === 'all' || (Array.isArray(ev.to) && typeof viewer?.userId === 'string' && ev.to.includes(viewer.userId))) out.push(pick(ev, ['type', 'handout', 'title']));
        break;
      default:
        if (AS_IS.has(ev.type)) out.push(structuredClone(ev));
    }
  }
  // A creature is introduced before anything is said about it.
  was = null;
  const intro = (e) => e.type === 'revealed' || (e.type === 'unhidden' && cls(e.id) !== 'open');       // one of theirs needs no introduction
  return [...kept.filter(intro), ...kept.filter((e) => !intro(e))];
}
