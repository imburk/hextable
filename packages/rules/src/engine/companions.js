// Companions (engine.js; docs/specs/companions.md, stage C1): a creature bound to another, its master.
// The bond is a field on the bonded creature, `bond: { to, kind, turn, orders, at0, ... }`; the bonded
// creature has no `owner` of its own, and whoever plays its master plays it (shared.js, ownerOf and
// control). How a bond ends is in resolve.js (vanish, settleBonds).
//
// Built here: the DM's `bond` action (pets, hirelings' mounts, a foe's familiar) and `companion { auto }`.
// Bonds made by spells (`fx`, `source`, `ends`, `leash`), no turn at all, and commands come with later
// stages; until then the DM's bond refuses what the engine would not run. A turn straight after the
// master's (stage C2) is kept in the fight order (world.js, initiativeSort and followMasters).
import { companionsOf, ent, control, fail, inFight, roomForCompanions } from './shared.js';
import { followMasters, lookAround, unfollow } from './world.js';
import { unknown } from '../vision.js';

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
    // The engine does not yet run a turn of none (riding and the servant, stages C5 and C6), nor commands (C5): it
    // refuses them rather than store a choice it would not keep. A turn after its master's is built (C2).
    turn !== 'none' || fail('A companion can have a turn of its own or one straight after its master\'s so far: no turn at all is not built yet.');
    const orders = a.orders ?? 'free';
    BOND_ORDERS.includes(orders) || fail(`A companion's orders can be: ${BOND_ORDERS.join(', ')}.`);
    orders === 'free' || fail('A companion can only be played freely so far: commands are not built yet.');
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
