# SRD audit: what the engine and the specs took from memory

Checked against the official SRD 5.2 text (`srd52-flow.txt`, the "Rules Glossary" and
"Playing the Game" chapters, the Equipment tables, the Rogue and Fighter classes and the Traps
section of the Gameplay Toolbox). Code read: `packages/rules/src/engine.js`, `sight.js`, `space.js`,
`durations.js`, `modifiers.js`. Nothing in the engine was changed.

Verdicts: **matches**, **differs** (how), **silent** (the SRD says nothing, so it is a design choice).

## Part 1: data corrected

### Conditions (`content/srd52/conditions.js`)

All 15 were compared with their Rules Glossary entries. `modifiers` matched the SRD in every case.
The `also` text (what the DM is shown) had these faults, now fixed:

- **Grappled**: the Movable rule was missing (the grappler pays 1 extra foot per foot when it drags or
  carries the target, unless the target is Tiny or two or more sizes smaller). Added.
- **Frightened**: said "while it can see the source"; the SRD says the source must be within line of sight. Fixed.
- **Incapacitated**: `also` said Concentration is broken. The engine already does that (`concentrationLost`),
  so the line was removed; only "cannot speak" is left to the DM.
- **Invisible**: said "cannot be targeted by anything that needs sight". The SRD says the creature is not
  affected by effects that need their target to be *seen*, unless the effect's creator can see it, and that
  its equipment is concealed too. Reworded.
- **Petrified**: said "turned to stone with everything it carries" and "cannot be Poisoned". The SRD says
  nonmagical worn or carried objects change too, weight rises tenfold, and it has Immunity to the Poisoned
  condition. Reworded.
- **Unconscious**: "it remains Prone when the condition ends" was missing. Added.
- Blinded, Charmed, Deafened, Exhaustion, Paralyzed, Poisoned, Restrained, Stunned: no change; set `checked: true`.

**Prone stays `checked: false`.** The SRD says a Prone creature's only movement is to crawl (each foot
costs 1 extra foot, 2 in Difficult Terrain) or to spend half its Speed to stand. The engine stands every
Prone creature automatically at the start of its turn and has no crawling. Putting that in `also` would
make the DM see a manual note on every fall and shove (and breaks `effects.test.js`, which treats Prone as
fully enforced), so it is recorded here instead. Two tests would need rewriting to turn that on.

### SRD sample traps (`content/srd52/objects.js`)

All eight compared with the Traps section; all are now `checked: true`. Numbers (find DC, save DC,
damage dice and type, save ability, conditions, severity and levels) matched in every entry. Corrections
were to the descriptive `text` and the manual steps only:

- **Rolling Stone**: severity is "Deadly (levels 11-16) or Nuisance (levels 17-20)"; the entry said only
  Deadly. The manual step now also says the stone moves through creatures' spaces and they through its space
  (Difficult Terrain), stops at a wall, and is Immune to Poison and Psychic.
- **Fire-Casting Statue**: text now says the glyph is found from within 5 feet and that defacing it with a
  sharp tool as an action disarms the trap (the DM does that; the engine only models the wedge).
- **Poisoned Darts**: text now says plugging all the dart holes disarms it.
- **Hidden Pit**: text now says the pit's smooth walls need a Climb Speed, climbing gear or magic to scale.
- Not expressible in the vocabulary, already stated in the entries: Hidden Pit, Spiked Pit and Rolling
  Stone are found with a Study action (Intelligence, Investigation, DC 15) but the engine's Search rolls
  Perception against `dc.find`; a failed Poisoned Needle disarm triggers the trap in the SRD but the DM does
  that here; Fire-Casting Statue and Poisoned Darts fire on the first entry on a turn or on starting a turn
  there, which the single `enter` trigger approximates.
- Level-scaled numbers (levels 5-20) are not in the pack and were left out.

## Part 2: rule by rule

### Falling damage and landing Prone
- SRD (Rules Glossary, "Falling"): 1d6 Bludgeoning per 10 feet fallen, at most 20d6, at the end of the fall;
  the creature lands Prone unless it took no damage. A fall into water lets a Reaction DC 15 Athletics or
  Acrobatics check halve the damage.
- Hextable (`fall()`, `gravity()`): `floor(feet/10)` d6, capped at 20, Prone only if damage actually landed
  (after Resistance and Immunity). Runs after every action for anything with nothing beneath it.
- **Matches** (this resolves the `(check)` at maps-and-objects.md line 476). The water halving does not exist:
  water tiles are impassable (`cost: Infinity`).

### A flying creature falls; hover
- SRD ("Flying"): while flying you fall if Incapacitated or Prone or your Fly Speed drops to 0, unless you can hover.
- Hextable: `aloft()` needs a Fly Speed above 0 and not Prone or Incapacitated unless `hover`.
- **Matches** (resolves the `(check)` at maps-and-objects.md line 521). Speed changes (a set value or an addition) apply to every way of moving through `speedOf`; the SRD's
  rule that halving Speed halves special speeds too has no op in the vocabulary.

### Climbing and swimming costs
- SRD ("Climbing", "Swimming"): each foot of movement costs 1 extra foot (2 extra in Difficult Terrain); a Climb
  or Swim Speed removes the extra cost. The GM may ask DC 15 Athletics for a slippery climb or rough water.
- Hextable (`moveOptions`): a climb costs the horizontal hex at terrain cost plus 2 per foot of height, 1 per foot
  with a Climb Speed. No check is asked. Swimming: water is impassable, no cost rule, no Swim Speed use.
- Climbing: **differs slightly**. The vertical feet match; the horizontal foot of the climbing step is not
  doubled, which an SRD reading of "each foot of movement while climbing" would double. The 2.5/5 ft step
  thresholds are a design choice (the SRD lists only "steep stairs" as Difficult Terrain).
- Swimming: **differs** (not built). Strength (Athletics) checks for climbing and rough water are optional in the
  SRD, so skipping them is fine.

### Difficult Terrain
- SRD ("Movement and Position"): every foot in Difficult Terrain costs 1 extra foot, even if several things in
  the space count.
- Hextable: terrain cost 2 for forest; steps of more than 2.5 ft cost 2; the maximum of the two applies, not the sum.
- **Matches** for terrain and for non-stacking. **Differs**: another creature's space is Difficult Terrain
  for you unless it is Tiny or your ally; the engine never charges that.

### Interacting with objects on your turn
- SRD ("Time-Limited Object Interactions", "Your Turn: Interacting with Things", Utilize): one free object
  interaction per turn, during your move or action; a second needs the Utilize action; some objects always
  need an action.
- Hextable (`use`): in a fight, the first `time: free` use of the turn is free (`flags.interact`); any later
  one, and every `time: action` use, spends the action. Outside a fight uses cost nothing.
- **Matches** (resolves the build-note `(check)`). There is no "Utilize" action as such, and a `time: action`
  use (lock, pick) does not consume the free interaction, which is a small difference.

### Search, Study, Hide, Influence, Dodge, Dash, Disengage
- **Search** (SRD, Actions table and "Search"): a Wisdom check, skill by target (Insight, Medicine, Perception,
  Survival). Hextable: one Perception roll against every hidden object within 15 feet that is in a shown hex
  and in line (`search`). **Differs**: only Perception, only objects, never hidden creatures (S6 not built), and
  15 ft is a design choice (the SRD only requires searching near the thing).
- **Study** (Intelligence: Arcana, History, Investigation, Nature, Religion): **not built.** The `check` action
  rolls any skill but takes no action in a fight. Study-found traps (the pits, Rolling Stone) fall back to Search.
- **Hide** (SRD "Hide"): DC 15 Dexterity (Stealth) while Heavily Obscured or behind three-quarters or total
  cover and out of every enemy's sight; you gain Invisible while hidden; the check total is the DC to find you;
  it ends on a sound louder than a whisper, being found, an attack roll, or a spell with a Verbal component.
  Hextable: **not built**; `hidden` is a DM switch. The sight spec's Decision 5 matches the SRD on all of the above
  (resolves its `(check)`s at lines 146-164), including DC 15.
- **Influence** (SRD): the GM sorts the monster's request into willing, unwilling or hesitant; a hesitant one
  takes a check, default DC the higher of 15 and its Intelligence, modified by Friendly or Hostile attitude.
  Hextable: **not built.** Attitudes are not tracked.
- **Dodge** (SRD "Dodge"): until the start of your next turn, attacks against you have Disadvantage if you
  can see the attacker, and your Dexterity saves have Advantage; lost if Incapacitated or Speed 0.
  Hextable: `dodging` gives Disadvantage on every attack against and Advantage on Dex saves, cleared at the
  start of the creature's turn. **Differs**: it ignores "if you can see the attacker", and does not end when the
  creature becomes Incapacitated or its Speed reaches 0.
- **Dash** (SRD): extra movement equal to your Speed after modifiers; may use a special speed instead.
  Hextable: adds `speedOf()` to the budget, counted per way of moving. **Matches.** Fighting only.
- **Disengage** (SRD): your movement does not provoke Opportunity Attacks for the rest of the turn.
  Hextable: sets `disengaged`, cleared at endTurn; the goblin's Nimble Escape makes it a Bonus Action. **Matches.**
  Cunning Action (Rogue) is not implemented for Dash, Disengage or Hide, so the Rogue pregen cannot use it.
- **Help, Ready, Magic**: Help (give Advantage on an ally's next check or attack; or first aid) and Ready are
  **not built**.

### Opportunity attacks
- SRD ("Opportunity Attacks"): you may use a Reaction for one melee attack when a creature *you can see* leaves
  your reach; it occurs right before it leaves; Disengage, teleporting and being moved without using your own
  movement or actions do not provoke.
- Hextable (`move`, `threatsAt`): each hostile, non-Incapacitated creature with an unused Reaction and a melee
  attack, adjacent to the mover's previous hex with a clear line, attacks before the step that takes the mover out
  of reach. Pushes and falls never provoke.
- **Matches** on the trigger, timing and exemptions. **Differs**: reach is always 1 hex (5 ft), so longer-reach
  weapons and creatures are ignored; "you can see" is not tested.

### Cover
- SRD ("Cover", "Playing the Game: Cover"): half +2 AC and Dex saves (another creature or an object covering at
  least half the target), three-quarters +5 (an object covering at least three-quarters), total cannot be
  targeted directly; only the most protective degree applies; cover counts only if the attack comes from the
  other side of it.
- Hextable (`coverOf`): corners of the target hex reached from the attacker: 5-6 none, 3-4 half, 1-2
  three-quarters, 0 total; a rail or low wall gives half; a creature whose hex centre lies within 1.5 ft of the
  line gives half. Bonus is added to AC and to Dexterity saves (`COVER`). Table rules `cover` and `creatureCover`.
- **Matches** on the bonuses (resolves the `(check)`s at sight.md 82-83), the "creatures give cover" question
  (SRD yes, but only half, which matches since a creature never gives three-quarters; resolves line 90), total
  cover and highest-only. The corner count and the 1.5 ft rule are **design choices** (the SRD gives no geometry).

### Ranged attacks in close combat, and long range
- SRD ("Ranged Attacks", "Ranged Attacks in Close Combat"): Disadvantage beyond normal range, no attack beyond
  long range; Disadvantage on a ranged attack roll if you are within 5 feet of an enemy who can see you and is
  not Incapacitated.
- Hextable (`rollMode`, `checkRange`): long-range Disadvantage and a hard stop at the long range; Disadvantage for
  any hostile standing creature within 1 hex with no total cover between. Traps are exempt.
- Long range: **matches.** Close combat: **differs**: it ignores whether the enemy can see you and whether it is
  Incapacitated, so an enemy that is Stunned or Paralyzed beside the archer still imposes Disadvantage.

### Unseen attackers and targets
- SRD ("Unseen Attackers and Targets"): attacking a target you cannot see has Disadvantage (even when you guess
  or hear it); if the target cannot see you, you have Advantage; a hidden attacker gives away its position
  when the attack hits or misses.
- Hextable: the tag `attacker.unseen` exists in the vocabulary but `judge()` never answers it; there is no
  `canSee`. Only the Blinded and Invisible condition modifiers (applied unconditionally) approximate it.
- **Differs / not built** (sight tasks S4-S6). A creature attacking from darkness or an unseen target never
  changes the roll. The spec's decision 3 wording (unseen means Disadvantage or Advantage) **matches** the SRD.

### Blinded, Invisible, Heavily and Lightly Obscured
- SRD: Blinded cannot see, fails sight checks, attacks against you have Advantage and yours Disadvantage.
  Invisible: Advantage on Initiative; not affected by effects needing a target to be seen unless seen somehow;
  attacks against you Disadvantage and yours Advantage, except against creatures that can somehow see you.
  Lightly Obscured (Dim Light, patchy fog): Disadvantage on sight-based Perception checks. Heavily Obscured
  (Darkness, heavy fog): you have the Blinded condition when trying to see something there.
- Hextable: Blinded and Invisible modifiers match the text (Invisible also gives Advantage on Initiative) and are
  always on. There is no light, no Obscured areas and no concept of a creature that can see the Invisible.
- Conditions: **match** (now audited). Obscured areas: **not built**. The spec's "(check all three)" in
  Decision 3 **matches** the SRD.

### Darkvision, Blindsight, Tremorsense, Truesight
- SRD: Darkvision sees Dim Light as bright and Darkness as Dim Light, in gray, within range. Blindsight sees
  anything not behind total cover without sight, even Blinded or in Darkness, including Invisible. Tremorsense
  pinpoints creatures and moving objects touching the same surface or liquid, cannot detect those in the air,
  and is not sight. Truesight sees in normal and magical Darkness, Invisible creatures, through visual
  illusions, true forms, and into the Ethereal Plane.
- Hextable: **not built.** The record schema has no `senses` field (S3 not done), no monster `senses` reach the
  engine. The sight spec's Decision 4 matches the SRD for Darkvision and Blindsight, and gives Truesight less than the SRD.
  One point **differs**: the spec says Tremorsense "defeats hiding"; the SRD says it is not sight, so a target
  known only by tremorsense is still an unseen target (Disadvantage on attacks).

### Passive Perception
- SRD ("Passive Perception"): 10 plus the Wisdom (Perception) check bonus, +5 with Advantage, -5 with Disadvantage.
- Hextable (`passive`): the same formula, including modifiers such as Poisoned and Exhaustion. **Matches.** It is
  used only for the optional `passiveFind` rule (off by default); that is a design choice.

### Concentration
- SRD ("Concentration"): ends when you start another Concentration effect, when you take damage and fail a
  Constitution save (DC the higher of 10 or half the damage rounded down, at most 30), or when Incapacitated or dead.
- Hextable (`concentrationCheck`, `concentrationLost`, `cast`): exactly this, automatic and logged.
- **Matches** (resolves the `(check)` at rules-expansion.md line 603). The DC uses the damage after Resistance,
  which is what "damage taken" means. Casting a spell that needs Concentration with another running ends the old
  one before the new one starts, which matches.

### Dropping to 0 Hit Points, massive damage, death saves, stabilizing
- SRD: a monster dies at 0 (GM may choose otherwise). A character who drops to 0 with damage left over equal to or
  above the Hit Point maximum dies; otherwise Unconscious and makes Death Saves at the start of each turn:
  10 or more succeeds, below 10 fails, a 1 is two failures, a 20 restores 1 HP; three of either ends it; counts
  reset on regaining HP or becoming Stable. Damage at 0 HP is a failure (two for a critical hit) and kills
  outright if it equals or exceeds the maximum. Stabilizing is a Help action with a DC 10 Wisdom (Medicine) check;
  Stable creatures regain 1 HP after 1d4 hours; damage ends Stable. Knocking out with a melee attack leaves 1 HP.
- Hextable (`damage`, `deathSave`, `heal`): monsters die at 0; massive damage on the first drop is right; the saves
  and the roll-of-1 and roll-of-20 rules are right; three successes make the creature Stable.
- **Matches**: monsters, first-drop massive damage, the save thresholds, a 1 and a 20, damage at 0 HP (one or two
  failures) and Stable ending on damage.
- **Differs**: (1) damage taken at 0 HP never kills outright for equalling the maximum; (2) the success and failure
  counts are not reset when a creature becomes Stable, so after being damaged out of Stable, the old three
  successes make the next one succeed it again; (3) Exhaustion's `save.death` penalty is in the data but
  `deathSave` rolls a bare d20; (4) Death saves are only rolled in a fight.
- **Not built**: Help to stabilize (DC 10 Medicine), the 1d4-hour recovery, Knocking Out a Creature, Temporary Hit Points.

### Critical hits
- SRD ("Critical Hit", "Damage and Healing"): a 20 on an attack roll always hits and is a Critical Hit, a 1 always
  misses; roll all the attack's damage dice twice (Sneak Attack included) and add modifiers once.
- Hextable: nat 20 hits, nat 1 misses; `roll(..., {crit})` doubles the dice, not the bonus; automatic crits from
  Paralyzed or Unconscious within 5 ft (`crit` modifier). **Matches.** Only attack rolls auto-hit or miss, as in the SRD.

### Resistance, Vulnerability, Immunity order
- SRD ("Resistance and Vulnerability", "Order of Application", "Immunity"): adjustments such as bonuses,
  penalties or multipliers first; Resistance second (halved, rounded down); Vulnerability third (doubled); neither
  stacks with itself; Immunity means no damage.
- Hextable (`damage`): Immunity then `else if` Resistance then `else if` Vulnerability, so only one applies.
- **Differs**: a creature with both Resistance and Vulnerability to a type is only halved; the SRD halves and then
  doubles (28 Fire damage with both gives 14 then 28, not 14). No stacking and rounding down are right. Flat
  reductions (the SRD's magical aura example) are not modelled.

### Long rest and short rest
- SRD ("Long Rest", "Short Rest"): a Short Rest is 1 hour; spend Hit Dice (die plus Constitution modifier) to heal,
  and some features recharge. A Long Rest is 8 hours with 6 asleep; regain all HP and spent Hit Dice; Exhaustion
  falls by 1; must wait 16 hours; needs 1 HP to start; interruptions are initiative, a spell above cantrip,
  damage, or an hour of exertion. Only some features recharge (Second Wind: one use on a Short Rest, all on a Long).
- Hextable (`rest`): one action for the whole party, no Short Rest, no Hit Dice. It sets HP to maximum, **clears
  every condition** and the death track, **revives the dead** (`dead: false`), refills slots and Second Wind, adds 480 minutes.
- **Differs** widely: no Short Rest or Hit Dice, Exhaustion is wiped rather than reduced by 1, all conditions
  (Poisoned, curses) end, the dead are revived, spent spell effects are not ended, no 16-hour limit, no 1 HP rule,
  no interruptions. Temporary Hit Points do not exist.

### Creature size and space, squeezing, moving through other creatures
- SRD ("Creature Size", "Moving around Other Creatures"): Tiny 4 per square, Small and Medium 1 square, Large 2 by 2,
  Huge 3 by 3, Gargantuan 4 by 4. You may pass through an ally, an Incapacitated creature, a Tiny creature, or a
  creature two sizes larger or smaller; another creature's space is Difficult Terrain for you unless it is Tiny or an
  ally; you cannot willingly end a move in an occupied space; if you somehow end a turn in one you are Prone unless
  Tiny or larger than the other creature. **The SRD has no squeezing rule** (searched the text).
- Hextable (`sizes.js`, `moveOptions`): footprints of 1, 3, 7, 12 hexes for Small/Medium, Large, Huge,
  Gargantuan (a hex adaptation of the square counts); up to four Tiny per hex; hostile standing creatures block
  movement outright; allies and everyone else can be passed through at no extra cost; you cannot stop in an
  occupied hex.
- Sizes and the Tiny rule: **match as adapted** (hex footprints are a design choice). Squeezing: **silent**
  (the specs' two `(check)`s at maps-and-objects.md 121 and rules-expansion.md 237 can be dropped; it is a design
  choice, or a house rule). Passing through: **differs**, since an Incapacitated, Tiny or two-sizes-apart hostile
  still blocks, no extra cost is charged for non-allied spaces, and there is no Prone for ending a turn in an
  occupied space.

### Grappling and shoving (Unarmed Strike options)
- SRD ("Unarmed Strike", "Grappling", "Grappled"): an Unarmed Strike may Damage (Str mod plus Proficiency to hit,
  1 plus Str mod Bludgeoning), Grapple (target makes a Str or Dex save, DC 8 plus Str mod and Proficiency; target no
  more than one size larger; a free hand) or Shove (same save and DC: push 5 feet or knock Prone; target no more than one
  size larger). The grappled creature can use an action for a Str (Athletics) or Dex (Acrobatics) check against the DC;
  it ends if the grappler is Incapacitated or the target is out of range.
- Hextable: **not built.** No Unarmed Strike, no grapple or shove action, no escape action, no attached-to. Monsters
  that grapple apply the Grappled condition through their attack effects, which only sets Speed 0; Disadvantage
  against anyone but the grappler and the drag cost are left to the DM (now in `also`). `push` (forced movement)
  exists for spells, not for the shove option.

### Exhaustion
- SRD ("Exhaustion"): cumulative levels; die at level 6; every D20 Test is reduced by 2 per level; Speed is reduced
  by 5 feet per level; a Long Rest removes one level.
- Hextable: the modifiers (checks, attack rolls, all saves, initiative, Speed) are applied. **Matches** for those.
  **Not built**: dying at level 6, removing one level on a Long Rest (`rest` wipes everything), and applying it
  to death saves.

### Thieves' Tools and locks
- SRD (Equipment: Thieves' Tools, Lock, Manacles): Utilize with Thieves' Tools picks a lock, or disarms a trap,
  at DC 15; a Lock is picked with a DC 15 Dexterity (Sleight of Hand) check; Manacles lock DC 15; Escaping DC 20,
  bursting DC 25 are the manacles', not a door's.
- Hextable (`door-wooden`): pick DC 15 Dexterity with Thieves' Tools, requiring the tool in gear. Force open DC 15
  Athletics. Iron door pick DC 20, force DC 25; portcullis lift DC 20; trap disarm DC 15 (matches the SRD).
- Wooden door pick and trap disarm: **match**. The iron door, portcullis and force-open DCs: **silent**, they are
  Hextable's own (marked source 'Hextable'). The check has `ability` and `tool` but no `skill`, so the Sleight of
  Hand rule below is missed.

### The tool-plus-skill Advantage rule
- SRD ("Proficiency: Tools"): proficiency with a tool adds your Proficiency Bonus to a check that uses it; if you
  also have proficiency in the skill used with that check, you have Advantage on it.
- Hextable (`checkBonus`, `abilityCheck`): skill proficiency or tool proficiency adds the bonus, never both, and
  there is no Advantage rule. Locks use a tool check with no skill named.
- **Differs**: Pip (the Rogue, with Thieves' Tools and Sleight of Hand) picks a lock at +5 with no Advantage; the SRD
  gives +5 and Advantage, and Expertise would not double the tool's bonus. Fixing it needs an engine change plus a
  `skill: 'sleight-of-hand'` on the lock check.

### Sneak Attack and Second Wind as implemented for the pregens
- SRD Sneak Attack (Rogue 1): once per turn, extra 1d6 to one creature you hit with a Finesse or Ranged weapon if
  you have Advantage; no Advantage needed if an ally who is not Incapacitated is within 5 feet of the target and you
  do not have Disadvantage; same damage type; dice doubled on a crit.
- Hextable (`resolveAttack`): once per turn (flag cleared at every turn start), needs a Finesse flag or a ranged
  attack, not a spell, no Disadvantage, and either Advantage or an enemy of the target within 5 feet; crit doubles the
  dice; the damage type is the weapon's. **Matches** except: the ally is not checked for Incapacitated; the "once
  per turn" is only tracked in a fight; thrown weapons count only if `type: ranged`.
- SRD Second Wind (Fighter 1): a Bonus Action, regain 1d10 plus Fighter level; two uses at level 1; one use back
  on a Short Rest and all on a Long Rest.
- Hextable (`secondWind`): Bonus Action; 1d10 plus `level`; two uses for Brenna; **Matches**. **Differs**: it is
  refused at full Hit Points (not in the SRD), the first use does not come back on a Short Rest because there is no
  Short Rest, and it adds the character's level, not the Fighter level (same for the single-class pregens).

## `(check)` items in the specs: settled

| Spec and line | Claim | Result |
|---|---|---|
| sight.md 82, 83 | half +2, three-quarters +5 to AC and Dex saves | Matches the SRD |
| sight.md 90 | a creature gives half cover | Matches (creatures give half cover at most) |
| sight.md 109 | torch 20 ft bright and 20 more dim | Matches (Torch, Equipment) |
| sight.md 164 | hiding ends on attack, Verbal spell, sound, being found | Matches (Hide) |
| sight.md 146-160 | Hide DC 15 and its requirements | Matches |
| maps-and-objects.md 121; rules-expansion.md 237 | squeezing | The SRD is silent |
| maps-and-objects.md 476 | fall damage and Prone | Matches |
| maps-and-objects.md 521 | flyer falls unless hover | Matches |
| maps-and-objects.md build notes | one free interaction per turn | Matches |
| rules-expansion.md 603 | Concentration DC | Matches |

## What the engine gets wrong, and what it does not do, most important first

Gets wrong:
1. **Long rest** wipes all conditions, including Exhaustion (should drop one level), and revives the dead.
2. **Death**: no instant death when damage at 0 HP reaches the Hit Point maximum; stale save counts after becoming
   Stable let one success restabilise.
3. **Resistance plus Vulnerability** to the same type applies only the halving.
4. **Ranged attacks in close combat** are penalised by enemies that cannot see you or are Incapacitated.
5. **Dodge** ignores "can see the attacker" and persists through Incapacitated or Speed 0.
6. **Moving through creatures**: Incapacitated, Tiny and two-sizes-apart hostiles block; other creatures' spaces
   cost nothing extra; no Prone for ending in an occupied space.
7. **Tool plus skill** gives no Advantage and locks name no skill; the door DCs beyond DC 15 are invented.
8. **Opportunity attacks** assume 5 ft reach and do not test "can see".
9. **Prone** has no crawl and always stands automatically; Exhaustion does not touch death saves or kill at 6.
10. Sneak Attack does not check whether the ally is Incapacitated; Second Wind is refused at full HP.
11. Climbing leaves the horizontal foot undoubled; Tremorsense in the sight spec contradicts "not sight".

Does not do at all:
1. **Light and sight**: Dim Light, Darkness, Obscured areas, Darkvision, Blindsight, Tremorsense, Truesight, the
   unseen-attacker and unseen-target Advantage and Disadvantage rules. `senses` is not a field.
2. **Hide, Search for creatures, Study, Influence, Help, Ready** actions, and Cunning Action.
3. **Grapple and Shove** (Unarmed Strike), escaping a grapple, dragging.
4. **Short Rest, Hit Dice**, Temporary Hit Points, stabilizing, the 1d4-hour recovery, Knocking Out a Creature.
5. **Swimming** (water is impassable), the water-landing check on a fall, the optional Athletics checks.
6. **Exhaustion** death at 6 and its Long Rest decay; Long Rest interruptions and the 16-hour wait.
7. Reach greater than 5 feet, and the special-speed halving rule.
