# Hextable

An open source 3D virtual tabletop for D&D. Players roam the world freely; when a
fight starts, the ground locks to a hex grid and play becomes turn-based, with the
SRD 5.2 rules enforced by the engine.

Runs in a browser on PC, phone and tablet.

## Play

https://imburk.github.io/hextable/

This is the solo version: you are the DM and all four heroes, and the game is
saved in your browser. Multiplayer tables need the table server running
somewhere; see [packages/server](packages/server/README.md).

## Development

Needs Node.js 22 or newer. There are no dependencies to install.

```
npm test     # run the rules and server tests
npm start    # build, then run the table server at http://localhost:8080
```

See [docs/DESIGN.md](docs/DESIGN.md) for the architecture.

## Licence

MIT. See [LICENSE](LICENSE).

## Rules content

Hextable uses the System Reference Document 5.2.1 by Wizards of the Coast LLC,
available under the Creative Commons Attribution 4.0 International License.
