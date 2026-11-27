# Roadmap

Last checked against the code: 2026-11-20 (the counts are tested by `packages/rules/test/guides.test.js`). What is known to be missing is in [DEBT.md](DEBT.md); designs are in [specs](specs/README.md), each spec's status line says which of its stages are built. A deep dive and a proposed `v0.2`: [PATH-TO-0.2.md](PATH-TO-0.2.md).

## Done

- **Playable solo game and online tables.** Free roaming, hex-locked fights, enforced SRD 5.2 combat, sheets, DM tools, themes, monster AI; PC and phone. Every merge to `main` deploys the solo game to GitHub Pages; the table server hosts multiplayer on Railway (join by code, DM approval, saved, rejoin).
- **SRD content as data.** <!-- count:spells -->339<!-- /count --> spells, <!-- count:monsters -->329<!-- /count --> monsters, <!-- count:objects -->25<!-- /count --> map objects, <!-- count:feats -->17<!-- /count --> feats, <!-- count:items -->76<!-- /count --> magic items and <!-- count:species -->9<!-- /count --> species, each at an honest tier (`npm run content`).
- **Characters.** Twelve classes to level 20, build and levelling, multiclassing, feats, items with attunement, rests, ability-score methods, import from Fantasy Grounds. 61 class features are still left to the DM (`npm run content`).
- **Rules the engine runs.** Conditions, Concentration, lasting effects and zones, reactions (standing instruction or prompt), grappling, summons and companions with riding (stages C1 to C8 built, later stages partly: see [companions](specs/companions.md)).
- **Hidden information and sight.** Players are sent only what they can see: line of sight, cover, light, hiding and finding; no dice seed, no monster numbers.
- **Maps.** Levels, height, walls, doors, objects, traps, sizes; squares and hexes; stock maps; editor with tracing and Universal VTT import; handouts and private notes.
- **Homebrew.** A table holds its own packs: strict lint, the registry, packs stored on a table and sent to players filtered, the plain-words reader, the dry run, the DM's pack manager, the `hb` CLI, and homebrew subclasses of SRD classes (B1 to B7 of [homebrew](specs/homebrew.md); B1 to B5 of [homebrew-subclasses](specs/homebrew-subclasses.md)). The builder screens (B9 to B11) are not built.
- **Travel, shops, modules (first stages).** Map entries, places and parking, the world pack (W1 to W3 of [travel](specs/travel.md)); SRD prices, the market document and shop areas (P1 to P3a of [shops](specs/shops.md)); the vendored zip library and its safety checks (A0b of [adventure modules](specs/adventure-module.md)).
- **Table UI, items and feel.** Drawer, tracker, action panel, log by fight, defeat and rewards cards, potions, scrolls and charges, keyboard movement, feedback button, pinging a spot.
- **One renderer.** Three.js, vendored; the hand-written one is gone (R14).

## Next

Milestones, in this order (the owner's priorities change them; check the issue board):

| # | Milestone | Done when |
|---|---|---|
| 1 | Table UI | The rest of [the spec](specs/table-ui.md) and the one-token menu ([spec](specs/one-token-menu.md)): equipping and attuning, multiclass level-up, teleport aiming, terrain drawing |
| 2 | The class features the DM still runs | The 61 features left to the DM move to the engine where the vocabulary allows |
| 3 | More of the SRD plays by the rules | Effect steps for the spells the DM applies by hand; monster spellcasting and legendary actions |
| 4 | A real table | Play sessions with real groups on real phones, and fix what breaks |

Alongside: the first release tag `v0.1.0` (Three.js is the default; the lead tags it), and **`v0.2`**, a proposal waiting for the owner ([PATH-TO-0.2.md](PATH-TO-0.2.md)).

## Later

- 3D character models, then animation ([renderer spec](specs/renderer.md)).
- Persistent world across sessions; AI DM and AI characters reading the timeline.
- Rest of travel, shops and modules: stages after those above, in their specs.
- Portable characters ([spec](specs/portable-characters.md)); outside dice ([spec](specs/outside-dice.md)); the homebrew builder ([spec](specs/homebrew.md)).
- The official online service, a separate project: [service](service/FOUNDING.md).
