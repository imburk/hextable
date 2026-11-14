# The Hextable official service: founding spec

Status: draft, written 14 November 2026 for issue #254 of `imburk/hextable`. To be copied into
the new project's own repository when the owner creates it. Nothing here is built.

**Summary**

1. Hextable is a 5E-compatible virtual tabletop that plays fully without any account. This
   project is the one **official server** built into it: monikers, official character records,
   official adventures, a lobby, reputation, anonymous play statistics and, last, AI stand-ins.
2. It is the only thing that can make play **official**. It is never needed to make characters,
   host games or play them; when it is down, play goes on and only official features wait.
3. Section 3 lists the owner's decisions (13 and 14 November 2026), apart from the Hextable lead's
   proposals and from this document's own recommendations. Gaps are questions (section 12).
4. Phases: 0 identity and keys; 1 anonymous statistics; 2 character records; 3 official
   adventures; 4 the lobby; 5 reputation and reliability; 6 AI stand-ins (last on purpose).
5. Recommended build: one small Node service with SQLite, no dependencies, on the host Hextable
   already uses, in its own process, its own repository and with its own data volume.
6. Trust rests on an offline root key held by the owner and on the project's own table server.
   A signature shows where and when something was recorded, never that play was fair.
7. The service keeps hashes of histories, not characters, and as little about people as it can.
   Reputation and reliability are personal data: players can see, contest and delete theirs.
8. Licence recommended: AGPL-3.0-or-later with Hextable's contributor agreement.
9. It is run like Hextable: its own repository, its own lead conversation, one decisions issue.
10. The contract with the game is `INTERFACE.md`; how the two leads talk is `WORKING-TOGETHER.md`.

How to read this document. Three kinds of statement are kept apart everywhere:

- **Owner** — what Isaac, the owner, decided, quoted or closely paraphrased, with the date.
  Do not weaken or extend these. Change them only on his word.
- **Lead's note** — a proposal or reading by the Hextable lead, recorded beside his decisions
  and not confirmed by him unless marked so.
- **Recommendation** — this document's own proposal, with a reason and an alternative. The new
  lead may overturn any of these, saying why.

Where the owner's decisions leave a gap, this document does not fill it silently: it is a
question in section 12, with the default work proceeds on.

## 1. What Hextable is, for a lead who has never seen it

Hextable (`imburk/hextable`, public, AGPL-3.0-or-later) is a browser game: free roaming in 3D
until a fight, then a locked grid (hexes or squares) and turns, with the SRD 5.2.1 rules enforced
by a pure rules engine. Only SRD 5.2.1 content is in it. It is "5E compatible"; it never uses
other trade names.

It has three parts, all in that repository, all staying there:

| Part | What it does | Where |
|---|---|---|
| Rules engine | Pure JavaScript. `apply(state, action, ctx)` is the only way game state changes. Seeded dice, so every game replays exactly. No network, no clock, no I/O. | `packages/rules` |
| Table server | One Node process with no dependencies. Serves the game, runs multiplayer tables over a WebSocket, runs every action through `apply()` with the sender's role, sends each player only what their character can know, saves each table as a JSON file. Deployed on Railway with a persistent volume. | `packages/server` (protocol in its `README.md`) |
| Client | The browser app: renderer, table UI, and `transport.js`, which talks either to an engine in the tab (solo) or to a table server. Works on phones. | `packages/client` |

Today a player is a name and a session token at one table; there are no accounts. A DM hosts a
table, gets a six-letter code, and lets players in by hand.

The Hextable spec `docs/specs/portable-characters.md` designs **characters that travel**: a
character file kept on the player's device, with a chain of history blocks that a table server
signs (Ed25519, SHA-256, through Web Crypto), a level meter and a compatibility report. Its jobs
P1 to P10 are not built yet. That spec predates the owner's decisions below and is to be amended
to agree with them (a separate Hextable job). Where they differ, the owner's decisions win.

The rules of Hextable that bind this project too:

- Everything that changes a game goes through `apply()`. The service never changes game state.
- The table server is authoritative; nothing a browser computes is trusted.
- A rejected request changes nothing.
- The engine never pretends: what cannot be done by the rules is handed to the DM plainly.
- No real names, no secrets in any repository, plain words in the interface.

## 2. What the service is, and is not

**Owner, 13 November 2026:**

- "There is a single trusted server, the project's own, built into the game. It is what makes
  things **official**: reputation, and validation of characters and their histories."
- "It is **not required** to have characters or to host games. Anyone can play and host without
  it; such play is simply not official."
- "There is **no mechanism for a separate service to grant the official designation**. Other
  servers can sign histories, but those count as unofficial." (This replaced an earlier answer
  of "no official list; each server trusts itself".)

So the service **is**:

- the register of monikers (handles) and of official character records;
- the holder of the project's signing keys and the only source of "official";
- the lobby of official games, with screening;
- the keeper of reputation and reliability, for players and for DMs;
- the receiver and publisher of anonymous play statistics;
- later, the source of AI stand-in profiles.

The service **is not**:

- a place characters must live (players keep their own files);
- a requirement for hosting or playing (any table server, including a modified one, works);
- a rules engine (it never runs `apply()` and never sees a game state);
- a game server (official games run on the project's own table server, in the game repo);
- a franchise: no other operator can be made official, by key, list or agreement.

**What stays in the game repository:** the rules engine, the table server, the client, the
character file format, the history chain and its verification (`lineage.js`, portable-characters
P1), the level meter, admission and send-off at a table, the compatibility report, the connection
dot, stepping away, and the AI that plays a character (it sends actions through `apply()` like
any player).

**What the service owns:** monikers and sign-in; the root and signing keys; per character id, the
hashes of its official history and a small public summary; official adventures and their seats;
the lobby listings and screening; reputation and reliability figures; the anonymous statistics
store and its published data; moderation records; later, stand-in profiles and paid backups.

**Recommendation: official games run only on the project's own table server.** Reason: the owner
made the official designation impossible to grant to anyone else, and the only table server
whose code and operation the project controls is its own deployment. A self-hosted table server
can still be used by anyone; its play is unofficial. Alternative: let other table servers report
to the service under a registered key. That is exactly a "mechanism for a separate service to
grant the official designation", which the owner ruled out, so it is not offered.

## 3. The owner's decisions, organised

Unless another date is given, the owner's words below are from 13 November 2026, recorded on
`imburk/hextable` issue #244 and its comments (and #246 for connection and stepping away). The
request to found this project is of 14 November 2026 (issue #254).

### 3.1 Identity

- **Owner:** "Everyone registers with a **unique moniker** (a chosen handle, never a real name)."
- **Owner:** "A character's history names the DM who ran each table, by moniker (always, not
  opt-in)." (This overrides the portable-characters default, where the DM's name was opt-in.)
- Gap: how someone proves they hold a moniker, whether an e-mail address may be kept, and a
  minimum age are not decided. Questions Q1, Q2.

### 3.2 Reputation and reliability

- **Owner:** "**Reputation belongs to the player (the moniker), not to a character.** A player
  may have many characters."
- **Owner:** "**Reliability is its own stat**, separate from any other reputation: for example,
  how often a player finishes the estimated play time of the adventures they join, so that
  someone who constantly drops out is visible as such."
- **Owner:** "**DMs have reputation too**: a player (moniker) has a DM reputation and a DM
  reliability, alongside their reputation and reliability as a player."
- **Owner:** "A **reputation board** (not a leaderboard of power: reputation), for a community that
  generates its own interest."
- **Owner (settled):** "reputation grows only from play recorded on the official server
  (attributable by nature)."
- Gap: what reputation is computed from beyond "completing adventures" is not decided, nor who
  may see reliability beyond "visible". Questions Q7, Q8, Q9.

So each moniker has four figures: player reputation, player reliability, DM reputation, DM
reliability. None of them belongs to a character.

### 3.3 Characters

- **Owner:** "**Every character has a unique id, and every fork is a unique character.** When a
  character is forked, one keeps the original id and the other gets a new one, with the shared
  ancestry visible in its history."
- **Lead's note (proposal, awaiting the owner):** "the original keeps its id and the fork gets the
  new one. On the official server a character id can be in one adventure at a time, so playing it
  in a second adventure means forking it first. If two diverged histories with the same id ever
  reach the official server (played off the record in two places), the first one seen keeps the
  id and the other is registered as a fork." Question Q3.
- **Owner:** "**The official server need not store characters: a hash is enough.** Players keep
  their characters on their own phone or PC. The official server keeps, per character id, the
  fingerprint (hash) of the latest officially recorded state of its history, and checks it at
  each connection. **Server-side backups of characters could be a paid upgrade.**"
- **Lead's notes on the hash:** a file presented later is accepted as official only if its
  history leads to the recorded fingerprint, so an edited file, or an older copy from before a
  loss or a death, is detected; new entries are signed and the fingerprint moves forward. The
  hash cannot restore a lost file (hence backups) or show a character in the lobby while its
  owner is offline, so the lobby needs either **a small public summary kept beside the hash (id,
  moniker, name, class, level, the meter's figures)**, the lead's proposed default, or to list
  only characters whose owners are connected. Question Q4.
- **Owner:** "a character's history shows the **date only**."
- **Owner:** "A character's level meter and history grade are visible to everyone, **including in
  the lobby before joining**." (This overrides the portable-characters default, where only the
  owner and the DM saw the meter.)
- **Owner:** "Ready-made heroes and imported characters (Fantasy Grounds, later Roll20) can become
  travelling characters; their history starts with one self-reported line saying how they
  arrived."
- **Owner:** other servers "can sign histories, but those count as unofficial". So a history has
  official entries (recorded on the official server) and unofficial ones (signed by any other
  server, or self-reported), and the display keeps them apart.

### 3.4 Admission to an adventure

- **Owner:** "How characters arrive is a step of setting up the adventure; every character is new
  to that adventure. Routes the DM can switch on: built at the table; from the DM's stable;
  supplied by a player and approved by the DM; nominated by a player."
- **Owner:** "The DM sets the adventure's character level. A higher-level character can be
  **forked**: a duplicate rewound to that level with later history stripped, marked as a fork."
- **Lead's assumption, unconfirmed:** a lower-level character may be raised at the table, recorded
  as such. Question Q5.
- **Owner:** "What leaves with a character: everything, with the DM's sign-off at send-off."
- **Owner (stretch):** "the DM can **suspend** things a character brings (an item that would undo
  the adventure) for the length of the adventure; items first, spells and features later."
- **Owner:** "**Waiting or refused players** are told about their own character (its
  compatibility report; accepted, refused, or accepted with changes), plus an optional short note
  from the DM."
- **Owner (wanted, not this project):** a Roll20 importer; companions (familiars, pets, mounts,
  summons) with their own spec. Both are game-side.

### 3.5 The lobby

- **Owner:** "The lobby lists games with information such as: one-shot or campaign, estimated
  length, and reputation for completing adventures."
- **Owner:** "**Screening in the lobby**: an adventure states what characters it admits (the first
  screening item is the character: level, compatibility, history grade), and the lobby applies it
  before the DM is asked."
- **Owner:** the meter and history grade are visible in the lobby before joining (3.3).

### 3.6 AI stand-ins and engagement facets

- **Owner:** "An AI takes over the character of a player who bails out."
- **Owner:** "The AI has an **engagement score that can correspond to a player's**, possibly in
  facets: imagination, tactics, aggression, compassion, effectiveness."
- Gap: how a player's facets are measured, by whom, and who sees them. Question Q10. The facets
  are the most sensitive data in this design (section 6).

### 3.7 Play statistics

- **Owner:** "**Play statistics from the outset**: collect statistics on how long play takes, for
  regression analysis against things like DM reputation, monsters per encounter, number of
  encounters and types of monsters (the aim: honest estimated lengths for adventures in the
  lobby)."
- **Owner:** "These statistics are **non-attributable**, **completely transparent** (anyone can see
  exactly what is reported), and there is a **way to opt out**." He first added "Opting out slows
  reputation growth", then **settled it**: "Anonymous play statistics are a separate switch with
  **no penalty** for opting out." The settled version is the decision.
- **Owner:** "The **anonymous statistics use UTC timestamps**."
- **Lead's notes:** keep two streams: anonymous statistics carry a reputation **band**, never a
  moniker; reputation records are attributable and separate. Small tables make statistics
  identifying, so report in coarse buckets and only above a minimum number of games. Exact UTC
  start times can single out a session to anyone who knows when a table met: keep exact
  durations, round start times (for example to the hour) unless a finer grain is shown to be
  needed.

### 3.8 Connection status and stepping away (issue #246)

- **Owner:** a connection dot at a multiplayer table (good, shaky, lost), measured, not guessed;
  the DM sees everyone's. The issue adds that later, with the lobby, "a table's or a player's
  connection history could feed reliability fairly ('the connection dropped' is not 'the player
  quit')". That is a possibility, not yet a decision.
- **Owner:** the DM has a simple way to **push someone down the turn order** for a disconnect, a
  break or a call; a player has a **"need a break" button** that tells the table and offers the DM
  the same choices; it **may switch on an AI stand-in** until the player is back.
- **Lead's notes:** the SRD has no "delay your turn" rule, so this is a named table rule with
  choices (end of the round, hold until back, Dodge, a stand-in); the dot may suggest stepping
  aside but never does it by itself.
- **Recommendation:** for reliability, a dropped connection that returns, a step-away, and a
  stand-in that covers a gap are **not** counted as leaving. Only leaving an adventure before its
  end without a send-off counts, and the player can contest any single count (section 6).
  Reason: the owner's own words separate "the connection dropped" from "the player quit".
  Alternative: count long disconnections too, above a threshold; this punishes bad networks,
  which are often not a choice. Question Q8.

## 4. Scope in phases

Each phase ships alone and is useful alone. "Game" says what Hextable must have first; the
interface points are numbered as in `INTERFACE.md`.

| # | Phase | What it delivers | The game must provide | Interface |
|---|---|---|---|---|
| 0 | **Identity and keys** | The service running; the offline root key and the first signing key; the public keys published; monikers registered and signed in; see, contest and delete; the privacy notice. | The root public key shipped in the game; a "Sign in" that reaches the service; the table server able to check a sign-in assertion. Nothing else changes. | I1, I2, I3, I4, I5, I19 |
| 1 | **Anonymous statistics, collection** | The report format published; the switch; reports received and stored; the public dataset, aggregated above a minimum. | The table server measures session lengths and encounter facts and sends them when the switch allows; the screen shows exactly what is sent. | I15 |
| 2 | **Character records** | A character id registered; its official hash chain kept; checked at connect; forks registered; the public summary. | Portable-characters P1 (lineage), P2 (file), P3 (table server key and sealing), P5 (offer), P6 (My characters), P7 (the meter, with an "official" grade). | I6, I11 |
| 3 | **Official adventures** | The DM opens an official adventure on the official table server; characters admitted by the owner's routes; one adventure at a time per id (if Q3 confirms); history entries recorded with the DM's moniker and the date; send-off with the DM's sign-off. | P4 (`admit`), P8 (review), P9 (send-off); admission routes; forking to the adventure's level; the table server reports seats and entries. | I7, I8, I9, I10, I12 |
| 4 | **The lobby and screening** | Official games listed (one-shot or campaign, the DM's own length estimate, level); the meter and history grade before joining; screening applied before the DM is asked; waiting and refusal messages. | A lobby screen; the join flow from a listing; the DM's screening settings; the waiting and refusal screen. | I13, I14 |
| 5 | **Reputation and reliability** | Four figures per moniker, computed from official records only; the reputation board; contesting a count; reputation bands added to statistics; length estimates in the lobby from the data. | Profile and board screens; the connection and step-away events (#246) reported from official tables. | I16, I17 |
| 6 | **AI stand-ins** | Stand-in profiles (facets); the request that switches one on; costs capped. | The AI that plays a character through `apply()`; the step-away rule (#246); the stand-in control for the DM. | I18 |

**Why this order.**

- **Identity and keys first**, because every later phase names a moniker or carries a signature,
  and because the privacy groundwork (notice, data inventory, deletion) must exist before the
  first byte of personal data arrives.
- **Statistics second**, earlier than the obvious place. The owner asked for them "from the
  outset"; they need no identity at all; and a regression needs months of data before an estimate
  is honest, so the sooner collection starts the sooner the lobby's lengths can be real. The
  reputation band is added in phase 5, when there is reputation.
- **Character records before adventures**, because admission must check the fingerprint. Phase 2
  is useful alone: a player can see that their file matches the official record, and forks are
  registered.
- **Adventures before the lobby**, because a lobby of official games needs official games. Phase 3
  is useful alone: a DM shares the code by hand, as today, and the play is recorded officially.
- **The lobby before reputation.** The lobby is useful with the meter, the history grade and the
  DM's own estimate. Reputation needs a body of official play to be computed from; launched on an
  empty record it is noise and an invitation to farm. It is also the most abuse-prone and legally
  sensitive figure, so it comes after the moderation tools exist.
- **AI stand-ins deliberately last.** They depend on game work not yet started (an AI that plays a
  character, the step-away rule); each use costs money for model calls; and engagement facets
  describe how a person plays, which is profiling. Meanwhile the step-away rule of #246 (push
  down the order, Dodge, hold the turn) covers a player who bails out without any AI.

Paid backups are outside the phases: they need payments, which bring consumer law, tax and
refunds. They are a question (Q11), not a phase.

## 5. Architecture

### 5.1 The options

All three keep the game working without the service, and all three keep the official games on
the project's own table server.

| | A. One small Node service with SQLite | B. Managed database and serverless functions | C. Extend today's table server |
|---|---|---|---|
| What it is | A separate Node process, no dependencies, its own repository, its own volume, on the host the table server already uses (Railway). Storage in SQLite through Node's built-in `node:sqlite` (unflagged since Node 22.13; marked experimental when this was written, so check its status first), or append-only JSON files if that is not ready. | A hosted Postgres or key-value store with functions in front (for example a Supabase-style or Workers-style platform). | Monikers, records, lobby and statistics added to `packages/server` in the game repo. |
| Cost | One small always-on container and a small volume: low, a few to a few tens of US dollars a month at the start (estimate; check current prices). | Free tiers at first, then usage-based; low at small scale, less predictable later. | Lowest: no new process. |
| Operations | One process to watch, one file to back up, one deploy. The same skills as the table server. | Little to run, but two consoles, a vendor's limits and their SDKs (a dependency the project's conventions forbid without a written reason). | Nothing new to run, but every game deploy is a service deploy. |
| Privacy | All personal data in one file on one host the project already has an agreement with; easy to inventory, back up and delete. | Personal data at a second vendor (another processor to list, possibly another country). | Personal data mixed into the game's server and its data folder, next to every table file. |
| Failure modes | The process or its volume is lost: restore from backup; play is unaffected. SQLite allows one writer, which is ample at this scale. | Vendor outage or price change; cold starts; secret keys in a vendor's store. | A bug or load in the service takes games down with it, and the reverse; the game repo's AGPL and the service's needs are tied together; the owner asked for a separate project. |
| Separation | Clean: the game talks to it only through `INTERFACE.md`. | Clean. | None. |

**Recommendation: A.** Reasons: it keeps the project's rule of no dependencies and plain
JavaScript; it is one process the owner and his agents already know how to deploy; personal data
sits in one place that can be inventoried and deleted; it fails without touching play; and it
can move to a managed database later without changing the interface. Alternative: B, if the owner
would rather pay a vendor than watch a process, accepting a dependency and a second processor.
C is not recommended: it is what the owner chose not to do by asking for a separate project.

### 5.2 How the pieces talk

```
 browser (game client) ──WebSocket──▶ table server (official deployment) ──HTTPS, signed──▶ service
        │                                                                                   ▲
        └────────────── HTTPS: sign in, lobby, profiles, board, own data ───────────────────┘
```

- **Browser to service:** sign-in on the service's own pages, the lobby list, profiles, the
  board, a player's own data. Never game state.
- **Official table server to service:** everything that records play. Every request is signed
  with the table server's service credential (I5).
- **Unofficial table servers:** never talk to the service except to fetch public keys (I1) and
  public lists, like anyone.
- **Recommendation:** the service's sign-in lives on the **service's own origin** (its own web
  address), and the game receives a short-lived signed assertion (I3). Reason: account secrets
  never live in the game's origin, so a script-injection bug in the game cannot steal an account.
  Alternative: sign-in inside the game's own page, which is simpler to build but puts the account
  key next to every bug the game has. The game's page today allows connections to its own origin
  only (`connect-src 'self'` in the table server's headers); calling the service from the browser
  needs that header widened to the service's address, or a path on the table server that forwards
  to it. `INTERFACE.md` lists this.

### 5.3 Sign-in

**Recommendation:** passkeys (WebAuthn, built into current browsers and phones) on the service's
origin, plus printed recovery codes made at registration. Reasons: no password to leak, nothing
to install, works on phones, and resists phishing. Verifying a passkey needs a small reader for
its binary format, written here without a library. Alternative: a key pair made in the browser
and kept in its storage, with a recovery code; simpler to build, but lost with the browser's
storage. Neither needs an e-mail address; whether one may be kept for recovery is Q1.

### 5.4 Data model sketch

Keys are random ids (128 bits, base64url), never derived from a handle or a name. "Public" means
anyone may read it through the interface; "signed in" means any signed-in moniker.

| Table | Key | Fields | Hashed | Signed | Public |
|---|---|---|---|---|---|
| `monikers` | `mid` | `handle` (unique after case-folding and confusable-folding), `created` (date), `status` (active, suspended, deleted), `consents` (notice version and date per switch), `age_ok` (yes, with the date stated) | recovery codes (stored only as hashes) | no | `handle`, `created`, the four figures (phase 5) |
| `credentials` | `mid`, `credId` | passkey public key, `added`, `last_used` (date), `revoked` | no | no | no |
| `characters` | `cid` | `holder` (`mid`), `parent` (`cid` it was forked from, or none), `fork_at` (block number), `status` (free, or the `aid` it is in), `summary` (name, class, level, the meter's figures: Q4), `summary_shown` | no | no | `summary` while `summary_shown` |
| `records` | `cid`, `n` | `block_hash`, `prev_hash`, `aid`, `date`, `dm` (`mid`), `official` (yes) | the block itself is never stored; only its hash | receipt (below) | the dates and DM handles shown with the character |
| `adventures` | `aid` | `dm` (`mid`), `server` (the table server's key id), `kind` (one-shot, campaign), `level`, `length_estimate`, `routes`, `screening`, `status` (open, running, closed), `opened`, `closed` (dates) | no | no | while listed: all but `server` |
| `seats` | `aid`, `cid` | `mid`, `route`, `decision` (accepted, accepted with changes, refused), `joined`, `left` (dates), `left_how` (send-off, ended, walked out) | no | no | no (feeds reputation) |
| `presence` | `aid`, `mid`, `n` | `kind` (dropped, back, step-away, stand-in on, stand-in off), `minute` (UTC, to the minute), `duration` | no | no | no (feeds reliability; short retention) |
| `figures` | `mid`, `role` | reputation, reliability, `as_of`, the counts they were made from | no | no | yes, with the counts |
| `contests` | `id` | `mid`, what is contested, `opened`, `decided`, `outcome` | no | no | no |
| `stats` | random `rid` | the report exactly as received (I15), `hour` received (UTC) | no | no | only as aggregates above the minimum |
| `keys` | `kid` | public key, `valid_from`, `valid_to`, the root's certificate | no | by the root | yes |
| `moderation` | `id` | subject, reporter (`mid`), reason, action, dates | no | no | no |
| `log` | sequence | who did what to which record, when (UTC) | no | no | no |

**What is signed by the service.** A **receipt** for each official history block: `{ v, cid, n,
block_hash, aid, date, dm: { mid, handle }, kid, sig }`. A **sign-in assertion** (I3). The
**key list** and **revocation list** (I1). Nothing else needs a signature.

**What the game can check offline.** A receipt, against the root public key shipped in the game.
**What only the service can tell.** Whether the file is at its official head, behind it (rolled
back) or beside it (a diverged copy).

### 5.5 The trust model

**Keys.**

- **Recommendation: two levels.** A **root key** (Ed25519) made offline by the owner, kept offline
  (on paper and a hardware key, two copies in two places), used only to certify signing keys and
  to sign revocations. The service holds an **online signing key**, certified by the root for a
  period (a year), with which it signs receipts and assertions. Reason: the online key is the one
  most likely to leak; with a root kept offline, a leak is repaired by revoking one key, without
  shipping a new game. Alternative: one online key shipped in the game; simpler, but its leak
  needs a game release and leaves every old record in doubt.
- **How the game ships the key.** The root public key is a constant in the game repository (a
  small data file, its fingerprint also in the README), so every copy of the game, the AGPL forks
  included, can check official records offline. The current signing keys, their certificates and
  the revocation list come from I1 and are cached by the table server and the browser.
- **Rotation.** A new signing key is certified by the root before the old one expires; both are
  valid for an overlap of a month; old public keys stay in the list forever so old receipts still
  check. A receipt is valid if its key was valid on its date and is not revoked.
- **Compromise.** The owner signs a revocation of the leaked key with the root; receipts made by it
  after a stated date are no longer official; the service re-issues receipts for its own records
  under the new key (it still holds the hashes). If the root itself leaks, a new root needs a game
  release; that is why it never touches a networked machine.

**What a table server proves to the service.** The official table server holds a **service
credential**: an Ed25519 key pair whose public part is registered in the service's configuration
by the owner. Every request it makes is signed over the body, a timestamp and a nonce (I5). The
service refuses anything else for the recording endpoints. An unofficial table server holds no
credential and cannot record anything official, whatever its code says.

**What "official" rests on, and what it cannot rest on.**

- It rests on: the root key the owner holds; the service's records; and the project's own
  deployment of the table server, which runs every action through `apply()` and reports what it
  observed.
- It cannot rest on the code. The game is AGPL: anyone may run a modified table server or a
  modified client. A modified client can draw "official" next to anything; a modified table
  server can sign anything with its own key. Neither can make a receipt that checks against the
  root key. A fork of the game could ship its own root key and call it official in its own
  screens; nothing technical prevents that, and the remedy is the project's name and the fact that
  anyone can check a receipt against the published key (Q12 asks about the name).
- **What a cheating table server could forge.** An unofficial one: its own blocks, any history it
  likes, any DM name it likes, all shown as unofficial. The official one, if its host or its
  credential were compromised: false entries recorded as official until the credential is revoked.
  The service limits the damage by refusing impossible sequences (a level jump with no level-up
  entry, a character in two adventures, entries for an adventure that is closed), by rate limits
  per adventure, and by the log.
- **What a signature does not show.** A receipt shows **that the official server recorded this,
  on this date, at this adventure, under this DM's moniker, and that it has not been changed
  since**. It does not show that the play was fair, that the DM did not hand levels out, that the
  players were different people, or that the dice were not rewound. The game's wording must say
  "recorded officially", never "verified" or "legitimate" alone.

### 5.6 Abuse

| Abuse | What it looks like | What the design does |
|---|---|---|
| Fake monikers | Many accounts by one person, to vote, farm or evade a ban | No figure grows except from official play with other monikers; new monikers start empty and are marked new; registration is rate-limited per address and per device; a ban covers the person's credentials, not just the handle. |
| Reputation farming with friendly DMs | A DM and friends run short "adventures" to pump each other's figures | Figures count **distinct** DMs and distinct fellow players, with diminishing weight for repeats of the same group; levels the DM granted without XP do not count toward anything; a minimum length for an adventure to count; DM reputation itself weights what a DM's tables give; the board shows the counts behind every figure. |
| Collusion | Closed rings rating each other up, or a group ganging up on someone | No star ratings or free-text reviews of people in phases 0 to 5 (Q7): figures come from recorded facts (adventures finished, send-offs), not opinions; rings show up as a small set of distinct partners, which the board displays. |
| Harassment through the lobby | Refusal notes as insults; repeated joins; listings as bait | The DM's note to a refused player is short (80 letters, as in the portable-characters spec), shown to that player only, reportable; a player can block a DM and a DM a player, silently; join requests are rate-limited; listings are text-limited and reportable. |
| Impersonation | A handle that looks like another (Unicode confusables), or like the project ("Official", "Admin", the owner's) | Handles are compared after case-folding and confusable-folding (the Unicode confusables data, as a table in the repo); reserved words refused; a take-down path for impersonation and for real names. |
| Real names as monikers | A player uses their own or someone else's real name | Policy at registration, the screen says it, reports lead to a forced rename; the service cannot check it. |
| Scraping | Copying the board, profiles and play times to track people | Public data is minimal; detailed figures need sign-in (Q9); per-address and per-moniker limits; no bulk export of profiles; statistics are published only as aggregates. |
| Poisoned statistics | False reports to bend length estimates | Only the official table server may report (I15); reports bounded and checked for plausibility; published estimates show their sample size. |
| Abuse of the AI stand-in | Bailing out on purpose to let the AI play, or costs run up | A stand-in is counted for reliability as the owner's reliability rule says (Q8); requests capped per adventure and per day; a spending cap on the service. |

## 6. Privacy and law

This section is not legal advice. It says what the design must face so that a lawyer, if the
owner asks one, has a clear list. **Recommendation:** have a privacy lawyer read sections 6 and
7 before phase 0 opens to the public.

**What is personal data here.** In European law, anything that relates to a person who can be
identified, directly or by combining facts. A moniker is a pseudonym, and pseudonymous data is
still personal data. So all of these are personal data:

- monikers, credentials, sign-in records, network addresses in logs;
- reputation and reliability, as a player and as a DM;
- engagement facets (they describe how a person plays: this is profiling);
- connection and step-away events, and their timestamps;
- a character's public summary, since it names its holder's moniker;
- history entries naming a DM's moniker, on the service and inside players' files;
- moderation reports and contests.

The anonymous statistics are designed not to be personal data (no moniker, no character id, no
table id, buckets, rounded hours, a minimum count before publication), but the request that
carries them comes from a known table server at a known time: the service must not log the
sender beyond what security needs, and must drop the receiving details from the stored record.

**Consent and other grounds.** Keeping a moniker and the records of official play is what a
player signs up for, so it rests on providing the service they asked for. The figures shown to
others (reputation, reliability, the board) affect how others treat a person; the
**Recommendation** is to treat showing them as something the player switches on at registration,
with a plain explanation, and can switch off (their figures are then hidden from others, and
the lobby says "not shown" rather than inventing a value). Engagement facets: only with a
separate, explicit consent (Q10). Anonymous statistics: a separate switch, **with no penalty for
opting out** (the owner's settled decision); European law expects consent that is penalised when
withheld not to count as freely given, which is why the owner's settlement matters.

**Screening and automated decisions.** The lobby applies a DM's screening before the DM is asked
(owner, 3.5). A refusal made by a machine on the basis of a person's figures is an automated
decision about them. The **Recommendation**: screening uses only what the DM chose and the player
can see (level, compatibility, history grade, and later a reliability threshold if the owner
wants one); the player is told which rule refused them; and they can ask the DM directly.

**The rights a player has, and how the service gives them** (all from phase 0):

- **See**: a page with everything kept about their moniker, and a download of it as a file.
- **Contest**: any single count behind a figure (an adventure counted as walked out, a reported
  step-away) can be contested; the figure shows "under review" until decided; the decision is
  recorded and given to the player with its reason.
- **Correct**: rename (with the old handle reserved for a while against impersonation).
- **Delete**: the moniker, its figures, seats, presence events and summaries are removed; history
  receipts in the service keep their hashes but the DM field becomes "a deleted moniker". Copies of
  history inside files on players' devices cannot be reached: the privacy notice must say so
  before registration. **Recommendation:** receipts carry the DM's `mid` and the handle of the day
  (the owner wants the DM named on every entry, readable offline). Alternative: the `mid` only, with
  the handle looked up from the service, so a deleted DM's handle disappears from every file the
  next time it is checked; costs offline readability.
- **Object**: switch off showing figures, statistics, facets, each separately.

**Minors.** The game will be played by children. European rules let each country set the age at
which a child can consent to an online service between 13 and 16; the United States has its own
rule for under-13s; the United Kingdom expects services likely to be used by children to be
designed for them. **Recommendation:** official accounts from 16, stated by the player, with
everything else open to all ages unofficially; no facets or public figures for anyone under 18.
Alternative: 13 with parental consent where a country requires it, which needs a consent process
the project cannot run cheaply. Question Q2.

**European rules in practice.** A record of what is processed and why (the data inventory below
is its start); a privacy notice in plain words; an assessment of the risks to people before
starting (a data protection impact assessment is expected for profiling and public scoring); a
written agreement with the host as a processor; knowing where the data is stored and whether it
leaves Europe; notifying the authority of a breach that risks people's rights within 72 hours, and
the people themselves when the risk is high.

**What must be decided before any data is collected** (phase 0 cannot open before these):

1. Who the controller is (the owner by name, privately, in the notice) and a contact address.
2. The minimum age and the sign-in method (Q1, Q2).
3. The privacy notice and the data inventory, published.
4. Retention periods (the table below), and the deletion path built and tested.
5. Where it is hosted and the host's processor terms.
6. The breach and key-compromise procedure (section 7).

### Data inventory

| Item | Why it is kept | How long | Who can see it |
|---|---|---|---|
| Moniker (handle) | To identify a player across official play | Until deleted by the player, or 2 years after the last sign-in (Q13) | Everyone |
| Credentials (passkey public keys) | Sign-in | Until removed or the moniker is deleted | Nobody but the service |
| Recovery codes (hashed) | Recovery without e-mail | As the moniker | Nobody |
| Consent records | To show what was agreed and when | As the moniker, then 1 year (proof) | The player; the owner on a dispute |
| Character summary (name, class, level, meter figures, holder) | The lobby and profiles while the owner is offline (Q4) | Until the player hides or deletes it | Everyone while shown |
| History receipts (hashes, date, adventure, DM moniker) | Official validation of a character's history | As long as the character id is registered | The holder; the date and DM on entries are shown with the character |
| Adventures (DM, kind, level, estimate, routes, screening) | Running and listing official games | Listing: while open; record: 2 years after closing | Listing: everyone; record: the DM and seated players |
| Seats (who played, how they left) | Reputation and reliability | 2 years, or until the moniker is deleted | The player and the DM of that adventure |
| Presence events (drops, step-aways, stand-ins) | Fair reliability (dropped is not quit) | 90 days, then only the counts are kept | The player, the DM of that adventure |
| Figures (four per moniker, with counts) | The board, the lobby, screening | Recomputed; removed with the moniker | Owner's decision: visible (Q9 on how widely) |
| Engagement facets | AI stand-ins (phase 6) | Until switched off | The player; others only if the player opts in (Q10) |
| Contests and decisions | Fairness and appeal | 2 years after decision | The player; the owner |
| Moderation reports | Take-down and repeat abuse | 2 years after closing | The owner; the reported party sees the outcome, not the reporter |
| Service logs (addresses, requests) | Security and abuse limits | 14 days | The owner |
| Anonymous statistics reports | Length estimates | Indefinitely (anonymous) | Everyone, as aggregates above the minimum; the exact format of a report is public |
| Backups | Recovery | 30 days rolling; deletions reach them when they expire | The owner |

The periods are this document's proposals, set short on purpose; the owner may change them (Q13).

## 7. Operating it

**Hosting cost bands** (estimates; check current prices before deciding):

| Item | Band |
|---|---|
| The service process and a small volume, on the host already used | low: a few to a few tens of US dollars a month |
| Off-site backups (a small object store) | cents to a few dollars a month |
| A domain for the service's own origin | tens of dollars a year |
| AI stand-ins (phase 6) | per model call; could become the largest cost; needs a hard monthly cap |
| Paid backups (if ever) | storage is cheap; payments and support are not |

**Moderation and take-down.** A "report" control on every handle, listing and refusal note. The
owner is the moderator at first; the service lead prepares each case (what was reported, what the
record shows, a proposed action) on a private queue, not in public issues. Actions: hide, forced
rename, suspend, delete. Each is recorded with its reason and told to the person affected, with a
way to appeal once. A public page states the rules and a typical response time.

**Backups.** SQLite's online backup once a day to a second location, encrypted, kept 30 days;
the signing key is **not** in the backup (it is re-certified from the root if lost). A restore is
tried every month into a scratch copy; a backup never restored is not a backup.

**Incident response.** Written before phase 0 opens: who is told, in what order:

- **Signing key leaked:** revoke with the root, issue a new key, re-issue receipts, publish a note.
- **Table server credential leaked:** revoke it in the service, list what it recorded since the
  suspected date, mark those records under review, issue a new credential.
- **Personal data exposed:** contain, assess, notify the authority within 72 hours where required,
  tell the people affected, publish what happened.
- **The service is wrong** (a bad computation of figures): freeze the board, fix, recompute from
  the records, say so.

**What "the service is down" does to play: nothing.** The game and every table server work without
it. Official features wait:

- sign-in and the lobby are unavailable, and the game says so in one line;
- an official adventure that is already running goes on; the official table server keeps the
  records it could not send and sends them, in order, when the service returns (each with its own
  date);
- a new admission cannot be official until the fingerprint is checked: the DM may wait, or play
  that character unofficially;
- no figure changes while down; nothing is lost.

## 8. How the project should be run

**Repository and lead.** Its own repository under the owner's account, and its own lead
conversation, which plans, hands building to agents through issues, checks and merges, as
Hextable's lead does. Leads are separate AI conversations: they cannot see each other's chats,
and **GitHub is the only channel** between them (`WORKING-TOGETHER.md`).

**Files to start with**, modelled on Hextable:

| File | Holds |
|---|---|
| `CLAUDE.md` | What the project is, its layout, its rules that do not bend (the service never changes game state; no real names; no secrets in the repo; personal data only per the inventory; nothing is official without the root key), conventions (plain JavaScript, Node's standard library, no dependencies without a written reason), how to test. |
| `AGENTS.md` | The working agreement for every coding agent: one issue, one branch, one pull request; the files an issue lists; tests with every change; never merge your own. |
| `docs/DESIGN.md` | Architecture: this document's sections 5 to 7, kept current. |
| `docs/FOUNDING.md` | This document, copied unchanged as the record of where it began. |
| `docs/INTERFACE.md` | A one-line pointer to the single home of the interface (`WORKING-TOGETHER.md`). |
| `docs/PRIVACY.md` | The data inventory and the privacy notice draft. |
| `docs/ROADMAP.md` | The phases. |
| `SECURITY.md` | How to report a problem privately; what is in scope (accounts, figures, keys, the stats endpoint). |
| A hand-over note | In a private ops repository (as Hextable keeps `imburk/hextable-ops`), never in the public one: the state, what is in flight, what is next. Recommendation: its own private repository; alternative: a folder in `hextable-ops`, cheaper but lets one lead edit the other's notes. |
| A decisions issue | One pinned issue, "Owner decisions", each open question with the default work proceeds on, struck when answered (as Hextable's #193). |

**Licence.** **Recommendation: AGPL-3.0-or-later**, with Hextable's contributor agreement (which
lets the owner relicense contributions). Reasons:

- Trust in figures and in "completely transparent" statistics is easier to earn when anyone can
  read how they are made.
- "Official" rests on the root key, not on secret code, so publishing the code gives nothing away.
- The owner, as the copyright holder (with the contributor agreement covering others), is not bound
  by his own licence: he can run the official service, charge for backups, and keep private
  configuration (abuse thresholds, keys) out of the repository.
- If the service reuses Hextable's own code (canonical JSON, `lineage.js`), it is copying AGPL code,
  and AGPL is then the simple answer; the owner's rights in that code would also allow another
  licence.

Notes for the choice:

- A network service that an AGPL game talks to **does not itself have to be AGPL**. The AGPL
  binds modified versions of the AGPL program, and a separate program speaking a protocol is
  generally a separate work (not legal advice).
- **Choosing AGPL** means anyone may run a copy of the service, modified, if they publish their
  changes. Such a copy cannot make anything official (it lacks the root key), but it could run a
  rival lobby. Paid backups stay possible: the licence governs code, not the price of a hosted
  service.
- **Choosing a closed licence** (a private repository) hides the anti-abuse logic from abusers, and
  stops rival copies, but asks players to trust figures they cannot inspect, and contributions from
  outside would need a different agreement. Alternative to both: AGPL for the code with the
  anti-abuse thresholds and weights in private configuration, which is the recommendation's own
  practice.

**Naming.** The repository and public name are the owner's (Q12). Working names, until he
chooses: repository `hextable-service`; in the game's screens "the official Hextable server".
Avoid any name that uses other trade names. A registered name or trademark is the only defence
against a fork calling itself official (section 5.5); worth asking about, not urgent.

**The first three jobs.**

1. **Set up the repository**: the files above, this document as `docs/FOUNDING.md`, the decisions
   issue with section 12's questions, the `interface` label (`WORKING-TOGETHER.md`).
2. **Settle the first five interface points with the Hextable lead** (I1, I3, I5, I6, I15; agenda
   in `WORKING-TOGETHER.md`), each to "agreed", with example messages both sides test against.
3. **Phase 0, part one**: the key plan (root ceremony written for the owner, signing key, the
   published key list, I1), the service skeleton with a health check, the privacy notice draft and
   the data inventory, and a test that deletion removes everything listed. Monikers and sign-in
   follow as the next job.

## 9. Relation to Hextable's portable-characters spec

That spec's jobs stay in the game; this project changes what some of them must do. The amendment
is a Hextable job; the points it must take from here:

| Portable-characters | Change from the owner's decisions |
|---|---|
| Question 1 ("no list of servers vouched for") | Replaced: there is one official server; other signers are unofficial; a table's own trust list stays for unofficial use. |
| Question 5 (DM's name opt-in) | Replaced: the DM's moniker is always on the entry. |
| Question 6 (meter seen by owner and DM) | Replaced: the meter and history grade are visible to everyone, in the lobby too. |
| Question 8 (no accounts) | Replaced for official play: monikers exist; the file is still the character. |
| Question 10 (one character at two tables, allowed) | Unofficially still allowed; officially one adventure at a time per id (lead's proposal, Q3). |
| Question 11 (day only) | Confirmed by the owner: date only. |
| Decision 2 grades | Gain an "official" grade: a block covered by a valid receipt. |
| Duplicate in My characters | Becomes a registered fork with a parent id when the character is official. |

## 10. Risks

- **Reputation turns players against each other.** Figures from facts, not opinions; counts shown;
  contests; the owner can switch the board off.
- **"Official" is read as "fair".** The wording rule in 5.5, tested in the game's screens.
- **The owner's time.** Moderation and contests land on him. Keep the queue small: no free-text
  reviews, short notes, automatic expiry.
- **Law changes or a complaint.** The inventory and deletion path make a response quick.
- **Two leads drift apart.** One interface home, reviews by the other lead, a decisions issue.

## 11. Glossary

- **Moniker**: a unique chosen handle, never a real name; the identity of a player and a DM.
- **Official**: recorded by the project's own service, under a key certified by the owner's root.
- **Receipt**: the service's signature over one official history block's hash.
- **Fingerprint**: the hash of the latest officially recorded block of a character's history.
- **Fork**: a new character with a new id, made from another, its shared ancestry visible.
- **Adventure**: an official game opened by a DM on the official table server.
- **Figures**: reputation and reliability, as a player and as a DM.

## 12. Questions for the owner

Each has the default work proceeds on until he answers.

1. **Sign-in and e-mail.** May the service keep an e-mail address for account recovery? *Default:
   no. Passkeys plus printed recovery codes; a lost device and lost codes mean a new moniker.*
2. **Minimum age** for an official account. *Default: 16, stated by the player; unofficial play
   open to all; no public figures or facets under 18.*
3. **Forks and ids** (lead's proposal): the original keeps its id, the fork gets the new one; one
   adventure at a time per id on the official server; of two diverged histories, the first seen
   keeps the id. *Default: yes to all three.*
4. **The public summary** beside the hash (id, moniker, name, class, level, the meter's figures).
   *Default: kept, and the player may hide it (the character then shows in the lobby only while its
   owner is connected).*
5. **Raising a lower-level character** at the table to the adventure's level, recorded as raised
   (lead's assumption). *Default: allowed, recorded as "raised by the DM", which counts as granted,
   not earned.*
6. **Suspending** what a character brings: in which phase? *Default: items in phase 3 if cheap,
   otherwise after phase 4; spells and features later.*
7. **What reputation is made of.** *Default: from recorded facts only: adventures finished, sent off
   with the DM's sign-off, weighted by the number of distinct DMs and fellow players. No star
   ratings and no written reviews of people.* DM reputation likewise: adventures run to their end,
   players who finished them, distinct players.
8. **What counts against reliability.** *Default: leaving an adventure before its end without a
   send-off. A dropped connection that returns, a step-away and a stand-in covering a gap do not
   count. Each count can be contested.*
9. **Who sees the figures.** *Default: handle and the four figures, with their counts, to anyone
   signed in; the board's top entries to everyone; a player may hide their figures from others
   (shown as "not shown").*
10. **Engagement facets.** How are a player's measured? *Default: chosen by the player as a style
    profile for their stand-in, never inferred from play; shown to others only if the player opts
    in; nothing before phase 6.*
11. **Paid backups.** *Default: not before phase 6; if wanted, a separate decision about payments.*
12. **Name.** The project's name and repository. *Default: `hextable-service`, "the official
    Hextable server" in the game.*
13. **Retention.** The periods in the data inventory. *Default: as listed.*
14. **Licence.** *Default: AGPL-3.0-or-later with the contributor agreement.*
15. **Hosting.** *Default: the same host as the table server, a separate service and volume,
    data kept in the region the host offers closest to Europe if it is a choice.*
16. **Statistics switch: whose?** A session's statistics describe everyone at the table. *Default:
    the table reports only if the DM has switched it on and no seated player has switched theirs
    off; each person's switch is theirs, off or on, with no effect on anything else.*
17. **Moderator.** *Default: the owner decides; the service lead prepares each case.*
