# Roadmap

What is known to be missing is in [DEBT.md](DEBT.md); designs are in [specs](specs/README.md).
A deep dive with counts (what the engine runs, the spell gap by mechanism, homebrew readiness) and a proposed `v0.2`: [PATH-TO-0.2.md](PATH-TO-0.2.md).

## Done

- **Playable solo game.** Free roaming, hex-locked fights, enforced SRD 5.2 combat, character sheets, DM tools, themes, monster AI. Runs on PC and phone.
- **Online.** Every merge to `main` deploys the solo game to GitHub Pages. The table server hosts multiplayer tables on Railway: join by code, DM approval, one character per player, saved between restarts, automatic rejoin.
- **Hidden information and sight.** Players are sent only what their characters can see: no dice seed, no monster numbers, no hidden creatures. Line of sight, light and darkness, hiding and searching.
- **SRD content as data.** 339 spells, 329 monsters, 25 map objects, 17 feats and 75 magic items, each at an honest tier (`npm run content`). Multiattack, recharge, conditions, Concentration, Temporary Hit Points, areas and zones that last.
- **Characters.** Twelve classes entered to level 20, build from class and level, levelling, multiclassing, feats, magic items with attunement, short rests and Hit Dice. Class features are entered to level 20 for all twelve classes: of 268, the engine runs 166 fully and 41 in part, and 61 are left to the DM (`npm run content`). Import from Fantasy Grounds.
- **Reactions.** Shield, Uncanny Dodge, Deflect Attacks, Counterspell and opportunity attacks, by standing instruction or a prompt.
- **Maps.** Levels, height, walls, doors, regions, objects and traps, creature sizes; six stock maps (five on hexes, one on squares); a map editor with tracing and Universal VTT import.
- **Sharing.** Handouts, private notes, table files, export of a table with its files.
- **DM tools.** Undo and redo, rewind to the start of a fight or rest, a chronicle, a marching order and followers, defeat and rewards at the end of a fight.
- **One renderer.** The 3D view is drawn by Three.js, vendored; it became the default in R14 step 1 (#354) and the hand-written renderer was removed in step 2 (#355) ([spec](specs/renderer.md), R14); see the first release below.
- **Table UI, first part.** A drawer with settings, About and the tracker; the defeat card; the rewards form and card.
- **Table UI, the action panel and the log.** The action panel with its tabs (spells with slots, sorting and filters; items), the combat log by fight, and the caster class-feature and feat screens (#283, #289, #288, #314).
- **Items in use.** Potions, scrolls, wands and staffs with charges, spells cast from items, and items passed, dropped and picked up (#282, #287, #291).
- **Companions and riding (14 to 16 November).** Stages C1 to C8 of [the spec](specs/companions.md): the bond, turns, summon blocks and spells, commands, corpses (Animate Dead), dismiss and recall, riding (#361, #363), the companion brain that plays a creature nobody commands (#368), and the screens (#369). Wild Companion and the other features (C9) and drawing a rider on its mount (C10) are not built.
- **Keyboard movement, a feedback button, spell kinds.** Keyboard movement with a follow camera (#364), the player feedback button (#359), every SRD spell tagged with its kinds, and a hostile cast that lands before the fight starts (#378, #373).
- **Homebrew, the registry.** `content/registry.js` lets one table hold its own pack (B4, #381). Nothing outside the rules package uses it yet.

## Next

**Homebrew, first slice (the owner's priority, 15 November).** Five jobs of [the spec](specs/homebrew.md) after which a DM can add a homebrew spell to a table and cast it: B1 (the safety check and strict lint), B4 (the registry; built, #381), B5 (packs stored on a table), B3 (the plain-words reading of a spell) and B7 (the screen to add a pack file). B1, B3 and B5 to B7 are not built. It runs beside the milestones below and does not renumber them.

In this order:

| # | Milestone | Done when |
|---|---|---|
| 1 | Engine and smoke-test refactors | The engine and the browser smoke test are split into smaller files behind the same behaviour, so several jobs can run side by side |
| 2 | Table UI | The rest of the table UI spec: screens for equipping and attuning items, multiclass level-up, teleport aiming and terrain drawing (the action panel and the combat log by fight are built) |
| 3 | The class features the DM still runs | The 61 class features left to the DM (all twelve classes, levels 1 to 20) move to the engine where the vocabulary allows |
| ~~4~~ | ~~Items in use~~ | ~~Potions, scrolls and charges, and items passed, dropped and picked up~~ (#282, #291) |
| 5 | More of the SRD plays by the rules | Effect steps for the spells the DM applies by hand; summoned creatures, monster spellcasting and legendary actions |
| 6 | A real table | Play sessions with real groups on real phones, and fix what breaks |

Alongside the milestones, not renumbering them: **R14, Three.js as the default
and removal of the hand-written renderer** (the owner, 15 November 2026), a
renderer job that touches no rules and can run any time. **The first release tag,
`v0.1.0`, is cut when Three.js is the default.** It has been the default since #354 and the old renderer is gone (#355); the lead tags it after that merges.

**`v0.2` is a proposal, not a decision:** "ready for game testing", with its must and should jobs, is laid out in [PATH-TO-0.2.md](PATH-TO-0.2.md) and waits for the owner.

## Later

- 3D character models, then animation (a renderer plan is drafted in specs)
- Scenes, and import of a table export
- Persistent world across sessions
- AI DM and AI characters reading the timeline
- Portable characters: a character file with a signed history and a level meter, joined to a table by the DM's choice ([spec](specs/portable-characters.md)); its pure parts (jobs P1 and P2) can start any time, the rest after milestone 2
- Square grid: maps on squares beside hexes, through one geometry interface ([spec](specs/square-grid.md), option B recommended, the owner to choose); its first jobs (S0 to S3) change no behaviour and can start any time; the lobby now offers the starter valley on squares or hexes and there is one square stock map (S12, #269)
- Homebrew beyond the first slice: the spell builder an AI can drive and the rest of [the spec](specs/homebrew.md) (the first slice is under Next)
- Outside dice: players roll their own dice by the DM's choice, typed first, then a phone's camera, other dice rollers and Bluetooth dice ([spec](specs/outside-dice.md), questions to the owner open); its first engine job (O1a) can start once they are answered
- The official service for online play (monikers, official character records, a lobby, reputation, anonymous statistics, AI stand-ins), a separate project: founding spec, interface draft and how the two leads work together in [service](service/FOUNDING.md) (#254). The service is also where a shared library of adventure modules would live, planned for now and not built ([adventure modules](specs/adventure-module.md), Decision 9)
