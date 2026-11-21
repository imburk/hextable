# Spec: the create-character screen, reworked (#603) and the spell roll tag (#605)

Status: draft by an agent, for the owner to react to. A design job: this note and a clickable
picture, [`mockups/create-character.html`](mockups/create-character.html) (open it in a browser;
nothing in it runs the game). No code is written by this spec. The build is a later stage, in
`packages/client/buildsheet.js` and `style.css`.

The picture shows two sample characters, a level 5 Monk (Isaac's) and a level 5 Wizard (so spells
can be seen). Use the "Mockup controls" tab to switch character, theme, phone or desktop frame,
and the "Spell tag elsewhere" screen. Weapons, armour and spells are the game's own SRD 5.2 entries,
copied in by a script; the numbers on the live sheet are worked out by a small model in the file
and agree with `derive.js` where it can be checked (Monk level 5: AC 15, 38 HP, Speed 40 ft,
+6 to hit, 1d8+3).

## What the owner asked, and what the picture does

| # | He said (20 Nov) | Decision |
|---|---|---|
| 1 | No obvious "chi"; the sheet shows only "Monk's Focus · 5 uses" | The class resource is its own card at the top of its section: **Focus Points**, a big 5 with five dots, "all back on a Short Rest (or a Long Rest)", the save DC with its sum, and the subtitle "Monk's Focus: your chi". Under it, **what spends Focus Points**, one row each: Flurry of Blows, Patient Defense, Step of the Wind, Stunning Strike, each with a "1 Focus Point" chip and when it is used. On the phone the resource is also in the live strip (below). A Wizard's card is **Spell slots** (4, 3, 2 dots, back on a Long Rest) |
| 2 | Attacks and features are not obvious | Attacks have their own place, always on screen (the live sheet, item 4). Features are listed in groups by what they do (Attacks, Defence, Movement and recovery; for a Wizard Casting, Evoker, Skills), and every row says **when it is used** in a chip (Always on, Bonus Action, Reaction, Attack action, ...) and has a one-line summary and an **i** button for the whole text |
| 3 | Armour and weapons are not context-sensitive; only a hard-to-read red warning | The section opens with what the class is **trained** in. Trained items come first. Everything else sits under a disclosure ("Show weapons you are not proficient with (31)") that opens by itself when something in it is ticked. A row without training carries a **Not proficient** label (dark fill, light text, a "no" sign: readable in every theme, 11:1 or better) and a plain sentence saying what it costs. Weapon: "No Proficiency Bonus on the attack roll: +0 instead of +3". Armour: "Disadvantage on Strength and Dexterity rolls" and, for a caster, "can't cast spells"; for a Monk "turns off Monk features". Stealth Disadvantage and the Strength requirement (Speed -10 ft) are added where they apply, for everyone. A Shield without training: "No AC bonus". For a Monk a note says that armour or a Shield turns off Unarmored Defense, Martial Arts and Unarmored Movement; it turns into "Right now these are OFF" when it has happened. Monk weapons (Simple melee and Light martial melee) are marked and grouped first |
| 4 | The attacks table scrolls out of sight while picking weapons | The **live sheet** is pinned. On a phone it is a strip under the title: Armor Class, Hit Points, Speed, Initiative, the resource, and an attacks list three rows high that scrolls to the row you just changed and flashes it. A button folds the list away. On a desktop it is the right-hand panel, with every attack and the Focus Point options. Heads-up lines (the same penalties as above) appear under the attacks the moment they apply. Nothing on the left scrolls it away |
| 5 | Feats explain themselves only after being picked | Each feat row has its category, a one-line summary and an **i** button, before anything is chosen. A feat that cannot be taken says why in the row ("Already chosen; this feat can't be taken twice") instead of vanishing |
| 6 | The agreed menu format | The one accordion of `one-token-menu.md` round 5: one section open at a time, the bars before it pinned at the top and after it at the bottom, every bar shows its tip when none is open, the bars shrink to titles when one is open. A bar that needs a choice wears a badge ("Choose level 4 feat") whether open or closed. Save always says why it is greyed ("To choose: level 4 feat") |
| 7 | (#605) Every spell carries a tag beside its level: Attack, DEX save, No roll | One **tag** next to "(lvl 3)" or "(cantrip)", the same size as the level: **Attack** (tint, solid outline, a target icon), **DEX save** (no fill, solid outline, a die icon; the ability is named), **No roll** (dashed outline, muted). Three shapes, so no theme has to carry it by colour alone. Shown in the build list, in the live sheet's spell rows, and on the "Spell tag elsewhere" screen for the level-up picker, the Long Rest preparation list and the in-play spell list. The tag's info text says what it means ("The target rolls a Dexterity saving throw against your spell save DC 14") |

## Facts used, and where they came from

- Armor Training (SRD 5.2.1 Rules Glossary): without it, Disadvantage on any D20 Test that involves
  Strength or Dexterity, and no spellcasting; **a Shield without training only loses its AC bonus**
  (so the picture says exactly that, and does not say Disadvantage for the Shield).
- A weapon without proficiency: no Proficiency Bonus on its attack roll.
- Monk: proficient with Simple weapons and Martial weapons with the Light property; Monk weapons are
  Simple melee and Light martial melee; Martial Arts, Unarmored Defense and Unarmored Movement need
  no armour and no Shield. Focus Points: one per Monk level from level 2 (5 at level 5), back on a Short
  or Long Rest, save DC 8 + Wisdom modifier + Proficiency Bonus. Stunning Strike (level 5) costs 1.
- Armor table: Strength column means Speed -10 ft unless the wearer's Strength is at least that; the
  Stealth column means Disadvantage on Stealth.
- Numbers (Armor, weapon damage and properties, spell levels, effects) come from
  `packages/rules/src/content/srd52`. Spell cantrip damage at level 5 is the data's own step (2 dice).

## Findings the build must deal with

1. **The engine refuses what the picture allows.** `derive.js` `validate` rejects a weapon the class
   is not proficient with ("the engine does not yet apply attacking without proficiency, so choose
   another weapon"), refuses an untrained Shield, and says of untrained armour "The engine does not apply
   that; choose other armour". The rules allow all three, with the costs the picture shows. Showing the
   label and the cost is a client change; letting the player pick them needs the engine to apply the
   cost (or hand it to the DM with a `manual` event). That is an engine change with its own spec
   amendment, not part of this one. See question 1.
2. **The spell tag cannot be derived reliably from the data today.** The picture derives it from each
   spell's effect steps (an `attack` step: Attack; a `save` step: its ability; otherwise No roll). That
   is right for the 47 `auto` and most of the 92 `assist` spells, but 200 of 339 spells are `manual`,
   whose effect is free text, so a derived tag says "No roll" for spells that make the target roll
   (checked in the data: Stinking Cloud, Flaming Sphere, Bestow Curse and Dragon's Breath all derive
   "No roll"; the SRD text gives them CON, DEX, WIS and DEX saves). A wrong tag is worse than none.
   See question 3.
3. The sunlit theme's button pair (white on green) is 3.4:1, under 4.5. The picture avoids it for small
   chips (it tints and uses the ink colour instead, 4.6 to 7); the theme's own Save button keeps the pair.
   Worth a look when themes are next touched; not changed here.
4. Phone working height: with 6 bars (Monk) the open section has about 336 px between the bars on a
   390 x 844 screen; with 7 (Wizard) about 290 px. The bars are the same height whichever is open, so
   every section added costs about 46 px. See question 5.

## Build notes (for the later stage)

- One function `spellRoll(spell)` returning `{ kind: 'attack' | 'save' | 'none', ability? }`, used by every
  place a spell is drawn (build, level up, preparing, the in-play list). One component draws the tag.
- The live sheet reads the same `derive()` the Save button uses; the preview is not a second set of rules.
  It must show `derive`'s own penalties once question 1 is settled.
- The accordion should be the one helper the menu uses, not a copy.
- Every target is at least 44 px; nothing depends on hover; the info buttons are real buttons with
  `aria-expanded`; the flash on a changed attack is off when the system asks for reduced motion.
- Checked in headless Chromium at 390 x 844 (touch) and 1280 x 800 in all three themes: no overflow, no
  target under 44 px, no network request, nothing scrolls the pinned strip away.

## Open questions for Isaac

Each has the default the build will use unless he says otherwise.

1. **May a player pick armour, a Shield or weapons they are not proficient with?** The rules allow it,
   with the costs shown. The engine refuses it today. *Default: yes, allowed and labelled. The build
   shows the labels first (the items stay greyed with the reason), and the engine stage that applies the
   costs follows.*
2. **What do we call the Monk's resource?** The SRD says Focus Points. *Default: the card is titled
   "Focus Points" with "Monk's Focus: your chi" beside it. Alternative: "Chi (Focus Points)".*
3. **Where does the spell tag come from?** *Default: add one optional field to the spell data (the
   kind of roll and its ability), filled for all 339 spells from the SRD text, with a test that it agrees
   with the effect steps wherever those have an attack or a save. Alternative: derive it, and show no tag
   on a `manual` spell until it is entered.*
4. **A spell with two rolls, or a roll only sometimes** (an attack and a save in one spell; a save
   only if a creature is targeted). *Default: show the roll that decides whether it works, and name a
   second one in the info text. Alternative: two tags.*
5. **Fewer bars on a phone?** Each section costs about 46 px of working height. *Default: keep the six
   (seven for casters) as shown. Alternative: Skills joins Who, as "Basics", saving one bar.*
6. **Should the "not proficient" lists start closed?** *Default: closed with a count, opening by itself
   when something in them is ticked. Alternative: always open, trained items first.*
7. **Unarmed Strike for every class?** The picture lists it only for the Monk, whose main attack it is.
   *Default: Monk only on the build screen; everyone has it in play.*
8. **Do the level-up and Long Rest preparation lists get the tag in the same build?** *Default: yes,
   one component, all four places at once (build, level up, prepare, in play).*
9. **Feat text for a feat the engine cannot fully apply** (for example Savage Attacker, where the DM
   applies the second roll). *Default: the info text shows only the rule; a "the DM applies this" chip is
   a later addition, in the same way for features.*
