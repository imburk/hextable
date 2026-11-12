# Roadmap

Each milestone ends with something playable. What is known to be missing is in
[DEBT.md](DEBT.md); designs are in [specs](specs/README.md).

## Done

- **Playable solo game.** Free roaming, hex-locked fights, enforced SRD 5.2
  combat, character sheets, DM tools, themes, monster AI. Runs on PC and phone.
- **Repo, tests and CI.** Rules and server tests run on every push; `npm run smoke`
  drives the page in a headless browser (run by hand).
- **Online (solo).** Every merge to `main` deploys to GitHub Pages.
- **Table server.** Host a table, join by code, DM approval, one character per
  player, saved between restarts, automatic rejoin, a limit on what one address
  can ask for. Hosted on Railway.
- **Hidden information.** Players are not sent the dice seed, monster numbers,
  the timeline or hidden creatures; updates carry only what changed.
- **SRD content as data.** 339 spells, 329 monsters and 24 map objects, each at an
  honest tier (`npm run content`). Multiattack, Extra Attack, recharge, conditions,
  concentration, Temporary Hit Points, areas (lines and cubes too), spells with
  several targets, dice in modifiers.
- **Maps.** Levels, height, walls, doors, regions, objects and traps, creature
  sizes; a map editor with tracing over a picture and Universal VTT import;
  level pictures.
- **Sharing.** Handouts, private notes, table files, export of a table with its files.
- **Sight, in part.** Line of sight, cover, light and darkness, and `canSee` (used
  by Dodge, attacks and Invisible).
- **DM conveniences.** Undo and redo (saved with the table), a chronicle, quick entry of
  characters, a marching order and followers.

## Next

| # | Milestone | Done when |
|---|---|---|
| 1 | Characters | Character building and levelling, and the class features that are missing (Action Surge, Rage, Channel Divinity, Wild Shape...), so a campaign's characters can be played at any level |
| 2 | Reactions and the rest of combat | Reactions (Shield, Counterspell, choosing an opportunity attack), grapple and shove, short rests and Hit Dice |
| 3 | More of the SRD plays by the rules | Spells that leave a zone, summoned creatures, monster spellcasting and legendary actions, so that more of the 329 monsters and 339 spells leave the DM's hands |
| 4 | Sight for players | Hiding and finding, senses in use, and players sent only what their characters can see |
| 5 | Maps, the rest | Scenes, import of a table export, a map's files in its export |

## Later

- 3D character models, then animation (a renderer plan is drafted in specs)
- Persistent world across sessions
- AI DM and AI characters reading the timeline
- Model import and full skins
