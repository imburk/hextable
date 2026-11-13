# Security

## Reporting a problem

Please report security problems privately, not in a public issue: on the
repository page, open **Security**, then **Report a vulnerability**. You will
get an answer as soon as the maintainer can give one. If the problem is being used against a live
table, say so in the first line.

Say what you did, what you expected and what happened, with the smallest
example you can. A table file, a map file or a short script is ideal.

## In scope

- **The table server** (`packages/server`): anything that lets one visitor
  read or change another table, act as the DM or as another player, skip the
  per-address limits, read files outside a table's own uploads, or crash or
  stall the server for everyone.
- **Hidden information**: anything that sends a player what their character
  should not know. The dice seed, a hidden creature, a monster's numbers, a
  DM's private note, a secret door: by any route, including identifiers,
  ordering, timing and error messages.
- **The importers** (Fantasy Grounds characters, Universal VTT maps, table
  files): a file that makes the server or another player's browser run code,
  read data it should not, or use unbounded memory or time.
- **The client**: script injection through names, notes, handouts or uploads.

## Out of scope

- A DM cheating at their own table: the DM is trusted with everything in it.
- Rules mistakes. Those are ordinary bugs: use the rules error template.
- Denial of service that needs more traffic than one home connection.
- Problems in a fork or in a table server run with the limits switched off.

## Supported versions

Only the current `main`, which is what both public deployments run.
