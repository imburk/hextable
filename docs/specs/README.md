# Specs

Agreed designs. A spec is written before the work is split into issues, so
that whoever builds a piece, on whatever model, builds the same thing.

| Spec | Status |
|---|---|
| [Hidden information](hidden-information.md) | Built: players no longer receive the dice seed, monster numbers, the timeline or hidden creatures, and updates carry only what changed |
| [Rules expansion](rules-expansion.md): characters, levelling, conditions, the SRD data format, size and height, equipment states, forms, table rules, the combat tracker | Agreed. Built: the content format, effect steps, modifiers and conditions, durations and concentration (R1 to R4), quick entry, and space (R9, built under the maps spec); the rest is open, see the debt log |
| [Rules coverage review](rules-coverage.md): would the design support the full current rules and common house rules? | Review, done |
| [Maps and objects](maps-and-objects.md): buildings and caves, walls, doors, floors and height, size, traps and secret doors, room-by-room reveal, handouts, scenes, and how maps get into the game | Built: maps with levels, walls, doors, regions, objects and traps, checks, height and size (M1 to M7); the editor (M8); uploads, handouts and private notes (M9); tracing (M10); Universal VTT import (M12); object content (M13). Scenes (M11 beyond private notes) and generating a map (M14) to do |
| [Sight](sight.md): line of sight, cover, light and darkness, senses, hiding and finding, what players are sent | Proposed. Built: line of sight, cover, light and `canSee` (S1, S2, S4, S5); hiding, finding and what players are sent (S6, S7) are not |
| [Dice on the screen](dice.md): the faces of every roll in its event, who may see them, the `diceThrow` table rule, thrown 3D dice | Built in two parts: faces and `diceThrow` (rules), then the dice and throwing (client) |
| Prompts: reactions and decisions made after a roll | To write |
| Companions and summons | To write |
| [Renderer](renderer.md): rooms drawn from the map instead of hexes, the event timeline and waiting for animations, models and sizes, doors, traps and spells, phones, light and memory, the renderer interface, and the move to Three.js | Draft by an agent, to be reviewed by the design owner |
| [Table UI](table-ui.md): the slide-out drawer, the tracker in it, the context action panel, defeat, combat conclusion with XP and loot, the log by combat, preferences and table settings (#181, folds in #173) | Draft by an agent, to be reviewed by the design owner |
| [Portable characters](portable-characters.md): a character file that moves between games, a history signed by the servers that saw it (and what that does and does not prove), the level meter, the DM's choice of own or new characters, the compatibility report, what leaves a table, and the online layer: one official server, monikers, a stored hash, forks, reputation (#237 part A, amended by #278 for #244) | Draft by an agent, amended to the owner's decisions of 13 to 14 November; to be reviewed by the design owner |
| [Homebrew](homebrew.md): table packs linted on the server, what the vocabulary can and cannot say, the plain-language reader, the builder, and the route an AI model can drive outside the game; strictly the DM adds homebrew and homebrew monsters are never sent to players (#237 part B, amended by #278) | Draft by an agent, amended to the owner's answers of 14 November; to be reviewed by the design owner |
| [Square grid](square-grid.md): three options (replace hexes, both behind one geometry interface, stay) measured and compared; the design for both grids: `grid.js`, map format 2, movement, areas and cover on squares by the SRD's grid rules, the editor and UVTT import on squares (#240) | Draft by an agent, to be reviewed by the design owner |
| Persistent world and the AI DM interface | To write |
