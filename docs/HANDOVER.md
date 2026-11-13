# Hand-over note (13 November 2026)

For a fresh Claude conversation taking over Hextable, on either of the owner's
accounts. Read this, `CLAUDE.md`, `AGENTS.md`, `docs/agents/AGENT-BRIEF.md` and
`docs/DEBT.md`; you do not need any earlier conversation.

## The owner and how he works

- Isaac (GitHub `imburk`). "Please just run": end goal over minutiae; Claude
  owns design decisions and reports them briefly.
- **Two Claude accounts work on this repo.** They cannot see each other's
  chats or memory. Everything shared goes through GitHub (see "Two accounts").
  - **Max account: lead and builder.** Runs engine jobs and screens, and is
    the only account that merges to main.
  - **Pro account: reviewer and small jobs.** Independent reviews of
    leak-sensitive code, Haiku data entry, doc upkeep. Budget is tight there.
- Keep the lead model's own turns short. Hand building to agents: Haiku for
  data entry, Sonnet for client screens, reviews and routine work, Opus for
  engine or leak-sensitive work. Say so before starting an Opus job.
- Claude cannot see usage limits; he pastes the usage page when it matters.
  On the Pro account ask for it before an Opus job.
- Start the next job only when he says so, unless he has asked for a chain.
  No hourly wake-ups unless asked.
- Merging to main is authorised when tests, content check, build and
  `node --check` pass. **The lead merges, after re-running `npm test` on the
  branch and reading the diff's file list. Agents do not merge.**

## What a job costs (measured 12 November, Pro account)

| Job | Model | Agent tokens | Time | Weekly limit |
|---|---|---|---|---|
| Spell re-tier, 4 levels | Haiku | 140k | 4 min | under 1 point |
| Review of one PR | Sonnet | 113k | 2.5 min | about 1 point |
| One screen, with browser check | Sonnet | 190k | 14 min | 1 to 1.5 points |
| Engine job | Opus | 150k to 245k | 12 to 26 min | 1.5 to 3 points |

Points are percent of the Pro weekly limit, the lead's turns included. Agent
work did not draw on the Fable meter; only the lead's own turns did. A Max
account has five times the Pro allowance.

## State of main

- 574 tests pass; content check clean; build clean; `npm run smoke` passes
  (run on #126; not re-run after #127, which changed no client file).
- Last merged: #127. **State version 14.**
- Content: 339 spells, 329 monsters, 15 conditions, 24 objects, twelve
  classes (levels 1 to 20 as data; features built through level 6).
  `npm run content` prints the tiers.
- Deploys on merge to main: GitHub Pages (solo), Railway (multiplayer).

Merged on 12 and 13 November:

| PR | What | Built by |
|---|---|---|
| #122 | Spell re-tier, levels 6 to 9. Prismatic Spray target fixed to a 60-foot Cone | Haiku, fix by lead |
| #113 | Spell re-tier, levels 1 to 4, reviewed against the SRD | review on Sonnet |
| #123 | Scenes: rules, view, leak tests (state 13) | Opus |
| #124 | Class features, levels 5 and 6; action bar can arm a feature aimed at one creature | Opus |
| #125 | Scenes: the screen | Sonnet |
| #126 | Tests and smoke passes for Sleet Storm, Ray of Enfeeblement, armed features, dice on screen, scenes | Sonnet |
| #127 | Reactions, part 1: one Reaction a round, standing instructions, Shield, Uncanny Dodge, Deflect Attacks (state 14) | Opus |

No branches are parked. `scenes-1`, `spells-retier-67`, `classes-5`,
`scenes-screen`, `loose-ends-1` and `reactions-1` are merged and can be deleted.

## Next work, in order

1. **Reactions control on the sheet (Sonnet).** No screen sets standing
   instructions yet, and Shield defaults to "never" because it spends a slot,
   so **Shield cannot be used from the app until this lands.** The actions are
   in `packages/server/README.md` and under Decision 4 in
   `docs/specs/rules-expansion.md`.
2. **Independent security read (Opus, Pro account, report only).** Uploads
   (handouts and assets), sight views, undo, scenes, reactions. All were
   landed by agents and tested by the same agents; nobody else has read them.
   Do this before any public table.
3. **Housekeeping (Haiku).** Make the tests that pin the state version read it
   from one place (seven files change on every bump). Add a linter check: a
   spell whose effects roll a save must not have `target: {"self": true}`
   unless the SRD says so (this caught nothing mechanically but was the bug in
   Prismatic Spray and Sleet Storm).
4. **Reactions, part 2 (Opus).** Counterspell, Hellish Rebuke, prompting a
   player mid-action, monster reaction fields (DEBT M3).
5. **Class features from level 7 (Opus).** DEBT C8 lists what waits on
   missing engine parts.

## Known gaps

- Reactions (#127): history labels as a player sees them are not leak-tested;
  the new `reactions.js` was not line-reviewed by the lead.
- Stunning Strike does not check that a hit came first, or the once-a-turn
  limit; the DM is told.
- A DM's hostile cast at a party member starts the fight and the cast is
  dropped (`autoEngage`). Not decided whether that is right.
- Scenes: `checkAsked` is not tied to the `check` that answers it, so the
  DM's list of asks is client-side and lost on reload. Not tried: a real
  on-screen keyboard, portrait upload, solo mode.
- Dice on screen: a player's own save, rolls by a DM-hidden creature and the
  look of dice in flight were not checked.
- Build-from-class: no buttons for Lay On Hands; Arcane Recovery's slot
  choice is missing from Short Rest.
- The client is tested only by `scripts/smoke.mjs` (`SMOKE_ONLY=scenes`,
  `armed`, `dice` run one pass alone).
- `engine.js` (2,400 lines) and `app.js` (900) are where parallel work collides.

## Owner decisions outstanding

- Turn the `?rooms` look on by default?
- `docs/specs/renderer.md` is an agent draft recommending Three.js once models
  arrive. Claude owes its own view before the owner decides.

## Two accounts: how they work together

There is no direct channel between the accounts. GitHub is the channel:

- **This file** is the state. The lead updates it at the end of each working
  session, through a pull request like any other change.
- **GitHub issues are the work queue and the message board.** One issue per
  job, listing the files it may touch (`AGENTS.md`). To leave a message for
  the other account, comment on the job's issue or pull request; a fresh
  conversation starts by reading open issues and pull requests
  (`gh api repos/imburk/hextable/issues`, `.../pulls`).
- **Reviews are pull request comments**
  (`gh api repos/imburk/hextable/issues/N/comments -f body=...`).

Rules that keep parallel work safe:

1. **One engine job at a time across both accounts.** `engine.js`, `view.js`,
   `effects.js` and `packages/server/src/tables.js` are one lane. Client
   screens, content data, tests and docs can run beside it.
2. **One state-version bump at a time.** Say in the issue that the job bumps it.
3. **Only the Max account merges.** The Pro account opens pull requests and
   posts reviews.
4. Every job merges main into its branch and re-runs all checks before
   opening its pull request. Small pull requests.
5. On the Max account two agents at once is fine if they are in different
   lanes. On the Pro account, one at a time.

## Running agents

- Brief: `docs/agents/AGENT-BRIEF.md`. Give each agent its task, its branch
  and worktree name, its model's attribution lines, and tell it to read the brief.
- **The SRD text is in the repo**: `reference/srd52/srd52-flow.txt` (reading
  order) and `reference/srd52/srd52.txt` (page layout). Nothing needs to be
  re-attached. The repo labels the content 5.2.1; the text is 5.2.
- Setup in a new workspace: clone to `/home/claude/hextable` (shallow is
  fine), then one worktree per job under `/home/claude/wt/<name>`:
  `git fetch --depth=80 origin main && git worktree add /home/claude/wt/<name> -b <branch> FETCH_HEAD`.
- Each agent: one worktree, a `PROGRESS.md` (not committed), commit often,
  never `pkill`, browser checks at 1280x800 and 390x844, no package installs.
- Open pull requests with `gh api repos/imburk/hextable/pulls`; merge with
  `gh api -X PUT repos/imburk/hextable/pulls/N/merge -f merge_method=merge`
  (merge commits, not squash, so stacked branches do not conflict).
- Push with `git -c push.negotiate=true push -u origin <branch>`.
- After merging two branches that touched the same file, run `node --check`
  on it: a union merge once left a doubled import in `app.js`.
- What worked in agent prompts: a hard scope limit, the list of files not to
  touch, "report, do not patch" for engine or leak suspicions found by a
  client job, a word limit on the final report, and "if budget runs short,
  stop at a green commit, push, and say where you stopped".

## Where things are written down

`docs/USAGE.md` (usage readings and what each job cost; the lead keeps it),
`docs/DEBT.md` (what is wrong or missing, by area), `docs/srd-audit.md`,
`docs/ROADMAP.md`, specs in `docs/specs`, the SRD in `reference/srd52`.
