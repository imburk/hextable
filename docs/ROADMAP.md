# Roadmap

Each milestone ends with something playable. Model suggestions assume a Pro
plan: the strongest model for design and hard bugs, Sonnet for implementation,
Haiku for bulk data entry.

## Week one: a fight you can play

| # | Milestone | Done when | Model |
|---|---|---|---|
| 1 | Repo skeleton | Monorepo builds, tests run, CI is green | Sonnet |
| 2 | Rules core | Creatures, ability checks, attack rolls, saves, damage, HP and death, with tests | Top model to design, Sonnet to build |
| 3 | Hex combat | Initiative, turn loop, movement budget, opportunity attacks on a hex grid, all headless and tested | Sonnet |
| 4 | Server | Create a session, join by link, DM approval, intents in and events out | Sonnet |
| 5 | Client v1 | 3D ground, tokens, free roam, hex lock on combat, tap to move and attack, works on a phone | Sonnet |
| 6 | Sheet v1 | Live character sheet; attacking from the sheet works | Sonnet |
| 7 | Online | Client and server deployed; a group can play one fight from a link | Sonnet |

## After week one

- SRD content in bulk: spells, monsters, items as data (Haiku, checked by tests)
- Spellcasting: slots, concentration, areas of effect on hexes
- Conditions, resting, levelling, character creation
- Visibility and fog of war
- 3D character models, then animation
- Terrain height and types
- Persistent world and timeline
- AI DM and AI characters
- Model import and skins
