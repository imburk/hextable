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
import { concealed, inArea } from './space.js';
import { memoryOf, partyView, seenName, sightRule, tileSent } from './vision.js';
import { lightAt, lightSources } from './sight.js';
import { shownTo } from './handouts.js';
import { playerConclusion } from './rewards.js';
import { barriers, objectDef, objectHexes, objectSegment } from './walls.js';
import { controllerOf, hbId, homebrewBlock, isPile, lineName, marketEnv, marketOfShop, openContents, ownerOf, pileOpen } from './engine.js';
import { buysOf, kindOf, listPrice } from './market.js';

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
export { seenName };                              // vision.js: the Beast's name for such a creature

// Riding (docs/specs/companions.md, Decisions 8 and 10; stage C6a) is plain to see, so a creature players see shows
// what it rides and who rides it; but only where they know of the other one too. A ride's other fields (whether the
// rider controls the mount, the footprint it borrows) are the party's own, in their open records.
function rideSeen(state, e) {
  const out = {};
  if (typeof e.riding?.on === 'string' && classify(state, e.riding.on) !== 'hidden') out.riding = { on: e.riding.on };
  if (typeof e.rider === 'string' && classify(state, e.rider) !== 'hidden') out.rider = e.rider;
  return out;
}

// Grapples (docs/specs/grapple-shove.md, Decision 9): a creature in a player's view shows who holds it, `heldBy`, with a grappler
// the party does not know of as 'someone'. Only a hold has a grappler to name; a Grappled condition without holds shows as the
// condition alone.
function heldBy(state, e) {
  const holds = e.cond?.grappled?.holds;
  if (!Array.isArray(holds) || !holds.length) return {};
  return { heldBy: holds.map((h) => (classify(state, h.by) === 'hidden' ? 'someone' : h.by)) };
}
// A hold's escape DC is the party's own number only when its grappler is the party's: a monster's is a monster number, kept from
// players (hidden-information.md), as is its Disadvantage on escaping.
function holdsShown(state, rec) {
  for (const h of rec.cond?.grappled?.holds ?? []) {
    if (state.entities[h.by]?.side !== 'party') { delete h.escape; delete h.escapeDis; }
    if (classify(state, h.by) === 'hidden') { delete h.with; delete h.range; }       // a grappler the party does not know of is only "someone" (scrub renames `by`)
  }
}
function seenRecord(e, state) {
  const cond = {};
  for (const c of visibleConditions(e)) cond[c] = true;         // which conditions show is decided by their data
  const form = inForm(e);
  return {
    id: e.id, name: seenName(e), kind: form ? 'npc' : e.kind, side: e.side, tpl: form ? e.form.block : e.tpl, size: e.size,
    pos: { q: e.pos.q, r: e.pos.r, z: e.pos.z }, look: e.look && !form ? structuredClone(e.look) : undefined,
    dead: !!e.dead, hp: seenHp(e), health: healthOf(e), cond,
    ...(e.light ? { light: { bright: e.light.bright, dim: e.light.dim } } : {}),     // a carried light is plain to see
    ...(e.remains ? { remains: e.remains } : {}),                                    // a frozen statue or dust where it fell is plain to see
    ...(state ? rideSeen(state, e) : {}),
    ...(state ? heldBy(state, e) : {}),
  };
}

// ---------- a homebrew creature's block is its controller's alone (#457; docs/specs/homebrew.md) ----------
// The party sees as one, so every creature of the party is sent whole to every player. That is right for a creature of the standard
// rules, whose block every player may read. A homebrew monster's block is never sent to a player who does not run it. Of a summon or a
// familiar made from one, every other player is sent what a foe they can see is: `seenRecord`. Of a character in a homebrew Wild Shape
// form, they are sent the character itself as it is out of the form (its Hit Points, conditions and place are its own; SRD 5.2 keeps its
// Hit Points) and nothing the form gave it. What the events say of such a creature is settled by the stamp `hb` that `apply()` put on
// each event at the time (engine.js, `stampHomebrew`), never by the creature as it is now, when it may be gone or out of its form.
export { controllerOf, homebrewBlock };

// Is this creature the viewer's to run: the user `controllerOf` gives (its player, or its master's, up the bond).
export const controlledBy = (state, e, userId) => typeof userId === 'string' && userId !== '' && controllerOf(state, e) === userId;

// A character as it is out of its homebrew form, as the other players are sent it: the fields the form replaced are the character's own
// again (`form.kept`), and there is no `form`. Its size stays the form's: it is plain to see.
function unformed(e, rec) {
  const out = structuredClone(rec), { kept, absent } = e.form;
  for (const [k, v] of Object.entries(kept)) out[k] = structuredClone(v);
  for (const k of absent) delete out[k];
  delete out.form;
  out.size = rec.size;
  return out;
}

// A shared player's view `base` (`playerView(state)`, the same for every player) made this viewer's: every creature of the party that
// carries a homebrew block and is not theirs is sent as said above; it is left out of its master's pocket dimension; and in the fight it
// shows no initiative, Dexterity, or turn budget (a budget's `move` is its Speed), and the effect that keeps a form (named for it) is not
// sent. The DM's is the state itself. Returns `base` itself when nothing changes, which is every game with no homebrew creature in the
// party. Pure; `base` is not changed.
export function forViewer(base, state, viewer) {
  if (isDM(viewer)) return base;
  const uid = viewer?.userId, seen = new Set(), formed = new Set();
  let replaced = null;
  const put = (id, rec) => { (replaced ??= { ...base.entities })[id] = rec; };
  for (const [id, e] of Object.entries(state.entities)) {
    if (e.side !== 'party' || !base.entities[id]) continue;
    if (homebrewBlock(e) && !controlledBy(state, e, uid)) {
      if (e.form && !hbId(e.tpl)) { formed.add(id); put(id, unformed(e, base.entities[id])); }
      else { seen.add(id); put(id, seenRecord(e, state)); }
    } else if (e.pocket && typeof e.pocket === 'object') {
      // A familiar in its master's pocket dimension is in the master's record: not a homebrew one, to a player it is not theirs.
      const keep = Object.entries(e.pocket).filter(([, c]) => !(homebrewBlock(c) && !controlledBy(state, c, uid)));
      if (keep.length !== Object.keys(e.pocket).length) {
        const rec = structuredClone(base.entities[id]);
        rec.pocket = Object.fromEntries(keep.map(([k]) => [k, rec.pocket[k]]));
        put(id, rec);
      }
    }
  }
  // A lasting effect whose source is a homebrew creature that is not the viewer's: every number it carries is of that creature's block (a
  // Difficulty Class, a modifier's value or dice, Hit Points it raises), and none is sent, on a target of the party or any other. What is
  // left is what an effect of a creature they can only see would show: its name and what it is on, the conditions and what ends them. On a
  // target that is itself a homebrew creature of another player's, only a condition they could see by looking.
  // By the creature as it is now if it still carries the block, else by what the effect remembered of it (`hbSrc`: who ran it then), which
  // holds when the creature has left the map or its form has ended.
  const theirFx = (fx) => {
    const raw = (state.effects ?? []).find((x) => x.id === fx.id), src = state.entities[raw?.source];
    return src && homebrewBlock(src) ? !controlledBy(state, src, uid) : !!raw?.hbSrc && raw.hbSrc.by !== uid;
  };
  const NUMBERS = new Set(['value', 'dice', 'dc', 'hpMax', 'amount', 'bonus', 'perLevel', 'min', 'max']);
  const bare = (x) => (Array.isArray(x) ? x.map(bare) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).filter(([k]) => !NUMBERS.has(k)).map(([k, v]) => [k, bare(v)])) : x);
  const cleaned = (fx) => ({ ...fx, parts: fx.parts.flatMap((q) => (seen.has(q.target)
    ? (q.cond && conditionDef(q.cond)?.visible ? [{ target: q.target, cond: q.cond, ...(q.ended ? { ended: true } : {}) }] : [])
    : [bare(q)])) });
  const sentWhole = base.effects?.some(theirFx);
  if (!replaced && !sentWhole) return base;
  const out = { ...base, entities: replaced ?? base.entities }, enc = base.encounter, held = (id) => seen.has(id) || formed.has(id);
  const form = (fx) => fx.parts.some((q) => q.form && formed.has(q.target));
  if (formed.size && base.effects?.some(form)) out.effects = base.effects.filter((fx) => !form(fx));
  if (sentWhole) out.effects = (out.effects ?? base.effects).map((fx) => (theirFx(fx) ? cleaned(fx) : fx));
  if (enc && (seen.size || formed.size)) {
    const active = state.encounter?.order[state.encounter.turn]?.id;
    out.encounter = { ...enc, order: enc.order.map((o) => (seen.has(o.id) ? { id: o.id } : formed.has(o.id) ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'dex')) : o)),
      ...(held(active) ? { budget: { move: 0, action: 0, bonus: 0 } } : {}) };
  }
  return out;
}

// A creature the party cannot see takes its turn. Under the table rule `unseenTurns: 'say'` (the
// default) players are told what a DM would say at a table, "something moves where you cannot
// see": the order shows one slot `{ someone: true }` while such a turn is taken, placed after the
// last creature they can see that comes before it, and holding no id, no name, no number. A run of
// unseen turns one after another is one slot and one `turn` event, so how many there are is not
// told. Under `quiet` nothing is said: the order shows no one's turn (`turn: -1`).
export const unseenTurns = (state) => state.settings?.unseenTurns ?? 'say';

// An order entry's `after` or `before` (companions.md, Decision 3 and A1), kept only where its master is the party's too.
function tiedOpen(o, open) {
  const out = {};
  for (const k of ['after', 'before']) if (typeof o[k] === 'string' && open(o[k])) out[k] = o[k];
  return out;
}

function viewEncounter(state) {
  const enc = state.encounter;
  if (!enc) return null;
  const currentId = enc.order[enc.turn]?.id ?? null;
  const order = [];
  let slot = -1;                                    // where an unseen turn shows: after the last seen creature before it
  enc.order.forEach((o, i) => {
    const c = classify(state, o.id);
    // `after` (a companion's turn straight after its master's, companions.md Decision 3) and `before` (straight before
    // it, the master's player's choice, A1) only where both are the party's.
    if (c === 'open') order.push({ id: o.id, init: o.init, dex: o.dex, ...tiedOpen(o, (id) => classify(state, id) === 'open') });
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

// A foe on a conclusion card as players are told of it: as they see it now, or, its record gone, the name they
// were shown when it vanished in their sight (`shown`, resolve.js, vanish).
const foeName = (state, f) => (state.entities[f.id] ? seenName(state.entities[f.id]) : f.shown ?? f.name);

export function view(state, viewer) {
  if (isDM(viewer)) return state;
  return { ...forViewer(playerView(state), state, viewer), handouts: viewHandouts(state, viewer), shops: viewShops(state, viewer), reactions: viewReactions(state, viewer), prompt: viewPrompt(state, viewer) };
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
  if (!t || typeof viewer?.userId !== 'string' || ownerOf(state, t) !== viewer.userId) return perceived(state, p) ? { waiting: true } : null;
  const q = p.ask, out = { n: p.n, reactor: t.id, trigger: q.trigger, options: q.options.map((o) => ({ ...pick(o, ['reaction', 'name', 'slots', 'ac']), ...(typeof o.against === 'string' && classify(state, o.against) !== 'hidden' ? { against: o.against } : {}) })) };
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
  for (const [id, e] of Object.entries(state.entities)) if (e.reactions && ownerOf(state, e) === viewer.userId) out[id] = structuredClone(e.reactions);
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
// Inside a record sent whole (a party creature's), every mention of a creature the party does not know
// of: a value that is its id becomes 'someone', a key that is its id is dropped (a condition's `source`,
// a mark kept by id). The record says that something did it, never who (review of #306).
function scrub(x, hidden) {
  if (!hidden.size || !x || typeof x !== 'object') return x;
  for (const k of Object.keys(x)) {
    if (!Array.isArray(x) && hidden.has(k)) { delete x[k]; continue; }
    const v = x[k];
    if (typeof v === 'string' && hidden.has(v)) x[k] = 'someone';
    else if (v && typeof v === 'object') scrub(v, hidden);
  }
  return x;
}
const hiddenIds = (state) => new Set(Object.keys(state.entities).filter((id) => classify(state, id) === 'hidden'));

// `speedSet` (engine/sheets.js) is the DM's bookkeeping, on a creature and on a familiar in its master's pocket dimension.
function noSpeedSet(e) {
  delete e.speedSet;
  if (e.pocket && typeof e.pocket === 'object') for (const c of Object.values(e.pocket)) if (c && typeof c === 'object') delete c.speedSet;
}
export function playerView(state) {
  const entities = {}, hidden = hiddenIds(state);
  for (const [id, e] of Object.entries(state.entities)) {
    const c = classify(state, id);
    if (c === 'open') {
      entities[id] = structuredClone(e);
      noSpeedSet(entities[id]);                          // bookkeeping of the DM's `setSpeed`: the speeds themselves are already sent
      delete entities[id].reactions;                     // standing instructions are their controller's and the DM's (viewReactions)
      if (e.follow && classify(state, e.follow) !== 'open') delete entities[id].follow;     // only ever a party member, but never point at what they cannot see
      // A formation's places are party members' (#303); one for anyone else (a creature since gone, or no longer of the party) is not sent.
      const slots = entities[id].formation?.slots;
      if (slots) for (const k of Object.keys(slots)) if (classify(state, k) !== 'open') delete slots[k];
      // A ride whose other half the party does not know of is not sent at all (not as 'someone'): riding is shown
      // only where both are known (stage C6a).
      if (e.riding && !(typeof e.riding.on === 'string' && classify(state, e.riding.on) !== 'hidden')) delete entities[id].riding;
      if (e.rider !== undefined && !(typeof e.rider === 'string' && classify(state, e.rider) !== 'hidden')) delete entities[id].rider;
      holdsShown(state, entities[id]);
      Object.assign(entities[id], heldBy(state, e));
      scrub(entities[id], hidden);
    }
    else if (c === 'seen') entities[id] = seenRecord(e, state);
  }
  return {
    // No `seq`: it counts creatures as they are added, so it would tick when the DM adds a hidden one.
    version: state.version, clock: state.clock,
    settings: structuredClone(state.settings),
    map: structuredClone(shownMap(state).doc),
    entities,
    encounter: viewEncounter(state),
    // The rewards of the last fight: that they are waiting, or what the DM published (rewards.js).
    conclusion: playerConclusion(state.conclusion, (f) => foeName(state, f)),
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

// ---------- shops ----------
// The shops shown to this viewer (docs/specs/shops.md, Decision 3), shaped from an allow list: for each, its id, kind, name, blurb and art;
// the lines on its shelf (lines of its lists not taken off, its own lines not hidden) with the price after markup and overrides and how
// many are left of a limited one; a loot package's coins; what a store pays when the party sells; the standing offers and the purchases
// being paid together that concern the party; the cells of its shop area that this player is sent (`viewShopArea`) and which of the party
// stand in it now. Never a shop not shown to them, a hidden line (its id, name, price or how many there are), `haggle`, `notes`, `from`,
// `waits`, `keeper`, `at`, a quote's steps or roleplaying bonus, or anything of `state.markets`. The DM is sent the state itself.
// A part of `view()`, and of the view the table server builds for each player itself (packages/server/src/tables.js, stateFor).
export function viewShops(state, viewer) {
  if (isDM(viewer)) return structuredClone(Array.isArray(state.shops) ? state.shops : []);
  const env = marketEnv(), open = (id) => typeof id === 'string' && classify(state, id) === 'open', out = [];
  for (const shop of Array.isArray(state.shops) ? state.shops : []) {
    if (!shownTo(shop, viewer?.userId)) continue;
    const market = marketOfShop(state, shop), store = shop.kind === 'store', ids = new Set(), lines = [];
    const all = [...(shop.lines ?? []), ...(shop.lists ?? []).flatMap((lid) => (market?.lists ?? []).find((x) => x?.id === lid)?.lines ?? [])];
    for (const l of all) {
      if (!l || ids.has(l.id) || l.hidden === true || shop.overrides?.[l.id]?.gone) continue;
      ids.add(l.id);
      const price = store ? listPrice(l, shop, market, env) : null;
      if (store && price === null) continue;
      const left = shop.overrides?.[l.id]?.qty !== undefined ? shop.overrides[l.id].qty : l.qty;
      lines.push({ id: l.id, name: lineName(l), ...(l.item !== undefined ? { item: l.item } : {}), ...(l.base !== undefined ? { base: l.base } : {}), ...(l.spell !== undefined ? { spell: l.spell } : {}),
        kind: kindOf(l, env), ...(l.art !== undefined ? { art: l.art } : {}), ...(l.note !== undefined ? { note: l.note } : {}), ...(price !== null ? { price } : {}), ...(left !== undefined ? { qty: left } : {}) });
    }
    const rec = { id: shop.id, kind: shop.kind, name: shop.name, ...(shop.blurb !== undefined ? { blurb: shop.blurb } : {}), ...(shop.art !== undefined ? { art: shop.art } : {}), lines };
    if (!store) { rec.coins = { ...(shop.coins ?? {}) }; out.push(rec); continue; }
    rec.buys = buysOf(shop.buys);
    rec.quotes = (shop.quotes ?? []).filter((q) => open(q.for) && (q.line === undefined || ids.has(q.line)))
      .map((q) => ({ id: q.id, ...(q.line !== undefined ? { line: q.line } : {}), ...(q.item !== undefined ? { item: q.item } : {}), for: q.for, price: q.price, ...(q.sell ? { sell: true } : {}) }));
    rec.joint = (shop.joint ?? []).filter((j) => open(j.buyer) && ids.has(j.line)).map((j) => ({ id: j.id, line: j.line, name: lineName(lines.find((l) => l.id === j.line)),
      qty: j.qty, price: j.price, buyer: j.buyer, pledges: Object.fromEntries(Object.entries(j.pledges ?? {}).filter(([k]) => open(k))) }));
    const area = viewShopArea(state, shop, viewer);
    if (area) {
      rec.area = area;
      const a = (state.map.areas ?? []).find((x) => x?.id === shop.at.area);
      if (!state.scene?.open) rec.here = Object.values(state.entities).filter((e) => e.side === 'party' && !e.dead && open(e.id) && inArea(state.map, a, e)).map((e) => e.id);
    }
    out.push(rec);
  }
  return out;
}

// ---------- shop areas ----------
// What a player is sent of a store's shop area (docs/specs/shops.md, Decision 3 and Decision 4; review point 9):
// nothing unless the shop is a store shown to this viewer and points at an area on the map in play, and then only
// `{ level, hexes }`, the area's cells that lie in tiles this player is sent; none of them sent, nothing. Never the
// area's id or name (the outline carries the store's). The map document sent to players never carries `areas`
// (shownMap builds it from an allow list), so this is the only way an area reaches a player; P3's `viewShops` puts
// its answer in the shop's `area`. Until shops exist (P3) nothing calls it and players are sent no areas at all.
export function viewShopArea(state, shop, viewer) {
  if (!shop || shop.kind !== 'store' || !shownTo(shop, viewer?.userId)) return undefined;
  const id = shop.at?.area, area = typeof id === 'string' ? (state.map?.areas ?? []).find((a) => a?.id === id) : undefined;
  if (!area || state.map.holding) return undefined;
  const tiles = shownMap(state).doc.levels.find((l) => l.id === area.level)?.tiles;
  const hexes = tiles ? area.hexes.filter((k) => Object.hasOwn(tiles, k)) : [];
  return hexes.length ? { level: area.level, hexes } : undefined;
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
    (mem ? `|${[...mem.tiles.values()].reduce((a, x) => a + x.size, 0)}|${JSON.stringify(mem.objects)}` : '') +
    `|${map.objects.filter(isPile).map((o) => `${o.id}:${JSON.stringify(o.contents ?? null)}`).join()}`;      // what lies on a pile (E17)
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
    // A pile with nothing on it but what was dropped by a creature the party does not know of is not sent (E17,
    // review of #291): it would show where that creature is and what it carried.
    objects: map.objects.filter((o) => { const st = stateOf(o); return st !== undefined && !stateDef(o, st)?.hidden && objectHexes(o, G).some((h) => has(o.level, h)) && pileOpen(o); })
      .map((o) => {
        const out = { id: o.id, def: o.def, level: o.level, at: structuredClone(o.at), state: stateOf(o) };
        for (const k of ['edge', 'seg', 'name', 'key']) if (o[k] !== undefined) out[k] = structuredClone(o[k]);
        if (o.to && levels.some((l) => l.tiles[col(o.to)] && (o.to.z === undefined || l.z === o.to.z))) out.to = structuredClone(o.to);
        // What lies on a pile (E17), only while it is in view: what each thing is, never its charges, and never
        // what was dropped unseen. A pile remembered (under los and light) is sent without it, since what is
        // there may have changed unseen.
        if (isPile(o) && (rule === 'rooms' || pv.objects.has(o.id))) out.contents = openContents(o).map((x) => pick(x, ['id', 'name', 'item', 'base', 'type', 'spell']));
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
  const out = [], hidden = hiddenIds(state);
  for (const fx of state.effects ?? []) {
    const src = classify(state, fx.source);
    if (src !== 'open' && !fx.parts.some((p) => classify(state, p.target) === 'open')) continue;
    const parts = [];
    for (const p of fx.parts) {
      const c = classify(state, p.target);
      // `ends.who` (the creature whose turn the part ends with) is left out when that creature is hidden from the party.
      if (c === 'open') {
        const q = structuredClone(p);
        // `born` names the turn it was made in, by whose turn it was (durations.js, turnKey): never sent.
        delete q.born;
        if (q.ends?.who !== undefined && classify(state, q.ends.who) === 'hidden') delete q.ends.who;
        // A modifier that holds against, or not for, a creature they do not know of: that it does, never who.
        for (const k of ['against', 'except']) if (typeof q[k] === 'string' && classify(state, q[k]) === 'hidden') q[k] = 'someone';
        parts.push(scrub(q, hidden));
      }
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

// What a player is told of each trade event (docs/specs/shops.md, X5), when they are in its audience.
const TRADE_KEYS = {
  shopShown: ['type', 'shop', 'name'], shopHidden: ['type', 'shop'], shopChanged: ['type', 'shop'], shopClosed: ['type', 'shop', 'name'],
  goodsRevealed: ['type', 'shop', 'line', 'name', 'price', 'qty'],
  quoted: ['type', 'shop', 'for', 'line', 'item', 'name', 'price', 'was', 'sell', 'check', 'withdrawn'],
  bought: ['type', 'shop', 'id', 'line', 'name', 'qty', 'price', 'paid', 'change', 'joint', 'payers'],
  sold: ['type', 'shop', 'id', 'item', 'name', 'qty', 'price'],
  took: ['type', 'shop', 'id', 'line', 'name', 'qty', 'coins', 'split', 'each', 'left'],
  jointOpened: ['type', 'shop', 'joint', 'line', 'name', 'qty', 'price', 'buyer'],
  pledged: ['type', 'shop', 'joint', 'who', 'share'],
  jointEnded: ['type', 'shop', 'joint', 'why'],
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
  // A companion that vanished in these events is gone from the state, but what happened to it on the way (the
  // damage, its death, what it left) is told as it would have been had it stayed: the party's own as Open, one
  // the party could see as Seen (the engine marks `vanished` with `party` and `seen` just before it goes), any
  // other not at all (review of #313, M2).
  const gone = new Map();
  // A familiar that went to its master's pocket dimension (stage C5c) is gone from the map in the same way.
  const GONE = ['vanished', 'removed', 'pocketed'];
  for (const e of events) if (GONE.includes(e?.type) && e.seen === true && !Object.hasOwn(state.entities, e.id)) gone.set(e.id, e.party === true ? 'open' : 'seen');
  // The names a creature goes by, to tell whether words name it: from the state, or from the event that took it away.
  const namesOf = (id) => {
    const x = Object.hasOwn(state.entities, id) ? state.entities[id] : null;
    if (x) return [x.name, seenName(x)];
    const g = events.find((e) => GONE.includes(e?.type) && e.id === id);
    return g?.name ? [g.name] : [];
  };
  // An event that names a homebrew creature of the party carries a stamp (`hb`, engine.js): who ran each such creature when it happened.
  // A creature the viewer did not run is told as a foe they can see, whatever it is now (gone, or out of its form): no dice, DC, check or
  // hand-applied action text of it. The stamp is read from the event being told, and is never sent.
  const theirs = (id) => { const hb = out.ev?.hb; return !!hb && Object.hasOwn(hb, id) && !(typeof viewer?.userId === 'string' && hb[id] === viewer.userId); };
  const runs = (id) => { const hb = out.ev?.hb; return !!hb && typeof viewer?.userId === 'string' && hb[id] === viewer.userId; };      // the stamp says the viewer ran it
  const cls = (id) => {
    if (was?.includes(id)) return 'hidden';
    const c = gone.get(id) ?? classify(state, id);
    return theirs(id) && c !== 'hidden' ? 'seen' : c;      // no more told than a foe they can see; one they could not see stays unseen
  };
  // A copy of an order entry or a `joined` of one of theirs, with `after` only where its master is theirs too.
  const afterOpen = (o) => { const { after, before, ...rest } = o; return { ...rest, ...tiedOpen({ after, before }, (id) => cls(id) === 'open') }; };
  const sm = shownMap(state), byRule = sightRule(state) !== 'rooms';
  // Cells named by an area, only where they are sent, under every rule (under `rooms` too, DEBT
  // P26: an area reaching into a region not yet revealed does not show its cells there).
  const hexesOf = (hs) => (!hs ? hs : hs.filter((h) => sm.cols.has(col(h))).map((h) => ({ q: h.q, r: h.r })));
  const kept = [];
  // Timeline entries are events with the in-world time `t` added; the time survives redaction.
  const out = { push(e) { delete e.unseen; delete e.hb; if (this.ev.t !== undefined) e.t = this.ev.t; kept.push(e); }, ev: null };
  let lastTurnHidden = null;               // whether the last turn in this list was unseen (null: none yet)
  let casterOpen = false;                  // whether the one who cast the spell (or used the action) that the following saves answer is theirs
  for (const ev of events) {
    out.ev = ev;
    was = Array.isArray(ev.unseen) ? ev.unseen : null;
    if (ev.type === 'cast' || ev.type === 'act' || ev.type === 'attack' || ev.type === 'strikeOption') casterOpen = cls(ev.actor) === 'open';      // a save on a hit or a Shove answers the attacker: told the DC if the attacker is theirs, as said at the event that began it (a stamp is read there)
    if (ev.type === 'turn') {
      const hidden = cls(ev.id) === 'hidden', before = lastTurnHidden ?? turnBeforeUnseen(state, ev);
      lastTurnHidden = hidden;
      if (!hidden) { out.push(structuredClone(ev)); continue; }
      // Something moves where they cannot see: once for a run of such turns, and never who.
      if (unseenTurns(state) === 'say' && !before) out.push({ type: 'turn', round: ev.round, someone: true });
      continue;
    }
    if (ev.type === 'encounterStart' || ev.type === 'encounterEnd') lastTurnHidden = false;
    // A companion left the map (docs/specs/companions.md, Decision 4). It is gone from the state, so the engine
    // said on the event whether the party knew of it then (`seen`) and whether it was theirs (`party`): told as
    // any creature that disappears, and why and what it was called only for one of theirs.
    if (ev.type === 'vanished') {
      if (ev.seen === true && !was?.includes(ev.id)) out.push({ type: 'vanished', id: ev.id, ...(ev.party === true ? pick(ev, ['name', 'why']) : {}) });
      continue;
    }
    // A familiar dismissed to its master's pocket dimension (Decision 10; stage C5c), also gone from the state: to players
    // who know of the master, where it went; to those who only saw it, that it disappeared, as any creature that vanishes.
    if (ev.type === 'pocketed') {
      if (ev.seen === true && !was?.includes(ev.id)) out.push(ev.party === true && cls(ev.by) === 'open' ? pick(ev, ['type', 'id', 'by', 'name']) : { type: 'vanished', id: ev.id });
      continue;
    }
    // A familiar takes a new form (Find Familiar cast again, `one: 'reform'`): the party's own only. One in the pocket
    // dimension is not in the state, but the party's pocket is in their master's record.
    if (ev.type === 'reformed') {
      if (cls(ev.by) === 'open' && !theirs(ev.id) && (ev.pocket === true || cls(ev.id) === 'open')) out.push(pick(ev, ['type', 'id', 'by', 'form', 'name', 'pocket']));
      continue;
    }
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
      case 'strikeOption':                             // a Grapple or Shove option of an Unarmed Strike: seen as the attack between the same two would be
        out.push(pick(ev, ['type', 'actor', 'target', 'option', 'shove']));
        break;
      case 'damage':
      case 'heal': {
        const e = { ...pick(ev, ['type', 'target', 'amount', 'dtype', 'note', 'hp']), ...facesFor(ev) };
        if (cls(ev.target) === 'seen') {
          const t = state.entities[ev.target];
          e.hp = ev.hp > 0 ? 1 : 0;
          // One that has since vanished: only that it went down, never how near it was to half its Hit Points.
          if (t) e.health = healthOf(t); else if (!(ev.hp > 0)) e.health = events.some((x) => x?.type === 'died' && x.id === ev.target) ? 'dead' : 'down';
        }
        out.push(e);
        break;
      }
      case 'save': {
        // A save names the creature whose DC it is (`src`, only a homebrew one: the DC is a number of its block): told to the player who runs
        // it and to no other, whoever the target is. Any other save: the target's own, or the caster of the step it follows, as ever.
        const told = ev.src !== undefined ? runs(ev.src) : null;
        if (cls(ev.id) === 'open') {
          const e = structuredClone(ev);
          if (e.by !== undefined && cls(e.by) === 'hidden') delete e.by;
          if (told === false) delete e.dc;
          if (e.src !== undefined && cls(e.src) === 'hidden') delete e.src;
          out.push(e);
        } else out.push(pick(ev, ['type', 'id', 'abil', 'success', ...((told ?? casterOpen) ? ['dc'] : [])]));
        break;
      }
      case 'reaction':                                 // a creature took a Reaction: who, what, and against whom, as anyone watching would see
        // A familiar's Reaction attack and its master's Resistance for it (companions.md, C9c) say that a creature has a familiar and
        // what it gives it: for a creature not of the party they are told as a Reaction taken, and no more (review of #467, 3).
        if ((ev.trigger === 'familiarDamaged' || ev.trigger === 'forgo') && state.entities[ev.id]?.side !== 'party') { out.push(pick(ev, ['type', 'id'])); break; }
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
          order: ev.order.filter((o) => cls(o.id) !== 'hidden').map((o) => (cls(o.id) === 'open' ? afterOpen(o) : { id: o.id })) });
        break;
      case 'formation':                                // how the party walks: only ever party members' places, and only theirs are sent
        out.push({ ...pick(ev, ['type', 'id', 'shape']), ...(ev.slots ? { slots: Object.fromEntries(Object.entries(ev.slots).filter(([id]) => cls(id) === 'open').map(([id, v]) => [id, { ...v }])) } : {}) });
        break;
      // A creature summoned (docs/specs/companions.md, Decision 10; stage C3): to players who do not know of its
      // master, exactly what a creature the DM adds gives them (`spawned { id }`), so nothing says it has a master;
      // to those who do, who summoned it and what kind of companion it is, and the lasting effect that keeps it
      // only for one of their own (a foe's effect is not theirs to see).
      case 'summoned': {
        const by = typeof ev.by === 'string' ? cls(ev.by) : 'hidden';
        // `t` first, where a record entry has it, as an entry passed on whole has it (the keys' order is the same too).
        out.push(by === 'hidden' ? { ...(ev.t !== undefined ? { t: ev.t } : {}), type: 'spawned', id: ev.id }
          : { type: 'summoned', id: ev.id, by: ev.by, kind: ev.kind, ...(by === 'open' && ev.fx !== undefined ? { fx: ev.fx } : {}) });
        break;
      }
      // A master's undead kept under its control for another 24 hours (Animate Dead, Create Undead; stage C5b): the
      // party's own only, as a bond is; a foe's control is mental and never told.
      case 'reasserted':
        if (cls(ev.id) === 'open' && cls(ev.by) === 'open') out.push(pick(ev, ['type', 'id', 'by', 'fx']));
        break;
      case 'joined':
        out.push(cls(ev.id) === 'open' ? afterOpen(ev) : { type: ev.type, id: ev.id });
        break;
      // A familiar back from the pocket dimension (stage C5c): to players who do not know of its master, exactly what a
      // creature the DM adds gives them (`spawned { id }`, as `summoned` is); to the party, who brought it back and where.
      case 'recalled': {
        const by = typeof ev.by === 'string' ? cls(ev.by) : 'hidden';
        out.push(by === 'open' ? structuredClone(pick(ev, ['type', 'id', 'by', 'at'])) : { ...(ev.t !== undefined ? { t: ev.t } : {}), type: 'spawned', id: ev.id });
        break;
      }
      // A touch spell delivered by the caster's familiar with its Reaction (stage C5c): the party's own only, as a bond is.
      case 'delivered':
        if (cls(ev.id) === 'open' && cls(ev.by) === 'open') out.push(pick(ev, ['type', 'id', 'by', 'spell']));
        break;
      case 'cond':
      case 'condEnd':                                  // gaining or losing a condition, if it is one you could see
        // A grapple's: who held it (`by`) only where they know of the grappler (docs/specs/grapple-shove.md, Decision 9).
        if (cls(ev.id) === 'open' || conditionDef(ev.cond)?.visible) { const e = structuredClone(ev); if (e.by !== undefined && cls(e.by) === 'hidden') delete e.by; out.push(e); }
        break;
      case 'hold':
      case 'holdEnd':                                  // another grappler takes hold of a creature already Grappled, or one of two lets go: as the condition is seen
        if (conditionDef('grappled')?.visible || cls(ev.id) === 'open') out.push(pick(ev, ['type', 'id', ...(cls(ev.by) === 'hidden' ? [] : ['by']), 'why']));
        break;
      case 'effectStart':
      case 'effectEnd': {                              // a lasting effect that involves one of ours
        const targets = (ev.targets || []).filter((id) => cls(id) !== 'hidden');
        // Whose it was and why it ended (`why` names its caster: "Imp went down") only where they know of its caster.
        // Whose it was only where they know of its caster; why it ended, unless the words name a caster they do not
        // know of ("Imp went down"): then only that it ended (rounds 2 and 3 of the review of #313).
        // The same for a creature it was on that they do not know of ("Zorblax left"; review of #313, round 4, L1).
        const unknownCaster = typeof ev.source === 'string' && cls(ev.source) === 'hidden';
        const unknownIds = [...(unknownCaster ? [ev.source] : []), ...(ev.targets || []).filter((id) => typeof id === 'string' && cls(id) === 'hidden')];
        if (cls(ev.source) === 'open' || targets.some((id) => cls(id) === 'open')) {
          const e = { ...pick(ev, ['type', 'fx', 'name', 'conc', 'lasts', ...(unknownCaster ? [] : ['source']), ...(unknownIds.length ? [] : ['why'])]), targets };
          if (unknownIds.length && ev.why !== undefined) e.why = unknownIds.some((id) => !namesOf(id).length || namesOf(id).some((n) => n && String(ev.why).includes(n))) ? 'it ended' : ev.why;
          out.push(e);
        }
        break;
      }
      case 'form':                                     // a creature takes a shape or leaves it (Wild Shape): told where the creature is known
        if (cls(ev.id) !== 'hidden' && !theirs(ev.id)) out.push(pick(ev, ['type', 'id', 'form', 'name']));      // not for a creature in or out of a homebrew form that is not theirs
        break;
      // Bonds (docs/specs/companions.md, Decision 10): the party's own only, so players never learn that a
      // creature not of theirs belongs to another.
      case 'bonded':
        if (cls(ev.id) === 'open' && cls(ev.to) === 'open') out.push(pick(ev, ['type', 'id', 'to', 'kind', 'side']));
        break;
      case 'unbonded':
        if (cls(ev.id) === 'open') out.push({ ...pick(ev, ['type', 'id']), ...(ev.from !== undefined && cls(ev.from) === 'open' ? { from: ev.from } : {}) });
        break;
      case 'companion':
        if (cls(ev.id) === 'open') out.push(pick(ev, ['type', 'id', 'auto']));
        break;
      // Riding (stage C6a): plain to see, so told where players know of both the rider and its mount.
      case 'mounted':
        if (cls(ev.mount) !== 'hidden') out.push({ ...pick(ev, ['type', 'id', 'mount']), ...(cls(ev.id) === 'open' ? pick(ev, ['controlled']) : {}) });
        break;
      case 'dismounted':
        if (typeof ev.mount === 'string' && cls(ev.mount) !== 'hidden') out.push(structuredClone(pick(ev, ['type', 'id', 'mount', 'at', 'why', 'fell'])));
        break;
      case 'companionOrder':                           // a before or after choice (A1): the party's own only, as a bond is
        if (cls(ev.id) === 'open' && cls(ev.by) === 'open') out.push(pick(ev, ['type', 'id', 'by', 'order', 'next']));
        break;
      // A command (C5a): the party's own only. A foe's commands are mental and never told, nor that it gave one.
      case 'commanded':
        if (cls(ev.by) === 'open' && Array.isArray(ev.ids) && ev.ids.every((id) => cls(id) === 'open')) out.push(structuredClone(pick(ev, ['type', 'by', 'ids', 'order'])));
        break;
      // The prompt that a commanded creature's turn is its player's (A2): to that player alone.
      case 'commandedTurn':
        if (typeof viewer?.userId === 'string' && ev.to === viewer.userId && cls(ev.id) === 'open' && cls(ev.by) === 'open') out.push(pick(ev, ['type', 'id', 'by', 'order', 'text']));
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
        if (cls(ev.id) === 'open') {
          const e = structuredClone(ev);
          // An escape from a grapple (Decision 9): the DC only when the grappler is the party's own; whose grapple, where they know of it.
          if (!(e.escape !== undefined && state.entities[e.escape]?.side === 'party')) delete e.dc;
          if (e.escape !== undefined && cls(e.escape) === 'hidden') e.escape = 'someone';
          if (e.secret) delete e.success;
          out.push(e);
        } else if (ev.escape !== undefined) out.push({ ...pick(ev, ['type', 'id', 'skill', 'success']), escape: cls(ev.escape) === 'hidden' ? 'someone' : ev.escape });   // one they see tries to break free
        break;
      case 'noticed':
      case 'triggered':
      case 'object':                                   // something on the map changed state or went off, if they can see it
        // Under the los and light rules only while it is in view: one remembered is shown as it was.
        // A pile picked up to nothing is gone from the map; `seen` (the engine's) says the party could see it then,
        // so its lines still reach them, live or read from the record.
        if (sm.live ? sm.live.has(ev.object) : sm.doc.objects.some((o) => o.id === ev.object)) { const e = structuredClone(ev); delete e.seen; out.push(e); }
        else if (ev.type === 'object' && ev.seen && !state.map.objects.some((o) => o.id === ev.object)) { const e = structuredClone(ev); delete e.seen; out.push(e); }
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
        const { id, ...shaped } = playerConclusion({ ...ev, id: ev.fight, published: true }, (f) => foeName(state, f));
        void id;
        out.push({ type: 'conclusion', ...shaped });
        break;
      }
      case 'gear':                                     // an item came or went, for a creature of theirs; who with, if they know of them
        // (E17: `pass`, `drop`, `pickup`); the pile, if they are sent it; whether an Attunement ended with it.
        if (cls(ev.id) === 'open') out.push({ ...pick(ev, ['type', 'id', 'item', 'taken', 'why', 'key', 'pack', 'nameOnly', 'unattuned']), ...(ev.with !== undefined && cls(ev.with) !== 'hidden' ? { with: ev.with } : {}),
          ...(ev.object !== undefined && (ev.seen || sm.doc.objects.some((o) => o.id === ev.object)) ? { object: ev.object } : {}) });
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
      case 'shield':                                   // a Shield put away or taken up is seen by whoever sees the creature (a hidden one's event
        out.push(pick(ev, ev.id !== undefined && cls(ev.id) === 'open' ? ['type', 'id', 'on', 'key', 'item'] : ['type', 'id', 'on']));    // is dropped above); which item only for one of theirs
        break;
      // Stepping away (E20): a party creature's only, as the table is told of its own. Of another creature
      // set aside by the DM nothing is said: players see its place in the order and what it does, as for any creature.
      case 'away':
      case 'back':
      case 'awayTurn':
      case 'turnMoved':
        if (cls(ev.id) === 'open') out.push(pick(ev, ['type', 'id', 'how', 'by', 'asked', 'to', 'keep', 'round', 'why']));
        break;
      case 'privateNote':                              // a note is between the two people it names, and the DM
        if (typeof viewer?.userId === 'string' && (ev.from === viewer.userId || ev.to === viewer.userId)) out.push(pick(ev, ['type', 'from', 'to', 'text']));
        break;
      case 'scoresRolled':                             // ability scores rolled (scores.js): the numbers are the roller's and the DM's; the others are told only that it happened
      case 'scoreRerolled':
        if (typeof viewer?.userId === 'string' && ev.by === viewer.userId) out.push(structuredClone(ev));
        else out.push({ type: ev.type });
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
        if (typeof viewer?.userId === 'string' && ev.by === viewer.userId) out.push(structuredClone(pick(ev, ['type', 'actor', 'skill', 'by', 'about'])));
        break;
      // Shops (docs/specs/shops.md, Decision 3 and X5): each trade event carries the shop's audience when it happened (`to`, `except`;
      // engine/trade.js) and goes to a player in it alone, live or from the record, shaped from an allow list; the audience is never sent,
      // nor a haggle's DC, steps or roleplaying bonus, nor how a price was reached (a hand-set price is just the price).
      case 'shopShown': case 'shopHidden': case 'shopChanged': case 'shopClosed': case 'goodsRevealed': case 'quoted': case 'bought': case 'sold':
      case 'took': case 'jointOpened': case 'pledged': case 'jointEnded': {
        const u = viewer?.userId;
        const hears = (ev.to === 'all' || (Array.isArray(ev.to) && typeof u === 'string' && ev.to.includes(u))) && !(Array.isArray(ev.except) && typeof u === 'string' && ev.except.includes(u));
        const named = [ev.for, ev.buyer, ev.who, ...(Array.isArray(ev.split) ? ev.split : []), ...(Array.isArray(ev.payers) ? ev.payers.map((p) => p?.id) : [])].filter((x) => x !== undefined);
        if (!hears || named.some((id) => cls(id) === 'hidden')) break;
        out.push(structuredClone(pick(ev, TRADE_KEYS[ev.type])));
        break;
      }
      case 'coins':                                    // a purse changed: a party creature's, whose record the party is sent; never which shop
        if (cls(ev.id) === 'open') out.push(structuredClone(pick(ev, ['type', 'id', 'coins', 'why', 'given', 'taken'])));
        break;
      case 'handoutShown':                             // that a handout was shown, to those it was shown to; never who else
        if (ev.to === 'all' || (Array.isArray(ev.to) && typeof viewer?.userId === 'string' && ev.to.includes(viewer.userId))) out.push(pick(ev, ['type', 'handout', 'title']));
        break;
      // A number about a creature (its Speed, a death save's roll) is not told of a homebrew creature that is not the viewer's.
      case 'speed':
      case 'deathSave':
        if (!theirs(ev.id)) out.push(structuredClone(ev));
        break;
      default:
        if (AS_IS.has(ev.type)) out.push(structuredClone(ev));
    }
  }
  // A creature is introduced before anything is said about it.
  was = null; out.ev = null;
  const intro = (e) => e.type === 'revealed' || (e.type === 'unhidden' && cls(e.id) !== 'open');       // one of theirs needs no introduction
  return [...kept.filter(intro), ...kept.filter((e) => !intro(e))];
}
