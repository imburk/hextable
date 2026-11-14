# Roadmap

What is known to be missing is in [DEBT.md](DEBT.md); designs are in [specs](specs/README.md).

## Done

- **Playable solo game.** Free roaming, hex-locked fights, enforced SRD 5.2 combat, character sheets, DM tools, themes, monster AI. Runs on PC and phone.
- **Online.** Every merge to `main` deploys the solo game to GitHub Pages. The table server hosts multiplayer tables on Railway: join by code, DM approval, one character per player, saved between restarts, automatic rejoin.
- **Hidden information and sight.** Players are sent only what their characters can see: no dice seed, no monster numbers, no hidden creatures. Line of sight, light and darkness, hiding and searching.
- **SRD content as data.** 339 spells, 329 monsters, 24 map objects, 17 feats and 75 magic items, each at an honest tier (`npm run content`). Multiattack, recharge, conditions, Concentration, Temporary Hit Points, areas and zones that last.
- **Characters.** Twelve classes entered to level 20, build from class and level, levelling, multiclassing, feats, magic items with attunement, short rests and Hit Dice. Class features built for levels 1 to 6 of every class, and to level 15 for Paladin, Cleric, Druid, Sorcerer and Bard. Import from Fantasy Grounds.
- **Reactions.** Shield, Uncanny Dodge, Deflect Attacks, Counterspell and opportunity attacks, by standing instruction or a prompt.
- **Maps.** Levels, height, walls, doors, regions, objects and traps, creature sizes; six stock maps (five on hexes, one on squares); a map editor with tracing and Universal VTT import.
- **Sharing.** Handouts, private notes, table files, export of a table with its files.
- **DM tools.** Undo and redo, rewind to the start of a fight or rest, a chronicle, a marching order and followers, defeat and rewards at the end of a fight.
- **Two renderers.** The default view and a Three.js one at parity, with the Three.js library vendored.
- **Table UI, first part.** A drawer with settings, About and the tracker; the defeat card; the rewards form and card.

## Next

In this order:

| # | Milestone | Done when |
|---|---|---|
| 1 | Engine and smoke-test refactors | The engine and the browser smoke test are split into smaller files behind the same behaviour, so several jobs can run side by side |
| 2 | Table UI | The rest of the table UI spec: the action panel, the combat log by fight, and screens for feats, equipping and attuning items, multiclass level-up, teleport aiming and terrain drawing |
| 3 | Remaining class levels | Levels 7 and up for the seven classes still at level 6, then the manual features of the rest |
| 4 | Items in use | Potions, scrolls and charges, and items passed, dropped and picked up |
| 5 | More of the SRD plays by the rules | Effect steps for the spells the DM applies by hand; summoned creatures, monster spellcasting and legendary actions |
| 6 | A real table | Play sessions with real groups on real phones, and fix what breaks |

## Later

- 3D character models, then animation (a renderer plan is drafted in specs)
- Scenes, and import of a table export
- Persistent world across sessions
- AI DM and AI characters reading the timeline
- Portable characters: a character file with a signed history and a level meter, joined to a table by the DM's choice ([spec](specs/portable-characters.md)); its pure parts (jobs P1 and P2) can start any time, the rest after milestone 2
- Square grid: maps on squares beside hexes, through one geometry interface ([spec](specs/square-grid.md), option B recommended, the owner to choose); its first jobs (S0 to S3) change no behaviour and can start any time; the lobby now offers the starter valley on squares or hexes and there is one square stock map (S12, #269)
- Homebrew packs per table, a plain-language reader and a spell builder an AI can drive ([spec](specs/homebrew.md)); the pure parts (jobs B1 to B4) can start any time, the table and client jobs after milestone 2
- The official service for online play (monikers, official character records, a lobby, reputation, anonymous statistics, AI stand-ins), a separate project: founding spec, interface draft and how the two leads work together in [service](service/FOUNDING.md) (#254)
