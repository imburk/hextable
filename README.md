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
