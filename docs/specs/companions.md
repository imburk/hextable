# Spec: companions and summons

Status: draft by an agent (#279), amended to the owner's answers of 14 November 2026 (issue #193; see
"Questions for the owner" and "Amendments of 14 November"). Covers the debt lines S6
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
  order: 'after' | 'before',               // Find Steed when not ridden: acts after or before its master (Decision 3); default 'after'
  orderNext: 'after' | 'before' | null,    // a choice made in the middle of a round, taken up at the next round's start
  orders: 'free' | 'command',              // Decision 6
  at0: 'vanish' | 'dies',                  // what 0 Hit Points does (Decision 4)
  ends: ['masterDies', 'longRest'],        // other things that end it (Find Steed, Wild Companion)
  leash: 60,             // feet: farther from the master ends it (Unseen Servant 60, Faithful Hound 300)
  noAttack: true,        // a familiar can't attack (attack and attack-kind act are refused)
  mount: 'controlled',   // it serves as a controlled mount for its master (Find Steed)
  slot: 4,               // the spell level its block was baked at
  commanded: null,       // Decision 6: set when the master commands it this turn; its turn is then the player's
  standing: null,        // Decision 6: the last order or general command given; the DM plays it on this when not commanded
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

A master may have at most **30** bonded creatures (question 7). The SRD limits are the reason: Animate
Dead makes 1 creature from a 3rd-level slot and 2 more per slot level above 3, so 13 from a 9th-level
slot; Create Undead makes 3 Ghouls at 6th level and 6 at 9th; Animate Objects makes up to the
spellcasting modifier (a Large counts as 2, a Huge as 3). Several castings, a familiar and a steed fit in
30. More is refused, to keep a table's state and the fight order bounded. A dead companion does not count toward the 30
(since C5b, #341: a Zombie or a pet at 0 keeps its bond so that the DM can bring it back). A familiar in its master's
pocket dimension does count (since C5c, #343): it is still the master's, only not on the map.

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
// Since C5b (#341): `reassert` (on corpses: how many of its own creatures a casting keeps under control; `count` if left
// out), the bond's command `range` (feet, with `orders: 'command'`), and on the made creature's bond `lapse: 'foe'`.
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
| `after` | Summon Dragon, Giant Insect, Animate Objects | no roll; `after: master`; made during the master's turn it acts straight after it this round |
| `after`, with `bond.order` | Find Steed when not ridden | no roll; on the master's count, straight after it (`order: 'after'`, the default) or straight before it (`order: 'before'`), as the master's player chooses each round (below) |
| `none` | Unseen Servant; any controlled mount while ridden | no entry of its own; moves on the master's or rider's turn (Decisions 6, 8) |

Find Steed "shares your Initiative count" and does not say before or after. **The master's player chooses,
per round, whether the steed acts before or after the master; the default is after** (question 3).
The choice is `bond.order`; a choice made at any time is kept in `bond.orderNext` and **takes effect at
the start of the next round, never in the middle of one**, so that moving the steed behind or ahead of a
master who is already mid-turn can never give it a second turn or take its turn away. While the steed is
ridden it has no entry (`none`) and the choice waits: a controlled mount moves on its rider's turn (the
SRD: it takes the rider's Initiative when mounted, and can move and act the turn it is mounted), and on
dismounting it takes its place by `order`. When its rider is Incapacitated it gets its own turn
straight after the rider, played by the companion brain (Decision 9), as the spell says.

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
`bond.commanded = { order, at: turnKey }` and `bond.standing`. One command for any number of them, as the SRD says.

**Whose turn it is, for an `orders: 'command'` creature** (question 4, amended). The SRD for Animate Dead
and Create Undead: "You decide what action the creature will take and where it will move on its next
turn, or you can issue a general command, such as to guard a chamber or corridor. If you issue no
commands, the creature takes the Dodge action and moves only to avoid harm. Once given an order, the
creature continues to follow it until its task is complete." Animate Objects says only that it
takes a Bonus Action to command and that with no command it takes the Dodge action and moves only to
avoid harm (it has no "continues to follow" sentence; the engine treats it as the other two, a table
reading the DM can overrule).

- **Commanded this turn** (the master spent the Bonus Action): the creature's turn is in the **player's
  hands** that turn: `ownerOf` gives its master's player, who picks its action and move.
- **Not commanded this turn, an order stands** (`bond.standing` set by an earlier command or general
  command): **the DM plays it** on that order. Whether what it does follows the order is the DM's, as
  at a table.
- **Never commanded**: it takes the Dodge action and moves only to avoid harm; the engine accepts only
  `dodge`, `move` and `endTurn` for it, and the companion brain plays it (Decision 9).

A command sets `bond.commanded` for the turn it is given for and `bond.standing` to its `order` text
(`order: null` clears the standing order, and the creature goes back to Dodging). `commanded` is
cleared when that creature's turn ends. The standing order stays until a new command or the clear.

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
*As built in C5c (#343): a summon kept by a lasting effect of its master's spell that has a duration (Concentration, or a
time span: SRD Spells, Duration, "While a time-span spell that you cast is ongoing, you can dismiss it (no action
required) if you don't have the Incapacitated condition") is dismissed at no cost, and the effect ends as by `endEffect`.
One made by an Instantaneous spell (Find Steed, Animate Dead) is refused: such a spell is not dismissed, and the DM's
`bond { to: null }` frees one. See the C5c build notes.*

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
  is left for dismounting. *As built in C6b:* the mount provokes an Opportunity Attack when it leaves a
  foe's reach, and its Disengage covers the pair; the rider, moved without its own movement, does not
  provoke (SRD 2088-2090). The foe has one Reaction and chooses the mount or the rider (its standing
  instruction, or its player is asked, as now).
- **An independent mount** keeps its own turn and is played by its controller or the DM; the rider
  moves with it and cannot move it.
- **Moving together.** Every way a mount moves takes the rider along: walking, a push, a fall, and a
  teleport only where the effect says so (Fey Step: "along with its rider"; SRD 34458-34461; C6b). Outside a fight the pair moves as one
  creature, at the mount's pace.
- **Falling off.** When an effect moves the mount against its will (a push or a pull; the engine has no
  forced teleport, C6b), or the rider or the mount is knocked Prone, the rider makes a DC 10 Dexterity save;
  on a failure the rider is dismounted Prone in the nearest unoccupied space within 5 ft (`fell`
  in `dismounted`), or, in the air, comes off and falls. When the mount vanishes or dies the rider is dismounted
  where it stands (and falls if that is in the air).
- **Find Steed** is a controlled mount for its master (`bond.mount: 'controlled'`). Ridden, it keeps
  moving on its rider's turn and has no entry; not ridden, it acts before or after its master as
  `bond.order` says (Decision 3). If its master is Incapacitated while riding, the steed gets a turn
  straight after the master's that round and the companion brain plays it (Decision 9).

### Decision 9: the companion brain, and who presses the buttons

`ai.js` gains `companionStep(s, id)`, called by `aiStep` for a bonded creature:

- `orders: 'command'`, never commanded (`standing` null): Dodge, then move away from the nearest foe if
  one is within 5 ft, then end the turn. With a standing order and no command this turn, the DM plays
  it by hand (the brain does not guess an order); a creature commanded this turn waits for its player.
- A Find Steed whose master is Incapacitated: move next to the master if it can, attack a foe
  within 5 ft of the master (Otherworldly Slam), else Dodge.
- Otherwise (`auto: true`, or no player controls it): play it as `aiStep` plays a monster, never
  against its own side, and never `attack` for `noAttack`.

The DM's auto-play in the client (`app.js`:377) runs the brain for a creature on its turn when its
`ownerOf` is null (the DM's), or `bond.auto` is set, or it is never commanded under `orders:
'command'`, or it is the Incapacitated master's steed. A creature commanded this turn is not auto-played: its turn is its player's (Decision 6). Otherwise the turn waits for its player as
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
| `pocketed { id, by }`, `recalled { id, at }` | when `by` is Open; a recalled foe familiar is seen as `spawned` (as built, C5c: a pocketed one the party saw is seen as `vanished`) |
| `reformed { id, by, form, name, pocket? }`, `delivered { id, by, spell }` (C5c) | the party's own only (both Open) |
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
| Find Familiar | assist (**C5c built, #343**) | `summon` with `forms` (the 10 listed that have blocks, plus any pack Beast of CR 0), `types`, `one: 'reform'`, `turn: 'own'`, `at0: 'vanish'`, `noAttack`; dismiss and recall; touch delivery (C5) | telepathy and hearing, seeing through its eyes; Octopus (no block) |
| Find Steed | auto (with C6); **C4 set assist**; **C5c added `one: 'replace'` (#343)**, still assist: `mount` (C6) is not in the vocabulary yet, nor Life Bond's healing hook (C9) | `summon: 'otherworldly-steed'`, `types`, `one: 'replace'`, `turn: 'after'` with `order` before or after by the master's choice each round, `ends: ['masterDies']`, `mount: 'controlled'` | Life Bond until healing is hooked (C9); the steed's look |
| Summon Dragon | auto | `summon: 'draconic-spirit'`, Concentration part; Shared Resistances as a `modifier` step on `self` with the spell's `choice` | its "verbal commands" |
| Giant Insect | auto | `summon: 'giant-insect'`, `variants` | as above |
| Animate Dead | assist (**C5b built, #341**) | `on: 'corpse'`, Zombie; 24-hour bond; `orders: 'command'`, range 60; reassert (`reassert`, up to four and two more a slot level); commanded this turn the player plays it, otherwise the DM on its standing order | bones and the Skeleton; whether orders are kept |
| Create Undead | assist (**C5b built, #341**) | as Animate Dead, Ghoul, range 120; three to six Ghouls by slot, reassert as many; "only at night" is the DM's | as above; the Ghasts, Wights and Mummies of a level 8 or 9 slot (a cast with no picks, then `spawn` and `bond`) |
| Animate Objects | assist | `summon: 'animated-object'` with `variants` as size, at points the caster names | which objects (map things are not checked), the count by size against the modifier, reverting to the object |
| Phantom Steed | auto; **C4 set assist**: a part's `ends: damaged` and `mount` (C6) are not in the vocabulary yet | `summon: 'riding-horse'`, `over: { speed: { walk: 100 } }`, part ends on damage, `mount` via the mounts list | travel pace, the vanishing tack, the minute to dismount |
| Unseen Servant | assist; **C4 left manual**: `turn: 'none'`, commands and a block of one score are not in the vocabulary | a block built from the spell's numbers (AC 10, HP 1, Str 2), `turn: 'none'`, `orders: 'command'`, `leash: 60`, `noAttack`, Invisible | its other ability scores (none in the SRD), the tasks |
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
| C2 | **The turn and lasting effects.** `after` in `initiativeSort`, `startEncounter` and `joinEncounter`; the `summon` part in `durations.js`; `ends: ['longRest']` in rests. (The per-round `before`/`after` choice for Find Steed is stage A1 of the amendments.) | engine | `engine/world.js`, `engine/resolve.js`, `durations.js`, `engine/rests.js`, `view.js` (order only), tests | three `after` companions stay behind their master through a whole fight with ties and joins; a companion made in the master's turn acts next; ending the effect removes the creature and the order entry; `after` is not sent for a foe |
| C3 | **Summon blocks and the step.** `summons.js` (bake), the `summons` pack list and its linter, summon amounts, `summon` in `STEPS`, `KIT.summon`, `placeCreature` shared with `spawn`, the cast action's `summon` field, `summoned` in `viewEvents`; one entry, `giant-insect`, and Giant Insect moved to `auto`. | engine | `summons.js` (new), `content/schema.js`, `content/index.js`, `content/srd52/summons.js` (new), `content/srd52/spells-4.js` (Giant Insect only), `effects.js`, `engine/resolve.js`, `engine/world.js`, `engine/dm.js`, `engine/casting.js`, `view.js`, tests | Giant Insect cast at levels 4 to 9, each variant: the baked block lints as a monster, with AC 11 + level, HP 30 + 10 x (level - 4), Fly only for the wasp, the master's attack bonus on Poison Jab; a point out of range, unseen or occupied is refused and nothing changes; Concentration broken ends it; on `square-room` a Large insect fills 2 by 2 and is refused where it does not fit |
| C4 | **Blocks and spells, data.** `otherworldly-steed`, `draconic-spirit`, `animated-object`, and an Unseen Servant block from the spell's numbers; Find Familiar, Find Steed (without riding until C6), Summon Dragon, Phantom Steed, Animate Objects, Unseen Servant moved to their tiers, each `checked` against the SRD lines above. | content | `content/srd52/summons.js`, `content/srd52/spells-1.js` to `spells-5.js` (those entries only), tests | `npm run content` reports them at the tiers in the table above, with no problems; a test casts each and checks the numbers against the lines cited |
| C5 | **Commands, corpses and familiars.** `command` (with `commanded` and `standing`, amended Decision 6), the never-commanded lock, the servant's 15 ft; `on: 'corpse'`, Animate Dead and Create Undead with the 24-hour bond and reassert; `dismiss` and `recall` with the pocket; `one: 'reform'` and `'replace'`; touch delivery through the familiar's Reaction (`cast { deliver }`). | engine | `engine/companions.js`, `engine/casting.js`, `effects.js`, `engine/resolve.js`, `durations.js`, `view.js`, `content/srd52/spells-3.js` and `spells-6.js` (those two spells), tests | a never-commanded Zombie may only Dodge and move; a Zombie with a standing order and no command this turn is the DM's, and one commanded this turn is its player's (needs A2); one command for three costs one Bonus Action; a corpse 15 ft away is refused at range 10; after 24 hours the Zombie is a foe with a `manual` event; a pocketed familiar is in no player view and comes back with its Hit Points within 30 ft; Shocking Grasp delivered by an owl within 100 ft uses the owl's Reaction and is refused at 105 ft |
| C6 | **Riding.** *C6a built (#346): `mount`, `dismount`, `riding`/`rider`, the footprint, `budget.mount`, plain walking together, the eight mounts. C6b built (#362): falling off, pushes, teleports, a mount gone, the pair's Opportunity Attacks, Find Steed, the raised eye; see its build notes.* `mount`, `dismount`, `riding`/`rider`, the mount's footprint for the rider, `budget.mount`, moving together (walk, push, teleport, fall), falling off, Opportunity Attacks for the pair; `mount: 'trained'` on the eight mounts; Find Steed as a controlled mount and its Incapacitated turn. | engine | `engine/movement.js`, `engine/world.js`, `engine/resolve.js`, `space.js`, `vision.js` (eye height), `content/schema.js` (the `mount` field), `content/srd52/monsters-*.js` (eight entries, that field only), tests on hexes and on `square-room` | on both grids: mounting costs half Speed; a Medium rider on a warhorse moves 60 ft with the warhorse's movement and still has its own to dismount; the warhorse can Dash but its attack is refused; a goblin beside the pair gets one Reaction and may choose either; Thunderwave pushing the horse makes the rider save DC 10 and land Prone on a failure; a flying steed vanishing drops its rider who falls; a fireball touching one hex of the horse catches the rider |
| C7 | *Built (#366); see its build notes.* **The companion brain.** `companionStep`; the client's auto-play rule (never-commanded and not-commanded-this-turn, Decision 9). | engine + client | `ai.js`, `packages/client/app.js` (the auto-play condition only), tests | a never-commanded Skeleton Dodges and steps away; an Incapacitated paladin's steed comes to her and attacks the goblin beside her; a player's familiar waits for its player unless `auto` is set |
| C8 | **Screens.** The cast chooser for a summon (form, type, variant, then taps for each point, or corpses); the companion's turn in the player's bar and tracker (one row under its master for `after`); buttons for Command (with the order text; the prompt that hands a commanded creature's turn to its player, A2), the master's before or after choice for a steed (A1), Dismiss, Recall, Mount, Dismount, Let it act; the pocket on the sheet. | client | `packages/client/actionpanel.js`, `classes.js`, `tracker.js`, `app.js`, `index.html`, `style.css`, `scripts/smoke/companions.mjs` (new), `scripts/smoke.mjs` (one registry line) | `SMOKE_ONLY=companions`: at both sizes, with touch at 390 x 844, a wizard summons an owl, the owl's turn comes to the same player, the owl is dismissed and recalled; a paladin summons a steed, mounts, rides 60 ft and dismounts; no page errors |
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
- Whether a creature's actions follow its standing order or general command ("guard the hall"); the DM plays it.
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

Each had a default. All seven were answered by the owner on 14 November 2026 (issue #193, comments of
20:05 and 20:25 ET); the text states what stands now.

1. **A familiar's sight.** *Answered 14 November 2026: yes.* A party companion is one of the party's eyes
   all the time, as every party member is and as `sight.md` assumes (default confirmed). The SRD gives
   the master its senses only for a Bonus Action, until the start of the next turn; the stricter reading
   would need eyes per player, which the shared players' view does not have.
2. **Where a rider is.** *Answered 14 November 2026: yes.* The rider takes up the mount's whole space for
   reach, range and areas (default confirmed): a Medium knight on a Large horse reaches from any of its
   hexes, and a fireball on one hex of the horse catches the knight.
3. **Find Steed's turn when not ridden.** *Answered 14 November 2026: CHANGED.* Not "always straight
   after its master". The master's player chooses, per round, whether the steed acts before or after the
   master; the default is after. The choice takes effect at the start of the next round, so a change in
   the middle of a round can never give a double or lost turn. A ridden controlled mount keeps moving on
   its rider's turn (SRD: it takes the rider's Initiative on mounting and can move and act the turn it is
   mounted). Decision 3; stage A1.
4. **Commands that stand.** *Answered 14 November 2026: AMENDED.* A command given with the Bonus Action
   puts the creature's turn in the player's hands that turn. With no Bonus Action spent, the DM plays it on
   its last standing order or general command. With none ever given, it Dodges and moves only to avoid
   harm. (SRD, Animate Dead and Create Undead: "Once given an order, the creature continues to follow it
   until its task is complete" and "If you issue no commands, the creature takes the Dodge action and
   moves only to avoid harm"; Animate Objects has the second only.) Decision 6; stage A2.
5. **Undead past 24 hours.** *Answered 14 November 2026: yes* (default confirmed). The bond ends, the
   creature joins the foes, and the DM is told.
6. **XP for a foe's summons.** *Answered 14 November 2026: CHANGED.* A foe's summons DO count toward a
   fight's XP like any foe; the DM can untick one; a summon block with XP 0 stays 0. This retires
   `counts: false` for bonded foes and the difference between a seen and an unseen husk's XP (review of
   #317, L3). Stage A3.
7. **The cap.** *Answered 14 November 2026: CHANGED to 30* bonded creatures per master (the default was
   20). The reason is the SRD's limits (Decision 1). Stage A4.

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

Settled in the review of #313:

- **"Can't attack" means no attack roll.** A `noAttack` creature is refused `attack`, any `act` with an
  attack step or a Multiattack, and any spell with an attack roll; it has no Opportunity Attack
  (`opportunityAttack` gives none, so nobody walking away from it is threatened) and no trait reaction
  that attacks. An action or spell with a save and no attack roll (a breath) is allowed.
- **Gear of a companion the party could not see.** It goes onto a pile marked `by` it and `left`
  (`world.js`, `seePiles` keeps a `left` pile marked), as `drop` does for such a creature, and so does any
  pile it dropped unseen before. Players are never sent it; the DM is told (`manual`) and opens it with the
  map editor when the party finds it. A vanishing with or without gear then looks to players exactly like
  an unseen creature's death.
- **What players are told of a companion that vanished.** In the events of that action it is classed as it
  was just before it went (the party's: Open; one they could see: Seen), so the damage, its death and what
  it left reach them as for any creature, and the undo label is shown. A Seen one's `health` is only `dead`
  or `down`.
- **A companion the party could not see** (rounds 2 and 3 of the review of #313, N1 and N2) is not taken out
  of the state: it stays as what an unseen creature's death leaves, dead, at 0 Hit Points, hidden by the DM's
  switch for good and marked `vanished` (`reveal` refuses it; `settleBonds` passes it by), in the fight order
  as the dead are (its turn, if going on, waits for the DM). Only what it carried leaves it, onto the `left`
  pile. Everything it did (zones, lasting effects, conditions, grapples, parts that end with its turn, flags)
  goes on exactly as after a death, so players are told and shown exactly what an unseen death gives them;
  the DM is told what is left, ends it by hand, and may `remove` the record. It gives no `died` event when it
  vanished alive (leash, master). One difference stays, and is right: a creature merely out of sight that
  vanished is not found as a corpse later, as one that died would be.
- **What it leaves behind in others, seen.** Encounter flags naming it go. A condition it put on another with no
  lasting effect: Grappled ends (nobody holds on), any other loses its `source` and the DM is told. A part
  of another's effect that ends with its turn (`ends.who`) ends, since that turn will not come.
- **XP.** A bonded foe is listed in a fight's conclusion with `counts: false` (owner's question 6); the DM
  may tick it. *Superseded 14 November: a foe's summons count; stage A3, built (see its build notes).*

### C2, the turn and lasting effects (#316)

- **The order.** An entry with `after: masterId` carries its master's `init` and is not sorted with the rest:
  `initiativeSort` (world.js) sorts the others as before (stably, so a tie stays as it stood) and puts each
  `after` entry straight behind its master and that master's earlier companions, in the order they stand.
  With no `after` entries it is the old sort, exactly. A full sort happens only at the start of a fight, and at
  the start of a round in which a creature that was set aside (E20) gets its place back, as before C2.
  Otherwise the order is not sorted again.
- **Joining in the middle of a round puts the new entry in and moves nothing else** (`insertSlot`; review of
  #317, B1: a whole re-sort could move a companion of a master set aside to the end of the round past the
  creature whose turn it was, giving it two turns). A companion goes behind its master's group; any other
  creature before the first creature it outranks among those in their own initiative place, as a stable sort
  would have put it, and before those set aside to the end.
- **Joining.** At the start of a fight, and when a creature joins one, a companion with `turn: 'after'` whose
  master has a place takes it with no roll (`joined { id, init, after }`), **only if the party knows of both**
  (`unknown` in vision.js: not hiding, not hidden, not out of sight; review of #317, M1). Otherwise it rolls
  its own Initiative as an unbonded creature would, so players get exactly what an unbonded creature gives: a
  seen creature always acting straight after an unseen turn, or an unseen turn always straight after a seen
  creature, would tell them the two belong together. Its controller is told why (a `note` for the party's own;
  for another's, a `manual` for the DM alone).
- **Later moves.** When the order and the bonds stop agreeing (a master joins after its companion, either of
  them comes to be known to the party, the DM bonds a creature in the fight), `followMasters` moves the one
  entry behind its master's group. It runs after every action (at the end of `settleBonds`) and at the start
  of each round. Mid-round it moves the entry only if every creature that has had its turn this round still has
  and every one still to come still is. It does not move the creature whose turn it is, and does not move one
  while it or its master is set aside (E20) in the middle of a round. Otherwise the move waits for the next round. *Since A1
  (#335): at a round's start, once the places moved for the round before are given back, `newRound` runs it again, so a
  companion whose master was set aside last round (and is set aside again this round, at its turn) is moved then; see
  the A1 build notes.* Once in place a
  companion stays there, whoever hides later: the party saw where it stood. The knowledge check runs before
  the los/light pass of the same action (engine.js runs `look` after `settleBonds`). So the move comes after
  the party knows of both: at the earliest after the next action, and as late as the next round's start if
  moving it sooner would give a creature a second turn or take one away.
- **A freed companion** (the DM's `bond { to: null }` in a fight) loses `after` and keeps its place and its
  count: it does not roll again. It is sorted on that count by its own Dexterity only at a full sort (above),
  so usually it keeps its place for the rest of the fight.
- **Stepping away (E20).** A master moved to the end of the round goes alone; its `after` companions keep its
  count. A creature taken back in (`stepBack`) after the creature whose turn it is goes behind that creature's
  companions, not between them (L4). It is seated there once, when it comes back (`settleOrder` turns
  `moved.after` into `moved.placed`), and stays where it stands for the rest of the round. Before, it was
  seated behind its anchor again on every turn. Once a bond or a free could change what stands around that
  anchor, that carried it past creatures that had had their turn and gave them a second one (review of #317,
  round 2, B1 and B2). A record of the old form, from a save, is seated once the same way.
- **The DM's bond** takes `turn: 'after'`; `turn: 'none'` and `orders: 'command'` are still refused (C5, C6). *Since C5a
  (#338) it takes `orders: 'command'`; `turn: 'none'` is still refused.*
- **The `summon` part.** A creature a spell keeps is a part `{ target, summon: true }` of the lasting effect its
  `bond.fx` names. `durations.js` `holds(s, e)` says whether that part still stands. `settleBonds` vanishes the
  creature (`why: 'ended'`) after the action once it does not: Concentration lost, its time run out, or
  `endEffect`. `vanish` takes its place in the order, and passes the turn if it was its own. Ending the part
  itself changes nothing in `durations.js`: the layer under `resolve.js` cannot vanish a creature.
- **Long Rest.** After a `rest`, a companion whose bond has `ends: ['longRest']` vanishes (`why: 'rest'`) if its
  master finished the rest (a master at 0 Hit Points does not).
- **From the C1 reviews.** The record an unseen vanish leaves has no `bond`: it does not count toward
  `BOND_MAX` or stop its master being bonded, and `companionsOf` also passes by a `vanished` record kept from
  before. A consequence: in a fight it counts toward the XP, as any unseen death does (after 14 November every foe's summon counts, seen or not; stage A3). The DM's note says so,
  and the DM may untick it. `effectStart`/`effectEnd`'s `why` becomes "it ended" also when it names a creature
  the effect was on that players do not know of.
- **What players are sent.** `after` only on an Open entry whose master is Open (`view.js`: the order, the
  `encounterStart` order and `joined`); a foe's companion's entry stays `{ id }`.
- **No state version bump:** `after` on an entry is optional, and nothing else in the shape changed.

### Turns kept and lost, after C2 (#320)

- **The rule the order keeps:** every creature that is up and stays up acts exactly once a round. Those before
  the turn going on have had theirs and those after it have not, so nothing that comes back in is seated before
  the turn, and nobody already past it is moved after it.
- **Taken back in while the creature whose turn it is was moved to the end (E20, `end`/`endKeep`):** the
  creature is seated straight behind it in the end block, as one moved there right after it (its record becomes
  an end record `{ n, keep: false, round }`, the later end records shifted one place on). Before, it was seated
  at the end of those in their own places, behind the turn, and lost its turn that round (review of #317, round
  3, M1). Next round it gets its own place back, as any creature moved to the end for one round.
- **A record of the old form** (`moved[x].after`, from a save written before C2) is seated behind its anchor
  wherever the turn is, as the old code kept it all round: an anchor that has had its turn means the creature has
  had its own too, or is taking it (review of #321, B1). Behind an anchor moved to the end it goes into the end
  block as above. Only if the anchor is gone from the order is it seated behind the creature whose turn it is,
  and if that is itself, it stays where it stands. Two such records behind each other are seated anchor first.
  `test/fixtures/old-stepback-saves.json` holds real saves of that code, taken at each turn of a round.
- **The record keeps its own copies** (`engine.js`, `record`): a timeline entry is a deep copy of its event. The
  `placed` event held its creature's `pos` object (`dm.js`), so the entry changed with the creature, and undo and
  redo, which put the state back field by field, could not give the record back as it was (review of #317, round
  3, L3: redo after a `spawn` and a `place` of the new creature gave a different `to`).
- **No state version bump:** the shape is unchanged.

### C3, summon blocks and the step (#325)

What was settled while building it, where Decisions 2, 5 and 10 left room. **This is the spec amendment for the
new effect step `summon`** (CLAUDE.md: a new step is an engine change).

- **The pack list.** `content/srd52/summons.js`, in `PACKS[0].summons` and `CONTENT.summons`. A block is the
  monster format with summon amounts, plus `level` (the lowest spell level it is cast at; the linter bakes it from
  there to 9) and `variants` / `types` (the choices it reads). It has no `cr` or `xp`: baked, it is `cr: null`,
  `xp: 0`. `name` may itself be an amount (`{ by: 'variant', wasp: 'Giant Wasp', ... }`). `only` works on any entry
  of a list (a trait, an action) and on a field given as `{ value, only }` (a speed). A damage step's `plus` is an
  amount added to its dice. A Multiattack entry's `action` and `times` may be amounts (the spider's "any of Poison
  Jab and Web Bolt"; "half this spell's level").
- **`bake(block, { slot, caster, variant?, type? })`** (`summons.js`, pure, no imports) replaces every amount and
  resolves every `only`; `castings(block)` lists every casting it can be baked for. `summonTemplate` (content/index.js)
  turns a baked block into the record `makeEntity` takes, `actions` included. `round: 'down'` (or `'up'`) is needed
  for an amount that is not a whole number; one without it is a content error.
- **The linter.** A block is linted by baking it at every casting with a stand-in caster (attack +7, DC 15, PB 3,
  modifier +4) and linting each result as a monster (`lintBaked`: the monster linter with `cr: null` allowed). Also:
  class amounts (`{ column }`, `{ mod }`, ...) are refused in a block; summon amounts, `only` and `plus` are refused
  in a monster; a by-amount's keys and an `only`'s lists name the block's own variants and types. **A block's traits
  are text only**: the engine reads trait modifiers and trait reactions from `CONTENT.monsters[e.tpl]` (modifiers.js,
  reactions.js, not in this stage's files), so a block trait with modifiers or a reaction is refused rather than
  carried and ignored. Giant Insect's one trait (Spider Climb) is text, as on the pack's Giant Spider.
- **The step**, as built: `{ summon: id | 'form', forms?, types?, variants?, count?, on?, over?, bond }`. `summon` names
  a block or a pack monster (`'form'` with `forms`: a list of pack monsters, or `{ type, cr }`). `count` is a whole
  number (1 to 30) or `{ slot, base?, above? }`, and needs `on`, which is only `'space'` so far. `over` replaces only
  speeds (`{ speed: { walk: 100 } }`). `bond` takes `kind`, `turn` (`own` or `after`), `orders` (`free`), `at0`,
  `ends` (`masterDies`, `longRest`), `leash`, `noAttack`. **Refused by the linter until the stage that runs them:**
  `one` (C5), `on: 'corpse'` (C5), `turn: 'none'` (C5, C6), `orders: 'command'` and a command `range` (C5), `mount`
  (C6). *Since C5b (#341) `on: 'corpse'`, `orders: 'command'` and the bond's `range` are taken; see the C5b build notes.* The step is only in a spell, once, in the spell's own list (not under a roll), the spell aimed at its
  caster and with a range in feet; a monster's action may not have one. The pack check (when the pack's summon
  blocks are given to `lintPack`) wants the step's `variants` and `types` to be exactly the block's, the spell's
  level at least the block's, and every form a pack monster.
- **The cast.** `{ type: 'cast', ..., summon: { variant?, type?, form?, at: [{ q, r, z? }, ...] } }`, one space per
  creature. Checked before anything is spent, in this order for each space: a player may name only a place the party
  has seen (checked on the column before anything else, so nothing is said of an unseen place); the creature's
  footprint fits there (`placeCreature`, shared with `spawn`, so the same words: "A creature can't stand there.",
  "There isn't room for something large there.", "That hex is occupied."); within the spell's range by `gap` (the
  anchor, as for a teleport); a space the caster can see (`canSee` of a stand-in of the creature's size); inside the
  arena while the caster is in a fight ("The arena is locked until the fight ends."); not overlapping another space of
  the same casting. A flyer (its baked speeds, or `over`) given `z` is placed exactly there in the air if every cell
  of it has room; anything else lands on the floor of the column. `a.summon` on a spell that summons nothing is refused.
- **A creature the caster does not know of** (hidden by the DM, hiding, out of sight) does not stop a space: refusing
  would tell the player it is there. The creature appears in the nearest free space instead, as a teleport does
  (`nearestFree`, rings out to 6), and the DM is told (`manual`, partial). None near: nothing appears and the DM
  places it; that line is `partial` too, so the player is not told why (review of #326, M1). **An accepted trade-off
  (review of #326, L1):** the move itself hints that something unseen stands there, since a player who named a seen,
  empty-looking space sees the creature appear a cell or two away, or not at all. Refusing would say more, and so
  would naming the creature. A stricter reading (the summon appears in the space named, sharing it with the unseen
  creature until one of them moves, or the cast is spent with nothing made and a neutral line) would need either
  two creatures in one space outside riding (C6's footprint rules) or a spell that fails for a reason the player
  sees no cause for. Neither is built; the owner may choose.
- **The cap.** At most 30 bonded creatures per master (`SUMMON_MOST`, owner's answer 7), counting the master's
  bonded creatures that have not vanished, before the new ones. A companion can't summon (it has no companions).
  *Since A4 the DM's `bond` and a summon share `BOND_MAX` (30) and one refusal; see A4's build notes.*
- **The creature made.** Id `m<seq>` as `spawn`; `tpl` is the block id (or the pack monster's); the baked creature
  type is kept on the record (`type`, which `creatureType` reads first); side, the master's. `name`: the party's
  is "Ven's Giant Wasp"; **a foe's is named as `spawn` names a creature** ("Giant Wasp 1", counted by `tpl`), so its
  name says nothing of a master; each variant is numbered apart ("Giant Wasp 1", "Giant Spider 1"; review of #326, L5),
  counting by `tpl` and name as the DM's `spawn` of a block does, hidden ones and husks included as `spawn` always has. `bond`: `{ to, kind, source (the spell), fx, turn, orders, at0, ends, leash?,
  noAttack?, slot, commanded: null, auto: false }`. With a lasting effect, a part `{ target, summon: true }` (C2 then
  ends it with the effect). A party one looks around (its sight is the party's). It joins a fight going on **if it
  stands in the arena, as a spawned creature does** (`joinEncounter`, so straight after a master the party knows of,
  or on its own roll otherwise, as C2 settled). Following its master outside a fight (Decision 6) is not set: that
  needs `movement.js`, not in this stage's files.
- **A hidden master.** The summon does not take the master's `hidden`: the DM's switch hides the creature, not what it
  does, as a hidden caster's Fireball still burns. And casting a summon does not reveal a caster the DM hid: the
  spell is aimed at its caster only in form (casting.js skips revealing the caster for a summon; other self spells
  are unchanged).
- **What players are sent.** `summoned { id, by, kind, fx? }` goes to players **as `spawned { id }` when they do not
  know of `by`** (the same event type and keys, `t` first in a record entry, as a passed-on entry has it), so a twin
  run against a creature the DM adds unbonded, with the master holding a lasting effect of its own so `seq` moves the
  same, gives byte-identical events, views and record on hexes and on squares (summons.test.js). Where they know of
  `by`: `{ id, by, kind }`, and `fx` only for their own. The creature's record follows `classify` as any creature:
  `bond` is never on a Seen record, and a foe's `after` is never sent (C2).
- **The DM's `spawn`** takes a summon block too: `{ monster: 'giant-insect', slot, variant?, kind? (its creature type),
  caster }`, baked with `caster`'s numbers for the spell whose step names the block. It makes the same creature
  unbonded (the DM may then `bond` it). This is also what the twin runs compare against. With `at` missing or not
  whole numbers, `spawn` now answers "Pick a place for it." where it threw or said it could not stand there (L7).
- **XP.** A summon's `tpl` is not a pack monster, so the conclusion's lookup gives it 0 (owner's answer 6: a block with
  XP 0 stays 0). *Since A3, `counts` is `!up(e)` for every foe; see A3's build notes.*
- **No state version bump:** `bond.source`, `bond.slot` and a creature's `type` are optional fields; nothing else in
  the shape changed.
- **Giant Insect** (SRD 5.2.1, flow lines 27421-27490) is `auto`, `checked`: AC 11 + level, HP 30 + 10 per level above
  4, Speed 40, Climb 40, Fly 40 (wasp), Str 17 Dex 13 Con 15 Int 4 Wis 14 Cha 3 (every save equal to its modifier, so
  no `saves`), Darkvision 60, PB the caster's; Spider Climb; Multiattack of half the level rounded down; Poison Jab
  (spell attack, reach 10, 1d6 + 3 + level Piercing and 1d4 Poison); Web Bolt, spider (spell attack, range 60, 1d10 + 3
  + level Bludgeoning, Speed 0 until the start of the insect's next turn); Venomous Spew, centipede, Bonus Action (Con
  save against the spell save DC, one creature within 10 ft, Poisoned until the start of the insect's next turn).
  "If you don't issue any [commands], it takes the Dodge action" is the companion brain's (C7).

#### For the client job

- **The cast chooser** reads `SPELLS[id].summon`: `{ of, count, variants?, types?, forms?, kind }` (effects.js,
  `spellProfile`). It asks for the variant (or type, or form), then one tap per creature (`count`, a number, or for
  `{ slot, base, above }` worked out from the slot), and sends `{ type: 'cast', actor, spell, slot, summon: { variant,
  at: [{ q, r }] } }`. A flyer may be given `z`. The engine refuses with words fit to show (range, sight, room,
  occupied, arena); a Large creature's tap is its anchor (on squares the top-left of its 2 by 2; on hexes the centre
  of its 3). `look` from the player is not taken yet.
- **The `summoned` event**: `{ type: 'summoned', id, by, kind, fx? }` for the DM and for players who know of `by`
  (`fx` only on their own); otherwise players get `{ type: 'spawned', id }`. Log line: "Ven summons a Giant Wasp".
- **The creature**: `tpl: 'giant-insect'` is not in `MONSTERS` (the client's `MONSTERS[e.tpl]?.name` falls back to
  "Creature"; use `e.name`, or `CONTENT.summons[e.tpl]`); the model to draw is the client's choice by `tpl`. Its
  turn is its master's player's (`ownerOf`); in the tracker it stands straight after its master (`after`; built, #339: the tracker draws the order as sent; C10 still owes drawing a rider on its mount).
  Built in #337: the log says "Ven summons a Giant Wasp." (the master's name taken off the creature's, else the template's); pawn labels and the reaction
  question take the shown name ("Brenna's goblin") through `shownState()` in app.js; the card falls back to `e.name`; the tracker already draws the order as
  sent, so the wasp stands straight after Ven; the DM's auto-play leaves a player's companion to its player unless `bond.auto` is set.
- **Scenes (#344)**: scene `say` and `askCheck` (`scenes.js`) test who plays the creature with `ownerOf`, not `e.owner`: a player may speak as, and ask a check for, their own character or a companion they play (a creature that takes commands only on a turn commanded for it; otherwise the DM's). Another player's companion, a foe's bonded creature and a hidden one are refused in the words for a creature that is nobody's. What a familiar hears or says stays the DM's (manual); this is the ownership test only. The client's `scenes.js` may now offer a companion.

### C4, blocks and spells, data (#328)

Content, plus the public hand-over line in `resolve.js` (`summonHandOver`, #331 review): three blocks in `content/srd52/summons.js` and five spells moved. Every number was compared with
`reference/srd52/srd52-flow.txt` (lines in the table above); `test/summons-c4.test.js` bakes each block at every
casting and casts each spell.

- **`otherworldly-steed`** (level 2, `types`): `assist`. AC 10 + level, HP 5 + 10 per level, Fly 60 from level 4, the
  Slam's damage type by creature type. Fell Glare applies Frightened and tells the DM it ends on the *caster's* next
  turn (the step's `ends` can only say the steed's); Fey Step (a teleport that takes the rider) and Healing Touch (2d8
  plus the spell's level: `plus` is added to damage dice only) are `manual` steps; Life Bond waits for a healing hook.
  Each is `uses: { per: 'day', n: 1 }`, as "once per Long Rest".
- **`draconic-spirit`** (level 5): `auto`. The `variants` are the breath's damage type, which the SRD makes "your
  choice when you cast the spell" and separate from the Shared Resistances choice, which stays the spell's own `choice`
  and a `modifier` step on the caster. A cast therefore names both (`summon.variant` and `choice`).
- **`animated-object`** (level 5): `auto`. The `variants` are the object's size, tiny to huge (the SRD's "Medium or
  smaller" is three of them with the same numbers). The upcast dice are `only: { slot: n }` damage entries, one more
  die for each level above 5 (a resistance rounds each of those entries apart). The SRD gives the block no Proficiency
  Bonus; `pb` is the engine's required field and nothing in the block uses it.
- **Spell tiers.** Summon Dragon `auto`. Find Familiar, Find Steed, Phantom Steed, Animate Objects `assist`, each with its `text` naming what is left (the
  DM's note; there is no `manual` step, so a player is told only the public line above). Find Familiar uses `forms: { type: 'beast', cr: 0 }` (the ten listed forms and any
  other CR 0 Beast of the pack; the SRD has no Octopus block). Missing, so assist and not the table's tier: `one:
  'reform'` / `'replace'` (C5) for the one familiar or steed, `mount` (C6) for riding, a part's `ends: { on: 'damaged' }`
  for Phantom Steed, and a `count` that depends on the caster's modifier and the objects' sizes for Animate Objects (the
  step makes one; the DM adds the rest with `spawn`). Find Steed's before-or-after choice is stage A1.
- **Casting from the UI.** The client cannot send `summon` until C8; until then a UI cast of these spells is a manual hand-off (C3b) with one public line.
- **Unseen Servant stays `manual`, with no block.** It needs `turn: 'none'` and `orders: 'command'` (the linter refuses
  both until C5 and C6) and a block with only Strength 2 (the monster linter wants all six scores, and inventing the
  other five is not allowed). Its manual text already carries the SRD's numbers.

### C3b, a summon cast with no picks (#332)

Found in the review of #331: from C3 a cast of a spell with a `summon` step and no `summon` field was refused ("Pick
where ..."), and the client cannot send one until the cast chooser (C8), so from the table Giant Insect could not be
cast at all. Before C3 these spells were `manual` and were never refused. Settled:

- **What counts as no picks: `a.summon === undefined` only.** That is the manual path. Any other value is refused as
  before, with nothing changed: `null`, a string, a number, an array, an object with a key it does not take, a missing
  or empty `at` or the wrong number of spaces, a missing variant. A `summon` on a spell that summons nothing is still
  refused, `null` included.
- **The manual path** is any spell's: the slot spent (and the turn's one slot, the action), Concentration started where
  the spell has it (ending the old one), its lasting effect timed as usual, with no summon part (it keeps no creature, and ends
  when its time runs out or its caster drops it; the spell's other steps, such as Summon Dragon's Resistance on the caster, run as usual). Nothing is made and `seq` moves only for the effect. Checks that do
  not depend on the picks still hold: a companion can't cast a summon, and a master at the cap of 30 is refused.
- **The DM is told, alone** (`manual`, `partial: true`, emitted by the summon step in `resolve.js`, `summonHandOver`):
  the level it was cast at; each choice of the block baked at that level with the master's numbers (name, AC, Hit
  Points, speeds, size), or the pack monster, or the forms; a creature type to pick where the step has `types`; the
  master's spell attack, spell save DC and Proficiency Bonus the block is baked with; the count; the spell's range and
  that the space must be one the caster can see (in the arena in a fight); the DM's `spawn` that makes it and that it
  is bonded with `bond`; and, for a spell that lasts, that the creature so added is not kept by the spell (the DM's
  `bond` takes no `fx`), so the DM removes it when the spell ends. A player caster gets the `cast` and `effectStart`
  any spell of theirs gives, and one short public (not `partial`) `manual` line, "<Spell>: the DM adds what it summons.",
  with no numbers and no claim that a creature exists (#331 review; a foe's or a hidden caster's line is dropped by the
  view like any manual line of a creature that is not the party's). An `assist` or `manual` entry's own tier note (its
  `text`) is the DM's alone and follows the DM's line. Identical bakes are listed once (Draconic Spirit's five breath
  types), and the line says the caster's pick changes none of the numbers. A step after the summon step (#331's Find Familiar line) runs
  as it does with picks.
- **A hidden caster is not revealed**, as with picks (the spell is aimed at its caster only in form). A twin run (a
  hidden foe's cast without picks against the same foe's plain manual spell aimed at nothing, same level, duration
  and Concentration) gives players byte-identical events, views, record and counter, on hexes and squares
  (`summons-fallback.test.js`).
- **A cast with picks is unchanged** (checked byte for byte against main for party and foe casts with a hidden
  creature in the space, on hexes and squares, through a fight). One existing test changed: the C3 refusal of a cast
  with no `summon` now sends `summon: null`.
- **For the client job (C8):** the chooser must omit `summon` when nothing is picked, never send `summon: null` (that is
  refused), and for Summon Dragon still send `choice` (the Shared Resistances pick; a cast without it is refused "Choose a damage type": the client's `chosen()` defaults to the first option). Until the chooser exists, the plain cast button works for these spells; the DM's log shows
  the line to act on.

#### Build notes: C5c, dismiss, recall and the pocket, one per master, touch delivery (#343)

What was settled while building it, where Decisions 1, 2, 6 and 10 left room. **This amends the `summon` step** with the
key `one` (CLAUDE.md: a step's vocabulary is an engine change), as Decision 2 named it.

- **Which creatures.** The pocket dimension, `one` and touch delivery are a familiar's: a companion of `bond.kind:
  'familiar'` that a spell made (`bond.source` set: Find Familiar, and later Wild Companion and Pact of the Chain, which cast
  it). One the DM bonded as a familiar (the Vampire Familiar, a pet) has no `source`: no spell gives it a pocket dimension or
  lets it deliver a touch, and it is refused. `one` acts on the master's companions of the step's `bond.kind` made by this
  same spell (`oneOf`, resolve.js), on the map and, for `reform`, in the pocket.
- **`dismiss { actor, id, forever? }`** (companions.js). A familiar: a Magic action (in a fight on the master's turn, with
  its action left, not Action Surge's extra one, and marked a Magic action as casting marks it; outside a fight free, but the
  master must be up and able to act), to the pocket or, with `forever: true`, for good (`vanished`, `why: 'dismissed'`). One
  already in the pocket may be dismissed forever from there; dismissed again without `forever` it is refused. Any other
  companion: refused with `forever`; dismissed when its `bond.fx` names a lasting effect of the master's spell that has a
  duration: Concentration ("you can end ... at any time (no action required)", SRD Concentration) or a time span ("While a
  time-span spell that you cast is ongoing, you can dismiss it (no action required) if you don't have the Incapacitated
  condition", SRD Spells, Duration; flow lines 23753-23759), so Summon Dragon, Giant Insect, Animate Objects and Phantom
  Steed. It costs nothing, in a fight or out; for a time span the master must not be Incapacitated. The effect ends as by
  `endEffect` and `settleBonds` vanishes the creature (`ended`). One made by an **Instantaneous** spell is refused ("Find
  Steed is instantaneous, so it does not end when Ven wishes"): Find Steed, and Animate Dead and Create Undead, whose 24
  hours of control are the engine's effect and not the spell's duration. Decision 6 said such a creature is freed as by the
  DM's `bond { to: null }`; no SRD spell lets its caster do that, so it is refused, and the DM's `bond { to: null }` still
  frees one (review of #343, M2). Each refusal says why in its own words (review of #343, round 3): one the DM bonded ("no
  spell keeps it, so there is nothing to dismiss"), one of an Instantaneous spell, one whose lasting effect is gone ("nothing
  that lasts keeps it now"), one kept by an effect that is not the master's.
- **Into the pocket** (`pocket`, resolve.js). What it wore or carried stays in its space (`leaveGear`, SRD: "it leaves
  behind in its space anything it was wearing or carrying"); its own lasting effects and Concentration end and a part of
  another's on it ends, as for a seen vanish (`settleSeen`, also for a familiar the party could not see: the pocket is real,
  so a grapple it held on someone ends); those following it stop; it leaves the fight's order as a vanish takes it out (if
  it was its turn, the turn passes) and the fight's flags that name it go; Grappled, Prone, Dodging and Disengaged and its
  hiding are left behind; other conditions stay with it. A light it carried (`light`) stays behind too, as what it
  carried: a named torch or lamp goes onto the pile by name, any other light the DM is told of (review of #343, L2). Its record, Hit Points and all, moves from `state.entities` to
  `master.pocket[id]`. `pocketed { id, by, name, seen?, party? }`. Then `checkEnd`: a foe's last companion up going to its
  pocket can end a fight. A foe the party saw leave a fight that way goes into `encounter.gone` (A3), as a seen vanish does;
  recalled into the same fight it is counted in the order and not twice (review of #343, L6). In the pocket nothing touches
  it: a Long Rest does not heal it, and it keeps its Hit Points until recalled (Decision 6's "same Hit Points"; review of
  #343, L1).
- **`recall { actor, id, at }`** (companions.js). A Magic action as `dismiss`. `id` must be in this master's pocket. `at`
  is checked as a summon's space (C3): a player names a place the party has seen; the familiar fits there (a flyer given `z`
  in the air); nothing the master knows of stands there ("That hex is occupied."); within 30 ft of the master by `gap` from
  its anchor (as a summon's range); in a fight the master is in, inside the arena. No sight is needed: the SRD says only
  "an unoccupied space within 30 feet of you". A creature the master does not know of does not stop it: the familiar
  appears in the nearest unoccupied space, or stays in the pocket if there is none, and the DM is told (`manual`, partial),
  as for a summon. It comes back with the same record, id and Hit Points (`unpocket`); `recalled { id, by, at }`; a party
  one looks around; in the arena of a fight going on it joins through `joinEncounter` with the C2 rules (a familiar rolls
  its own Initiative, `joined`). An empty pocket leaves no field.
- **Ids.** engine.js does not walk `id` (other actions use it for other things): `dismiss` and `recall` check it as
  `companionOrder` does. To a player a creature the party does not know of, and an id that is in no pocket of this master,
  is "No such creature."; one it knows of that is not this master's is "not Ven's companion".
- **The cap** counts the pocket (`roomForCompanions`, shared.js), and a creature with a familiar in its pocket has
  companions, so the DM's `bond` refuses to make it one.
- **A master made again** (`remake`, sheets.js: `levelUp`, `setSheet` with an actor, an item given, worn or attuned at a
  rest; and `editCharacter`, characters.js) keeps its `pocket`; a record typed in can't bring one (the record linter refuses
  the field). The DM's `remove` of a master with a familiar in its pocket is refused, changing nothing, until the DM recalls
  it or dismisses it forever. A master's corpse raised as undead (C5b) loses its pocket: each familiar there vanishes (`why:
  'master'`, `pocket: true`) and the DM is told. `loadMap` keeps the party, so a party master's pocket goes with it; a foe
  master left behind on the old map goes with its pocket, as every creature of the old place does (review of #343, B1).
- **The master dies**: nothing happens to a familiar (Find Familiar has no `masterDies`); it stays in the pocket, and a
  dead master can't recall it. `companionsOf`, `ownerOf`, `followMasters`, `settleBonds` and the fight order read
  `state.entities` only, so a pocketed familiar is none of theirs until it is back.
- **`one: 'reform'`** (Find Familiar; SRD "One Familiar Only": "you instead cause it to adopt a new eligible form"). The cast
  names the form and type and **no space** (one named is refused: the familiar does not move); there is no cap check, since
  nothing is added. On the map the new form must fit where the familiar stands. The same creature, same id, takes the new
  form where it is, on the map or in the pocket (`reform`, resolve.js): it is made again from the new form's block, so its
  statistics are the new form's and **its Hit Points are the new form's maximum** ("the familiar has the statistics of the
  chosen form"; it takes no damage over). It keeps its place (and its place in a fight), conditions, Reaction, what it
  carries, light, look, `hidden`, hiding and whom it follows; its bond is the step's again, keeping `auto` and `order`; a
  party one is renamed for its form ("Ven's Cat"), a foe's numbered as a summon is. `reformed { id, by, form, name, pocket? }`.
  No `seq` is used.
- **`one: 'replace'`** (Find Steed: "If you already have a steed from this spell, the steed is replaced by the new one").
  The old one may be named as the new one's space (it is passed by in the space check), leaves first (`vanish`, `why:
  'replaced'`) and the new one is made as any summon. The cap counts the new one less the old.
- **A cast with no picks** (#332's path) while the master has one: nothing changes, and the DM's line says what the spell
  does to the one it has and that the cast with picks does it.
- **Replace, in order.** The old steed vanishes before the new one is made (so the new one may take its space), as a
  hand-over: the old one's `vanished` comes before the new one's `summoned` in the events (review of #343, L5).
- **The linter.** `one` is `reform` or `replace`; not on corpses; only with a `count` of one; `reform` only with `forms`.
  Find Familiar has `one: 'reform'`, Find Steed `one: 'replace'`. Both stay `assist`: telepathy and seeing through its eyes
  are the DM's; riding (C6) and Life Bond (C9) wait. `spellProfile` (effects.js) does not list `one`; the client (C8) reads it
  from the spell's step.
- **Touch delivery** (`cast { deliver: familiarId }`, casting.js; SRD: "your familiar can deliver the touch. Your familiar
  must be within 100 feet of you, and it must take a Reaction to deliver the touch when you cast the spell"). The spell has
  a range of Touch and is aimed at a creature; the familiar is the caster's (above), up, within 100 ft of the caster by the
  nearest parts of the two (`apart`, the table's square rule on squares), not Incapacitated and, in a fight, with its
  Reaction left. Its targets are reached from the familiar (the touch range and the wall check, `creatures`, from it). The
  Reaction is spent with the spell, before a Counterspell can stop it. **Outside a fight** it is checked that the familiar
  could take a Reaction but none is spent: there are no turns to give it back. **The attack roll** is the caster's (its spell
  attack bonus, conditions and senses) made from the familiar's space with the familiar's size: distance, cover and what can
  be seen are worked out from there (`atk.via`, resolve.js, `rollToHit`; neither creature counts as cover for the other).
  That is the engine's reading; the SRD says only that the familiar delivers the touch. The player who sends the cast is the
  one who would be asked, so nothing is asked. engine.js walks `deliver` as a creature field. `delivered { id, by, spell }`.
- **What players are sent.** The party's master's record is Open, `pocket` included (the party shares sheets). A foe's is
  Seen or Hidden, and `pocket` is on no Seen allow list, so a foe's pocketed familiar is in no player view. `pocketed` goes
  as `{ id, by, name }` for the party's own; for a foe's the party saw, as `vanished { id }` (what any creature that
  disappears gives them); for one they did not see, nothing. `recalled` goes whole when `by` is Open, otherwise as `spawned
  { id }` where they can see it. `reformed` and `delivered` go only when both are the party's. Twin runs
  (companions-pocket.test.js) of a hidden foe master who dismisses its hidden familiar, reforms it in the pocket and recalls
  it to the same space, against one who does nothing, give players the same events, views, record and `seq` on hexes and
  squares. Labels: "Ven dismissed Ven's Owl to a pocket dimension", "Ven dismissed Ven's Owl forever", "Ven called Ven's
  Owl back".
- **No state version bump.** `pocket` is optional and absent means none; a save without it loads and plays as before. An
  older build that loads a save with a familiar in a pocket keeps the field and cannot recall it. **A later migration that
  changes creature records must walk the records in every master's `pocket` too** (review of #343, L3).
- **An unseen familiar in a fight is refused** (review of #343, M1). In the middle of a fight, `dismiss` (to the pocket or
  forever) of a familiar in the fight's order that the party cannot see, `recall` of one that would come back into the arena
  where the party cannot see it (worked out on a copy of the creatures with it in that space), and `dismiss` of a summon
  whose lasting effect keeps any creature in the order that the party cannot see (round 3, M-2), are refused, changing nothing: "Owl 1 is out
  of the party's sight in this fight. The engine can't send it away without the players noticing a turn more or fewer, so
  it does not: do it outside the fight, or once the party can see it." Its leaving or coming back would change the turns
  players are told of (an unseen creature's turn reaches them as `{ turn, someone }`, and a recall rolls its Initiative),
  and the engine cannot keep that from them, so it refuses rather than pretend. An unseen vanish keeps a husk in the order,
  but a husk is dead and takes no turn, which would not match a living familiar either. Only the DM or the master's player
  can send these, and a party's familiar is never unseen, so the refusal tells no player anything. Unaffected: the party's
  own familiars, any familiar the party can see, one outside the arena and out of the order (a master in the fight may
  dismiss it), `dismiss` forever of one already in the pocket, and everything outside a fight. **Not changed by this PR:**
  the DM's `endEffect` of a hidden foe's summon, and its master's Concentration ending (dropped, broken by damage or a new
  spell), end an unseen summon through `settleBonds` and `vanish`, which keeps the husk as `vanishUnseen` does (C1): dead,
  in the order. A dead husk takes no turn, so players get one `{ turn, someone }` fewer a round from then on, as after an
  unseen creature's death (round 3: noted for the coordinator, not widened here).
- **The DM releases a familiar from a helpless master's pocket** (review of #343, round 3, M-1). `dismiss` with `forever`
  of a familiar in the pocket, sent by the DM, of a master that can't act (dead, at 0 Hit Points, Incapacitated), costs the
  master nothing and needs nothing of it, so the DM's `remove` of the master is never stuck. A player can't: for them it is
  the master's Magic action. A twin run of the review's case (a hiding foe master and its hiding owl in a fight with a seen goblin between them)
  gives three players the same events, views, record and `seq` with the attempt as without, on hexes and squares.
- **Left** (in DEBT): an unseen familiar can't go to or come from the pocket in a fight (above); Wild Companion's `ends: ['longRest']` (C9) is not checked for a familiar in a
  pocket (rests.js); a seen foe familiar's new form reaches players only through their view, with no event; the client has
  no Dismiss, Recall or Deliver (C8).

### C6a, riding, the first half (#346)

Stage C6 is built in two parts: C6a (this) and C6b (moving the pair under a push, a teleport and a fall; falling off;
Opportunity Attacks for the pair; Find Steed as a controlled mount with the Incapacitated rider's rules, and the
summon step's `bond.mount`). What was settled while building C6a, where Decision 8 left room (SRD 5.2.1 2099-2133):

- **State.** A rider: `riding: { on: mountId, controlled: true | false, size }`; its mount: `rider: riderId`; one rider
  per mount, a rider is never a mount and a mount never rides. `size` is the mount's size, copied onto the ride so that
  `space.js` can give the rider the mount's footprint without the game state; it is kept in step with the mount after
  every action (`settleRiders`, resolve.js, run from `settleBonds`). The rider's position is the mount's anchor.
- **Space.** `shapeOf` (space.js) gives a rider the mount's shape, so `footprint`, `overlapAt` and `apartAt` measure a
  rider by the whole mount on hexes (a Large mount: 3 hexes) and on squares (2 by 2): reach, range, areas and the
  overlap check, with no caller changed. The rider's own `size` (`sizeOf`) is unchanged: its height, what it can
  grapple. Two creatures share a space only through riding: everything else still sees both as occupying it, so nothing
  can be spawned, summoned, teleported or walked into the pair's space. `moveOptions` and `walk` leave the other of the
  pair out of the way (`partnerOf`, world.js). **Not built:** the rider's raised height and eye (Decision 8: "its height
  is the mount's height plus its own"; sight and cover look from the rider's own `pos.z`, the mount's floor). That is
  `vision.js` and sight; it goes to C6b.
- **`mount { actor, mount }`.** Checked before anything changes, in this order: the `mount` id (a player naming a creature
  the party does not know of, or one that is nothing, is told "No such creature."; engine.js does not walk `mount`, so
  the handler does), not itself, neither already riding or ridden, both up and the rider not Prone, the rider's turn in
  a fight, a Speed above 0, the mount at least one size larger, the pair known to the party together (below), willing
  (to a player: on the rider's side, and trained or the rider's steed; the DM may mount any pair, judging willingness and
  anatomy), within 5 ft (`apart`, the nearest parts, by the table's square rule on squares), no wall between, both in
  the fight or both out of it, and in a fight not mounted already this turn and with half the rider's Speed (rounded
  down to 5 ft, as standing up) left. The rider stops following anyone, a mount following its rider stops; then
  `mounted { id, mount, controlled }`, and the rider's move into the space springs traps and zones as a step does.
- **Controlled or independent.** Controlled when the mount is on the rider's side and trained (`mount: 'trained'` on its
  pack monster: the eight SRD mounts, nothing else; the linter refuses it on any other monster) or the rider's steed
  (`bond.mount: 'controlled'`, which no step can set until C6b); otherwise independent. A mount of another side is
  never controlled: it "lets you ride but ignores your control", and its numbers (`budget.mount`) would otherwise go to
  the rider's player.
- **Once a turn.** "During your move, you can mount a creature ... or dismount": in a fight a creature mounts at most once
  a turn and dismounts at most once a turn (`enc.flags` `mounted:<id>`, `dismounted:<id>`). So a mount's movement and
  action, which "can move and act even on the turn that you mount it", come at most once a turn: getting down and up
  again to have them twice is refused. Getting down from one mount and onto another is allowed.
- **A controlled mount's turn is its rider's.** Its order entry stays where it is, and `advanceTurn` passes it by while
  it is ridden (`riddenNow`), so it gets no `turn` of its own. At the start of its rider's turn its own turn starts too
  (`mountTurnStarts`: what ends at the start of its turn ends, a zone it starts in works on it, its Reaction comes back,
  a recharge) and the turn's budget gains `mount: { move, action, dashes }` (its Speed and one action, none if it is
  Incapacitated); at its rider's turn end its Disengage ends and what ends at the end of its turn ends. Mounted in the
  middle of the rider's turn, it gets `budget.mount` then ("can move and act even on the turn that you mount it"), but
  only if it has not had its turn this round: see fix round 1, M1.
- **What a controlled mount may be sent.** Checked in `control` (shared.js), as the command lock is: `move`, `dash` and
  `disengage` (and what is set about it or answered for it: `reactions`, `companion`, `react`, `stepAway`, `stepBack`);
  anything else, its attack and its actions included, is "A controlled mount can only Dash, Disengage or Dodge.".
  The rider's player may send its `move`, `dash`, `disengage` and `dodge` though the mount is not theirs; its Reactions
  and instructions stay its own controller's (a warhorse of the DM's: the DM's). Its Dash, Disengage and Dodge
  (`mountAct`, resolve.js; `dodge` in attacks.js calls it for a mount) spend `budget.mount.action`, never the rider's
  action and never as a Bonus Action; its Dodge lasts until the start of its rider's next turn (`mountTurnStarts`).
- **Moving.** `move` with the rider as actor moves its controlled mount; `move` with the mount as actor the same. In a
  fight only on the rider's turn, from `budget.mount` (`turnBudget`, shared.js, read by `moveOptions` and `walk`), by the
  mount's speeds and costs; the rider's own movement is left for dismounting. `dash`, `disengage` and `dodge` with the mount as
  actor spend its action (not as a Bonus Action). The rider of an independent mount can't move it ("goes where it
  likes: dismount to move on foot"); the mount moves on its own turn and carries the rider. **Plain walking together is
  built** (the issue allowed it): leaving it out would leave every ridden pair unable to move. A walking mount carries
  its rider step by step (`carry`, world.js; a `moved` for each of the two), traps and zones go off for either (a zone
  the rider enters stops the walk as one the mount enters does), a fight joined on the way takes both in, and the
  column brings up a ridden mount with its rider (`catchUp`). A rider follows no one (`follow` refused, `partyFollow`
  leaves it out) and a mount can't follow its own rider; a ridden mount may follow another, carrying its rider. Outside
  a fight the pair walks at the mount's pace. **Opportunity Attacks for the pair are C6b:** the mount's are made as
  always; when the rider is carried (or gets down) out of a foe's reach, the DM is told (`manual`, the DM's) that an
  Opportunity Attack against the rider is theirs to make.
- **`dismount { actor, to? }`.** The rider's turn in a fight, not dismounted already this turn, half its Speed; `to` is a
  space it can stand in within 5 ft of any part of the mount, no wall between, within a step of the mount's height, in
  the arena when fighting, not the mount's own space, and unoccupied; without `to`, the nearest such space (fixed order,
  so it replays). A space held by a creature the party does not know of: see fix round 1, B1. `dismounted { id, mount, at }`; traps and
  zones go off where it lands.
- **The mount's place after.** A controlled mount whose rider gets down in a fight goes straight behind its rider (and
  the rider's `after` companions), on the rider's count ("The Initiative of a controlled mount changes to match yours
  when you mount it"), unless its bond ties it to its master (`after` or `before`: then the bond keeps its place, A1).
  If the rider's turn has come this round, the mount has had its turn on it and takes no other this round (`enc.rode`,
  cleared at the next round's start). Nobody else's place moves. A test plays a mount and a dismount across three
  rounds on both grids and counts `turn` events: every creature one a round, the ridden horse none.
- **A1.** While a steed is ridden its master's before or after choice waits: `takeUpOrders` leaves its `orderNext` and
  `followMasters` leaves its entry; both take effect at the first round's start after it is ridden no more.
- **Pairs kept whole** (`settleRiders`, after every action; and see fix round 1, M2, for a downed rider). A rider whose mount is gone (vanished, removed) or dead, or
  that no longer stands on its mount's anchor (one of the two was pushed, teleported, fell, or set down by the DM: the
  pair is not moved together under those until C6b), is down from it where it stands: `dismounted { why: 'gone' |
  'apart' }`, and for `apart` the DM is told that staying on (DC 10 Dexterity) or falling Prone is theirs to set. A
  rider or mount that becomes Prone while riding: the DM is told once (`riding.told`, cleared when neither is Prone) of
  the DC 10 Dexterity save against falling off. A rider is held up by a mount that is aloft (`aloft`, world.js), so a
  flying mount's rider does not fall.
- **Known together** (Decision 10: riding is plain to see). A pair the party knows of only half of can't be made: the DM
  is told "The party knows of only one of X and Y: reveal or hide both before one rides the other.". Once made, either
  can still come to be unknown alone (the DM hides one, a rider Hides, sight differs): the view then sends the ride of
  neither (below), but players still see a seen controlled mount take no turns of its own and move on a turn they cannot
  see. This is what a table would see (a horse whose rider is invisible), and it is not a twin of "no rider"; see DEBT.
- **What players are sent.** A seen record gains `riding: { on }` and `rider` only where the other is not hidden; an open
  (party) record is sent whole but `riding` or `rider` is dropped, not scrubbed to 'someone', when the other is hidden.
  `mounted { id, mount, controlled? }` (`controlled` for the party's own rider) and `dismounted { id, mount, at, why? }`
  only where both are known. `budget.mount` goes with the budget, which players get only on an open creature's turn; a
  controlled mount is always on its rider's side. `enc.rode` and the flags that name a hidden creature are not sent.
  Twin runs (riding.test.js) on hexes and squares: a hidden goblin mounting a hidden wolf, riding it and getting down
  gives players the same events and view as a table where neither exists; a player naming a hidden mount gets "No such
  creature." as for an id that is nothing.
- **No state version bump** (agreed with the lead). Every new field is optional and absent means none, so a save from
  before loads and plays as before (tested). An older build that loads a save with riders reads them as two creatures
  in one space. `migrate` drops a pair that is
  not whole (both halves), fills a missing `riding.size`, and drops a malformed `budget.mount` or `enc.rode`.
- **Labels.** `describeStep` (history.js): "Brenna mounted Warhorse", "Brenna dismounted"; the mount is among the
  creatures a label must know of before players are shown it.
- **Fix round 1 (review of #350).** Rules that are new, not repairs, are marked **new rule**.
  - **B1, where a rider gets down** (repair, by hidden-information.md section 5). A party rider chooses its landing by
    what the party knows: a space held only by a creature the party does not know of counts as free, so the default
    landing is the same with or without it. If the space chosen (by default, or named in `to`) holds such a creature,
    the rider is beside it already (its space is the mount's). As for a move onto a hidden creature's space when beside
    it, there is no dismount and the creature is found (`revealed`, `unhidden`); nothing is spent. A non-party rider
    (the DM's) lands by the true state. The earlier fallback to the nearest free space is gone. Twin runs on both grids.
  - **M1, one turn's worth a round per mount** (**new rule**, confirmed by the owner's decision of 15 November: a mount
    gets one turn's worth a round, and mounted after it has used it, it gives its new rider nothing until the next round.
    This is deliberately stricter than the SRD's "A controlled mount can move and act even on the turn that you mount
    it" (2120-2121). The SRD's reading is one constant away: `MOUNT_ONCE_A_ROUND` in resolve.js, read by
    `mountTurnBudget`, both behaviours tested). A
    mount that has had its turn this round gets nothing more this round, however many riders it has. That covers its own
    turn (its place is behind the turn going on, which settleOrder keeps true) and a rider's turn (`enc.rode`, now set
    whenever it gets `budget.mount`, and on a ridden mount's own turn). Mounted after that, it carries its rider with
    `budget.mount` all 0, and the rider is told (`note`; the DM's `manual` for a foe). A stress loop with three riders
    checks it on both grids.
  - **M2 and L1, a rider that can't direct its mount** (**new rule**). A controlled mount whose rider is at 0 Hit Points
    or Incapacitated is steered by no one (`steering` is null). It acts as an independent mount, on its own turn,
    carrying its rider, until the rider can direct it again; its turn's worth for the round still holds (M1). The DM's
    `dismount` takes down a rider who is down, Incapacitated or at Speed 0, at no cost, on any turn (`dismounted { why:
    'dm' }`); a player is refused, and told the DM can. The SRD has no rule for an Unconscious rider beyond "if you're
    knocked Prone" (2132-2133, the DC 10 save, C6b): Unconscious includes Prone, so the existing `manual` hand-off to
    the DM stays.
  - **M3, a commanded creature as a mount** (**new rule**). A creature that takes commands (`orders: 'command'`) is
    never a controlled mount: mounting it makes an independent ride, and one bonded so while ridden stops being steered.
    It obeys its master's commands (Decision 6), not a rider's. Refusing the mount was the other choice; this keeps a DM's
    zombie horse rideable without lifting its lock.
  - **L3, not changed.** An Opportunity Attack against the rider after its mount Disengaged is still handed to the DM.
    Decision 8 gives each of the two "its own Disengage" (the mount's covers the mount).
  - **L4, a Prone mount stands** (repair). At the start of its rider's turn it stands up for half its Speed, out of
    `budget.mount`, as `beginTurn` does for any creature.
  - **To DEBT:** L2 (a stepped-away rider takes its mount's turns with it: W14) and L5 (the growth refusal text and its
    wider reach: W13).
- **Fix round 2 (re-review of #350).**
  - **M1, a mount never loses its turn** (repair). Invariant, tested by the re-review's stress recipe (three warhorses,
    four riders mounting, dismounting, dashing and moving them, the DM harming, stunning, mending and freeing riders at
    random, 2,400 rounds on each grid): every mount has exactly one turn's worth each round, never none, never two. A
    mount's place is passed by only if it has had its worth this round (`enc.rode`, set when it gets `budget.mount`
    and on a ridden mount's own turn) or its steering rider's turn is still to come. If its rider's place comes round
    while the rider can't steer (down, Incapacitated) and the mount's own place has gone by waiting for it, the mount is
    seated straight behind its rider (`mountOwed`) and takes its own turn. If the rider recovers after its own place,
    the mount's place, still to come, is not passed by. A DM's free `dismount` no longer marks the mount as having had
    its turn; one that has not had it is seated behind the creature whose turn it is (`dismountOrder`). On its own turn
    a steered mount moves from its own budget (`turnBudget`), and may `endTurn`.
  - **L2, a Prone mount in its rider's turn** (repair). `stand` with the mount as actor, by the rider's player or the
    DM, costs half its Speed from `budget.mount`.
  - **L3, a ride that becomes commanded** (repair). Bonded to take commands while ridden, the ride turns independent
    (`riding.controlled: false`) and its `budget.mount` goes.
  - **L1** (DEBT S6 said the opposite of the code) is corrected; **L4** (the away mode) is W14.
- **For the client job (C8, C10).** Actions: `mount { actor, mount }`, `dismount { actor, to? }`; `move`, `dash`,
  `disengage` and `dodge` with the mount as actor (or `move` with the rider). Fields: `riding.on`, `riding.controlled`, `rider`;
  `encounter.budget.mount` (`move`, `action`, `dashes`) on the rider's turn. A ridden controlled mount's order entry is
  passed by: draw it with its rider. A rider stands on its mount's anchor and fills its footprint; draw it on top.

### C6b, riding, the second half (#362)

What was settled while building C6b. Every rule is from `reference/srd52/srd52-flow.txt`; rules that go beyond the SRD
are marked **new rule**.

- **Falling off** (SRD 5.2.1 2126-2133): "If an effect is about to move your mount against its will while you're on
  it, you must succeed on a DC 10 Dexterity saving throw or fall off, landing with the Prone condition in an unoccupied
  space within 5 feet of the mount. While mounted, you must make the same save if you're knocked Prone or the mount
  is." `RIDE_DC = 10` (resolve.js). The save is a `save { against: 'Falling Off' }` event. A failure: `dismounted
  { fell: true, why }` and the Prone condition, in the space `riderLanding` (world.js) picks.
  - *Knocked Prone* (rider or mount): `settleRide`, after every action, saves once per Prone (`riding.told`, kept until
    neither is Prone). A rider dropped to 0 Hit Points is Unconscious and Prone, and Unconscious fails Dexterity saves,
    so it falls off: the C6a hand-off for a downed rider (fix round 1, M2) is now the SRD's own rule. Getting onto a
    mount that is Prone already is not being knocked Prone while mounted: no save for that Prone.
  - *Pushed or pulled* (`push`, resolve.js): the save is made once the first step is found ("about to move"). On a
    success the pair moves together (`moved { forced }` for both, the same path); on a failure the rider lands beside
    where the mount stood and the mount goes on alone. A push of the rider itself has no SRD rule (it is not the mount
    that is moved): it is not moved and the DM is told (DEBT W15).
  - *No space to land in*: the rider stays on and the DM is told; never a made-up space.
  - *The SRD has no Reaction to land on one's feet* (that was the 2014 rule): the issue asked for one, it is not in
    5.2.1, so it is not built (DEBT W17).
- **Where it lands** (`riderLanding`, world.js, shared with `dismount`): the nearest space within 5 ft of any part of
  the mount, by the rider's own size, on ground within a step, in the arena in a fight, chosen by what the rider's side
  knows (hidden-information.md, section 5). A space held by a creature the party did not know of: the rider finds it
  (`revealed`, and `unhidden { why: 'found' }` for one that took the Hide action), as a move onto it does, and the next
  space is chosen with it known. Twin runs: until the reveal, players get the same view and events as in a world with
  no creature there; the reveal is the one a `move` onto that space gives.
- **Teleports** (SRD 5.2.1 34458-34461: "If you're touching another creature when you teleport, that creature doesn't
  teleport with you unless the teleportation effect says otherwise."). The engine's teleport step moves only its
  caster (effects.js), so there is no forced teleport of a mount. A rider that teleports gets down (`dismounted
  { why: 'teleport' }` where it arrives; `teleportSpot` measures it by its own size, casting.js); a mount that
  teleports leaves its rider where it was (and in the air, it falls). Fey Step ("the steed teleports, with its rider")
  stays the DM's (its data is `manual`, summons.js). A teleport `blocked` by a creature is refused before the ride ends.
- **A mount gone from under its rider** (dead, vanished, dismissed to a pocket, removed): the rider is down where it
  stands (`why: 'gone'`), and if that is in the air (a flying mount) it falls at once, as the gravity pass would
  (`drop`): `fell`, 1d6 per 10 ft, Prone. A pair set down apart by the DM (`place`): `why: 'apart'`, the DM told, a
  rider left in the air falls.
- **Size** (SRD 2101-2103: "at least one size larger"): a rider no longer smaller than its mount (one grew or shrank)
  is set down beside it on its feet (`why: 'size'`; **new rule**: the SRD says nothing of how it gets off). `overlapAt`
  (space.js) never counts the two of a pair as in each other's way (`paired`), so a push, a teleport check or a growth
  check that passes the real creature does not see its partner. DEBT W13 for the growth checks that pass a bare body.
- **Opportunity Attacks for the pair.** The mount provokes when it leaves a foe's reach with its own movement (its
  Disengage covers the pair: review of #350, L3). The rider does not: it is "moved without using your movement" (SRD
  2088-2090). The attacker has one Reaction and may make the attack against the mount or the rider (**new rule**,
  Decision 8; not in the SRD 5.2.1 text): `ask` offers `{ reaction: 'opportunity-attack' }` (the mount) and
  `{ reaction: 'opportunity-attack-rider', against }` (the rider, `OPPORTUNITY_RIDER`, movement.js); `always` attacks
  the creature that provoked, the mount; a DM's creature set to ask: the DM is told of both. The rider is offered only
  if the attacker could attack it (hostile, in reach, a clear line, seen) and, for a party attacker, the party knows of
  it: a prompt never names a hidden creature (twin run: the prompt is the one for a horse with no rider). A rider
  knocked down or Prone by the attack falls off there, and the mount walks on alone. A rider's own dismount out of
  reach is still the DM's (DEBT W19).
- **Find Steed** (26824-26853: "it functions as a controlled mount while you ride it ... If you have the Incapacitated
  condition, the steed takes its turn immediately after yours and acts independently, focusing on protecting you").
  The summon bond takes `mount: 'controlled'` (schema.js: only that value, never with `orders: 'command'`); the spell's
  data has it and stays **assist** (Life Bond, the steed protecting its rider, its look). The steed shares its
  master's count (`turn: 'after'`), so an Incapacitated rider's steed, steered by no one (C6a, fix round 1, M2), takes
  its own turn straight after its rider's; one whose place is before its master is seated behind it (`mountOwed`).
- **The rider's raised eye** (Decision 8: "its height is the mount's height plus its own"): `raised` (vision.js) lifts a
  rider by its mount's height (`riding.size`) for what the party sees and is seen by. Sight and cover for attacks are
  sight.js, outside this job (DEBT W16).
- **DEBT W12** (a hidden half of a pair): explained, not changed. **W13**: half fixed (above). **W14**: fixed: a rider
  set aside by stepping away (not by a stand-in) steers nothing, so its mount takes its own turns (`steering`).
- **One turn's worth a round** (the owner's ruling of 15 November, `MOUNT_ONCE_A_ROUND` unchanged). Two repairs the
  stress loop found: a trained animal or steed that takes its own turn unridden marks the round (`enc.rode`), so mounted
  and then put off its rider the same round it is not seated for a second turn; and a mount whose rider falls off
  during the mount's own turn keeps its place (`dismountOrder`), so nobody between is passed by. Tested by
  riding-c6b-stress.test.js: 2,400 rounds on each grid with pushes, Misty Step, Prone riders and mounts, mounts killed
  and removed, the DM's harm, stuns, mends and step-aways: every creature up and in the fight all round has exactly
  one turn's worth, and nobody ever overlaps anyone but its own rider or mount.
- **State.** No new field and no version bump: `riding.told` (C6a) now means "this Prone was saved against". A save
  from main (C6a) loads unchanged and plays (fixture `test/fixtures/c6a-riding-saves.json`).
- **Changed in fix round 1 (review of #363).**
  - *M1* (repair): two creatures share cells only while `riding`/`rider` hold and they stand on one anchor:
    `overlapAt` skips a pair only then. The DM's `place` of one half onto another cell of the other is refused as
    occupied, as on main; placed clear of it, the ride ends (`apart`) with no overlap. The stress loop has `place`.
  - *M2* (repair): the push of a mount whose rider fails the save is worked out with the rider out of the way, then the
    rider lands within 5 ft of where the mount stood, in a space the mount did not go to (`riderLanding`'s `from`). The
    fall never shortens the push. With nowhere to land it stays on and is carried. Events: `save`, the mount's
    `moved`, then `dismounted { fell }`.
  - *M3* (repair): a rider that falls off in the air (no ground within 5 ft) comes off where it is and falls, with the
    fall's damage and Prone by the gravity pass's rules, as from a flying mount that vanishes.
  - *L1*: a dead rider's body comes down with the action that killed it (no damage, as gravity treats a body).
  - *L2* (repair): `riding.told` says which knock-downs were saved against (`'r'`, `'m'`, `'rm'`; `true` from older
    saves means both), so the mount Prone and then the rider Prone are two saves. A rider no longer smaller than its
    mount with nowhere to go is marked `riding.cramped` (told once).
  - *L7*: Decision 8's text above now says what was built (the mount provokes; no forced teleport).
  - Tests: M1, M2 (every wizard cell and aim, including the reviewer's hex recipe), M3, L1, L2, a hidden Opportunity
    Attacker (twin run), and the raised eye on hexes.
- **For the client job (C8, C10).** New: `dismounted.fell` and `why` `prone`, `pushed`, `pulled`, `teleport`, `size`;
  `save { against: 'Falling Off' }`; `moved { forced }` for both of a pushed pair; an Opportunity Attack prompt may have
  a second option `{ reaction: 'opportunity-attack-rider', name, against }`, answered with `react { take }` as any.

### C7, the companion brain (#366)

What was settled while building C7, where Decision 9 left room. Every rule is from `reference/srd52/srd52-flow.txt`;
what goes beyond the SRD is marked **new rule** (the brain's choices are a stand-in for the DM's, so most of them are).

- **The SRD lines it plays.** Animate Dead (24057-24062) and Create Undead (25686-25690): "If you issue no commands, the
  creature takes the Dodge action and moves only to avoid harm. Once given an order, the creature continues to follow it
  until its task is complete." Animate Objects (24101-24103): "If you issue no commands, the creature takes the Dodge
  action and moves only to avoid harm." Summon Dragon (31262-31266) and Giant Insect (27436-27440): "It obeys your verbal
  commands (no action required by you). If you don't issue any, it takes the Dodge action and uses its movement to avoid
  danger." Find Familiar (26789-26790): "Your familiar acts independently of you, but it obeys your commands." Find Steed
  (26844-26846): "If you have the Incapacitated condition, the steed takes its turn immediately after yours and acts
  independently, focusing on protecting you." Mounted Combat (2122-2124): "an independent mount ... retains its place in
  the Initiative order and moves and acts as it likes." Incapacitated (33653-33656): "You can't take any action, Bonus
  Action, or Reaction. ... Speechless. You can't speak."
- **Where it is.** `ai.js`: `brainMode(s, e, opts)`, `autoPlays(s, id, opts)`, `companionStep(s, id, opts)`. `aiStep`
  hands any creature with a `bond` to `companionStep` before anything else; for a creature with no bond nothing changed
  (proved by `companions-brain-replay.test.js`: seven fights on the hex valley, the square valley and the square room,
  every creature played by `aiStep`, recorded on main before C7, choose the same actions byte for byte and end in the same
  state). The brain reads the state and returns an ordinary action; the DM's auto-play sends it through `apply()`. It
  rolls nothing and never changes the state. ai.js imports `commandedNow` and `steering` from `engine/shared.js`
  directly (engine.js does not re-export them and was not in this job's files), as reactions.js and scenes.js import
  `ownerOf`.
- **Who plays a companion's turn** (`brainMode`):
  - `orders: 'command'`: commanded for this turn, its player's (`'player'`), or the DM's by hand when the master has no
    player or its player is offline or stepped away (`'dm'`: nobody else knows what was meant); with a standing order
    (`bond.standing`), the DM's by hand (`'dm'`; Decision 9: "the brain does not guess an order"; the issue's "follows
    it" is read as Decision 9 has it, DEBT W21); with neither, `'guard'`.
  - Find Steed (`bond.source: 'find-steed'`) whose master is Incapacitated or down, and not steering it: `'protect'`.
  - Otherwise its player's, unless `bond.auto`, or no player controls it (its master is the DM's, or its player left the
    table and the server released the master), or its master's player is offline (`opts.offline(userId)`, from the
    client's lobby; the rules package knows nothing of connections) or stepped away (E20, any `how`), or its master can't
    give commands (down or Incapacitated: "Speechless"). Then a summon or animated object whose master can't speak
    (`kind` `summon` or `object`) is `'guard'` (SRD: "If you don't issue any, it takes the Dodge action"); anything else is
    `'free'`. **New rule**: offline and stepped away count as "no player controls it" (T27).
  - `autoPlays` is true for every creature with no bond (as before) and for `guard`, `protect` and `free`.
- **`guard`**: the Dodge action if it has its action, then, only while a foe it knows of is within 5 ft, a move to the
  cheapest place it can reach out of 5 ft of every foe it knows of (fix round 1, L1), never past its leash; then the end
  of its turn. It sends only `dodge`, `move` and `endTurn`, all in the
  lock's list (`UNLOCKED`, shared.js), so the DM's auto-play no longer stalls on a locked creature (review of #338, M2).
  Stepping away provokes an Opportunity Attack, as any move out of reach does (**new rule** in the sense that "avoid
  harm" is read as "get out of reach": the brain trades one attack at Disadvantage for the turns of attacks after).
- **`protect`**: an attack (its first action aimed at one creature, melee first) on a foe it knows of within 5 ft of its
  master that it can reach, the nearest to it first, then the most hurt, then by id; if it can reach none, a move to the
  place beside its master from which it reaches one (else beside her, else nearer her); then the attack; with no foe to
  attack, the Dodge action. A steed carrying its master does not move (it would only carry her about). Healing Touch and
  the other Bonus Actions are not used (they are the DM's, as C6b left them). **New rule**: what "focusing on protecting
  you" means is the brain's reading.
- **`free`**: the monster AI's play (the round-1 Hide, areas, Multiattack, approach, attack), against foes only, on what
  it knows; for `noAttack` (a familiar) no action with an attack roll and no Multiattack is offered (DEBT S6, C1), and
  with nothing else to do it guards.
- **What it knows** (hidden-information.md). A party companion acts only on the creatures the party knows of: it reads a
  copy of the state without the creatures `unknown` (vision.js) gives, so it neither steps away from a hiding goblin nor
  is kept off its cell; a move onto it is stopped and finds it by the engine's own rule. A foe's companion knows what the
  monster AI knows. A foe's companion whose master the party does not know of plays as if it had no master (no
  `protect`, no Dodge for a master who can't speak, no leash), so its choices say nothing of the master (DEBT W23). Twin
  runs (`companions-brain-hidden.test.js`, hexes and squares): a hiding goblin on the cell a party skeleton steps to, and
  far off, give every player the same events and view until the move finds it; a foe's wolf with a hidden Stunned master
  and the same wolf with no bond, and a foe's Find Steed with a hidden Stunned caster and the DM's unbonded steed, give
  every player the same events and view all fight.
- **The client** (`app.js`, `idled()`): it plays a creature when `autoPlays(S, id, { offline })` (offline from the
  lobby's members) and passes the same `offline` to `aiStep`. Nothing else in the client changed.
- **Follow-ups from the review of C6b (#363).**
  - *W13*: the growth checks in `setSize`, `editCharacter` (characters.js), `remake` (sheets.js, used by `setSheet`,
    `levelUp` and rests) and Wild Shape (features.js) test the creature itself at its new size (`{ ...e, size }`), so the
    other half of a ridden pair is never in its way (`paired`). A rider grown to its mount's size is set down beside it
    (`why: 'size'`, now reached by actions); a ridden mount that would grow into a third creature is refused as before.
    `editCharacter` and `remake` keep `riding` and `rider` on the remade record (they dropped them, which broke the ride).
  - *W16*: `sight.js` `coverOf` and `sees` (so `canSee`, attacks, spells and Opportunity Attacks) look from a rider's raised
    eye and at its raised body: the record in the state is lifted by its mount's height (`riding.size`), as vision.js
    `raised` does for the party's view. A copy (vision.js passes riders raised already) is not lifted again. Distances
    (the reach of a sense) are measured from the creature as it stands.
  - *W18*: the DM's `setHp` refuses to bring a dead creature back where a living one stands on its body ("Warhorse stands
    where Brenna's body lies: move one of them before bringing Brenna back."), changing nothing; the DM moves one first.
    The engine does not pick a place for the body to get up in.
  - *Found by the stress loop* (resolve.js, `settleBonds`): a mount that vanished in `settleBonds` (a Find Steed whose
    master died, with someone else riding it) left its rider half a pair until the next action; `settleRiders` now runs
    again in the same action when anything vanished, so the rider is down (`why: 'gone'`) at once. The same on main.
- **Tests** (all new files): `companions-brain.test.js` (the C7 row's cases on both grids), `companions-brain-hidden.test.js`
  (twin runs), `companions-brain-history.test.js` (undo, redo, replay and a save and load of a brain-played fight; saves
  from main, `fixtures/c7-companion-saves.json`, load unchanged and play on), `companions-brain-replay.test.js` (the
  monster AI byte-identical), `companions-c7-followups.test.js` (W13, W16, W18, the vanished mount), and the stress loop
  `companions-brain-stress.test.js` (hexes) and `companions-brain-stress-square.test.js` (c7-stress-kit.js): 2,400 rounds
  a grid of the DM's auto-play with a locked skeleton, a commanded zombie, a Find Steed whose master is often Stunned, an
  `auto` familiar, a DM pet, an independent brown bear and the warhorses of the C6b loop: the brain always has a step, a
  turn ends within 25 steps, nothing it sends is refused, every creature up all round has exactly one turn's worth.
- **No state version bump**: nothing in the state changed.
- **Changed in fix round 1 (review of #368).** Rules that are new, not repairs, are marked **new rule**.
  - *M1* (repair): a controlled mount its rider can steer, on its own turn (the rider recovered after the mount's place),
    is never played as a monster: the brain's new mode `'hold'` takes the Dodge action and leaves it where it stands, so
    it sends nothing the engine refuses ("A controlled mount can only Dash, Disengage or Dodge.") and never moves the
    pair. SRD Mounted Combat (2118-2121): "It moves on your turn as you direct it, and it has only three action options".
  - *M2* (repair, engine: movement.js `move`): a party creature's move (a player's own, and so the brain's) is laid out
    on what the party knows when a creature it does not know of (the `lurker` rule of `move`: hidden by the DM out of a
    fight, hiding from the mover, or unseen by the party under `los`/`light`) stands anywhere near. Where that route runs
    into one, the move stops on the last place before it where the mover can stop, and the creature is found
    (`revealed`, `unhidden { why: 'found' }`), as hidden-information.md section 5 has it for a move onto its place.
    Before, the engine laid the route out on the true state: it refused the move ("Too far") or bent it round the
    creature, which told the players something stood there. A creature the DM plays walks by the true state, as
    before. Twin runs: a lurker at each point of a companion's route, and on a player's own route, on both grids.
  - *M3* (**new rule**): a companion carrying a rider who is stepped away, offline (its player's connection) or helpless
    (down or Incapacitated) does not carry it into danger: `'hold'`, the Dodge action and no move. This is the E20 table
    rule `dodge` ("it takes the Dodge action on its turn and stays where it is") applied to the one that carries it; the
    other reading (follow the last standing instruction) has nothing to read for a free companion. `protect` already
    stayed under its master and now stays under any rider. A creature with no bond carrying such a rider is the monster
    AI's, unchanged (DEBT W24).
  - *L1* (**new rule**, the brain's reading of "moves only to avoid harm"): a never-commanded creature steps to the
    cheapest place out of 5 ft of every foe it knows of (then the farthest from them), not the farthest place; where no
    such place is in reach it stays (a step that ends beside a foe would only give it an Opportunity Attack).
  - *L2* (repair, to the SRD's words): a summon or animated object whose player is offline or stepped away has nobody to
    command it: it takes the Dodge action (`guard`), as Summon Dragon, Giant Insect ("If you don't issue any, it takes
    the Dodge action and uses its movement to avoid danger") and Animate Objects ("If you issue no commands, the creature
    takes the Dodge action and moves only to avoid harm") say. Let go to the brain (`auto`) or played by the DM (no
    player), it fights: the commands are the brain's or the DM's. Find Familiar, Find Steed and Phantom Steed have no such
    line (a familiar "acts independently"; Phantom Steed says nothing of its acts): played freely, as before.
  - *L3* (repair): a companion that drops in its own turn (an Opportunity Attack as it steps away) gets `endTurn` from the
    brain, so the auto-play does not wait on it. A creature with no bond still gets null (the monster AI is unchanged;
    W24).
  - *L8*: engine.js re-exports `commandedNow` and `steering` (one line); ai.js imports them from there.
  - Not changed, to DEBT: L4 (a rider grown past its mount, Huge on Large, can't be set down: `riderLanding` looks only
    one cell round the mount; world.js, W26), L5 and L7 (W23, W21 as they stood), L6 (setHp's refusal stays a refusal),
    L8's cover from a rider between attacker and target (W27).
  - *The stress loop* (`c7-stress-kit.js`): players go offline and come back (also mid-round), `auto` is switched on and
    off, the steed is killed or removed under its rider, the cleric starts fights on her steed and steps away on it; hard
    bounds on brain steps a turn (25), turns a round (4 a creature) and actions a run. 200 rounds a grid by default;
    2,400 with `HEXTABLE_STRESS=full` (run once each in this round: no stall, no endless turn, no refusal from the brain,
    no lost or doubled turn, no overlap; hex 1 minute, square 2 minutes 12 seconds).
- **For the client job (C8).** `autoPlays(state, id, { offline })` says whether the DM's auto-play plays a turn;
  `brainMode` says why (`player`, `dm`, `guard`, `protect`, `free`), for a line such as "Zombie 1 has an order that stands:
  the DM plays it". A companion whose turn is `'dm'` waits for the DM's hand as a party character waits for its player.
- **Follow-ups from the re-review of #368 (#372).** Rules that are new, not repairs, are marked **new rule**.
  - *N4* (to the SRD's words): the guard ("If you issue no commands, the creature takes the Dodge action and moves only to
    avoid harm", Animate Dead 24057-24059, Animate Objects 24101-24103, Create Undead 25688-25690; "uses its movement to
    avoid danger", Summon Dragon 31264-31266, Giant Insect 27438-27440) steps away only where the step is no harm. Leaving
    a foe's reach is harm: "If you move heedlessly past your foes, you put yourself in danger by provoking an Opportunity
    Attack" (Opportunity Attacks, 2085). So it steps only where no foe it knows of that it would leave or pass could make
    one: one with no melee attack, one Incapacitated, or one that can't see it (2094: "a creature that you can see");
    otherwise it Dodges and stays where it is. This replaces fix round 1's L1 reading (it traded an attack at
    Disadvantage for distance, and the foe simply followed). **New rule** in one respect: it does not read whether a
    foe's Reaction is spent, which the party is not told of a creature not its own (table-ui.md, Decision 3), so it stays
    even then (DEBT W29). Tests: `e23-guard.test.js` (the reviewer's four rounds: Dodge and stay, nothing provoked; a
    Blinded or Stunned goblin: it steps away unharmed). Three existing tests that needed a step now Blind the goblin
    beside the skeleton first (`companions-brain.test.js`, "steps away from the goblin beside it" and "L1"; `companions-brain-hidden.test.js`,
    "a party skeleton steps away on what the party knows"), and one new test there pins the stay.
  - *N1 to N3* (engine, `movement.js` `walkKnown`; hidden-information.md section 5): a party mover's move that stops short
    of a creature it does not know of brings its followers (N1); with allies on every cell before it the mover goes to
    the nearest place beside it that it can reach, or does not move if it is beside it already (N2; section 5: "The move
    stops on the nearest hex beside it"); a creature found on the way by a rule of its own (the DM's hidden one spotted
    within `ENGAGE_RANGE`) is known from then on, so the rest of the way is laid out again (N3). A creature is found only
    where the mover gets to: a walk cut short (a trap, something noticed, a fight) finds nothing. Followers (the column
    and a formation) now walk on what the party knows too; they walked by the true state, so their way bent round a
    hiding creature beside the route (found by the twin runs, DEBT W28). Tests: `e23-move-fixes.test.js` (twin runs with
    the creature on the route, beside it, on the destination and far off, hidden by the DM and hiding; allies in a line;
    followers; in a fight). One existing test assertion changed: `companions-brain-hidden.test.js`, "a hiding creature at each point of the route", expected no move
    when allies stood on every cell before the creature (N2's old outcome); it now expects the wolf beside it.

### C8, the screens (#367)

What was built in `packages/client/companions.js` (new), `companions.css` (new) and small hooks in `actionpanel.js`, `tracker.js` and `app.js`. The client decides nothing: every
button is greyed with the engine's own words, taken from `dry(action)` in app.js, which runs the action on a copy of the state the screen holds (a player's view, with
the timeline left out) and returns the refusal. A copy that cannot be run (a player's view holds no dice seed) gives no answer and the button stays open for the engine to decide
when it is pressed. One answer per state is kept until the next update.

- **The cast chooser.** A summon spell's row in Spells (and Explore rituals) opens a panel instead of arming the spell. It reads `spellProfile`'s `summon` and the step's `one`:
  a pick for each of `variants`, `types` and `forms` (a menu where there are more than six), the spell's own `choice` (Summon Dragon's Shared Resistances; the first is sent
  if none is tapped), a level when more than one slot level is left, then taps: one space for each creature (`count` worked out from the slot; a tap again takes it back; one
  more tap replaces the last), or corpses on the map for Animate Dead and Create Undead (`summon: { ids }`; any creature may be tapped and the engine's words say why not,
  so the client does not re-state the corpse rule), or no tap for Find Familiar's reform of the familiar the master has. "Cast" runs the cast through `dry` first and shows
  the refusal in the panel's toast with the picks kept; "Cast, DM adds it" sends the cast with **no `summon` key** (never `null`), and `choice` where the spell needs it, which is the
  engine's hand-off to the DM. Cancel and Escape leave at any step. A flyer's height (`z`) and the caster's `look` are not sent.
- **Companion rows**, in the Features tab (a Command row also in Bonus on a turn, the riding rows in Move): `Command…` (a picker with a box for each commandable companion, each
  greyed with its own reason, and one order field of up to 80 characters), the steed's side (`orderNext ?? order ?? 'after'`; a tap sends the other one), `Dismiss…` (a familiar: to
  its pocket or for good; another companion: `dismiss`), `Recall…` (arms a tap on the map: `recall { at }`), `Let it act…` (and the checkbox on the companion's own card),
  `Mount…`, `Dismount`, and for each familiar and each Touch spell of the master `<Spell> through <familiar>`, which arms the spell with `cast { deliver }`.
- **Mount candidates** are the living, un-hidden creatures of the rider's side that are not characters, as the view sent them; the engine says which it may ride.
- **The turn.** A companion's card says "its turn" or "commanded this turn", with its order; the tracker draws a companion under its master (outside a fight) with the tags
  "Companion of ...", "Its turn: commanded", "Order: ..." (escaped as every tag is) and "Riding ..."; a ridden mount that has no entry is drawn under its rider. `commandedTurn`
  selects that creature for its player and toasts the prompt's text.
- **Keys.** The order field is a text input, so keys.js and the tab digits stay quiet while it has the focus; the typed text survives the panel's redraws.
- **Log.** `commanded`, `companionOrder`, `pocketed`, `recalled`, `reformed`, `delivered`, `reasserted`, `mounted`, `dismounted`, `commandedTurn`, and the `lapsed`, `replaced` and
  `ended` reasons. `commanded` and `commandedTurn` may hold typed words and are `typed` in `LINE_KINDS`; the others are `engine`.
- **Not built:** the pocket on the sheet; a rider drawn on its mount (C10); a flyer's `z` for a summon; the chooser for a spell cast through an item or a feature (`via`); targeting a
  creature from horseback with an attack (W16); the highlights of a delivered touch are the caster's reach.

## Amendments of 14 November

The owner's answers of 14 November 2026 (questions 3, 4, 6 and 7 above) change four things in the engine.
**None of these is built yet**: this PR changes the spec only. Each is a small stage, to run after the
stage it touches (C2, C5, the conclusion code of C1 and C1's constant). Each follows the spec's form.

### A1, the master's before or after choice for a steed (built, #335)

- **Choice.** A per-round choice on a bonded companion: `bond.order` (`'after'` default, or `'before'`)
  and `bond.orderNext`, one action `{ type: 'companionOrder', actor, id, order }` by the master's
  controller or the DM, which only writes `orderNext` (and `order` too when no fight is going on). The
  engine copies `orderNext` to `order` **only at a round's start**, where it already settles the order;
  never in the middle of a round. The order entry gains `before: masterId` beside `after: masterId`;
  `initiativeSort` puts it straight before its master.
- **Reasons.** A mid-round switch would put a creature that has acted ahead of a master whose turn is
  now (a second turn) or behind a master who has just gone (a lost one). A ridden steed has no entry, so the
  choice waits until it is dismounted.
- **Cost.** One field pair, one action, a change to `initiativeSort`, `joinEncounter` and `followMasters`.
  The C2 safety rules apply unchanged: a join in the middle of a round uses `insertSlot` and moves
  nothing else; `followMasters` moves a companion only when that is safe in the middle of the round. A
  twin-run hidden-information check: two runs of the same fight that differ only in a hidden foe's
  steed choice send the same players' view (`before` is kept on an entry only when both it and its master are
  Open, as `after` is). Tests: a choice mid-round changes nothing until the next round; before and after
  give no double or lost turn across a full fight with ties and joins.

#### Build notes: A1

- **The action.** `{ type: 'companionOrder', actor: masterId, id, order: 'after' | 'before' }` (companions.js), by the
  master's controller or the DM. Refused, changing nothing: an `order` other than those two, an `id` that is not bonded,
  one bonded to another master, one whose bond has `turn: 'own'` (it rolls its own count, so there is no master's count
  to act beside; the engine keeps no choice it would not play), and a player who does not control the master. To a
  player an `id` the party does not know of is answered "No such creature." as an id that is nothing (engine.js walks
  `actor` and the other creature fields; `id` is checked in the handler, and `order` is not taken for creature ids in
  this action). Event `companionOrder { id, by, order, next? }`, sent to players only when both are Open.
- **Where it is kept.** Outside a fight it is `bond.order` at once (and any `orderNext` goes). In a fight it is
  `bond.orderNext`; choosing what this round already has deletes `orderNext`, so nothing waits. Absent `order` is
  `after`; absent or null `orderNext` is nothing waiting. `takeUpOrders` (resolve.js) copies `orderNext` to `order` for
  every bond, in the fight or not, at a round's start (`newRound`) and at a fight's start (`startEncounter`, the start
  of round 1), and nowhere else.
- **The order.** An entry carries `after: masterId` or `before: masterId`, never both (`tieOf` in world.js reads
  either). `initiativeSort` puts a `before` entry straight before its master, behind the master's earlier `before`
  companions; `insertSlot` does the same for a `before` slot and puts any other creature that outranks the master
  before the master's whole group, so a group is never split. A creature taken back in after a `before` companion
  (`settleOrder`) is seated behind that master's whole group.
- **Changing sides.** `followMasters` changes an entry's side only with `now` false (a round's start) and only where
  the party knows of both (`placeable`), as a new place is: a seen steed moving round its master's unseen turn would
  tell players they belong together. Until then the entry keeps the side it has; its bond already has the choice. A new
  place in the middle of a round (a join, a bond, a master coming to be known) is taken on the side `bond.order` says
  this round, under the C2 rules unchanged (`insertSlot`, nothing else moves, only when no turn is gained or lost).
  `newRound` runs `followMasters` once more after it gives back places moved for one round (E20), so a companion whose
  master was set aside last round changes sides or takes its place at this round's start, not a round later.
- **A join in the middle of a round on `before`.** It is put straight before its master. If the master's turn is going
  on or past, that place is past too, and the companion acts from the next round, as any creature joining on a count
  already passed. A steed made by a casting has a new bond, so `after`, and acts straight after its master as before.
- **The second `followMasters` in `newRound`** (review of #335, M2). It is kept: without it a choice for a companion whose
  master was set aside the round before (E20, `end`) would not take effect at the next round's start but a round later,
  or never for a master set aside every round, since the first call runs before those places are given back. It also
  changes a C2 case: a companion that could not take its master's count while the master was set aside (a hiding master
  set aside to the end, then revealed) takes it at the next round's start, not never. Nobody has had a turn in the round
  then, so every creature still acts once: the master, set aside again at its turn, acts last and its companion on its
  count. Both cases are pinned in companions-order.test.js.
- **Exactly what is written, and when** (review of #335, L2; for C8). Outside a fight the action writes `bond.order` and
  deletes `bond.orderNext`. In a fight it writes `bond.orderNext`, or deletes it when the choice is what `bond.order`
  already says. `orderNext` is taken up only at a round's or a fight's start: a choice made in a fight that then ends
  stays in `orderNext`, and `bond.order` shows the old side, until the next fight starts. A client showing the choice
  outside a fight should show `orderNext ?? order ?? 'after'`.
- **Refusals to players** (review of #335, M1). A player is told "X is not Brenna's companion." for any creature it knows
  of that is not that master's companion, bonded to another or to no one, so a foe's bond is never told; a creature it
  does not know of, or an id that is no creature's own record (`constructor`), is "No such creature.". The DM is told
  which.
- **A freed companion** that stood before its master keeps its place (C2), so it can stand between the master's other
  `before` companions and the master: a group stands together only as long as its entries are tied (review of #335, L3).
- **Riding** (C6) is not built: a ridden steed will have no entry, and its choice waits in its bond.
- **What players are sent.** `before` only on an Open entry whose master is Open (the order, `encounterStart`,
  `joined`), as `after`. A foe's choice is never told; twin runs (companions-order.test.js) of a fight that differ only
  in a hidden foe's steed choice give players the same events, view, record and `seq`.
- **No state version bump:** `bond.order`, `bond.orderNext` and an entry's `before` are optional; a save or record
  without them plays as `after`, unchanged (C2's rule).

### A2, a Bonus Action command puts the turn in the player's hands (built, #338)

- **Choice.** In `command` (C5), a command spends the Bonus Action and sets `bond.commanded` for that turn;
  `ownerOf` for that creature's turn is its master's player when `commanded` is set and the DM's
  otherwise (a standing order, or none: Decision 6). `bond.standing` keeps the last order. A prompt
  to the player at the start of the commanded creature's turn: "Brenna's zombie is yours this turn."
  This is an action (`command` gains `standing`/clear) and a prompt, and **client work** (C8: the prompt,
  the player's bar for that creature, the DM's auto-play skipping it).
- **Reasons.** The SRD puts the choice of action and move in the commander's hands for a commanded turn,
  and leaves an order that stands to carry on by itself.
- **Cost.** A control rule that depends on the turn, not only on the bond, in `ownerOf`'s callers;
  tests that a never-commanded Zombie is the DM's and may only Dodge and move, one commanded this turn is its
  player's and refused for another player, and one with only a standing order is the DM's.

#### Build notes: C5a, the command and who plays a commanded creature (A2; #338)

Stage C5 is built in three parts: C5a (this), C5b (corpses: `on: 'corpse'`, Animate Dead, Create Undead, the 24-hour bond
and reassert) and C5c (`dismiss` and `recall` with the pocket, `one: 'reform'` and `'replace'`, touch delivery through the
familiar's Reaction). What was settled while building C5a, where Decision 6 and A2 left room:

- **The action.** `{ type: 'command', actor: masterId, ids: [...], order? }` (companions.js), by the master's controller or
  the DM. `ids`: one to 30 (`BOND_MAX`) different ids. Each must be the master's companion, with `orders: 'command'`, not
  dead, and within `bond.range` feet of the master (a finite number of 0 or more; none is any distance, and anything else,
  `NaN`, a string, is refused, never taken as none: review of #338, L6) (`apart`, so by the table's square rule on squares, from the nearest
  parts of the two). Checked before anything changes; a refusal changes nothing. A player is told "X is not Brenna's
  companion." for any creature it knows of that is not that master's, bonded to another or to no one, and "No such
  creature." for one it does not know of (engine.js also walks `ids`), as `companionOrder` does; the DM is told which. A
  free companion is "X takes no commands: it is played freely." Then `need(master, 'bonus')`: in a fight the master's
  turn with its Bonus Action left ("already used a Bonus Action"); outside one it costs nothing, but the master must be up
  and able to act. One command for any number costs one Bonus Action.
- **`order`.** Words, trimmed, then 1 to 80 characters (UTF-16 units) with no control characters (no newline or tab,
  U+0000 to U+001F and U+007F to U+009F), stored trimmed; or `null`; or left out (review of #338, L5). Given, it is the order that stands after this
  turn (`bond.standing`); `null` clears it, so the creature Dodges again after the commanded turn; left out, the standing
  order is unchanged and the command is for the one turn (the SRD's "you decide what action the creature will take and
  where it will move on its next turn"). engine.js does not take `order` for creature ids in this action (one line in
  `dispatch`, beside `companionOrder`'s): an order that happens to be a creature's id is words, so it is neither refused
  nor a way to test for a hidden creature.
- **What it writes.** `bond.commanded = { order, at }`, `at` the turn it was given in (`turnKey`, the master's) or `null`
  outside the fight; `bond.standing` as above. Event `commanded { by, ids, order? }`.
- **Taken up at the creature's turn.** At the start of a commanded creature's next turn (`beginTurn`, resolve.js,
  `takeCommand`) the command is stamped with that turn (`commanded.turn`, its `turnKey`). For that turn `ownerOf` gives the
  master's player. **When it is cleared:** at the start of the creature's next turn after that (spent), or at the start of
  its first turn when `at` is not of this fight (given in another fight or outside one), so a command never carries into a
  later fight. A command given outside a fight (`at: null`) does not expire on its own: it lifts the lock outside the
  fight until the creature's first turn in a fight clears it, and it never makes that turn its player's (review of #338,
  L4). Decision 6 says "cleared when that creature's turn ends"; the turn's end is not in this stage's files
  (`finishTurn`), so a spent command stays on the bond until the next turn start, and `ownerOf` reads it only during the
  turn it was stamped for: what plays the creature is the same either way.
- **Who plays it (`ownerOf`, shared.js).** For a creature with `orders: 'command'` in the fight going on: its master's
  player on the turn it was commanded for (`commandedNow`), the DM's on every other turn **and off its turns** (so a
  Reaction question goes to the DM, and its reaction instructions are the DM's to set in a fight). Outside the fight going
  on (no fight, or not in its order) it is its master's player's, as any companion (Decision 6: outside a fight a
  companion moves as any party member), under the lock below.
- **The lock.** Checked in `control` (shared.js), which every handler of a creature's own actions calls: for a creature
  with `orders: 'command'` and no standing order, in the fight and not commanded for this turn, or outside the fight and
  not commanded there (`at: null`), every action is refused, by the DM too ("X has no command to follow, so it only takes
  the Dodge action and moves to avoid harm."), but `move`, `dodge`, `endTurn`, `stand` and `follow` (with `leader: null`
  to stop: moving, as Decision 6 lets a companion follow its master outside a fight), and what is set about it or answered
  for it rather than done by it: `reactions`, `companion`, `react`, `stepAway`, `stepBack`. **This is wider than Decision
  6's one line ("only `dodge`, `move` and `endTurn`")**, which named what the creature does on its turn; `stand` and
  `follow` are ways of moving, and the rest are its controller's settings and answers (review of #338, M1 and L1). Only the
  acting creature is locked (`actor`): a locked creature named as the leader of `partyFollow` or `formation` is not acting,
  and is not refused by the lock (L2; checked in `control`, which those handlers call on the leader). It reads the type of
  the action `apply` is running (`RUN.action`), since the handlers are in files this stage does not touch; it lives in
  `control` and not in attacks.js for that reason (the issue named attacks.js for it). Whether a move "avoids harm" is the
  DM's. A creature with a standing order is played by the DM as it sees fit: the lock is off.
- **The prompt.** In the turn's events, straight after `turn`: `commandedTurn { id, by, to, order?, text }`, text
  "Brenna's Zombie 1 is yours this turn." (the creature's name, with the master's in front unless it already starts with
  it). Only when the master has a player (`to`); a DM-played master's or a foe's commanded turn gives none. Sent to that
  player alone, without `to`. Showing it is C8.
- **What players are sent.** `commanded` only when the master and every id are Open (the party's own); never a foe's, which
  is mental. A foe companion's record is Seen or Hidden and `bond` is not on the Seen allow list (C1), so neither
  `commanded` nor `standing` reaches players. Twin runs (companions-command.test.js) of a fight that differ only in a hiding
  foe master's commands give players the same events, view, record and `seq`, on hexes and squares.
- **The DM's bond** now takes `orders: 'command'` (C1 refused it until the engine ran commands; one assertion of
  companions.test.js changed for it). It takes no `range`: the DM's commanded creature is commanded at any distance. The
  source's range comes from the summon step's `bond.range` in C5b (the linter still refuses `orders: 'command'` and a
  range in a step until then). *Since C5b (#341) it takes them.*
- **The Unseen Servant's 15 ft is not built.** It needs `turn: 'none'` (a creature with no entry of its own, moved on its
  master's turn: `move` with the servant as actor from a `budget.servant` the command fills), which is movement.js and the
  fight order, not in this stage's files, and the servant has no block yet (C4 left it manual). What is left for it: the
  DM's bond and the step to take `turn: 'none'`, `budget.servant` in `command` and `move`, and its block.
- **For the client job (C8).** The order's words are stored on the bond (`commanded.order`, `standing`) and sent to the
  party in the record, `commanded` and `commandedTurn`: other players' text, so the UI shows it as text, escaped, never as
  markup, though the engine already refuses control characters and newlines. The DM's auto-play (`idled()`, app.js) does
  not yet skip or play a locked creature: on its turn the auto-play's monster moves are refused by the lock and the turn
  waits until the DM ends it, until the companion brain (C7) plays it (review of #338, M2).
- **Labels.** `describeStep` for `command`: "Brenna commanded Zombie 1", or "Brenna commanded 3 companions"; the order's
  words are not in a label.
- **No state version bump.** `bond.standing`, `bond.commanded.turn` and the events are new and optional; a bond without
  `commanded` or `standing` (a save from before) is never commanded for `orders: 'command'` and unchanged for `'free'`.

#### Build notes: C5b, corpses, Animate Dead and Create Undead (#341)

What was settled while building it, where Decisions 2 and 7 left room. **This amends the `summon` step** (CLAUDE.md: a
step's vocabulary is an engine change) with one key, `reassert`, below.

- **The step.** `{ summon: <pack monster>, on: 'corpse', count, reassert?, bond: { kind, turn, orders: 'command', range,
  at0 } }`. The linter now takes `on: 'corpse'`, a bond's `orders: 'command'` and its `range` (feet, a multiple of 5, 1 to
  5280; required with `orders: 'command'` and refused without it), and refuses on corpses `forms`, `types`, `variants` and
  `over` (there is nothing to pick but the corpses) and any bond that does not take commands. `turn: 'none'`, `one` and
  `mount` are still refused (C5c, C6), and so is a `range` on the step itself. Both spells use the pack's own Zombie and
  Ghoul as they are: no summon block was added.
- **`reassert`, the amendment.** The SRD gives the two spells different numbers for keeping control: Animate Dead
  animates one creature at level 3 but reasserts control over up to four, two more of each per slot level; Create
  Undead animates and reasserts the same three to six. The step's `count` cannot say both, and the engine may not read
  the spell's id, so the step gains `reassert`: a summon amount of creatures (a whole number, or `{ slot, base, above }`,
  linted at every level like `count`), only on corpses, `count` when left out. Animate Dead: `count: { slot: 2, base: 1,
  above: 3 }`, `reassert: { slot: 2, base: 4, above: 3 }`; Create Undead: `count: { slot: 1, base: 3, above: 6 }`.
- **What `on: 'corpse'` means** is Decision 7's, kept in the engine (`CORPSE`, resolve.js), not in data: the corpse of a
  Medium or Small Humanoid, and control for 24 hours. Both SRD spells that raise corpses say exactly that; a third that
  said otherwise would need a step key.
- **The cast.** `summon: { ids: [...] }` and nothing else. Either corpses (1 to `count` at this level: "up to" for both
  spells; Animate Dead's one corpse at level 3 is one) or living creatures the caster made with this same spell
  (`bond.to` the caster, `bond.source` the spell; 1 to `reassert`), never both ("either animates corpses or keeps ...
  under control, not both in one casting"). Each id must be a creature's own record; to a player one the party does not
  know of is "No such creature." (an unseen corpse, a hidden one, a foe's bond is never told; any creature it knows of
  that is neither is "neither a corpse nor a creature Nia made with Animate Dead"). A corpse is `dead` and not
  `vanished` (the husk an unseen vanish leaves is "gone: there is no corpse", to the DM; a player does not know of it),
  with no `remains` (dust, a frozen statue), not a player's character or a player's own creature (that record is the
  player's: the DM may `remove` it and `spawn`), and Medium or Small and Humanoid (`creatureType`, so a record's own
  `type` first). Each is within the spell's range by the nearest parts (as a spell aimed at a creature) with no wall
  between (`walled`). No sight is needed: the SRD says "within range". The cap counts the corpses to raise; a reassert
  adds none. A companion can't cast either. Both spells take a minute to cast, so neither is cast in a fight (as before).
- **A corpse rises.** Its record leaves as the DM's `remove` takes a creature (`removed { id, name, seen?, party? }`; its
  companions freed, `unbonded`; those following it stop), and what was still on it ends as for a seen vanish
  (`settleSeen`, "Bandit 1 is gone"). What it carried goes onto the pile in its cell (`leaveGear`, as a vanish leaves it:
  a pile the party could not see is marked `left`). On a fight's card not yet published, one the party saw is marked
  `gone` with the name it was shown (A3). The creature is made in the corpse's space, or the nearest unoccupied one if a
  creature stands there now (a `partial` line to the DM). It is named as a summon: "Nia's Zombie" for the party, "Zombie
  2" for a foe, counted by `tpl` as `spawn` counts, so nothing in its name says what corpse it was or whose it is. Bond:
  `{ to, kind: 'undead', source, fx, turn: 'own', orders: 'command', range, at0: 'dies', ends: [], lapse: 'foe', slot,
  commanded: null, auto: false }`; never commanded, so the C5a lock holds until its master commands it. `summoned { id,
  by, kind, fx, corpse }` (`corpse` is the DM's: view.js picks what it sends) and `effectStart`.
- **Its 24 hours.** Each creature has a lasting effect of its own, named for the spell, from its master, 24 hours, with
  one part `{ target, bond: true }` (`holds` in durations.js reads it as it reads a `summon` part). One effect per
  creature, not one per casting: the DM's `remove` ends every effect with a part on the creature removed, which would
  free every other creature of the same casting.
- **When it runs out** (`settleBonds`: the bond names an effect that no longer holds it, and `lapse: 'foe'`, a new
  optional bond field): the bond goes (`unbonded { id, from, why: 'lapsed' }`), the creature stays where it is, alive,
  and is a foe, also in the middle of a fight (the SRD gives it no say; it keeps its place in the order). The DM is told
  (`manual`, `partial`); a party master's player is told, with no numbers, that it "no longer obeys" (they would know:
  the control is their caster's own). A foe's lapse tells players nothing. One that is dead by then is only freed.
- **Reasserting** within the 24 hours: each named creature gets a new 24-hour effect and its old one ends ("Nia renewed
  it"); `reasserted { id, by, fx }`, sent to players only when both are Open. After a lapse the creature is no longer the
  caster's, so a reassert on it is refused.
- **No picks** (`a.summon === undefined`, #332's path): nothing changes but the slot; the DM is told what the casting
  could have done (how many corpses, the creature's AC, Hit Points and Speed, how many it could have reasserted) and how
  to do it by hand (`remove`, `spawn`, `bond` as undead with orders command; such a creature has no command range and no
  timed 24 hours), and the entry's tier note follows. The player's line is "Animate Dead: the DM applies it.": no number,
  and nothing that says a corpse or a creature exists. No cap check on this path: the caster may have meant to reassert.
- **What players are sent.** A foe master the party does not know of: the corpse's `removed` is never sent (as the DM's
  `remove`), the creature is `spawned { id }` where they can see it, and the effects are not theirs. Twin runs
  (companions-corpses.test.js) of a hidden foe necromancer raising a corpse the party saw die and one the DM hid, against
  the same necromancer's plain manual spell with the DM removing each corpse and spawning a Zombie in its space by hand,
  then a day passing, give players the same events, views, record and `seq`, on hexes and squares; nothing names the
  necromancer, either corpse, a master or a bond.
- **XP** (A3): a foe's raised creature killed in a fight counts with the pack monster's XP (a Zombie's 50).
- **Left to the DM**, as the spell texts say: bones and the Skeleton (no bones on the map); "only at night"; Create
  Undead's Ghasts, Wights and Mummies at levels 8 and 9; whether a creature keeps to a standing order; the Zombie's
  Undead Fortitude (the pack's trait text). The client cannot yet name corpses (C8).
- **No state version bump.** `bond.range`, `bond.lapse`, a `bond` part and the `reasserted` event are optional; a save
  without them plays as before, and a DM-bonded undead (no `fx`) never lapses. Without a bump, an older build that loads
  a save made with this one does not refuse it, and gets the raised creatures wrong: its `holds` reads only `summon`
  parts, so after the first action its `settleBonds` vanishes every raised creature as a summon whose effect ended. Such
  a save should be loaded by this build or a later one.

Settled in the review of #341:

- **A corpse still in the fight's order is refused** (M1): "Bandit 1 fell in this fight and is still in its order: it can
  be raised once the fight is over." Divine Intervention casts Animate Dead as a Magic action, so in a fight. Refusing is
  what the DM's `remove` does for a creature in the fight, and it keeps A3 right: the corpse keeps its place and counts
  toward the fight's XP. Taking it out and keeping it in `encounter.gone` was the other choice. It was not taken: `gone`
  means "the party saw it go", and an unseen corpse put there would be named on the card. Raised after the fight, a seen
  corpse's line is marked `gone` with the name it was shown, so the card still has it. A corpse that is not in the order
  (one that fell outside the arena) is not refused by this rule (not tested).
- **Names a player is told** (M2). Every refusal of `corpsesFor` names a creature as the party sees it (`seenName`: a foe
  in Wild Shape is the Beast); the DM is told its own name. The wall check is the same as `walled`, with the seen name.
- **Ids.** A sparse list (`new Array(1)`) is refused as one that names no creature (`Array.from`, so the holes are read).
- **A dead companion does not count toward the cap of 30** (one rule for every kind of bond: `roomForCompanions`,
  shared.js, used by a summon, a corpse spell and the DM's `bond`). A raised creature at 0 is dead and keeps its bond
  (`at0: 'dies'`), its 24 hours and its player. Undead Fortitude is the DM's (the Zombie's trait text), and the DM brings
  a Zombie that stands back with `setHp`: it is then exactly as before, bonded, its player's, and it obeys commands. While
  it is dead, a reassert that names it is told "is dead, so there is nothing to keep under control" (and that the DM may
  bring it back with setHp). Its 24 hours still run, and when they end its bond goes with no `manual` line (a corpse has
  nothing to obey). (A first fix freed a dead raised creature at once; re-review of #341, M-A: a revived Zombie then came
  back unbonded and uncontrolled, so it was dropped for this rule.)
- **A lapse runs `checkEnd`**, so a fight that its new foe changes is settled at once. A party creature that is not a
  character does not keep the party standing (`partyOf`), so a lapse can only keep a fight going, never end it. A mid-fight
  lapse is tested: the creature turns foe, keeps its place, and the fight goes on.
- **A DM-made NPC from a sheet** (`kind: 'npc'`, a derived record, no `type` or `tpl`) is refused as not a Humanoid: a sheet
  carries no creature type, and `creatureType` gives Humanoid only to a player's character. Such a corpse is the DM's to
  raise by hand (`remove`, `spawn`, `bond`).
- **A dead caster's creatures** stay bonded to it, and so its player's (`ownerOf`), until their 24 hours end. The SRD ends
  control only with the time: nothing in the spells ends it at the caster's death.
- **Names repeat.** A party caster's creatures are all "Nia's Zombie"; ids tell them apart, and the DM may rename them.
  (A foe's are numbered, as `spawn` numbers them.)

### A3, XP for a foe's summons (built, #329)

- **Choice.** `counts` in a fight's conclusion (`rewards.js`) is no longer `false` for a bonded foe
  (`counts: !up(e)` only): a summon is listed and counted like any foe, with the pack's `xp` (0 for a
  summon block stays 0); the DM may untick any. The seen and unseen husk difference goes: a husk counts as
  any unseen death does and a seen vanished one counts too.
- **Reasons.** The owner's answer; a foe's summons are foes. It removes the L3 difference noted in the
  review of #317.
- **Cost.** One expression in `rewards.js`, the tests that pin `counts: false`, and the notes in C1 and C2. *As built: also
  `encounter.gone` (resolve.js, `vanish`) and the `seen` and `shown` rule in `publish` for a foe whose record is gone; see the build notes.*

### A4, the cap (built, #329)

- **Choice.** `BOND_MAX` (`engine/companions.js`) becomes 30.
- **Reasons.** The SRD limits in Decision 1.
- **Cost.** One constant and the test that pins 20.

### Build notes: A3 and A4 (#329)

- **A3, the rule.** In `concludeFight` (`rewards.js`) every foe of the fight counts unless it is still up:
  `counts: !up(e)`, bonded or not. Its XP is the pack monster's (`CONTENT.monsters[tpl].xp`); a summon block is not a
  pack monster, so it is 0 and stays 0. The DM may untick any foe, as before.
- **A3, a foe the party saw vanish.** A seen vanish takes the record away (resolve.js, `vanish`), so a foe that vanished
  that way in the middle of a fight left nothing for the conclusion. The fight now keeps it: `encounter.gone`, a list
  of `{ id, name, shown, tpl }` for each foe that left the order by a seen vanish. `concludeFight` adds each one not
  still among the fight's creatures with `counts: true` and `gone: true`, so it is listed once. A foe that is the last
  of the fight to fall is counted among the fight's creatures (the fight ends inside the action, before `settleBonds`
  makes it vanish), so it is never counted twice either; when it then vanishes seen, `vanish` marks its line in the
  unpublished conclusion `gone` with its `shown` name (review of #330, M1). At publish a foe whose record is gone is
  `seen` exactly when it is `gone`: the party saw it vanish. So the party's card and the chronicle's "Beaten" name it
  as they name a twin's corpse, under `conclusion: 'dm'` and `'auto'` alike.
- **A3, the name players are shown.** `shown` is `seenName` (moved from view.js to vision.js so the engine can use it)
  at the moment it vanished: a foe in Wild Shape is the Beast. The card (view.js, `foeName`) and the chronicle use
  `seenName` of the record if it is there, `shown` if not; `name` stays the DM's (review of #330, M2).
- **A3, a foe that vanishes alive.** A `gone` foe counts whatever its Hit Points were: a DM-bonded pack monster that
  vanishes at full health (its master died, a leash, its effect ended) gives its full XP, as the husk an unseen vanish
  leaves does (that one is made dead). It is "counts as a death does" taken literally; the DM unticks it if not. Summon
  blocks give 0 either way (review of #330, L1; in DEBT).
- **A3, unseen.** The husk an unseen vanish leaves is a dead foe in the order and counts as any unseen death does; it
  is not in `gone`. So seen or unseen, killed or vanished, a foe counts the same, once. Twin runs on hexes and squares
  (companions-xp.test.js): a hidden companion killed unseen (the party blinded under `sight: 'light'`, since a creature
  in a fight can't be hidden by the DM's switch) against an unbonded twin, and a bonded undead killed seen against an
  unbonded twin, give players the same events, views, record and `seq`; a seen vanish against a twin's seen death gives
  the same XP shares, the same card and the same chronicle.
- **A3, what players are sent.** `encounter.gone` is never sent: the players' encounter is built field by field
  (`view.js`, viewEncounter). `gone` on a conclusion foe is the DM's only (`playerConclusion` sends id, name, counts).
- **A4.** `BOND_MAX` is `SUMMON_MOST` (`schema.js`, 30), so one number stands for both the master's cap and the most
  one summon step makes. `roomForCompanions(s, m, n)` is the one check and the one refusal ("Brenna can have at most 30
  companions."), used by the DM's `bond` (companions.js) and by a cast's summon (casting.js). It, `BOND_MAX` and
  `companionsOf` live in `engine/shared.js`, under both handlers (review of #330, L2); `engine/companions.js` re-exports
  the two it had.
- **No state version bump.** `encounter.gone` and a conclusion foe's `gone` and `shown` are optional; a save without them loads and
  plays as before (a fight saved in the middle simply has no seen vanish kept from before the change).
