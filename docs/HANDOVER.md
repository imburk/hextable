# Hand-over note (13 November 2026)

For a fresh Claude conversation taking over Hextable, on either of the owner's
accounts. Read this, `CLAUDE.md`, `AGENTS.md`, `docs/agents/AGENT-BRIEF.md` and
`docs/DEBT.md`; you do not need any earlier conversation.

## The owner and how he works

- Isaac (GitHub `imburk`). "Please just run": end goal over minutiae; Claude
  owns design decisions and reports them briefly.
- **Two Claude accounts work on this repo.** They cannot see each other's
  chats or memory. Everything shared goes through GitHub (see "Two accounts").
  - **Ultra account (was "Max"): lead and builder.** Runs engine jobs and screens, and is
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

## State of main (13 November, 4:50 AM Eastern)

- 669 tests pass; content check clean; build clean. Last merged: #152. **State version 16.**
- The lead conversation ("Beej") is on the owner's **Ultra** account, which replaces "Max" below:
  it leads, builds and merges. Parallel work is allowed: one engine job at a time, with client,
  render, content, server and read-only jobs beside it. The lead checks agents hourly.
- Deploys on merge to main: GitHub Pages (solo), Railway (multiplayer).

Merged on the night of 13 November (costs in `docs/USAGE.md`):

| PR | What |
|---|---|
| #133 | Tests read the state version from `VERSION`; linter flags a save step on a self-aimed spell |
| #137 | Reactions control on the sheet (Shield usable) |
| #139 | Rooms look is the default; `?hex` gives the old look |
| #144 | Reactions part 2: prompts mid-action, Counterspell, Hellish Rebuke, monster Parry (state 15) |
| #145 | `importFgxml`: Fantasy Grounds character XML to a sheet, with a report of what did not map |
| #147 | Five stock maps, started from the editor's Map file tool |
| #148 | Upload limits, disk cap, partial-file cleanup; #7 closed |
| #149 | Renderer R2: floors module, clip and fill to walls |
| #151 | Security fixes from the #132 review: hidden ids, empty updates, keyed dice (state 16) |
| #152 | Reaction prompt screen; Fantasy Grounds import button |

Running when this was written: #150 (cut-away walls, caves), #153 (R3 timeline and pace),
#154 (three small engine items, then class features 7 to 15 for Paladin, Cleric, Druid, Sorcerer, Bard).

## Owner's goals, set 13 November

- **Play a session with his own party**: a Paladin 13, a Paladin 6 / Bard 8, a Druid 14, a Sorcerer 15
  and a Cleric 14, kept as Fantasy Grounds XML (2014 rules, much non-SRD content). The files are
  private: never commit them or the players' names. The report on #142 ranks what they need.
- **He will bring an adventure** to turn into a session. Published adventure text and non-SRD
  creatures stay out of the repo: the session is a private file loaded into a table.
- **Three.js is decided** (renderer spec, Decision 8). Order: R3, R4, R5, then vendor a pinned
  release (GitHub is reachable from the workspace: `git ls-remote https://github.com/mrdoob/three.js`
  works, so the lead can vendor it), R11 parity, R12 models (owner verifies each pack's licence), R14.

## Next work, in order

Engine lane (Opus), one at a time: #154, then multiclassing, then feats and magic item bonuses
with attunement, then levels 7+ for the other seven classes, then what is left of the review
(DEBT T11: ids that reveal how many creatures are hidden, kick, upload by anyone who hosts).
Render lane (Sonnet): #150, #153, then R4 (animations on beats), R5 (the interface), R10 (vendor
Three.js and measure), R11.
Content and client (Sonnet or Haiku): spells the party prepares that are below `auto`
(Dispel Magic, Counterspell, Misty Step, Revivify, Moonbeam, Fire Storm); a lobby choice for stock
maps; a notes field so an import report stays with its character; players importing their own sheet.
Second opinion: a Gemini read of what the #132 review did not cover (sight internals, zone and
effect events, monster AI, the UVTT importer, a live server).

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

- Decided 13 Nov: the rooms look is the default (`?hex` gives the old look), and the
  renderer moves to Three.js (`docs/specs/renderer.md`, Decision 8); the lead sets the timeline.
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
