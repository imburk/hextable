// Companions (engine.js; docs/specs/companions.md, stage C1): a creature bound to another, its master.
// The bond is a field on the bonded creature, `bond: { to, kind, turn, orders, at0, ... }`; the bonded
// creature has no `owner` of its own, and whoever plays its master plays it (shared.js, ownerOf and
// control). How a bond ends is in resolve.js (vanish, settleBonds).
//
// Built here: the DM's `bond` action (pets, hirelings' mounts, a foe's familiar), `companion { auto }`, the
// master's before or after choice (`companionOrder`, A1) and `command` (stage C5a, amendment A2: who plays a
// commanded creature is in shared.js, ownerOf, control and the lock; the command is taken up at the start of the
// creature's turn, resolve.js). Bonds made by spells (`fx`, `source`, `ends`, `leash`) come from the summon step;
// no turn at all is not run yet, and the DM's bond refuses it. A turn straight after the
// master's (stage C2) is kept in the fight order (world.js, initiativeSort and followMasters).
import { BOND_MAX, companionsOf, ent, control, fail, ft, inFight, need, roomForCompanions } from './shared.js';
import { followMasters, lookAround, unfollow } from './world.js';
import { unknown } from '../vision.js';
import { apart, FT } from '../space.js';
import { turnKey } from '../durations.js';

// What a companion is (Decision 1). A DM's bond is a `pet` unless the DM says otherwise.
export const BOND_KINDS = ['familiar', 'steed', 'summon', 'undead', 'object', 'servant', 'pet'];
export const BOND_TURNS = ['own', 'after', 'none'];
export const BOND_ORDERS = ['free', 'command'];
export const BOND_AT0 = ['vanish', 'dies'];
// Whether a companion whose turn is on its master's count acts straight after the master (the default) or straight
// before it: the master's player's choice, per round (A1; owner's answer to question 3).
export const BOND_SIDES = ['after', 'before'];
// What 0 Hit Points does by default: the SRD's familiar, steed, spirits, servant and animated object
// disappear; undead and ordinary animals die (Decision 4). The DM may say otherwise (`at0`).
const AT0_BY_KIND = { familiar: 'vanish', steed: 'vanish', summon: 'vanish', servant: 'vanish', object: 'vanish', undead: 'dies', pet: 'dies' };
const FIELDS = ['kind', 'turn', 'orders', 'at0', 'noAttack'];

// The cap and companionsOf live in shared.js, used by the DM's `bond` here and by a cast's summon (casting.js).
export { BOND_MAX, companionsOf } from './shared.js';

export const handlers = {
  // { type: 'bond', actor, to, kind?, turn?, orders?, at0?, noAttack? }: the DM binds a creature to a
  // master, which then plays it (through its player, if it has one). It takes its master's side.
  // { type: 'bond', actor, to: null } frees it: it stays where it is, on the side it is on, the DM's.
  bond(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can bind a creature to another.');
    const e = ent(s, a.actor);
    if (a.to === null) {
      e.bond || fail(`${e.name} is no one's companion.`);
      FIELDS.every((k) => a[k] === undefined) || fail('A companion is freed with { to: null } and nothing else.');
      const from = e.bond.to;
      delete e.bond;
      ev.push({ type: 'unbonded', id: e.id, from });
      followMasters(s, true);                        // in a fight it keeps its place and its count (it does not roll again)
      return;
    }
    typeof a.to === 'string' || fail('Name its master ({ to: id }), or free it ({ to: null }).');
    const m = ent(s, a.to);
    m.id !== e.id || fail(`${e.name} can't be its own companion.`);
    e.kind !== 'pc' || fail(`${e.name} is a player's character and can't be a companion.`);
    !e.owner || fail(`${e.name} has a player of its own. Give it up first.`);
    !e.dead || fail(`${e.name} is dead.`);
    !m.dead || fail(`${m.name} is dead.`);
    !e.bond || fail(`${e.name} is already ${s.entities[e.bond.to]?.name ?? 'someone'}'s companion. Free it first ({ to: null }).`);
    !m.bond || fail(`${m.name} is a companion itself and can't have companions.`);
    !companionsOf(s, e.id).length || fail(`${e.name} has companions of its own.`);
    roomForCompanions(s, m);
    const kind = a.kind ?? 'pet';
    BOND_KINDS.includes(kind) || fail(`A companion's kind can be: ${BOND_KINDS.join(', ')}.`);
    const turn = a.turn ?? 'own';
    BOND_TURNS.includes(turn) || fail(`A companion's turn can be: ${BOND_TURNS.join(', ')}.`);
    // The engine does not yet run a turn of none (riding and the servant, stages C5 and C6): it refuses it rather
    // than store a choice it would not keep. A turn after its master's is built (C2), and commands (C5a): a DM's
    // bond has no command range (`range` comes from a spell's step), so its master commands it at any distance.
    turn !== 'none' || fail('A companion can have a turn of its own or one straight after its master\'s so far: no turn at all is not built yet.');
    const orders = a.orders ?? 'free';
    BOND_ORDERS.includes(orders) || fail(`A companion's orders can be: ${BOND_ORDERS.join(', ')}.`);
    const at0 = a.at0 ?? AT0_BY_KIND[kind];
    BOND_AT0.includes(at0) || fail('At 0 Hit Points a companion can: vanish, dies.');
    (a.noAttack === undefined || typeof a.noAttack === 'boolean') || fail('Say whether it can attack: { noAttack: true } or leave it out.');
    // "A companion fights on its master's side": it takes that side, but not in the middle of a fight it is in.
    const turned = e.side !== m.side;
    !turned || !inFight(s, e.id) || fail('A companion fights on its master\'s side, and a creature in the fight can\'t change sides.');
    // A party member is never hidden from the party (hidden-information.md, section 5).
    !turned || m.side !== 'party' || !e.hidden || fail(`${e.name} is hidden from the party. Reveal it first: a party member can't be hidden.`);
    if (turned) {
      if (e.follow) unfollow(s, e, ev);
      for (const x of Object.values(s.entities)) if (x.follow === e.id) unfollow(s, x, ev);
      e.side = m.side;
    }
    e.bond = { to: m.id, kind, fx: null, turn, orders, at0, ends: [], ...(a.noAttack ? { noAttack: true } : {}), commanded: null, auto: false };
    ev.push({ type: 'bonded', id: e.id, to: m.id, kind, ...(turned ? { side: e.side } : {}) });
    followMasters(s, true);                          // in a fight, a turn after its master's: behind it now if that is safe, else from the next round
    if (turned && e.side === 'party') lookAround(s, ev, [e]);      // what a party member sees, the party sees
  },

  // { type: 'companionOrder', actor, id, order }: the master's player (or the DM) chooses whether the companion `id`
  // acts straight after its master `actor` or straight before it (A1; Find Steed "shares your Initiative count").
  // In a fight the choice waits in `bond.orderNext` and takes effect at the start of the next round (resolve.js,
  // takeUpOrders), never in the middle of one; outside a fight it is `bond.order` at once. A ridden steed (C6) has no
  // place of its own, so its choice waits until it has one. A companion that rolls its own Initiative has no master's
  // count to act beside, and is refused rather than keep a choice the engine would not play.
  companionOrder(s, a, ctx, ev) {
    const m = ent(s, a.actor); control(s, m, ctx);
    typeof a.id === 'string' || fail('Name the companion ({ id }).');
    // Only the creatures' own ids: a name such as `constructor` is no creature (and is not looked up on the prototype).
    const e = Object.hasOwn(s.entities, a.id) ? s.entities[a.id] : fail('No such creature.');
    // To a player a creature the party does not know of is no creature at all (as engine.js does for `actor`): `id`
    // is not one of the fields it walks, since other actions use it for other things.
    ctx.role === 'dm' || !unknown(s, e) || fail('No such creature.');
    // A player is told only that it is not this master's companion, whether it has no bond or another's: a foe's bond
    // is never told to players (Decision 10; review of #335, M1). The DM is told which.
    if (ctx.role !== 'dm' && e.bond?.to !== m.id) fail(`${e.name} is not ${m.name}'s companion.`);
    e.bond || fail(`${e.name} is no one's companion.`);
    e.bond.to === m.id || fail(`${e.name} is not ${m.name}'s companion.`);
    BOND_SIDES.includes(a.order) || fail(`A companion acts straight after its master or straight before it: { order: 'after' } or { order: 'before' }.`);
    e.bond.turn !== 'own' || fail(`${e.name} rolls its own Initiative, so it has no place beside ${m.name}'s.`);
    const now = e.bond.order ?? 'after', fight = !!s.encounter;
    if (!fight) { e.bond.order = a.order; delete e.bond.orderNext; }
    else if (a.order === now) delete e.bond.orderNext;                 // back to what this round has: nothing waits
    else e.bond.orderNext = a.order;
    ev.push({ type: 'companionOrder', id: e.id, by: m.id, order: a.order, ...(fight ? { next: true } : {}) });
  },

  // { type: 'command', actor: masterId, ids: [companion ids], order?: text up to 80 characters | null }: the master
  // commands any number of its companions that take commands (`orders: 'command'`), as one Bonus Action in a fight
  // and for nothing outside one (Decision 6; SRD Animate Dead, Create Undead, Animate Objects). By the master's
  // controller or the DM. Each must be within its source's command range (`bond.range`, feet) of the master.
  // Each gets `bond.commanded = { order, at }` (`at` the master's turn, null outside the fight): its next turn in
  // this fight is its master's player's (A2; resolve.js takes it up at that turn's start). `order` given is the
  // order that stands after it (`bond.standing`), which the DM plays it on when it is not commanded; `null` clears
  // it, so it Dodges again; left out, the standing order is unchanged and the command is for the one turn.
  command(s, a, ctx, ev) {
    const m = ent(s, a.actor); control(s, m, ctx);
    (Array.isArray(a.ids) && a.ids.length > 0 && a.ids.length <= BOND_MAX && a.ids.every((x) => typeof x === 'string') && new Set(a.ids).size === a.ids.length)
      || fail('Name the creatures to command, each once ({ ids: [...] }).');
    const order = a.order;
    (order === undefined || order === null || (typeof order === 'string' && order.trim() && order.length <= 80))
      || fail('An order is words of up to 80 characters ({ order: \'guard the door\' }), or null to clear the one that stands.');
    const list = a.ids.map((id) => {
      // Only the creatures' own ids. To a player a creature the party does not know of is no creature at all (engine.js
      // also checks `ids`), and any it knows of that is not this master's is "not its companion", so a foe's bond is never told.
      const e = Object.hasOwn(s.entities, id) ? s.entities[id] : fail('No such creature.');
      ctx.role === 'dm' || !unknown(s, e) || fail('No such creature.');
      if (ctx.role !== 'dm' && e.bond?.to !== m.id) fail(`${e.name} is not ${m.name}'s companion.`);
      e.bond || fail(`${e.name} is no one's companion.`);
      e.bond.to === m.id || fail(`${e.name} is not ${m.name}'s companion.`);
      e.bond.orders === 'command' || fail(`${e.name} takes no commands: it is played freely.`);
      !e.dead || fail(`${e.name} is dead.`);
      const range = e.bond.range, d = apart(s, m, e);
      (typeof range !== 'number' || d * FT <= range) || fail(`${e.name} is ${ft(d)} from ${m.name}. A command reaches ${range} ft.`);
      return e;
    });
    // A Bonus Action in a fight: on the master's turn, with one left. Outside a fight it costs nothing, but the master
    // must be up and able to act.
    need(s, m, 'bonus');
    if (s.encounter) s.encounter.budget.bonus--;
    const at = s.encounter ? turnKey(s) : null, text = typeof order === 'string' ? order.trim() : order;
    for (const e of list) {
      e.bond.commanded = { order: text ?? null, at };
      if (order !== undefined) e.bond.standing = text;
    }
    ev.push({ type: 'commanded', by: m.id, ids: list.map((e) => e.id), ...(order !== undefined ? { order: text } : {}) });
  },

  // { type: 'companion', actor, auto }: whether the engine's companion brain may play this companion's
  // turns (Decision 9; the brain is stage C7). By its controller or the DM.
  companion(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(s, e, ctx);
    e.bond || fail(`${e.name} is no one's companion.`);
    typeof a.auto === 'boolean' || fail('Say whether the engine plays it: { auto: true } or { auto: false }.');
    e.bond.auto = a.auto;
    ev.push({ type: 'companion', id: e.id, auto: a.auto });
  },
};
