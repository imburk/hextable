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
30. More is refused, to keep a table's state and the fight order bounded.

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
| Find Steed | auto (with C6); **C4 set assist**: `one` (C5) and `mount` (C6) are not in the vocabulary yet | `summon: 'otherworldly-steed'`, `types`, `one: 'replace'`, `turn: 'after'` with `order` before or after by the master's choice each round, `ends: ['masterDies']`, `mount: 'controlled'` | Life Bond until healing is hooked (C9); the steed's look |
| Summon Dragon | auto | `summon: 'draconic-spirit'`, Concentration part; Shared Resistances as a `modifier` step on `self` with the spell's `choice` | its "verbal commands" |
| Giant Insect | auto | `summon: 'giant-insect'`, `variants` | as above |
| Animate Dead | assist | `on: 'corpse'`, Zombie; 24-hour bond; `orders: 'command'`, range 60; reassert; commanded this turn the player plays it, otherwise the DM on its standing order | bones and the Skeleton; whether orders are kept |
| Create Undead | assist | as Animate Dead, Ghoul (Ghast, Wight, Mummy by slot), range 120; "only at night" is the DM's | as above |
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
| C6 | **Riding.** `mount`, `dismount`, `riding`/`rider`, the mount's footprint for the rider, `budget.mount`, moving together (walk, push, teleport, fall), falling off, Opportunity Attacks for the pair; `mount: 'trained'` on the eight mounts; Find Steed as a controlled mount and its Incapacitated turn. | engine | `engine/movement.js`, `engine/world.js`, `engine/resolve.js`, `space.js`, `vision.js` (eye height), `content/schema.js` (the `mount` field), `content/srd52/monsters-*.js` (eight entries, that field only), tests on hexes and on `square-room` | on both grids: mounting costs half Speed; a Medium rider on a warhorse moves 60 ft with the warhorse's movement and still has its own to dismount; the warhorse can Dash but its attack is refused; a goblin beside the pair gets one Reaction and may choose either; Thunderwave pushing the horse makes the rider save DC 10 and land Prone on a failure; a flying steed vanishing drops its rider who falls; a fireball touching one hex of the horse catches the rider |
| C7 | **The companion brain.** `companionStep`; the client's auto-play rule (never-commanded and not-commanded-this-turn, Decision 9). | engine + client | `ai.js`, `packages/client/app.js` (the auto-play condition only), tests | a never-commanded Skeleton Dodges and steps away; an Incapacitated paladin's steed comes to her and attacks the goblin beside her; a player's familiar waits for its player unless `auto` is set |
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
  (C6). The step is only in a spell, once, in the spell's own list (not under a roll), the spell aimed at its
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
  turn is its master's player's (`ownerOf`); in the tracker it stands straight after its master (`after`, C8/C10).

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
  dead, and within `bond.range` feet of the master (`apart`, so by the table's square rule on squares, from the nearest
  parts of the two). Checked before anything changes; a refusal changes nothing. A player is told "X is not Brenna's
  companion." for any creature it knows of that is not that master's, bonded to another or to no one, and "No such
  creature." for one it does not know of (engine.js also walks `ids`), as `companionOrder` does; the DM is told which. A
  free companion is "X takes no commands: it is played freely." Then `need(master, 'bonus')`: in a fight the master's
  turn with its Bonus Action left ("already used a Bonus Action"); outside one it costs nothing, but the master must be up
  and able to act. One command for any number costs one Bonus Action.
- **`order`.** Words of 1 to 80 characters (trimmed), `null`, or left out. Given, it is the order that stands after this
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
  later fight. Decision 6 says "cleared when that creature's turn ends"; the turn's end is not in this stage's files
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
  the Dodge action and moves to avoid harm."), but `move`, `dodge`, `endTurn` and `stand`, and what is set about it or
  answered for it rather than done by it: `reactions`, `companion`, `react`, `stepAway`, `stepBack`. It reads the type of
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
  range in a step until then).
- **The Unseen Servant's 15 ft is not built.** It needs `turn: 'none'` (a creature with no entry of its own, moved on its
  master's turn: `move` with the servant as actor from a `budget.servant` the command fills), which is movement.js and the
  fight order, not in this stage's files, and the servant has no block yet (C4 left it manual). What is left for it: the
  DM's bond and the step to take `turn: 'none'`, `budget.servant` in `command` and `move`, and its block.
- **Labels.** `describeStep` for `command`: "Brenna commanded Zombie 1", or "Brenna commanded 3 companions"; the order's
  words are not in a label.
- **No state version bump.** `bond.standing`, `bond.commanded.turn` and the events are new and optional; a bond without
  `commanded` or `standing` (a save from before) is never commanded for `orders: 'command'` and unchanged for `'free'`.

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
