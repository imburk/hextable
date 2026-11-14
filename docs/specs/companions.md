# Spec: companions and summons

Status: draft by an agent (#279), to be reviewed by the design owner. Covers the debt lines S6
(summoned creatures and their stat blocks) and the companion parts of C8 (Wild Companion,
Faithful Steed), Pact of the Chain, the Find Familiar, Find Steed, Summon and Conjure spells, and
mounted combat (P3's "mounted"). Every number below is from `reference/srd52/srd52-flow.txt`;
line numbers refer to that file.

## Problem

A creature that belongs to another creature cannot exist in the engine today. Every spell that
makes one is `manual` ("The DM adds and runs the familiar"), and the DM's only tool is `spawn`,
which makes a foe the DM controls. What is missing:

1. **A link.** Nothing says that this owl is Brenna's familiar, so nothing lets Brenna's player
   move it, nothing ends it when Brenna's Concentration breaks, and nothing makes it vanish at
   0 Hit Points instead of dying.
2. **A place in the order.** The SRD gives summons three different turns: their own Initiative
   (a familiar), the caster's count and straight after the caster (Summon Dragon, Giant Insect,
   Animate Objects), or no turn of their own (a controlled mount moves on its rider's turn).
3. **Stat blocks that depend on the casting.** The Otherworldly Steed, Draconic Spirit, Giant
   Insect and Animated Object blocks say "AC 10 + 1 per spell level", "Bonus equals your spell
   attack modifier", "Fly 60 ft. (requires level 4+ spell)", "Fiend Only". The monster format
   holds numbers, not formulas; these four blocks are not in the pack.
4. **A step.** No effect step adds a creature (`homebrew.md`: "There is no `summon` step";
   about 29 manual spells are summons).
5. **Riding.** Two creatures cannot share a space, and nothing moves one with the other.

## What the SRD says

| What | Rule (SRD 5.2.1) | Lines |
|---|---|---|
| Find Familiar | Level 1, 1 hour or Ritual, range 10 ft, Instantaneous. Forms: Bat, Cat, Frog, Hawk, Lizard, Octopus, Owl, Rat, Raven, Spider, Weasel, or another CR 0 Beast; it is a Celestial, Fey or Fiend instead of a Beast. Acts independently but obeys commands. Telepathy within 100 ft; as a Bonus Action see and hear through it until the start of your next turn. Delivers your touch spells with its Reaction within 100 ft. **Rolls its own Initiative.** Can't attack. At 0 HP it disappears; a Magic action dismisses it to a pocket dimension (or forever) and another brings it back within 30 ft. Leaves behind what it wore or carried. One familiar only: casting again changes its form. | 26772-26822 |
| Find Steed | Level 2, Action, range 30 ft, Instantaneous. Otherworldly Steed block, Large, Celestial, Fey or Fiend (chosen each casting). **Shares your Initiative count**; a controlled mount while you ride it; if you are Incapacitated it takes its turn immediately after yours and acts independently to protect you. Disappears at 0 HP or if you die; a new casting replaces it (the old one or a different one). Higher slot: the slot's level is the spell's level in the block. | 26824-26853 |
| Otherworldly Steed | AC 10 + 1 per spell level; HP 5 + 10 per spell level; Speed 60, Fly 60 (level 4+); Str 18 Dex 12 Con 14 Int 6 Wis 12 Cha 8; PB equals yours. Life Bond (regains what you regain from a level 1+ spell within 5 ft). Otherworldly Slam: your spell attack modifier, 1d8 + spell level, Radiant / Psychic / Necrotic by type. One Bonus Action by type, each once per Long Rest: Fell Glare (Fiend), Fey Step (Fey, teleports with its rider 60 ft), Healing Touch (Celestial, 2d8 + spell level). | 26854-26905 |
| Summon Dragon | Level 5, Concentration up to 1 hour, range 60 ft. Draconic Spirit block: AC 14 + spell level, HP 50 + 10 per level above 5, Speed 30, Fly 60, Swim 30; Resistances Acid, Cold, Fire, Lightning, Poison; Shared Resistances (you gain one of them while the spell lasts); Multiattack of Rends equal to half the spell level (round down) and Breath Weapon; Rend: your spell attack modifier, reach 10 ft, 1d6 + 4 + spell level Piercing; Breath: your spell save DC, 30-ft Cone, 2d6 of a type it resists. **Shares your count, turn immediately after yours.** Obeys verbal commands (no action); with none it Dodges and moves to avoid danger. Disappears at 0 HP or when the spell ends. | 31196-31276 |
| Giant Insect | Level 4, Concentration up to 10 minutes, range 60 ft. Centipede, spider or wasp. AC 11 + spell level, HP 30 + 10 per level above 4, Speed 40, Climb 40, Fly 40 (wasp). Multiattack: half the spell level (round down); Poison Jab (1d6 + 3 + spell level Piercing plus 1d4 Poison); Web Bolt (spider); Venomous Spew (centipede). Turn and commands as Summon Dragon. | 27421-27480 |
| Animate Dead | Level 3, range 10 ft, Instantaneous. A Medium or Small Humanoid corpse becomes a Zombie, bones a Skeleton. A Bonus Action commands any of them within 60 ft (the same command to all); with no command it Dodges and moves only to avoid harm; an order is followed until done. Control lasts 24 hours; casting again on up to four of them keeps it. Two more per slot level above 3. **Initiative is not stated**: they keep their stat block's. | 23977-24071 |
| Create Undead | Level 6, at night, range 10 ft. Up to three Ghouls (more, or Ghasts, Wights, Mummies at levels 7 to 9); commanded as Animate Dead within 120 ft; 24 hours of control. | 25665-25705 |
| Animate Objects | Level 5, Concentration up to 1 minute, range 120 ft. Objects not worn, carried or fixed, up to your spellcasting modifier (Large counts two, Huge three). Animated Object block: AC 15, HP 10 / 20 / 40 by size, Speed 30; Slam with your spell attack modifier, Force damage by size. **Shares your count, turn immediately after yours.** Bonus Action to command within 500 ft; with none it Dodges. At 0 HP it reverts to an object and the damage carries over. | 24073-24135 |
| Phantom Steed | Level 3, 1 minute or Ritual, 1 hour. A Riding Horse with Speed 100. Ends early if the steed takes any damage. | 29404-29428 |
| Unseen Servant | Level 1, 1 hour. Invisible Medium force, AC 10, 1 HP, Strength 2, can't attack. A Bonus Action each turn moves it 15 ft and has it handle an object. Ends at 0 HP or if sent more than 60 ft away. **No other numbers.** | 31898-31922 |
| Faithful Hound | Level 4, 8 hours. Only you can see it; intangible and invulnerable; bites at the start of your turns (Dex save, 4d8 Force). | 26702-26722 |
| Conjure Animals, Woodland Beings, Minor Elementals, Celestial, Elemental, Fey | Spirits with **no stat block and no Hit Points**: a pack or a spirit in a space, an Emanation round the caster, or a Cylinder of light. They work as areas that move, not as creatures. | 25200-25345 |
| Mounted combat | A willing creature at least one size larger with suitable anatomy. Mounting or dismounting costs half your Speed, within 5 ft. A **controlled** mount (trained to accept a rider) takes your Initiative when you mount, moves on your turn as you direct, and has only Dash, Disengage and Dodge; it can move and act on the turn you mount. An **independent** mount keeps its place and acts as it likes. Falling off: a DC 10 Dex save when the mount is moved against its will, or when you or the mount are knocked Prone; on a failure you land Prone within 5 ft. | 2099-2140 |
| Mounts | Camel, Elephant, Draft Horse, Riding Horse, Mastiff, Mule, Pony, Warhorse are sold as mounts. | 22627-22680 |
| Wild Companion (Druid 2) | A Magic action and a spell slot or a Wild Shape use casts Find Familiar without Material components; the familiar is Fey and disappears at your next Long Rest. | 9205-9211 |
| Faithful Steed (Paladin 5) | Find Steed always prepared; one cast without a slot per Long Rest. | 11982-11987 |
| Pact of the Chain (Warlock) | Find Familiar learned, cast as a Magic action without a slot; extra forms Imp, Pseudodragon, Quasit, Skeleton, Sphinx of Wonder, Sprite, Venomous Snake; when you take the Attack action you may forgo one attack so the familiar attacks with its Reaction. | 16619-16631 |
| Investment of the Chain Master | Fly or Swim 40 ft; a Bonus Action commands it to take the Attack action; Necrotic or Radiant instead of Bludgeoning, Piercing or Slashing; your spell save DC for its saves; a Reaction gives it Resistance to damage it takes. | 16521-16535 |

Two gaps in the SRD itself, which the engine does not fill: there is **no Octopus stat block**
(only Giant Octopus, 57813), so that familiar form cannot be offered; and the **Unseen Servant
has no ability scores but Strength**, so its saving throws go to the DM.

## Goals

- A creature can be bound to another: its **master**. The master's player controls it; when no
  player has the master, the DM does.
- Its turn follows the SRD for the way it was made: its own, straight after the master's, or
  none (ridden).
- Its life follows its source: a spell's lasting effect ends it, 0 Hit Points makes it vanish
  where the SRD says so, the master's death or Long Rest where the SRD says so.
- Stat blocks that depend on the casting are data, baked into plain numbers when the creature
  is made, so the rest of the engine sees an ordinary creature.
- One effect step, `summon`, makes them; the spells move from `manual` to `auto` or `assist`.
- A rider shares its mount's space and moves with it, on hexes and on squares.
- Nothing new reaches a player that the hidden-information and sight specs would not send.
- Undo needs nothing new.

Not in this spec: what a familiar "hears" or says (information is the DM's); the AI DM; vehicles.

## The decisions

### Decision 1: a bond is a field on the bonded creature, and control is worked out from it

A bonded creature is an ordinary record in `state.entities` with one more field:

```js
bond: {
  to: 'p1',              // the master's id
  kind: 'familiar' | 'steed' | 'summon' | 'undead' | 'object' | 'servant' | 'pet',
  source: 'find-steed',  // the spell or feature that made it; absent for a DM bond
  fx: 'fx12' | null,     // the lasting effect that keeps it; ending that effect ends it (Decision 4)
  turn: 'own' | 'after' | 'none',          // Decision 3
  orders: 'free' | 'command',              // Decision 6
  at0: 'vanish' | 'dies',                  // what 0 Hit Points does (Decision 4)
  ends: ['masterDies', 'longRest'],        // other things that end it (Find Steed, Wild Companion)
  leash: 60,             // feet: farther from the master ends it (Unseen Servant 60, Faithful Hound 300)
  noAttack: true,        // a familiar can't attack (attack and attack-kind act are refused)
  mount: 'controlled',   // it serves as a controlled mount for its master (Find Steed)
  slot: 4,               // the spell level its block was baked at
  commanded: null,       // Decision 6
  auto: false,           // the controller lets the engine's companion brain play it (Decision 9)
}
```

**The bonded creature has no `owner` of its own.** Who may control it is worked out:
`ownerOf(s, e) = e.owner ?? s.entities[e.bond?.to]?.owner ?? null`. Reasons, from the code:

- `claim` refuses a user who already owns a creature (`dm.js`:30), and the client finds "my
  character" as the creature the user owns (`app.js`:354, 464, `scenes.js`:212, 230). A second
  owned creature would break all of these.
- When a player leaves, the server releases what they own (`tables.js`:383). A familiar
  that worked out its owner from its master goes to the DM at the same moment with no
  bookkeeping, and back to the player when they claim the master again.

`control(e, ctx)` in `engine/shared.js` becomes `control(s, e, ctx)` and uses `ownerOf`; every
caller already has `s`. The same function replaces `.owner` where a companion's player must be
found: `shared.js`:109 (asking a player), `engine.js`:168 (`reactionAsked.to`), `reactions.js`
`mayAsk`, `view.js` `viewPrompt` and `viewReactions`, `casting.js`:421 (ending one's own
effect), and the client's `mine()` (`app.js`:95). A familiar's Reaction to deliver a touch
spell is therefore asked of the master's player.

A bonded creature is on its master's `side`, and `kind: 'npc'`. Party creatures that are not
`pc` already do not keep the party standing (`partyOf`, `table-ui.md` Decision 1) and do not
share XP; nothing changes there.

Pets, hirelings' mounts and a foe's familiar (the Vampire Familiar, M4) are bonds the DM makes:
`{ type: 'bond', actor, to, kind?, turn?, orders? }`, DM only, and `{ type: 'bond', actor, to: null }`
to free it (it stays on the map, on its own side, with no bond). A DM bond has no `fx` and no
`ends`; `turn` defaults to `own` and `orders` to `free`. Bonding across sides is refused ("A
companion fights on its master's side.").

A master may have at most **20** bonded creatures (Animate Dead at a level 9 slot makes 13, plus
a familiar and a steed). More is refused, to keep a table's state and the fight order bounded.

### Decision 2: the `summon` step

A new effect step, in `STEPS` (`content/schema.js`) and run by `effects.js` with a `KIT.summon`
lent from `engine/resolve.js`:

```js
{ summon: 'giant-insect',                 // a summon block (Decision 5) or a pack monster id
  forms: ['bat', 'cat', ...] | { type: 'beast', cr: 0 },   // instead of an id: the caster picks one
  types: ['celestial', 'fey', 'fiend'],   // the caster picks its creature type (Find Familiar, Find Steed)
  variants: ['centipede', 'spider', 'wasp'],   // the caster picks one; the block's `by: 'variant'` reads it
  count: 1 | { perSlot: 2, base: 1, above: 3 },   // creatures made (Animate Dead); a summon amount
  on: 'space' | 'corpse',                 // where: unoccupied spaces in range, or dead creatures (Decision 7)
  over: { speed: { walk: 100 } },         // fields replaced on the made creature (Phantom Steed)
  one: 'replace' | 'reform',              // one per master: a new one replaces the old (steed) or the old one takes the new form (familiar)
  bond: { kind, turn, orders, at0, ends?, leash?, noAttack?, mount? } }
```

The cast action carries what the caster chose and where:
`{ type: 'cast', actor, spell, slot?, summon: { form?, type?, variant?, at: [{ q, r, z? }, ...] } }`,
one point per creature (`on: 'space'`), or `{ ids: [...] }` of corpses (`on: 'corpse'`). The
spell's existing single `choice` (Summon Dragon's Shared Resistance, the breath's damage type) is
unchanged; the summon's own picks are in `summon`, because Find Steed needs two (type and look)
and Summon Dragon needs a `choice` besides.

Checked before anything changes (a rejected action changes nothing): each point is within the
spell's range of the caster by `measure` (so by `squareRange` on squares), is a space the caster
can see where the creature's footprint fits (`fitsOn`) on the ground or, for a flyer, in the air,
and is unoccupied; the form is in the list or matches the filter; the counts match. The DM's
`spawn` and the step share one placing helper, moved from `dm.js` into `engine/world.js`
(`placeCreature(s, tpl, at, over)`), so both refuse with the same words.

The step makes each creature with `makeEntity` from the baked block, with `id` from `s.seq` as
`spawn` does, `name` "Brenna's Owl" (the DM may rename it), `side` and `bond` from the step, `type`
replaced by the chosen type, and `look` from the master's player if the client sent one. If the
spell has a duration, the creature is a part of its lasting effect (`{ target, summon: true }`).
It emits `summoned { id, by, kind, fx? }` and joins a fight going on (Decision 3).

The linter requires: a numeric `range` on the spell (or `self` with `on: 'corpse'` and a range in
the step), `forms` or an id that exists, `types`/`variants` used by the block if given, a `bond`
whose fields are from the lists above, and `count` only with `on` set. The step is the only one in
its list that makes creatures; it may be followed by other steps on the caster (Summon Dragon's
Shared Resistances is a `modifier` step on `self`).

### Decision 3: the turn

A fight order entry may carry `after: masterId`. `initiativeSort` (`engine/world.js`) sorts the
others as today, then puts each `after` entry straight behind its master, in the order they were
made. The entry's `init` copies the master's, so the tracker shows them on one count.

| `turn` | Who | In a fight |
|---|---|---|
| `own` | Find Familiar, Animate Dead, Create Undead, DM pets | rolls Initiative as any creature (`rollInit`) |
| `after` | Summon Dragon, Giant Insect, Animate Objects, Find Steed when not ridden | no roll; `after: master`; made during the master's turn it acts straight after it this round |
| `none` | Unseen Servant; any controlled mount while ridden | no entry of its own; moves on the master's or rider's turn (Decisions 6, 8) |

Find Steed "shares your Initiative count" and does not say before or after; the spec puts it
after (question 3). When its rider is Incapacitated it gets its own turn straight after the
rider, played by the companion brain (Decision 9), as the spell says.

A fight starting with a companion in the arena and its master outside it: an `after` companion
rolls its own Initiative and a `note` says so; it is placed after its master if the master joins
later. A dead or dying master keeps its slot (dead entries are skipped already), so `after`
companions still act.

### Decision 4: how it ends

A bonded creature leaves the map (`vanished { id, why }`) when:

| Why | When | Who |
|---|---|---|
| `ended` | its lasting effect ends (Concentration broken, duration over, `endEffect`) | every summon made by a spell with a duration |
| `hp0` | it drops to 0 Hit Points and `at0` is `vanish` | familiar, steed, Draconic Spirit, Giant Insect, Unseen Servant |
| `master` | its master dies and `ends` has `masterDies` | Find Steed |
| `rest` | its master finishes a Long Rest and `ends` has `longRest` | Wild Companion |
| `leash` | it ends farther than `leash` from its master after any action | Unseen Servant, Faithful Hound |
| `replaced` | the master makes another under `one: 'replace'` | Find Steed |
| `dismissed` | the master dismisses it (Decision 6) | familiar (pocket or forever), any summon its spell lets end |

`at0: 'dies'` is an ordinary death (Animate Dead's Zombie stays as a corpse). An Animated Object
at 0 "reverts to its object form" with the damage carried over: the creature vanishes and a
`manual` event tells the DM (map objects have no Hit Points to carry it to).

Ending is in one place, `vanish(s, e, why, ev)` in `engine/resolve.js`: it ends the creature's
own lasting effects and Concentration, takes it out of the fight order, drops a rider (Decision 8),
removes the record and emits `vanished`. When its `gear` is not empty, a `manual` event says what
it left in its space (the SRD leaves it there; the map's object contents are the DM's to fill).
A lasting effect's `summon` part calls `vanish` from `endPart` (`durations.js`); if the effect
held only summons, ending the last one ends the effect (as `spent` already does), so Phantom
Steed's "ends if the steed takes any damage" is the part's existing `ends: { on: 'damaged' }`.

### Decision 5: blocks that depend on the casting are data with amounts, baked at the summoning

A new pack list, `summons` (`content/srd52/summons.js`), holds the four SRD blocks that are not
monsters: `otherworldly-steed`, `draconic-spirit`, `giant-insect`, `animated-object`. An entry
has exactly the monster format (`rules-expansion.md`) except that, wherever a number or a choice
of the casting is needed, it may hold a **summon amount**:

| Amount | Means | Example |
|---|---|---|
| `{ slot: k, base: n, above: L }` | n + k x (spell level - L); `above` defaults to 0, `base` to 0 | AC `{ slot: 1, base: 10 }`; HP `{ slot: 10, base: 30, above: 4 }` |
| `{ slot: 0.5, round: 'down' }` | half the spell level, rounded down | Multiattack count |
| `{ caster: 'attack' \| 'dc' \| 'pb' \| 'mod' }` | the master's spell attack bonus, spell save DC, Proficiency Bonus, spellcasting ability modifier | Rend's bonus; Fell Glare's DC; `pb` |
| `{ by: 'type' \| 'variant', <value>: x, ... }` | x for the creature type or variant chosen | Slam's damage type `{ by: 'type', celestial: 'radiant', fey: 'psychic', fiend: 'necrotic' }` |
| `only: { type \| variant: [...], slot: n }` on a trait, action, bonus action or speed | kept only for those choices, or from that spell level | Fly 60 `{ value: 60, only: { slot: 4 } }`; Web Bolt `only: { variant: ['spider'] }` |

A damage step's dice may add an amount: `{ damage: '1d6+4', plus: { slot: 1 }, type: 'piercing' }`.
Upcast damage by size (Animated Object) is `{ by: 'variant', medium: ..., large: ..., huge: ... }`
with the variant being the size.

`bake(block, { slot, caster, type, variant })`, in a new pure module
`packages/rules/src/summons.js`, turns an entry into a plain monster-shaped template: every amount
replaced by its number, every `only` resolved, `cr: null`, `xp: 0`. Then `makeEntity` makes it as
it makes any monster. **The baked template must pass the monster linter**: a test bakes each block
at every level it can be cast at, with each type and variant, and lints the result. The rest of
the engine never sees an amount. This is how `derive()` already bakes class amounts.

Numbers are fixed at the summoning: a master who levels up mid-spell does not change the
creature. Pack monsters used as forms (familiars, Riding Horse, Skeleton, Zombie, Ghoul, Warhorse)
are used as they are, with `type` replaced where the spell says (Find Familiar) and `over` applied
(Phantom Steed's Speed 100). Investment of the Chain Master's changes (Fly or Swim 40, the master's
save DC) are a bake option too (stage C9).

A summon block may leave out an ability score the SRD does not give (only the Unseen Servant
does: Strength 2 and nothing else). A save or check on a missing score is not rolled: a `manual`
event hands it to the DM. A monster entry may not do this.

The amounts are summon-only. The linter refuses them in `monsters` and refuses class amounts
(`{ column }`, `{ mod }`) in `summons`, so the two families never mix.

### Decision 6: who sends its actions, and commands

Its controller (Decision 1) sends its actions as for any creature: `move`, `dash`, `attack`, `act`,
`dodge`, `endTurn`, and so on, with `actor` the companion's id, on the companion's turn. The DM
always may. Outside a fight, a companion moves as any party member and can `follow` its master;
the `summon` step sets it following its master when made outside a fight.

`orders: 'free'` (familiar, Summon Dragon, Giant Insect, Find Steed, pets): the SRD's "obeys your
verbal commands (no action required)" and "acts independently but obeys your commands". The
controller plays it freely. "If you don't issue any, it takes the Dodge action" is the companion
brain's default (Decision 9), not a lock.

`orders: 'command'` (Animate Dead, Create Undead, Animate Objects, Unseen Servant): a command costs
the master's Bonus Action. New action, by the master's controller or the DM:

```js
{ type: 'command', actor: masterId, ids: [companion ids], order?: 'guard the door' }   // order: up to 80 characters
```

It spends the Bonus Action in a fight (nothing outside one), checks each id is the master's,
bonded with `orders: 'command'` and within the source's command range (60 ft for Animate Dead,
120 for Create Undead, 500 for Animate Objects; from the step's `bond.range`), and sets
`bond.commanded = { order, at: turnKey }`. One command for any number of them, as the SRD says.

On an `orders: 'command'` creature's turn, while `commanded` is null, the engine accepts only
`dodge`, `move` and `endTurn` for it ("Waiting for a command, it can only Dodge and keep out of
harm."). Once commanded, it is played freely, and **the command stands until a new one or a
`{ type: 'command', actor, ids, order: null }`** (the SRD: "continues to follow it until its task is
complete", which the engine cannot judge; question 4). Whether what it does follows the order is
the DM's, as at a table.

The Unseen Servant (`turn: 'none'`) moves only by command: the command gives it 15 ft of movement
to use on the master's turn (`move` with the servant as actor, from a `budget.servant` of 15 that
the command fills) and an object interaction (`use`), and nothing else.

Familiar actions, by the master's controller or the DM:

```js
{ type: 'dismiss', actor: masterId, id, forever?: true }   // a Magic action: to the pocket dimension, or for good
{ type: 'recall', actor: masterId, id, at: { q, r, z? } }  // a Magic action: back within 30 ft, unoccupied
```

A pocketed familiar is moved out of `state.entities` into `master.pocket = { [id]: record }`, so
nothing on the map, in sight or in the fight sees it, and back by `recall` with the same id and
Hit Points. `dismiss` of a non-familiar summon whose spell has a duration ends its effect (as
`endEffect`); of one without (Animate Dead), it frees it as the DM's `bond { to: null }` does.

### Decision 7: Animate Dead and Create Undead work on corpses

`on: 'corpse'`: the targets are dead creatures in range (`dead: true`) of the right size and type
(Medium or Small Humanoid). Each corpse record is replaced in its space by the step's block
(Zombie, or Ghoul for Create Undead), keeping the position; the dead record goes. Bones (the
Skeleton) are not on the map as anything the engine knows, so the Skeleton is offered only to the
DM, or through `spawn` with a DM `bond`: a `manual` line in the spell says so.

Control for 24 hours: the step's lasting effect has duration "24 hours" and its parts are
`{ target, bond: true }` (not `summon`): when it ends, the bond ends but the creature stays,
`bond` removed, `side` set to `foe`, and a `manual` event tells the DM it no longer obeys
(question 5). Casting again with `ids` naming the caster's own undead (up to four, more by slot)
restarts their 24 hours instead of making new ones; the step tells the two apart by whether the
named creatures are dead or already bonded to the caster.

### Decision 8: riding

A rider stores `riding: { on: mountId, controlled: true | false }`; its mount stores
`rider: riderId`. One rider per mount.

- **Mounting**: `{ type: 'mount', actor, mount }`. The mount is within 5 ft, at least one size
  larger, and willing: on the rider's side, and either bonded to the rider with `mount:
  'controlled'`, a pack monster on the mounts list (below), or allowed by the DM (the DM may send
  the action for any pair). It costs half the rider's Speed, rounded down, from the rider's
  movement in a fight. **Controlled** when the mount is bonded with `mount: 'controlled'` or is on
  the mounts list; otherwise **independent**. Mounting a controlled mount moves its order entry to
  `after: rider` with `turn` treated as `none` while ridden: it has no turn of its own, and "can
  move and act on the turn you mount it" (the mount budget below).
- **Dismounting**: `{ type: 'dismount', actor, to? }`: half Speed; `to` is an unoccupied space
  within 5 ft of the mount (the nearest one if absent). A controlled mount gets its own entry back
  at the rider's count (`after: rider`), so it does not act twice in a round.
- **The mounts list** is data: a new pack field on monsters, `mount: 'trained'`, set on the eight
  animals the SRD sells as mounts (Camel, Elephant, Draft Horse, Riding Horse, Mastiff, Mule,
  Pony, Warhorse; 22627-22680) and nothing else. "Appropriate anatomy" for anything else is the
  DM's (they may send `mount` for it).
- **Space.** The rider stands in its mount's space: `rider.pos` is the mount's anchor, and while
  riding, `footprint(rider)` is the mount's footprint and its height is the mount's height plus
  its own (`space.js`). So reach, range, areas and Opportunity Attacks measure from the whole
  mount (question 2), sight and cover look from the rider's raised eye, and the overlap check skips
  the pair. On hexes a Large mount is 3 hexes, on squares 2 by 2 (`G.footprint`); nothing else
  differs by grid.
- **A controlled mount's turn.** On the rider's turn the budget gains `mount: { move, action }`:
  the mount's Speed and one action limited to Dash, Disengage and Dodge (`dash`, `disengage`,
  `dodge` with the mount as actor; anything else is refused: "A controlled mount can only Dash,
  Disengage or Dodge."). `move` with either the rider or the mount as actor moves both, from the
  mount's movement, by the mount's speeds and costs (a flying steed flies); the rider's own movement
  is left for dismounting. Opportunity Attacks are checked for each of the two as it leaves a foe's
  reach, each with its own Disengage; a foe still has one Reaction and chooses which (its standing
  instruction, or its player is asked, as now).
- **An independent mount** keeps its own turn and is played by its controller or the DM; the rider
  moves with it and cannot move it.
- **Moving together.** Every way a mount moves takes the rider along: walking, a push, a
  teleport (Fey Step: "along with its rider"), a fall. Outside a fight the pair moves as one
  creature, at the mount's pace.
- **Falling off.** When an effect moves the mount against its will (a push, a pull, a forced
  teleport), or the rider or the mount is knocked Prone, the rider makes a DC 10 Dexterity save;
  on a failure the rider is dismounted Prone in the nearest unoccupied space within 5 ft (`fell`
  in `dismounted`). When the mount vanishes or dies the rider is dismounted where it stands (and
  falls if that is in the air, by the existing gravity pass).
- **Find Steed** is a controlled mount for its master (`bond.mount: 'controlled'`). If its master
  is Incapacitated while riding, the steed gets a turn straight after the master's that round and
  the companion brain plays it (Decision 9).

### Decision 9: the companion brain, and who presses the buttons

`ai.js` gains `companionStep(s, id)`, called by `aiStep` for a bonded creature:

- `orders: 'command'` and not commanded: Dodge, then move away from the nearest foe if one is
  within 5 ft, then end the turn.
- A Find Steed whose master is Incapacitated: move next to the master if it can, attack a foe
  within 5 ft of the master (Otherworldly Slam), else Dodge.
- Otherwise (`auto: true`, or no player controls it): play it as `aiStep` plays a monster, never
  against its own side, and never `attack` for `noAttack`.

The DM's auto-play in the client (`app.js`:377) runs the brain for a creature on its turn when its
`ownerOf` is null (the DM's), or `bond.auto` is set, or it is uncommanded under `orders:
'command'`, or it is the Incapacitated master's steed. Otherwise the turn waits for its player as
a party character's does. The player sets `auto` with `{ type: 'companion', actor: id, auto: true |
false }` (its controller or the DM).

### Decision 10: what players are sent

Nothing here changes the allow lists' principle (`hidden-information.md`); it adds entries.

- **A party-side companion is Open** like every party creature (`classify`): its full record,
  `bond` and its master's `pocket` included, goes to the players. Players share sheets already.
- **A foe-side companion is Seen or Hidden** like every foe. `bond` is not on the Seen record's
  allow list, so players never learn that the wolf is the mage's, or how long it has left.
- **Fight order**: `after` is kept on an entry only when both it and its master are Open.
- **Events**, added to `viewEvents`:

| Event | Players see |
|---|---|
| `summoned { id, by, kind, fx? }` | as `spawned`, plus `by` and `kind` only when `by` is a creature they know of (not hidden by `classify`) |
| `vanished { id, why }` | as `removed`; `why` only for an Open creature |
| `bonded`, `unbonded` (DM) | for Open creatures only |
| `commanded { by, ids, order }` | when `by` is Open (the party's own commands); never for a foe master (they are mental) |
| `pocketed { id, by }`, `recalled { id, at }` | when `by` is Open; a recalled foe familiar is seen as `spawned` |
| `mounted { id, mount }`, `dismounted { id, at, fell? }` | when both are known to them (riding is plain to see) |

- **Sight.** A party companion is a party creature, so it is one of the **eyes** of the party's
  view (`vision.js` `eyesOf`) like any other: what the familiar sees, the party sees, as
  `sight.md` already assumes ("what a companion sees can be [targeted]"). This is more than the
  SRD's Bonus Action to see through its eyes (question 1). The Unseen Servant is not eyes
  (`bond.kind: 'servant'` is skipped by `eyesOf`). The Faithful Hound, which "no one but you can
  see", cannot be shown to one player: the players' view is built once for all of them
  (`sight.md` S7). It stays `manual`.
- **Acceptance tests** (added to `view.test.js` and the sight property tests): a foe's familiar
  with canary numbers in an AI-played fight leaks no `bond`, no `after`, no `fx` and no master id
  to a player; a summon cast by a hidden caster sends `summoned` without `by`; a pocketed foe
  familiar is in no player message; the seed-3 property test still passes with a party familiar
  scouting.

### Decision 11: undo, and the state version

Undo keeps reverse patches of the whole state (`history.js`), so summoning, vanishing, the pocket,
commands, mounting and the fight order all come back exactly, down to `s.seq` and the dice.
Nothing new is needed but labels: `describeStep` names the new actions ("Brenna summoned an
owl", "Brenna mounted the warhorse"). A rewind to the start of a fight removes what was summoned
in it, as it should.

Every new field is optional and absent means none (`bond`, `rider`, `riding`, `pocket`, `after`,
`budget.mount`, `budget.servant`). Stage C1 still bumps `VERSION` by one with a migration that
changes nothing (as 15 to 16 did), so an older server refuses a newer save instead of loading it
and dropping fields it does not know.

## What becomes of each spell and feature

| Entry | Tier after this work | How | Still the DM's |
|---|---|---|---|
| Find Familiar | assist | `summon` with `forms` (the 10 listed that have blocks, plus any pack Beast of CR 0), `types`, `one: 'reform'`, `turn: 'own'`, `at0: 'vanish'`, `noAttack`; dismiss and recall; touch delivery (C5) | telepathy and hearing; Octopus (no block) |
| Find Steed | auto (with C6) | `summon: 'otherworldly-steed'`, `types`, `one: 'replace'`, `turn: 'after'`, `ends: ['masterDies']`, `mount: 'controlled'` | Life Bond until healing is hooked (C9); the steed's look |
| Summon Dragon | auto | `summon: 'draconic-spirit'`, Concentration part; Shared Resistances as a `modifier` step on `self` with the spell's `choice` | its "verbal commands" |
| Giant Insect | auto | `summon: 'giant-insect'`, `variants` | as above |
| Animate Dead | assist | `on: 'corpse'`, Zombie; 24-hour bond; `orders: 'command'`, range 60; reassert | bones and the Skeleton; whether orders are kept |
| Create Undead | assist | as Animate Dead, Ghoul (Ghast, Wight, Mummy by slot), range 120; "only at night" is the DM's | as above |
| Animate Objects | assist | `summon: 'animated-object'` with `variants` as size, at points the caster names | which objects (map things are not checked), the count by size against the modifier, reverting to the object |
| Phantom Steed | auto | `summon: 'riding-horse'`, `over: { speed: { walk: 100 } }`, part ends on damage, `mount` via the mounts list | travel pace, the vanishing tack, the minute to dismount |
| Unseen Servant | assist | a block built from the spell's numbers (AC 10, HP 1, Str 2), `turn: 'none'`, `orders: 'command'`, `leash: 60`, `noAttack`, Invisible | its other ability scores (none in the SRD), the tasks |
| Wild Companion | auto | feature casting Find Familiar through `freeCast`-like spending of a slot or a Wild Shape use, `types: ['fey']`, `ends: ['longRest']` | as Find Familiar |
| Faithful Steed | auto | `freeCast { spells: ['find-steed'] }` and always prepared (vocabulary exists; data entry) | — |
| Pact of the Chain | assist | Find Familiar learned, Magic action, no slot; the seven extra forms; forgo an attack for the familiar's Reaction attack (C9) | — |
| Investment of the Chain Master | assist (C9) | bake options (Fly or Swim 40, the master's DC); the Bonus Action command to Attack; the damage type swap; the Reaction Resistance as a reaction instruction | — |
| Conjure Animals, Woodland Beings, Minor Elementals, Celestial, Elemental, Fey | manual (zones work, not this spec) | they are spirits with no block: areas that move with or apart from the caster (S4's "moving a zone after casting") | everything until then |
| Faithful Hound | manual | seen by its caster only | everything |
| Planar Ally, Planar Binding, Gate | manual | bargains and other planes | everything; the DM may `bond` what arrives |
| Elemental Gem, Figurine of Wondrous Power, Bag of Tricks | manual (later) | the same `summon` step from an item's action once items run steps | — |

## Build plan

Each row is one pull request. Engine rows change `engine/`, the vocabulary or what players are
sent, and need the strongest model; the review point for each is the hidden-information tests and
"a rejected action changes nothing". Every row runs `npm test`, `npm run content` and `npm run
build`; client rows also run the smoke passes they name at 390 x 844 with touch and 1280 x 800.
After every row the valley plays as before.

| # | Task | Lane | Files it may touch | Acceptance test |
|---|---|---|---|---|
| C1 | **The bond.** `bond` field, `ownerOf`, `control(s, e, ctx)` and every caller listed in Decision 1; the DM's `bond` action and `companion { auto }`; `vanish()` with `hp0`, `master`, `leash`, `dismissed`; `bonded`/`unbonded`/`vanished` in `viewEvents`; `describeStep` labels; version bump with an empty migration. | engine | `engine/shared.js`, `engine/companions.js` (new), `engine.js` (spread the new handlers), `engine/resolve.js`, `engine/attacks.js`, `engine/movement.js`, `engine/casting.js`, `engine/features.js`, `engine/characters.js`, `engine/rests.js`, `reactions.js`, `view.js`, `history.js`, `migrate.js`, `packages/client/app.js` (`mine()` only), `packages/rules/test/companions.test.js` (new) | a player moves a wolf the DM bonded to their character and is refused for another player's; releasing the master hands the wolf to the DM and claiming gives it back; a `noAttack` creature's attack is refused and the state is unchanged; a familiar at 0 vanishes, a DM-bonded Zombie dies; a foe's bonded wolf sends no `bond` to a player; every existing test passes untouched |
| C2 | **The turn and lasting effects.** `after` in `initiativeSort`, `startEncounter` and `joinEncounter`; the `summon` part in `durations.js`; `ends: ['longRest']` in rests. | engine | `engine/world.js`, `engine/resolve.js`, `durations.js`, `engine/rests.js`, `view.js` (order only), tests | three `after` companions stay behind their master through a whole fight with ties and joins; a companion made in the master's turn acts next; ending the effect removes the creature and the order entry; `after` is not sent for a foe |
| C3 | **Summon blocks and the step.** `summons.js` (bake), the `summons` pack list and its linter, summon amounts, `summon` in `STEPS`, `KIT.summon`, `placeCreature` shared with `spawn`, the cast action's `summon` field, `summoned` in `viewEvents`; one entry, `giant-insect`, and Giant Insect moved to `auto`. | engine | `summons.js` (new), `content/schema.js`, `content/index.js`, `content/srd52/summons.js` (new), `content/srd52/spells-4.js` (Giant Insect only), `effects.js`, `engine/resolve.js`, `engine/world.js`, `engine/dm.js`, `engine/casting.js`, `view.js`, tests | Giant Insect cast at levels 4 to 9, each variant: the baked block lints as a monster, with AC 11 + level, HP 30 + 10 x (level - 4), Fly only for the wasp, the master's attack bonus on Poison Jab; a point out of range, unseen or occupied is refused and nothing changes; Concentration broken ends it; on `square-room` a Large insect fills 2 by 2 and is refused where it does not fit |
| C4 | **Blocks and spells, data.** `otherworldly-steed`, `draconic-spirit`, `animated-object`, and an Unseen Servant block from the spell's numbers; Find Familiar, Find Steed (without riding until C6), Summon Dragon, Phantom Steed, Animate Objects, Unseen Servant moved to their tiers, each `checked` against the SRD lines above. | content | `content/srd52/summons.js`, `content/srd52/spells-1.js` to `spells-5.js` (those entries only), tests | `npm run content` reports them at the tiers in the table above, with no problems; a test casts each and checks the numbers against the lines cited |
| C5 | **Commands, corpses and familiars.** `command`, the uncommanded lock, the servant's 15 ft; `on: 'corpse'`, Animate Dead and Create Undead with the 24-hour bond and reassert; `dismiss` and `recall` with the pocket; `one: 'reform'` and `'replace'`; touch delivery through the familiar's Reaction (`cast { deliver }`). | engine | `engine/companions.js`, `engine/casting.js`, `effects.js`, `engine/resolve.js`, `durations.js`, `view.js`, `content/srd52/spells-3.js` and `spells-6.js` (those two spells), tests | an uncommanded Zombie may only Dodge and move; one command for three costs one Bonus Action; a corpse 15 ft away is refused at range 10; after 24 hours the Zombie is a foe with a `manual` event; a pocketed familiar is in no player view and comes back with its Hit Points within 30 ft; Shocking Grasp delivered by an owl within 100 ft uses the owl's Reaction and is refused at 105 ft |
| C6 | **Riding.** `mount`, `dismount`, `riding`/`rider`, the mount's footprint for the rider, `budget.mount`, moving together (walk, push, teleport, fall), falling off, Opportunity Attacks for the pair; `mount: 'trained'` on the eight mounts; Find Steed as a controlled mount and its Incapacitated turn. | engine | `engine/movement.js`, `engine/world.js`, `engine/resolve.js`, `space.js`, `vision.js` (eye height), `content/schema.js` (the `mount` field), `content/srd52/monsters-*.js` (eight entries, that field only), tests on hexes and on `square-room` | on both grids: mounting costs half Speed; a Medium rider on a warhorse moves 60 ft with the warhorse's movement and still has its own to dismount; the warhorse can Dash but its attack is refused; a goblin beside the pair gets one Reaction and may choose either; Thunderwave pushing the horse makes the rider save DC 10 and land Prone on a failure; a flying steed vanishing drops its rider who falls; a fireball touching one hex of the horse catches the rider |
| C7 | **The companion brain.** `companionStep`; the client's auto-play rule. | engine + client | `ai.js`, `packages/client/app.js` (the auto-play condition only), tests | an uncommanded Skeleton Dodges and steps away; an Incapacitated paladin's steed comes to her and attacks the goblin beside her; a player's familiar waits for its player unless `auto` is set |
| C8 | **Screens.** The cast chooser for a summon (form, type, variant, then taps for each point, or corpses); the companion's turn in the player's bar and tracker (one row under its master for `after`); buttons for Command (with the order text), Dismiss, Recall, Mount, Dismount, Let it act; the pocket on the sheet. | client | `packages/client/actionpanel.js`, `classes.js`, `tracker.js`, `app.js`, `index.html`, `style.css`, `scripts/smoke/companions.mjs` (new), `scripts/smoke.mjs` (one registry line) | `SMOKE_ONLY=companions`: at both sizes, with touch at 390 x 844, a wizard summons an owl, the owl's turn comes to the same player, the owl is dismissed and recalled; a paladin summons a steed, mounts, rides 60 ft and dismounts; no page errors |
| C9 | **The rest of the features.** Wild Companion (a slot or a Wild Shape use), Faithful Steed's free cast, Pact of the Chain (Magic action, extra forms, forgo an attack), Investment of the Chain Master, Life Bond (a hook on healing from spells, shared with Blessed Healer, C8 in the debt log). | engine | `engine/features.js`, `engine/attacks.js`, `engine/rolls.js`, `summons.js`, `content/schema.js`, `content/srd52/classes/*` (those features), tests | each feature's SRD text is played by a test; the class entries report their new tiers |
| C10 | **Drawing.** A rider drawn on its mount at the mount's height, the pair moving as one, `vanished` fading out (as `removed`), the tracker's `after` rows. | render | `render.js`, `render-three.js`, `three-build.js`, `scripts/smoke/companions.mjs` | the smoke pass's screenshots at both sizes show the rider on the horse on hexes and on squares |

**What can run side by side.** C1, then C2 and C3 (different files except `resolve.js`; C3 after
C2 if both are open). C4 after C3. C5 and C6 after C3, side by side if they do not both hold
`resolve.js` (merge one first). C7 after C5 and C6. C8 after C5; its mount buttons after C6. C9
after C5. C10 after C6. The work can stop after any row: after C1 the DM can bond pets and foes'
familiars; after C4 the summon spells play; after C6 riding does.

## What stays manual

- What a familiar hears and says, telepathy, seeing through its eyes beyond the shared party view.
- Octopus as a familiar form (no stat block in the SRD 5.2.1).
- Whether a commanded creature's actions follow its order; general orders ("guard the hall").
- Skeletons from bones (no bones on the map); which objects Animate Objects picks and how they
  count by size; an Animated Object's damage carried over to its object.
- Gear left behind when a companion vanishes.
- "Appropriate anatomy" and willingness for anything not on the mounts list or bonded as a mount.
- Phantom Steed's travel pace, tack and minute to dismount; the Unseen Servant's tasks and its
  saving throws.
- Life Bond until C9, Pact of the Chain's forgone attack until C9.
- The Conjure spells (zones work), Faithful Hound, Planar Ally, Planar Binding, Gate, and the
  summoning magic items.

## Risks

- **Control through the master touches many call sites.** C1 lists them; a test reads the rules
  source for `.owner ===` outside `ownerOf` and fails on a new one.
- **Two creatures in one space.** The overlap check, areas, footprints and the renderer all assume
  one creature per space. C6 makes the rider borrow the mount's footprint in `space.js` so every
  caller is covered at once; each existing test of footprints must pass untouched.
- **The fight order.** `after` changes `initiativeSort`, which every fight uses; with no `after`
  entries it must give exactly today's order (a test sorts every recorded order in the test
  fixtures both ways).
- **Hidden information.** New events and fields are private until listed; the acceptance tests in
  Decision 10 are the review point for C1, C2, C3 and C5.

## Questions for the owner

Each has a default; work proceeds on the default.

1. **A familiar's sight.** *Default: a party companion is one of the party's eyes all the time*, as
   every party member is and as `sight.md` assumes. The SRD gives the master its senses only for a
   Bonus Action, until the start of the next turn. The stricter reading would need eyes per player,
   which the shared players' view does not have.
2. **Where a rider is.** *Default: in the mount's whole space*, for reach, range and areas (a
   Medium knight on a Large horse reaches from any of its hexes, and a fireball on one hex of the
   horse catches the knight). The SRD does not say; the other reading picks one cell of the mount
   for the rider.
3. **Find Steed's turn when not ridden.** *Default: straight after its master*, on the same count,
   as the Summon spells do. The SRD says only "shares your Initiative count".
4. **Commands that stand.** *Default: an Animate Dead or Animate Objects creature, once commanded,
   is played freely until a new command or the command is cleared*; before any command it may only
   Dodge and move. The stricter reading (a Bonus Action every turn for anything but Dodge) is one
   line to change.
5. **Undead past 24 hours.** *Default: the bond ends, the creature joins the foes, and the DM is
   told.* The SRD says only that it stops obeying.
6. **XP for a foe's summons.** *Default: a creature with a bond does not count toward a fight's XP*
   (`counts: false` in the conclusion; the DM can tick it). The summon blocks give XP 0 already.
7. **The cap.** *Default: 20 bonded creatures per master.*

## Build notes

### C1, the bond (#311)

What was settled while building it, where the decisions above left room:

- **Sides.** The DM's `bond` gives the creature its master's side (a spawned wolf is a foe until it is
  bonded to a party character); "bonding across sides is refused" is read as: refused for a creature
  that is in a fight going on ("a creature in the fight can't change sides"). Bonding a creature the DM
  hid (`hidden`) to a party master is refused: a party member is never hidden. A creature that turns
  party is looked around with (`lookAround`), as a placed party member is.
- **What the DM's bond accepts.** `kind` (default `pet`), `turn`, `orders`, and two more than Decision 1
  names: `at0` (default by kind: familiar, steed, summon, servant and object vanish; undead and pets die)
  and `noAttack` (a DM-made familiar of the SRD can't attack, but the Vampire Familiar can, so it is the
  DM's to say). `turn` other than `own` and `orders: 'command'` are refused until C2 and C5 run them, so
  the engine never keeps a choice it would not play. `fx`, `source`, `ends` and `leash` come only from
  spells (C2, C3); C1 honours them where they are set (`masterDies`, `leash`) and its tests set them by hand.
- **No chains.** A companion has no companions, and a creature with companions can't become one, so
  `ownerOf` looks one step up only. A creature with an `owner` (or a `pc`) can't be bonded, and a bonded
  creature can't be claimed, by a player or the DM: a companion's player is always its master's.
- **Removing a master** (the DM's `remove`) frees its companions (`unbonded`); they stay.
- **When it vanishes.** `vanish` is run by `settleBonds`, a pass after every action (engine.js, beside
  gravity), not inside `damage`: every way a creature reaches 0 (damage, `setHp`, a fall, a kill) is
  caught in one place. So a familiar at 0 shows `died` and then `vanished` in the same action.
  `dismissed` has no action yet (C5's `dismiss`); `vanish` takes it.
- **What it leaves.** Its gear by name, and magic items on a sheet if it has one, go onto the pile in its
  cell (E17), past `PILE_MAX` if need be, so nothing is lost or made twice. With nothing under it the DM
  is told what it carried (`manual`). An Animated Object at 0 also tells the DM it reverts (Decision 4).
- **Lasting effects.** Those it is the source of end; another creature's effect loses only the part on it
  (Bless goes on for the others), and ends if nothing else was left of it.
- **The fight order.** It leaves the order; if it was its own turn, the turn passes to the next creature.
- **What players are sent.** `vanished` is told to players only when the engine marks it `seen` (the
  party knew of it just before: it is no longer in the state for `view.js` to classify), with `name` and
  `why` only when it was the party's (`party`). `bonded` goes only when both creatures are the party's;
  `unbonded` and `companion` only for a party creature (and `from` only when that is the party's).
- **State version 23**, with a migration that changes nothing.
