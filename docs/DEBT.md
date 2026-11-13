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
| W10 | Death Saving Throws are rolled only in a fight, and a Stable creature's 1 Hit Point after 1d4 hours happens only across a Long Rest; a dying creature at a Long Rest is handed to the DM (#65). ~~A party all at 0 Hit Points ended the fight at once, so its saves were never rolled~~ (#181 T5e: defeat waits until nobody is dying). Still open: outside a fight nobody rolls | engine |
| W11 | A creature that ends its turn in another creature's space is not knocked Prone (SRD "Moving around Other Creatures"); only reachable today by being pushed or falling there, which the DM handles (P4) | engine |

## Monsters

329 are entered: 57 auto, 270 assist, 2 manual (`npm run content`). The rest are held back by these, in order of how
many monsters each one touches:

| # | What | Who |
|---|---|---|
| M1 | ~~**Multiattack.** Stored as text on about 180 monsters. The AI makes one attack a turn, so most monsters hit far below their strength.~~ Built (#71): 146 monsters have a working Multiattack. 32 stayed text; ~~18 adult and ancient dragons whose Multiattack may swap an attack for a spell~~ (#90: three Rends, or two and a breath where the SRD offers one; the spell swap is a note for the DM, tiers unchanged); 14 remain: 8 with spellcasting or "if available" (aboleth, clay golem, cloud giant, doppelganger, dryad, glabrezu, hydra, oni), 5 with a part the DM applies (roper, rust monster, young silver dragon, sphinx of valor, succubus), and the chimera (a recharge breath as an alternative) | engine |
| M2 | ~~Monster attacks still go through the old flat bridge: only the first damage of an attack is rolled (the Ankheg's acid is lost), and save-based actions (breath weapons, Constrict) are never used by the AI~~ (#71) | engine |
| M3 | ~~Recharge, uses per day, bonus actions~~ (#71: 75 recharges, 6 daily uses, 7 Bonus Actions entered) ~~and reactions have no fields~~ (#127 built the reaction mechanism; #135 gave monster traits a `reaction` field: Parry on 7 monsters, Riposte and Whirlwind of Sand with the rest to the DM). Monster reactions the vocabulary cannot say (Protective Magic's Counterspell or Shield, Shield Guardian's Protection, Stone Giant's Deflect Missile with its recharge, Ochre Jelly's Split) are still text for the DM. ~~Daily uses of monsters are never restored (a long rest restores the party only)~~ (#82: the DM's Long Rest names who rests) | engine |
| M4 | ~~Condition immunities have no field (the Skeleton cannot be Poisoned)~~ (#71: 96 monsters). Two conditional ones stay text: the archmage (Mind Blank) and the vampire familiar (except from its master) | engine |
| M5 | Legendary actions and lair-free legendary resistance | engine |
| M6 | Monster spellcasting (a list of spells with uses) | engine |
| ~~M7~~ | ~~Senses are not entered for most monsters~~ Entered from the SRD for every monster (PRs #59, #61, #63, #64) | any |
| M8 | One monster is not marked checked: Swarm of Insects, whose SRD speed is "Climb or Fly 20 ft. (GM's choice)", a choice the format cannot hold. The other 49 were compared with the SRD and marked checked (PR #61) | any |
| M9 | ~~The monster AI uses only the first melee and first ranged attack~~ (#71: it uses every action, all of a Multiattack, and area actions on clusters); it treats height only as distance, hides only to open a fight (#88), and uses no Bonus Action but an area one or Nimble Escape's Hide | engine |
| ~~M10~~ | ~~Saving throw bonuses~~ (#93: `saves` on the monster, 122 monsters list one; used by the engine as `saveBonus`); ~~initiative bonuses~~ (#95: `initiative` on the monster, `initBonus` on the creature, used by `rollInit`; the SRD prints two inconsistent bracketed totals, Gray Ooze and Invisible Stalker, the modifier was kept); ~~languages~~ (#98: `languages` on the monster, 329 entered, data only). Nothing of M10 is left | any |
| M11 | ~~Monster lines and cubes (22 breath weapons are lines)~~ (#74: aimed and resolved; no monster's tier moved, each is held at assist by something else, most often its saving throw bonuses, M10). Spheres or cylinders with no `area.range` still cannot be aimed; the DM applies them | engine (with S3) |
Tally, counted by kind from each monster's own traits and actions (a monster can be in several kinds; 231 of the 272 monsters that are not auto have at least one of these, and the other 41 are held by things the tally cannot see, such as the size limit on Prone in W9). A trait with text and no modifiers, or an action with a manual step or text and no effects, counts; an engine-applied Condition Immunities trait does not:

| Kind | Monsters held back |
|---|---|
| Spellcasting and spell-like actions | 77 |
| Recharge or per-day abilities left as text | 69 |
| Auras and effects that last | 60 |
| Shape-changing | 33 |
| Legendary actions | 30 |
| Reactions | 24 |
| Regeneration | 16 |
| Swallow, engulf and grapple riders | 15 |
| Multiattack still as text | 14 |
| Summoning | 8 |
| Other (Amphibious, Spider Climb, Water Breathing, Flyby, Illumination, Leap, Death Burst, Web Walker, and 99 more names) | 173 |

## Characters

| # | What | Who |
|---|---|---|
| C1 | ~~**Extra Attack** (the characters' Multiattack: Fighter, Paladin, Ranger, Barbarian and Monk at level 5). Not built. A typed-in level 5 fighter attacks once~~ (#71: `features.extraAttack`, also in quick entry) | engine (with M1) |
| C2 | ~~Only Second Wind and Sneak Attack exist as features. Everything else on a sheet (Action Surge, Rage, Channel Divinity, Cunning Action, Wild Shape...) is not there~~ (#99 classes as data, #108 features from their data). What each class still lacks is listed under C8 | engine (R7) |
| C3 | ~~No levelling or derived sheets: numbers are typed in (R7, R8)~~ (#103 derive, #111 setSheet and levelUp, build-from-class screen in quick entry). Left: species, backgrounds and feats are not entered (their effects are typed into the scores and `extraSkills`); ~~multiclassing~~ (#175, see C12); a DM override for a sheet with problems | engine, then any |
| C4 | Equipment states, attunement, encumbrance, spell materials (R10) | engine |
| C5 | ~~Short rests and Hit Dice~~ (#108: `shortRest`, for built characters; a hand-typed record has no Hit Die, so it spends none); ~~Temporary Hit Points~~ (#82) | engine |
| C6 | Grapple and shove; Help, Study, Influence actions (~~Hide~~ #88). ~~Cunning Action (the rogue's Bonus Action Hide) is not built~~ (#108) | engine |
| C7 | Reactions: ~~Shield, choosing whether to take an opportunity attack~~ (#127, reactions part 1: one Reaction a round, standing instructions through the `reactions` action, Shield, Uncanny Dodge, Deflect Attacks; ~~no screen sets the instructions yet~~: the sheet's Reactions section does, #137). Still open: Counterspell and every reaction that needs a choice in the moment (prompts, stage B) | engine, then client |
| C8 | Class features at levels 5 and 6 (classes-5). **Built:** Extra Attack (Barbarian, Fighter, Monk, Paladin, Ranger; was #71, now tested for all five), Fast Movement, Roving, Expertise (Rogue 6), Stunning Strike (assist: Focus Point, Con save against 8 + Proficiency + Wisdom, Stunned to the monk's next turn; the engine does not check that it follows a hit with a Monk weapon or Unarmed Strike, or once a turn, and a successful save's halved Speed and Advantage go to the DM), Wholeness of Body (Open Hand 6), Elemental Affinity (Draconic 6, assist: the Resistance; the Charisma modifier on one spell damage roll is the DM's), Font of Inspiration's Short Rest recharge, Aura of Protection on the paladin. ~~**Manual, waiting on reactions (C7):** Uncanny Dodge (Rogue 5); also Deflect Attacks (Monk 3)~~ (#127: Uncanny Dodge auto, Deflect Attacks assist, its Focus Point redirect the DM's). **Waiting on prompts (C7):** Dark One's Own Luck (Fiend 6, after the roll). **Manual, waiting on other engine parts:** Cunning Strike (Rogue 5: trading Sneak Attack dice for an effect when the damage is dealt), Empowered Strikes (Monk 6: a damage-type choice on a hit), Mindless Rage (Berserker 6: condition immunity while an effect lasts), ~~Sorcerous Restoration (Sorcerer 5: a choice at a Short Rest, like Arcane Recovery's `recover`, which the client does not offer either)~~ (#154: `shortRest` `restore`; the client does not offer it yet), Wild Resurgence (Druid 5: trading uses for spell slots), ~~Sear Undead~~ (#154) and Blessed Healer (Cleric 5, Life 6: healing spells are not hooked), Tactical Shift (Fighter 5: a move without Opportunity Attacks after Second Wind), Memorize Spell (Wizard 5: edit the sheet), Sculpt Spells (Evoker 6: choosing who an area spares), Magical Discoveries (Lore 6: two spells off other lists), ~~Aura of Protection for allies (auras on others)~~ (#154: the `aura` grant), Faithful Steed's free casting, Fighter 6 Ability Score Improvement (feats are not entered) **Levels 7 to 15 for Paladin, Cleric, Druid, Sorcerer and Bard (#154).** Built: Aura of Protection for allies, Aura of Devotion, Aura of Courage, Restoring Touch and Lay On Hands' Poisoned (auto); Abjure Foes (assist: the move-or-act limit is the DM's). Divine Spark, Sear Undead, Blessed Strikes (both options), Divine Intervention (auto); Turn Undead (assist: fleeing), Improved Blessed Strikes (assist: Potent Spellcasting's Temporary Hit Points). Wild Shape (assist: a form, forms.js; known forms and equipment are the DM's), Elemental Fury (both options), Nature's Ward (auto), Improved Elemental Fury (assist: +300 ft cantrip range). Font of Magic, Sorcerous Restoration, Sorcery Incarnate (auto), Metamagic (assist: eight options auto), Dragon Wings (assist: dismissing early is the DM ending the effect). Bardic Inspiration (assist), Countercharm (auto), Peerless Skill (assist). **Still manual, by class and level, and what each waits on:** Paladin 3 Divine Sense (creature types sensed: information), 3 Sacred Weapon (a choice of damage type on a held weapon, and light), 15 Smite of Protection (a trigger on casting a named spell), Paladin's Smite and Faithful Steed free casts (2, 5: `freeCast { spells }` exists, the data is not entered: Divine Smite is cast after a hit, which the engine does not offer); Cleric 3 Preserve Life (sharing a pool among several creatures), 3 Disciple of Life and 6 Blessed Healer (a hook on healing spells); Druid 2 Wild Companion (summons, S6), 3 Circle of the Land Spells and Land's Aid, 5 Wild Resurgence (trading uses for slots), 14 Nature's Sanctuary (an area that changes things while inside, S4); Sorcerer Empowered and Seeking Spell (decided after a roll: prompts, C7); Bard 2 Jack of All Trades (half proficiency on checks), 3 Cutting Words (a reaction after another's roll: prompts, C7), 5 Font of Inspiration's slot for a use, 6 Magical Discoveries. Rolled on the bard's or ally's behalf: a Bardic Inspiration die is used on the first failed attack roll or effect save it could turn (not on ability checks, not kept for later; one die at a time is not enforced); Peerless Skill likewise on attack rolls only. Countercharm sees only a condition step directly under a failed save. Ability Score Improvements are feats (C3) | engine |
| C9 | Fantasy Grounds import (`import-fgxml.js`, docs/import-characters.md): built on the rules side (#142); ~~no file button yet~~ (#146: the DM picks a file in the DM panel or the build sheet, reads the report, confirms; `setSheet` is the DM's, so a player cannot import their own). Not done on the client: damage and spent slots in `report.state` are shown but not applied, and a sheet has no field for notes, so the report is kept only as a text file or a private chronicle entry the DM chooses. Gaps it found: a sheet has no `languages` field, scores above 20 cannot be held, a non-SRD subclass can only load as the SRD stand-in, and 2014 sheets have no Divine Order, Primal Order or Elemental Affinity choice. Feats, species, backgrounds, magic items, multiclassing and a table-local form for non-SRD content are still not entered (see C3, C4) | engine, then client |
| C10 | Client controls for the class features of C8 (#170): chooser panels (`packages/client/classes.js`) for Divine Spark's mode, Wild Shape's form and leaving it, Lay On Hands (Hit Points and conditions), Font of Magic, Divine Intervention (cast through `via`) and Metamagic on a cast (options, Careful's creatures, Heightened's target, Transmuted's type, cost and points shown); the form shows on the card, the sheet and the bar; the build screen has a pick list for Metamagic; the DM's Short Rest offers Sorcerous Restoration. **Left:** Arcane Recovery and Natural Recovery on the Short Rest (`recover`); the Countercharm instruction was not checked on the sheet; Empowered and Seeking Spell (the engine does not offer them); Twinned Spell's second target is chosen in the usual target taps and is not checked in a browser; a lasting effect in a player's view has no `feature` id, so the Metamagic limit with Sorcery Incarnate reads the effect's name; no slot-level choice when casting; Metamagic is chosen before the spell is aimed, so a refusal that comes from the aim (Careful's creatures not among the targets) shows in that panel | client |
| C11 | Left open by the review of the class features (#166, fixed in #169): a Melee weapon thrown (a handaxe) makes a ranged attack, and the `melee` tag reads the attack, so Radiant Strikes, Divine Smite and the like miss it although the SRD says "a Melee weapon" (needs a weapon-kind tag); a foe's Subtle Spell still names its caster to players in the `cast` event though nothing was seen being cast; Potent Spellcasting adds Wisdom to any cantrip, not only Cleric or Druid ones (no difference until a character has cantrips from another class: multiclassing, #175); the effect record keeps no spell level for Dispel Magic, which is the DM's (Twinned Spell raises it by 1); saved tables keep their characters' features as derived until `levelUp` or a new sheet (Aura Expansion's 30 feet arrives then) | engine |
| C12 | Multiclassing (#175) is built for every SRD class but: Pact Magic beside another class's Spellcasting (refused by `validate`: the engine keeps one kind of spell slot); Potent Spellcasting and the like add to any cantrip, not only their class's; a feature's own save DC and attack (the `src` of a `feature` action) use the first casting class's ability; Channel Divinity from Cleric and Paladin are two pools; `shortRest` always spends the largest Hit Dice first (no choice of size); the build screen and level-up screen on the client take one class (client) | engine, then client |

## Spells

339 are entered; 36 play fully, 87 partly, 216 are applied by the DM (after the re-tiering pass
below: levels 0 to 5, and a second look at levels 1 to 3). What the vocabulary cannot say, by how much
it would unlock:

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
| S11 | `contact-other-plane` is listed in `SELF_SAVE_EXCEPTIONS` (schema.js) as "flagged, awaiting review": it is aimed at its caster and its save is the caster's own. Decide whether a caster's save is allowed for a self-aimed spell, then keep or drop the exception. | any |

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
| A reaction with a trigger | | feather fall (assist: hellish rebuke; ~~shield~~ auto by standing instruction, #127) |
| What may attack or be attacked: a creature-type tag, redirecting an attack | | sanctuary, protection from evil and good (assist: animal friendship, which also needs a type restriction) |
| Light or obscurement on a creature or an area, and a negative tag ("if the attacker can see it") | starry wisp (assist) | faerie fire, fog cloud |
| Forced behaviour | | command |
| A turn-start trigger outside a zone, or a base AC from Dexterity | | heroism (Temporary Hit Points each turn), mage armor |
| A rider the format has no hook for (healing stopped, no Opportunity Attacks, exploding dice, a burst around the target, a leap) | chill touch, shocking grasp, sorcerous burst | ice knife (assist), chromatic orb's leap |

**Levels 2 and 3** (#107): 1 moved from manual to assist: Zone of Truth (a zone with a Charisma save on
entering or starting a turn there, once a turn; the DM is told who failed and holds them to it).
Level 2 was 4 auto, 14 assist, 39 manual and is now 4 / 15 / 38 (before the second look); level 3 is unchanged (3 / 11 / 28).
(Pass without Trace, Ray of Enfeeblement and Sleet Storm were moved in the second look below, and are
no longer in the table.) Stinking Cloud stays: a Poisoned that also bars actions. Still missing:

| Kind | Level 2 | Level 3 |
|---|---|---|
| Information, utility, wards, locks and triggers with nothing to roll | animal messenger, augury, detect thoughts, find traps, gentle repose, locate animals or plants, locate object, arcane lock, knock, magic mouth, rope trick | clairvoyance, create food and water, nondetection, sending, speak with dead, speak with plants, tongues, plant growth |
| Illusions | arcanist's magic aura, phantasmal force | major image |
| Summons, moving objects, and actions the spell grants for later turns | find steed, flame blade, flaming sphere, spiritual weapon, dragon's breath | animate dead, conjure animals, phantom steed |
| Forms and size | alter self, enlarge/reduce | |
| Movement modes, teleporting, traversal | levitate, spider climb, misty step | fly, water breathing, water walk, blink, meld into stone |
| Light, obscurement and senses | continual flame, darkness, darkvision, see invisibility | daylight |
| An effect that holds only while inside an area, or a trigger per 5 feet moved | silence, spike growth | |
| An object or a weapon as the target | heat metal, magic weapon | |
| Removing a condition, ending an effect, raising the dead | lesser restoration | dispel magic, remove curse, revivify |
| A trigger on a hit (smites, duplicates that take hits), or a reaction | shining smite (assist since #159), mirror image | ~~counterspell~~ (auto, #144) |
| A choice among effects, or creatures of the caster's choice with no count | calm emotions, enthrall | bestow curse (four effects, duration by slot) |
| Barriers by creature type, glyphs | | glyph of warding, magic circle, tiny hut |
| Obscurement with a rider no hook can say (a Poisoned that also bars actions) | | stinking cloud |
| Assist spells held at assist by: Speed doubled and an extra action, healing from damage dealt, a wall of free shape, a later action | | haste, vampiric touch, wind wall, call lightning |

**Levels 4 and 5** (#110): 3 moved from manual to assist: Conjure Woodland Beings (an emanation zone that
moves with the caster, spares the caster's side, a Wisdom save for force damage on entering or ending a
turn there), Fire Shield (the damage type resisted is the choice: Cold for the warm shield, Fire for the
chill one; the retaliation and the light stay with the DM) and Mislead (the caster is Invisible; the DM ends
it and runs the double). Black Tentacles and Insect Plague stay assist but are now zones, so the save on
entering or ending a turn in the area is run by the engine (they were first-save only). Level 4 was 2 auto,
9 assist, 23 manual and is now 2 / 11 / 21; level 5 was 2 / 9 / 27 and is now 2 / 10 / 26. Considered and left:
Cloudkill (the sphere moves 10 feet away from the caster each turn, which a zone cannot do), Holy Aura and
Aura of Life (effects while inside an aura). Still missing:

| Kind | Level 4 | Level 5 |
|---|---|---|
| Information, communication, crafting and terrain with nothing to roll | divination, locate creature, fabricate, stone shape, control water, secret chest | commune, commune with nature, legend lore, dream, telepathic bond, scrying, creation, awaken, passwall |
| Illusions | hallucinatory terrain | seeming |
| Summons, objects and sensors that act, and actions the spell grants for later turns | arcane eye, faithful hound, guardian of faith, giant insect | animate objects, conjure elemental, summon dragon, arcane hand, telekinesis |
| Forms | polymorph | |
| Teleporting and tree travel | dimension door | teleportation circle, tree stride |
| Guarding a creature in a way no hook can say (first drop to 0 Hit Points, magical Restrained) | death ward, freedom of movement | |
| Barriers and walls of free shape, or around a creature | wall of fire, resilient sphere, private sanctum | wall of force, wall of stone |
| Barriers and wards by creature type | | antilife shell, dispel evil and good, hallow, planar binding |
| Raising or restoring | | greater restoration, raise dead, reincarnate |
| An aura with a rider (extra damage to attacks against creatures in it) | conjure minor elementals | |
| Random behaviour | confusion | |
| Assist spells held at assist by: Difficult Terrain, a Plant creature that auto-fails, an escape check, forced obedience, a banishment that leaves play, a sphere that moves | black tentacles, blight, compulsion, dominate beast, banishment | cloudkill, insect plague, dominate person, geas |

**A second look at levels 1 to 3** (#113). The first pass held back spells where the vocabulary could not
say all of the SRD. The brief's own rule is that what it cannot say becomes a manual step and the tier is
set honestly, so five spells in which the engine can do the numbers and the DM only a rider moved from
manual to assist (the tables above were corrected; Aura of Life, level 4, joined them, so level 4 is now 2 / 12 / 20):
- **Sleep** (1): a Wisdom save for each creature of the caster's choice in the sphere, Incapacitated until the
  end of its next turn (`ends: turnEnd`). The DM runs the second save and the Unconscious condition, wakes
  a creature that is hurt or shaken, and applies the automatic successes (elves, immune to Exhaustion).
- **Ray of Enfeeblement** (2): the success and the failure effects as modifiers (one disadvantaged attack
  roll until the start of the caster's next turn; Disadvantage on Strength attack rolls, checks and saves,
  and -1d8 on damage dealt). The repeat save at the end of each of its turns, and ending the effect on a
  success, are the DM's (the engine rolls one save per part, so it cannot end all parts on one save).
- **Pass without Trace** (2): +10 on Stealth checks (`scope: stealth`) to the caster and chosen creatures in
  the emanation. That it holds only while inside the aura, and the tracks, are the DM's.
- **Aura of Life** (4): necrotic Resistance for the caster and chosen allies; the Hit Point maximum protection, the 1 Hit Point at the start of a downed ally's turn, and leaving the aura are the DM's.
- **Sleet Storm** (3): a zone (cylinder, enter or start of turn, once a turn), Dexterity save or Prone. Losing
  Concentration, the obscurement, flames and Difficult Terrain are the DM's.
Counts: spells 36 / 87 / 216. Level 1 is now 14 auto, 14 assist, 29 manual; level 2 is 4 / 17 / 36; level 3
is 3 / 12 / 27. The same rule applies to the next two passes. Not done: Heroism (the Temporary Hit Points
are granted at the start of each turn, which a cast-time grant would get wrong), Faerie Fire (Advantage only
if the attacker can see the creature, and no negative tag), Stinking Cloud (a Poisoned that lasts to the end
of the current turn but starts at the start of it, which the turn-boundary rule would carry one turn too far).

**The spells the owner's party prepares** (#159). Five Fantasy Grounds sheets (Paladin 13, Paladin 6 / Bard 8, Druid 14,
Sorcerer 15, Cleric 14) were run through the importer; every spell that maps to the pack was collected, prepared or
not. 41 spells map. 11 are already `auto` (bless, cure wounds, fire bolt, greater invisibility, healing word, mass cure
wounds, poison spray, protection from energy, sacred flame, shield, and counterspell, which #144 made auto). The other
30 were each read against the SRD and held to the existing vocabulary. 1 moved: **Shining Smite** manual to assist (the
2d6 radiant and the Advantage on attacks against the target for the concentration are the engine's; that a hit came
first, the Bright Light and the loss of Invisible are the DM's; the range is entered as touch, as Vampiric Touch's is).
Every entry already on main in the set matched the SRD numbers, so no data was corrected. After this pass spells are
38 auto / 89 assist / 212 manual. "Sheets" is how many of the five sheets carry the spell.

| Spell | Sheets | Before | After | What is missing (the step, op, hook or field that would be needed) |
|---|---|---|---|---|
| Banishment (4) | 2 | assist | assist | A step that takes a creature off the map until the spell ends (a `removed` state with a return), and a `target.type` tag for the Aberration, Celestial, Elemental, Fey or Fiend that does not return |
| Lesser Restoration (2) | 2 | manual | ~~manual~~ **auto** (#165) | ~~**`cure`** step: ends one chosen condition~~ (#165: `cure: ["chosen"]` with a `condition` choice). Nothing left |
| Ice Storm (4) | 2 | assist | ~~assist~~ **auto** (#165) | ~~**`terrain`** on an area: Difficult Terrain until the end of the caster's next turn~~ (#165: `terrain: { difficult, lasts: "nextTurnEnd" }`). Nothing left |
| Dispel Magic (3) | 2 | manual | manual | **`dispel`** step: ends a spell on a target by level, an ability check against 10 + level above the slot |
| Detect Magic (1) | 2 | manual | manual | A sense or `reveal` of magic within 30 feet; nothing to roll. The DM remains |
| Revivify (3) | 1 | manual | manual | **`revive`** step, a way to aim a spell at a dead creature (`cast` refuses one: "is dead"), and a note of when it died (within a minute) |
| Protection from Poison (2) | 1 | assist | ~~assist~~ **auto** (#165) | ~~**`cure`** step (ends Poisoned) and a `save` modifier scoped to a condition~~ (#165: `cure` and `scope: { condition }`). Nothing left |
| Shining Smite (2) | 1 | manual | assist | A cast trigger "right after a melee hit" that adds to that hit (`reaction.on: "hit"` for the caster's own hits), Bright Light on a creature, a tag or op for "cannot benefit from Invisible" |
| Fire Storm (7) | 1 | assist | assist | **`area.count`** laid out by the caster: `cast` taking a list of cube hexes that must touch (the engine lays out one) |
| Heal (6) | 1 | assist | ~~assist~~ **auto** (#165) | ~~**`cure`** step (ends Blinded, Deafened, Poisoned)~~ (#165). Nothing left; "a creature you can see" is checked as every spell's target is (range and walls, not sight) |
| Conjure Elemental (5) | 1 | manual | manual | Summoned creature with a stat block and a turn (S6), and a caster's choice among four damage types |
| Blight (4) | 1 | assist | assist | **`target.type`** tag with an auto-fail (Plant creatures fail the save), and an object as a target |
| Charm Monster (4) | 1 | assist | assist | ~~`ends: { on: "damaged" }` on a condition (until the caster's side damages it) and a save-Advantage tag~~ (#165: `ends.by: "source"`, `advantageIf: ["target.fought"]`). Still: the Friendly attitude and the target knowing afterward (the engine has no attitudes) |
| Sleet Storm (3) | 1 | assist | assist | ~~`zone.terrain` (Difficult), `zone.obscures` (Heavily Obscured), a `breakConcentration` step on a failed save~~ (#165: `terrain` and an `endConcentration` step). Still: dousing exposed flames (lights are not tied to fire) |
| Moonbeam (2) | 1 | assist | assist | `zone.moves`: a Magic action that moves the cylinder up to 60 feet and makes those it reaches save; reverting a shape-shifter. Left alone: the zone, its save and its damage are correct |
| Pass without Trace (2) | 1 | assist | assist | A modifier that holds only while inside an emanation that moves with the caster (`modifier.while: "inAura"`) and leaving no tracks |
| Faerie Fire (1) | 1 | manual | manual | A tag for "the attacker can see the target" (the engine has only the negative, `target.unseen`), light on a creature, and "cannot benefit from Invisible". Advantage without the sight test would be wrong, so it is not entered as assist |
| Mage Hand (0) | 1 | manual | manual | An object that acts and moves on later turns (`spawn` of an object entity) |
| Mending (0) | 1 | manual | manual | An object as a target with a repair state; nothing to roll |
| Message (0) | 1 | manual | manual | Private communication; nothing for the engine to apply |
| Minor Illusion (0) | 1 | manual | manual | An illusion object with a Study check against the spell save DC |
| Prestidigitation (0) | 1 | manual | manual | A choice among minor effects on objects; nothing to roll |
| Dominate Monster (8) | 1 | assist | assist | ~~`ends: { on: "save", at: "damaged" }`, the "fighting it" save-Advantage tag~~ (#165). Still: `higher.slot.duration` (8 hours at level 9) and the commands (the DM) |
| Teleport (7) | 1 | manual | manual | ~~A `teleport` step~~ (#165 built one, for the caster within the map) to a known destination off the map, passengers, and a familiarity table roll with a damage mishap |
| Disintegrate (6) | 1 | assist | assist | ~~A rider on a creature taken to 0 Hit Points (dust)~~ (#165: `onZero` with `kill` and `remains: "dust"`). Still: no revival but True Resurrection or Wish (no revival step), and an object or a creation of force as a target |
| Globe of Invulnerability (6) | 1 | manual | manual | A `spell.blocked` hook on an emanation: spells of level 5 or lower cast from outside have no effect inside |
| Cone of Cold (5) | 1 | assist | ~~assist~~ **auto** (#165) | ~~A rider on a creature the damage kills~~ (#165: `onKill` with `remains: "frozen-statue"`). Nothing left; the thaw is not timed (the SRD gives no time) |
| Teleportation Circle (5) | 1 | manual | manual | A portal object linking two places on the map or to a known circle, and a `teleport` step for those who enter |
| Tongues (3) | 1 | manual | manual | Languages as state (a `languages` field on a creature, which a sheet does not have yet, C9) |
| Misty Step (2) | 1 | manual | ~~manual~~ **auto** (#165) | ~~**`teleport`** step: up to 30 feet to an unoccupied space the caster can see~~ (#165: the `teleport` step; the destination is the cast's `hex`. Nothing left for the engine; a client that sends no `hex` hands the move to the DM) |

**#165** added the vocabulary the first five rows below ask for (docs/specs/rules-expansion.md, "Build notes: what the
party's spells asked for") and raised, of the party's spells: Misty Step, Lesser Restoration (manual to auto), Heal,
Protection from Poison, Cone of Cold, Ice Storm (assist to auto); Sleet Storm, Charm Monster, Dominate Monster and
Disintegrate stay assist with less left to the DM. Outside the party's set: Grease (assist to auto), Dimension Door and
Fog Cloud (manual to assist); Web, Entangle, Charm Person, Dominate Person and Dominate Beast stay assist with more run by
the engine. Every one was compared with the SRD text. After it spells are 45 auto / 86 assist / 208 manual. Not done:
the client cannot yet aim a teleport (a cast with no `hex` hands the move to the DM) nor draw a spell's terrain or fog.

Which single addition unlocks the most of these (the engine lane's list):

| Addition | Unlocks to `auto` | Held at assist only by it, or partly |
|---|---|---|
| ~~`cure` step with a `choice` of condition (Lesser Restoration, Heal)~~ (#165) | ~~lesser restoration, heal~~ | ~~protection from poison~~ (#165 built the scoped save too: auto) |
| ~~A rider on a kill~~ (#165: `onKill`, `onZero`, `kill`, `remains`) | ~~cone of cold~~ | disintegrate (still needs an object as a target) |
| ~~`terrain` and `obscures` on an area or zone~~ (#165) | ~~ice storm~~ | sleet storm (#165 added `endConcentration`; dousing flames is left) |
| ~~`ends: { on: "damaged" }` and a "fighting it" tag~~ (#165) | | charm monster (attitude), dominate monster (`higher.slot.duration`, commands) |
| ~~`teleport` step~~ (#165) | ~~misty step~~ | teleport, teleportation circle (also a destination off the map) |
| `dispel` step | dispel magic | |
| `revive` step and aiming at the dead | revivify | |
| An "attacker can see the target" tag | | faerie fire (also light and the Invisible rule) |

Detect Magic, Mage Hand, Mending, Message, Minor Illusion, Prestidigitation and Tongues are information and
utility with nothing the engine can roll or track; they stay with the DM and no single vocabulary addition frees them.

## Maps, sight and movement

| # | What | Who |
|---|---|---|
| P1 | ~~Light (S4)~~ (#75); ~~senses in use (S5)~~ (#85); ~~hiding (S6)~~ (#88); ~~sending players only what they can see (S7)~~ (#92). Carried lights are set by the DM (`setLight`), not from gear; the Bullseye Lantern's cone is not supported | engine |
| P2 | Rock does not block sight | engine |
| P3 | Squeezing; "attached to" (carried, dragged, mounted); crawling while Prone; swimming and burrowing rules | engine |
| P4 | Two creatures that fall into one hex are left for the DM | engine |
| P5 | ~~Hidden creatures are not found by Search~~ (#88: a creature that took the Hide action is; one the DM hid with the `hidden` switch is the DM's to reveal) | engine (sight S6) |
| P6 | ~~Uploads and handouts (M9)~~ (PR #70), ~~tracing a map image (M10)~~ (PR #76), scenes (M11; ~~private notes~~ PR #70; ~~rules and view~~ PR #123, the screen is still to build, see P12), generating a map (M14) | M10 any; M11 engine for the view |
| P7 | The Universal VTT import (the editor's Map file > Import Universal VTT, PR #79) has only been tried on the hand-made test file, not a real export | any, with a real export |
| P8 | The editor cannot rename a map, and ~~shows no numbers for tile heights~~ (it shows them while the Height tool is active, #120) | any |
| P9 | Walking together: a follower brought up when a fight starts is set down, not walked, so a hidden trap on the way it would have come is not set off; a follower whose way back to the column is longer than 300 ft is dropped as not keeping up; ~~the undo list names follow actions only by their type~~ (#81) | engine |
| P10 | ~~The renderer does not draw a level's background picture (`level.image`), and the editor cannot set one~~ (PR #73) | any |
| P11 | Handouts: no shared pointer on an open handout; ~~undo of a handout or note action is labelled "handout (an action)"~~ (#81), and undoing a note takes it off the record but not off the screens it reached | any |
| P12 | Scenes: ~~the screen is not built~~ (the screen: `packages/client/scenes.js`, PR pending; undoing a `say` now clears the line from screens that showed it, by asking the record again). Still open: one scene at a time; only `say` is rate-limited, other scene actions only by the connection limit; a `checkAsked` reaches the DM but is not tied to the `check` that answers it (the screen keeps its own list of asks and drops one when the DM rolls or dismisses it); the screen has a smoke pass only (no unit tests for client code), not checked on a real phone keyboard, and NPC portraits are not covered by it. ~~The DM's chronicle picker, calling for a check, answering a player's request, and a fight with a scene open or prepared~~ are in the smoke pass (loose-ends PR) | client; engine |
| P12 | ~~Exporting a table does not carry its files~~ (#83: base64 with records, up to 24 MB, the rest listed). Still open: exporting a map from the editor carries no files, and there is no import of a table export | any |

| P13 | A creature that cannot be seen cannot be targeted by players even where the SRD allows attacking a guessed location (with Disadvantage); a party member's path may go around a creature the players cannot see, which shows that something is there | engine |
| P14 | Under the `light` sight rule each newly seen tile resends the whole map document to players (patches are per top-level field), which is a few tens of KB a step in a big dark place; tile memory is found by a flood that can miss a tile seen only through a sliver; sight is followed across tiles 40 hexes at most | engine |
| P15 | ~~Under the los and light sight rules, players see the fight order without an unseen creature and its turn as nobody's~~ (#101: one "someone unseen" slot and one `turn` line for a run of such turns, no id or count; the table rule `unseenTurns: quiet` says nothing). Still told: that some unseen creature is taking a turn (the game waits), whether a run of them spans the end of a round (the round number moves inside it, which shows there are at least two), ~~and, from the server, how many updates the run produced (one per action, empty for players)~~ (PR #151: a player is sent nothing for a change they may not know of). Still told by the clock: how long the game waits. A creature walking into view is sent with only the hexes of its path in view | any; the update count is the server's |
| P16 | A single-use modifier spent by an ability check (`abilityCheck` in engine.js) still ends without an `effectEnd` event; saving throws were fixed (#101). No SRD entry has a single-use check modifier yet | engine |
| P17 | ~~The stock maps are only offered in the editor's Map file tool, so the lobby cannot pick a map~~ (issue #163: the lobby and the DM panel offer them). Still open: they have no tables, chairs, beds, trees on a hex or other furniture (the object pack has none): the tavern's bar is a rail, pillars and boulders are rock hexes. A full map document is 35 to 70 KB each, sent whole by `loadMap` | any |
| P18 | ~~`loadMap` sets the party down by spiralling out from `starts[0]` and ignores the other starts, so a map's list of five starts only helps the linter and the DM~~ (#154: the party is set down on the starts in order, a start nobody can stand on is passed over, and anyone left spirals out from the first). Still: a start on an upper level needs a `z` to be found | engine |
| ~~P19~~ | ~~Floors (R2): a wall that ends or bends inside a hex does not cut it; the end of a corridor follows its tiles; walls are still drawn low, the cut-away is data but not drawn~~ (#150: done). Left: floor colour is even per cell, not smooth; no rim shading between patches; the cut-away snaps rather than fades; cave rock is a flat top with no cracks, and its face is not lowered toward the camera | any (renderer) |
| P20 | Timeline (R3): there is no 1x/2x speed control yet (the timeline has `setSpeed`), and ~~the DM has no control for the `pace` table setting~~ (issue #163: the DM panel has one); a player's own choice in the log panel can only make it quicker | any |
| P21 | Timeline (R3): the shown state is kept behind the table's only for hit points, death, place and conditions; doors, regions, effects and the map change when the update's first beat starts. The character sheet, tracker and action bar are redrawn when the picture is still, so they show the table's numbers a moment after the log. The renderer has no animation for falls, deaths or doors yet (R4) | any (renderer) |
| P22 | R4 left out: a portcullis slides (it swings like a door), `fell` has no dust and plays only if its event comes with the update that moves the creature, `size`, `effectStart`/`effectEnd`, `joined`, `noticed`, `triggered`, `turn` ring and `map` fade are not animated, nor are attack, damage and move clips (these need a model, or R5); animations run the table's nominal times, not the scaled length of a beat nor the 2x speed | any (renderer) |
| P23 | R5 left out: the renderer is chosen only by `?renderer=none` or the device preference `hextable.renderer` (no settings control); `kind` `'three'` is accepted since R11 (still no settings control); the governor steps only the pixel ratio (shadows, lights, decor and the rest of the spec's cut list do not exist yet); `dispose()` and `stats()` are not called by the app (stats shows only through the smoke script); `window.hextable.R` still hands the smoke script the default renderer's insides (`cam`, `floorData`, `actors`...), which a Three.js renderer would have to fake or the script would have to drop | any (renderer) |
| P24 | R10 left out: the vendored Three.js r187 is the readable build, not minified (upstream ships no minified file in `build/` and nothing here can make one): 2.3 MB raw, 458 KB gzipped, which is +75 % of the game's own gzipped script, about three times the spec's estimate; a person with npm should produce a minified build by the upgrade steps in `packages/client/vendor/README.md` before R11 ships to phones. The server's gzip is built (R10) | any (needs npm) |
| P25 | R11 left out: the Three.js renderer duplicates render.js's building code (`three-build.js`, because render.js may not be edited in the same change; R14 removes the duplicate); no real shadows (blobs only), no glTF (R12); the stand-in `LazyThree` shows nothing until the library has loaded (about 458 KB gzipped, once); a level's picture on the Three.js renderer and the region fade, `placed` and removal fades were written but not exercised by a smoke pass; frame times are only comparable, not measured on a device; `window.hextable.R.inner` is the smoke script's way to the Three.js renderer's insides | any (renderer) |

## Table and server

| # | What | Who |
|---|---|---|
| ~~T1~~ | ~~Undo history is in memory only and is lost when the server restarts~~ saved beside each table file (PR #67). Solo play still starts a reload with an empty history | any |
| ~~T2~~ | ~~The timeline grows without limit~~ chronicle entries are kept, the newest 5000 others (`TIMELINE_CAP`) (PR #69) | any |
| T3 | Per-address limits can be dodged without a proxy in front of the server (documented) | any |
| ~~T4~~ | ~~No client tests: UI work is checked by hand in a headless browser each time~~ `npm run smoke` drives the page in headless Chromium (PR #60). It is a smoke test, not a unit suite | any |
| ~~T8~~ | ~~Eight slow anonymous uploads hold every upload place on the server for minutes; table files have no cap over the whole server, so idle tables fill the disk over time; a failed write can leave a partial file~~ (#143, PR #148: 2 uploads at once per address and per table, a deadline and minimum rate, room checked before the body, a live DM seat, a 2 GiB cap for the server, cleanup at start; file reads rate-limited) | any |
| T9 | Left from #143: anyone can host a table and so upload (bounded, not prevented); many addresses together can still take the 8 server-wide upload places for up to 180 s each; idle tables' files are never expired, only capped; WebSocket connections have no idle timeout (20 per address); the DM cannot remove a let-in player or revoke their token, which would need a `kick` message in `tables.js` (review #132, L4) | any (L4: tables.js) |
| T5 | The pack's labels say SRD 5.2.1; the file it was checked against is SRD 5.2 | any |
| T6 | Under `diceThrow: 'throw'` a player throws only the rolls of actions they send. A roll inside someone else's action (a save against a monster's spell, an opportunity attack, a Concentration save) is thrown on their behalf and labelled; letting them throw it needs the prompts system (docs/specs/dice.md section 4). Since #127 this includes the rolls of a reaction taken by standing instruction (Deflect Attacks' 1d10) | engine (prompts), then client |
| T7 | Browser checks from the loose-ends pass (`npm run smoke`, `SMOKE_ONLY=armed, dice or scenes`). ~~Dice on screen (#117) never checked in a browser~~: an attack and its damage, a skill check, a monster's save and the throw tray are checked at 1280x800 and 390x844 touch (faces match the events the player was sent; a monster's save carries no dice to the player; the dice canvas is gone at rest; the tray clears the action bar). ~~Armed features (#124) never run in a browser~~: Stunning Strike armed, cancelled, tapped out of reach and tapped on a target, mouse and touch. **Still open:** Divine Spark and Bardic Inspiration are armed by the same code but not run; Turn Undead is a self feature (sent at once, never armed); a player's own save shown as dice, rolls by a creature the DM has hidden, and the look of the dice in flight are not checked; none of it on a real phone. A DM-side hostile cast at a party member starts the fight and the cast is dropped (autoEngage; noted, not changed) | client |
| T8 | ~~Reaction prompts (#135) have no client screen~~ (#146: the asked player gets a prompt they cannot dismiss, others a waiting notice, the DM a card to answer for them). The server still has no time limit on a waiting question; the DM's answer is the only override | client |
| T9 | Counterspell is offered only against spells cast through the engine's `cast` action: a monster's Spellcasting (cast by the DM by hand) and reaction spells (Shield, Counterspell itself) cannot be countered by the engine, and a reaction offered only against hostile casters means countering an ally is the DM's (#135) | engine |
| T10 | Under `diceThrow: 'throw'`, a reaction's own rolls (Hellish Rebuke's damage, Counterspell's save) are thrown on the player's behalf, as in T6. The prompt mechanism (#135) could now ask for them | engine, then client |
| T11 | Left from the security review of #132 (issue #136, PR #151). L2: creature ids (`m${seq}`) share one counter with effect ids, and a default name counts creatures of its kind the party does not know of ("Goblin Warrior 4" with one goblin in sight), so gaps say how many are hidden (a fight's number, `encounter.id`, sent as `fight` on `encounterStart`, `encounterEnd` and the conclusion since #181, is from the same counter, so two fights' numbers say how many things were made between them); since #151 a hidden id is answered as one that is nothing, so this no longer lets anyone find them, only count them. L4: the DM cannot remove a player once let in (no kick, no token revoke), and pending join requests are saved and count toward the table's seats. L5: `history` runs `turnBeforeUnseen` (a `lastIndexOf`) for each `turn`, quadratic in the timeline. Timing: a player who is sent nothing still sees how long the game waits for unseen creatures, and the server answers as fast as the action runs. An object's `key` (the name of the key that opens it) still goes to players Since #157 the reaction waiting notice goes only to players who can perceive what set it off; one who tries to act meanwhile is still refused because the table waits, which tells them something is going on | engine (L2, L5), any (L4) |
| T12 | The table UI drawer (`docs/specs/table-ui.md`, T1 and T2). The Handouts tab is shown to players who have handouts and not to the DM, whose handouts are in the DM tab (the spec says "or for the DM"). The About page's font credits were confirmed from the Fontsource packaging of the Google Fonts files, not from the Google Fonts pages, which this build could not reach: check them there. The README says "SRD 5.2.1" and carries a shorter credit; About carries the SRD's own statement, which says "SRD 5.2". The tracker has no initiative number for creatures the party can see but does not own, and no Reaction used for them: the view sends neither (by design). The drawer does not yet close itself for the map editor on a pinned layout | any |

## Specs still to write

Prompts (decisions after a roll), companions and summons, ~~the renderer plan~~ (#66, drafted in
`docs/specs/renderer.md`, to be reviewed), the persistent world and the AI DM interface.
