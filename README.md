# Hextable

An open source 3D virtual tabletop for D&D. Players roam the world freely; when a
fight starts, the ground locks to a hex grid and play becomes turn-based, with the
SRD 5.2 rules enforced by the engine.

Runs in a browser on PC, phone and tablet.

## Play

- **With a group:** https://hextable-production.up.railway.app/ — one person
  hosts a table and shares the code; the others join and the DM lets them in.
- **Solo:** https://imburk.github.io/hextable/ — you are the DM and all four
  heroes, and the game is saved in your browser.

To run your own table server, see [packages/server](packages/server/README.md).

## What it does

- **Free roaming, then a fight.** The party walks the map freely; when it comes near enemies
  (or the DM calls for it) the ground locks to a hex arena with initiative and turns. Heights,
  sizes, flying and falling count.
- **SRD 5.2.1 rules, enforced by the engine.** Attacks, saving throws, damage types, the fifteen
  conditions, concentration and lasting effects, Temporary Hit Points, death saves, Multiattack and
  Extra Attack, opportunity attacks, cover, rests. What the engine cannot apply it hands to the DM
  as a note, and says so; it does not guess.
- **Content as data.** 339 spells, 329 monsters (with their actions, recharges and Multiattack)
  and 24 map objects are entered. Not all play by the rules yet: 28 spells and 57 monsters do, most
  of the rest are partly applied and partly left to the DM. `npm run content` lists them by tier.
- **Monsters play themselves** (the DM can switch that off): they use every action, area attacks and
  Multiattack.
- **Maps with rooms.** Levels, walls, doors, regions the DM reveals one at a time, traps, hidden
  things and checks to find them, light and darkness, line of sight and `canSee`. A map editor
  (paint, trace a picture with walls and doors, import a Universal VTT file) works on a phone.
- **Handouts and notes.** The DM shows a picture or text to everyone or to chosen players, and can
  send a private note; a level can have a picture behind it. Pictures are PNG, JPEG or WebP kept on
  the table server (in the browser for solo play).
- **Parties.** Four pregenerated heroes, quick entry for characters you already have, a marching
  order, and followers who walk behind a leader.
- **Tables.** Host a table, join by code, the DM lets people in, each player takes one character,
  and a refresh or restart rejoins. Players are sent only what their characters may know: no dice
  seed, monster numbers or hidden creatures.
- **For the DM.** Undo and redo with plain-words labels, a combat tracker, a chronicle, table rules
  (cover, climbing, passive Perception and more), and **Export table** to keep a copy of the game
  with its files (up to 24 MB of pictures; there is no import yet).
- **Phones.** Touch controls throughout, checked at 390 by 844, and several colour themes.

Not there yet, among other things: levelling and character building, most class features (Action
Surge, Rage, Wild Shape...), reactions beyond opportunity attacks, legendary actions, monster
spellcasting, spells that leave a zone behind, summoned creatures, hiding, and sending players only
what they can see. The full list is in [docs/DEBT.md](docs/DEBT.md).

## Development

Needs Node.js 22 or newer. There are no dependencies to install.

```
npm test     # run the rules and server tests
npm run content   # list rules content entered so far, by tier
npm start    # build, then run the table server at http://localhost:8080
npm run smoke   # browser smoke test (needs global playwright; skips itself without it; not part of npm test)
```

See [docs/DESIGN.md](docs/DESIGN.md) for the architecture.

## Licence

MIT. See [LICENSE](LICENSE).

## Rules content

Hextable uses the System Reference Document 5.2.1 by Wizards of the Coast LLC,
available under the Creative Commons Attribution 4.0 International License.
