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

## State of main (13 November, 10:00 AM Eastern)

- 822 tests pass; content check clean; build clean. Last merged: #183. **State version 18.**
- The lead conversation ("Beej") is on the owner's **Ultra** account, which replaces "Max" below:
  it leads, builds and merges. Parallel work is allowed: one engine job at a time, with client,
  render, content, server and read-only jobs beside it. The lead checks agents hourly.
- **The workspace has two CPU cores.** At most two agents doing browser checks at once; agents run
  named smoke passes (`SMOKE_ONLY=base` is solo and multiplayer; `SMOKE_ONLY=solo` runs nothing),
  never the full run; the lead does not run smoke while they do.
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
| #156 | Cut-away walls drawn; walls that bend inside a hex cut the floor; caves (R7) |
| #157 | Reaction waiting notice only when the trigger can be perceived; `loadMap` uses all starts; `pace` table setting |
| #160 | Renderer R3: the event timeline and pace |
| #161 | Party spells: one raised; the table of missing vocabulary is in `docs/DEBT.md` |
| #164 | Class features 7 to 15 for Paladin, Cleric, Druid, Sorcerer, Bard (state 17); reviewed in #166, fixed in #179 |
| #168 | DM pace control; stock maps in the lobby and DM panel; import report to the DM's chronicle |
| #171 | Renderer R4: animations on beats |
| #174 | Spell vocabulary: teleport, cure, kill riders, terrain and fog, ending on damage; 45 spells auto |
| #176 | Renderer R5: the interface, the empty renderer, the governor; `SMOKE_ONLY=base` |
| #178 | Class feature controls: Divine Spark, Wild Shape, Metamagic, Font of Magic and others |
| #179 | Fixes from the #166 review |
| #180 | Three.js r187 vendored (`packages/client/vendor`), gzip in the server; 458 KB gzipped, not loaded by default |
| #182 | Multiclassing (state 18); the importer builds multiclass sheets |
| #183 | Spec: `docs/specs/table-ui.md` (drawer, action panel, defeat, rewards, log by combat) |

Running when this was written: the drawer with Settings, About and the tracker (T1, T2 of the
table UI spec; closes #173), and the engine side of that spec (the Sorcerer file that fails to
import since #164, then defeat and rewind, fight records, spell kinds, then rewards: state 19).

Lessons from the night: after merging main into a branch, grep for conflict markers before
committing (the lead once committed them in `docs/DEBT.md`, fixed in #158). Smoke steps that depend
on timing or on where the party stands fail under load or after placement changes: reproduce in
Node before blaming the game. A workspace restart stops agents; they resume by themselves, but
unpushed work stays local, so check `git ls-remote` against the worktree.

## Owner's goals

- **Play a session with his own party**: a Paladin 13, a Paladin 6 / Bard 8, a Druid 14, a Sorcerer 15
  and a Cleric 14, kept as Fantasy Grounds XML (2014 rules, much non-SRD content). The files are
  private: never commit them or the players' names. The report on #142 ranks what they need.
- **He played on 13 November and his party was wiped with no conclusion.** His six notes are issue
  #181 and the spec `docs/specs/table-ui.md`; the spec's open questions proceed on its defaults
  unless he says otherwise (monsters do not finish off the dying; new dice after a rewind; XP split
  equally among survivors who took part; only the DM leads the party; one Search; the drawer does
  not open itself; items that do things later).
- **He will bring an adventure** to turn into a session. Published adventure text and non-SRD
  creatures stay out of the repo: the session is a private file loaded into a table.
- **Three.js is decided** and vendored (R10 done). Next R11 (the Three.js renderer at parity behind
  the R5 interface), R12 models (owner verifies each pack's licence), R14. A minified build would
  cut the download; it needs a machine with npm.

## Next work, in order

Engine lane (Opus), one at a time: the table UI engine items (running), then feats and magic item
bonuses with attunement, then levels 7+ for the other seven classes, then DEBT T11 and C11, C12.
Client lane (Sonnet): T1 and T2 (running), then T3 (action panel shell), T4a, T4b, T5c (defeat),
T6c (rewards), T7c (log by combat), as the spec's task table orders them; then teleport aiming,
terrain drawing and remains (from #174) and multiclass level-up and import summary (from #182).
Render lane (Sonnet): R11, the Three.js renderer at parity.
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
