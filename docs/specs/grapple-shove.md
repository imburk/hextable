# Spec: Grapple and Shove

Status: draft by an agent (#459), to be reviewed by the design owner. Covers the debt line T61 (the Grapple
and Shove options of the Unarmed Strike), the Grappled condition's own rules (who holds whom, escape, ending,
dragging), the monster stat blocks that grapple, the Grappler feat, and the AI's part. Every rule below is from
`reference/srd52/srd52-flow.txt`; line numbers refer to that file.

## Problem

Every built character has an Unarmed Strike since #442, but only its Damage option. What is missing:

1. **The two other options.** Grapple and Shove are a saving throw, not an attack roll, and nothing in
   `engine/attacks.js` lets an attack be one.
2. **A hold.** `cond.grappled` exists (`content/srd52/conditions.js`: Speed 0), but it records at most who put it
   on (`source`, when it came from an effect). Nothing says what the hold's escape DC is, how far it reaches, what
   part of the grappler holds it, or that one creature may be held by two.
3. **The ways a hold ends.** The escape check, the grappler's Incapacitated condition, the distance, and a release
   are all the DM's today: `condition()` in `engine/rolls.js` says "Nothing ends it yet: the DM removes it."
4. **Dragging.** A grappler that walks away leaves the held creature behind, and nothing charges the extra foot.
5. **Monsters.** 36 condition steps in the monster pack put on `grappled` with no escape DC, no size limit and
   no count of what holds it; the escape DC lives only in the `text`. "Restrained until the grapple ends" is a
   `manual` line.
6. **The Disadvantage** a Grappled creature has against anyone but its grappler is the condition's `also` text,
   handed to the DM.

## What the SRD says

| What | Rule (SRD 5.2.1) | Lines |
|---|---|---|
| Unarmed Strike | A melee attack using the body to damage, grapple or shove a target within 5 feet. Each use picks one option: Damage, Grapple or Shove. | 34494-34501 |
| Grapple option | The target makes a Strength or Dexterity save (it chooses which) or has the Grappled condition. DC for the save and for escape: 8 + Strength modifier + Proficiency Bonus. Only if the target is no more than one size larger and you have a hand free. | 34508-34514 |
| Shove option | The target makes a Strength or Dexterity save (it chooses which) or you push it 5 feet away or give it the Prone condition. Same DC. Only if the target is no more than one size larger. No hand needed. | 34515-34520 |
| Grappling | One grapple per hand; a stat block may grapple with a tentacle, maw or other part; one creature per part, and that part can't target another creature unless the grapple ends. | 33484-33499 |
| Ending a grapple | The held creature can use its action for a Strength (Athletics) or Dexterity (Acrobatics) check against the escape DC. It also ends if the grappler is Incapacitated or the distance exceeds the grapple's range. The grappler can release it at any time, no action required. | 33500-33505 |
| Grappled condition | Speed 0 and can't increase. Disadvantage on attack rolls against any target but the grappler. The grappler can drag or carry it, each foot costing 1 extra foot unless it is Tiny or two or more sizes smaller. | 33415-33430 |
| Prone | Crawl, or spend half Speed to stand (not at Speed 0). Disadvantage on its attack rolls; attacks against it have Advantage within 5 feet, Disadvantage beyond. | 34009-34020 |
| Incapacitated | No action, Bonus Action or Reaction; Concentration broken. | 33649-33658 |
| Restrained | Speed 0; attacks against it have Advantage, its attacks Disadvantage; Disadvantage on Dexterity saves. | 34071-34078 |
| Attack action | One attack roll with a weapon or an Unarmed Strike; Extra Attack lets movement come between the attacks. | 32702-32716 |
| Extra Attack | Does not stack between classes. | 3690-3698 |
| Opportunity Attacks | A Reaction to make one melee attack with a weapon or an Unarmed Strike when a creature you can see leaves your reach; none for a creature moved without its own movement, action or Reaction. | 2082-2097 |
| Martial Arts | Bonus Action Unarmed Strike; Dexterous Attacks: Dexterity instead of Strength for the save DC of Grapple and Shove. | 11082-11096 |
| Flurry of Blows | 1 Focus Point: two Unarmed Strikes as a Bonus Action. | 11123-11124 |
| Open Hand Technique | On a Flurry hit: Addle, Push (Strength save or pushed up to 15 feet), Topple (Dexterity save or Prone). A rider on a hit, not a Shove. | 11307-11316 |
| Grappler feat | Punch and Grab: once a turn, an Unarmed Strike that hits during the Attack action on your turn can use both Damage and Grapple. Advantage on attack rolls against a creature you grapple. Fast Wrestler: no extra movement to move a creature you grapple that is your size or smaller. | 20089-20105 |
| Powerful Build (Goliath) | Advantage on any ability check to end the Grappled condition. | 19877 |
| Bugbear Warrior | Abduct: no extra movement to move a creature it grapples. Quick Grapple (Bonus Action): Dexterity save DC 13 for a Medium or smaller creature within 10 feet, or Grappled (escape DC 13). Morningstar with Advantage against a creature it grapples. | 45716-45732 |
| Kraken | Tentacle, reach 30 ft: Grappled (escape DC 20) from one of ten tentacles, and Restrained until the grapple ends. | 50340-50349 |
| Mimic | Ability checks made to escape its grapple have Disadvantage. | 51196-51209 |

Two things the SRD leaves open, which the engine does not fill: which way a Shove pushes when the space straight
away is blocked (the engine's push stops, as every push does), and what "carry" means for a grappler that flies or
climbs (the engine drags along the ground only; see Decision 6).

## Goals

- A built character can Grapple or Shove with any Unarmed Strike it may make: the Attack action, an attack Extra
  Attack left, the Monk's Bonus Action strike, and Flurry of Blows.
- A hold is state: who holds whom, the escape DC, the range, and the part that holds. A creature may be held by
  more than one grappler.
- Every way the SRD ends a hold, the engine runs: escape, release, the grappler's incapacitation, distance, and
  the grappler leaving the map.
- A grappler that moves drags what it holds and pays the extra foot.
- Monster grapples put on the same hold, with their escape DC, size limit and number of parts as data.
- The Grappled creature's Disadvantage against others, and the Grappler feat's Advantage, are modifiers.
- Nothing reaches a player that `docs/specs/hidden-information.md` would not send.
- No state version bump (Decision 2).

Not in this spec: Swallow, Fling, Reel and other things a monster does to a creature it holds (they stay
`manual`); Open Hand Technique (a hit rider, its own job); a grappler that flies or climbs carrying its catch.

## The decisions

### Decision 1: an option on the `attack` action, not a new action

```
{ type: 'attack', actor, target, attack: 'unarmed-strike', option: 'grapple' }
{ type: 'attack', actor, target, attack: 'unarmed-strike', option: 'shove', shove: 'push' | 'prone' }
{ type: 'attack', actor, target, attack: 'unarmed-strike', grab: true }        // Grappler: Damage, and Grapple on a hit
```

`option` is `damage` (the default, what happens today), `grapple` or `shove`. It goes on an existing attack because
the SRD makes it one ("a melee attack", 34497): it spends what an attack spends, in the order `attack` already
uses (Flurry of Blows, then a Bonus Action strike, then the pool Extra Attack left, then the Attack action), it is
held to the same reach (5 ft), walls and battle checks, and outside a fight it starts one the same way (`engage`).
Extra Attack needs nothing new: each attack of the pool may be a different option, with movement between.

What is validated, before anything is spent, in this order after the checks `attack` already makes:

1. `option` is one of the three, and anything but `damage` needs an Unarmed Strike (`isUnarmed` in `weapons.js`):
   "Grapple and Shove are options of the Unarmed Strike."
2. `brutal`, `cunning` and `prey` go with the Damage option only (they need a hit).
3. Size: the target's size is at most one step above the attacker's in `SIZES` (`content/schema.js`): "Brenna can
   grapple a creature no more than one size larger than she is; the ogre is Large."
4. Grapple: a free hand (Decision 4), and the attacker does not already hold this target.
5. Shove: `shove` is `push` or `prone`. The attacker chooses when it declares, because the save tells it nothing
   that would change the choice, and a prompt after the save would stop the table for nothing.
6. `grab`: only with the Damage option, on the attacker's own turn, from the Attack action or its pool (not a
   Bonus Action strike), once a turn (`encounter.flags['grab:<id>']`), and with a free hand and the size limit as
   for Grapple. The Grapple part happens only if the Damage hits.

A target immune to Grappled or Prone is not refused: the attack is spent and the log says "Immune to Grappled",
as `condition()` already does. Refusing would tell a player a monster's immunities before they had found them.

**The save.** DC 8 + the ability modifier + Proficiency Bonus. `derive.js` writes it on the Unarmed Strike record
as `dc` (Strength, or with Martial Arts the better of Strength and Dexterity, the same ability its `bonus` uses);
a record without `dc` (a game saved before) works it out at use from `abil.str` and `prof`. **The target chooses
the ability** (34509): the engine chooses for it, the one with the better chance, by `bestSave(s, t, ['str','dex'])`
in `engine/rolls.js`: an automatic success first, never an automatic failure if the other is not, then
Advantage over neither over Disadvantage, then the higher bonus, then Strength. A player is not asked (question
Q2). The save is `savingThrow()` as every save is, so Bardic Inspiration, cover (none in melee), Restrained's
Disadvantage on Dexterity and the Unconscious automatic failure all apply. No attack roll is made, so nothing
that waits for a hit or a miss (Shield, Uncanny Dodge, Sneak Attack, Divine Smite, Stunning Strike) happens.

**What follows a failed save.** Grapple: the hold (Decision 2). Shove `push`: `push(s, t, 5, 'away', e.pos, ev)`,
the forced move `resolve.js` already has (it stops at a wall, a drop or a creature, provokes nothing, and asks a
rider its DC 10 save if the target is a mount). Shove `prone`: `condition(s, t, 'prone', ev)`, which already makes
a rider fall off by `settleRide`.

**Events.** One new event, `{ type: 'strikeOption', actor, target, option: 'grapple' | 'shove', shove? }`, before
the `save` event (which carries `by: actor`), then `cond`, `moved` or nothing. `view.js` passes `strikeOption` to
whoever would be passed an `attack` event between the same two creatures.

### Decision 2: a hold lives on the held creature's `cond.grappled`, and no version bump

```
cond.grappled = {
  source: 'ogre-1',                    // the first hold's grappler, kept so code that reads `source` still works
  holds: [
    { by: 'ogre-1', with: 'hand', escape: 13, range: 5 },
    { by: 'kraken-1', with: 'tentacle', escape: 20, range: 30, escapeDis?: true },
  ],
}
```

- `by` is the grappler's id; `with` is `hand` for an Unarmed Strike or the id of the monster action that put it
  on; `escape` is the escape DC; `range` is the hold's reach in feet (5 for an Unarmed Strike, the action's reach
  or range for a monster: the bugbear's Quick Grapple holds at 10, the kraken's Tentacle at 30); `escapeDis` is the
  mimic's Disadvantage on checks to escape.
- `source` always names `holds[0].by`. It is rewritten when a hold ends, so `settleSeen`, the pocket list and
  `view.js`'s redaction of `source` keep working unchanged.
- The grappler carries nothing. `holdsOf(s, e)` in `engine/world.js` lists the holds whose `by` is `e.id`, by a
  pass over `state.entities` (a table has tens of creatures, and a stored list on both sides would be two copies to
  keep in step).
- A second grappler adds a hold to the list; `condition()` is not called again (it returns early when the
  condition is already there), so a new helper `grip(s, t, hold, ev)` in `engine/rolls.js` adds holds and calls
  `condition()` only for the first.

**No state version bump.** Every new field is optional, and a `cond.grappled` without `holds` means what it means
today: a grapple the DM put on, or one a monster's action put on in a game saved before this, which the engine does
not end and cannot be escaped by the `escape` action ("This grapple has no escape DC in the game; the DM ends it").
A remake from the sheet copies `cond` (`engine/sheets.js`), so holds survive it. Creatures made before the monster
pack gains its escape DCs carry their own copy of their actions, and their grapples stay the DM's until the DM adds
the creature again (question Q7).

### Decision 3: one pass ends holds, after every action

`settleHolds(s, ev)` in `engine/resolve.js` runs in `apply()`'s after-pass beside `settleBonds` (`engine.js`). For
every hold it ends the hold when:

- the grappler has the Incapacitated condition, or any condition that includes it (`incapacitated()` in
  `modifiers.js`; this covers 0 Hit Points through Unconscious), or is dead (33503);
- the distance between them, measured as range is (`apart` × 5 ft), exceeds the hold's `range` (33503): a push,
  a teleport, Misty Step, a fall;
- the grappler is no longer in `state.entities` (`settleSeen` ends it today; it is changed to end only that hold).

Ending a hold is one function, `endHold(s, t, by, why, ev)`: the hold leaves the list, `source` is rewritten, the
condition goes when the list is empty, and a Restrained put on "until the grapple ends" by the same grappler ends
with it (Decision 7). The event is the existing `condEnd` with two new fields: `{ type: 'condEnd', id, cond:
'grappled', by, why: 'escaped' | 'released' | 'incapacitated' | 'distance' | 'gone' }`. When another hold is left
the event is `{ type: 'holdEnd', id, by, why }` instead, because the condition stays.

A pass after the action, rather than a check at each place a creature moves or falls, is what `settleBonds` and
`settleRiders` already do for the same kind of rule, and it cannot miss a new way of moving.

### Decision 4: hands are counted from what the engine knows

A built character has two hands. A Shield (`e.shield`) takes one, and each hold it has `with: 'hand'` takes one.
The engine does not know whether the other hand holds a weapon (the sheet records a Shield, not what each hand
holds, as `handsFull` in `weapons.js` already says), and the SRD lets a creature drop or stow a weapon as part of
the Attack action (32705), so a sword in hand does not refuse a grapple. Two more refusals in `handsFull`:

- an attack with a Two-Handed weapon, or a Versatile weapon's two-handed attack, while a hand holds a creature;
- a second Unarmed grapple with a Shield on, or a third without.

A monster's grapples go by its parts, not hands (Decision 7).

### Decision 5: escape and release are actions of their own

```
{ type: 'escape', actor, from?: grapplerId, skill?: 'athletics' | 'acrobatics' }
{ type: 'release', actor, target }
```

`escape` (in `engine/features.js`, beside `check`, whose `abilityCheck` it uses; `release` beside it): the actor has a hold on it by `from` (it may be left out when
there is one), the actor is up and not Incapacitated (`able`), and in a fight it is the actor's turn and costs its
action (33500: "use its action"; out of a fight it costs nothing). The check is `abilityCheck()` with the chosen
skill; left out, the engine takes the one with the better chance, as for the save. Disadvantage from `escapeDis`;
Advantage from a `check` modifier with the new tag `check.escape` (Powerful Build, when species are in the pack).
On a total at least the hold's `escape`, `endHold(..., 'escaped')`. The event is the existing `check` event with
`escape: by` and `success`; its `dc` is sent as Decision 9 says.

`release`: the actor holds the target. No action, no turn needed, in or out of a fight (33504: "at any time"). A
release is also how a creature lets go to free a hand.

### Decision 6: a grappler that moves drags what it holds

`move` needs no new field. When the mover holds creatures:

- **Cost.** Every step of the route costs `1 + n` times its cost, where `n` counts the held creatures that are
  not exempt: a held creature is exempt when it is Tiny, or two or more sizes smaller than the grappler (33428), or
  the grappler's size or smaller and the grappler has the Grappler feat (Fast Wrestler), or the grappler has the
  trait `dragFree` (the bugbears' Abduct). `moveOptions` in `engine/world.js` takes the factor, so the move preview,
  the AI and the "Too far" message all see the same cost. One extra foot for each creature dragged is a reading of
  "every foot of movement costs it 1 extra foot" for each condition (question Q3).
- **The drag.** After each step of the grappler, each held creature now beyond its hold's range is pulled toward
  the grappler with `push(s, t, feet, 'toward', e.pos, ev)` until it is back in range. It is moved without its own
  movement, so it provokes no Opportunity Attack (2088-2090); a zone it is pulled into goes off, as for any push.
  If the pull cannot bring it back into range (a wall, a door, a creature, a drop), the grappler's step is undone
  and the walk stops there: "Brenna can't drag the goblin any further." The hold is never ended by a move the
  grappler chose.
- **Off the ground.** A grappler whose route leaves the ground (flying or climbing) while it holds a creature is
  refused: "The engine drags along the ground only. Release the goblin first, or the DM moves both." (question Q6)
- **Walking together.** A creature that holds another does not follow a leader or keep a marching place; `march`
  skips it, with a note.
- A held creature has Speed 0 already, so it cannot `move`, `dash` or `stand` (Prone, Speed 0: 34013).

### Decision 7: monster stat blocks put on the same hold

A condition step that puts on `grappled` gains four keys, in `STEP_KEYS.condition` in `content/schema.js`:

```
{ condition: 'grappled', escape: 13, largest: 'large', holds: 4, escapeDis?: true }
{ condition: 'restrained', whileHeld: true }
```

- `escape` (an integer, 1 to 40) is required by the linter on every `grappled` step of the SRD pack and allowed on
  no other condition. `largest` is the size limit, as the `move` step's `largest` already is ("If the target is a
  Large or smaller creature"); a target above it is not grappled, and nothing is said but the condition missing.
- `holds` is how many creatures that action's part can hold at once (the kraken's "one of ten tentacles"), 1 when
  left out. While the part holds that many, the action can't target another creature (33496-33499): `takeAction`
  refuses it ("The ankheg's Bite holds the fighter; it can't bite another until it lets go"), and the AI does not
  offer it (Decision 8). The hold's `with` is the action's id and its `range` the action's reach or range.
- `whileHeld: true` on a step in the same action ties that condition to the hold: the cond entry gets
  `grapple: by`, and `endHold` ends it. This covers the stat blocks that Restrain "until the grapple ends" (the kraken, the
  roper and others), which are `manual` lines or `text` today.
- A trait `dragFree: true` (Abduct) is a new trait key.
- An attack step gains `advantageIf: ['target.grappledBySelf']` (the bugbear's Morningstar, the ankheg's Bite),
  the key the `save` step already has, read by `rollToHit`.

The 36 grapple steps in `content/srd52/monsters-*.js` are entered with these keys in the same job, each checked
against its stat block, and their `text` loses what the data now says.

**Monsters and the Unarmed Strike.** A pack monster has no Unarmed Strike record and is not given one: its stat
block says how it grapples (question Q5).

### Decision 8: the AI

In the stage that brings each part in, the AI learns only what the engine would otherwise refuse or waste:

- A monster whose action part is full (`holds`) is not offered that action against another target.
- A monster that is Grappled, has no attack that reaches a foe from where it stands, and holds no one, takes the
  `escape` action, if the hold has an escape DC. Otherwise it fights as it does now; its attacks on anyone but the
  grappler get their Disadvantage from the modifier, and it does not weigh that.
- A monster never releases a creature it holds, and a monster that holds one drags it when it walks (`approach`
  already goes through `moveOptions`, which now carries the cost).
- The AI does not Grapple or Shove with an Unarmed Strike (pack monsters have none), and the companion brain does
  not either. A later job may teach a built character's autoplay to shove a foe Prone for an ally beside it.

What goes to the DM as `manual`: a grapple with no escape DC in the game (Decision 2); Swallow, Fling, Reel and the
other things done to a held creature; a grappler that would carry a creature off the ground; dragging a rider off
its mount (the existing push message); Powerful Build until species are in the pack.

### Decision 9: what a player is sent

- `cond.grappled` is visible (`visible: true` in its data), as now. Each creature in a player's view gains
  `heldBy: [ids]`, the grapplers of its holds, with an id the player's side does not know of shown as `someone`
  (the same redaction `view.js` gives `source`).
- The escape DC is sent with the hold to the held creature's controller only when the grappler is on the party's
  side (it is then the party's own number). A monster's escape DC is a monster number, which hidden-information.md
  keeps from players: the `escape` check event shows the player's total and whether it succeeded, not the DC
  (question Q4).
- `strikeOption`, `holdEnd` and the new fields on `condEnd` go where `cond` and `attack` already go.

### Decision 10: Opportunity Attacks, reactions and the rest of the turn

- An Opportunity Attack may be an Unarmed Strike (2094), and its Grapple option would stop the mover (Speed 0).
  Stages G1 to G5 keep the Opportunity Attack as it is (the Damage option). Stage G6 adds a third answer to the
  Opportunity Attack prompt of a creature with an Unarmed Strike and a free hand, "Grapple instead", offered only
  when it asks (`ask`), never as a standing instruction; `walk` then stops the mover when its Speed is 0 after the
  reaction (question Q1).
- A grappler that drags a creature past foes provokes as it always would; the creature dragged does not.
- Features that go with "the Attack action" (Extra Attack, Action Surge's second action) count a Grapple or Shove
  as one of its attacks. Features that need a hit do not fire on one.
- Flurry of Blows and the Monk's Bonus Action strike may use either option; Dexterous Attacks gives the DC.

## The state, in one place

| Where | Field | New? | Meaning |
|---|---|---|---|
| held creature | `cond.grappled.holds[]` `{ by, with, escape, range, escapeDis? }` | new, optional | Each hold on it |
| held creature | `cond.grappled.source` | kept | Always `holds[0].by` |
| any creature | `cond.<id>.grapple` | new, optional | This condition ends with the hold `by` this id (`whileHeld`) |
| Unarmed Strike record | `dc` | new, optional | Save DC for Grapple and Shove (derive.js) |
| encounter | `flags['grab:<id>']` | new key | Punch and Grab used this turn |
| monster trait | `dragFree` | new pack key | Abduct |
| condition step | `escape`, `largest`, `holds`, `escapeDis`, `whileHeld` | new pack keys | Decision 7 |
| attack step | `advantageIf` | new pack key | As on the save step |
| modifier tags | `target.notGrappler`, `target.grappledBySelf`, `check.escape` | new | Decision 2, 5, 7 |

The Grappled condition's data gains `{ on: 'attack.roll', op: 'disadvantage', when: ['target.notGrappler'] }`, and
its `also` text keeps only the drag (which the engine now runs, so `also` goes once G3 is built). The Grappler
feat's `assist` becomes `auto` once G2 and G3 are in: Advantage is a `{ on: 'attack.roll', op: 'advantage', when:
['target.grappledBySelf'] }` modifier, Fast Wrestler is read by the drag, and Punch and Grab is `grab`.

No state version bump: see Decision 2.

## Client controls (a separate job)

For `docs/specs/player-screen.md`'s turn bar and the action panel; written here so the rules jobs leave room:

- The Unarmed Strike in the attack picker shows three choices: Damage, Grapple, Shove; Shove then asks Push 5 ft
  or Knock Prone. With the Grappler feat, Damage shows "and grab" as a toggle when Punch and Grab is still unused.
  A refusal (size, no free hand) is shown on the choice before it is sent, from the same check the engine runs.
- A Grappled creature's panel shows **Escape** (Athletics or Acrobatics, each with its bonus), costing the action.
- A grappler's panel shows **Let go of X** for each creature it holds, at any time.
- A line joins grappler and held on the map; the condition chip reads "Grappled by the ogre" and, when it is sent,
  "(escape DC 13)".
- The move preview shows the doubled cost and the held creature's path behind the grappler.

## Job split

Each stage is one pull request with its own tests; every one leaves the valley playing as it does now.

**G1. Shove.** The `option` field, `shove`, the size check, the DC on the Unarmed Strike record, `bestSave`, the
`strikeOption` event, push and Prone. No new state.
Files: `packages/rules/src/engine/attacks.js`, `engine/resolve.js` (`strikeOption()`), `engine/rolls.js`
(`bestSave`), `derive.js` (`dc`), `view.js` (the event). Test: `packages/rules/test/shove.test.js`: push moves 5 ft
away and stops at a wall; Prone; the save is the better of the two; a target two sizes larger is refused; with Extra
Attack a Shove then a Damage attack in one action; Flurry with Shove; a ridden mount pushed asks its rider; Martial
Arts DC from Dexterity; an immune target spends the attack.

**G2. Grapple and the hold.** `option: 'grapple'`, `grip`, `holdsOf`, `endHold`, `settleHolds` in the after-pass,
`escape` and `release` (in `engine/features.js`), hands, the Two-Handed refusal, the `target.notGrappler` and `target.grappledBySelf` tags, the
condition's new modifier, `settleSeen` ending one hold, `heldBy` in the view, `grab` and the Grappler feat's
Advantage. Files: `engine/attacks.js`, `engine/features.js`, `engine/resolve.js`, `engine/rolls.js`, `engine/world.js` (`holdsOf`),
`engine.js` (the after-pass call), `modifiers.js` (tags), `weapons.js` (`handsFull`), `content/schema.js` (`TAGS`),
`content/srd52/conditions.js`, `content/srd52/feats.js` (Grappler text and tier), `view.js`. Tests:
`packages/rules/test/grapple.test.js`: a grapple sets Speed 0 and the hold; two grapplers on one creature; escape
by Athletics and by Acrobatics, in and out of a fight; release with no action; the grappler knocked Unconscious, the
held creature teleported 30 ft, the grappler pushed away, the grappler vanishing; a third hand refused, a Shield
counted, a greatsword refused while holding; Disadvantage against another but not the grappler; Punch and Grab once
a turn; an old save's `cond.grappled` without `holds` is left alone and its escape refused; a player's view shows
`heldBy` and no monster escape DC.

**G3. Dragging.** The cost factor in `moveOptions`, the pull after each step, the stop, the refusal off the ground,
`march` skipping a grappler, Fast Wrestler. Files: `engine/world.js`, `engine/movement.js`. Tests:
`packages/rules/test/grapple-drag.test.js`: 30 ft of Speed drags a Medium creature 15 ft; a Tiny one costs nothing
extra; two held cost triple; the dragged creature provokes nothing and the grappler does; a door stops the walk;
squares and hexes; the AI's `approach` with a held creature.

**G4. Monster grapples.** The condition step's `escape`, `largest`, `holds`, `escapeDis`, `whileHeld`; the trait
`dragFree`; the attack step's `advantageIf`; `takeAction` refusing a full part; the 36 SRD entries entered and
checked. Files: `content/schema.js`, `effects.js` (the condition step reads the keys), `engine/attacks.js`
(`takeAction`), `engine/resolve.js` (`rollToHit` and `advantageIf`), `content/srd52/monsters-a-c.js`,
`monsters-d-g.js`, `monsters-h-o.js`, `monsters-p-z.js`. Tests: `packages/rules/test/grapple-monsters.test.js`:
the ankheg's Bite grapples a Large target and not a Huge one, and can't bite another while holding; the kraken holds
ten and Restrains them until each grapple ends; the bugbear's Quick Grapple at 10 ft and its Abduct; the mimic's
Disadvantage; `npm run content` with no problems.

**G5. The AI.** Decision 8. Files: `packages/rules/src/ai.js`. Tests: `packages/rules/test/ai-grapple.test.js`: a
held goblin with nothing in reach escapes; a full Bite is not offered against another; a monster drags as it walks.

**G6. Grapple as an Opportunity Attack.** Decision 10. Files: `reactions.js`, `engine/movement.js`. Test: in
`grapple.test.js`, a mover grappled by an Opportunity Attack stops where it was.

**G7. Client** (the separate job above). Files: `packages/client/` (the attack picker, the action panel, the map
line). Checked with a smoke pass.

**DEBT.** G1 to G4 together strike T61; each stage strikes the part it builds and adds a line for what it leaves.

## Questions for the owner

Each has the default the jobs above are written to.

- **Q1. Grapple as an Opportunity Attack.** The SRD allows an Unarmed Strike there, and the Grapple option stops
  the mover. Offer it? Default: yes, as stage G6, only when the creature's instruction is to ask, never by standing
  instruction.
- **Q2. Who picks the save, Strength or Dexterity?** The SRD says the target. Default: the engine picks the better
  one for every target, players included, with no prompt. The alternative is to ask a player whose character is the
  target, which pauses the table for a choice that is nearly always the same.
- **Q3. Dragging two creatures.** Default: one extra foot for each held creature that is not exempt (triple cost
  for two). The other reading is one extra foot however many.
- **Q4. Is a monster's escape DC shown to players?** Default: no, it is a monster number; the player sees the total
  and the result. The alternative is to show it on the condition chip, as a DM at a table often says it aloud.
- **Q5. May a pack monster grapple or shove with an Unarmed Strike?** The SRD says characters "typically" grapple
  by Unarmed Strike and monsters by their stat blocks. Default: no; a monster grapples only as its stat block says,
  and the DM does anything else.
- **Q6. Carrying while flying or climbing.** Default: refused with a message; the DM moves both. A later job could
  carry the held creature along the grappler's path in the air, with the fall rules when the hold ends.
- **Q7. Monsters in saved games.** A creature keeps its own copy of its actions, so one added before G4 grapples
  with no escape DC. Default: no migration; the DM adds the creature again to get the new data. The alternative is
  a migration that refreshes the actions of every creature made from a pack monster, which would also bring in every
  other content fix since it was made.
- **Q8. Shove's choice.** Default: Push or Prone is chosen when the Shove is declared, not after the save fails.

## Build notes

**G1 (Shove), #462.** Built to Decisions 1 and 9 and the defaults of Q2 and Q8. What the build settled:

- `option` and `shove` are checked in `optionOf` (`engine/attacks.js`), after the range and wall checks and before anything is shown,
  spent or started, so a refusal (and a size refusal outside a fight) changes nothing. A pack monster's action refuses both fields.
  `option: 'grapple'` is refused with "not in the game yet" until G2 builds it; `grab` is not read yet.
- `strikeOption()` is in `engine/resolve.js` beside `resolveAttack` because it needs `push`, which stays private to that module.
  It makes no attack roll, so it does not end hiding (the SRD's Hide ends on an attack roll) and sets no `attacked` flag; it does
  renew Rage, as any save forced on an enemy does. The `save` event carries `by` (the actor), as Decision 1 says; `view.js` drops
  `by` where the actor is not one the player knows.
- `bestSave(s, t, abils, from, about)` in `engine/rolls.js` judges the abilities as `savingThrow` does and rolls nothing.
- The DC is `atk.dc` when the record has it; otherwise `8 + the modifier of the ability the attack uses (atk.abil, Strength if none) +
  Proficiency Bonus`. This differs from Decision 1's "from `abil.str`" only for a Monk's record saved before `dc` existed, where it
  keeps Dexterous Attacks.
- `dc` had to be added to `ATTACK_FIELDS` in `content/schema.js` (a whole number 1 to 40), or `lintRecord` would refuse a record
  that carries it.
- A Shove at a ridden mount runs the existing `push`: the rider's DC 10 Dexterity save comes first; a push of the rider itself
  is handed to the DM as `push` already does.
- Fix round 1 of #463: `push()` now returns what became of it (`moved`, `blocked`, `aloft`, `mount`). A failed Shove-push that is blocked by a
  wall, a drop or a creature logs a note saying so; one on a creature standing on nothing (a flyer) hands the DM a `manual` event, since
  the engine cannot move it and the SRD lets it be pushed. The save and the spent attack stay. `grab` is refused ("Punch and Grab is not in
  the game yet") until G2; `option`, `shove` and `grab` are refused on a pack monster's action by `attack` and by `act`; `dc` is allowed
  only on an Unarmed Strike record; a Shove for Prone at a target already Prone is allowed and logged as such. The client log line for
  `strikeOption` is left for G7.
