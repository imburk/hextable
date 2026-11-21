# Hextable architecture evaluation

20 November 2026. Independent review of `imburk/hextable` at `main` = `531c432` (#609).
Read-only: nothing in the repository was changed.

How to read this: **[Verified]** means I read the code or ran something and saw it.
**[Judgement]** means it is my opinion as a reviewer. File references are `path:line` at that commit.

What I did not do: run the full `npm test` or the browser smokes, look at the Railway
configuration or the private ops repo, or play the game in a browser. The checkout is a shallow
clone (82 commits, 16 to 20 November), so all churn figures cover those five days only.

---

## Executive summary (for the owner)

**What is strong.** The centre of the game is sound and unusually well defended for a project this
young. One function changes the game (`apply`), the dice come from a key kept on the server, the
rules package touches no clock, network or random source (I searched and found none), and there are
about 2,500 rules tests, including tests that guard the architecture itself (no new import cycles,
no two actions with one name, every field a player can send is checked against hidden creatures).
Untrusted input (homebrew packs, zips, maps, socket messages) is handled with real care: size
limits, work ceilings, hostile-file tests, a strict page security policy. The "honest tier" idea
(auto / assist / manual, with the DM told what the engine did not do) is the right answer to a rule
set this large. Security and honesty are better than in most commercial products at this stage.

**The top five risks.**

1. **You can ship a broken game and not be told.** CI never builds or starts the real server
   image, the server throws away engine crashes without writing a log line, and nothing checks
   that the live site is the version that was merged. The days of failed deploys were this.
2. **Hidden information rests on one increasingly intricate file.** Each new feature (travel, shops,
   modules, homebrew monsters) adds hand-written special cases to it, and a party character's whole
   record is sent to players by default. This is where the next leak will come from.
3. **The code is growing faster than anyone can hold in their head.** The rules code grew 67 % in
   five days; the file every content job touches doubled. The debt log is 217 KB and is edited by
   72 % of all changes. The design documents agents are told to read first are out of date.
4. **"A refused action changes nothing" is kept by care, not by a mechanism.** There are about 850
   places where an action can be refused. A short random test found one that leaves a mark behind.
5. **The screens have no shared building blocks and no cheap tests.** The same small helper is
   copied into 19 files; the big screens are single 600-line functions tested only by slow, flaky
   browser runs. This is why armour and weapons look different, and it will slow every screen on
   the roadmap.

**The top five recommendations.**

1. Make deploys prove themselves: build and start the Docker image in CI, check the live version
   after every deploy, and log every engine crash. (Small.)
2. Make refusal mechanical: when an action is refused, put back the copy the engine already takes;
   add the "nothing changed" check to the stress tests. (Small.)
3. Build one "twin world" test harness for hidden information and move party records and settings
   to explicit allow-lists. (Medium.)
4. Give the client a foundation before more screens: one shared UI module, message numbers in the
   protocol, tests that run screens without a browser, cache headers, a pinned test browser. (Medium.)
5. Split the files and documents everyone collides in (debt log, `schema.js`, `reader.js`,
   `resolve.js`, `tables.js`) and add a test that keeps the guide documents true. (Medium.)

---

## The numbers this review rests on

| What | Figure | Source |
|---|---|---|
| Rules code without data and maps | 27,475 lines (16,420 on 15 Nov, +67 %) | `wc -l`; `docs/PATH-TO-0.2.md` section 3 |
| Content data and maps | about 51,000 lines | `wc -l` |
| Client (no vendor, no tests) | 15,780 lines in 49 files, 1.28 MB | `wc` |
| Server | 1,979 lines | `wc -l` |
| Action types | 95 | `ACTION_TYPES` |
| Places an action can be refused (`fail(`) in `engine.js` and `engine/` | 846 | `grep -c` |
| Rules tests | about 220 files, 55,082 lines, about 2,500 cases | `grep -c "^test("` |
| Server / client unit tests | 223 / 384 cases | same |
| Browser smokes | 10,297 lines, 38 CI jobs | `scripts/smoke`, `smoke.yml` |
| Docs | 2.48 MB; `DEBT.md` 217 KB; 29 specs, 15 marked "Draft by an agent, to be reviewed" | `wc -c`, `docs/specs/README.md` |
| Merged PRs in the last five days | 82 (about 16 a day) | `git log` |
| Files most often changed in those 82 | `DEBT.md` 59, `schema.js` 21, `reader.js` 20, `app.js` 14, `derive.js` 13, `resolve.js` 12, `view.js` 11, `history.js` 11 | `git log --name-only` |
| What the engine runs alone | spells 47 of 339 (14 %), monsters 64 of 329, class features 166 of 268 | `npm run content` |

Largest files: `content/schema.js` 3,461 lines (1,667 five days ago), `content/reader.js` 3,225,
`engine/resolve.js` 2,025, `client/app.js` 1,368, `engine/world.js` 1,330, `derive.js` 1,096,
`view.js` 901, `server/tables.js` 745. Line counts understate them: 20 to 30 % of lines in these
files are over 120 characters (`app.js`: 329 of 1,368; longest 947).

Largest single functions: `createTables` 648 lines (the whole table server is one closure),
`initBuild` about 600 (`client/buildsheet.js:245`), `initClasses` about 580, the `Editor` class about
1,070, the Three.js renderer closure about 800, `viewEvents` 375 (`view.js:528`), `derive` 353,
`lintGrants` 340 (`schema.js:1156`), the `feature` handler 294 (`engine/features.js:190`),
`castSpell` 246 (`engine/casting.js:451`).

---

## 1. Soundness of the core model

### What holds

- **Purity. [Verified]** No `Math.random`, `Date`, `performance` or `crypto` call anywhere in
  `packages/rules/src` (the one hit is a comment). Dice are ChaCha20 from a server-made key with a
  counter in the state (`rng.js`); a view without the key refuses to roll rather than roll fake dice.
- **Single mutator. [Verified]** The server calls the engine through one wrapper object
  (`server/src/tables.js:126-138`) and a test fails if it is called anywhere else. Even the server's
  own bookkeeping (`setPacks`, `worldIndex`, `release`) goes through `apply()`.
- **Crash safety. [Verified]** `apply()` takes a copy before every known action and puts the game
  back after any throw that is not a rule refusal (`engine.js:226`, `:258`, `:281`). In my fuzz run,
  859 malformed actions threw `TypeError` (for example `place` with no `to`, `dm.js:146`) and all
  859 left the state byte-identical.
- **Reactions.** An action that must ask a player is rolled back, stored, and run again from the
  start with the answers so far (`engine.js:246-257`, `react` at `:59`). This is a neat use of
  determinism: no half-finished action is ever saved.
- **Undo by reverse patches** (`history.js`), exact down to key order and dice counter, kept outside
  the game state and never sent to players.
- **Architecture tests.** Import cycles are pinned (`test/imports.test.js`), duplicate action names
  throw at load (`engine.js:81`), terrain edits outside a named list are caught
  (`apply-terrain.test.js`), every `a.<field>` a handler reads is walked for hidden ids
  (`hidden-ids.test.js:19-21`). These are the most valuable tests in the repository because they
  protect conventions that agents cannot see.

### Where it is violated or fragile

**1a. A refused action can change the game. [Verified, reproduced]**
`engine/casting.js:561` sets `encounter.flags["magic:<caster>"] = true`, and the next line (`:562`)
can refuse with "… is outside the battle." The refusal is returned and the flag stays. Reproduction:
`reports/architecture-eval-2026-11-20-scripts/repro.mjs` (a cleric casts Sacred Flame at a creature
added after the fight began). The effect in play is small (it can wrongly block a later cast after
Action Surge), but the server neither restores nor broadcasts after a refusal
(`tables.js:498`), so the server's state silently differs from what everyone was last sent.

Why it matters more than the one bug: the rule is kept by hand at 846 refusal sites. `apply()`
already holds a copy for every action (`net`, `engine.js:226`) and deliberately does not use it for
a plain refusal (`engine.js:258-259`). The stress tests count refusals but never compare the state
before and after. My fuzz (`fuzz.mjs`, 90,000 random actions, 83,049 refused) is shallow, only 5 %
of its actions succeed, and it still hit this twice. A deeper one will find more. **[Judgement]**

**1b. Homebrew works by temporarily editing global tables. [Verified]**
A table's packs are added into the shared `SPELLS`, `MONSTERS`, `CONTENT` objects for one
synchronous call and deleted afterwards (`content/registry.js:150-175`); the browser keeps one set
installed (`:183`). It is carefully guarded (snapshot and compare on exit, refuses promises,
refuses nesting), and `PATH-TO-0.2.md` explains the choice: 252 direct reads of content in 31 files
made it the cheapest route. But it means: content is ambient global state, not an argument; every
new server code path must remember to wrap itself (`assets-http.js` already does not, DEBT T44);
SRD entries are mutable while a pack is lent (DEBT T36); and nothing in the rules can ever become
asynchronous or run two tables in one tick. The same is true of `RUN`, `BEFORE` and the work meter
(`engine/shared.js:222`, `engine.js:206`). **[Judgement]** Fine today; it is a wall the AI DM,
worker threads or a hosted service will run into.

**1c. "Replayable" is true only in tests. [Verified]**
No action log is kept. The server saves the latest state and 30 undo patches. A bug seen at a real
table cannot be replayed from its file; the feedback button sends what the player saw, not what was
sent to the engine.

**1d. Malformed input is found by crashing. [Verified]**
Handlers read `a.to.q`, `a.center.q` and so on without a shape check; the copy-and-restore net
catches the `TypeError` and the server answers "The table couldn't make sense of that action". That
is safe. But the same net hides real engine bugs, because the server's `catch` has no error variable
and logs nothing (`tables.js:494-497`). A handler bug in production is indistinguishable from a
badly formed message, and is invisible to the operator.

**1e. "The engine never pretends" has known exceptions, honestly listed.** DEBT W38: an attack that
starts a fight under the SRD rule is not made "and nothing says so". DEBT W37: a push "up to" N feet
moves the full N. An action that hits the work ceiling without a copy is left half-applied with a
note (`engine.js:286-318`). These are recorded, which is the policy working; W38 is the one I would
fix first because it is silent.

---

## 2. Information hiding

### What holds

- The top level of a player's view is a true allow-list (`view.js:334-346`): `parked` places, the
  world, `pending`, `rng`, `seq`, packs and anything added later are not sent unless listed.
- A creature the party can only see is built field by field (`seenRecord`, `view.js:73`).
- Event types not named in `view.js` are dropped (`:524` and the `switch` with 67 cases).
- A guessed hidden id gets the same answer as a nonsense id, before any handler runs
  (`engine.js:134-148`).
- Side channels were thought about: per-connection sequence numbers so gaps tell nothing
  (`tables.js:245-249`), a hash of the filtered pack rather than the real one (`:313-317`), the
  "someone moves" turn slot.

### Where the approach is weaker than its description

**2a. Party records and settings are deny-lists. [Verified]**
`view.js:318` sends `structuredClone(e)` for every party creature and then deletes three fields
and runs `scrub`, which replaces any string or key *exactly equal* to a hidden creature's id
(`:296-305`). `settings` is cloned whole (`:338`). Events whose actor is the party's are cloned
whole in 16 places. So the file header's promise ("a field added to the game state later stays
private until someone lists it", `:8-9`) is true for the top level and for foes, and false for
the place most new fields go: a party character. A new field that holds a hidden creature's name in
a sentence, a number derived from it, or a position, is sent. `holdsShown` (`:67`) exists because
exactly this happened with grapples.

**2b. Views are computed from the present; events come from the past. [Verified]**
`viewEvents` classifies creatures against the state *now*, then corrects with stamps written at the
time (`unseen`, `hb`, `seen`, `party`; `engine.js:320-366`, `view.js:545-575`). Each correction was
added after a review found a case (DEBT W32, W34, W36, #313, #457). The mechanism is right; the
shape (one 375-line function with running flags like `casterOpen` and `lastTurnHidden`) is where a
future agent will make a mistake.

**2c. "The party sees as one" is no longer true. [Verified]**
Homebrew monsters introduced per-player differences (`forViewer`, `view.js:116-164`), bolted onto a
shared cached view (`tables.js:200-222`). Shops ("who sees a store and its unrevealed items"),
travel with a split party, private notes and modules all push the same way. **[Judgement]** The
view model should accept this now: a viewer is a person, not a party, and the shared view is an
optimisation, not the model.

**2d. The tests are good but hand-made per feature.** About twenty test files contain "twin" runs (the
same script with and without a hidden thing, compared). Each defines its own helper. There is no
single harness that takes any scenario and asserts that everything a player receives (view, events,
patches, error text, message count) is identical in both worlds.

**2e. Known open leaks, from the debt log:** creature ids share one counter, so gaps tell how many
hidden creatures exist (T11); a homebrew monster's name reaches players through `name` and `tpl`
(T45).

**[Judgement] Robustness as features grow:** the approach is correct in principle and will hold for
the top level. It will not hold by itself for party records, events and per-player differences;
each of travel, shops, modules and homebrew subclasses adds cases to one file that already changed
in 11 of the last 82 PRs.

---

## 3. Modularity and growth

**The engine split is good. [Verified]** Handlers by domain over layered helpers with no cycles,
one re-exporting entry point, and a test that keeps it so. `PATH-TO-0.2.md` already analysed this
well; I agree with its three proposals.

**The hot spots have moved since that analysis. [Verified]**

- `content/schema.js` doubled in five days (1,667 to 3,461 lines) and is changed by one PR in four,
  although `AGENTS.md` tells agents not to add to its lists. `reader.js` (3,225 lines, 20 of 82
  PRs) grows in step, because every vocabulary word needs a plain-language reading. Together they
  are 590 KB, more than any agent should load to make a small change.
- `resolve.js` grew 21 % to 2,025 lines and still holds eight topics.
- `engine/travel.js`, `market.js`, `worldpack.js` and `places.js` (about 1,770 lines) exist and
  are not in `CLAUDE.md`'s layout section.

**Content as data: true, with a caveat. [Verified + Judgement]** Spells and monsters are data over
20 step kinds, 24 hooks, 14 ops and 30 tags; no engine code tests a spell id while casting. That
layer is compositional and healthy. Class features are different: there are now 62 `GRANTS`
(58 five days ago), and `PATH-TO-0.2.md` notes 25 were added for one or two features each
(`overchannel`, `repel`, `relentless`, `markSpread`…). Those are named switches for code paths, not
a vocabulary. That is a reasonable way to finish twelve classes, but it means homebrew subclasses
can only recombine what SRD classes needed, and `lintGrants` (340 lines) is the result.

**The cost of one new mechanic. [Verified]** #495 added one key (`largest`): 13 files, 376 lines:
spec amendment, `schema.js`, `effects.js`, `reader.js`, five data files, a replay fixture, a new
test, the debt log. Seven monsters moved to auto. That is a fair price and a clean pattern. The cost
that does not show there is the fan-out for a mechanic with new events: add `view.js`, `ai.js`,
`dryrun.js`, `history.js` labels, the client log and the client panels.

**The biggest implicit contract is the shape of things. [Judgement]** There are 95 action types and
roughly 170 event-type literals, and no single place that says what fields each carries. The engine,
`view.js`, `history.js`, the AI, the client log, the renderer timeline and the smokes each know
event shapes by convention. The hidden-id test recovers the list of action fields by scanning the
source for `a.<name>`, which is clever and also a sign that the list does not exist. A declared
table of events (type, fields, who may see each field) would turn section 2a and 2b from review
findings into data, and is the one structural addition I would make to the rules package.

**Will it scale to the roadmap? [Judgement]** The engine core, yes. The roadmap's larger items
(travel, shops, modules, portable characters, outside dice, AI DM) are mostly new *state domains*
and new *viewers*, and those land in the three places that scale worst: `view.js`, the server
closure, and the client. TypeScript (deferred in `DESIGN.md` "until the rules engine grows past what
tests alone keep safe") is now due in its cheapest form: JSDoc typedefs for state, action and event,
checked by `tsc --checkJs --noEmit` in CI. No build step, no rewrite.

---

## 4. Client architecture

**What works. [Verified]** The renderer sits behind a 30-member interface (23 methods, 7 properties) with a null renderer and
a test that fails if `app.js` uses anything else (`client/renderer.js`). Both transports expose one
shape, so solo and online share the UI. Pure parts of screens are exported and unit tested (384
cases). Three.js and zip.js are loaded lazily.

**No shared UI layer. [Verified]** This is the root of what the owner saw.

- `esc` (HTML escaping) is defined in 19 client files in three variants; two of them
  (`formation.js:108`, `features.js:8`) do not escape the single quote.
- An element builder (`el` / `h`) is defined in 5 files with 3 signatures.
- Modules receive the same things under different names: `getState` in five, `state` in five,
  an opaque `ctx` in eight.
- There are about 80 `innerHTML` writes; lists are tables in one file, `<select>` in another,
  buttons in a third. No pick-row, accordion or hover module exists on `main` yet.

The page's security policy (`script-src 'self'`, `server/src/index.js:107`) blunts the escaping
risk on the table server. GitHub Pages sends no such header and `index.html` has no meta policy.

**State flow is module globals plus redraw. [Verified]** `app.js:66`: `let T, S, selId, mode…`;
89 functions; a 125-line `refresh()`. Screens are closures of 370 to 600 lines holding their own
`let` state (`buildsheet.js:245-257` has 17 mutable variables in its first twelve lines).
**[Judgement]** For a no-framework app this is workable up to about the present size. It is not
workable for the one-token menu and table UI specs (332 KB of spec between them) without first
extracting the shared pieces.

**The protocol has no message numbers. [Verified]** `t.send(action)` is fire and forget
(`transport.js:488`); a refusal comes back as `{t:"error", error:"text"}` with nothing saying which
action it answers. Consequences already in the code: the pack and world screens decide whether an
error is theirs by matching English words (`transport.js:378`, `:472`), the build sheet waits four
seconds for buttons to come back "because a refusal does not come back as an event"
(`buildsheet.js:255`), and an action sent while reconnecting is dropped with a toast.

**No-bundler costs that are now real. [Verified]**

- The client imports rules as `./shared/…`, a path that exists only in `dist/`. So client source
  cannot run in place: each of the 36 client test files copies the client and the whole rules tree
  into a temp folder first (`test/actionpanel.test.js:11-13`).
- A page load fetches about 155 module files: rules 3.85 MB (0.90 MB gzipped), client 1.28 MB
  (0.39 MB), Three.js about 0.46 MB gzipped. The table server sends **no** `ETag`, `Last-Modified`
  or `Cache-Control` for them (`server/src/index.js:233-236`), so a phone downloads about 1.7 MB on
  every visit, and there is no cache-busting or version check between an open tab and a new deploy.
- **[Judgement]** None of this needs a bundler. An import map (browser) plus a `package.json`
  `imports` alias (Node) fixes the first; validators and a build id fix the second.

**Solo saves can fail silently. [Verified]** The solo game is written whole to `localStorage` after
every action, and a failed write is swallowed (`transport.js:32`). `localStorage` holds about 5 MB.
Stock games are 27 to 87 KB today, so this is not biting, but travel keeps a map per parked place
and a DM may load a 1 MB map.

**Mobile. [Not verified in a browser]** The structure is there (touch paths, about 59 media and width rules in
the style sheets, phone smokes at 390x844). I could not judge the result.

---

## 5. Server

**Authority and limits are good. [Verified]** Every action goes through the scoped engine with the
sender's role; `claim`, `say`, `ping`, `setPacks`, `worldIndex` are fixed or refused server-side
(`tables.js:459-480`); frames are capped by role; per-address and per-connection limits; constant
time token compare; origin check on upgrade; the process survives a throwing handler
(`index.js:301-305`); saves are atomic (write then rename, `index.js:143`).

**Deployment is the weakest part of the project. [Verified]**

- `ci.yml` runs `npm test` and `npm run build`. It never runs `docker build`, never starts the
  server, never requests a page. `pages.yml` deploys the solo build on every push to `main` without
  the smokes.
- The fix for the failed deploys (#609) is a test that reads the `Dockerfile` as text and compares
  `COPY` lines with `cpSync` calls in `build.mjs` (`server/test/docker.test.js`). It covers the
  build stage only. The run-time stage copies `packages/rules/src`, `packages/server/src` and
  `dist`, nothing from `packages/client`. `client/modulezip.js` says in its header that the table
  server will import it by path, and the server's tests already do. The day `server/src` imports
  it, the image will start and crash, CI will be green, and this test will pass. **[Judgement]**
  This is the same failure, one step along.
- Nothing compares the live `/build.json` with `main` after a deploy.
- DEBT T15 says the Dockerfile was "checked by simulation only" and T3b says the proxy setting on
  Railway "is not verified against the live service". If `TRUST_PROXY` is not right there, every
  player shares one address and with it the limit of 20 connections and 5 new tables an hour
  (`limits.js`). I could not check the live service.

**Persistence and scale. [Verified]** One process; every saved table is read synchronously at start
and held in memory for good (`index.js:122-130`); `MAX_TABLES = 500` counts only tables active in
the last 30 days and nothing ever removes an idle one (`tables.js:64-68`, `:151`). Each changed
table is rewritten whole with `writeFileSync` one second after a change. No backup of the volume is
mentioned anywhere. **[Judgement]** All fine for tens of tables; `DESIGN.md` already says a database
comes later. Eviction and backup should not wait for that.

**Per-action cost. [Measured, `perf.mjs`, this two-core machine]** The server copies the whole
state before every action (`mark`, `history.js:30`: 0.3 to 1.7 ms on stock maps) on top of the
engine's own copy; DEBT T55 already calls it redundant. An ordinary action costs 0.1 to 2.3 ms. A
*refused* move costs 11 to 37 ms because the route search runs before the cheap checks. One
connection may send 5 messages a second and one address may hold 20 connections, so one address can
occupy the single thread. Low likelihood; worth a per-table time budget one day.

**Observability. [Verified]** `console.error` to the container log is all there is. Engine
exceptions on the main action path are not logged at all (1d). There are no counters (tables,
connections, refusals, crashes, action time).

**Smaller items. [Verified]** The 103-line WebSocket implementation sends no pings and has no idle
timeout (DEBT T9). There is no time limit on a waiting reaction question (DEBT T8).

---

## 6. Testing and CI

**Strengths. [Verified]** Twice as many test lines as engine lines; seeded stress loops (2,400
rounds per grid in CI); replay fixtures; golden files for the reader; hostile-input suites for
packs, zips and uploads; architecture tests (section 1). Every smoke pass is a CI job and a test
keeps the list complete.

**Gaps, in order of value per effort. [Judgement unless marked]**

1. **Nothing tests the thing that is deployed** (section 5). Highest value, smallest effort.
2. **No generic invariants in the stress loops.** They assert "no stall, nothing refused". Adding
   "a refused action leaves the JSON identical" and "the state survives save, load and migrate" to
   the existing loops costs a few lines and would have caught 1a.
3. **No generic hidden-information harness** (2d).
4. **Screens have no test between pure functions and a real browser. [Verified]** No client unit
   test touches a DOM. All wiring is tested by Playwright on software WebGL.
5. **Smoke flakiness has structural causes. [Verified]** `npm i -g playwright` installs whatever is
   newest on each run (`smoke.yml:41`), so the browser changes under the tests. Many steps tap a
   screen point and assume the 3D picker finds the creature (DEBT T30). There are 168 fixed sleeps
   beside about 1,200 condition waits. Only two passes use `?renderer=none`. Seven of the last 82
   commits were about the smokes, most of them repairs.
6. **Replay fixtures are brittle by design.** Any change in the order dice are rolled rewrites
   them (#495 touched `c7-ai-replay.json`). They are valuable, but an agent can "fix" one by
   regenerating it. A reviewer checklist line ("a changed fixture is explained in the PR") is
   enough.
7. `npm test` is one command for everything; on a two-core machine agents cannot run it freely.
   A fast subset (`npm run test:fast`, no stress, no reader goldens) would shorten every loop.

---

## 7. Fit for development by AI agents

**What makes agents succeed here. [Judgement, from the evidence above]**

- Hard rules stated once, briefly, in `CLAUDE.md` and `AGENTS.md`, and enforced by tests rather
  than by trust. The source-scanning tests are the best idea in the repository.
- Issues that name the files they may touch; one PR per issue; "what was not checked" in the PR
  template; independent review rounds (67 "review of #n" notes in the code show reviews finding
  real things).
- A domain split that lets several agents work at once in `engine/`.
- Plain-language refusals and comments. The code explains *why* at almost every branch.

**What makes agents fail here.**

- **Shared single files. [Verified]** `DEBT.md` is touched by 72 % of PRs; it is 217 KB with table
  rows of one to two thousand characters holding struck-through history. No agent can read it
  cheaply, and concurrent PRs must conflict in it. `schema.js` and `reader.js` are the same problem
  in code. `AGENTS.md` protects `engine.js` and `tables.js`; the real collision points today are
  not those two.
- **Stale guides. [Verified]** `DESIGN.md` still says "Content so far: 6 spells, 3 monsters" and
  "Not yet: line of sight". `ROADMAP.md` says the homebrew jobs B1, B3, B5 to B7 "are not built"
  and that nothing outside the rules package uses the registry; both are untrue (`tables.js:22`,
  DEBT T31, T53). The specs index says hiding and finding are not built. `CLAUDE.md` omits
  `engine/travel.js`. Agents are told to read these first.
- **Specs too large to be a contract. [Verified sizes]** Six specs exceed 100 KB; `table-ui.md`
  and `companions.md` are over 200 KB each. Fifteen are "Draft by an agent, to be reviewed by the
  design owner" while several of them are already built (companions C1 to C8, travel W1 to W3,
  homebrew). **[Judgement]** In practice agents write the spec, build it and review it, and the
  owner's review is the step that is skipped. That is a governance risk more than a technical one:
  decisions accumulate that no person has agreed to. A one-page "decisions the owner has confirmed"
  list per spec would restore the line.
- **Dense style. [Verified]** One-letter names for the most important things (`S`, `T`, `R`, `a`,
  `s`, `e`, `ev`), lines to 947 characters, 300-line functions. Agents cope with this better than
  people, but string-replace edits on very long lines fail more often and diffs are hard to review.
- **Comments as history. [Verified]** 267 issue numbers and 111 debt ids in code comments. Useful
  as an audit trail; costly as context, and wrong as soon as the debt row is struck.
- **Implicit contracts** (section 3): event and action shapes, the `ctx` passed to client modules,
  error sentences matched by regular expressions.

**Pace. [Verified + Judgement]** Sixteen merged PRs a day with no person reading code means the
tests and the reviewing agents are the only quality gate. The gate is good where it is mechanical
and thin where it is prose. Each recommendation below tries to move one more rule from prose to a
test.

---

## 8. Security posture for untrusted input

**Overall: strong for the stage. [Verified]**

| Input | What protects it | Residual risk |
|---|---|---|
| WebSocket messages | Frame caps by role (`index.js:84-85`), token bucket, masked-frame check, action size caps, type must be a string in a `Map` so `__proto__` and `toString` cannot be actions (`engine.js:78-91`, `:152`), creature fields must be strings (`:142`) | Hand-written protocol code with no fuzz test; no idle timeout; CPU cost of refused moves (section 5) |
| Homebrew packs | Size, entry, depth, step and string limits (`schema.js:2607`), forbidden keys, invisible-character and name rules, no functions, strict lint, id prefix `hb-`, work ceilings per action (`effects.js:253`), per-table pack rate limit, player copies filtered and separately hashed | Lent by editing global tables (1b); a large pack blocks the event loop 0.2 to 0.5 s (DEBT T49); the name of a homebrew monster leaks (T45) |
| Module zips | Our own pre-scan of the zip directory before the library loads, ratio, count, size and time limits, 16 KB chunks to bound a bomb, workers off (`client/modulezip.js`) | Server-side import is not wired yet; when it is, see the Docker note in section 5 |
| Map files, world packs | Lint and migrate on a copy (`dm.js:244`), 1 MB and 4 MB caps, DM only, trial run on a copy before any file is stored (`tables.js:631`) | Synchronous lint of up to 4 MB on the one thread |
| Uploaded pictures | Type, size, pace and concurrency limits; `nosniff`; session token in a header, never a URL | Files of idle tables are never expired (T9) |
| Saved files on disk | Undo history is shape-checked before use (`history.js:93`); packs re-vetted at load; a bad table file is skipped, not fatal | No backups |
| Browser | `script-src 'self'`, no inline script, frame and form restrictions | Not on GitHub Pages; inconsistent escaping (section 4) |

**Identity. [Verified]** There are no accounts. A seat is a bearer token in `localStorage`; a table
is a six-character code plus DM approval; anyone may host. This matches the design ("login or DM
approval") and is acceptable for private tables. It is the thing to revisit before the planned
public service.

**[Judgement]** The security work is ahead of the operational work. An attacker is less likely to
hurt a table than a silent failed deploy, a full disk or a lost volume is.

---

## Prioritised recommendations

Effort: **S** one or two small PRs; **M** several PRs; **L** a milestone.

| # | What | Why | Effort | If it is not done |
|---|---|---|---|---|
| 1 | **CI builds and runs the image.** A job that runs `docker build`, starts the container, gets `/api/ping`, `/build.json` and `/`, opens `/ws`, hosts a table and sends one action. After a merge, a scheduled check that the live `/build.json` commit equals `main`, opening an issue if not. | Section 5. The only test of the deployed artefact today is a text comparison. | S | Silent failed or broken deploys again; next likely trigger is the server importing `modulezip.js`. |
| 2 | **Log engine crashes.** In `tables.js:494`, `:593`, `:643` log the action type, role and stack; keep a counter; show the count on a small `/api/health`. | 1d. Bugs are invisible. | S | Real engine bugs reach players as "couldn't make sense of that action" and are never seen. |
| 3 | **Restore on every refusal.** In `apply()`, use the existing copy when a `RuleError` is thrown; fix `casting.js:561`. Add "a refused action leaves the JSON identical" to the three stress kits and a 60-second action fuzz to CI. Then drop the server's second copy (`mark`) for the throw path (T55). | 1a. Turns a hand-kept rule at 846 sites into a mechanism. | S | Rare, unreproducible state drift between server and clients; grows with each handler. |
| 4 | **One hidden-information harness.** `twin(scenario, hiddenThing)` that runs any script in two worlds through the *server* and asserts identical bytes to every player (views, events, patches, errors, message counts). Port the hand-made twins; require one for every new feature that adds state. | 2d. Makes "no leak" a property test instead of twenty styles of example. | M | Leaks arrive with travel, shops and modules and are found by players. |
| 5 | **Allow-lists for party records and settings.** Replace `structuredClone(e)` at `view.js:318` and `:338` with field lists, plus a test that fails when a creature or setting gains a field that no list classifies. | 2a. Makes the file's own header true. | M | A new field on a character carries hidden facts to players by default. |
| 6 | **A shared client UI module, enforced.** `ui.js` with `esc`, `el`, pick-row, accordion, hover, list-table; one `ctx` shape for every `initX`; a source test that forbids a local `esc` or `el`. Convert `buildsheet.js` and `classes.js` first. | Section 4. The owner's armour/weapons finding, at its root. | M | Every new screen invents its own controls; inconsistency and escaping bugs multiply. |
| 7 | **Message numbers and error codes in the protocol.** The client sends `id`; every answer and refusal carries `re: id` and a short `code`. Queue actions while reconnecting. | Section 4. Removes word-matching and the four-second timer; needed for any "pending" UI. | S–M | Wrong screen shows the wrong error; taps lost on a bad phone connection. |
| 8 | **Serve the game cacheably and versioned.** `ETag` (hash) and `Cache-Control: no-cache` on static files; the page compares its build id with the server's on reconnect and offers a reload. | Section 4. 1.7 MB per visit on a phone; old tab against new server. | S | Slow starts on mobile data; odd bugs after each deploy. |
| 9 | **Split what everyone edits.** `DEBT.md` into one file per area with one short line per open item (history stays in git); `schema.js` into the vocabulary plus one lint module per kind; `reader.js` likewise; summons out of `resolve.js`; `tables.js` into seats, actions, packs, world. Update the `AGENTS.md` "do not edit" list to the real hot files. | Sections 3 and 7. 72 % of PRs touch one 217 KB file. | M | Merge conflicts and context cost rise with every parallel agent. |
| 10 | **A test that keeps the guides true.** Check that every module in `engine/` is named in `CLAUDE.md`, that counts quoted in `ROADMAP.md` and `DESIGN.md` match `npm run content`, that each spec's status line names its built stages. Rewrite the stale parts of `DESIGN.md` and `ROADMAP.md` once. | Section 7. Agents are told to read documents that are wrong. | S | Agents plan from false premises ("B1 is not built"). |
| 11 | **Declare events and actions.** One table: type, fields, and for events who may see each field. Generate `view.js`'s lists, the history labels check and the client's log check from it. Add JSDoc types and `tsc --checkJs --noEmit` for the rules package in CI. | Section 3. The largest implicit contract in the system. | M–L | Each new event is wired by memory in six places; the view file keeps growing by hand. |
| 12 | **Stabilise the smokes.** Pin Playwright; add a semantic tap (`window.hextable.tap(id)`) for logic passes and run them with `?renderer=none`; keep a few true-GL passes; replace fixed sleeps. Add DOM-level unit tests for screens once #6 exists. | Section 6. | M | Flaky checks get ignored, then a real failure is ignored. |
| 13 | **Keep an action journal.** Append each accepted action with role, user and dice counter to a per-table file, rotated. A script replays a table from a saved state. | 1c. Makes "replayable" true in production; turns feedback reports into reproductions. | S–M | Bugs from real tables cannot be reproduced. |
| 14 | **Operate the data.** Evict idle tables from memory (load on resume); archive after N days; nightly backup of the volume; confirm `TRUST_PROXY` on Railway against the live service. | Section 5. | S | Slow starts and memory growth; one lost volume loses every table; everyone may share one rate limit. |
| 15 | **Run client source in place.** Import the rules as `#rules/…` (Node `imports`) with an import map in `index.html`; drop the temp-folder copy from 36 test files. | Section 4. | S–M | Slow client tests; tools cannot follow imports. |
| 16 | **Content as an argument, later.** When the AI DM or a worker needs it: pass a content handle through `ctx` instead of lending global tables. Until then, freeze SRD entries in tests (T36) and add a test that every server entry point is wrapped. | 1b. | L (S for the interim) | A hard wall when anything must be asynchronous. |
| 17 | **Handle a full browser store.** Tell the solo player when a save fails; move the solo state to IndexedDB beside the world pack. | Section 4. | S | Silent loss of a solo game once maps and parked places grow. |
| 18 | **Owner-confirmed decisions.** At the top of each spec, a short list of the decisions the owner has agreed, dated. Anything else is a proposal, whatever has been built. | Section 7. | S | The design drifts to whatever agents wrote down. |

**Suggested order.** 1, 2, 3 and 8 this week (all small, all reduce the chance of an invisible
failure). Then 4 and 5 before travel W4 sends places to players. Then 6, 7 and 9 before the table
UI and one-token-menu work starts in earnest. 11 when the next large domain (shops) is specified.

---

## Evidence files

- `reports/architecture-eval-2026-11-20-scripts/repro.mjs`: the refused cast that changes the game.
- `…/fuzz.mjs <seed> <count>`: random actions; reports refused-but-changed and thrown.
- `…/perf.mjs`: per-action costs on the stock maps.

Run with `/home/claude/bin/q test node <file>`. They import the checkout by absolute path and write
nothing.
