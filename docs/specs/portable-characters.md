# Spec: characters that travel between games

Status: draft by an agent, to be reviewed by the design owner. Issue #237, part A
(the owner's request of 13 November), amended by #278 to agree with the owner's
decisions for online play recorded in #244 (the official server, monikers,
reputation, the lobby, admission, forks and the hash). Nothing here is built.
No code is written by this spec. Decision 8 is the online layer; it is not
scheduled and the first seven decisions are built without it.

The owner asked for four things:

1. On the start screen, an option to create a character that can be moved
   between games.
2. **Integrity through history.** The character carries a record of how it came
   to be: created at level 12 shows as such, grown from level 1 shows as such,
   with a level meter that shows where the character is and where it started.
3. When players join, the DM chooses: allow people's own characters, or require
   new ones.
4. If own characters are allowed, an analysis of incompatibility with the
   table's rule set, shown to the DM and the player before the character is let
   in.

This spec says where such a character lives, what its history can and cannot
prove, what the history records, what leaves a table with the character, how
the compatibility report works, how privacy is kept, what the level meter shows
and how it all fits the build screen, the importer and `setSheet`. Decision 8
adds what the official server changes. It ends with the jobs in build order, the
review points for security and hidden information, and the questions for the
owner.

It is written in the style of `table-ui.md`: each decision gives the question,
the options, the choice, the reason and the cost.

## Rules that bind this design

Stated once; every decision below obeys them (`CLAUDE.md`, `AGENTS.md`).

- **Everything goes through `apply()`.** Admitting a character, levelling it and
  handing out loot are actions. What this spec adds outside the engine is
  *bookkeeping about* what `apply()` did (a record, a signature), never a state
  change that skips `apply()`.
- **The server is authoritative and a client can forge anything it holds.** A
  file on a player's device is held by the player. Whatever is in it, the player
  can change. This spec never treats a file as proof; it treats a signature
  made by a server, checked against a key someone chose to trust, as evidence of
  exactly one thing (Decision 2).
- **The rules package is pure.** No clock, no network, no `Math.random`. The
  record's bookkeeping uses the Web Crypto API (`globalThis.crypto.subtle`),
  which exists in the browser and in Node 22 and does no I/O; signing keys and
  the date come from the server that calls it, never from the package.
- **A rejected action changes nothing.** A character file that fails any check
  is refused whole; nothing of it enters the table.
- **The engine never pretends.** What the table cannot play from a character
  (an item it lacks, a feature it cannot run) is told to the DM and the player
  plainly, and the character is never quietly changed.
- **Players are sent only what their characters can see.** The history is
  private to its owner and the DM (Decision 6, and the hidden-information
  review below).
- **Content is data; only SRD 5.2.1 content is in the repo.** A character file
  names content by id. It never carries rules text copied from a book.
- **No personal data beyond a name the player chose.** The repo and the public
  server are public (Decision 7). The only names that travel are the
  character's name and a **moniker**, a handle the person chose, never a real
  name (Decision 8).
- **Plain JavaScript, no dependencies, no bundler.** Ed25519 and SHA-256 come
  from Web Crypto, not from a library.
- **Phones are first-class.** Every screen below works at 390 x 844 with touch.

## Where we are

What exists today, with the file and function so a builder can check. "No"
means a search of `packages/` found nothing.

| Feature | Exists today | Does not exist |
|---|---|---|
| **A character** | A sheet (`derive.js`, `SHEET_FIELDS`: name, class or `classes`, level, abilities, skills, choices, armour, weapons, spells, tools, gear, look, feats, items, attuning) of choices only. `validate(sheet)` returns plain-words problems and refuses a sheet over 20,000 characters; `derive(sheet)` makes the record the engine plays; `lintRecord` checks that record. The creature keeps its sheet as `e.sheet` and its Experience Points as `e.xp` (`makeEntity` in `engine/sheets.js`). | A sheet has no field for history, an owner, notes or a creation date, and `validate` rejects any field it does not list. |
| **Making and changing one** | `setSheet`, `levelUp`, `addCharacter`, `editCharacter`, `give` (`engine/characters.js`) are all **DM only**. `levelUp` takes a whole new sheet and checks it is one level more (one class level, or level 1 in a new class at the end). `remake` (`engine/sheets.js`) makes the creature again from a new sheet, keeping damage, conditions, spent slots and uses. | A way for a player to make or change a character at a table. |
| **XP and loot** | `xp` on a party `pc`; `levelForXp` and `xpFor` from `content/srd52/advancement.js`; at the end of a fight `concludeFight` and `publish` (`rewards.js`) add shares and loot, and send events `xp`, `levelReady`, `gear`. `levelReady` only says a threshold was crossed; the DM still sends `levelUp`. | Anything that remembers where XP or an item came from after the event scrolled by. The timeline is capped (`capTimeline`, 5,000 entries other than chronicle entries). |
| **Who plays what** | `claim` (`engine/dm.js`): a player may take one unowned `pc`, and only one. `release` gives it back. Members are `{ id, token, name, role, approved }` (`tables.js`); there are no accounts, a player is a name and a session token. | A durable identity for a player or a character across tables. |
| **Joining** | `join` makes a pending member; the DM sees `pending` in the `lobby` message and answers `approve`; a pending member is sent nothing of the game (`sendFull` runs only when approved). Frames are at most `MAX_ACTION_BYTES + 4096` (about 8 KB) until the connection is the DM's (`FRAME_MAX`, `index.js`). | Any way to bring a character into the join. |
| **Importing** | `importFgxml(text)` returns `{ character, report }`: a sheet and a report with `adjustments` (`{ what, from, to, why }`), lists of what was not mapped, and stand-ins (a non-SRD subclass becomes the SRD one, "its features are NOT this character's"). It keeps no description text. The client (`importfg.js`) shows the report, then sends `setSheet`; the report goes into the DM's chronicle. | The importer's output is not marked as imported anywhere on the character. |
| **Building** | `buildsheet.js` (`initBuild`) collects a sheet from class and level and sends `setSheet` or `levelUp` through `act`. Solo play runs the engine in the tab (`localTransport` in `transport.js`) with the player as DM, saving the game in `localStorage` under `hextable.solo`. | A build screen that is not attached to a game. |
| **Rules a table sets** | `state.settings`, changed by the DM's `setting` action and validated against `SETTINGS` (`engine/dm.js`): `sight`, `autoEngage`, `passiveFind`, `vertical`, `climbing`, `cover`, `creatureCover`, `engageRange`, `unseenTurns`, `diceThrow`, `pace`, `conclusion`, `xpShare`. A player is sent all of them. | Any setting about characters. |
| **Content versions** | `pack` in `content/srd52/pack.js` has `id`, `name`, `version` (1), `license`, `attribution`. `PACKS` in `content/index.js` is one pack. | Nothing records which pack versions a sheet was made under. |
| **What a player is sent** | `playerView` (`view.js`) sends each party-side creature whole, `sheet` and `xp` included, to every player; the events `xp`, `levelReady`, `std` (the level reached) go to players as they are (`AS_IS`); `gear` goes for creatures that are theirs; `chronicle` only when `public`. | Any private per-character data. A new field on a creature would reach every player. |
| **Undo** | `history.js` (`createHistory`, `mark`, pins): the DM's last 30 steps, rewind to the start of a fight or rest. It restores state and dice exactly. | A way to tell a record kept outside the state that its entries were undone. |
| **Server storage** | One JSON file per table in `DATA_DIR` (`index.js`, `file(code)`), plus `<CODE>.undo.json`. Dice come from a key the server makes (`rekey` in `tables.js`). | A server identity. The server has no key it could sign with, and nothing in the table's file says which server wrote it. |

## What the owner has settled, and what remains open

Settled by the issue: the start screen offers a portable character; the record
shows how the character came to be; the DM chooses own or new characters; there
is a compatibility analysis shown to both sides before admission.

Settled by the owner's decisions of 13 and 14 November (#244, #237, #278), which
win over anything older in this file:

- **One official server**, the project's own, built into the game. It alone
  makes things **official** (reputation, validation of characters and
  histories). It is not required to play, host or hold characters. No other
  service can grant the designation; other servers may sign histories, and those
  count as unofficial (Decisions 2, 4 and 8).
- **Monikers**: everyone who uses the official server registers a unique moniker.
  A history names the DM of each table by moniker, always (Decisions 3 and 8).
- **The official server stores a hash, not the character.** Players keep their
  files on their own device; server-side backups may later be a paid upgrade
  (Decisions 1, 4 and 8).
- **A character's level meter and history grade are visible to everyone,
  including in the lobby before joining** (Decision 6).
- **Admission is a step of setting up the adventure**; the DM sets the
  adventure's level; a higher-level character is forked (Decisions 5 and 8).
- **Every character has a unique id and every fork is a unique character**
  (Decision 8).
- **Reputation belongs to the moniker and grows only from play recorded on the
  official server**; anonymous play statistics are a separate switch with no
  penalty for opting out (Decision 8).
- **Dates**: a character's history shows the date only (Decision 3).

Open and decided here: where the character lives, what "history" can mean,
what is recorded, what leaves, how differences are handled, how the meter reads.
Questions that only the owner can answer are at the end, each with a default.

## The eight decisions

### Decision 1: a portable character is a file, kept on the player's device

**Question.** Where does a character that moves between games live: on the
player's device, in a file, or on the server?

**Options.**

- A. **On the server.** The server keeps the character per player. Needs
  accounts, which do not exist (a player is a name and a session token that is
  forgotten when they leave), and a server that holds personal data about
  people. A character would also be tied to one server, which defeats moving
  between games on different servers.
- B. **On the device only** (browser storage). Easy, private, and lost when the
  browser clears its storage or the player changes phone. Cannot be given to a
  friend or opened on a second device.
- C. **A file the player holds, with a copy kept on the device.** The file is
  the character. The device keeps a convenient list ("My characters") in
  browser storage, with Export and Import buttons. A table gets a copy only
  while the character sits there.

**Choice: C.** The unit that travels is a **character file**: JSON, a name
ending `.hextable-character.json`, at most 96 KB, with this shape:

```js
{
  format: 'hextable-character', v: 1,
  cid: 'w3Kq...',                 // 16 random bytes, base64url, made when the character is first created; names the character, not a person
  sheet: { ... },                 // exactly what setSheet takes; validate() must pass
  born: { level: 12, how: 'built' | 'imported-fgxml' | 'typed' | 'pregen' | 'table', by: 'self' | 'table' },
  blocks: [ ... ],                // signed records from servers (Decision 3); empty for a character that has never sat at a table
  edits: [ { at: 'YYYY-MM-DD', fields: ['abilities', 'spells'] } ],   // changes made outside play, by the player: self-reported (Decision 3)
  keys: { '<keyId>': '<public key, base64>' },   // the public keys of the servers that signed blocks
  needs: { packs: [{ id: 'srd52', version: 1 }], homebrew: [{ id, pack, hash }] },   // what the sheet names beyond the SRD, for the report (Decision 5)
  parked: [ { kind: 'spell', id, name } ]        // things a table could not take and left aside (Decision 5)
}
```

Nothing in the file is a secret, and nothing in it names a person beyond
monikers (Decisions 7 and 8). **The file never carries homebrew content**: it
lists homebrew ids and hashes in `needs.homebrew` so a table can say what it
lacks, but the entries themselves are never taken from a file (`homebrew.md`,
Decision 4). A character's own `cid` is its unique id (Decision 8).
The sheet stays exactly the shape `validate` knows: the history travels beside
the sheet, not inside it, so `SHEET_FIELDS` and `validate` do not change.

**Where each part is made.** The player's device makes `cid`, `sheet`, `born`
(with `by: 'self'`) and `edits`. A server makes `blocks` and `keys`. The device
never makes a block, because it holds no key a table would trust. The official
server keeps, for each `cid`, only the hash of the latest officially recorded
head and a small public summary (Decision 8); the file stays with the player.

**Reasons.** No account system is needed; the character is not tied to a
server; the player can back it up, move it between devices and hand it to a
friend. It is the same idea as the table export the DM already has
(`export` in `tables.js`).

**Cost.** Lost files are lost characters; the device copy is the only backup
until the player exports. The hash on the official server cannot restore a lost
file; server-side backups are a possible paid upgrade, not part of this spec. A copy can be made, so a character can be in two
places at once (Decision 2 says what that does to the record). The device
list lives in `localStorage` next to `hextable.solo` and shares its roughly
5 MB; the list holds at most 20 characters and the screen says so when full.

**Touches.** New client module `mycharacters.js` and the lobby in
`index.html`; `transport.js` gets one new storage key (`hextable.characters`)
and nothing else; `buildsheet.js` gains a mode with no game attached
(Decision 6).

### Decision 2: what a history can prove, and what it only claims

This is the decision the rest rests on. The honest position first.

**What the server can do.** The table server runs every action through
`apply()` with the sender's role (`act` in `tables.js`), so what a *server*
records of its own table is a record of what its engine did. It is as trustworthy
as the person who runs it. A player on their own device can forge any file
they hold. A DM is, at a small table, the authority: the DM sends `setSheet`
and `levelUp` and can make any character any level.

**Four grades of evidence, and no more.** Every part of a character's history
falls into exactly one grade, and the display names the grade:

| Grade | What it is | What it proves | What it does not prove |
|---|---|---|---|
| **Official** | A block signed by the project's own key, whose public half is built into the game, for play recorded on the official server (Decision 8) | That the official server wrote it, nobody changed it, and (through the stored hash) that this file leads to the latest officially recorded state | That the DM did not hand the levels out, that the play was fair. Official means *recorded and validated by the project*, not *honest* |
| **Signed here** | A block signed by *this* server's key, for a character this server's table held, where this server is not the official one. Unofficial | That this server wrote it and nobody changed it since (the signature covers a chain of hashes) | That the play was fair, that the DM did not hand the levels out (the record says which levels were XP-backed and which the DM granted), that the players were real |
| **Signed elsewhere** | A block signed by another unofficial server's key. The signature is checked. Whether anyone **vouches for that key** is a separate question, answered per table by the DM (Decision 4). A key a DM trusts never makes a block **official**. | That the holder of that key wrote it and it is unchanged | Everything above, and in addition that the key belongs to an honest server. **A key nobody has vouched for gives no more weight than no signature at all**, because anyone can make a key and sign any history they like |
| **Self-reported** | Anything without a signature: a file made on a device, edits made outside play, the whole of a character that never sat at a table, and anything after the last block | Nothing. It is the player's claim | |

A second, different server **can verify** a first server's blocks: the
signatures, the order, and that the sheet in the file is the one the last block
sealed. It **cannot verify** that the first server's play was honest, and it
cannot find out about a block the file leaves out.

**What a forger can still do, and the display must not hide it.**

- **Roll back.** Delete the last blocks of a chain and present the earlier
  head, to hide an event (a curse, a death, a lost item). Nothing in the file
  shows a block is missing. Only the server that sealed the later block can
  tell, and only if it sees the file again (Decision 4, fork check).
- **Copy.** A file can be copied, so one character can be at two tables and
  continue two chains. Playing at two tables with a copy is not cheating in
  itself; the record shows a fork where a server can see one, and says nothing
  otherwise.
- **Run a server for the purpose.** Anyone can host a table, make their
  character level 20 in two actions and have the server sign it. The block
  would say `granted` (the DM gave the levels, no XP) and the table would be
  unknown to anyone receiving it. That is as strong as the evidence is, and it
  is why unknown signers weigh nothing.
- **Share a file.** A file is not bound to a person. Binding it to a device
  key would stop a leaked file being used by someone else, but protects
  nothing a table cares about, so it is not built.

**Therefore the claim this feature makes is narrow.** A signed history shows
*what a server wrote down, in what order, and that it has not been altered
since*. Where the signing server is the official one, or one the receiving DM
has chosen to trust, that is good evidence that the character came by its levels
at tables run by people the receiving DM trusts. It is a label that helps a DM decide. It is not an
anti-cheat and the interface never says "verified" without saying by whom.

**Checks the receiver can add without trust.** A *consistency check* runs on
any chain, signed or not (`verifyChain`, Decision 3): every sheet a block seals
passes `validate`; levels go up one at a time in the way `levelUp` allows; the
XP at each level is at or above `xpFor(level)` where the block says the basis
was XP; hashes link. A consistent chain is not proved honest, but an
inconsistent one is certainly wrong, and the report says "inconsistent" and
refuses the file when a signature fails. A failed signature or a broken link is
**broken**; it is never shown as merely self-reported.

**Cost.** The honest wording costs the feature its easy "verified" badge. The
benefit is that no player or DM is misled into trusting what a stranger's
server said. The wording is part of the acceptance test of the meter task.

### Decision 3: what the history records, and how it is kept

**Question.** What goes in the record, who makes it, and where does it live,
given that the engine is pure, the state is replayable, and a new field on a
creature would be sent to every player (`playerView` clones party creatures
whole)?

**Options.**

- A. Put a `lineage` list on each creature in the state, written by the
  handlers. Replayable and undoable with the game, but it needs a state version
  bump and a migration (`VERSION` is 20 in `migrate.js`), it travels in every
  player's view unless `view.js` strips it, and it would put signing in or near
  the engine.
- B. **Keep the record outside the state, on the server, made from what
  `apply()` returned.** After each successful action the server calls a pure
  function with the character before and after and the events; it appends
  entries to a list kept in the table's record (beside `state`, not in it) and
  signs blocks when asked. The state, its version, `view.js` and the undo
  history are not touched.

**Choice: B.** The record is `table.chars[entityId] = { cid, entries, blocks }`
in the table's saved JSON (the object `tables.js` already saves). It is not in
`state`, so it is not in a player's view, not in the DM's export of the table,
not in the undo history and needs no state migration. Players are never sent
another character's record, and a player is sent only their own, on request
(Decision 6).

**What is recorded.** A closed list of entry kinds. Every field is a number, an
id from the pack, a day (a date only, never a time), a moniker, or one of a few words; **no free text from a player or
a DM is ever copied in**, which keeps names, jokes and plot out of the file.

| Kind | When | Fields |
|---|---|---|
| `born` | The character first exists: built on the start screen (made by the device, self-reported), made at a table by `setSheet` without an `actor`, imported (Fantasy Grounds now, Roll20 later: Decision 8) or a ready-made hero | `level`, `how`, `by`: `self` or `table`. For an import or a ready-made hero this is the one self-reported line that says how the character arrived |
| `joined` | A table admits the file (Decision 5) | `level`, `xp`, `fork`: set when this admission was a fork (Decision 8), `from`: the verdict the table gave the incoming history (`none`, `unsigned`, `broken`, `official`, `signed-here`, `signed-trusted`, `signed-unknown`), `adjusted`: the number of stand-ins the DM chose |
| `levelUp` | `levelUp` succeeds (the engine pushes the `std` event "reached level N") | `from`, `to`, `class`, `xp` at that moment, `basis`: `xp` when the character's XP was at or above `xpFor(to)`, else `dm` (the DM raised the level without the XP) |
| `reset` | `setSheet` with an `actor` changes the level by more than one, or changes class | `from`, `to`, `basis: 'dm'` |
| `xp` | A conclusion is published (`xp` events from `publish` in `rewards.js`) | `n` gained, `foes`: how much of it came from foes and how much from the DM's bonus lines (the engine holds both: `xp.base` and `xp.bonus`) |
| `item` | `gear` events for the character: loot from a conclusion, `give`, an item taken back | `item`: a pack id (magic items) or the word `item` for a name-only gear string (the name is not copied), `why`: `loot`, `dm`, `taken` |
| `left` | The character is sent off or leaves (Decision 5) | `level`, `xp`, `kept`: the items it leaves with, `stayed`: those left at the table |
| `revoked` | An undo or rewind took back entries that a signed block had already sealed | `n`: the block |

The "which DM" of the owner's list: **the DM's moniker, always**, not opt-in.
A block names the server (its key), a random per-table id (`tid`, made when the
table is hosted, never the six-character join code, which lets people in), the
day and the DM's moniker (`dm`). A table whose DM has no moniker (a table on an
unofficial server, or a DM who never registered) records `dm: null` and the
meter says "a DM who is not registered"; the name a DM typed when hosting
(`cleanName`) is never copied in, because it is not unique and not chosen as an
identity. A DM's moniker in a character's history is the same moniker that
holds the DM's reputation (Decision 8).

**Outside play.** Anything the player does to the file without a table (the
build screen opens a file and saves a new sheet; Decision 6) adds an entry to
`edits`: the day and the names of the sheet fields that changed, never their
values. Edits are self-reported by definition. Because each signed block seals
`sheetHash`, the SHA-256 of the sheet as a canonical string (keys sorted,
numbers as integers), an edited sheet no longer matches the last block, and the
record says "changed since the last block".

**How blocks are made.** A block is the batch of entries since the previous
block, plus the character's head, plus a signature:

```js
{ cid, n, prev: '<hash of block n-1 or null>', tid, dm: '<moniker>' | null, at: 'YYYY-MM-DD', key: '<keyId>',
  entries: [ ... ], head: { level, xp, sheetHash }, sig: '<Ed25519 over the canonical block without sig>' }
```

`dm` (the DM's moniker or null) sits beside `tid` in the block, and `at` is a
date only. `prev` makes the chain: removing or reordering a block breaks it. A new table
continues the incoming chain, so a character's whole life is one chain with
blocks from several servers. The date and the key come from the server; the
package that builds and checks blocks has neither.

**When a server seals.** Not on every action. It seals when the character is
admitted (`joined`), when it gains a level (so the date and table of each
level are fixed when it happens), at the end of a published conclusion that
changed its XP or items, when it is sent off (`left`), and when the owner or
DM asks for the file. Between seals the entries wait in the table's record.

**Undo.** The DM can undo or rewind (`history.js`). After any undo, redo or
rewind the server checks each tracked character's head against its sealed
blocks (`reconcile`); where an entry the server had sealed no longer matches
the state, it appends a signed `revoked` block rather than deleting anything.
The chain is append-only and the history stays honest. The cost: a player who
already downloaded a file before the undo still holds the unrevoked block. A
later table that sees the file and the revocation (they are on the same
server) can say so; no other can.

**Verification and the meter.** Two pure functions in a new
`packages/rules/src/lineage.js`, both async because Web Crypto is:

```js
verifyChain(file, { trusted, own, official, content }) -> {
  verdict: 'none' | 'broken' | 'self-reported' | 'signed-unknown' | 'signed-trusted' | 'signed-here' | 'official',
  consistent: boolean, problems: [ 'plain words' ],
  born: { level, by }, level, blocks: [ { n, signer: 'here'|'trusted'|'unknown', at, level } ],
  editedSinceLastBlock: boolean, forked: boolean,
  meter: [ /* 20 segments, see below */ ]
}
lineageStep({ before, after, events }) -> [ entries ]      // what apply() just did to this character
```

`trusted` is the set of key ids the table's DM has chosen to trust; `official`
is the project's built-in public key; `own` is this server's key id. The same function runs in the
browser to show a file before it is sent and on the server to decide what the
DM is told; **the server's answer is the one the DM sees**, because a client
can show whatever it likes.

**Cost and what it touches.** One new rules file and its tests; a field in the
table record; hooks in `tables.js` after `apply()`. No state version, no
`view.js` change. The record is not replayable from the state alone: it is
derived from observation. Entries a crash lost between an action and the next
save are lost (the table file is saved on every action, `save(table)`, so the
window is small).

### Decision 4: servers sign; one key is official, and other trust is a table's own choice

**Question.** What does a server need in order to sign, and how does a table
decide whose signatures count?

**Choice.**

- **A key per server.** On first start the server makes an Ed25519 key pair
  with Web Crypto and writes it to `DATA_DIR/server-key.json` with owner-only
  permissions. Its **key id** is the first 16 hex characters of the SHA-256 of
  the public key. `GET /api/server` returns `{ keyId, publicKey, v: 1 }` (no
  secrets, no host name beyond what the request already shows). The private key
  is never in a table's file, an export, an undo file or a log. A server that
  cannot write `DATA_DIR` already refuses to start (`index.js`), so a key is
  always kept with the tables it signs for. If the data directory is lost, the
  key is lost and the server has a new identity: old files still verify, as
  "signed elsewhere" by a key nobody now vouches for. (The official key is
  kept with more care, a matter for the operator notes of Decision 8.)
- **One official key.** The project has a single trusted server, built into
  the game, and its **public** key ships with the game (a public key is not a
  secret; the private key stays on the project's server). Blocks that verify
  against it are **official**. **Nothing grants the designation to anyone
  else**: not an operator's setting, not a DM's tick, not a list. The
  designation rests on the project's signing key, not on the code, because the
  licence (AGPL) lets anyone run a modified server (Decision 8).
- **Who else is trusted, and what that means.** A table trusts itself ("signed
  here": its own server's key) and the official key. A DM may also tick "trust
  this server for this table" in the join review for another server's key (the
  DM sees the key id and the server name the file claims). The list is kept in
  the table's record, not the state, and is never sent to players. A trusted
  key makes a history *signed by a server this table trusts*, never *official*;
  an operator-wide `TRUSTED_KEYS` list is not built (question 12).
- **Fork check.** On the **official** server the check is the stored hash
  (Decision 8): a file whose history does not lead to the recorded fingerprint
  is detected, whether edited, rolled back or an older copy. On an unofficial
  server the check is as before, same server only: it keeps the head hash of
  every `cid` it has sealed, and a file whose chain passes through one of its
  blocks but is not at the head is reported "continued here by another copy",
  neutrally. Whether and how a copy may then play is Decision 8's id rule.

**Reasons.** Signatures that anyone can check without calling the signing
server (offline, in a browser, on a second server) need public-key signatures.
A shared-secret MAC would only let the server check itself.

**Cost.** One more file on disk to protect; a public server whose key
file is not persistent would sign things nobody can later link to the
server (the start-up line prints the key id so an operator notices a change).
Web Crypto's Ed25519 needs a recent browser; where the browser lacks it,
the file is shown with "this device cannot check signatures; the server will"
and the DM's server does the real check. `node:crypto` on the server is the
same primitive.

### Decision 5: the DM chooses, the report is made by the server, and what is changed is written down

#### The choice at the start of a table

A new table setting, validated against `SETTINGS` like the others and sent to
players like the others (it is not a secret that a table takes own characters):

| Setting | Values | Default | Meaning |
|---|---|---|---|
| `characters` | `new`, `own-trusted`, `own` | `new` | `new`: today's behaviour, the DM makes or assigns the characters; offering a file is not shown. `own-trusted`: own characters may be offered, and the DM is told when the history's verdict is not official, signed by this table, or signed by a key it trusts, who may still choose to accept. `own`: own characters may be offered, any history. |
| `level` | none, or 1 to 20 | none | The adventure's character level (Decision 8, "Admission"). With none set, the DM reads the meter and decides. |
| `takeaway` | `everything`, `level-only`, `nothing` | `everything` | What a character leaves with (below). |

Settings are chosen by the DM in the table settings (`tablecontrols.js`) and
absent means the default, so no state version bump is needed, as for
`conclusion` and `xpShare` (table-ui E9). The setting `characters` is a *policy
for the review*; it does not make the server accept anything the review would
refuse.

#### The flow

How characters arrive is a step of setting up the adventure (Decision 8,
"Admission"); `characters` above is the simple form of it for a table that does
not use the adventure setup. The flow below is the route "supplied by a player
and approved by the DM".

1. On the lobby, with a table code typed, a player can choose "Join with a
   character from this device" or "Join and build one at the table" (today's
   path). The first picks from My characters or a file.
2. `join` is unchanged. After it, a pending member may send one new message
   `offer { character }` (at most 96 KB; one per ten seconds; at most three
   kept). The connection's frame limit is raised for a player at a table whose
   `characters` is not `new` (`FRAME_MAX` in `index.js` is about 8 KB until
   now). The server parses it, runs every check below on its own and stores the
   result with the pending member. It never trusts a verdict from the client.
3. The server's checks, in this order, any failure refuses the offer whole
   with a plain sentence:
   - the envelope is well formed and within its limits (a list of keys and
     lengths in `characterFile` in `packages/rules/src/characterfile.js`);
   - `validate(sheet)` passes after the content is looked up *in this table*
     (Decision 5, "What is compared"); a sheet naming content the table lacks is
     not refused: it becomes a difference in the report;
   - `derive(sheet)` and `lintRecord` pass;
   - `verifyChain` gives a verdict, never throwing on a hostile chain (it is
     bounded: at most 400 entries, 100 blocks, 8 distinct keys).
4. The DM sees the pending member in the lobby with one line ("Kerrin, level 12
   Wizard, signed by an unknown server, 3 differences") and a Review button that
   opens the report and the level meter. The offering player sees the part of the
   report that concerns their own file (see "Who sees what").
5. **Accept** sends the engine action `admit` (below) with the report's choices;
   **Decline** drops the offer. Either way the player is told the outcome about
   their own character: **accepted**, **refused** or **accepted with changes**,
   with the compatibility report for their own file, plus an optional short note
   from the DM (80 letters, typed by the DM, shown to that player only). A
   player who is still waiting sees the same report about their own file, so a
   refusal is never the first they hear of a problem.
6. A player already at a table with a character who offers another does not get
   two: `claim` already refuses a second character for a player (`engine/dm.js`).
   Offering again replaces the first offer.

#### The engine action

```js
{ type: 'admit', sheet, user, userName, at?, standIns?: [ ... ] }   // DM only; the server builds it, a player cannot send it
```

It does what `setSheet` without an `actor` does (`validate`, `derive`,
`addCharacter`) and then claims the character for the offering member, so the
player has exactly one. It refuses what `setSheet` and `claim` refuse (twelve
characters at most, no room to stand, a second character for the same player).
The server composes it from the checked offer and calls `apply()` with the
DM's role; the 4 KB cap on actions (`MAX_ACTION_BYTES`) does not apply to a
call the server makes itself, and `validate` already caps a sheet at 20,000
characters. A new handler goes in `engine/characters.js` and joins the table of
handlers there; `engine.js` is not edited. Two actions must not share a name,
and `admit` does not.

#### What is compared

`compat(file, tableView)` in a new `packages/rules/src/compat.js`, pure, run on
the server over the checked file and the table's own content and settings. It
returns a list of differences, each `{ kind, what, detail, can }`, where `can`
is what the DM may do. Each kind below says what is compared and what the DM can
do about it.

| Kind | What is compared | What the DM can do |
|---|---|---|
| **Missing content** | Every id the sheet names (class, subclass, spells, feats, magic items, weapons, armour, tools): is it in this table's content? Homebrew ids (`hb-...`, `homebrew.md`) are looked for among the DM's own packs for this table. **Homebrew is never taken from a file.** A homebrew piece plays only if the DM's own packs already hold an entry with the same id and hash; otherwise the report shows it as "not in this table's rules". | **Refuse** the character. **Accept without it**: the entry is taken off the playing copy and written to `parked` in the file (a name, never stats), and the report says what the character does not have here. **Stand in**: a stand-in rule below. For a homebrew piece the DM can do nothing about it inside the review: a DM who wants it adds it to their own pack outside the review, from what the player gave them outside the app, and the player offers again. |
| **Different version of content** | The `needs.packs` versions (`pack.version` in `content/srd52/pack.js`) against the table's; for homebrew, the `hash` of the entry against the table's entry with the same id. | **Accept** (the table's version plays), or **refuse**. A homebrew entry with the same id and a different hash is flagged separately: it is a different thing with the same name, and the table's entry is the one that plays. |
| **Tier differences** | The sheet's features and items by tier (`auto`, `assist`, `manual`; `derive(sheet).record.feats`, `CONTENT.items[x].tier`). Not a fault, a fact: "of this character's 21 features, 4 need you to apply them by hand." | Accept. Information, never a block on its own. |
| **Table rules** | The table's `settings` against the `rules` snapshot a block records (the settings that touch characters: `conclusion`, `xpShare`, `passiveFind`, `vertical`, `climbing`, `cover`, `creatureCover`; the list is a constant in `compat.js`). The snapshot is a signed claim like the rest: it says which rules the previous table played under. | Accept. Information: "levelled at a table where Experience Points were shared in full; here they are split." |
| **Level range** | The sheet's level and `born.level` against the adventure's `level` setting if the DM set one, else against what the DM sees in the meter. A character above the adventure's level is offered as a **fork** rewound to that level (Decision 8); one below it may be raised at the table and recorded as such (the lead's assumption, awaiting the owner). | Refuse, accept, fork, or raise. |
| **History** | `verifyChain` verdict and the meter (Decision 6): official, signed here, signed by a key this table trusts, signed by an unknown key, self-reported, inconsistent, broken. With `characters: 'own-trusted'` a verdict below "signed by a trusted key" is highlighted and needs the DM's explicit tick. A broken chain is refused whatever the setting says. On the official server a file that does not lead to the stored hash is refused as official and may be offered only as an unofficial character. | Accept (with the tick), refuse. |
| **Sheet rules the engine cannot play** | What `validate` says about *this* engine: a sheet built for a later version, a feature with no engine support at this version. | Refuse; or, with the stand-in rule, the nearest legal sheet. |
| **Imported** | `born.how` is `imported-fgxml` (or a later importer's value, or `pregen`): the DM is told the stand-ins that import made (the count in `born`, not the importer's text). | Accept. |

**Stand-ins, modelled on the Fantasy Grounds importer.** The importer's
`adjustments` (`{ what, from, to, why }`) are the pattern: where a sheet needs a
value to load, the nearest legal one is used and the change is listed with its
reason. For a character arriving from a file the same list is built, shown to
both people, and written to the table's chronicle for the DM (never public) the
way `importfg.js` writes its report, and its count goes into the `joined`
entry. Stand-ins are **never** applied silently, and a stand-in is always
marked in the sheet header ("Subclass is a stand-in; its features are NOT this
character's") as the importer's is. The rules for each kind:

- A missing spell or item: removed from the playing copy (not replaced by a
  different spell), listed in `parked`.
- A missing subclass at level 3 or more, which `validate` cannot do without:
  the SRD subclass of the class, listed as a stand-in, exactly as
  `importFgxml` does.
- A different version of a pack entry: the table's entry is used.
- Anything else `validate` refuses: the DM is told and the character is
  refused; the table does not guess.

The stand-in applies **to the playing copy**. The player's file keeps the
original `sheet` until the character leaves, and `left` writes the sheet that
leaves with what is parked, so a character does not come home having lost a
spell it still has. When a character comes home with a stand-in subclass the
`left` block says so and the player's file marks it, so no table downstream
mistakes the stand-in for the real thing.

#### What changes in play, and what leaves

Inside the table the character is an ordinary party `pc`. Levelling, loot,
XP, equipping and attuning go through the actions that exist (`levelUp`,
`conclusion`, `give`, `equip`, `attune`). Nothing about a portable character
changes how a fight plays.

**What leaves.** The `takeaway` setting decides:

- `everything` (the default, the owner's answer): the sheet as it stands, level
  and items and attunement, and the XP, **with the DM's sign-off at send-off**.
- `level-only`: the sheet with the items it gained at this table taken off
  (the record knows them: `item` entries). They are listed in `stayed` and
  stay on the table's record, not in the file.
- `nothing`: the file leaves with the sheet it arrived with plus the history
  of what happened (`left` with the original sheet), no gains. A table that
  wants a character to be "a guest" says this.

Whatever the setting, **the DM decides at the moment of leaving**. The
send-off screen (Decision 6) lists level, XP and each item gained here with a
tick for each, ticked as the setting says; the DM changes the ticks and
confirms, and the server builds the file from that and seals `left`. The
player sees the result before it is made and may say no to taking it. The DM
cannot take away what the player arrived with: the send-off only removes
things the record says this table gave.

*Who decides the level.* The DM sets the level the adventure starts at (Decision 8);
after that nobody removes a level a character earned at this
table, since a level is not an item; a DM who does not want it counted can mark
the character `nothing`. The meter shows what the record says.

**When a player leaves** (the existing `leave` handler in `tables.js` frees the
character and removes the seat): the player is offered the file first, with
whatever `takeaway` allows, before the character is released. If the player
disconnects without taking it, the table keeps the record until the table is
deleted, and the DM may produce the file for them later (`takeaway` still
applies).

**Cost.** A new action, a new server message pair (`offer`, `offerResult`), a
`compat.js`, the take-away flow. The one real engine change is `admit`.

### Decision 6: the level meter, and the screens

#### The level meter

**Question.** How does a bar show where the character is and where it
started, without a badge that overstates?

The meter is 20 segments, one per level, on a bar. A **notch** under the
segment of the level it was created at (`born.level`); the **current level** is
the last filled segment. Each filled segment has a **kind**, and the kind is
shown by pattern and by words, never by colour alone (colours come from the
theme tokens, `--accent` and friends, and no layout depends on a theme):

| Segment kind | Looks like | Words | Meaning |
|---|---|---|---|
| **Arrived** | Plain fill up to the notch, then the notch | "Created at level 12" or "Started at level 1" | Levels up to `born.level`: the character did not grow through them here; it was made at that level. For a character grown from level 1 the notch sits under 1 and there are no arrived segments to speak of. |
| **Earned, official** | Solid with a small seal mark | "Gained at a table recorded by the official server" | A `levelUp` with `basis: 'xp'` in a block signed by the official key. |
| **Earned, signed here** | Solid | "Gained at this table" | A `levelUp` with `basis: 'xp'` in a block signed by this server, which is not the official one. |
| **Earned, signed by a trusted server** | Solid with a small tick mark | "Gained at a table whose server you trust" | The same, signed by a key in the trusted set. |
| **Earned, signed by an unknown server** | Outlined with a dashed edge | "Signed by a server nobody here knows" | Valid signature, no one vouches: reads like self-reported on purpose. |
| **Granted** | Diagonal hatch | "Given by the DM, no XP" | A `levelUp` or `reset` with `basis: 'dm'`, in any signed block. Counts as the signer's record, flagged. |
| **Self-reported** | Empty box with dotted edge | "The player says so" | Levels the file claims that no signed block covers. |
| **Broken** | The whole bar greyed, a cross | "The record does not add up" | A signature failed or a link is missing. The character is shown, not trusted. |

Above the bar one plain line sums it up, written to be read aloud on a phone:

> Created at level 1. Grown through 3 tables. 9 levels signed by this server,
> 2 by a server you trust, 1 given by the DM. Edited since the last record.

and below it a Details button listing each block: the day, the signer
("this server", "a trusted server, key 3fa9...", "an unknown server, key
91c0..."), the level, the XP basis and whether XP came mostly from the DM's
bonus lines (more than half of a level's XP from bonus lines is called "mostly
awarded by the DM"). Wording lives in one table in `levelmeter.js`, the tests
read it, and no screen says "verified" alone.

**Created at 12 versus grown from 1.** The notch and the first line say it
without a click. A `born` of `by: 'self'` is the player's claim and the line
says so ("The player says it was created at level 12"). A `born` made by a
table (`by: 'table'`: the DM made the character with `setSheet`) is signed by
that table.

**Who sees it.** **Everyone** sees a character's level meter and history grade,
including in the lobby before joining (the owner's decision, replacing the
earlier default of owner and DM only). What everyone sees is the summary: the
meter's figures (level, where it started, the count of levels by kind) and the
grade. The block-by-block **Details** (each day, table and DM) stay with the
owner and the DM until the owner says otherwise (question 6). On the official
server the summary is kept beside the hash so it can be shown while the owner is
offline (Decision 8). The meter is also shown on the start screen's My
characters list with the same words.

#### The start screen

The lobby (`#lobby` in `index.html`) gets a single new button, **"My
characters"**, beside "Play solo". It opens a panel with:

- **New portable character**: opens the build screen with no game attached
  (below). Saving stores the file in `hextable.characters` and offers Export.
- **Import a character file** (`.hextable-character.json`) and **Import from
  Fantasy Grounds** (the same importer and report, `importfg.js`, run with no
  table; the result becomes a character whose `born.how` is `imported-fgxml`
  and whose report is shown now and not kept, because the importer's report may
  hold text from the player's file).
- A list of the characters on this device, each with its name, class, level and
  meter, and Export, Duplicate (a new `cid`: a copy that is a different
  character, so a fork is never a forgery of the same one), Delete.
- With a table code typed in the lobby, **Join with this character**.

#### The build screen without a game

`buildsheet.js` takes `act` and the engine's `getState` from the game it is in.
For a portable character it is given a *local* engine of its own (the same
`localTransport` the solo game uses, with a private storage key so it does not
touch `hextable.solo`): "New portable character" starts one, the player builds
as they would in a game, and Save writes the sheet that `sheet()` already
produces into the file with a fresh `cid` and `born`, `by: 'self'`. Opening an
existing file runs `fromSheet(file.sheet)` (the function that already loads a
sheet into the form), and on Save the names of the changed fields go to `edits`.
The build screen is otherwise unchanged; the engine still checks the sheet
(`validate`) when it is saved, so a portable character can never hold a sheet the
engine would refuse. A level above 1 built here is allowed and shown as
"created at level N, by the player", which is exactly what the owner asked the
meter to make visible.

#### The DM's screens

- **Table settings**: the `characters` and `takeaway` choices, and the list of
  trusted servers for this table.
- **The lobby**: a pending member with an offer shows its summary line and
  Review. Where an adventure states what characters it admits, the lobby applies
  that screening before the DM is asked (Decision 8).
- **The review**: the meter, the verdict in words, then the differences grouped
  by what the DM can do, each with its choice (Refuse, Accept, Stand in) and a
  default; at the bottom Accept and Decline. On a phone the review is one
  column, tick rows at least 44 px, and the choices are text buttons.
- **The send-off**: reached from the sheet's menu and from the player's Leave:
  the ticked list of level, XP and gained items; Confirm; the file is made and
  the player is offered the download.

### Decision 7: privacy

The repo and the public server are public. The rule: **the file carries
nothing about a person beyond the name the player gave the character.**

- Never recorded: the player's table name (`m.name`), a real name of anyone,
  the member id or session token, the join code,
  addresses, device information, chronicle text, notes, handouts, the table's
  map or other characters' names, any free text from a player or DM.
- Recorded: the character's name (it is in the sheet; the player chose it),
  levels, XP totals, pack ids, a date (never a time), a random table id, the DM's
  **moniker** (Decision 3), a server key id, the settings listed in `compat.js`.
  A moniker is a handle chosen for the purpose, never a real name; it is public
  on purpose, because reputation belongs to it (Decision 8).
- The offered file is stored in the table's record only while the table keeps
  it, shown to the DM, and removed when the offer is declined or the member
  leaves. It is not copied into the chronicle; the report's text goes into the
  DM's chronicle (not public) as the importer's does, and is cut at 8,000
  characters.
- The DM's export of a table (`export` in `tables.js`) holds the state. The
  records are not in the state and are not in the export, so exporting a table
  does not hand its players' histories around.
- Test data and examples in the repo use invented names.
- A table's records stay with the table's file until the table is deleted;
  there is no deletion path for a table today, which is a gap this spec does
  not close (listed in the review).

**Who sees what at admission.** A pending member is not yet in the game and
anyone with a code can be one. So the player is shown a report about **their
own file** (what the table cannot take: their entries by name) and the verdict
on their own history, and **not** the table's settings or its homebrew; those
are sent only after approval, as `stateFor` already holds. The DM sees the
whole report.

### Decision 8: the official server and online play

Recorded from the owner's decisions in #244. **Not scheduled.** Nothing in
Decisions 1 to 7 waits for this; it is written so that they do not have to be
redone when it comes. An official server is a service the project operates
(accounts, cost, moderation, take-down, abuse of the reputation board); that
work is named at the end of this decision and is for the owner to schedule.

**What "official" means.** One server, the project's own, built into the game.
It validates characters and their histories and keeps reputation. It is **not
required**: anyone can play and host without it, and such play is simply not
official. No separate service can grant the designation; other servers can sign
histories and those count as unofficial (Decision 4). "Official" rests on the
project's signing key, not on the code (AGPL: anyone may run a modified server).

**Moniker.** Everyone who uses the official server registers a **unique
moniker**, a chosen handle and never a real name. It is the only identity: no
real name, no address, no device data. A person without a moniker still plays
unofficially.

**What the official server stores per character: a hash.** Players keep their
characters on their own phone or PC. For each character id the server keeps the
fingerprint (hash) of the latest officially recorded state of its history and
checks it at each connection. A file presented later is official only if its
history leads to the recorded fingerprint, so an edited file, or an older copy
from before a loss or a death, is detected. New entries are signed and the stored
fingerprint moves forward. It cannot restore a lost file (server-side backups
could be a paid upgrade, outside this spec) and it cannot show a character in the
lobby while its owner is offline. The default is therefore to keep, beside the
hash, a **small public summary**: id, owner's moniker, name, class, level and the
meter's figures. That summary is public by design (it is what the lobby shows),
so it holds nothing else.

**Unique ids and forks.** Every character has a unique id (`cid`), and **every
fork is a unique character**: when a character is forked, one keeps the original
id and the other gets a new one, with the shared ancestry visible in its
history. Proposed rule, awaiting the owner's confirmation: the original keeps its
id and the fork gets the new one. On the official server a character id can be in
one adventure at a time, so playing it in a second adventure means forking it
first. If two diverged histories with the same id ever reach the official server
(played off the record in two places), the first one seen keeps the id and the
other is registered as a fork. This replaces the earlier "one copy at two tables:
allowed" default for official play; unofficial servers still only flag neutrally
(Decision 4). The "Duplicate" button on the start screen already makes a new id.

**Admission to an adventure.** How characters arrive is a step of setting up the
adventure, and **every character is new to that adventure**. The DM switches on
the routes: **built at the table**; **from the DM's stable** (characters the DM
keeps); **supplied by a player and approved by the DM** (the flow of Decision 5);
**nominated by a player** (the player proposes one the DM holds or may make).
The DM sets the adventure's character level. A character above it can be
**forked**: a duplicate rewound to that level with later history stripped,
marked as a fork. A lower-level one may be raised at the table, recorded as such
(the lead's assumption, unconfirmed). What leaves with a character is everything,
with the DM's sign-off at send-off (Decision 5). An adventure also states what
characters it admits; the first screening item is the character (level,
compatibility, history grade) and **the lobby applies it before the DM is
asked**. Stretch: the DM can **suspend** things a character brings (an item that
would undo the adventure) for the length of the adventure; items first, spells
and features later.

**The lobby.** It lists games with information such as one-shot or campaign,
estimated length and reputation for completing adventures. A character's level
meter and history grade are visible to everyone there, before joining.

**Reputation and reliability.** A **reputation board** (reputation, not power) for
a community that generates its own interest. **Reputation belongs to the player
(the moniker), not to a character**; a player may have many characters. It grows
**only from play recorded on the official server**, so it is attributable by
nature. **Reliability is its own stat**, separate from reputation: for example how
often a player finishes the estimated play time of the adventures they join, so
that someone who constantly drops out is visible. **DMs have reputation too**: a
moniker has a DM reputation and a DM reliability beside its player ones.

**Play statistics.** Statistics on how long play takes are collected from the
outset, for regression against things like DM reputation, monsters per
encounter, number of encounters and types of monsters, with the aim of honest
estimated lengths in the lobby. They are **non-attributable**, **completely
transparent** (anyone can see exactly what is reported) and carry a **separate
switch with no penalty for opting out** (reputation never depends on it). Two
streams: the anonymous statistics carry a reputation *band*, not a moniker, so no
table or person can be picked out; reputation records are attributable and are a
separate thing. They use UTC timestamps; the proposed default is exact durations
but start times rounded to the hour, and coarse buckets reported only above a
minimum number of games, so a small table is not identifying.

**Dates.** A character's history shows the date only (Decision 3). The anonymous
statistics use UTC timestamps, rounded as above.

**AI stand-ins and companions (recorded, not specified here).** An AI takes over
the character of a player who bails out, with an **engagement score** that can
correspond to a player's, possibly in facets (imagination, tactics, aggression,
compassion, effectiveness). Stepping away mid-fight (pushing down the order, a
"need a break" button, an AI stand-in for the gap) is recorded on #246, the
connection status indicator on #246 as well. Companions (familiars, pets, mounts,
summons) are a player controlling more than one creature, attached to a
character; they need their own spec (listed in the index). A wanted importer is
Roll20 (no official file export exists; it would read a third-party extension's
export and needs a sample). A ready-made hero or an imported character becomes a
travelling character whose history starts with one self-reported line saying how
it arrived (`born`, Decision 3).

**Points the eventual build must face.**

- **A service the project runs:** accounts, cost, moderation, take-down, and
  abuse of the reputation board.
- **Scores about how a person plays are personal data:** consent, visibility,
  deletion and European privacy law apply. A player must be able to **see,
  contest and remove their own** scores; the engagement score and the
  reputation and reliability stats are designed to that. Consent for the
  anonymous statistics must be freely given, which is why opting out has no
  penalty.
- **The designation rests on the project's signing key.** Its loss or leak is the
  operator's emergency (a new key; old official files then read as unknown until
  re-signed), stated in the operator notes.
- **Public summary and the lobby are public.** Nothing in the summary may be
  something a player would not want a stranger to see.

**Cost.** A server the project runs, a registry of monikers, the hash and summary
store, the reputation and statistics stores, and the privacy work. None of it
touches `apply()`: it is bookkeeping about what the engine did, like the record
of Decision 3.

## What the engine and server must add

One table for the engine and server lanes. "Touches" is the file that changes.

| # | Addition | Kind | Who may send | Touches | State version |
|---|---|---|---|---|---|
| A1 | `lineage.js`: canonical JSON, SHA-256 hashes, `lineageStep`, block building and `verifyChain`, `meter` | pure rules | n/a | `packages/rules/src/lineage.js`, `tests` | no |
| A2 | `characterfile.js`: envelope shape, limits, parse and build | pure rules | n/a | `packages/rules/src/characterfile.js`, `tests` | no |
| A3 | `compat.js`: the differences and the stand-in rules | pure rules | n/a | `packages/rules/src/compat.js`, `tests` | no |
| A4 | Settings `characters`, `takeaway`, `level` | settings | DM (`setting`) | `engine/dm.js` (`SETTINGS`) | no (absent means default) |
| A5 | Action `admit` | action | DM (the server composes it) | `engine/characters.js`, `tests` | no |
| A6 | Server key, `GET /api/server`, the built-in official public key, the DM's per-table trust list | server | n/a | `packages/server/src/identity.js` (new), `index.js` | no |
| A7 | Per-table record `chars`, sealing, `reconcile`, `revoked`, fork check | server | n/a | `tables.js` | no |
| A8 | Messages `offer`, `offerResult`, `take` (the file for the owner or DM), frame limit raised for a player while `characters` is not `new` | server messages | pending member, member, DM | `tables.js`, `index.js`, `packages/server/README.md` | no |
| A9 | `view.js` unchanged. `playerView` sends no `chars`. A test that proves it. | review | n/a | `tests` | no |

Nothing here lets a client send what the engine should compute: the client
sends a file and a choice, and the server computes the report, the verdict and
the block.

## Tasks

Ordered so each stage is useful alone. "Opus" is the strongest model and the
engine lane (these change `tables.js`, `index.js` or the engine); "Sonnet" is a
client or server lane agent; "Haiku" is enough for small, well-specified
content. Each task is one pull request and lists the files it may touch
(`AGENTS.md`). Every one runs `npm test` and `npm run build`; client ones are
checked at 390 x 844 with touch and at 1280 x 800.

| # | Task | Lane | Model | Touches | Done when |
|---|---|---|---|---|---|
| P1 | **Lineage, pure.** A1: canonical JSON (keys sorted, integers only), `sheetHash`, `lineageStep` for `levelUp`, `reset`, `xp`, `item`, `verifyChain` with verdicts, `meter` segments. Ed25519 and SHA-256 through `globalThis.crypto.subtle`. | engine | Opus | `packages/rules/src/lineage.js`, `packages/rules/test/lineage.test.js` | A chain made in the test verifies; changing any byte of an entry, a signature, `prev`, `head` or the sheet gives `broken` (or `editedSinceLastBlock` for the sheet alone); a key nobody trusts gives `signed-unknown` and the same meter weight as `self-reported`; a levelUp whose XP is below `xpFor(to)` has `basis: 'dm'`; a 5,000-entry or deeply nested hostile chain is refused in bounded time and never throws; two runs give identical bytes. |
| P2 | **The file, pure.** A2 and A3: envelope limits and parse, `compat` with the kinds of Decision 5 and the stand-in rules. | engine | Opus | `packages/rules/src/characterfile.js`, `compat.js`, tests | A file with an unknown top-level key, a sheet over 20,000 characters, an `at` that is not a date, or a free-text field is refused; a sheet naming a spell the table lacks gives "missing content, can: refuse / accept without / stand in" and the stand-in removes exactly that spell and lists it in `parked`; a level-3 sheet whose subclass is missing gets the SRD subclass as a marked stand-in; no stand-in is ever silent. |
| P3 | **Server identity and sealing.** A6 and the signing half of A7: `identity.js`, the key file, `GET /api/server`, the built-in official public key (the verdict `official`), a `chars` record per table, seals at `joined`, `levelUp`, conclusions and `left`, `reconcile` and `revoked`, the fork check. | server | Opus | `packages/server/src/identity.js` (new), `index.js`, `tables.js`, `packages/server/README.md`, `packages/server/test/` | A level-up at a table appends an entry and a signed block with the server's key id and the day; undoing it appends a `revoked` block, never deletes; the key is read from `DATA_DIR` across a restart and the start-up line prints the key id; the private key is in no table file, export or undo file (a test greps them); the server refuses to sign when its key could not be written. |
| P4 | **Settings and `admit`.** A4 and A5. | engine | Opus | `engine/dm.js`, `engine/characters.js`, `tests` | `setting characters own` is accepted and refused for a player; `admit` makes a party character, claims it for the member, refuses a second character for the same member, a thirteenth character and a sheet `validate` refuses, and changes nothing when it refuses. |
| P5 | **The offer, server side.** A8 (offer, offerResult, frame limit) and the review result kept with the pending member. | server | Opus | `tables.js`, `index.js`, `packages/server/README.md`, `packages/server/test/` | A pending member's offer is checked by the server and stored; the DM's `lobby` message gets a summary and the report, never a player's; an offer over 96 KB, a second within ten seconds, or one at a table whose `characters` is `new` is refused; accepting sends `admit` and the player has the character; declining says why; a pending member sees only the report about their own file. |
| P6 | **My characters, client.** The start-screen list, New portable character, import and export of files, the build screen without a game, Import from Fantasy Grounds with no table. | client | Sonnet | `packages/client/index.html`, `style.css`, `mycharacters.js` (new), `buildsheet.js`, `importfg.js` (an entry point only), `transport.js` (one storage key), `tests/` | At 390 x 844 a player builds a level 12 character with no game, saves it, exports it, imports it on a second "device" (a cleared storage) and the file is the same; its sheet passes `validate`; the file has `born: { level: 12, by: 'self' }`; opening and re-saving it with a changed spell list adds an `edits` entry that names `spells` and no values. |
| P7 | **The level meter.** The component and its wording table. | client | Sonnet | `packages/client/levelmeter.js` (new), `style.css`, `tests/` | The wording test passes for every verdict and no string contains "verified" without a signer; each segment kind is told apart without colour (patterns tested by their class names and by the words); a created-at-12 file and a grown-from-1 file give different first lines and notches. |
| P8 | **Join with a character and the DM's review.** The lobby choice, the offer, the pending line, the review screen with the report, Accept and Decline, and the table settings. | client | Sonnet | `index.html`, `style.css`, `app.js` (small), `tablecontrols.js`, `reviewchar.js` (new), `transport.js` (message pass-through), `tests/` | A DM and a player in two windows: the player offers a file; the DM sees the summary and the review at both sizes; Accept puts the character in the party owned by that player; Decline tells the player why; the pending player's screen shows no table setting. |
| P9 | **Send-off.** The `take` message, the send-off screen, `takeaway`, the DM's ticks, the player's confirmation, the file and the `left` block; Leave offers it first. | server, client | Opus (server), Sonnet (client) | `tables.js`, `packages/server/README.md`, `sendoff.js` (new), `app.js` (small), `tests/` | A character that gained a level and a magic item at a table leaves with both under `everything`, with the level only under `level-only`, and with neither under `nothing`; the DM's ticks change that; the file verifies back at the same server as "signed here"; a stand-in subclass is marked in the file. |
| P10 | **Stretch: a character in two files.** Detecting that the incoming chain forks a block this server sealed, and showing it. Also the DM's "trust this server" tick and the operator list shown in settings. | server, client | Sonnet | `tables.js`, `reviewchar.js` | A file with a block removed and returned to its sealing server is reported "continued here by another copy"; the trust tick adds the key id to the table's list and the next file from that key reads "signed by a server you trust". |

Decision 8 (the official server, monikers, the hash and summary store, reputation,
the lobby, the adventure setup and forks) has no tasks yet: it needs the owner's
decision to run a service and a spec of its own for the server side. A1 to A9
and P1 to P10 are built so that it can be added later (the `official` verdict,
`dm` and `fork` fields, `cid` uniqueness) without redoing them.

The first four can run in parallel after P1 and P2 are agreed; P5 needs P3 and
P4; P8 needs P5 and P7; P9 needs P3; P6 needs only P1 for the file shape and
can start with a stub.

## Security and hidden-information review points

Each is a thing a reviewer of the pull requests above must check.

1. **A file is untrusted input.** The offer is parsed with bounds before anything
   else: at most 96 KB, 400 entries, 100 blocks, 8 keys, depth under 12, no
   function, no key outside the listed shapes, no string over 200 characters
   outside the sheet. `JSON.parse` of a hostile document throws on deep nesting;
   the server catches it. The hash and the Ed25519 checks use only data the file
   carries.
2. **The server's verdict is the one the DM sees.** A client may compute and
   show its own meter to its owner; the DM's review is built from the server's
   result, and a message from a client claiming a verdict is ignored.
3. **No client sends a block, a key id for this server, or a `joined` entry.**
   Blocks are made only by the server from `apply()`'s result; a file with a
   block claiming *this* server's key id that does not verify is `broken`, not
   "signed here".
4. **The private key never leaves `DATA_DIR/server-key.json`.** Not in a
   table file, an export, the undo file, a log line, an error message or the
   `/api/server` response. Written with mode 0600. A test greps for it.
5. **`playerView` must not carry the record.** (The public summary of
   Decision 8 is not the record: it is served by the official server's lobby,
   holds only the fields listed there, and is never put in `state`.) The record is not in `state`, so
   it is not in `playerView`; a test builds a table with records for three
   characters and asserts that no player's view and no player's event contains
   `cid`, a block, a hash or an `entries` key. A player is sent their own
   record only by the `take` message, to the member who owns the character.
6. **Events carry nothing new to players.** The record is made from events the
   owner was already sent (`xp`, `std`, `gear` for an open creature,
   `levelReady`); `lineageStep` reads state before and after, and a test checks
   that a hidden creature, a hidden object or the DM's notes never appear in an
   entry.
7. **A pending member is not in the game.** The offer's result to the player
   names only things from their own file. No table setting, no homebrew entry
   name, no member list. The lobby's `pending` list still goes to the DM only.
8. **Rate and size.** One offer per ten seconds per member, three stored, a
   joined-per-address limit already exists (`allowJoin`); the frame limit is
   raised only for a player at a table whose `characters` is not `new`, and the
   per-connection message bucket still applies. Verifying 100 signatures is
   bounded work; a test runs a worst-case file against a time budget.
9. **Replay and splice.** A block is bound to `cid`, `n`, `prev`, `tid` and the
   head hash; a block cannot be moved to another character or reordered. A
   test splices a block from character A into character B's chain and expects
   `broken`.
10. **Undo.** `reconcile` runs after `undo`, `redo` and `rewind`; a signed
    entry that no longer matches the state is revoked by an appended block, and
    a test undoes a level-up after the seal and checks the verdict.
11. **Stand-ins.** Never silent; always in the report, the chronicle (not
    public), the `joined` count and the sheet header. A stand-in is never
    written back as if it were the player's real choice.
12. **Names and text are escaped.** A character name, a `parked` name and a
    pack name are shown with the escaping the client already uses (`esc`); a
    name with markup shows as text. The envelope limits cap their length.
13. **A gap, named.** There is no deletion path for a table or a member's
    record today (`IDLE_MS` only stops counting a table against `MAX_TABLES`),
    so records stay with the table file. The README of the server states it.
14. **Key identity.** For an unofficial server the key matters only to people
    who trust it: a leaked key lets anyone forge "signed by this server" files;
    the operator's remedy is a new key, after which old files read as unknown.
    For the **official** key a leak lets anyone forge official files; the
    project's remedy is a new key built into a new release, stated in the
    operator notes, not hidden. A modified server cannot make its own blocks
    official: a test presents blocks signed by another key claiming to be the
    official one and expects `signed-unknown`.
15. **Scores are personal data** (Decision 8): reputation, reliability and any
    engagement score need consent, visibility, contest and deletion before they
    are collected. Anonymous statistics must be non-attributable (a coarse
    bucket, a minimum count, hour-rounded UTC start) and their opt-out must change
    nothing about a player's reputation.

## Risks

- **People will read "official" and "signed" as "honest".** The whole design bends to avoid it:
  grades, the unknown-signer rule, the wording test. If playtests show the
  words still mislead, the meter loses its tick marks and keeps only the
  words.
- **A DM hands out levels.** The record says `granted` and "mostly awarded by
  the DM"; it cannot stop it. The feature is a label, not a guard.
- **The record is observation, not replay.** If `lineageStep` misses a way a
  character can gain a level (a new handler), the record has a gap. The test in
  P1 lists every handler that changes `e.sheet.level` and fails when a new one
  is not covered.
- **Browsers without Ed25519.** Verification falls back to the server; the
  screen says so.
- **Storage.** 20 characters of up to 96 KB is under 2 MB, inside a typical 5 MB
  quota but shared with `hextable.solo`; the panel shows the room left.
- **Two tables, one copy.** Fork warnings may annoy honest players. The wording
  stays neutral ("continued here by another copy").

## Questions for the owner

Questions 1, 4, 5, 6 (in part), 7, 8, 9, 10 and 11 were answered or overtaken by
the owner's decisions in #244; their answers are in "What the owner has settled"
and Decision 8, and are recorded here so nobody asks again. Each open question
has a default, and work proceeds on the default.

**Answered**

1. *A list of servers the project vouches for?* **No list; one official server
   whose key is built into the game, and no way to grant the designation to
   another.** Other servers are unofficial; a DM may trust a key for one table,
   which never makes it official.
4. *What leaves.* **Everything, with the DM's sign-off at send-off.**
5. *The DM's name in the history.* **The DM's moniker, always.**
7. *What an unapproved or refused player is told.* **About their own character:
   the compatibility report, and accepted, refused or accepted with changes, plus
   an optional short DM note.**
8. *Accounts.* **A moniker on the official server, not a server-held library:
   the official server keeps a hash and a small summary; backups may be a paid
   upgrade.**
9. *Ready-made heroes and imports.* **Yes; they become travelling characters and
   their history starts with one self-reported line.**
11. *A signed day.* **Date only in the history; anonymous statistics use UTC
    timestamps.**

**Still open**

2. **Default table policy.** *Default: `characters: 'new'`, today's behaviour;
   a DM turns own characters on.*
3. **Level limits for own characters.** Now answered in part: the DM sets the
   adventure's level and a higher character is forked. *Default for what is left:
   an unset level means no limit and the DM refuses in the review; a character
   below the level may be raised at the table (the lead's assumption).*
6. **Who sees the block-by-block details.** The meter and grade are public (the
   owner's decision). *Default: Details (each day, table, DM) are shown to the
   owner and the DM only.* Say if they should be public too.
10. **Fork id rule.** *Default: the original keeps its id, the fork gets the new
    one; on the official server an id is in one adventure at a time; the first of
    two diverged histories seen keeps the id.* Awaiting the owner's
    confirmation. On unofficial servers a copy at two tables is allowed and
    flagged neutrally.
12. **Operator trust lists.** *Default: none built; only the DM's per-table trust
    tick.* Say if a self-hosting operator should be able to list keys for all
    their tables (it would not make anything official).
13. **The public summary's contents.** *Default: id, moniker, name, class, level
    and the meter's figures.* Say if more or less may be public.
14. **Raising a lower-level character at the table.** *Default: allowed,
    recorded as raised by the DM (`basis: 'dm'`).*

## Build note: My characters and the solo party (#308)

The first slice of P6, built ahead of P1 and P2 with only what the device list and the file need. Decision 1's option C is as written; what
was settled while building:

- **The file.** `packages/client/mycharacters.js` makes and reads exactly the envelope of Decision 1 (`format`, `v: 1`, `cid`, `sheet`, `born`,
  `blocks`, `edits`, `keys`, `needs`, `parked`). `blocks`, `keys` and `parked` are written empty and **never read**: a file that carries them
  is imported without them and a note says so. `born.by: 'table'` is read as `'self'` for the same reason (nothing here can check a signature).
  `parseFile` refuses, with every reason listed, a file over 96 KB, one that is not JSON, one with a field the envelope does not have, a bad
  `cid`, a `born` that is not `{ level 1..20, how, by }`, `edits` that are not `{ at: 'YYYY-MM-DD', fields: [names] }`, and a sheet `validate`
  refuses (which is also what keeps non-SRD content out). The file kept is rebuilt from the parts that were checked. When P2 lands its
  `characterfile.js` should replace `parseFile`; the tests in `packages/client/test/mycharacters.test.js` are the cases it must keep.
- **The list.** `localStorage` key `hextable.characters` (the key Decision 1 names), at most 20, each entry a character file. Every entry is
  read back as a file is, so a hand-edited or damaged value is not shown (and is dropped at the next save; the screen says how many).
  Every access is in try/catch; a browser that refuses storage still plays (starters) and says why My characters is empty. Same `cid` twice is
  refused on import (Delete the old one first, or Duplicate); a copy gets a new `cid`.
- **Edits.** Saving from the build screen, or renaming, adds `{ at: today, fields: [names of the sheet fields that differ] }`, never values,
  at most 50 kept. `born.level` is the level the character was first saved at and does not change.
- **Limits** are one object, `LIMITS` in `mycharacters.js`: party 1 to 6, level 1 to 20, 20 saved, 96 KB a file. Each disallowed choice in the
  lobby says why next to the choice (a starter or a character already in the party, a sheet `validate` refuses, no one chosen, My characters full).
- **The build screen** is the one panel `buildsheet.js` already makes, opened with `openBuild({ mode: 'mine', sheet?, onSave })`; Save calls
  `onSave(sheet)`, which returns '' or a reason shown with the other problems. It opens above the lobby (`.over-lobby`). No second panel, no second
  engine: nothing is sent to `apply()` because no game exists yet.
- **The party.** `newGame(seed, { party })` in `scenario.js` takes 1 to 6 entries, `{ pregen: id }` (a starter, once at most) or `{ sheet }`
  (`validate` must pass; a bad party throws and nothing is made). Built heroes are `pc1`..`pc6` and keep their sheet (as `setSheet` keeps it);
  the starters keep their ids. This was less engine change than a `setSheet` per hero after `newGame`, which could not take the four starters
  away. Hex and square valleys both place up to six. Without the option the valley is exactly what it was. The lobby remembers the last party
  (`hextable.party`, `{ count, picks }`) and **Continue** keeps the saved game as it is; **New game** (two taps, in the lobby or in the menu) starts with the remembered party.
- **Not built, as the issue says:** keys, blocks, servers, the level meter (P7), Import from Fantasy Grounds with no table, species and
  background (a sheet has no field for them), a multiclass sheet in the build screen (`fromSheet` reads one class: such a character can be listed,
  exported, imported and played, but its Edit button says it cannot be opened yet).
- **For a player joining a table later (P8, not built):** the lobby's Join would need a chosen entry from this list sent as an offer; the file is
  already the shape P5 expects, and `LIMITS` and `pickProblem` can be reused for what a table admits. The server has no `admit` yet (P4).
