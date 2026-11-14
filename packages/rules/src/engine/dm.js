// The DM's tools and the map (engine.js): claiming characters, starting and ending fights, spawning
// and placing creatures, regions, objects, map edits and loading, light, conditions and Hit Points,
// handouts and scenes, and table settings.
import { gridOf, col, key, parse } from '../grid.js';
import { CONTENT, MONSTERS, TILES } from '../content/index.js';
import { effectsOf, endEffect } from '../durations.js';
import { FT, ground, landing, overlapAt, regionAt, SQUARE_RANGES, STEP_MAX, under } from '../space.js';
import { LIGHTS } from '../content/lights.js';
import { EDITS, lintMap, migrateMap } from '../map.js';
import { handoutActions } from '../handouts.js';
import { sceneActions } from '../scenes.js';
import { SIGHT_RULES } from '../vision.js';
import { SQUARE_COVERS } from '../sight.js';
import { barriers, objectDef } from '../walls.js';
import { conditionDef, immuneTo } from '../modifiers.js';
import { ARENA_RADIUS, control, current, ent, fail, inFight, living, up } from './shared.js';
import { airspace, AREA_FILLS, DIAGONALS, fitsOn, joinEncounter, lookAround, objectName, objectOf, reveal, revealRegion, setObject, unfollow, unhide } from './world.js';
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

  // ----- stepping away (resolve.js, AWAY; docs/specs/table-ui.md, E19) -----
  // { type: 'stepAway', actor, how? }: set a creature aside in the turn order while its player is
  // away. Its player may (the "need a break" button), as the table rule `breaks` allows: at once
  // (`on`), as a request the DM then grants by sending this action (`ask`), or not at all (`off`).
  // The DM may set anyone aside, and choose `how` (one of AWAY); else the table rule `away` says.
  // Sent again by the DM it changes `how`. Nothing is done on a connection's state: only a person sends this.
  stepAway(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    const dm = ctx.role === 'dm', breaks = s.settings.breaks ?? 'on';
    if (!dm) {
      a.how === undefined || fail('Only the DM chooses what is done with the turns of someone set aside.');
      breaks !== 'off' || fail('At this table only the DM sets a character aside.');
    }
    !e.dead || fail(`${e.name} is dead.`);
    const how = a.how ?? s.settings.away ?? AWAY[0];
    AWAY.includes(how) || fail(`That can be: ${AWAY.join(', ')}.`);
    if (!dm && breaks === 'ask') {
      !e.away || fail(e.away.asked ? `${e.name} has already asked to step away.` : `${e.name} is already set aside.`);
      e.away = { asked: true, by: 'player' };
      ev.push({ type: 'away', id: e.id, by: 'player', asked: true });
      return;
    }
    (!e.away || e.away.asked || (dm && a.how !== undefined && e.away.how !== how)) || fail(`${e.name} is already set aside.`);
    e.away = { how, by: dm ? 'dm' : 'player' };
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
  // its player or the DM. A turn held this round is taken after the one going on.
  stepBack(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    e.away || fail(`${e.name} is not set aside.`);
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
  spawn(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can add creatures.');
    const tpl = MONSTERS[a.monster] || fail('Unknown monster.');
    const at = landing(s.map, a.at);
    (at && TILES[ground(s.map, at).tile.t].cost < Infinity) || fail("A creature can't stand there.");
    const body = { size: tpl.size };
    fitsOn(s.map, body, at, barriers(s.map)) || fail(`There isn't room for something ${tpl.size} there.`);
    !living(s).some((o) => overlapAt(o, o.pos, body, at, gridOf(s.map))) || fail(`That ${gridOf(s.map).word.one} is occupied.`);
    const id = `m${++s.seq}`;
    const n = Object.values(s.entities).filter((o) => o.tpl === a.monster).length + 1;
    s.entities[id] = makeEntity(tpl, { id, tpl: a.monster, name: a.name || `${tpl.name} ${n}`, pos: at, ...(a.hidden ? { hidden: true } : {}) });
    ev.push({ type: 'spawned', id });
    if (s.encounter?.arena[col(at)]) joinEncounter(s, s.entities[id], ev);
  },
  place(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can place creatures.');
    const e = ent(s, a.actor);
    // On the nearest floor, or exactly where asked if a height is given and there is room there (in the air, say).
    const to = (a.to.z !== undefined && airspace(s.map, a.to) ? { q: a.to.q, r: a.to.r, z: a.to.z } : landing(s.map, a.to, e.pos.z)) || fail("There's nothing there to stand on.");
    !living(s).some((o) => o.id !== e.id && overlapAt(o, o.pos, e, to, gridOf(s.map))) || fail(`That ${gridOf(s.map).word.one} is occupied.`);
    e.pos = to;
    ev.push({ type: 'placed', id: e.id, to });
    lookAround(s, ev, [e]);
    if (s.encounter?.arena[col(to)] && !inFight(s, e.id) && !e.dead) joinEncounter(s, e, ev);
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
    for (const fx of [...effectsOf(s)]) if (fx.source === e.id || fx.parts.some((p) => p.target === e.id)) endEffect(s, ev, fx, `${e.name} left`);
    ev.push({ type: 'removed', id: e.id, name: e.name });
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
  // older format is brought up to date first, as every map that enters the game is. { type: 'loadMap', map }
  loadMap(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can change the map.');
    !s.encounter || fail("The map can't change in the middle of a fight.");
    let map;
    try { map = migrateMap(structuredClone(a.map)); } catch { fail("That map can't be used. It is not a map document."); }
    const problems = lintMap(map);
    problems.length === 0 || fail(`That map can't be used. ${problems[0]}`);
    const walkable = (p) => p && TILES[ground(map, p).tile.t].cost < Infinity;
    const first = map.starts[0] ?? parse(Object.keys(map.levels[0].tiles)[0]);
    const start = landing(map, first, first.z ?? 0);
    const party = Object.values(s.entities).filter((e) => e.side === 'party'), spots = [], taken = new Set();
    const take = (p) => { spots.push(p); taken.add(key(p)); };
    // The map's starts in order, each where a creature can stand (walkable ground, nothing solid on
    // it, not taken); then, for anyone left, the spiral out from the first start, as before.
    const B = barriers(map), G = gridOf(map);
    for (const st of map.starts) {
      if (spots.length >= party.length) break;
      const p = landing(map, st, st.z ?? 0), level = p && ground(map, p)?.level;
      if (walkable(p) && level && !B.solid(level.id, p) && !taken.has(key(p))) take(p);
    }
    for (let n = 0; n < 12 && spots.length < party.length; n++) {
      for (const h of G.range(start, n)) {
        const p = G.dist(h, start) === n ? landing(map, h, start.z) : null;
        if (walkable(p) && Math.abs(p.z - start.z) <= STEP_MAX && spots.length < party.length && !taken.has(key(p))) take(p);
      }
    }
    spots.length === party.length || fail("That map has no room for the party at its start.");
    const leaving = new Set(Object.values(s.entities).filter((e) => e.side !== 'party').map((e) => e.id));
    for (const fx of [...effectsOf(s)]) if (leaving.has(fx.source) || fx.parts.some((p) => leaving.has(p.target))) endEffect(s, ev, fx, 'the party moved on');
    // E8 (docs/specs/square-grid.md, Decision 4): a lasting area laid on the old map's cells, a zone
    // (Moonbeam, Web) or changed ground (Grease, Fog Cloud), is left behind with them. A zone that
    // moves with a creature of the party (Spirit Guardians) goes with it.
    for (const fx of [...effectsOf(s)]) if (fx.terrain || (fx.zone && !fx.zone.follows)) endEffect(s, ev, fx, 'the party moved on');
    for (const id of leaving) delete s.entities[id];
    s.map = map;
    party.forEach((e, i) => { e.pos = spots[i]; });
    ev.push({ type: 'map', map: map.id, name: map.name });
    lookAround(s, ev);
  },
  // Hide a creature from the players, or show it to them. { type: 'reveal', actor, hidden: true|false }
  reveal(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can hide or reveal creatures.');
    const e = ent(s, a.actor);
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
  setting(s, a, ctx) {
    ctx.role === 'dm' || fail('Only the DM can change table settings.');
    Object.hasOwn(SETTINGS, a.key) || fail('Unknown setting.');
    SETTINGS[a.key].includes(a.value) || fail(`That setting can be: ${SETTINGS[a.key].join(', ')}.`);
    s.settings[a.key] = a.value;
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
  // Square maps only: how cover is judged (sight.js); absent means the first. Words in SETTING_TEXT.
  squareCover: SQUARE_COVERS,
  // Stepping away (resolve.js, AWAY): what becomes of the turns of a creature set aside, and what a
  // player's "need a break" does. Absent means the first. Words in SETTING_TEXT.
  away: AWAY, breaks: ['on', 'ask', 'off'] };
// What the square-map settings and the stepping-away rules mean, in words a DM reads beside the choice.
export const SETTING_TEXT = {
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

