# Specs

Last checked against the code: 2026-11-20 (tested by `packages/rules/test/guides.test.js`: every spec file is listed here and every link resolves). Agreed designs, written before the work is split into issues so that whoever builds a piece builds the same thing. Each spec's own `Status:` line, and its build notes, are the truth about what is built; the column below is a summary.

"Draft" means written by an agent and not yet reviewed by the design owner. Specs are long: read the section you build, not the whole file.

| Spec | About | Status |
|---|---|---|
| [Hidden information](hidden-information.md) | What players are never sent; updates carry only what changed | Built |
| [Rules expansion](rules-expansion.md) | Characters, levelling, conditions, the SRD data format, size and height, equipment, forms | Agreed; R1 to R4, quick entry and space built; rest in DEBT |
| [Rules coverage](rules-coverage.md) | Would the design support the full rules and common house rules? | Review, done |
| [Maps and objects](maps-and-objects.md) | Levels, walls, doors, regions, objects, traps, editor, handouts, tracing, Universal VTT | Agreed; M1 to M10, M12, M13 built; scenes beyond private notes (M11) and map generation (M14) not |
| [Sight](sight.md) | Line of sight, cover, light, senses, hiding and finding, views by sight | Built: S1, S2, S4 to S7 |
| [Dice](dice.md) | Faces of every roll in its event, `diceThrow`, thrown 3D dice | Built |
| [Outside dice](outside-dice.md) | Players roll their own dice; typed, camera, Bluetooth | Draft, amended to the owner's twelve answers of 20 November |
| [On weapon hit](on-hit.md) | Smites, hit riders, weapon-changing spells | Draft; see its build notes |
| [Companions and summons](companions.md) | The bond, turns, summon blocks, commands, corpses, riding | Draft; C1 to C8 built |
| [Grapple and shove](grapple-shove.md) | The Grappled rules, monsters that grapple, the AI's part | Draft; built (see its build notes) |
| [AI casting](ai-casting.md) | Built spellcasters played by the AI cast spells | Draft; AC1 and AC2 built |
| [Renderer](renderer.md) | Rooms from the map, timeline, models, the renderer interface, Three.js | Draft; Three.js default and the old renderer removed (R14) |
| [Table UI](table-ui.md) | Drawer, tracker, action panel, defeat, rewards, log by combat | Draft; largely built |
| [One token, one menu](one-token-menu.md) | One token that opens one menu; supersedes the player's screen where they differ | Draft |
| [Player's screen](player-screen.md) | The moments of a player at the table | Draft; superseded in part |
| [Starting page](start-page.md) | Play and Tools, Carry on | Draft |
| [Keyboard](keyboard.md) | WASD and arrows, follow camera, key maps | Built (#357) |
| [Feedback button](feedback.md) | A comment with what the player was just shown | Built (first version) |
| [Portable characters](portable-characters.md) | A character file with a signed history and level meter | Draft; nothing built |
| [Homebrew](homebrew.md) | Table packs, the registry, reader, dry run, builder | Draft; B1 to B7 and the CLI built; builder (B9 to B11) not |
| [Homebrew subclasses](homebrew-subclasses.md) | A subclass of an SRD class as a pack entry | Draft; B1 to B5 built |
| [Species](species.md) | SRD species as content, the sheet field, homebrew species | Draft; SP1 and SP2 built |
| [Ability scores](ability-scores.md) | Standard array, point buy, rolling, the DM's reroll rule | Agreed; built |
| [Spells on the sheet](spells-on-the-sheet.md) | One Cantrips list, changes by SRD rule, the Wizard's spellbook | Draft |
| [Square grid](square-grid.md) | Squares beside hexes behind one geometry interface | Agreed; S0 to S14 built |
| [Travel](travel.md) | Atlas of nested maps, places, parking, journeys, vessels | Draft; W1 to W3 built |
| [Shops and loot](shops.md) | Market pack, shops, purses, haggling | Draft; P1, P2, P3a built |
| [Adventure modules](adventure-module.md) | A zip the DM prepares and adds to a game | Draft; A0b (the zip library) built |
| [DM helper](dm-helper.md) | A goal for the encounter, an intention for each NPC, the queue of recommended moves, shifts, leaving a fight and truce, recurring villains; the other DM and player helpers, ranked | Draft; nothing built |

Still to write: prompts (reactions and decisions made after a roll), persistent world and the AI DM interface.
