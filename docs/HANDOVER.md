# Hand-over note (13 November 2026, afternoon)

For a fresh Claude conversation taking over Hextable. Read this, `CLAUDE.md`, `AGENTS.md`,
`docs/agents/AGENT-BRIEF.md` and `docs/DEBT.md`; you do not need any earlier conversation.
What happened in the last working session is in `docs/sessions/2026-11-13.md`.

## You are Beej, the lead

- The owner is Isaac (GitHub `imburk`). He addresses the lead as **Beej**. "Please just run": end
  goal over minutiae; you own design decisions and report them briefly.
- This is his **Ultra** account: the lead plans, hands building to agents, checks and merges.
  A **Pro** account (tight budget) can take reviews and small jobs through GitHub issues; a
  **Gemini** account is available for a second opinion, also by issue. Accounts cannot see each
  other's chats: GitHub is the only channel.
- **Set up the hourly check yourself, first thing**: a scheduled message back into your own
  conversation every 60 minutes while work is in flight (the previous conversation's check does
  not carry over). Each check: running agents, open pull requests, stalled worktrees, merge what
  is green, start what is next, renew the check.
- Keep your own turns short. Haiku for data entry, Sonnet for screens, reviews and routine work,
  Opus for engine or leak-sensitive work. You cannot see usage; he pastes the usage page when it
  matters, and `docs/USAGE.md` records what jobs cost.
- **Start a fresh lead conversation each working session, or after about 15 to 20 merges.** A long
  conversation re-reads itself on every turn; everything needed is in the repo. End each session
  by updating this note, `docs/USAGE.md` and a record under `docs/sessions/`.
- **Questions that need the owner's answer go in issue #193** ("Owner decisions"), each with the
  default you are proceeding on. Strike a line when he answers.
- The repo is **public**. Never commit his character files, his players' names, published
  adventure text, or non-SRD content.

## How work runs

- Work is one GitHub issue per job, listing the files it may touch; one branch, one worktree
  (`/home/claude/wt/<name>`), one pull request. Agents do not merge. **The lead merges** after
  merging main into the branch, re-running `npm test`, the content check and the build, reading
  the file list, and running the smoke pass that covers the change.
- **Lanes.** One engine job at a time (`packages/rules/src`, `packages/server/src/tables.js`).
  Beside it: client, render, content, server and read-only jobs, as long as their files differ.
- **The workspace has two CPU cores.** At most two agents doing browser checks at once. Agents
  run named smoke passes only (`SMOKE_ONLY=<name>`, one at a time, in the foreground, 7-minute
  timeout), never the full run; the lead does not run smoke while they do. `SMOKE_ONLY=base` is
  solo and multiplayer. An unknown name exits 1 and lists the valid names (the registry is at the top of `scripts/smoke.mjs`). Three workspace
  restarts on 13 November came from ignoring this.
- After a restart, agents usually resume by themselves; if one stays silent, send a message to
  its id. Tell agents to push after each commit: unpushed work survives only on this machine.
- After merging main into a branch: `grep -rn '^<<<<<<<' docs packages scripts`, and
  `for f in scripts/smoke.mjs scripts/smoke/*.mjs; do node --check $f; done`. Each smoke pass is its own
  file under `scripts/smoke/`, so conflicts are rare; when `scripts/smoke.mjs` (the registry) or
  `scripts/smoke/lib.mjs` conflicts, both sides added a line or a helper: keep both whole. Then `git add -A` and commit.
- A smoke step that fails under load is re-run alone once; if a rule seems broken, reproduce it
  in Node through `apply()` before blaming the game. Several "failures" on 13 November were the
  test (timing, or where the party stands), not the game.
- What worked in agent prompts: a hard scope with the files not to touch, "report, do not patch"
  outside the lane, a "For the client job" section from engine jobs, a word limit on the final
  report, "push after each commit", and "if budget runs short, stop at a green commit".
- Merge with `gh api -X PUT repos/imburk/hextable/pulls/N/merge -f merge_method=merge`; push with
  `git -c push.negotiate=true push -u origin <branch>`; `gh pr create` does not work.

## State of main

- **905 tests pass**; content check and build clean. **State version 20.** Last merged: #194.
- Deploys on merge: GitHub Pages (solo) https://imburk.github.io/hextable/ and Railway
  (multiplayer) https://hextable-production.up.railway.app/ .
- Content: 339 spells (45 auto), 329 monsters, twelve classes, 17 feats, 75 magic items, five
  stock maps. `npm run content` prints the tiers.
- Built on 13 November (detail in the session record): security fixes from an independent
  review; reactions with a prompt; class features 7 to 15 for Paladin, Cleric, Druid, Sorcerer
  and Bard, reviewed and fixed; multiclassing; spell vocabulary (teleport, cure, kill riders,
  terrain and fog); feats; magic items with attunement; the Fantasy Grounds character importer;
  stock maps; rooms look, floors module, cut-away, caves, the event timeline with pace,
  animations, the renderer interface, Three.js vendored and a Three.js renderer at parity
  (`?renderer=three`); the right-side drawer with Settings, About and the tracker; defeat,
  rewind and rewards in the engine, with the defeat card and the rewards form and card (#194).

## Next work, in order

**Refactors first (agreed with the owner on 13 November; none changes behaviour):**
1. ~~**Split `scripts/smoke.mjs` (2,500 lines) into one file per pass with a runner** (Sonnet).
   Every client job appends to it; it caused most merge conflicts.~~ Done (#196): one file per
   pass under `scripts/smoke/`, shared helpers in `lib.mjs`, a registry in `scripts/smoke.mjs`.
2. **Split `packages/rules/src/engine.js` (3,200 lines, 50 handlers) by domain** behind the same
   `apply()`: movement, attacks, casting, features, rests and rewards, map and DM tools (Opus,
   alone in the engine lane, no feature work beside it; the tests are the safety net). Do this
   **before any further engine feature**: it lets two engine jobs run side by side and cuts what
   each agent must read.
3. **GitHub Actions** for tests and smoke on every pull request, if the owner says yes (#193).
4. **Renderer cleanup (R14)** after the owner chooses between the two renderers (#193).

**Then features:**
- Client (Sonnet), `docs/specs/table-ui.md`: T3 (action panel shell), T4a, T4b, T7c (log by
  combat). T1, T2, T5c and T6c are done; the wording of the defeat card is quoted in #194 for
  the owner to change (#193).
  Then the controls the engine jobs listed under "For the client job": feat choice at build and
  level-up, equip and attune and the item list (#191, #192), multiclass level-up and import
  summary (#182), teleport aiming, terrain drawing, remains (#174).
- Engine (Opus), after the split: levels 7+ for the other seven classes; E17 (items passed,
  dropped, picked up) and E18 (potions, scrolls, charges) of the table UI spec; DEBT T11, C11
  to C14.
- Content: effect steps for the 211 spells the DM applies by hand.
- Render: R12 models once the owner has confirmed pack licences.
- Second opinion: a Gemini read of what the security review did not cover (sight internals,
  zone and effect events, monster AI, the UVTT importer, a live server).

## The owner's goals

- **Play a session with his own party**: a Paladin 13, a Paladin 6 / Bard 8, a Druid 14, a
  Sorcerer 15 and a Cleric 14, kept as Fantasy Grounds XML (2014 rules, much non-SRD content:
  their subclasses and feats import as SRD stand-ins or notes). All five import.
- **He played on 13 November and his party was wiped with no conclusion.** His six notes are
  issue #181 and the spec `docs/specs/table-ui.md`.
- **He will bring an adventure** to build a session from. Suggested order of prompts: outline
  the adventure without building; choose or build maps; list encounters with SRD stand-ins for
  his approval; import the party and show the gaps; assemble a private session file; play the
  first encounter as DM and players and report what broke.

## Known gaps

`docs/DEBT.md` is the list. The ones that matter for play today: most engine features added on
13 November have partial or no screens yet (rewards, feats, items); potions and charges cannot
be used; 211 spells are applied by hand; nothing has been tried on a real phone or with a real
group; the Three.js renderer has no models or real shadows.

## Open pull requests and running work

None. Nothing is running and no pull request is open. Worktrees under `/home/claude/wt` from the
last session are stale and can be removed; a new workspace starts from a fresh clone.

## Where things are written down

`docs/sessions/` (what happened, by day), `docs/USAGE.md` (what jobs cost), `docs/DEBT.md`
(what is wrong or missing), issue #193 (questions for the owner), `docs/specs` (agreed designs:
`renderer.md`, `table-ui.md`, `rules-expansion.md`, `hidden-information.md`,
`maps-and-objects.md`), `docs/import-characters.md`, `docs/maps.md`, `docs/srd-audit.md`,
`docs/ROADMAP.md`, the SRD text in `reference/srd52`.
