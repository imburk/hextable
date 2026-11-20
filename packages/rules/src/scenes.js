// Scenes: a mode of the table for conversation, with no map and no turns.
// Design: docs/specs/maps-and-objects.md, "Sharing things that are not on the map", Scenes.
//
//   state.scene: null | { id, title, image?, present: [{ id, name, portrait?, notes? }], said, open }
//
// `present` is the NPCs in the scene; the party is always there. `notes` are the DM's alone.
// `open` says whether the table is in the scene. A scene that is not open is the DM's alone: one
// being prepared ahead, or one the DM stepped out of back to the map. Players are sent nothing of
// it, and every event about it carries `prep: true`, which view.js never lets through to a player,
// live or from the record, however the scene stands later. Nor do ids tell of it: a scene gets the
// id players see (`sc1`, `sc2`, ... counting only scenes opened) and its NPCs theirs (`npc1`, ...
// in order) the first time it is opened, so a prepared scene thrown away, or an NPC taken out
// before anyone saw them, leaves no gap in the numbers. Until then the ids are `prep<n>` and
// `prep<n>`-numbered NPCs; `opened` records that the renumbering is done.
// `said` counts the lines spoken in the scene, so each `say` event has a number (`line`) the DM
// can point at to write a stretch of the transcript to the chronicle.
//
// The transcript is not kept in the state: it is the `say` events, which go on the timeline like
// any other. Everyone at the table receives them; a client rebuilds the transcript from them (and
// from the history message on joining). That is also what an AI DM, or an AI playing an NPC, reads:
// recall(state, { types: ['say'] }) gives every line with who said it, as whom, and when; and it
// speaks by sending `say` with `as` an NPC id, as the DM does (see packages/server/README.md).
//
// What a player is sent of all this is decided in view.js. Nothing here is a rule of the game:
// checks asked for in a scene are rolled by the engine's own `check` action.
import { ASSET_ID } from './map.js';
import { SKILLS } from './content/schema.js';
import { ownerOf } from './engine/shared.js';
import { shownTo } from './handouts.js';
import { findLine } from './market.js';

export const SCENE_LIMITS = { title: 80, name: 60, notes: 2000, present: 20, say: 500, lines: 200, chronicle: 8000, said: 5000 };

const cleanText = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max + 1);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const nextNpc = (list) => {
  let n = 0;
  for (const p of list) { const m = /^npc(\d+)$/.exec(p.id); if (m) n = Math.max(n, +m[1]); }
  return `npc${n + 1}`;
};

// A fight ends a scene, whichever way it started (the DM's startEncounter, or the party walking up
// to an enemy). Run by apply() after every action. The scene's end is put just before the start of
// the fight in the events, so the log reads in that order.
// A scene being prepared (not open) is not ended: the DM may open it after the fight.
export function fightEndsScene(s, ev) {
  if (!s.scene?.open || !s.encounter) return;
  const end = { type: 'sceneEnd', scene: s.scene.id, title: s.scene.title, why: 'a fight began' };
  s.scene = null;
  const at = ev.findIndex((e) => e.type === 'encounterStart');
  if (at < 0) ev.push(end); else ev.splice(at, 0, end);
}

// A creature of the party kept in a parked place (travel.md, Decision 5): { node, rec, e }, or null.
function parkedParty(s, id) {
  for (const [node, rec] of Object.entries(s.parked ?? {})) if (rec?.entities && Object.hasOwn(rec.entities, id) && rec.entities[id].side === 'party') return { node, rec, e: rec.entities[id] };
  return null;
}

// The first time a scene is opened it takes the ids players will see (see the top of this file).
function firstOpen(s, sc) {
  s.scenesOpened = (s.scenesOpened ?? 0) + 1;
  sc.id = `sc${s.scenesOpened}`;
  sc.present.forEach((p, i) => { p.id = `npc${i + 1}`; });
  sc.opened = true;
}

// The action handlers, given the engine's way of refusing. Each checks everything before it
// changes anything, so a refused action leaves the state as it was.
export function sceneActions(fail) {
  const dmOnly = (ctx) => ctx.role === 'dm' || fail('Only the DM can do that with a scene.');
  const open = (s) => s.scene || fail('There is no scene going on.');
  const asset = (v, had, what) => {
    const a = v === undefined ? had : v === null ? undefined : v;
    (a === undefined || (typeof a === 'string' && ASSET_ID.test(a))) || fail(`That ${what} isn't a file of this table.`);
    return a;
  };
  return {
    // Start a scene, or change the one there is. { type: 'scene', scene: { title, image?, open? } }
    // `image: null` takes the picture away. `open: false` prepares a scene, or steps out of one back
    // to the map; `open: true` takes the table into it (a new scene is open unless it says not).
    // A scene has no turns, so the table cannot be in one during a fight; one can be prepared.
    scene(s, a, ctx, ev) {
      dmOnly(ctx);
      const x = a.scene;
      isObj(x) || fail('A scene needs a record.');
      (x.open === undefined || typeof x.open === 'boolean') || fail('Open is yes or no.');
      const had = s.scene;
      const open = x.open ?? had?.open ?? true;
      !(open && s.encounter) || fail('A scene has no turns. End the fight first.');
      const title = x.title === undefined && had ? had.title : cleanText(x.title, SCENE_LIMITS.title);
      title || fail('Give the scene a title.');
      title.length <= SCENE_LIMITS.title || fail(`A title can be at most ${SCENE_LIMITS.title} characters.`);
      const image = asset(x.image, had?.image, 'picture');
      if (had) {
        const was = had.open;
        had.title = title; had.open = open;
        if (image === undefined) delete had.image; else had.image = image;
        // Into the scene: players are told it began (they are sent all of it now). Out of it: that it
        // was set aside. A change while it is not open is the DM's alone.
        if (open && !had.opened) firstOpen(s, had);
        if (open && !was) ev.push({ type: 'sceneStart', scene: had.id, title });
        else if (!open && was) ev.push({ type: 'sceneEnd', scene: had.id, title, why: 'set aside' });
        else ev.push({ type: 'sceneEdit', scene: had.id, title, ...(!open && { prep: true }) });
        return;
      }
      s.sceneCount = (s.sceneCount ?? 0) + 1;
      s.scene = { id: `prep${s.sceneCount}`, title, ...(image && { image }), present: [], said: 0, open, opened: false };
      if (open) firstOpen(s, s.scene);
      ev.push({ type: 'sceneStart', scene: s.scene.id, title, ...(!open && { prep: true }) });
    },
    endScene(s, a, ctx, ev) {
      dmOnly(ctx);
      const sc = open(s);
      s.scene = null;
      ev.push({ type: 'sceneEnd', scene: sc.id, title: sc.title, ...(!sc.open && { prep: true }) });
    },
    // Someone in the scene who is not one of the party. { type: 'sceneNpc', npc: { id?, name, portrait?, notes? } }
    // adds or changes one; { type: 'sceneNpc', npc: { id }, remove: true } takes one out.
    sceneNpc(s, a, ctx, ev) {
      dmOnly(ctx);
      const sc = open(s), x = a.npc;
      isObj(x) || fail('Say who: a record with a name.');
      const had = x.id === undefined ? null : sc.present.find((p) => p.id === x.id) || fail('Nobody of that name is in the scene.');
      if (a.remove === true) {
        had || fail('Say who is leaving.');
        sc.present = sc.present.filter((p) => p !== had);
        ev.push({ type: 'sceneNpc', scene: sc.id, npc: had.id, name: had.name, change: 'removed', ...(!sc.open && { prep: true }) });
        return;
      }
      const name = x.name === undefined && had ? had.name : cleanText(x.name, SCENE_LIMITS.name);
      name || fail('Give them a name.');
      name.length <= SCENE_LIMITS.name || fail(`A name can be at most ${SCENE_LIMITS.name} characters.`);
      const notes = x.notes === undefined ? had?.notes : cleanText(x.notes, SCENE_LIMITS.notes) || undefined;
      (notes ?? '').length <= SCENE_LIMITS.notes || fail(`Notes can be at most ${SCENE_LIMITS.notes} characters.`);
      const portrait = asset(x.portrait, had?.portrait, 'portrait');
      had || sc.present.length < SCENE_LIMITS.present || fail(`A scene can have at most ${SCENE_LIMITS.present} people in it besides the party.`);
      const rec = { id: had?.id ?? nextNpc(sc.present), name, ...(portrait && { portrait }), ...(notes && { notes }) };
      // What changed, so that players are told of a new name or face and not of a change to the notes.
      const changed = had ? ['name', 'portrait', 'notes'].filter((k) => had[k] !== rec[k]) : [];
      if (had) sc.present[sc.present.indexOf(had)] = rec; else sc.present.push(rec);
      ev.push({ type: 'sceneNpc', scene: sc.id, npc: rec.id, name, change: had ? 'edited' : 'added', ...(had ? { changed } : {}), ...(!sc.open && { prep: true }) });
    },
    // Something said. { type: 'say', as: <own character's id> | <npc id> | null, text }
    // `as: null` is out of character. A player speaks only as their own character or a companion they play (ownerOf: engine/shared.js); the DM as anyone
    // in the scene. Everyone at the table receives it, and it goes on the timeline.
    say(s, a, ctx, ev) {
      const text = cleanText(a.text, SCENE_LIMITS.say);
      text || fail('Say something first.');
      text.length <= SCENE_LIMITS.say || fail(`A line can be at most ${SCENE_LIMITS.say} characters.`);
      const dm = ctx.role === 'dm';
      dm || (typeof ctx.userId === 'string' && ctx.userId) || fail('Join the table first.');
      const sc = s.scene?.open ? s.scene : null;     // a scene not open is not where anyone is talking
      let as = null, name, far = null;
      // The scene's cap comes first, for everyone who is not speaking from a parked place (the order the checks have always had); a parked group has
      // a cap of its own, kept on its record, so a player there cannot flood the table either.
      const away = typeof a.as === 'string' && !sc?.present.some((p) => p.id === a.as) && !Object.hasOwn(s.entities, a.as) ? parkedParty(s, a.as) : null;
      const farOk = !!away && (dm || ownerOf({ entities: away.rec.entities }, away.e) === ctx.userId);
      if (!farOk) !sc || sc.said < SCENE_LIMITS.said || fail('This scene has gone on long enough. Start a new one.');
      else (away.rec.said ?? 0) < SCENE_LIMITS.said || fail('This place has gone on long enough. Start a new scene.');
      if (a.as === null || a.as === undefined) name = dm ? 'DM' : cleanText(a.userName, 40) || 'A player';
      else {
        const npc = typeof a.as === 'string' ? sc?.present.find((p) => p.id === a.as) : null;
        const e = typeof a.as === 'string' && !npc && Object.hasOwn(s.entities, a.as) ? s.entities[a.as] : null;
        // The same answer for someone else's character, an NPC, a creature players cannot see and an id that is nothing.
        if (npc) { dm || fail('You can speak only as your own character.'); name = npc.name; }
        else if (e && e.side === 'party' && (dm || ownerOf(s, e) === ctx.userId)) name = e.name;
        else if (farOk) { name = away.e.name; far = away; }
        else fail(dm ? 'Nobody of that name is in the scene.' : 'You can speak only as your own character.');
        as = a.as;
      }
      if (far) far.rec.said = (far.rec.said ?? 0) + 1;
      const line = sc && !far ? ++sc.said : undefined;
      // `node`: where it was said, when the table has a world (view.js tells players the id they were given, and only that). A line said
      // in character by a parked group is for the players there alone (`to`, who they are then), and the DM.
      const node = far ? far.node : as !== null && typeof s.place === 'string' ? s.place : undefined;
      const to = far ? [...new Set(Object.values(far.rec.entities).filter((x) => x.side === 'party').map((x) => ownerOf({ entities: far.rec.entities }, x)).filter(Boolean))] : undefined;
      ev.push({ type: 'say', from: dm ? 'dm' : ctx.userId, as, name, text, ...(sc && !far ? { scene: sc.id, line } : {}), ...(node !== undefined ? { node } : {}), ...(far ? { far: true, to } : {}) });
    },
    // A player asks the DM to let their character make a check. { type: 'askCheck', actor, skill }
    // Whose: their own character, or a companion they play (`ownerOf`; a command-orders creature only on a turn commanded for it).
    // It is a request, not a roll: the DM answers with the `check` action and a DC of their own.
    // `about: { shop, line }` (docs/specs/shops.md, Decision 6): the check is asked to haggle over a line of a store. The store must be one
    // shown to this player and the line one on its shelf: anything else is "No such shop." or "No such item.", as an id that is nothing is.
    askCheck(s, a, ctx, ev) {
      const e = s.entities[a.actor];
      (e && (ctx.role === 'dm' || (ownerOf(s, e) && ownerOf(s, e) === ctx.userId))) || fail('You can ask only for your own character.');
      Object.hasOwn(SKILLS, a.skill) || fail('Unknown skill.');
      let about = null;
      if (a.about !== undefined) {
        const ab = a.about, dm = ctx.role === 'dm';
        (ab && typeof ab === 'object' && !Array.isArray(ab)) || fail('No such shop.');
        const shop = typeof ab.shop === 'string' && Array.isArray(s.shops) ? s.shops.find((x) => x?.id === ab.shop) : null;
        (shop && shop.kind === 'store' && (dm || shownTo(shop, ctx.userId))) || fail('No such shop.');
        const market = Array.isArray(s.markets) ? s.markets.find((m) => m.id === shop.from?.market) : null;
        const line = typeof ab.line === 'string' ? findLine(shop, market, ab.line) : null;
        (line && line.hidden !== true && !shop.overrides?.[line.id]?.gone) || fail('No such item.');
        about = { shop: shop.id, line: line.id };
      }
      ev.push({ type: 'checkAsked', actor: e.id, skill: a.skill, by: ctx.role === 'dm' ? 'dm' : ctx.userId, ...(about ? { about } : {}) });
    },
    // Write a stretch of a scene's transcript, or a line the DM types, to the chronicle.
    // { type: 'sceneChronicle', title, lines?: [from, to], scene?, text?, public? }
    // `lines` are line numbers of the scene going on (or of `scene`, an earlier one), both included.
    sceneChronicle(s, a, ctx, ev) {
      ctx.role === 'dm' || fail('Only the DM can write to the chronicle.');
      const title = cleanText(a.title, SCENE_LIMITS.title);
      title || fail('Give the entry a title.');
      title.length <= SCENE_LIMITS.title || fail(`A title can be at most ${SCENE_LIMITS.title} characters.`);
      const typed = cleanText(a.text, SCENE_LIMITS.chronicle);
      typed.length <= SCENE_LIMITS.chronicle || fail(`The entry can be at most ${SCENE_LIMITS.chronicle} characters.`);
      let said = '', scene = a.scene ?? s.scene?.id;
      if (a.lines !== undefined) {
        const [from, to] = Array.isArray(a.lines) ? a.lines : [];
        (Number.isInteger(from) && Number.isInteger(to) && from >= 1 && to >= from && to - from < SCENE_LIMITS.lines) || fail(`Pick from 1 to ${SCENE_LIMITS.lines} lines of the transcript.`);
        typeof scene === 'string' || fail('There is no scene going on.');
        const got = (s.timeline ?? []).filter((x) => x.type === 'say' && x.scene === scene && x.line >= from && x.line <= to);
        got.length || fail('Those lines are not in the record.');
        said = got.map((x) => `${x.as === null ? `(${x.name}, out of character)` : x.name}: ${x.text}`).join('\n');
      }
      const text = [said, typed].filter(Boolean).join('\n\n');
      text || fail('Pick lines of the transcript or write something.');
      text.length <= SCENE_LIMITS.chronicle || fail(`The entry can be at most ${SCENE_LIMITS.chronicle} characters.`);
      ev.push({ type: 'chronicle', title, text, tags: ['scene'], ...(typeof scene === 'string' ? { scene } : {}), ...(a.public === true ? { public: true } : {}) });
    },
  };
}
