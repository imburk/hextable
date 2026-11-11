# Hextable — working notes for Claude

Read `docs/DESIGN.md` before changing architecture and `docs/ROADMAP.md` to see
what is in scope right now.

## What this is

A browser-based 3D virtual tabletop for D&D: free roaming until combat starts,
then a locked hex grid and turn-based play. SRD 5.2 rules are fully enforced by
the engine. Must work on PC, phone and tablet.

## Rules that do not bend

- **The server is authoritative.** Clients send intents ("move to hex", "cast
  spell at target"); the server validates against the rules and broadcasts
  results. Never trust client-computed outcomes.
- **Rules live in `packages/rules` only.** Pure TypeScript, no rendering, no
  network, no I/O. Everything in it is deterministic given a seeded RNG, and
  everything in it has tests.
- **Rules content is data, not code.** Spells, items, monsters and classes are
  JSON under `packages/rules/data`, validated by schema. Code implements
  mechanics (attack roll, saving throw, area shapes); data instantiates them.
- **Only SRD 5.2 content.** Nothing from non-SRD books goes in the repo.
- **Presentation is swappable.** The client renders whatever state it is given.
  Tokens, 3D models and animated models are interchangeable views of the same
  entity; skins change styling only, never rules.
- **Mobile is a first-class target.** Touch input and small screens are tested
  for every UI change, not retrofitted.

## Conventions

- TypeScript, strict mode, across all packages.
- Each new mechanic lands with tests citing the SRD section it implements.
- Small PRs, one module at a time.
