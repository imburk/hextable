# Debt log

What the game is known to get wrong or not do yet, in one place. Add to it when something is
found; strike a line when it is fixed, with the pull request. Details and the SRD wording are in
`docs/srd-audit.md`; designs are in `docs/specs`.

Who: **engine** needs the strongest model (it changes `engine.js`, the effect vocabulary or what
players are sent). **any** can be handed to any agent.

## Rules the engine gets wrong

| # | What | Who |
|---|---|---|
| W1 | A long rest clears all Exhaustion and revives the dead | engine |
| W2 | No instant death when damage at 0 Hit Points reaches the Hit Point maximum; death-save counts are not reset when a creature is stabilised | engine |
| W3 | Resistance and Vulnerability to the same damage only halves it | engine |
| W4 | Ranged attacks beside an enemy have Disadvantage even if that enemy cannot see the attacker or is Incapacitated | engine |
| W5 | Dodge ignores "can see the attacker" | engine (with sight) |
| W6 | Every standing enemy blocks movement outright; the SRD allows passing some | engine |
| W7 | A tool used with a skill the creature is proficient in should give Advantage | engine |
| W8 | A `condition` step is always treated as hostile, so a helpful one (Invisibility) is refused on oneself and starts a fight on an ally | engine |
| W9 | Size limits on Prone, Grappled and pushes are not applied; any size is affected | engine |

## Monsters

329 are entered; 33 play fully by the rules. The rest are held back by these, in order of how
many monsters each one touches:

| # | What | Who |
|---|---|---|
| M1 | **Multiattack.** Stored as text on about 180 monsters. The AI makes one attack a turn, so most monsters hit far below their strength. Design exists: an action whose effect is a list of other actions (`rules-expansion.md`). It needs the weapon-attack bridge replaced by effect steps first (M2) | engine |
| M2 | Monster attacks still go through the old flat bridge: only the first damage of an attack is rolled (the Ankheg's acid is lost), and save-based actions (breath weapons, Constrict) are never used by the AI | engine |
| M3 | Recharge, uses per day, bonus actions and reactions have no fields | engine |
| M4 | Condition immunities have no field (the Skeleton cannot be Poisoned) | engine |
| M5 | Legendary actions and lair-free legendary resistance | engine |
| M6 | Monster spellcasting (a list of spells with uses) | engine |
| M7 | Senses, saving throw bonuses, languages and initiative bonuses are not entered for most monsters; the format now takes senses | any |
| M8 | 49 monsters are not marked checked (mostly D to G entries with text not compared line by line) | any |
| M9 | The monster AI uses only the first melee and first ranged attack, treats height only as distance, and does not hide | engine |

## Characters

| # | What | Who |
|---|---|---|
| C1 | **Extra Attack** (the characters' Multiattack: Fighter, Paladin, Ranger, Barbarian and Monk at level 5). Not built. A typed-in level 5 fighter attacks once | engine (with M1) |
| C2 | Only Second Wind and Sneak Attack exist as features. Everything else on a sheet (Action Surge, Rage, Channel Divinity, Cunning Action, Wild Shape...) is not there | engine (R7) |
| C3 | No levelling or derived sheets: numbers are typed in (R7, R8) | engine, then any |
| C4 | Equipment states, attunement, encumbrance, spell materials (R10) | engine |
| C5 | Short rests and Hit Dice; Temporary Hit Points | engine |
| C6 | Grapple and shove; Help, Study, Influence, Hide actions | engine |
| C7 | Reactions: Shield, Counterspell, choosing whether to take an opportunity attack (R6) | engine |

## Spells

339 are entered; 11 play fully, 85 partly, 243 are applied by the DM. What the vocabulary
cannot say, by how much it would unlock:

| # | What | Who |
|---|---|---|
| S1 | Dice-valued modifiers (Bless, Bane, Guidance) | engine |
| S2 | More than one target (`count`): Scorching Ray, Mass Healing Word, Prayer of Healing | engine |
| S3 | Line and cube areas | engine |
| S4 | Zones that last (Web, Spirit Guardians, Wall of Fire) and effects that go off at the start or end of a turn inside them | engine |
| S5 | Temporary Hit Points, a damage type chosen at casting, "until the end of your next turn" | engine |
| S6 | Summoned creatures and their stat blocks (the companions spec is not written) | engine |
| S7 | The `min` op exists but is ignored (Barkskin); hooks that nothing reads: `hp.max`, `damage.dealt`, `spell.dc`, `spell.attack`, `carry`, `save.death`; the `check` hook cannot be limited to one skill | engine |
| S8 | Ritual casting times are not stored | any |
| S9 | Nine spells are not marked checked, each for a field the format cannot hold (see their pull requests) | any |

## Maps, sight and movement

| # | What | Who |
|---|---|---|
| P1 | Light, senses in use, hiding, and sending players only what they can see (sight tasks S4 to S7) | engine |
| P2 | Rock does not block sight | engine |
| P3 | Squeezing; "attached to" (carried, dragged, mounted); crawling while Prone; swimming and burrowing rules | engine |
| P4 | Two creatures that fall into one hex are left for the DM | engine |
| P5 | Hidden creatures are not found by Search | engine (sight S6) |
| P6 | Uploads and handouts (M9), tracing a map image (M10), scenes and private notes (M11), generating a map (M14) | M9 any with security review; M10 any; M11 engine for the view |
| P7 | The Universal VTT import has only been tried on a hand-made file | any, with a real export |
| P8 | The editor cannot rename a map, and shows no numbers for tile heights | any |

## Table and server

| # | What | Who |
|---|---|---|
| T1 | Undo history is in memory only and is lost when the server restarts | any |
| T2 | The timeline grows without limit | any |
| T3 | Per-address limits can be dodged without a proxy in front of the server (documented) | any |
| T4 | No client tests: UI work is checked by hand in a headless browser each time | any |
| T5 | The pack's labels say SRD 5.2.1; the file it was checked against is SRD 5.2 | any |

## Specs still to write

Prompts (decisions after a roll), companions and summons, ~~the renderer plan~~ (drafted in
`docs/specs/renderer.md`, to be reviewed), the persistent world and the AI DM interface.
