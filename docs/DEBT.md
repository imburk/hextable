# Debt log

What the game is known to get wrong or not do yet, in one place. Add to it when something is
found; strike a line when it is fixed, with the pull request. Details and the SRD wording are in
`docs/srd-audit.md`; designs are in `docs/specs`.

Who: **engine** needs the strongest model (it changes `engine.js`, the effect vocabulary or what
players are sent). **any** can be handed to any agent.

## Rules the engine gets wrong

| # | What | Who |
|---|---|---|
| W1 | ~~A long rest clears all Exhaustion and revives the dead~~ (#65) | engine |
| W2 | ~~No instant death when damage at 0 Hit Points reaches the Hit Point maximum; death-save counts are not reset when a creature is stabilised~~ (#65) | engine |
| W3 | ~~Resistance and Vulnerability to the same damage only halves it~~ (#65) | engine |
| W4 | ~~Ranged attacks beside an enemy have Disadvantage even if that enemy cannot see the attacker or is Incapacitated~~ (#65) | engine |
| W5 | Dodge ignores "can see the attacker" (left for the sight work: with no `canSee` there is nothing to test; W4 stands in "not Blinded" for it, and both should move to the sight check together) | engine (with sight) |
| W6 | ~~Every standing enemy blocks movement outright; the SRD allows passing some~~ (#68) | engine |
| W7 | ~~A tool used with a skill the creature is proficient in should give Advantage~~ (#65) | engine |
| W8 | ~~A `condition` step is always treated as hostile, so a helpful one (Invisibility) is refused on oneself and starts a fight on an ally~~ (#68) | engine |
| W9 | Size limits on Prone, Grappled and pushes are not applied; any size is affected. Not fixable in the engine alone: no step can say a size limit (the Wolf's `{ condition: "prone" }` carries none), so it needs a vocabulary change first, such as a `when` tag on the target's size or a `maxSize` on condition and move steps (looked at in #68) | engine |
| W10 | Death Saving Throws are rolled only in a fight, and a Stable creature's 1 Hit Point after 1d4 hours happens only across a Long Rest; a dying creature at a Long Rest is handed to the DM (#65) | engine |
| W11 | A creature that ends its turn in another creature's space is not knocked Prone (SRD "Moving around Other Creatures"); only reachable today by being pushed or falling there, which the DM handles (P4) | engine |

## Monsters

329 are entered; 33 play fully by the rules (tiers were not raised by #71). The rest are held back by these, in order of how
many monsters each one touches:

| # | What | Who |
|---|---|---|
| M1 | ~~**Multiattack.** Stored as text on about 180 monsters. The AI makes one attack a turn, so most monsters hit far below their strength.~~ Built (#71): 146 monsters have a working Multiattack. 32 stay text: 18 adult and ancient dragons whose Multiattack may swap an attack for a spell, 8 with spellcasting or "if available" (aboleth, clay golem, cloud giant, doppelganger, dryad, glabrezu, hydra, oni), 5 with a part the DM applies (roper, rust monster, young silver dragon, sphinx of valor, succubus), and the chimera (a recharge breath as an alternative) | engine |
| M2 | ~~Monster attacks still go through the old flat bridge: only the first damage of an attack is rolled (the Ankheg's acid is lost), and save-based actions (breath weapons, Constrict) are never used by the AI~~ (#71) | engine |
| M3 | ~~Recharge, uses per day, bonus actions~~ (#71: 75 recharges, 6 daily uses, 7 Bonus Actions entered) and reactions have no fields. Daily uses of monsters are never restored (a long rest restores the party only) | engine |
| M4 | ~~Condition immunities have no field (the Skeleton cannot be Poisoned)~~ (#71: 96 monsters). Two conditional ones stay text: the archmage (Mind Blank) and the vampire familiar (except from its master) | engine |
| M5 | Legendary actions and lair-free legendary resistance | engine |
| M6 | Monster spellcasting (a list of spells with uses) | engine |
| ~~M7~~ | ~~Senses are not entered for most monsters~~ Entered from the SRD for every monster (PRs #59, #61, #63, #64) | any |
| M8 | One monster is not marked checked: Swarm of Insects, whose SRD speed is "Climb or Fly 20 ft. (GM's choice)", a choice the format cannot hold. The other 49 were compared with the SRD and marked checked (PR #61) | any |
| M9 | ~~The monster AI uses only the first melee and first ranged attack~~ (#71: it uses every action, all of a Multiattack, and area actions on clusters); it treats height only as distance, does not hide, and uses no Bonus Action but an area one | engine |
| M10 | Saving throw bonuses, languages and initiative bonuses are not entered for monsters (split out of M7) | any |
| M11 | ~~Monster lines and cubes (22 breath weapons are lines)~~ (#74: aimed and resolved; no monster's tier moved, each is held at assist by something else, most often its saving throw bonuses, M10). Spheres or cylinders with no `area.range` still cannot be aimed; the DM applies them | engine (with S3) |

## Characters

| # | What | Who |
|---|---|---|
| C1 | ~~**Extra Attack** (the characters' Multiattack: Fighter, Paladin, Ranger, Barbarian and Monk at level 5). Not built. A typed-in level 5 fighter attacks once~~ (#71: `features.extraAttack`, also in quick entry) | engine (with M1) |
| C2 | Only Second Wind and Sneak Attack exist as features. Everything else on a sheet (Action Surge, Rage, Channel Divinity, Cunning Action, Wild Shape...) is not there | engine (R7) |
| C3 | No levelling or derived sheets: numbers are typed in (R7, R8) | engine, then any |
| C4 | Equipment states, attunement, encumbrance, spell materials (R10) | engine |
| C5 | Short rests and Hit Dice; Temporary Hit Points | engine |
| C6 | Grapple and shove; Help, Study, Influence, Hide actions | engine |
| C7 | Reactions: Shield, Counterspell, choosing whether to take an opportunity attack (R6) | engine |

## Spells

339 are entered; 27 play fully, 77 partly, 235 are applied by the DM. What the vocabulary
cannot say, by how much it would unlock:

| # | What | Who |
|---|---|---|
| S1 | ~~Dice-valued modifiers (Bless, Bane, Guidance)~~ (#80) | engine |
| S2 | ~~More than one target (`count`): Scorching Ray, Mass Healing Word, Prayer of Healing~~ (#78). Left: targets of different kinds ("a creature or an object"), and a restriction on the target's creature type (Hold Person's Humanoid), which the DM checks | engine |
| S3 | ~~Line and cube areas~~ (#74). Left: a Line placed at a distance or of free shape (Wind Wall) and several cubes arranged by the caster (Fire Storm); creatures of the caster's choice in an area were done with S2 | engine |
| S4 | Zones that last (Web, Spirit Guardians, Wall of Fire) and effects that go off at the start or end of a turn inside them | engine |
| S5 | Temporary Hit Points, ~~a damage type chosen at casting~~ (#80, for modifiers; a chosen type in a `damage` step is not built: Chromatic Orb, Sorcerous Burst, Dragon's Breath), "until the end of your next turn" | engine |
| S6 | Summoned creatures and their stat blocks (the companions spec is not written) | engine |
| S7 | The `min` op exists but is ignored (Barkskin); hooks that nothing reads: `hp.max`, `damage.dealt`, `spell.dc`, `spell.attack`, `carry`, ~~`save.death`~~ (#80); ~~the `check` hook cannot be limited to one skill~~ (#80: `scope`) | engine |
| S8 | Ritual casting times are not stored | any |
| S9 | Nine spells are not marked checked, each for a field the format cannot hold (see their pull requests) | any |

## Maps, sight and movement

| # | What | Who |
|---|---|---|
| P1 | ~~Light (S4)~~ (#75); senses in use, hiding, and sending players only what they can see (sight tasks S5 to S7). Carried lights are set by the DM (`setLight`), not from gear; the Bullseye Lantern's cone is not supported | engine |
| P2 | Rock does not block sight | engine |
| P3 | Squeezing; "attached to" (carried, dragged, mounted); crawling while Prone; swimming and burrowing rules | engine |
| P4 | Two creatures that fall into one hex are left for the DM | engine |
| P5 | Hidden creatures are not found by Search | engine (sight S6) |
| P6 | ~~Uploads and handouts (M9)~~ (PR #70), ~~tracing a map image (M10)~~ (PR #76), scenes (M11; ~~private notes~~ PR #70), generating a map (M14) | M10 any; M11 engine for the view |
| P7 | The Universal VTT import (the editor's Map file > Import Universal VTT, PR #79) has only been tried on the hand-made test file, not a real export | any, with a real export |
| P8 | The editor cannot rename a map, and shows no numbers for tile heights | any |
| P9 | Walking together: a follower brought up when a fight starts is set down, not walked, so a hidden trap on the way it would have come is not set off; a follower whose way back to the column is longer than 300 ft is dropped as not keeping up; ~~the undo list names follow actions only by their type~~ (#81) | engine |
| P10 | ~~The renderer does not draw a level's background picture (`level.image`), and the editor cannot set one~~ (PR #73) | any |
| P11 | Handouts: no shared pointer on an open handout; ~~undo of a handout or note action is labelled "handout (an action)"~~ (#81), and undoing a note takes it off the record but not off the screens it reached | any |
| P12 | Exporting a table or a map does not carry its files: the state names asset ids whose bytes stay on the server | any |

## Table and server

| # | What | Who |
|---|---|---|
| ~~T1~~ | ~~Undo history is in memory only and is lost when the server restarts~~ saved beside each table file (PR #67). Solo play still starts a reload with an empty history | any |
| ~~T2~~ | ~~The timeline grows without limit~~ chronicle entries are kept, the newest 5000 others (`TIMELINE_CAP`) (PR #69) | any |
| T3 | Per-address limits can be dodged without a proxy in front of the server (documented) | any |
| ~~T4~~ | ~~No client tests: UI work is checked by hand in a headless browser each time~~ `npm run smoke` drives the page in headless Chromium (PR #60). It is a smoke test, not a unit suite | any |
| T5 | The pack's labels say SRD 5.2.1; the file it was checked against is SRD 5.2 | any |

## Specs still to write

Prompts (decisions after a roll), companions and summons, ~~the renderer plan~~ (#66, drafted in
`docs/specs/renderer.md`, to be reviewed), the persistent world and the AI DM interface.
