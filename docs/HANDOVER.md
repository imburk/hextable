# Hand-over note (12 November 2026)

For a fresh Claude conversation taking over Hextable. Read this, `CLAUDE.md`,
`AGENTS.md` and `docs/DEBT.md`; you do not need the old conversation.

## The owner and how he works

- Isaac (GitHub `imburk`), Claude Pro plan. "Please just run": end goal over
  minutiae; Claude owns design decisions and reports them briefly.
- **Budget is the constraint.** Keep the lead model's own turns short. Hand
  building to agents: Haiku for data entry, Sonnet for client screens and
  routine work, Opus only for engine or leak-sensitive work, and say so before
  starting an Opus job.
- **Single-threaded: one background job at a time.** Start the next job only
  when he says so. No hourly wake-ups unless asked. Claude cannot see usage
  limits; he pastes the usage page when it matters.
- Merging to main is authorised when tests, content check, build and
  `node --check` pass ("merge as appropriate"). Agents may land their own
  small pull requests under the rules in `docs/agents/AGENT-BRIEF.md`.

## State of main

- 523 tests pass; content check clean; build clean. Last merged: #120.
- State version 12. Content: 339 spells, 329 monsters, 15 conditions,
  24 objects, twelve classes (levels 1 to 20 as data; features built to
  about level 4). `npm run content` prints the tiers.
- Built and merged: maps with levels, walls, doors, regions, objects,
  triggers; height and size; sight (line of sight, cover, light, hiding);
  quick entry and build-from-class (#118); features on sheet and action bar,
  Short Rest (#119); map editor incl. UVTT import and tile heights (#120);
  combat tracker; handouts, assets, notes; DM undo/redo; party movement;
  Multiattack, recharge; zones; dice in events and on screen (#116, #117).
- Deploys on merge to main: GitHub Pages (solo), Railway (multiplayer).

## Parked work (branches pushed, not merged)

| Branch | What | Suggested model |
|---|---|---|
| `scenes-1` | Scenes: rules and view side, work in progress (4 commits) | Opus |
| `spells-retier-67` | Re-tier spell levels 6 to 9. May only move spells to `assist`. **Check Prismatic Spray in level 7: a non-SRD phrase was added and must come out.** | Haiku |
| `classes-5` | More class features past level 4 | Opus |
| PR #113 | Spell re-tiering levels 1 to 4, second look. Open, unreviewed. | review on Sonnet |

Agreed queue: scenes rules (Opus), then spell re-tier 6 to 9 (Haiku), then
class features (Opus), then the scenes screen (Sonnet, after scenes rules).

## Known gaps from the last jobs

- Dice on screen (#117): the agent ran out of usage before its final report,
  so what it left unverified is unknown. Try it on PC and phone.
- Build-from-class: no buttons for features aimed at another creature, Lay On
  Hands, or Reactions (engine has no reactions yet); Arcane Recovery's slot
  choice is missing from Short Rest; new screens have no automated test.
- `npm run smoke` was not re-run on main after #120.
- Uploads (handouts and assets) deserve a second security read before any
  public table. Sight views, handouts and undo were landed by agents with
  property tests but not line-reviewed.

## Owner decisions outstanding

- Turn the `?rooms` look on by default?
- `docs/specs/renderer.md` is an agent draft recommending Three.js once models
  arrive. Claude owes its own view before the owner decides.

## Running agents

- Brief: `docs/agents/AGENT-BRIEF.md`. It names paths that existed in the old
  workspace and must be recreated: worktrees under `/home/claude/wt/<name>`
  and the SRD text at `/home/claude/srd/srd52-flow.txt` and `srd52.txt`.
  Ask the owner to re-attach the SRD 5.2 PDF, then extract it with
  `pdftotext` (plain for `-flow`, `-layout` for the other). The repo labels
  the content 5.2.1; the PDF is 5.2.
- Each agent: one worktree, a `PROGRESS.md` (not committed), commit often,
  small pull requests, never `pkill`, browser checks at 1280x800 and 390x844.
- Open pull requests with `gh api repos/imburk/hextable/pulls`; merge with
  `gh api -X PUT repos/imburk/hextable/pulls/N/merge -f merge_method=merge`
  (merge commits, not squash, so stacked branches do not conflict).
- After merging two branches that touched the same file, run `node --check`
  on it: a union merge once left a doubled import in `app.js`.

## Where things are written down

`docs/DEBT.md` (what is wrong or missing, by area), `docs/srd-audit.md`,
`docs/ROADMAP.md`, specs in `docs/specs`.
