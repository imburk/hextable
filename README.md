# Hextable

An open source 3D virtual tabletop for D&D. Players roam the world freely; when a
fight starts, the ground locks to a hex grid and play becomes turn-based, with the
SRD 5.2 rules enforced by the engine.

Runs in a browser on PC, phone and tablet.

## Status

Early development: the repo skeleton is in place and the rules engine is next. See [docs/DESIGN.md](docs/DESIGN.md) for the architecture and
[docs/ROADMAP.md](docs/ROADMAP.md) for the build order.

## Development

Needs Node.js 22.18 or newer.

```
npm install
npm run typecheck
npm test
```

TypeScript runs directly in Node, so there is no build step yet. The client
gets a bundler when the 3D scene is added.

## Licence

MIT. See [LICENSE](LICENSE).

## Rules content

Hextable uses the System Reference Document 5.2 by Wizards of the Coast LLC,
available under the Creative Commons Attribution 4.0 International License.
