# Creature models: credits and licences

All models here are **CC0 1.0 (public domain)**. Each folder keeps the licence file that came with its pack, unchanged. Credit is not
required by the licence; it is given here because the makers deserve it.

| Folder | What | Made by | Pack and licence |
|---|---|---|---|
| `kaykit-adventurers/` | Four heroes: Barbarian, Knight, Mage, Rogue (copied as they are) | Kay Lousberg, www.kaylousberg.com | KayKit Adventurers Character Pack 2.0 (FREE), CC0 (`License.txt`) |
| `kaykit-skeletons/` | Skeleton Minion (copied as it is) | Kay Lousberg | KayKit Skeletons Character Pack 1.1 (FREE), CC0 (`License.txt`) |
| `kaykit-rig-medium/` | Seven animation clips of KayKit's shared "Rig Medium" (Idle_A, Walking_A, Running_A, Hit_A, Death_A, Throw, Use_Item), with the mannequin mesh left out | Kay Lousberg | From `Rig_Medium_General.glb` and `Rig_Medium_MovementBasic.glb`, the same two files in the Adventurers and Skeletons packs; CC0 (`License.txt`) |
| `quaternius-monsters/` | A small and a big orc (`Blob_Orc.glb`, `Big_Orc.glb`) and their shared texture atlas | Quaternius, quaternius.com | Ultimate Monsters Bundle, CC0 (`License.txt`) |

## What was changed

Nothing in a model was edited: the vertices, bones, weights and keyframes are the packs' own. The four heroes and the skeleton are the packs'
`.glb` files byte for byte. The rig file and the two orcs were made again by `pack-models.mjs` (here, with the commands in its header) from the
packs' own glTF files: only the clips the game uses were kept, unused data was dropped, and the orcs' texture was left as one file
(`Atlas_Monsters.png`, identical in every folder of the pack) instead of inside each model.

The licence file in the Quaternius pack is headed "Ultimate Platformer Pack" (the maker's text, copied unchanged); it states CC0 1.0.

## What is used for what

The game's starter pack (`packages/client/themes.js`, `STARTER_MODELS`) draws the Fighter and the Monk with the Barbarian, the Cleric and the
Paladin with the Knight, the Rogue, Ranger and Bard with the Rogue, the Wizard, Sorcerer, Warlock and Druid with the Mage; a skeleton with the
Skeleton Minion; goblins with the small orc; an ogre with the big orc. Everything else is still a pawn.

## Not here

The Quaternius Bestiary, Fantasy Races and Fantasy Props packs are under the Quaternius Asset License, which does not allow the files to be
passed on: none of them, nor anything made from them, may go in this repository. The KayKit Dungeon and Medieval Hexagon packs (CC0) are not used.
