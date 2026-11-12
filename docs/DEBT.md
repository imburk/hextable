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
| W5 | ~~Dodge ignores "can see the attacker" (left for the sight work: with no `canSee` there is nothing to test; W4 stands in "not Blinded" for it, and both should move to the sight check together)~~ (#85: Dodge, close combat and Opportunity Attacks all use `canSee`; Dodge also ends while Incapacitated or at Speed 0) | engine (with sight) |
| W6 | ~~Every standing enemy blocks movement outright; the SRD allows passing some~~ (#68) | engine |
| W7 | ~~A tool used with a skill the creature is proficient in should give Advantage~~ (#65) | engine |
| W8 | ~~A `condition` step is always treated as hostile, so a helpful one (Invisibility) is refused on oneself and starts a fight on an ally~~ (#68) | engine |
| W9 | Size limits on Prone, Grappled and pushes are not applied; any size is affected. Not fixable in the engine alone: no step can say a size limit (the Wolf's `{ condition: "prone" }` carries none), so it needs a vocabulary change first, such as a `when` tag on the target's size or a `maxSize` on condition and move steps (looked at in #68) | engine |
| W10 | Death Saving Throws are rolled only in a fight, and a Stable creature's 1 Hit Point after 1d4 hours happens only across a Long Rest; a dying creature at a Long Rest is handed to the DM (#65) | engine |
| W11 | A creature that ends its turn in another creature's space is not knocked Prone (SRD "Moving around Other Creatures"); only reachable today by being pushed or falling there, which the DM handles (P4) | engine |

## Monsters

329 are entered; 40 play fully by the rules (tiers were not raised by #71; #102 and the pull requests after it re-tiered the files one by one, see M12). The rest are held back by these, in order of how
many monsters each one touches:

| # | What | Who |
|---|---|---|
| M1 | ~~**Multiattack.** Stored as text on about 180 monsters. The AI makes one attack a turn, so most monsters hit far below their strength.~~ Built (#71): 146 monsters have a working Multiattack. 32 stayed text; ~~18 adult and ancient dragons whose Multiattack may swap an attack for a spell~~ (#90: three Rends, or two and a breath where the SRD offers one; the spell swap is a note for the DM, tiers unchanged); 14 remain: 8 with spellcasting or "if available" (aboleth, clay golem, cloud giant, doppelganger, dryad, glabrezu, hydra, oni), 5 with a part the DM applies (roper, rust monster, young silver dragon, sphinx of valor, succubus), and the chimera (a recharge breath as an alternative) | engine |
| M2 | ~~Monster attacks still go through the old flat bridge: only the first damage of an attack is rolled (the Ankheg's acid is lost), and save-based actions (breath weapons, Constrict) are never used by the AI~~ (#71) | engine |
| M3 | ~~Recharge, uses per day, bonus actions~~ (#71: 75 recharges, 6 daily uses, 7 Bonus Actions entered) and reactions have no fields. ~~Daily uses of monsters are never restored (a long rest restores the party only)~~ (#82: the DM's Long Rest names who rests) | engine |
| M4 | ~~Condition immunities have no field (the Skeleton cannot be Poisoned)~~ (#71: 96 monsters). Two conditional ones stay text: the archmage (Mind Blank) and the vampire familiar (except from its master) | engine |
| M5 | Legendary actions and lair-free legendary resistance | engine |
| M6 | Monster spellcasting (a list of spells with uses) | engine |
| ~~M7~~ | ~~Senses are not entered for most monsters~~ Entered from the SRD for every monster (PRs #59, #61, #63, #64) | any |
| M8 | One monster is not marked checked: Swarm of Insects, whose SRD speed is "Climb or Fly 20 ft. (GM's choice)", a choice the format cannot hold. The other 49 were compared with the SRD and marked checked (PR #61) | any |
| M9 | ~~The monster AI uses only the first melee and first ranged attack~~ (#71: it uses every action, all of a Multiattack, and area actions on clusters); it treats height only as distance, hides only to open a fight (#88), and uses no Bonus Action but an area one or Nimble Escape's Hide | engine |
| ~~M10~~ | ~~Saving throw bonuses~~ (#93: `saves` on the monster, 122 monsters list one; used by the engine as `saveBonus`); ~~initiative bonuses~~ (#95: `initiative` on the monster, `initBonus` on the creature, used by `rollInit`; the SRD prints two inconsistent bracketed totals, Gray Ooze and Invisible Stalker, the modifier was kept); ~~languages~~ (#98: `languages` on the monster, 329 entered, data only). Nothing of M10 is left | any |
| M11 | ~~Monster lines and cubes (22 breath weapons are lines)~~ (#74: aimed and resolved; no monster's tier moved, each is held at assist by something else, most often its saving throw bonuses, M10). Spheres or cylinders with no `area.range` still cannot be aimed; the DM applies them | engine (with S3) |
| M12 | **Why the rest are not `auto`** (monster-saves re-tier; 40 auto, 287 assist, 2 manual; counts of monsters, one monster can be in several; "alone" = the only thing holding it back, so what building it would unlock at once): descriptive traits the engine cannot enforce (breathing, senses, climbing, plane, telepathy) (75, alone for 15); movement rules (bonus-action moves, teleports, leaps, passing through) (75, alone for 22); spellcasting and spell-like actions (72, alone for 9); other effects of an attack or action the vocabulary cannot say (60, alone for 7); a size limit on Prone, Grappled, pulled or swallowed (W9) (57, alone for 13); traits that act at a turn boundary (auras, regeneration, ...) (46, alone for 4); magic resistance (no tag for saves against magic) (35, alone for 0); dying and returning (death bursts, restoration, Undead Fortitude) (34, alone for 3); legendary resistance (32, alone for 0); lasting effects (Hit Point maximum loss, curses, wounds, no healing) (30, alone for 1); legendary actions (30, alone for 0); changing form, parts and special bodies (23, alone for 0); reactions (21, alone for 5); grapple, swallow and engulf riders (escape DC, Restrained until the grapple ends, damage each turn) (19, alone for 4); a charge (moved N feet straight toward) (17, alone for 11); Bloodied (no tag for it) (16, alone for 4); Multiattack that cannot be entered (spellcasting or "if available") (13, alone for 0); chained or repeated saves (a second failure, a worse state) (13, alone for 2). Size limits (W9) alone hold 13 | engine |

## Characters

| # | What | Who |
|---|---|---|
| C1 | ~~**Extra Attack** (the characters' Multiattack: Fighter, Paladin, Ranger, Barbarian and Monk at level 5). Not built. A typed-in level 5 fighter attacks once~~ (#71: `features.extraAttack`, also in quick entry) | engine (with M1) |
| C2 | ~~Only Second Wind and Sneak Attack exist as features. Everything else on a sheet (Action Surge, Rage, Channel Divinity, Cunning Action, Wild Shape...) is not there~~ (#99 classes as data, #108 features from their data). What each class still lacks is listed under C8 | engine (R7) |
| C3 | No levelling or derived sheets: numbers are typed in (R7, R8) | engine, then any |
| C4 | Equipment states, attunement, encumbrance, spell materials (R10) | engine |
| C5 | ~~Short rests and Hit Dice~~ (#108: `shortRest`, for built characters; a hand-typed record has no Hit Die, so it spends none); ~~Temporary Hit Points~~ (#82) | engine |
| C6 | Grapple and shove; Help, Study, Influence actions (~~Hide~~ #88). ~~Cunning Action (the rogue's Bonus Action Hide) is not built~~ (#108) | engine |
| C7 | Reactions: Shield, Counterspell, choosing whether to take an opportunity attack (R6) | engine |

## Spells

339 are entered; 36 play fully, 76 partly, 227 are applied by the DM. What the vocabulary
cannot say, by how much it would unlock:

| # | What | Who |
|---|---|---|
| S1 | ~~Dice-valued modifiers (Bless, Bane, Guidance)~~ (#80) | engine |
| S2 | ~~More than one target (`count`): Scorching Ray, Mass Healing Word, Prayer of Healing~~ (#78). Left: targets of different kinds ("a creature or an object"), and a restriction on the target's creature type (Hold Person's Humanoid), which the DM checks | engine |
| S3 | ~~Line and cube areas~~ (#74). Left: a Line placed at a distance or of free shape (Wind Wall) and several cubes arranged by the caster (Fire Storm); creatures of the caster's choice in an area were done with S2 | engine |
| S4 | ~~Zones that last (Web, Spirit Guardians, Wall of Fire) and effects that go off at the start or end of a turn inside them~~ (#91: Moonbeam, Spirit Guardians, Web). Left: moving a zone after casting (Moonbeam), what a zone changes while a creature is inside (halved Speed, Difficult Terrain, obscurement), walls of free shape (Wall of Fire, Wind Wall), "until the end of the current turn" (Stinking Cloud), and drawing zones on the map for anyone | engine |
| S5 | ~~Temporary Hit Points~~ (#82), ~~a damage type chosen at casting~~ (#80, for modifiers; a chosen type in a `damage` step came with #91; Chromatic Orb, Sorcerous Burst and Dragon's Breath still need their leaping, exploding dice and breath from another creature), ~~"until the end of your next turn"~~ (#89) | engine |
| S6 | Summoned creatures and their stat blocks (the companions spec is not written) | engine |
| S7 | ~~The `min` op exists but is ignored (Barkskin); hooks that nothing reads: `hp.max`, `damage.dealt`, `spell.dc`, `spell.attack`, `save.death`; the `check` hook cannot be limited to one skill~~ (#80, #86). `carry` is still unread (no encumbrance) | engine |
| S8 | Ritual casting times are not stored | any |
| S9 | Nine spells are not marked checked, each for a field the format cannot hold (see their pull requests) | any |
| S10 | ~~The `tempHp` event is not in the view's lists, so players see their own Temporary Hit Points in their records but not the log line; view.js was out of bounds for #82~~ (#101: sent for the party's own creatures, never for others). ~~The tracker's damage button sets Hit Points (`setHp`), which leaves Temporary Hit Points alone~~ (#96: the DM actions `harm { actor, amount, dtype? }` and `mend { actor, amount }` apply damage and healing by the rules, and the tracker uses them; `setHp` stays for the DM to set a number or raise the dead). The Frost Giant's War Cry gives Temporary Hit Points to a creature that can see or hear it, a range the format cannot hold | engine |

### Re-tiering pass (spells entered before the vocabulary grew)

Each pull request takes two levels, converts what the vocabulary can now say exactly, and tallies
what is still missing for the rest, by kind. A spell can be held back by more than one thing; it
is counted under the first that applies.

**Levels 0 and 1** (#105): 2 moved from manual to assist (Chromatic Orb: chosen damage type;
Grease: a zone). Before: 0 auto, 3 assist, 15 manual at level 0 and 14 auto, 11 assist, 32 manual
at level 1; after: 14 auto, 13 assist, 30 manual at level 1, level 0 unchanged. Still missing:

| Kind | Level 0 | Level 1 |
|---|---|---|
| Information, detection, utility with nothing to roll (the DM tells or applies it) | druidcraft, elementalism, mending, message, prestidigitation, thaumaturgy, spare the dying (no Stable condition to set), light (a lit object) | alarm, comprehend languages, create or destroy water, detect evil and good, detect magic, detect poison and disease, identify, illusory script, purify food and drink, speak with animals, goodberry |
| Illusions | minor illusion | disguise self, silent image |
| Summons, companions, objects that act | dancing lights, mage hand | find familiar, floating disk, unseen servant |
| A trigger on the caster's own hit (smites) | | divine smite, ensnaring strike, searing smite |
| A caster's weapon attacks changed, or a later action the spell grants | shillelagh, true strike, produce flame | |
| Movement: Dash, jumping | | expeditious retreat, jump |
| A reaction with a trigger | | feather fall (assist: hellish rebuke, shield) |
| What may attack or be attacked: a creature-type tag, redirecting an attack | | sanctuary, protection from evil and good (assist: animal friendship, which also needs a type restriction) |
| Light or obscurement on a creature or an area, and a negative tag ("if the attacker can see it") | starry wisp (assist) | faerie fire, fog cloud |
| Staged or forced behaviour | | sleep (a second failed save makes it Unconscious), command |
| A turn-start trigger outside a zone, or a base AC from Dexterity | | heroism (Temporary Hit Points each turn), mage armor |
| A rider the format has no hook for (healing stopped, no Opportunity Attacks, exploding dice, a burst around the target, a leap) | chill touch, shocking grasp, sorcerous burst | ice knife (assist), chromatic orb's leap |

## Maps, sight and movement

| # | What | Who |
|---|---|---|
| P1 | ~~Light (S4)~~ (#75); ~~senses in use (S5)~~ (#85); ~~hiding (S6)~~ (#88); ~~sending players only what they can see (S7)~~ (#92). Carried lights are set by the DM (`setLight`), not from gear; the Bullseye Lantern's cone is not supported | engine |
| P2 | Rock does not block sight | engine |
| P3 | Squeezing; "attached to" (carried, dragged, mounted); crawling while Prone; swimming and burrowing rules | engine |
| P4 | Two creatures that fall into one hex are left for the DM | engine |
| P5 | ~~Hidden creatures are not found by Search~~ (#88: a creature that took the Hide action is; one the DM hid with the `hidden` switch is the DM's to reveal) | engine (sight S6) |
| P6 | ~~Uploads and handouts (M9)~~ (PR #70), ~~tracing a map image (M10)~~ (PR #76), scenes (M11; ~~private notes~~ PR #70), generating a map (M14) | M10 any; M11 engine for the view |
| P7 | The Universal VTT import (the editor's Map file > Import Universal VTT, PR #79) has only been tried on the hand-made test file, not a real export | any, with a real export |
| P8 | The editor cannot rename a map, and shows no numbers for tile heights | any |
| P9 | Walking together: a follower brought up when a fight starts is set down, not walked, so a hidden trap on the way it would have come is not set off; a follower whose way back to the column is longer than 300 ft is dropped as not keeping up; ~~the undo list names follow actions only by their type~~ (#81) | engine |
| P10 | ~~The renderer does not draw a level's background picture (`level.image`), and the editor cannot set one~~ (PR #73) | any |
| P11 | Handouts: no shared pointer on an open handout; ~~undo of a handout or note action is labelled "handout (an action)"~~ (#81), and undoing a note takes it off the record but not off the screens it reached | any |
| P12 | ~~Exporting a table does not carry its files~~ (#83: base64 with records, up to 24 MB, the rest listed). Still open: exporting a map from the editor carries no files, and there is no import of a table export | any |

| P13 | A creature that cannot be seen cannot be targeted by players even where the SRD allows attacking a guessed location (with Disadvantage); a party member's path may go around a creature the players cannot see, which shows that something is there | engine |
| P14 | Under the `light` sight rule each newly seen tile resends the whole map document to players (patches are per top-level field), which is a few tens of KB a step in a big dark place; tile memory is found by a flood that can miss a tile seen only through a sliver; sight is followed across tiles 40 hexes at most | engine |
| P15 | ~~Under the los and light sight rules, players see the fight order without an unseen creature and its turn as nobody's~~ (#101: one "someone unseen" slot and one `turn` line for a run of such turns, no id or count; the table rule `unseenTurns: quiet` says nothing). Still told: that some unseen creature is taking a turn (the game waits), whether a run of them spans the end of a round (the round number moves inside it, which shows there are at least two), and, from the server, how many updates the run produced (one per action, empty for players). A creature walking into view is sent with only the hexes of its path in view | any; the update count is the server's |
| P16 | A single-use modifier spent by an ability check (`abilityCheck` in engine.js) still ends without an `effectEnd` event; saving throws were fixed (#101). No SRD entry has a single-use check modifier yet | engine |

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
