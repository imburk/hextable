# The interface between Hextable and the official service

Status: **first draft, version 0.1, every point proposed.** Written 14 November 2026 for issue
#254. This file is the one home of the contract (`WORKING-TOGETHER.md`); changes are made by
pull request and reviewed by the other side's lead.

**Summary**

1. "The game" is Hextable's client and table server (`imburk/hextable`); "the service" is the
   official service founded by `FOUNDING.md`. "The official table server" is the project's own
   deployment of the game's table server, the only one holding a service credential.
2. Twenty interface points, I1 to I20, each with direction, purpose, the fields that cross, who
   owns the definition, what the game does when the service is absent or refuses, security notes
   and status. All are **proposed**.
3. Browsers talk to the service only for keys, sign-in, the lobby, figures and their own data.
   Everything that records play goes from the official table server, signed with its credential.
4. Nothing in the game needs the service to play. Every point says what happens without it.
5. Signed payloads are canonical JSON, Ed25519, checked against keys certified by the owner's
   root key, which the game ships.
6. The service keeps hashes of history blocks and issues receipts; it never receives a sheet, a
   game state, a map or a dice seed.
7. Versioning: one major version in the path (`/v1/`), additive changes within it, a deprecation
   window for breaking ones; signed shapes are closed and versioned on their own.
8. The game's changes are named by file: `transport.js`, the table server (`index.js`,
   `tables.js`, a new `service.js`), and the portable-characters jobs P1 to P8.
9. What must never cross: hidden information, dice seeds, game state, real names, network
   addresses of players, session tokens, join codes, free text beyond the few bounded fields.
10. The first five points to settle are I1, I3, I5, I6 and I15 (`WORKING-TOGETHER.md`).

## Conventions for every point

- **Transport.** HTTPS, JSON bodies, UTF-8. Paths under `/v1/`. Answers are `200` with a body,
  or an error `{ error: "plain words", code: "kebab-case" }` with a 4xx or 5xx status. A `code`
  is stable; the words may change.
- **Ids.** `mid` (a moniker), `cid` (a character, as made by the game's file format), `aid` (an
  official adventure), `kid` (a key), `sid` (a table server credential): 16 random bytes,
  base64url, 22 characters. `cid` is made on the player's device (portable-characters Decision 1);
  every other id is made by the service.
- **Dates.** History: `YYYY-MM-DD` only (owner, 13 November 2026). Statistics: UTC, rounded as
  each point says. Request signing: Unix seconds.
- **Canonical JSON** for anything signed or hashed: keys sorted, integers only, no whitespace,
  UTF-8, exactly as the game's `lineage.js` (portable-characters P1) defines it. One
  definition, in the game; the service uses the same rules and the same test vectors.
- **Signatures.** Ed25519. A signed object carries `kid` and `sig` (base64url over the canonical
  object without `sig`).
- **Limits.** Every request body has a stated maximum; every list a stated maximum length;
  every string a maximum in characters. Over a limit: `413` or `400`, nothing kept.
- **Status of a point.** `proposed` (in this draft), `agreed` (both leads have reviewed it as
  `WORKING-TOGETHER.md` says), `built` (both sides merged, tested against the shared examples).
- **Owner of the definition.** The side that decides the shape; the other side reviews.

## The points

### I1. Keys, revocations and service status

- **Direction:** service → anyone (browsers, every table server, official or not).
- **Purpose:** let anyone check official signatures offline, learn what was revoked, and know
  whether the service is up.
- **Data:**
  - `GET /v1/keys` → `{ interface: "0.1", root: kid, keys: [ { kid, publicKey, use: "receipt" |
    "assertion" | "ticket", validFrom: date, validTo: date, cert: sig-by-root } ], revoked: [ { kid,
    from: date, sig-by-root } ], features: [ "monikers", "characters", ... ] }`. At most 64 keys.
  - `GET /v1/status` → `{ up: true, readOnly: boolean, message?: string (≤ 120) }`.
  - Shipped in the game: the root public key and its `kid`, as a data file in the rules package.
- **Owner of the definition:** service (the key list); game (where the root key lives in the repo).
- **If absent or refused:** the game uses its cached list (kept until a key's `validTo`); with no
  cache, nothing official can be shown as checked, and the screens say "cannot check the
  official record right now". Play is unaffected.
- **Security:** the list is only trusted through the root's certificates, never because of where
  it came from. Revocations are signed by the root. The game must refuse a key whose certificate
  fails, and a receipt dated after its key's revocation.
- **Status:** proposed.

### I2. Register a moniker

- **Direction:** browser → service, on the service's own pages.
- **Purpose:** create a moniker with its first passkey and recovery codes.
- **Data:** `handle` (3 to 24 characters, letters, digits, `-` and `_`, compared after
  case-folding and confusable-folding), the passkey registration, `ageOk: true` with the age the
  player states being at or over the minimum (FOUNDING Q2), `consents: { figuresShown, statistics,
  facets }` each a boolean, `notice` (the version of the privacy notice read). → `{ mid, handle,
  recoveryCodes: [10] }`, the codes shown once.
- **Owner of the definition:** service.
- **If absent or refused:** the game's "Sign in" says the service is unavailable; nothing else
  changes. Refusals are plain ("That name is taken", "That name looks like another one").
- **Security:** rate limits per address and per device; reserved and confusable handles refused;
  no e-mail (unless the owner decides otherwise, FOUNDING Q1); recovery codes stored hashed.
- **Status:** proposed.

### I3. Sign in to a table with a moniker

- **Direction:** table server → browser (a nonce); browser → service (sign in); service → browser
  (an assertion); browser → table server (the assertion).
- **Purpose:** bind a seat at the official table server to a moniker, without the table server
  ever holding the player's credentials.
- **Data:**
  - Game, new table-server messages: `{t:"nonce"}` → `{t:"nonce", nonce, aud}` (`aud` the table
    server's `sid`); `{t:"moniker", assertion}` → `{t:"moniker", ok, handle}` or an error.
  - Service: the browser opens `/v1/assert?aud=&nonce=&back=` (the service's page; `back` must be a
    registered address of the game). The service answers by returning to `back` with the
    assertion in the fragment.
  - Assertion: `{ v: 1, mid, handle, aud, nonce, iat, exp, kid, sig }`, `exp - iat` at most 600
    seconds.
- **Owner of the definition:** service (the assertion); game (the two table-server messages).
- **If absent or refused:** the player plays unsigned, as today; the table cannot be an official
  adventure for that player. A DM without a moniker cannot open an official adventure.
- **Security:** the table server checks `aud`, `nonce` (one use, issued to this connection),
  `exp`, and the signature against an `assertion` key from I1. The assertion is never stored in
  the table file, never sent to other players, never logged. Only the handle is shown to others.
- **Status:** proposed.

### I4. Look up a moniker

- **Direction:** anyone → service.
- **Purpose:** show a handle's public profile (lobby, a character's DM entries, the board).
- **Data:** `GET /v1/monikers/{handle}` → `{ mid, handle, created: date, new: boolean, status:
  "active" | "deleted", figures?: (I17, when shown) }`. `GET /v1/monikers/by-id/{mid}` → the
  same, for resolving `mid` in receipts.
- **Owner of the definition:** service.
- **If absent or refused:** the game shows the handle the receipt carries, marked "as recorded".
- **Security:** rate limited; no listing of all monikers; a deleted moniker answers `status:
  "deleted"` and no handle.
- **Status:** proposed.

### I5. The official table server's credential and signed requests

- **Direction:** official table server → service, on every recording request (I6 to I12, I15,
  I16, I18).
- **Purpose:** prove that a request comes from the project's own table server.
- **Data:** headers `X-Hx-Server: sid`, `X-Hx-Time: unix seconds`, `X-Hx-Nonce: 16 random bytes`,
  `X-Hx-Sig: Ed25519 over canonical { method, path, time, nonce, bodyHash: SHA-256 of the body }`.
  The table server's key pair is made on its host, kept beside its own key (portable-characters
  A6) in `DATA_DIR` with owner-only permissions; its public key is registered in the service's
  configuration by the owner. Configuration on the table server: `SERVICE_URL`,
  `SERVICE_KEY_FILE`.
- **Owner of the definition:** service.
- **If absent or refused:** a table server with no credential is an ordinary unofficial server;
  every official feature is hidden. A refused request (`401`) is logged and the feature waits.
- **Security:** the service refuses a time more than 60 seconds off and a nonce seen in the last
  10 minutes; credentials can be revoked at once; the private key is never in a table file, an
  export, a log or an error.
- **Status:** proposed.

### I6. Present a character and check its fingerprint

- **Direction:** official table server → service, when a player offers a character file
  (portable-characters P5) at an official adventure, and whenever the file is offered again.
- **Purpose:** the owner's "checks it at each connection": is this file at the official head of
  its history, behind it, or beside it?
- **Data:** `POST /v1/characters/check` with `{ cid, mid (from I3), chain: [ { n, hash, prev } ]
  (at most 100), receipts: [ n ], register?: { born: { level, how }, summary } }` →
  `{ verdict, officialN, missing: [receipts the file lacks], forkedAs?: cid, holder: "you" |
  "another" }`, where `verdict` is one of:
  - `unregistered` (and registered now if `register` was sent),
  - `at-head` (the file's chain contains the official head at `officialN`),
  - `ahead` (official up to `officialN`, then unofficial blocks after it),
  - `behind` (the file stops before the official head: an older copy),
  - `diverged` (the chain leaves the official record before its head: another copy; registered as
    a fork per FOUNDING Q3, with its new id in `forkedAs`).
- **Owner of the definition:** service (the verdicts); game (the chain, hashes and `cid`, through
  `lineage.js` and the file format).
- **If absent or refused:** the DM's review shows "the official record could not be checked"; the
  DM may wait or admit the character unofficially. Never shown as official.
- **Security:** only hashes cross, never the sheet or the entries. The holder check stops a copied
  file being presented by another moniker as theirs (`holder: "another"`); what the DM is told is
  the table server's reading of the answer, never the browser's.
- **Status:** proposed.

### I7. Open an official adventure

- **Direction:** official table server → service, on the DM's request.
- **Purpose:** make a table an official adventure, with what the lobby and screening need.
- **Data:** `POST /v1/adventures` with `{ dm: mid (the DM's I3 binding), title (≤ 60), kind:
  "one-shot" | "campaign", level (1 to 20), length: { sessions, hoursEach } (the DM's estimate),
  routes: [ "table" | "stable" | "player" | "nominated" ], screening: I14's rules, seats (1 to 8),
  listed: boolean }` → `{ aid }`.
- **Owner of the definition:** service; the routes and the level are the owner's decisions
  (FOUNDING 3.4) and named as the game names them.
- **If absent or refused:** the table plays unofficially and the DM is told why.
- **Security:** only a DM with a moniker; one open adventure per table; rate limited per DM.
- **Status:** proposed.

### I8. Admit a character

- **Direction:** official table server → service, when the DM accepts (portable-characters `admit`).
- **Purpose:** record the seat, enforce one adventure at a time per id (FOUNDING Q3), record a
  fork made to fit the adventure's level.
- **Data:** `POST /v1/adventures/{aid}/seats` with `{ cid, mid, route, decision: "accepted" |
  "accepted-with-changes", changes: count, fork?: { parent: cid, atN } }` → `{ ok }` or a refusal
  `{ code: "in-another-adventure" | "not-at-head" | "not-holder" | "closed" }`.
- **Owner of the definition:** service.
- **If absent or refused:** the character can still play at the table unofficially; the DM is told
  which, before the player is let in.
- **Security:** refusals and the DM's note to a refused player stay at the table server and are
  not sent to the service.
- **Status:** proposed.

### I9. Record a history entry

- **Direction:** official table server → service, each time the table server seals a block for a
  character in an official adventure (portable-characters Decision 3: joining, a level, a
  published conclusion, leaving).
- **Purpose:** move the fingerprint forward and get a receipt for the file.
- **Data:** `POST /v1/characters/{cid}/records` with `{ aid, n, hash, prev, date, dm: mid, head: {
  level }, summary? }` → receipt `{ v: 1, cid, n, hash, aid, date, dm: { mid, handle }, kid, sig }`.
  The table server adds the receipt to the character file (a new `receipts` list in the file
  format, portable-characters P2).
- **Owner of the definition:** service (the receipt); game (the block and where the receipt sits
  in the file).
- **If absent or refused:** the table server keeps the block (it is signed by the table server
  anyway) and queues the request, in order, until the service answers; the file shows "official
  record pending". A refusal (`prev` is not the official head) is shown to the DM as a fault.
- **Security:** the service checks that `prev` is its head for `cid`, that the character holds a
  seat in `aid`, that the date is today or within the queue's allowed delay (7 days), and that
  `level` changes by at most one per record unless the record says it was granted.
- **Status:** proposed.

### I10. Send-off

- **Direction:** official table server → service, when the DM confirms the send-off.
- **Purpose:** the owner's "everything leaves, with the DM's sign-off": record the `left` block,
  free the character id for another adventure.
- **Data:** `POST /v1/adventures/{aid}/seats/{cid}/sendoff` with `{ n, hash, prev, date, dm: mid,
  head: { level } }` → a receipt (as I9) and `{ status: "free" }`.
- **Owner of the definition:** service.
- **If absent or refused:** queued as I9; the player gets the file with "official record pending";
  the id stays in the adventure until the record arrives.
- **Security:** only the adventure's DM binding can confirm; a send-off for a seat that does not
  exist is refused.
- **Status:** proposed.

### I11. Fork

- **Direction:** official table server → service (a fork made at a table); the service may also
  register one itself (I6, `diverged`).
- **Purpose:** the owner's "every fork is a unique character": register the new id with its parent.
- **Data:** `POST /v1/characters/{parent}/forks` with `{ cid: new, atN, mid, why: "level" |
  "second-adventure" | "diverged" | "player" }` → `{ ok }`.
- **Owner of the definition:** service (registration); game (making the forked file: rewound to a
  level, later history stripped, marked as a fork).
- **If absent or refused:** the game may still make the fork as a file; it is unregistered until
  checked (I6).
- **Security:** the new id must be unknown; the parent's history up to `atN` is the fork's.
- **Status:** proposed.

### I12. Close an adventure

- **Direction:** official table server → service.
- **Purpose:** the facts reputation and reliability are made of.
- **Data:** `POST /v1/adventures/{aid}/close` with `{ date, outcome: "finished" | "ended-by-dm" |
  "abandoned", sessions, playedMinutes, seats: [ { cid, mid, left: "send-off" | "at-end" |
  "walked-out" | "removed-by-dm" } ] }` → `{ ok }`.
- **Owner of the definition:** service.
- **If absent or refused:** queued.
- **Security:** every seat in the list must exist; a closed adventure accepts no more records.
- **Status:** proposed.

### I13. The lobby list

- **Direction:** browser → service.
- **Purpose:** the owner's lobby: games listed with one-shot or campaign, estimated length, and
  reputation for completing adventures; the character's meter and grade visible before joining.
- **Data:** `GET /v1/lobby?level=&kind=&page=` → `{ games: [ { aid, title, kind, level, length: {
  dm, fromData?: { median, range, n } }, dm: { handle, figures? }, seatsOpen, screening, routes } ]
  }` (at most 50 a page). `GET /v1/characters/{cid}/summary` → the public summary (FOUNDING Q4).
- **Owner of the definition:** service.
- **If absent or refused:** the lobby screen says it is unavailable; joining by code works as today.
- **Security:** listings never carry the table code or the table server's internal ids; text is
  escaped by the game; rate limited.
- **Status:** proposed.

### I14. Screening and a ticket to join

- **Direction:** browser → service (ask), service → browser (ticket), browser → table server
  (join with the ticket).
- **Purpose:** the owner's screening, applied before the DM is asked.
- **Data:**
  - Screening rules (set in I7): `{ levelMin?, levelMax?, grades?: [ "official" | "unofficial" |
    "self-reported" ], newMonikers?: boolean }`. Compatibility is checked later by the table
    server, which has the table's content (portable-characters `compat`).
  - `POST /v1/lobby/{aid}/ask` with `{ cid }` (signed in) → `{ ok: true, ticket }` or `{ ok: false,
    rule }` (the rule that refused, in plain words).
  - Ticket: `{ v: 1, aid, mid, cid, aud: sid, exp, kid, sig }`, valid 10 minutes, one use.
  - Game, a new table-server message: `{t:"join", ticket}`, beside today's `{t:"join", code}`.
- **Owner of the definition:** service (rules, ticket); game (the join message, the waiting and
  refusal screens).
- **If absent or refused:** a player can still join by a code the DM gives them.
- **Security:** the waiting and refusal messages, and the DM's note, go from the table server to
  the player as today; they do not pass through the service.
- **Status:** proposed.

### I15. Anonymous play statistics

- **Direction:** official table server → service. (It hosts unofficial tables too; any table on
  it may report, since a report names no one.)
- **Purpose:** honest length estimates (owner: from the outset, non-attributable, completely
  transparent, a switch with no penalty).
- **Data:** `POST /v1/stats` with exactly `{ v: 1, hour: "YYYY-MM-DDTHH:00Z" (start, rounded down
  to the hour), minutes (exact), kind: "one-shot" | "campaign" | "none", sessionNo bucket ("1",
  "2-5", "6+"), encounters, monstersPerEncounter: [ counts, each capped at "10+" ], monsterTypes:
  { aberration: n, beast: n, ... } (SRD creature types only), partySize, levelBand: "1-4" | "5-10"
  | "11-16" | "17-20", grid: "hex" | "square", dmBand?: "new" | "low" | "mid" | "high" (phase 5),
  game: version }`. No `aid`, `cid`, `mid`, table code, map name or monster id.
- **Owner of the definition:** jointly; the service publishes the format and the game shows the
  exact report before it is sent (the owner's transparency).
- **If absent or refused:** the report is dropped, not queued beyond a day. Nothing else changes.
- **Security:** the service stores the body and the hour received, never the sender's address;
  publishes only aggregates of at least 20 reports per cell; drops implausible reports. Whose switch
  decides is FOUNDING Q16 (default: the DM's on, and no seated player's off).
- **Status:** proposed.

### I16. Connection and step-away events

- **Direction:** official table server → service, for official adventures only.
- **Purpose:** fair reliability (owner, #246: "the connection dropped" is not "the player quit").
- **Data:** `POST /v1/adventures/{aid}/presence` with `{ events: [ { mid, kind: "dropped" | "back" |
  "step-away" | "returned" | "stand-in-on" | "stand-in-off", minute: "YYYY-MM-DDTHH:MMZ" } ] }`
  (at most 100 per request).
- **Owner of the definition:** game (what the table server can observe); service (what it keeps,
  FOUNDING data inventory: 90 days).
- **If absent or refused:** dropped after a day; reliability is then made from I12 alone.
- **Security:** no round-trip times, no addresses, no device data; only seated monikers.
- **Status:** proposed.

### I17. Figures and the board

- **Direction:** browser → service.
- **Purpose:** show reputation and reliability, as a player and as a DM, and the board.
- **Data:** `GET /v1/monikers/{handle}/figures` → `{ player: { reputation, reliability, counts },
  dm: { reputation, reliability, counts }, asOf: date, underReview: boolean }` or `{ shown: false
  }`. `GET /v1/board?role=player|dm&page=` → handles with their figures and counts (at most 50 a
  page).
- **Owner of the definition:** service.
- **If absent or refused:** the game shows nothing in place of a figure, never a guess.
- **Security:** visibility per FOUNDING Q9; rate limited against scraping.
- **Status:** proposed.

### I18. AI stand-in profile

- **Direction:** official table server → service.
- **Purpose:** the owner's stand-in "engagement score that can correspond to a player's".
- **Data:** `POST /v1/standins` with `{ aid, cid, mid, why: "step-away" | "left" }` → `{ profile: {
  imagination, tactics, aggression, compassion, effectiveness } (each 0 to 4) }` or `{ profile: null
  }` when the player has none or has not consented.
- **Owner of the definition:** service (the profile); game (the AI that plays, through `apply()`).
- **If absent or refused:** the stand-in plays with a neutral profile, or the step-away rule of #246
  applies without a stand-in.
- **Security:** facets are personal data of the most sensitive kind here (FOUNDING section 6); the
  profile is not stored at the table and not shown to other players.
- **Status:** proposed (phase 6).

### I19. A player's own data

- **Direction:** browser → service.
- **Purpose:** see, contest, correct, delete, and change switches.
- **Data:** `GET /v1/me` → everything kept about the moniker; `GET /v1/me/export` → the same as a
  file; `POST /v1/me/contests` with `{ about: { aid?, kind }, text (≤ 500) }`; `PATCH /v1/me` with `{
  handle?, consents? }`; `DELETE /v1/me` (confirmed twice).
- **Owner of the definition:** service.
- **If absent or refused:** the game links to the service's own page.
- **Security:** only the signed-in moniker; deletion is final after 14 days' grace.
- **Status:** proposed.

### I20. Report abuse

- **Direction:** browser → service.
- **Purpose:** take-down of handles, listings and notes.
- **Data:** `POST /v1/reports` with `{ subject: { handle? | aid? }, reason: "impersonation" |
  "real-name" | "harassment" | "cheating" | "other", text (≤ 500) }` → `{ ok }`.
- **Owner of the definition:** service.
- **If absent or refused:** the game shows where else to report (the service's page).
- **Security:** the reporter is never shown to the reported; rate limited.
- **Status:** proposed.

## Versioning

- **The document has a version** (`0.1` now). A minor version adds points or optional fields; a
  major version removes or changes something. Each change is a line in a change list at the end.
- **The path carries the major version** (`/v1/`). The service runs a new major beside the old one
  for at least 90 days, and longer while the game's released versions still call the old one.
- **Receivers ignore unknown optional fields** in requests and answers. Senders never rely on a
  field the other side has not marked `agreed`.
- **Signed shapes are closed.** A receipt, an assertion, a ticket and a statistics report have
  their own `v`; a new field means a new `v`, and checkers accept every `v` they know and refuse
  others. A receipt once issued stays valid forever under its `v`.
- **Discovery, not guessing.** The game reads `features` and `interface` from I1 and switches on
  only what the service says it has.

## Keeping compatibility while both sides change

- The service is deployed independently of the game; neither may need the other to deploy first.
  Service changes that the game will use are deployed first and switched on through `features`.
- Each agreed point has **example messages** (request and answer, valid and refused) kept with this
  file once agreed (`docs/service/examples/`, to be added by the first pull request that moves a
  point to `agreed`). Both sides test against them: the game with a fake service, the service with
  a fake table server.
- A breaking change starts as an interface request (`WORKING-TOGETHER.md`) and is never merged on
  one side before the other has agreed.

## What the game must change to call it

| Game file or job | Change | For |
|---|---|---|
| `packages/rules/src/` (a data file) | The root public key and its `kid` | I1 |
| `packages/rules/src/lineage.js` (P1) | Canonical JSON and block hashes as the shared definition; the "official" grade from receipts; checking receipts and the key list | I1, I6, I9 |
| `packages/rules/src/characterfile.js` (P2) | A `receipts` list in the file; fork marks with `parent` and `atN` | I9, I11 |
| `packages/server/src/service.js` (new) | The service client: request signing, the queue for I9, I10, I12, I16, the key cache | I1, I5 to I12, I15, I16, I18 |
| `packages/server/src/identity.js` (P3) | The table server's own key (P3) and the service credential beside it | I5 |
| `packages/server/src/index.js` | `SERVICE_URL`, `SERVICE_KEY_FILE`; the page's `connect-src` widened to the service's address (today it allows only the game's own origin) | I3, I13 |
| `packages/server/src/tables.js` | Messages `nonce`, `moniker`, `join` with a ticket; hooks at admit (P5), seal (P3), send-off (P9), close; presence events (#246) | I3, I6 to I12, I14, I16 |
| `packages/server/README.md` | The new messages and settings | all |
| `packages/client/transport.js` | Pass the new messages; keep the moniker's handle (never the assertion) for the screen; a small service client for I1, I4, I13, I14, I17 | I3, I13, I14 |
| P5 (the offer) | Call I6 before the DM's review at an official adventure | I6 |
| P6 (My characters) | Show registration and forks; "Sign in" | I2, I3, I11 |
| P7 (the meter) | An "official" grade, worded "recorded officially", never "verified" alone | I6, I9 |
| P8 (join and review) | The official check in the review; join from the lobby with a ticket | I6, I8, I14 |
| P4 (`admit`) and P9 (send-off) | The calls that record seats and the send-off | I8, I10 |
| The statistics report screen (new) | Shows exactly what I15 will send, and the switch | I15 |

## What must never cross

- **Hidden information**: the map, hidden creatures, monster numbers, secret doors, the DM's notes,
  the chronicle, handouts, anything `view.js` keeps from a player.
- **Dice**: the seed, the dice stream, any roll before it is made.
- **Game state** of any kind, and **character sheets** (only hashes and the small public summary).
- **Real names**, e-mail addresses (unless the owner decides otherwise), and players' **network
  addresses** (the table server never forwards them).
- **Session tokens, join codes, assertions after use**, the table server's private keys.
- **Free text** beyond the bounded fields named above (titles, contest and report text); never
  chat, `say` lines or notes.

## Change list

- 0.1 (14 November 2026): first draft, every point proposed.
