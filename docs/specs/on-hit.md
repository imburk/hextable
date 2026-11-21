# Spec: on weapon hit

Status: draft by an agent (#494), to be reviewed by the design owner. Covers 0.2 Must 4 (`docs/PATH-TO-0.2.md`,
sections 2 and 5; the owner's question 4 of `homebrew.md`): the smite spells, Shillelagh, True Strike, Magic
Weapon, and the features and items that do something when their creature hits with a weapon. Docs only: nothing
here is built. Every rule is from `reference/srd52/srd52-flow.txt`; numbers after a section name are its lines.

## Problem

The engine already runs every rider that is always on and costs nothing: a `damage.dealt` modifier with
`when: ['attack.hit', ...]` adds its dice to a hit, doubled on a Critical Hit (`dealt`, `engine/rolls.js`), at most
once a turn with `once: 'turn'`, the engine choosing the type when it may be one of several (`bestType`). Hunter's
Mark, Hex, Divine Favor, Divine Strike, Primal Strike and Radiant Strikes are built that way. Brutal Strike, Cunning
Strike and Superior Hunter's Prey are options named on the `attack` action before the roll (`engine/attacks.js`).
Hurl Through Hell is a separate `feature` action after the hit (`after: 'hit'`, the `hit:<attacker>:<target>` flag).

What is missing is the **choice made after a hit that spends something**, and the **weapon changed by a spell**:

1. **Smite spells** are Bonus Action spells "which you take immediately after hitting" (Divine Smite, Searing
   Smite, Shining Smite, Ensnaring Strike). `CAST_TIMES` has no such time, nothing offers them at the hit, and their
   damage, which is "from the attack", cannot join the attack's damage. Divine Smite, Searing Smite and Ensnaring
   Strike are `manual`; Shining Smite is `assist` with its range entered as Touch so the DM can aim it at the creature
   hit, and the engine does not check that a hit came first.
2. **Features and items that spend on a hit**: Stunning Strike (assist: the engine does not check the hit or once a
   turn), Open Hand Technique, Eldritch Smite and Lifedrinker (manual), Staff of Striking and Dagger of Venom (assist,
   their hit part the DM's), Paladin's Smite's free cast (assist).
3. **A weapon changed**: Shillelagh, True Strike, Magic Weapon (manual) and Sacred Weapon (manual) change the
   ability, the die, the bonus or the damage type of a weapon's attacks. Attack records are made once by `derive.js`
   with the bonus and damage baked in, and nothing changes them for a while.

## What the SRD says

| What | Rule (SRD 5.2.1) | Lines |
|---|---|---|
| Bonus Actions | Only on your turn, only one a turn; you choose when, unless its timing is specified. | "Bonus Actions", 1404-1425 |
| One slot a turn | On a turn you can expend only one spell slot to cast a spell. | "One Spell with a Spell Slot per Turn", 23658-23664 |
| Triggered Bonus Actions | Some Bonus Action spells are cast in response to a trigger in their Casting Time. | "Reaction and Bonus Action Triggers", 23666-23671 |
| Critical Hits | Roll the attack's damage dice twice; other damage dice of the attack (Sneak Attack) are rolled twice too. | "Critical Hits", 2202-2208; glossary 33086-33093 |
| Divine Smite | Bonus Action right after hitting a target with a Melee weapon or an Unarmed Strike: 2d8 Radiant more "from the attack", 1d8 more against a Fiend or Undead, 1d8 per slot level above 1. | 26167-26182 |
| Searing Smite | Same trigger: 1d6 Fire more from the attack; at the start of each of the target's turns, 1d6 Fire then a Constitution save that ends it; all the damage grows 1d6 a slot level. | 30476-30489 |
| Shining Smite | Same trigger (a creature): 2d6 Radiant from the attack; Concentration: Bright Light 5 ft, attack rolls against it have Advantage, it can't benefit from Invisible; 1d6 per slot level above 2. | 30706-30722 |
| Ensnaring Strike | Bonus Action after hitting a creature with a weapon: Strength save (Large or larger with Advantage) or Restrained while you concentrate; 1d6 Piercing at the start of each of its turns; an action and an Athletics check against your DC ends it. | 26518-26537 |
| Paladin's Smite | Divine Smite always prepared; once per Long Rest cast without a slot. | 11918-11923 |
| Smite of Protection | When you cast Divine Smite, Half Cover for you and allies in your aura to your next turn. | 12413-12418 |
| Shillelagh | Bonus Action, 1 minute: a held Club or Quarterstaff uses the spellcasting ability for melee attack and damage rolls, its die is d8 (d10 at 5, d12 at 11, 2d6 at 17), Force or its own type; ends if cast again or let go. | 30684-30704 |
| True Strike | Action: one attack with the weapon used in the casting (one you are proficient with), with the spellcasting ability; Radiant or its own type; extra Radiant 1d6 at 5, 2d6 at 11, 3d6 at 17. | 31843-31859 |
| Magic Weapon | Bonus Action, touch a nonmagical weapon: magic, +1 to attack and damage rolls for 1 hour; +2 with a level 3-5 slot, +3 with 6+; ends if cast again. | 28770-28784 |
| Sacred Weapon | When you take the Attack action, a Channel Divinity use: 10 minutes, Charisma modifier (at least +1) to attack rolls with a held Melee weapon, Radiant or its own type, light; ends if used again or not carried. | 12391-12405 |
| Stunning Strike | Once a turn, a hit with a Monk weapon or Unarmed Strike, 1 Focus Point: Constitution save or Stunned to the start of your next turn; on a success Speed halved and the next attack against it with Advantage. | 11198-11206 |
| Open Hand Technique | A hit with an attack of Flurry of Blows: Addle, Push (Strength save, 15 ft) or Topple (Dexterity save, Prone). | 11307-11316 |
| Eldritch Smite | Once a turn, a hit with the pact weapon: a Pact Magic slot for 1d8 Force plus 1d8 a slot level, and Prone if Huge or smaller. | 16439-16447 |
| Lifedrinker | Once a turn, a hit with the pact weapon: 1d6 Necrotic, Psychic or Radiant, and a Hit Point Die may be spent to heal. | 16551-16559 |
| Staff of Striking | A melee hit with it: up to 3 charges, 1d6 Force each. | 42101-42113 |
| Dagger of Venom | Bonus Action, once a dawn: the blade is coated for 1 minute or until an attack with it hits; that creature makes a DC 15 Constitution save or takes 2d10 Poison and is Poisoned for 1 minute. | 38158-38168 |
| Counterspell | Interrupts a creature casting a spell; a slot it was casting with is not expended. | 25596-25610 |
| Frenzy, Colossus Slayer, Savage Attacker | Riders that cost nothing (see Decision 9). | 5168-5174; 13453-13457; 20061-20066 |

The SRD has no rule of "one smite per hit". What limits smites is that each is a Bonus Action (one a turn, only on
your own turn) and that a slot may be spent on only one spell a turn. Eldritch Smite expends a slot without casting a
spell, so it is not held by the one-slot rule. The SRD also does not order a smite against the target's Shield or
Uncanny Dodge; Decision 3 does.

## Goals

- When a built character hits with a weapon or an Unarmed Strike, every choice the SRD gives it at that moment is
  offered by the engine, checked, paid for and applied: smite spells, feature riders, item riders.
- The player decides after the hit is known, critical or not, before the damage is rolled (the SRD's timing).
- A choice can also be named ahead on the `attack` action, so the AI, a DM and a quick player never wait.
- Damage "from the attack" joins the attack's damage: one roll, doubled on a Critical Hit, cut by Uncanny Dodge with it.
- A spell or feature can change a weapon's attacks for its duration (ability, die, bonus, damage type, magic).
- True Strike makes a weapon attack from a spell.
- All new data keys are closed vocabulary with lint, so homebrew can use them too.
- No state version bump; old saves load and play as before.

Not in this spec: what lasts on later turns (Searing Smite's burn, Ensnaring Strike's piercing and escape check:
the "follow-up each turn" job of PATH-TO-0.2 section 5, Should); light on a creature (the lights job); "can't benefit
from Invisible" (the missing states job); the pact weapon itself (Pact of the Blade); Weapon Mastery; monster stat
blocks (their hit riders are already data in their actions' `onHit` branches).

## The decisions

### Decision 1: a "hit choice" is offered at the hit, by a prompt, and may be named ahead

A **hit choice** is anything a creature may do because its attack just hit: cast a spell with `hit`, use a feature
action with `hit`, use an item activation with `hit`. Two ways to make one, which lead to the same code:

- **Named ahead** on the attack: `{ type: 'attack', actor, target, attack, onHit: [choice, ...] }`, each choice one
  of `{ spell, slot?, via?, on? }`, `{ feature, mode?, on? }`, `{ item, n?, on? }`. `on` is `'hit'` (the default) or
  `'crit'` (only on a Critical Hit). `onHit: []` names none, and then nothing is asked. Everything that can be
  checked before the roll is checked then, before anything is spent (the spell is known or the feature can cast it,
  a slot or use is left, the Bonus Action, the turn, the weapon fits `hit.with`); a refusal refuses the attack, as for
  `brutal` or `grab`. A choice named ahead whose attack misses spends nothing.
- **Asked at the hit**, when the attack names no `onHit` and the creature's standing instruction for a choice is
  `ask` (Decision 5). The engine stops the action with the existing `ask` (`engine/shared.js`: apply() puts the state
  back, keeps the action in `pending`, and the answer re-runs it from the same state, so the same dice fall). The
  reactor is the attacker itself; the trigger is `'ownHit'`. The answer is the existing `react { prompt, take, slot? }`
  with one new field, `n` (Decision 6). After a choice is taken the engine asks again with what is still possible,
  until the player declines (`take: null`) or nothing is left, so several riders can go on one hit (a Divine Smite
  and Staff of Striking charges).

**Why both.** The SRD's timing is after the hit: a paladin smites on a Critical Hit, and only the prompt lets the
player see that first. Naming ahead keeps the AI and the DM's creatures from ever stopping (an `ask` on a creature
with no player hands the moment to the DM and nothing waits), and lets a player say "smite if it hits" in one tap.

**Two moments.** A choice with a `withHit` damage step (Decision 2) is offered right after the hit is settled and
before any damage die is rolled. A choice without one (Stunning Strike, Open Hand Technique, Ensnaring Strike) is
offered after the attack's damage is dealt, and only while the target is up: nobody pays a Focus Point to stun a
creature the hit has just dropped. A choice named ahead is applied at its own moment in the same way, and is not paid
for if the target is no longer up at the second moment.

**Where it applies.** In `resolveAttack` (`engine/resolve.js`), the one place a built character's weapon and Unarmed
Strike attacks are resolved: the `attack` action, Opportunity Attacks, Retaliation (`strikeBack`), and True Strike
(Decision 8). A spell attack roll is not a weapon hit and offers nothing. A pack monster's attack (an attack step in
`effects.js`) offers nothing: no pack monster has a hit choice.

### Decision 2: a smite spell is data, and its damage joins the attack's

Two new keys (Decision 10):

- On a spell: `hit: { with }`. It is cast only as a hit choice, as a Bonus Action, and its steps run on the creature
  hit (a step with `to: 'caster'` still goes to the caster). Its `target` stays `{ self: true }` and its range Self,
  as the SRD has them; Shining Smite's range goes back from Touch to Self.
- On a damage step: `withHit: true`. The damage is rolled with the attack's damage, with `{ crit }`, and goes in the
  same `damage()` call as one more part (`from` the spell's name), so a Critical Hit doubles it, resistances apply by
  its type, Uncanny Dodge's half and Deflect Attacks' cut (`cut`) take it with the rest, and one `damage` event shows
  it. `withHit` is allowed only under a spell with `hit` or an action with `hit` (the linter refuses it elsewhere).

`hit.with` is one of:

| `with` | Fits an attack made with | Used by |
|---|---|---|
| `melee` | a Melee weapon (by the weapon's kind, so a thrown handaxe counts, DEBT C11) or an Unarmed Strike | Divine, Searing, Shining Smite |
| `weapon` | any weapon, not an Unarmed Strike (#446) | Ensnaring Strike |
| `monk` | a Monk weapon or an Unarmed Strike | Stunning Strike |
| `flurry` | an attack granted by Flurry of Blows (`budget.bonusAttacks`) | Open Hand Technique |
| `pact` | the pact weapon (none until Pact of the Blade is built: never fits) | Eldritch Smite, Lifedrinker |
| `this` | the item itself (`atk.id` is `item-<its id>`); with `melee: true`, a melee attack with it | Staff of Striking |

Divine Smite becomes:

```
{ id: "divine-smite", level: 1, time: "bonus", range: "self", components: ["v"], duration: "instant",
  hit: { with: "melee" }, target: { self: true },
  effects: [ { damage: "2d8", type: "radiant", withHit: true },
             { damage: "1d8", type: "radiant", withHit: true, when: ["target.fiendOrUndead"] } ],
  higher: { slot: { damage: "1d8" } }, tier: "auto" }
```

**Casting it** (`castOnHit`, in `engine/resolve.js` beside `castReaction`, which it follows): checked as a cast is
(known or cast `via` a feature with `freeCast`, not in a form, not raging, not Incapacitated), then it is the
attacker's own turn with a Bonus Action left (`need(s, e, 'bonus')`), and a slot of its level or higher with no slot
spent this turn (`flags.slot`), unless it is cast through a feature with no slot (Paladin's Smite: one use, then
`flags.slot` is untouched, since no slot is expended). Paid: the Bonus Action, the slot (lowest, or the one the
player chose) or the use, `flags.slot`. Then, as any cast: a `cast` event (`hit: true`), a Verbal component unhides
the caster, Concentration replaces the old (the prompt's option says which spell it would end, `ends`, since the
player knows their own), and a foe who sees it may Counterspell it (`counterWindow` moves from `engine/casting.js`
down to `resolve.js` so both use it). A countered smite wastes the Bonus Action, keeps the slot (as `castSpell`
does), and the attack's own damage is dealt without it. Metamagic is not offered on a cast after a hit (stage O1).
`cast` by hand refuses a `hit` spell: "Divine Smite is cast right after a hit: answer the question, or name it in
`onHit` on the attack."

The one Bonus Action a turn means at most one smite spell a hit (and a turn). The engine adds no other limit
(question Q7).

### Decision 3: the order inside a hit

1. The attack roll, Bardic Inspiration and the like (`rollToHit`), as now.
2. The target's reactions to the hit (Shield, Parry, Uncanny Dodge, Deflect Attacks), as now. A Shield that turns
   the hit into a miss leaves nothing to smite.
3. The attacker's first-moment hit choices (Decision 1): asked or named ahead, paid.
4. The damage: the weapon's dice, Brutal Strike, Sneak Attack, every `withHit` part, all with `{ crit }`, then
   `dealt` (modifiers), then one `damage()`.
5. What follows the hit today (`atk.onHit` Prone, Brutal Strike's option, Cunning Strike's effects), then each smite's
   steps without `withHit` (Shining Smite's modifier), then the second-moment choices, then `nextHit` parts (Decision 7).

So the target answers the hit before knowing of the smite, and Uncanny Dodge halves the smite's damage too (it is
"from the attack"). Question Q3.

### Decision 4: features and items use the same hook

A feature's `action` or an item's `activate` entry with `hit: { with, once? }` is a hit choice. `once: 'turn'` is
kept in `encounter.flags['struck:<feature or item id>:<attacker id>']`. Its `time` must be `free` (none of the SRD's
ask for an action) and its `cost` is paid as `feature` and `use` already pay it (Focus Points, Channel Divinity, item
charges). It is not on its own turn only: Stunning Strike and Staff of Striking work on an Opportunity Attack's hit,
and smite spells do not (no Bonus Action off its turn). A `hit` feature used by hand with `feature` is refused, as a
`hit` spell is by `cast`.

| Entry | Data after this spec | Tier after |
|---|---|---|
| Stunning Strike | `hit: { with: 'monk', once: 'turn' }`, cost 1 Focus; its save as now; second moment | auto if its success branch (Speed halved, next attack with Advantage) is entered; else assist |
| Open Hand Technique | `hit: { with: 'flurry' }`, `modes` Addle, Push, Topple (the option is the `mode` of the choice); second moment | assist until "can't make Opportunity Attacks" exists (missing states job), then auto |
| Staff of Striking | activate `hit: { with: 'this', melee: true }`, `cost: 1`, `upTo: 3`, `{ damage: '1d6', type: 'force', withHit: true }` | assist (the last charge's d20 is another gap) |
| Dagger of Venom | activate Bonus Action, `duration: '1 minute'`, a `nextHit` step (Decision 7) | auto |
| Paladin's Smite | `uses: { max: 1, recharge: 'long' }`, `freeCast: { spells: ['divine-smite'] }` as Faithful Steed; offered as Divine Smite `via` it | auto |
| Eldritch Smite | `hit: { with: 'pact', once: 'turn' }`, cost a Pact Magic slot (`slotCost: 'pact'`), `withHit` 1d8 Force + 1d8 a slot level (`perSlot`), Prone if Huge or smaller (W9's `largest`) | manual until the pact weapon is built |
| Lifedrinker | `hit: { with: 'pact', once: 'turn' }` | manual until the pact weapon is built |
| Hurl Through Hell | unchanged (`after: 'hit'`, a separate action: it follows any attack roll, spell attacks too) | assist |
| Quivering Palm, Smite of Protection | unchanged | manual (a later action; a trigger on casting a named spell) |

`upTo: n` lets the user spend 1 to `n` times the `cost`; the choice's `n` (or the prompt's answer `n`) says how
many, and each `withHit` step's dice are multiplied by it (1d6 becomes 3d6). `slotCost: 'pact'` and `perSlot` are
for Eldritch Smite only and may be left to the job that builds the pact weapon (question Q9).

### Decision 5: standing instructions, as for reactions

Each hit choice of a creature has an instruction, kept on it as `hitChoices: { [choice id]: when }` and set by a
new action `{ type: 'hitChoices', actor, set }`, at any time, by its controller (checked like `reactions`):

| `when` | At a hit it fits |
|---|---|
| `ask` | the player is asked (Decision 1). For a creature with no player, the DM is told with a `manual` that it could have been used, and nothing is taken (as `tellDM`) |
| `crit` | taken without asking on a Critical Hit only, at the lowest slot and `n` 1 |
| `always` | taken without asking on every hit it can, lowest slot, `n` 1 |
| `never` | not offered |

Defaults: `ask` for a creature with a player, `never` for one without (the DM names choices ahead). The choice id
is the spell id, the feature id, or `item:<item id>`. A choice named ahead on the attack overrides the instructions
for that attack. `hitChoices.js` (new, pure, beside `reactions.js`) lists what a creature can choose
(`hitChoicesOf(e)`), with defaults and allowed values, and checks a `hitChoices` action. `mayAsk` (`reactions.js`)
also returns true when a creature with a player has a hit choice set to `ask`, so the action keeps the copy it needs
to stop (DEBT T55 gives the cost, about 1.4 ms).

### Decision 6: what the prompt says, and the answer

`reactionAsked.ask` for a hit: `{ reactor: attacker, trigger: 'ownHit', moment: 'hit' | 'damaged', target, attack:
name, crit?, options }`. Each option: `{ reaction: choice id, name, kind: 'spell' | 'feature' | 'item', slots?,
counts?, modes?, ends? }`. `slots` are the slot levels that may pay (none for a free cast); `counts` is `1..upTo`;
`modes` the feature's modes; `ends` the name of the caster's own Concentration spell it would end. Nothing in it is a
number the attacker is not already sent: no Armor Class, no Hit Points.

`react` gains `n` (refused unless the option has `counts`, and it must be one of them) and `mode` (the same against
`modes`). Both go into the recorded answer, so the re-run reads them. `validPending` needs no change.

### Decision 7: `nextHit`, a rider armed for the next hit

A step `{ nextHit: { effects } }` in an activation or a spell with a duration puts a part on its creature: the next
time an attack with that item hits (the item that was used; for a spell, `with` as in Decision 2), the `effects`
run on the creature hit in the second moment, whether or not it is up, and the part ends, which ends the effect if
nothing else is left. It is not a choice: Dagger of Venom's poison "remains ... until an attack using this weapon
hits". DC 15 is the save step's own `dc`.

### Decision 8: weapons changed by a spell or feature (`imbue`), and True Strike (`weaponAttack`)

**`imbue`.** A step that puts a part on a creature, naming one of its weapons, for the effect's duration. While it
lasts, every attack record of that weapon is read through it at the start of `resolveAttack` and wherever an attack's
bonus is shown (`armed(s, e, atk)`, one function), so the `attack` action, Opportunity Attacks, `strikeBack` and True
Strike all see the same weapon:

```
{ imbue: { weapons?: [weapon ids], melee?: true, nonmagical?: true,
           abil?: 'spell', die?: { byLevel }, plus?: n | { bySlot }, attackAdd?: { mod, min }, types?: [types] } }
```

- `abil: 'spell'`: the caster's spellcasting ability for this spell (`castAbilOf`) replaces the record's `abil` in
  attack and damage: bonus and damage modifier change by the difference of the two modifiers.
- `die`: the weapon's die becomes this one, by character level (Shillelagh: d8, d10 at 5, d12 at 11, 2d6 at 17).
  A Monk weapon keeps the larger of it and the Martial Arts die.
- `plus`: added to attack and damage, and the weapon counts as magic (Magic Weapon; `bySlot` gives +1, +2 at a
  level 3 slot, +3 at 6).
- `attackAdd`: an ability modifier to attack rolls only, at least `min` (Sacred Weapon: Charisma, at least 1).
- `types`: the damage may be one of these instead of its own; the engine takes the one that hurts the target most,
  as Divine Strike does (`bestType`; question Q5).
- `weapons` limits which weapons (Shillelagh: club, quarterstaff), `melee` to melee attacks with it, `nonmagical` to
  a weapon that is not a magic item (Magic Weapon).

The weapon is named by the cast's new field `weapon` (the attack record's id without `-two-handed` or `-thrown`;
for Magic Weapon, a weapon of the creature touched). A new `imbue` from the same spell or feature by the same creature
ends the old (all three say "ends if cast again" or "used again"). The part ends when its creature no longer has that
attack record (the weapon put away, a remake without it), checked after every action (`settle` in `durations.js`).

To read a record this way the engine needs what `derive.js` baked: it adds `die` (the weapon's own die), `plus` (a
magic item's bonus), `magic` and `trained` to weapon records. A record without them (a game saved before, until the
next remake: an equip, a rest, a level-up) is not changed: the DM is told with a `manual` naming the effect.

Sacred Weapon is used "when you take the Attack action": the `attack` action gains `use: '<feature id>'` for a
feature whose action has `withAttack: true`, allowed only on the attack that spends the action for the Attack action
(not a pooled, Bonus Action or Flurry attack); it is paid and imbued before that attack's roll, so the first attack
has the bonus.

**`weaponAttack` (True Strike).** A step that makes one attack with the caster's weapon named by the cast's `weapon`,
read through `{ abil: 'spell', types }` as `imbue` reads one, with `extra: { type, dice: { byLevel } }` added as a
`withHit` part. The cast takes a `target` (one creature), checked against the weapon's reach or range, not the
spell's Self; the weapon must be one its caster is proficient with (`trained`). It is a weapon attack, not a spell
attack: Sneak Attack, Divine Favor, Hunter's Mark and hit choices all apply (a smite after a True Strike hit is the
SRD's), and it is not the Attack action (no Extra Attack, no Punch and Grab, no `brutal` or `cunning`). Agonizing
Blast and Repelling Blast for True Strike read it as they read Eldritch Blast's attack (`spell` on the modifier;
`repel` attaching to the attack's hit): stage O5 checks both and sets their tiers.

### Decision 9: riders that cost nothing are modifiers, not choices

A rider with no cost and no choice a player would ever decline is a `damage.dealt` modifier, as today, and needs
only a tag or an op (stage O6, Should): Colossus Slayer (`once: 'turn'`, a new tag `target.hurt`: missing any Hit
Points), Frenzy (`once: 'turn'`, Strength attacks, while its Rage lasts and Reckless Attack was used this turn: a tag
`self.reckless` and the modifier on the Rage effect), Savage Attacker (a new op `twice` on the weapon's dice, once a
turn, the engine keeping the higher). Lifedrinker's 1d6 is such a rider once the pact weapon exists; its Hit Point Die
is a choice. Hex and Hunter's Mark are already built this way; what holds them is moving the mark (the follow-up job).

### Decision 10: the AI

- **Pack monsters**: nothing changes. None has a hit choice; their riders are data in their attacks.
- **Built characters the AI plays** (stand-ins and the DM's characters, `ai-casting.md` Decision 1): the AI never
  names `onHit` and never answers a prompt. The instructions decide: `crit` and `always` fire, `never` does not, and
  `ask` is read as `never` while the character stands in, so a player who comes back does not find slots spent and no
  DM's auto-play stops at every hit (question Q6). The scores of `ai-casting.md` do not count hit choices.
- **The companion brain**: nothing (no companion has a hit choice).

### Decision 11: what players are sent, undo, old saves

- The prompt goes to the attacker's controller and the DM only (`viewPrompt`), as any reaction prompt.
- `hitChoices` instructions are private like `reactions` (view.js strips them for everyone else).
- A smite's `cast` event (with `hit: true`) goes to whoever sees the caster, as any cast; its damage is a part of the
  hit's `damage` event (`from: 'Divine Smite'`). A feature's or item's use shows as a `std` or `note` from its
  creature, as `feature` and `use` do now. An `imbue` is an `effectStart` on the caster.
- The pause is the existing one: undo, replay and saving a waiting table work unchanged.
- **No state version bump.** Every field is optional: `hitChoices` (absent: defaults), `onHit`, `use` and `weapon`
  on actions, record fields from `derive.js` (absent: Decision 8's hand-off), effect parts `imbue` and `nextHit`.
  Spell and item data are read from the pack, so the smites and items change at once; features are copied on to a
  creature by `derive.js`, so a saved character gets `hit` on its features at its next remake (DEBT C11 already says
  this of features).

## The state, in one place

| Where | Field | New? | Meaning |
|---|---|---|---|
| creature | `hitChoices` | new, optional, private | Standing instructions for its hit choices |
| `attack` action | `onHit`, `use` | new, optional | Choices named ahead; a feature used with the Attack action |
| `cast` action | `weapon` | new, optional | The weapon for `imbue` and `weaponAttack` |
| `react` action | `n`, `mode` | new, optional | How many charges; which mode |
| pending ask | `trigger: 'ownHit'`, `moment`, options `kind`, `counts`, `modes`, `ends` | new values | Decision 6 |
| encounter | `flags['struck:<id>:<creature>']` | new key | A `once: 'turn'` hit choice used |
| weapon attack record | `die`, `plus`, `magic`, `trained` | new, optional | What `imbue` needs (derive.js) |
| effect part | `imbue`, `nextHit` | new | Decisions 7 and 8 |

## Vocabulary additions, each a spec amendment line

Each lands in `content/schema.js` with lint, in `content/reader.js` (the plain words of a homebrew entry), and in the
stage named. Amendment lines for `homebrew.md` ("what the vocabulary can say") and `rules-expansion.md` (the format):

1. **Spell key `hit: { with }`**: cast only right after its caster hits, as a Bonus Action, on the creature hit;
   needs `time: 'bonus'` and `target.self` (O1).
2. **Damage step key `withHit: true`**: rolled with the hit's damage and doubled on a Critical Hit; only under `hit` (O1).
3. **Tag `target.fiendOrUndead`** (O1), unless the creature-type job (0.2 Must 5) lands a general form first, which is
   then used instead. **Tag `target.largeOrLarger`** (O2, Ensnaring Strike's Advantage).
4. **Feature action and item activation key `hit: { with, once? }`**, **`upTo`** on an activation (O3).
5. **Step `nextHit: { effects }`** (O3).
6. **Step `imbue`**, with `abil`, `die`, `plus` (`bySlot` amounts), `attackAdd`, `types`, `weapons`, `melee`,
   `nonmagical`; **feature action key `withAttack: true`** (O4, built in #666; see the build notes).
7. **Step `weaponAttack: { abil, types, extra }`** (O5).
8. **Tags `target.hurt`, `self.reckless`; op `twice`** (O6).
9. Later, with the pact weapon: `slotCost: 'pact'` and `perSlot` on a feature action (Eldritch Smite).

## What becomes of each entry

| Entry | Now | After | What is left to the DM |
|---|---|---|---|
| Divine Smite | manual | auto (O1) | nothing |
| Searing Smite | manual | assist (O2) | the burn each turn and its save (follow-up job) |
| Shining Smite | assist | assist (O2), range Self | Bright Light, no Invisible (lights, states jobs) |
| Ensnaring Strike | manual | assist (O2) | the piercing each turn, the escape check (follow-up job) |
| Shillelagh | manual | auto (O4) | nothing |
| Magic Weapon | manual | auto (O4) | nothing |
| True Strike | manual | auto (O5) | nothing |
| Paladin's Smite | assist | auto (O1) | nothing |
| Sacred Weapon | manual | assist (O4) | its light |
| Stunning Strike | assist | auto or assist (O3) | Decision 4 |
| Open Hand Technique | manual | assist (O3) | Addle until the state exists |
| Staff of Striking | assist | assist (O3) | the last charge's d20 |
| Dagger of Venom | assist | auto (O3) | nothing |
| Agonizing Blast, Repelling Blast (True Strike) | manual | auto (O5), if checked | |
| Colossus Slayer, Frenzy, Savage Attacker | manual | auto (O6) | |

PATH-TO-0.2's group of 7 spells: 4 move to auto, 3 to assist.

## Client controls (a separate job)

- The prompt reuses the reaction prompt: "You hit the goblin (critical!). Divine Smite: level 1, 2 slot / Staff of
  Striking: 1, 2, 3 charges / Not now." On a phone, one big button per option and a slot or count picker under it.
- The attack picker gets "On a hit:" toggles for what may be named ahead (Smite, with slot; Stunning Strike), and
  "only on a critical".
- The sheet lists hit choices with their instruction (Ask, On a crit, Always, Never), next to Reactions.
- Casting Shillelagh, Magic Weapon or True Strike asks which weapon. The attack picker shows an imbued weapon's
  changed bonus and damage (`armed`), and the effect chip.

## Job split

Each stage is one pull request with its own tests; the valley plays as it does now after each.

**O1. The hook, Divine Smite and Paladin's Smite.** Decisions 1 to 3, 5, 6 (without `n` and `mode`), 10, 11.
Files: `packages/rules/src/hitchoices.js` (new), `engine/resolve.js` (`resolveAttack`'s two moments, `castOnHit`,
`counterWindow` moved here), `engine/casting.js` (uses the moved `counterWindow`; refuses a `hit` spell by hand),
`engine/attacks.js` (`onHit` checks; the `hitChoices` action), `reactions.js` (`mayAsk`), `modifiers.js` (the tag),
`content/schema.js`, `content/reader.js`, `view.js`, `content/srd52/spells-1.js`, `content/srd52/classes/paladin.js`.
Tests, `packages/rules/test/hit-smite.test.js`: a prompt after a hit and none after a miss; declining spends nothing;
a slot of level 2 adds 3d8; a Critical Hit doubles the smite's dice; a Fiend takes 1d8 more; `onHit` named ahead with
`on: 'crit'`; no smite on an Opportunity Attack or with the Bonus Action spent; no slot after a levelled spell this
turn, but Paladin's free cast after one; a Counterspell keeps the slot and the weapon damage is dealt; Uncanny Dodge
halves the total; Shield turning the hit into a miss asks nothing; `crit`, `always`, `never` instructions; a DM's
creature with `ask` gets a `manual` and nothing waits; a stand-in never spends; replay after the answer gives the same
dice; a player's view never gets another creature's instructions.

**O2. The other smites.** Searing, Shining (range Self), Ensnaring Strike, `target.largeOrLarger`. Files:
`content/srd52/spells-1.js`, `spells-2.js`, `content/schema.js`, `modifiers.js`. Tests, `hit-smites.test.js`: each
adds its damage with the hit; Shining Smite's Advantage lasts with Concentration and ends Bless; Ensnaring Strike
on a ranged weapon hit, in the second moment, with Advantage for a Large target; `npm run content` clean.

**O3. Feature and item riders.** Decision 4 and 7, `react`'s `n` and `mode`. Files: `engine.js` (`react`),
`engine/resolve.js`, `engine/features.js` (refuses a `hit` action by hand), `effects.js` (`nextHit`), `durations.js`,
`derive.js` (copies `hit`), `content/schema.js`, `content/reader.js`, `content/srd52/classes/monk.js`,
`classes/warlock.js`, `magic-items.js`, `view.js`. Tests, `hit-features.test.js`: Stunning Strike once a turn, on an
Opportunity Attack too, not asked when the hit dropped the target; Open Hand Topple only on a Flurry attack; Staff of
Striking 3 charges for 3d6, doubled on a crit, not with another quarterstaff; Dagger of Venom fires once on the next
hit and not after a minute; a smite and the staff on one hit.

**O4. Weapons changed.** Decision 8's `imbue`, `use` and `withAttack`. Files: `effects.js`, `engine/resolve.js`
(`armed`), `engine/attacks.js`, `engine/casting.js` (`weapon`), `derive.js`, `durations.js`, `content/schema.js`,
`content/reader.js`, `content/srd52/spells-0.js`, `spells-2.js`, `classes/paladin.js`. Tests, `imbue.test.js`:
Shillelagh with Wisdom and d8 then d10 at level 5, ends when cast again and when the staff is dropped; Magic Weapon +2
from a level 3 slot, refused on a magic weapon; Sacred Weapon with the first attack of the Attack action, refused on
a Bonus Action attack; an Opportunity Attack with an imbued weapon; an old record hands to the DM.

**O5. True Strike.** Files: `effects.js`, `engine/resolve.js` (`KIT.weaponAttack`), `engine/casting.js`,
`content/schema.js`, `content/reader.js`, `content/srd52/spells-0.js`, `classes/warlock.js`. Tests,
`true-strike.test.js`: Charisma for the attack, Radiant chosen against a Slashing-resistant target, 1d6 more at level
5, Sneak Attack with a rapier, a smite after it, no Extra Attack from it, an untrained weapon refused, Counterspell
stops the attack, Agonizing and Repelling Blast.

**O6. Riders that cost nothing** (Should). Decision 9. Files: `modifiers.js`, `engine/rolls.js`, `content/schema.js`,
`classes/barbarian.js`, `classes/ranger.js`, `feats.js`. Tests in `riders-free.test.js`.

**O7. Client** (above). Files: `packages/client/`. Checked with the `prompt` smoke pass and a new pass at 1280x800 and
390x844.

**DEBT.** Each stage strikes what it builds in C8 (Stunning Strike, Paladin's Smite, Sacred Weapon), C11 (the thrown
Melee weapon, for hit choices) and the spell tables, and adds a line for what it leaves.

## Questions for the owner

Each has the default the jobs above are written to.

- **Q1. Prompt, named ahead, or both?** Default: both. The prompt is the SRD's timing (after the hit, knowing if it
  is critical); naming ahead is for the AI, the DM and quick play. A DM's creature never stops: named ahead or by
  instruction only.
- **Q2. A player's default instruction.** Default `ask`: a paladin is asked at every hit while it has a Bonus Action
  and a slot. The alternative is `never` until the player turns it on.
- **Q3. The target's reactions first.** Default: Shield and Uncanny Dodge are decided before the attacker's smite,
  and Uncanny Dodge halves the smite's damage with the rest (it is "from the attack").
- **Q4. Do feature and item dice double on a Critical Hit?** Default yes (Staff of Striking, Eldritch Smite), as the
  engine already doubles Hunter's Mark and Divine Strike: "other damage dice" of the attack.
- **Q5. "Force or its normal type (your choice)".** Default: the engine takes the type that hurts the target most,
  as for Divine Strike. That uses the target's resistances, a monster number players are not sent, though only through
  the result. The alternative is a choice when the spell is cast, kept for its duration.
- **Q6. Stand-ins.** Default: `ask` is read as `never` while the AI plays a character (no slot or Focus Point spent
  for an absent player); `crit` and `always` fire. The alternative: the AI smites on a Critical Hit in a hard fight.
- **Q7. One smite per hit.** Default: no rule beyond the SRD's (one Bonus Action a turn, one slot spell a turn).
  Divine Smite and Eldritch Smite may then go on one hit for a multiclass character.
- **Q8. Old characters.** Default: no migration. A weapon record made before O4 is not imbued (the DM is told) until
  its next remake, and features get `hit` at the next remake.
- **Q9. Eldritch Smite's slot cost.** Default: the vocabulary for spending a Pact Magic slot on a hit waits for the
  job that builds the pact weapon; until then Eldritch Smite and Lifedrinker stay manual.
- **Q10. Counterspell on a smite.** Default yes: it is a spell with a Verbal component, cast where foes can see.

## Build notes

**O4 (#666), built.** Where the build settled what the stage text left open:

- **`imbue.js`** (new, pure) holds `armed(s, e, atk)`, so the client can import it as `./shared/imbue.js` and the engine reads the same function. The part on the effect is
  `{ target, imbue: { weapon, name, abil?, die?, plus?, attackAdd?, types? } }`, numbers already worked out when it was made (the die by the caster's character level, `plus` by
  the slot, `attackAdd` as `{ mod, min }` for the caster, `abil` as the caster's spellcasting ability for the spell). `weapon` is the record key (`quarterstaff`, `item-<id>`).
- **`armed`**: `abil: 'spell'` is "you can use", so the better of the record's ability and the spell's is taken for attack and damage; `die` becomes the imbue die unless the
  record's own (a Monk's) has the higher average; `plus` adds to attack and damage and makes the weapon magic; `attackAdd` adds to the attack roll alone and is the number it had
  when used (Sacred Weapon: Charisma at that moment, at least +1); `types` becomes `alt`, and `resolveAttack` takes the type that hurts the target most (`bestType`, Q5).
- **`melee: true`** means a Melee weapon (by the weapon's kind, a thrown handaxe included), checked when the weapon is named, not a limit to melee attacks.
- **Naming the weapon.** `cast` takes `weapon` (a record key); with none named and exactly one that fits it is used; with none that fits, or several and none named, the cast is
  refused before anything is spent. `nonmagical` ignores the caster's own earlier cast of the same spell, which the new one replaces.
- **`attack` takes `use: <feature id>`** for a feature whose action has `withAttack` (free, on itself, with an `imbue` step). It goes with the attack that takes the Attack action in
  a fight (a weapon's own Damage option; not pooled, Bonus Action or Flurry); the feature handler pays and runs it before the roll. `feature` by hand refuses it.
- **Ending.** A new imbue by the same creature from the same spell or feature ends the old one (`rolls.js`, `imbue`). `settleImbue` (`engine/resolve.js`, called first in
  `settleBonds`, so after every action with no change to `engine.js`) ends a part whose creature has no record of that weapon any more, and the effect when none is left.
- **Old records (Q8).** A weapon record without `die` is not changed; the cast makes the effect and tells the DM with a `manual` naming it; it takes hold at the next remake.
- **Records** gain `die`, `plus`, `trained` and `magic` (a magic item). `trained` repeats `untrained` the other way round; `untrained` stays.
- **Tiers.** Shillelagh and Magic Weapon `auto`; Sacred Weapon `assist` (its light stays the DM's, a `manual` step).
- **Client.** The Attacks tab and the sheet show the imbued numbers; a cast that changes a weapon asks which when more than one fits; Sacred Weapon is chosen with the attack on
  the strike card, and its Features row says so.
