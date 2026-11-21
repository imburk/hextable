// The DM's tools and the map (engine.js): claiming characters, starting and ending fights, spawning
// and placing creatures, regions, objects, map edits and loading, light, conditions and Hit Points,
// handouts and scenes, and table settings.
import { gridOf, col } from '../grid.js';
import { CONTENT, MONSTERS, SPELLS, summonTemplate } from '../content/index.js';
import { effectsOf, endEffect } from '../durations.js';
import { FT, landing, overlapAt, regionAt, SQUARE_RANGES, surfaces, under } from '../space.js';
import { LIGHTS } from '../content/lights.js';
import { copyPacks, packsProblem } from '../content/packs.js';
import { EDITS, lintMap, migrateMap } from '../map.js';
import { arrivalSpots, marchOrder, setPin } from '../places.js';
import { loadNode, placeIn } from './travel.js';
import { handoutActions } from '../handouts.js';
import { sceneActions } from '../scenes.js';
import { SIGHT_RULES, tileSent, unknown } from '../vision.js';
import { SQUARE_COVERS } from '../sight.js';
import { barriers, objectDef } from '../walls.js';
import { conditionDef, immuneTo } from '../modifiers.js';
import { ARENA_RADIUS, control, current, ent, fail, inFight, living, pocketOf, up } from './shared.js';
import { airspace, AREA_FILLS, bringIn, DIAGONALS, joinEncounter, lookAround, objectName, objectOf, placeCreature, reveal, revealRegion, setObject, summonCaster, unfollow, unhide } from './world.js';
import { condition, heal } from './rolls.js';
import { makeEntity } from './sheets.js';
import { advanceTurn, AWAY, awayTurn, checkEnd, damage, endEncounter, finishTurn, heldBack, moveToEnd, presentAfter, startEncounter } from './resolve.js';

export const handlers = {

  // ----- table management -----
  claim(s, a, ctx, ev) {
    const e = ent(s, a.entity);
    if (ctx.role !== 'dm') {
      (e.kind === 'pc' && !e.owner) || fail(`${e.name} is already taken.`);
      a.user === ctx.userId || fail('You can only claim a character for yourself.');
      !Object.values(s.entities).some((o) => o.owner === ctx.userId) || fail('You already have a character.');
    }
    // A companion has no player of its own: it goes with its master's (docs/specs/companions.md, Decision 1).
    !e.bond || fail(`${e.name} goes with ${s.entities[e.bond.to]?.name ?? 'its master'}'s player.`);
    e.owner = a.user || null; e.ownerName = a.userName || null;
    ev.push({ type: 'claimed', id: e.id, userName: e.ownerName });
  },
  // Hand a character back so someone else can play it. Players can release their own; the DM, anyone's.
  release(s, a, ctx, ev) {
    const e = ent(s, a.entity);
    e.owner || fail(`Nobody is playing ${e.name}.`);
    ctx.role === 'dm' || e.owner === ctx.userId || fail(`${e.name} isn't yours to give up.`);
    e.owner = null; e.ownerName = null;
    ev.push({ type: 'released', id: e.id });
  },

  // ----- stepping away (resolve.js, AWAY; docs/specs/table-ui.md, E20) -----
  // { type: 'stepAway', actor, how? }: set a creature aside in the turn order while its player is
  // away. Its player may (the "need a break" button), as the table rule `breaks` allows: at once
  // (`on`), as a request the DM then grants by sending this action (`ask`), or not at all (`off`).
  // The DM may set anyone aside, and choose `how` (one of AWAY); else the table rule `away` says.
  // Sent again by the DM it changes `how`. Nothing is done on a connection's state: only a person sends this.
  stepAway(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(s, e, ctx);
    const dm = ctx.role === 'dm', breaks = s.settings.breaks ?? 'on';
    if (!dm) {
      a.how === undefined || fail('Only the DM chooses what is done with the turns of someone set aside.');
      breaks !== 'off' || fail('At this table only the DM sets a character aside.');
    }
    !e.dead || fail(`${e.name} is dead.`);
    inFight(s, e.id) || fail(`${e.name} can be set aside only in a fight.`);
    const how = a.how ?? s.settings.away ?? AWAY[0];
    AWAY.includes(how) || fail(`That can be: ${AWAY.join(', ')}.`);
    if (!dm && breaks === 'ask') {
      !e.away || fail(e.away.asked ? `${e.name} has already asked to step away.` : `${e.name} is already set aside.`);
      e.away = { asked: true, by: 'player' };
      ev.push({ type: 'away', id: e.id, by: 'player', asked: true });
      return;
    }
    (!e.away || e.away.asked || (dm && a.how !== undefined && e.away.how !== how)) || fail(`${e.name} is already set aside.`);
    // A player's break stays theirs when the DM grants it or changes how, so they can come back by themselves.
    e.away = { how, by: e.away?.by === 'player' || !dm ? 'player' : 'dm' };
    ev.push({ type: 'away', id: e.id, how, by: e.away.by });
    // Set aside on its own turn: the rest of the turn goes as the rule says. A stand-in plays on.
    const enc = s.encounter;
    if (!enc || current(s) !== e.id || how === 'standIn') return;
    if ((how === 'end' || how === 'endKeep') && presentAfter(s, enc.turn)) {
      const i = enc.turn;
      moveToEnd(s, e.id, how === 'endKeep', { budget: enc.budget, flags: enc.flags }, ev);   // the turn goes on where it stopped, at the end
      enc.turn = i - 1;                                                  // the creature after it is next
      advanceTurn(s, ev);
      return;
    }
    if (how === 'hold' ? finishTurn(s, e, ev) : awayTurn(s, e, ev)) advanceTurn(s, ev);   // a turn under way is not held: it ends
  },
  // { type: 'stepBack', actor }: the creature is back (or its request to step away is taken back). By
  // the DM, or by its player when the player stepped it aside (a player does not undo the DM's).
  // A turn held this round is taken after the one going on.
  stepBack(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(s, e, ctx);
    e.away || fail(`${e.name} is not set aside.`);
    ctx.role === 'dm' || e.away.by === 'player' || fail(`The DM set ${e.name} aside; only the DM can bring them back.`);
    const was = e.away;
    delete e.away;
    ev.push({ type: 'back', id: e.id, ...(was.asked ? { asked: true } : {}) });
    if (!was.asked) heldBack(s, e, ev);
  },

  // ----- DM only -----
  startEncounter(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can call for initiative.');
    !s.encounter || fail('A fight is already under way.');
    startEncounter(s, a.center, ev, a.radius || ARENA_RADIUS);
  },
  endEncounter(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can end the fight.');
    s.encounter || fail('There is no fight to end.');
    endEncounter(s, ev, 'ended');
  },
  // { type: 'spawn', monster, at, name?, hidden? }. `monster` may also name a summon block (content/srd52/summons.js),
  // baked for { slot, variant?, kind?, caster } as its spell would bake it, with `caster`'s numbers: an unbonded
  // creature (the DM may bond it), the same as a summoned one but for the bond (docs/specs/companions.md, C3).
  spawn(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can add creatures.');
    const block = CONTENT.summons[a.monster];
    for (const k of ['slot', 'variant', 'kind', 'caster']) block || a[k] === undefined || fail(`"${k}" is for a summon block.`);
    let tpl = MONSTERS[a.monster], type;
    if (block) {
      (Number.isInteger(a.slot) && a.slot >= block.level && a.slot <= 9) || fail(`${block.id} is made by a spell of level ${block.level} to 9: give its \`slot\`.`);
      !block.variants || block.variants.includes(a.variant) || fail(`Choose one of: ${block.variants.join(', ')}.`);
      block.variants || a.variant === undefined || fail(`${block.id} has no variants.`);
      !block.types || block.types.includes(a.kind) || fail(`Choose its creature type (\`kind\`): ${block.types.join(', ')}.`);
      block.types || a.kind === undefined || fail(`${block.id} has no choice of creature type.`);
      const c = ent(s, a.caster);
      const spell = Object.values(SPELLS).find((sp) => sp.def.effects.some((st) => st.summon === block.id))?.id ?? null;
      const made = summonTemplate(block.id, { slot: a.slot, caster: summonCaster(s, c, spell), ...(a.variant !== undefined ? { variant: a.variant } : {}), ...(a.kind !== undefined ? { type: a.kind } : {}) });
      tpl = made.record; type = made.type;
    }
    tpl || fail('Unknown monster.');
    const at = placeCreature(s, { size: tpl.size }, a.at);
    const id = `m${++s.seq}`;
    const n = Object.values(s.entities).filter((o) => o.tpl === a.monster && (!block || o.name?.startsWith(`${tpl.name} `))).length + 1;      // a block's variants are counted apart
    s.entities[id] = makeEntity(tpl, { id, tpl: a.monster, name: a.name || `${tpl.name} ${n}`, pos: at, ...(type ? { type } : {}), ...(a.hidden ? { hidden: true } : {}) });
    ev.push({ type: 'spawned', id });
    if (s.encounter?.arena[col(at)]) joinEncounter(s, s.entities[id], ev);
  },
  // { type: 'place', actor, to }: on the map in play. { type: 'place', who | actor, node, pin?, entry? }: anywhere in
  // the atlas (docs/specs/travel.md, Decision 4; engine/travel.js).
  place(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can place creatures.');
    if (a.node !== undefined) return placeIn(s, a, ctx, ev);
    const e = ent(s, a.actor);
    // On the nearest floor, or exactly where asked if a height is given and there is room there (in the air, say).
    const to = (a.to.z !== undefined && airspace(s.map, a.to) ? { q: a.to.q, r: a.to.r, z: a.to.z } : landing(s.map, a.to, e.pos.z)) || fail("There's nothing there to stand on.");
    !living(s).some((o) => o.id !== e.id && overlapAt(o, o.pos, e, to, gridOf(s.map))) || fail(`That ${gridOf(s.map).word.one} is occupied.`);
    e.pos = to;
    ev.push({ type: 'placed', id: e.id, to });
    lookAround(s, ev, [e]);
    if (s.encounter?.arena[col(to)] && !inFight(s, e.id) && !e.dead) joinEncounter(s, e, ev);
  },
  // The party members outside a running fight walk in and roll Initiative. { type: 'joinFight', who?: [ids] } (all of them without `who`).
  // The DM, or in solo the player; a hero the fight has not reached by the rules (no way there within 60 ft of the party) stays out and is told so.
  joinFight(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can bring the others into the fight.');
    s.encounter || fail('There is no fight to join.');
    a.who === undefined || (Array.isArray(a.who) && a.who.every((id) => s.entities[id]?.side === 'party')) || fail('Name party members to bring in.');
    const joined = bringIn(s, a.who, ev);
    joined.length || ev.some((x) => x.type === 'note') || fail('Everyone in the party is in the fight already.');
  },
  // Show a region to the players, or take it back. { type: 'revealRegion', region, revealed: true|false }
  revealRegion(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can reveal a place.');
    const r = s.map.regions.find((x) => x.id === a.region) || fail('No such region.');
    if (a.revealed === false) {
      r.revealed || fail(`${r.name} isn't revealed.`);
      !living(s).some((e) => e.side === 'party' && regionAt(s.map, under(s.map, e.pos)?.level.id, e.pos) === r) || fail(`Someone from the party is in ${r.name}.`);
      !s.encounter || fail("A place can't be hidden in the middle of a fight.");
      r.revealed = false;
      ev.push({ type: 'regionHidden', region: r.id });
    } else {
      !r.revealed || fail(`${r.name} is already revealed.`);
      revealRegion(s, r, ev);
    }
  },
  // Put an object into one of its states. { type: 'setObject', object, state }
  setObject(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can set objects.');
    const o = objectOf(s, a.object);
    Object.hasOwn(objectDef(o).states, a.state) || fail(`The ${objectName(o).toLowerCase()} has no such state.`);
    o.state !== a.state || fail(`The ${objectName(o).toLowerCase()} is already ${objectDef(o).states[a.state].name}.`);
    setObject(s, o, a.state, ev);
  },
  // Change the map in play: tiles, levels, walls, objects. { type: 'mapEdit', ops: [{ op, ... }] }
  // The changes are made to a copy and the copy is checked whole, so a bad edit changes nothing.
  mapEdit(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can change the map.');
    !s.map?.holding || fail('This is not a battle map: there is nothing to edit here.');
    (Array.isArray(a.ops) && a.ops.length > 0 && a.ops.length <= 2000) || fail('Nothing to change.');
    const map = structuredClone(s.map);
    for (const op of a.ops) {
      const edit = (op && Object.hasOwn(EDITS, op.op) && EDITS[op.op]) || fail(`Unknown map change: ${op?.op}`);
      const problem = edit(map, op);
      if (problem) fail(problem);
    }
    const problems = lintMap(map);
    problems.length === 0 || fail(`That change can't be made. ${problems[0]}`);
    const B = barriers(map);
    for (const e of living(s)) {                         // a floor may give way under someone, but there must be something to land on
      const sf = under(map, e.pos);
      (sf && !(sf.z === e.pos.z && B.solid(sf.level.id, e.pos))) || fail(`${e.name} would be left with nowhere to stand.`);
    }
    s.map = map;
    ev.push({ type: 'mapEdit', count: a.ops.length });
    lookAround(s, ev);
  },
  // Take a creature out of the game. { type: 'remove', actor }
  remove(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can remove a creature.');
    const e = ent(s, a.actor);
    !inFight(s, e.id) || fail(`${e.name} is in the fight. End the fight first.`);
    // A familiar in its pocket dimension (companions.md, stage C5c) would go with its master's record, unseen and untold.
    const held = pocketOf(e);
    !held.length || fail(`${e.name} has ${held.map((x) => x.name).join(', ')} in a pocket dimension. Recall ${held.length > 1 ? 'them' : 'it'} or dismiss ${held.length > 1 ? 'them' : 'it'} forever first (dismiss with forever: true).`);
    for (const fx of [...effectsOf(s)]) if (fx.source === e.id || fx.parts.some((p) => p.target === e.id)) endEffect(s, ev, fx, `${e.name} left`);
    // Its companions stay, freed: on their side, the DM's.
    for (const x of Object.values(s.entities)) if (x.bond?.to === e.id) { delete x.bond; ev.push({ type: 'unbonded', id: x.id, from: e.id }); }
    // Whether the party knew of it, for view.js, which can no longer look it up (as `vanished`; review of #313).
    ev.push({ type: 'removed', id: e.id, name: e.name, ...(!unknown(s, e) ? { seen: true } : {}), ...(e.side === 'party' ? { party: true } : {}) });
    for (const x of Object.values(s.entities)) if (x.follow === e.id) unfollow(s, x, ev);
    delete s.entities[e.id];
  },
  // Hand a creature a light to carry, or take it away. { type: 'setLight', actor, item } with an item
  // from content/lights.js (a torch, a lamp), or { light: { bright, dim } } in feet; `item: null` puts it out.
  setLight(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can hand out light.');
    const e = ent(s, a.actor);
    if (a.item === null || a.light === null) {
      e.light || fail(`${e.name} carries no light.`);
      delete e.light;
      return ev.push({ type: 'light', id: e.id, bright: 0, dim: 0 });
    }
    const item = a.item === undefined ? null : (typeof a.item === 'string' && Object.hasOwn(LIGHTS, a.item) && a.item) || fail('Unknown light.');
    const l = item ? LIGHTS[item] : a.light ?? fail('Name a light or give its radii.');
    const feet = (n) => Number.isInteger(n) && n >= 0 && n <= 600 && n % FT === 0;
    (l && typeof l === 'object' && feet(l.bright) && feet(l.dim) && l.bright + l.dim > 0) || fail('A light is Bright and Dim radii in feet, multiples of 5.');
    e.light = { bright: l.bright, dim: l.dim, ...(item ? { item } : {}) };
    ev.push({ type: 'light', id: e.id, bright: l.bright, dim: l.dim, ...(item ? { item, name: LIGHTS[item].name } : {}) });
  },
  // Play on a different map, of either grid. The party is set down at its start; the creatures of
  // the old place stay behind with it, and so do areas laid on its cells (E8, below). A map of an
  // older format is brought up to date first, as every map that enters the game is.
  // { type: 'loadMap', map, entry? }: with `entry`, the party arrives at that entry's starts
  // (docs/specs/travel.md, Decision 3); without it, at the starts that belong to no entry.
  // { type: 'loadMap', node, entry?, who?, stale?, map? }: to a place of the world, keeping the one left (travel.md,
  // Decision 5; engine/travel.js). Without `node`, the old map is thrown away as it always was, world or not.
  loadMap(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can change the map.');
    !s.encounter || fail("The map can't change in the middle of a fight.");
    if (a.node !== undefined) return loadNode(s, a, ctx, ev);
    let map;
    try { map = migrateMap(structuredClone(a.map)); } catch { fail("That map can't be used. It is not a map document."); }
    const problems = lintMap(map);
    problems.length === 0 || fail(`That map can't be used. ${problems[0]}`);
    typeof a.entry === 'string' || a.entry === undefined || fail('Name an entry by its id.');
    // Arrivals come in marching order and at the entry's starts, or the starts of no entry (places.js, arrivalSpots).
    const all = Object.values(s.entities), party = marchOrder(all.filter((e) => e.side === 'party'), all);
    const r = arrivalSpots(map, party.length, a.entry ?? null);
    const spots = r.spots ?? fail(r.problem);
    const leaving = new Set(Object.values(s.entities).filter((e) => e.side !== 'party').map((e) => e.id));
    for (const fx of [...effectsOf(s)]) if (leaving.has(fx.source) || fx.parts.some((p) => leaving.has(p.target))) endEffect(s, ev, fx, 'the party moved on');
    // E8 (docs/specs/square-grid.md, Decision 4): a lasting area laid on the old map's cells, a zone
    // (Moonbeam, Web) or changed ground (Grease, Fog Cloud), is left behind with them. A zone that
    // moves with a creature of the party (Spirit Guardians) goes with it.
    for (const fx of [...effectsOf(s)]) if (fx.terrain || (fx.zone && !fx.zone.follows)) endEffect(s, ev, fx, 'the party moved on');
    for (const id of leaving) delete s.entities[id];
    s.map = map;
    party.forEach((e, i) => { e.pos = spots[i]; setPin(s, e.id, null); });
    if (s.place) s.place = null;                       // the map in play is no longer a place of the world
    ev.push({ type: 'map', map: map.id, name: map.name });
    lookAround(s, ev);
  },
  // Hide a creature from the players, or show it to them. { type: 'reveal', actor, hidden: true|false }
  reveal(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can hide or reveal creatures.');
    const e = ent(s, a.actor);
    // What a companion that vanished unseen left (resolve.js, vanishUnseen) is not a creature to show: it is gone.
    !e.vanished || a.hidden || fail(`${e.name} has vanished; there is nothing of it to reveal. Remove it when nothing of it is needed.`);
    if (a.hidden) {
      e.side !== 'party' || fail("A party member can't be hidden from the party.");
      !e.hidden || fail(`${e.name} is already hidden.`);
      !inFight(s, e.id) || fail(`${e.name} is in the fight and can't be hidden.`);
      e.hidden = true;
      ev.push({ type: 'concealed', id: e.id });
    } else {
      (e.hidden || e.hiding) || fail(`${e.name} isn't hidden.`);
      unhide(s, e, ev, 'noise');                                         // one that took the Hide action made itself heard
      reveal(s, e, ev);
    }
  },
  // Put a condition on a creature or take it off. { type: 'condition', actor, condition, on: true|false, level? }
  condition(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can set conditions.');
    const e = ent(s, a.actor), def = conditionDef(a.condition);
    (def && CONTENT.conditions[a.condition]) || fail('Unknown condition.');
    if (a.on === false) {
      e.cond[a.condition] || fail(`${e.name} isn't ${def.name}.`);
      delete e.cond[a.condition];
      ev.push({ type: 'condEnd', id: e.id, cond: a.condition });
      return;
    }
    up(e) || fail(`${e.name} is down.`);
    !immuneTo(s, e, a.condition) || fail(`${e.name} is immune to ${def.name}.`);
    const level = def.levels ? Math.max(1, Math.min(def.levels, a.level | 0 || 1)) : undefined;
    if (e.cond[a.condition]) {
      (def.levels && e.cond[a.condition].level !== level) || fail(`${e.name} is already ${def.name}.`);
      e.cond[a.condition].level = level;
      ev.push({ type: 'cond', id: e.id, cond: a.condition, level });
      return;
    }
    condition(s, e, a.condition, ev, null, null, level);
  },
  setHp(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can set Hit Points.');
    const e = ent(s, a.actor), hp = Math.max(0, Math.min(e.maxHp, a.hp | 0));
    // The dead are walked over (they fill no space), so a body may lie where a creature now stands: a rider that died on
    // its mount lies under the mount (DEBT W18). Brought back there, the two would fill one space with no ride. Refused,
    // changing nothing: the DM moves one of them first. (The engine does not pick a place for the body to get up in.)
    if (e.dead && hp > 0) {
      const G = gridOf(s.map), over = living(s).find((o) => o.id !== e.id && overlapAt(o, o.pos, e, e.pos, G));
      !over || fail(`${over.name} stands where ${e.name}'s body lies: move one of them before bringing ${e.name} back.`);
    }
    if (hp > e.hp) { e.dead = false; delete e.remains; heal(s, e, hp - e.hp, ev); } else if (hp < e.hp) damage(s, e, e.hp - hp, 'untyped', ev, { raw: true });
    checkEnd(s, ev);
  },
  // The DM's damage and healing, by the rules: Resistance and the like, Temporary Hit Points first, Concentration, death saves.
  harm(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can do damage this way.');
    const e = ent(s, a.actor), n = a.amount;
    (Number.isInteger(n) && n > 0 && n <= 9999) || fail('Damage must be a whole number above 0.');
    e.dead && fail(`${e.name} is dead.`);
    damage(s, e, n, a.dtype ?? 'untyped', ev);
    checkEnd(s, ev);
  },
  mend(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can heal this way.');
    const e = ent(s, a.actor), n = a.amount;
    (Number.isInteger(n) && n > 0 && n <= 9999) || fail('Healing must be a whole number above 0.');
    e.dead && fail(`${e.name} is dead; healing does not bring back the dead.`);
    heal(s, e, n, ev);
  },
  // Handouts and notes to one player: handout, showHandout, hideHandout, removeHandout, note (handouts.js).
  ...handoutActions(fail),
  // Scenes: scene, endScene, sceneNpc, say, askCheck, sceneChronicle (scenes.js).
  ...sceneActions(fail),
  // Point out a cell to everyone at the table. { type: 'ping', at: { q, r } }. It changes no state of its own and is not an undo step or a timeline
  // entry (engine.js `record`): the event is told once to everyone (view.js). A cell the sender is not sent (a region not revealed, a tile not yet made out under the light rule) is refused as a cell off the map.
  ping(s, a, ctx, ev) {
    const dm = ctx.role === 'dm';
    dm || (typeof ctx.userId === 'string' && ctx.userId) || fail('Join the table first.');
    const at = a.at, bad = () => fail('Pick a spot on the map.');
    if (!at || typeof at !== 'object' || !Number.isInteger(at.q) || !Number.isInteger(at.r) || !Array.isArray(s.map?.levels)) bad();
    // A player may name only a cell the view would send them (`tileSent`, the call view.js makes, under whatever sight rule is in force), and the height
    // comes only from such a surface: a hidden floor above or below is neither accepted nor measured. The DM's is any cell of the map.
    const want = Number.isInteger(at.z) ? at.z : 0;
    const here = surfaces(s.map, at).filter((sf) => dm || tileSent(s, sf.level.id, at));
    here.length || bad();
    const land = here.reduce((b, sf) => (Math.abs(sf.z - want) < Math.abs(b.z - want) ? sf : b));
    const name = String(a.userName ?? '').trim().slice(0, 40) || (dm ? 'DM' : 'A player');
    ev.push({ type: 'ping', from: dm ? 'dm' : ctx.userId, name, at: { q: at.q, r: at.r, z: land.z } });
  },
  setting(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can change table settings.');
    Object.hasOwn(SETTINGS, a.key) || fail('Unknown setting.');
    SETTINGS[a.key].includes(a.value) || fail(`That setting can be: ${SETTINGS[a.key].join(', ')}.`);
    const was = a.key === 'hpMethod' ? (s.settings.hpMethod ?? 'fixed') : null;
    s.settings[a.key] = a.value;
    // Hit Points are counted when a character is built or rebuilt, so a switch changes nobody on the spot: the DM is told (and only the DM).
    if (was !== null && was !== a.value) ev.push({ type: 'manual', actor: null, name: 'Hit Points', partial: true, text: `Hit Points are now ${a.value === 'rolled' ? 'rolled' : 'fixed'}. Existing characters change the next time they are rebuilt (level up, edit, refresh); rolls already made are kept and count again if you switch back.` });
  },
  // Which homebrew packs the game needs: `{ packs: [{ id, version, hash }] }`, replacing the list (docs/specs/homebrew.md,
  // Decision 3, row H5). Ids, versions and hashes only: the server holds the pack data, checks it, and then sends this.
  setPacks(s, a, ctx) {
    ctx.role === 'dm' || fail('Only the DM can change the table\'s packs.');
    const problem = packsProblem(a.packs);
    if (problem) fail(problem);
    s.packs = copyPacks(a.packs);
  },
};

// Table rules the DM can switch, and what each may be set to.
export const SETTINGS = { sight: SIGHT_RULES,
  // Square maps only (docs/specs/square-grid.md): how a diagonal step is counted, how reach and
  // range are measured, and which squares a Sphere, Cylinder or Emanation covers. Absent means the
  // first value. What each means is SETTING_TEXT, below.
  diagonals: DIAGONALS, squareRange: SQUARE_RANGES, areaFill: AREA_FILLS, autoEngage: [true, false], passiveFind: ['off', 'traps', 'all'], vertical: ['max', 'sum', 'true'], climbing: ['on', 'off'], cover: ['on', 'off'], creatureCover: ['on', 'off'], engageRange: [10, 30, 60], unseenTurns: ['say', 'quiet'], diceThrow: ['auto', 'throw'], pace: ['wait', 'flow', 'instant'],
  // Who reviews the rewards of a fight (rewards.js): the DM first, nobody (published at once), or none are made.
  conclusion: ['dm', 'auto', 'off'], xpShare: ['split', 'full'],
  // Travel (docs/specs/travel.md, Decision 5, W4): whether a player whose characters are in a place that is not in play watches the place that is, live (the
  // first value, and the default when absent), or is sent the band and the table's talk only.
  watching: ['live', 'off'],
  // Strike first (resolve.js, strikesFirst; docs/specs/table-ui.md, E23 as amended by #585): what lands before the fight
  // it starts. 'off' (the SRD's way), 'casts' (the DM's hostile cast at the party, while `autoEngage` is on: the rule as
  // #372 built it), 'all' (casts, attacks and a monster's actions, by anyone, at another side). Absent means the first; a
  // table saved before state version 27 has 'casts' where `autoEngage` was on (migrate.js). Words in SETTING_TEXT.
  strikeFirst: ['off', 'casts', 'all'],
  // Square maps only: how cover is judged (sight.js); absent means the first. Words in SETTING_TEXT.
  squareCover: SQUARE_COVERS,
  // Stepping away (resolve.js, AWAY): what becomes of the turns of a creature set aside, and what a
  // player's "need a break" does. Absent means the first. Words in SETTING_TEXT.
  away: AWAY, breaks: ['on', 'ask', 'off'],
  // Rolled ability scores (docs/specs/ability-scores.md, scores.js): whether a score may be rolled again (once), which, and which result stands. Absent means the first.
  scoreReroll: ['none', 'below', 'each'], scoreRerollBelow: [10, 8, 9, 11, 12, 13, 14], scoreRerollResult: ['new', 'higher'],
  // Hit Points (hitpoints.js, #638): fixed (the first, the SRD's default) or rolled at each level after the first; what a low roll does at a rolled table.
  hpMethod: ['fixed', 'rolled'], hpRollLow: ['keep', 'reroll1', 'fixedMin'] };
// What the square-map settings and the stepping-away rules mean, in words a DM reads beside the choice.
export const SETTING_TEXT = {
  hpMethod: {
    fixed: 'Each level after the first adds the class\'s fixed Hit Point value: half the Hit Die, plus 1, plus Constitution (the default).',
    rolled: 'Each level after the first adds a roll of the class\'s Hit Die, plus Constitution, at least 1. Level 1 stays the highest number of the die. The game rolls it, in the log for everyone, when a character levels up or is added above level 1. Existing characters change the next time they are rebuilt; rolls already made are kept and count again if you switch back.',
  },
  hpRollLow: {
    keep: 'A Hit Point roll stands as rolled (the default).',
    reroll1: 'A Hit Point roll of 1 is rolled again, once; the new roll stands, even if it is a 1.',
    fixedMin: 'If a Hit Point roll is lower than the fixed value, the fixed value is taken instead.',
  },
  watching: {
    live: 'A player whose characters are in another place watches the group in play live: its map, creatures and talk, under a band that says their characters are not there. The default.',
    off: 'A player whose characters are in another place is sent the band and the table\'s out-of-character talk only, not the scene in play. Use it when watching would spoil the scene.',
  },
  strikeFirst: {
    off: 'An attack, a hostile spell or a monster\'s action outside a fight starts the fight and is not made yet: everyone rolls Initiative, and the creature makes it on its turn. The SRD\'s rule, the default.',
    casts: 'Only while "Start a fight when the party comes near enemies" is on: your hostile spell at a party member, outside a fight, lands first (its rolls, saves, damage and the reactions it allows), then the fight starts. With that off, nothing lands first. Attacks, monsters\' actions and the players\' spells start the fight and are not made yet. A table rule; it is not in the SRD.',
    all: 'An attack, a hostile spell or a monster\'s action at a creature of another side, outside a fight, by you or a player, lands first (its rolls, saves, damage and the reactions it allows), then the fight starts and everyone rolls Initiative. The creature\'s first turn is still a whole turn. A table rule; it is not in the SRD.',
  },

  scoreReroll: {
    none: 'Rolled ability scores stand as rolled: no score may be rolled again (the SRD\'s rule, the default).',
    below: 'A rolled score below the number set under it may be rolled again, once. "Below" is judged on the score first rolled.',
    each: 'Every rolled score may be rolled again, once.',
  },
  scoreRerollResult: {
    new: 'The new roll of a score rolled again stands, even if it is lower (the default).',
    higher: 'Of a score and its roll again, the higher stands.',
  },
  away: {
    dodge: 'A creature set aside takes the Dodge action on its turn and stays where it is (the default). Set aside on its own turn, it takes the Dodge action if it still has its action, and its turn ends. A table rule; the SRD has no rule for a player who steps away.',
    end: 'A creature set aside has its turn moved to the end of the round, and gets its place back next round. Back by then, it plays that turn; still away, it takes the Dodge action and stays where it is. Set aside part-way through its own turn, the rest of that turn waits at the end of the round. A table rule; the SRD has no rule for delaying a turn.',
    endKeep: 'As moving to the end of the round, but the creature keeps its new place at the end in the rounds after. A table rule.',
    hold: 'A creature set aside has its turns passed over, untaken. Back within the round, it takes that round\'s turn after the turn going on; a turn passed in an earlier round is gone. Set aside on its own turn, that turn ends. A turn passed over is not a turn: nothing that ends at the start or end of its turn ends. A table rule.',
    standIn: 'A stand-in plays a creature set aside: its turns start as usual and the DM\'s screen plays them with the monster AI, as it plays monsters, which may move it into harm. A table rule.',
  },
  breaks: {
    on: 'A player may step their own character aside ("need a break") at once, under the rule above; the table is told, and the DM may change what is done with its turns.',
    ask: 'A player\'s "need a break" asks the DM, who steps the character aside; the table is told it was asked.',
    off: 'Only the DM sets a character aside.',
  },
  diagonals: {
    real: 'Diagonals are measured for real (the default): a step to a side costs 5 ft, a diagonal step about 7 ft (5 x 1.41), doubled by Difficult Terrain as any step is. A creature with any movement left may still enter one more square on the flat (not up or down: climbing, stairs, a ladder or flying up is paid in full); that step uses up the rest. Forced movement counts diagonals the same way, with no extra square. A table rule, not the SRD count.',
    srd: 'Every diagonal costs 5 ft, the same as a step to a side, as the SRD counts squares.',
    alternate: 'Every second diagonal in a turn costs 10 ft (5, 10, 5, 10...); forced movement counts its own diagonals the same way. A table rule; it is not in the SRD.',
  },
  squareRange: {
    real: 'Reach and range are measured centre to centre for real and rounded down to a whole 5 ft (the default): the 8 squares around a creature are within 5 ft, three squares diagonally are 20 ft. A table rule, not the SRD count.',
    srd: 'Reach and range count squares as the SRD does: a diagonal counts as one square, like a side.',
  },
  areaFill: {
    round: 'A square is in a Sphere, Cylinder or Emanation when its centre is inside the real shape (the default): a 20-ft Sphere covers 49 squares. Cones, Lines and Cubes always go by centres inside the shape. A table rule; the SRD does not say which squares an area covers.',
    grid: 'A Sphere, Cylinder or Emanation covers every square within its size counted as the SRD counts range, a diagonal like a side: a 20-ft Sphere covers 81 squares (a 9 by 9 block). Cones, Lines and Cubes still go by centres inside the shape. A table rule.',
  },
  squareCover: {
    obstacle: 'Cover by what is in the way (the default): the line to the middle of the target and the lines to its corners. All clear: no cover. The middle clear but a corner hidden, or a creature on the line: Half. The middle behind something solid but part of the target showing round it: Three-Quarters. All of it behind a window, a rail or a lowered grille: Three-Quarters. All of it behind a wall or a shut door: Total. A chest, a crate or a statue gives Half at most. A curtain is no cover; what is behind it cannot be seen. A table rule; the SRD does not say how to judge cover on a grid.',
    corners: 'Cover by the corners of the target\'s square in view: all four, none; two or three, Half; one, Three-Quarters; none and the middle hidden, Total. Walls and shut doors count, a rail gives Half, windows and things in a square do not count. A table rule.',
  },
};

