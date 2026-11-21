# Table server

Serves the game and runs multiplayer tables. One process, no dependencies.

```
npm start        # from the repo root: builds the site, then serves it on http://localhost:8080
```

| Setting | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Port to listen on (`0`: any free port, printed at start) |
| `DATA_DIR` | `./data` | Where tables are saved, one JSON file each |
| `JOURNAL` / `JOURNAL_FILE_BYTES` / `JOURNAL_FILES` / `JOURNAL_TOTAL_BYTES` | on / `5242880` / `5` / `524288000` | The action journal (below): `JOURNAL=off` turns it off; a file (its snapshot counted in) is closed at this many bytes; this many files are kept per table; the cap on all journals on the server (500 MB) |
| `TIMELINE_CAP` | `5000` | Timeline entries a table keeps besides chronicle entries (see below) |
| `TRUST_PROXY` | `0` | Proxies in front of the server that append to `x-forwarded-for`. `0`: use the socket's address and ignore the header (see Address below) |
| `CLIENT_IP_HEADER` | none | A header the platform sets itself and overwrites, such as `x-real-ip`; read instead of `x-forwarded-for` when `TRUST_PROXY` is above 0 |
| `LIMIT_CONNECTIONS` | `20` | Open WebSocket connections per address |
| `LIMIT_HOSTS` / `LIMIT_HOST_WINDOW_MS` | `5` / `3600000` | `host` messages per address per window |
| `LIMIT_JOINS` / `LIMIT_JOIN_WINDOW_MS` | `20` / `600000` | `join` messages per address per window |
| `LIMIT_BURST` / `LIMIT_RATE` | `20` / `5` | Messages a connection may send at once, and per second sustained |
| `LIMIT_UPLOADS` / `LIMIT_UPLOAD_WINDOW_MS` | `30` / `600000` | File uploads and deletions per address per window |
| `LIMIT_ASSET_BYTES` | `5242880` | Largest file a DM may upload (5 MB) |
| `LIMIT_TABLE_ASSET_BYTES` / `LIMIT_TABLE_ASSETS` | `52428800` / `200` | All the files of one table: bytes (50 MB) and count |
| `LIMIT_ASSETS_TOTAL_BYTES` | `2147483648` | All the files of every table on the server (2 GiB) |
| `LIMIT_UPLOADS_AT_ONCE` / `LIMIT_ADDRESS_UPLOADS_AT_ONCE` / `LIMIT_TABLE_UPLOADS_AT_ONCE` | `8` / `2` / `2` | Upload bodies read at the same time: on the whole server, from one address, to one table |
| `LIMIT_UPLOAD_BODY_MS` / `LIMIT_UPLOAD_GRACE_MS` / `LIMIT_UPLOAD_MIN_RATE` | `180000` / `10000` / `32768` | An upload body must arrive within the deadline and, after the grace period, average at least this many bytes a second |
| `LIMIT_ASSET_READ_BURST` / `LIMIT_ASSET_READ_RATE` | `120` / `10` | `GET` and `HEAD` requests under `/assets` per address: at once, and per second sustained |

## How a table works

1. The DM clicks **Host a table** and gets a six-character code.
2. Players enter the code. Each waits until the DM lets them in.
3. A player picks one unclaimed character. The DM controls everything else,
   and can hand any character to any player from the DM panel.
4. A player who leaves the table frees their character for someone else.
5. Every action goes to the server, which runs it through the rules engine and
   sends the result to everyone at the table.
6. Tables are saved a second after each change and reloaded on restart.
   Players who reload or lose their connection rejoin automatically.

When the game is opened from a host with no table server (such as GitHub
Pages), `/api/ping` fails and the game runs solo in the browser instead.

## Files

- `src/tables.js` — who is at which table and what each person is told. No
  network code, so the tests drive it directly. The players' view is built once per change of
  the table and shared by every player (each copy adds only their own handouts and their own
  creatures' standing instructions for reactions, `reactions`, and a reaction question, `prompt`): the party sees as
  one (`docs/specs/sight.md`). Under the `sight` table rules `los` and `light` a player's view also
  carries `sight: { rule, now, light? }`, the tiles the party sees now and the light on them.
- `src/journal.js` — the per-table action journal (see "The action journal" below). Async, guarded, no dependencies; `scripts/replay.mjs` replays it.
- `src/limits.js` — the per-address and per-connection limits, with an injectable clock.
- `src/ws.js` — a minimal WebSocket implementation on Node's `http` and `crypto`.
- `src/assets.js` — the store of table files on disk: type sniffing, ids, limits. No network code.
- `src/assets-http.js` — the `/assets` routes: who may upload, fetch and delete.
- `src/index.js` — HTTP, static files (html, js, css, json and svg gzipped with Node's `zlib` when the client accepts it, compressed once per file and kept until the file changes; uploads are never compressed; every file carries a strong ETag, a hash of its bytes taken when the file is read (the server stats each file per request, so a changed file has a new tag at once, no restart), and `Cache-Control: no-cache`, and an `If-None-Match` that matches is answered `304` with no body; the gzipped form has its own tag ending `-gzip`; `/build.json` and `/api/*` stay `no-store`; #646), `/api/ping`, `/api/health`, `/assets`, `/ws`, and saving to disk.

## The action journal (#659)

Beside each table's save the server keeps a journal of the actions the table accepted, so that a game can be replayed through
`apply()` and a feedback report reproduced (`docs/specs/feedback.md`). It is in `src/journal.js`; the rules package knows nothing of it.

**Files**, in `DATA_DIR` (the Docker image's `/data`, so a volume that keeps the tables keeps these; nothing else in the image changes):
`ABC123.journal.000007.snapshot.json` (the state the file begins from: `{journal, table, at, stateVersion, hash, state, packs, members}`) and
`ABC123.journal.000007.jsonl`, one JSON object a line. A file starts with `{"k":"open", file, at, sv, d, h, cap, why?, snapshot}` (`cap` is the table's timeline cap, handed to the journal by `createTables`, the one place that owns it, and written in every header whichever path opens the file; replay applies after each action that can be undone, as the server does; `why` says what made this a new file: `undo`, `redo`, `rewind`, `packs`, `world`, `approve`, or `lost`); then one `{"k":"act", n, at, role, uid, action, d0, d1, sv, h}`
for each accepted action: the action as the server applied it, the sender's role, the sender's opaque member id (random, made when they sat
down: not a name, an address or the join token), the dice counter before and after (`d0`, `d1`), the state version (`sv`), the line's
number (`n`) and a hash of the state after it (`h`: everything but the timeline in full, and of the timeline its length, its first entry and its last 20 entries, so a long timeline does not cost the whole of it on every action; what it does not see is a change in the middle of a long timeline that leaves those alone, and the engine only appends to it). The line is written after the timeline is cut to its cap, so `h` is the state the table then held. Refused actions are not journalled, nor is a ping that changed nothing. Undo,
redo and rewind are not actions the engine can run again: each writes a `{"k":"undo"|"redo"|"rewind", ...}` line and closes the file.
A pack or world loaded, or a player being let in (not a request waiting), writes a `{"k":"break"}` line and closes it too. The next action opens a new file whose
snapshot is the state as it then is, so every file replays from its own start.

**What is kept.** (Privacy, plainly: the snapshot is a copy of the table's save. It holds the dice key, the DM's notes and hidden information, any homebrew packs and the players' names, so the files are as private as the table saves, and a journal or snapshot is never to be attached to a public issue or sent to anyone but the owner. `scripts/replay.mjs` says so each time it runs.) The action and nothing added to it: no chat or text a player typed beyond what the action itself carries (a spoken line is
an action, so its text is in it, as it is in the table's save). An action's `userName` (a claim, a spoken line, a ping) is replaced by
`{"$member": id}`; the names are in the snapshot's `members`, which is a file of the same kind as the table's save. **The snapshot holds the whole
state, the dice key and the DM's secrets included: keep the files as private as the table saves; never attach one to a public issue.**
A feedback report is matched to a journal by the build, the time and the table's owner asking: the report carries no table code.

**Rotation and retention.** A file is closed when it, its snapshot counted in, passes 5 MB (`JOURNAL_FILE_BYTES`; sizes are bytes; a state bigger than 2.5 MB gets room for as many lines as it is big, or every line would be a new file) and a new one starts at the next action; a new file also
starts at the first action after the server starts (a table nobody touches writes nothing). The last 5 files of a table are kept
(`JOURNAL_FILES`), each with its snapshot; older ones are deleted when a new file opens. All journals together are held to `JOURNAL_TOTAL_BYTES` (500 MB): when a new file opens and the total is over, the oldest closed files of any table go first (a file being written never does). There is no time limit; a table's journal stays until its files rotate out. At start the server removes the journals of tables whose save file no longer exists (a save that is there but cannot be read keeps its journal: that is the best evidence), a leftover `.snapshot.json.tmp` counts with its pair and goes with it, as it does their uploaded files.

**A write never fails or slows an action.** Lines go to an in-memory queue that one worker writes in order with asynchronous file calls; the
action does not wait for the disk (a synchronous append on a network volume could stall every table on the process). The two costs on the
action's path are the hash of the state and, once a file, the snapshot's `JSON.stringify`, which the table's own save does as often. Measured here on a synthetic 1.56 MB state (a 5000-entry timeline of 1.08 MB, 12 parked places, and the 0.48 MB of everything else): hashing the whole state took 7.8 ms, this hash 2.9 ms, nearly all of it the 0.48 MB that is not the timeline; the starter valley (37 KB) takes 0.25 ms. A real table's number depends on how much else it holds; the write itself is off the action's path. Every error is caught: it is logged as one JSON line to stderr, `{"event":"journal-error","at","table","op","error"}`
(at most one a minute a table), and the file is given up; nothing is tried again for 30 seconds, then a new file with a new snapshot is opened (its header says `why: "lost"`, which replay tells from an undo; the marker is kept in memory only, so a restart before the next file forgets it),
so a full or missing disk costs one log line a minute and nothing else. A queue over 32 MB gives the file up the same way. On SIGTERM the write in flight is done again and the lines
still queued are written synchronously before the process exits (a line that had landed is then written twice with the same `n`, which replay skips); a crash can lose the last lines or leave the last one cut short, which replay reports as a note and not a failure. A snapshot is written to a temporary name and renamed.

**Replay.** `node scripts/replay.mjs <snapshot.json> <journal.jsonl> [<journal.jsonl> ...]` applies the lines through `apply()` (under the
snapshot's homebrew packs) and checks the dice counter and the state hash after each. It prints `ok: N actions replayed` and exits 0, or
names the first file and line that differs (a different state, different dice, or an action the engine now refuses) and exits 1. `--strict` also exits 1 when a file restarts from its own snapshot because lines were lost (`why: "lost"`). Given
several files in order, it starts again from a file's own snapshot (found beside it) where that file follows an undo, a pack or a join.

## Engine crashes and `/api/health`

When the engine throws on an action (a malformed message, or a bug) the player still gets "The table couldn't make sense of that
action." and the game is put back as it was. The server now also writes one JSON line to stderr (the container log) for each:
`{"event":"engine-crash","at","table","action","role","stack"}`. `table` is the table code, never the join token; `action` is the
action type (a name that is not plain letters and digits is logged as `?`); `role` is `dm` or `player`. The action's payload, chat
text, names and anything else a player typed are never logged. The same applies to a throw while applying a pack list
(`action: "setPacks"`) or a world pack (`"worldIndex"`).

Per process, the server counts crashes and refusals in total and by action type (at most 200 types, then `other`).

`GET /api/health` answers, with `cache-control: no-store`:

```json
{"ok":true,"uptime":3600,"tables":{"loaded":12,"active":3},"connections":5,"crashes":0,"crashesByType":{},"build":"c1d5069"}
```

`uptime` is seconds since the process started; `tables` are the tables held in memory and those active in the last 30 days;
`connections` are open WebSockets; `crashesByType` is the ten most frequent action types; `build` is the commit of `/build.json`
(or `null`). There is nothing per table or per person in it. It is limited to 30 reads a minute per address
(`LIMIT_HEALTH_MINUTE`); over that it answers 429.

## Protocol

JSON messages over the WebSocket at `/ws`.

Notes to one player and handouts are ordinary actions (`note`, `handout`, `showHandout`,
`hideHandout`, `removeHandout`). Before a DM's `note` reaches the engine the server checks that its
`to` is a player let in at this table.

Scenes are ordinary actions too (`scene`, `endScene`, `sceneNpc`, `say`, `askCheck`,
`sceneChronicle`; their shapes are below). For a `say`, the server overwrites `userName` with the
name the player joined by (and drops it from the DM's), and refuses a member's line beyond
`MAX_SAYS_PER_MINUTE` (30) in a rolling minute, counting refused lines; the DM is counted apart
from each player. Everything else, including who may speak as whom, is the engine's.

### Homebrew packs (#391)

A table can hold up to four homebrew packs (`docs/specs/homebrew.md`, Decisions 3 and 5). They are kept in the
table's record beside `state` (`table.packs = [{id, version, hash, data}]`, in the table's file) and the game names
them in `state.packs` (`[{id, version, hash}]`, set through the engine's `setPacks`). The DM cannot send `setPacks`
as an action: it is refused, and the server keeps `state.packs` in step with the record (at load, and after undo, redo and rewind).

- `{t:"pack", op:"add"|"update", pack}` from the DM; `pack` is the pack document or its JSON text. `{t:"pack", op:"remove", id}`.
  Anyone else, and anyone not let in, is answered `Only the DM can change the table's packs.`
- Sizes. A seated DM's frame is bounded before it is parsed at 4 MB plus 64 KB (what a world pack needs; everyone else's at 16 KB). That
  holds a 256 KB pack in text form even when every character needs escaping (at most twice its size). A pack sent as text is read
  only up to 512 KB (twice the pack limit); the rules' budget then holds the pack to 256 KB of canonical JSON, whatever form it came in.
  Nothing reads the start of the frame.
- The checks, in order: who; the operation; the table's pack budget; the size; the registry's `loadPack` (budget, then strict lint); a
  `add` needs a new id and `update` the same id and a higher version; an update may add and change entries but not drop one the
  earlier version had (remove the pack, when nothing uses it, and add it again); the set the table would have goes through `overlayOf`
  (at most four packs, no id in two packs, no SRD id); a removal is refused while anything in the game uses the pack; the hash
  (`hashOf`); `setPacks` through `apply`; and only then the record changes and the table is told. A refusal changes nothing and tells no one but the sender.
- A homebrew spell may summon a homebrew creature of the table's packs, and a homebrew creature may be a familiar's form or a Wild Shape form
  (#457). The creature's block is sent only to the player who runs it (its player, or its master's): the shared player view is built once per
  change, and each player's copy then has every other player's homebrew summon or familiar as the record of a foe they can see (name, size,
  place, a word for its health; its `side` kept), a character in a homebrew form as the character itself without the form, no entry of it in its
  master's pocket dimension, and no initiative, Dexterity or turn budget of it in the fight. A player's patch is computed against what that
  player was sent. Every event that names such a creature carries a stamp of who ran it when it happened (`hb`, never sent), and the record
  (`history`, the recent log, a fight's history) is told from the stamps: a creature that has since gone, or ended its form, stays its runner's.
  The monster entries are still not in a player's copy of a pack. The DM is sent everything.
- A refusal is `{t:"error", error, problems?, blockers?}`: `problems` are the linter's sentences (at most 20), `blockers` say where a
  pack is in use (`entities.m3 (Name): hb-ember-folk-quillwraith`). Removing a pack clears the DM's undo history, since an undo step could bring back a creature made from it.
- What members are sent. `{t:"packs", packs:[{id, name, version, hash}]}` is only the list (the DM's `hash` is the pack's own; everyone else's is the hash of the filtered data they are sent, so no one holds a fingerprint of what they are not sent): it is sent to every member let in after a change, and
  before the first `update` on sitting down, being let in, or `sync` (when the table has packs; a table with none sends none).
  On a change the DM's copy also has `changed: {op, id, version?}`. The data of a pack is `{t:"packData", id, version, hash, data}`: sent once
  to every member let in when a pack is added or updated, and otherwise only to a member who asks with `{t:"packData", id}` (a client keeps
  packs by hash and asks only for what it lacks; rate limited per member, `LIMIT_PACK_DATA` per `LIMIT_PACK_DATA_WINDOW_MS`, 30 per minute; refused
  for a pending member, who is sent nothing of any pack). The DM's `data` is the whole pack; everyone else's is
  `{id, name, version, spells, items, feats, weapons, armour, objects}`, and `subclasses` when the pack has any (a pack without them is sent exactly as before): no monsters, no `dmNotes`.
- Every call of the engine and the views for a table runs inside that table's overlay (`using(overlayOf(...))`) through one wrapper in
  `tables.js`; the overlay is built once and rebuilt only when the packs change.
- Saved tables. At start-up (and for any table brought in from a file) a table's `packs` is checked as if uploaded: it must be a list of
  exactly `{id, version, hash, data}` records whose data passes `loadPack`, whose hash matches, that summon nothing homebrew, and that the registry accepts together.
  Whatever fails is dropped, never sent to anyone, written to the server log, and listed to the DM as `dropped: [{id, reason}]` on the `packs` message at
  sitting down until the DM next changes a pack; the table plays without them and `state.packs` is set to what is installed. One table's bad file does not
  stop the server or another table.
- A handler that throws costs that message an error frame (`The server could not handle that message.`) and a log line with the stack; the socket and the process carry on.
- `export` carries `packs` (`[{id, version, hash, data}]`) beside `state`.
- Limits. `LIMIT_PACKS` pack messages per table per `LIMIT_PACK_WINDOW_MS` (20 per 10 minutes), spent only by the table's seated DM (a message with no
  valid operation, and anything from a player or an unseated socket, spends none; those meet the ordinary per-connection limits).

### World packs (travel W3, #595)

A table can hold one **world pack**: the DM's atlas of places, battle maps, routes and encounter tables
(`docs/specs/travel.md`, Decision 2). It is kept in the table's record beside `state`, as the packs are:
`table.world = {id, version, hash, data, assets}`, where `data` is the pack with its pictures' bytes taken out
(they are in the table's file store, below) and every reference to a picture rewritten to the store's id, and
`assets` is `{[pack picture key]: {id, hash}}`. The game keeps only the index (`state.world`: places, pins,
entries, routes, tables; no maps, no pictures), recorded by the engine action `worldIndex`.

- `{t:"world", pack}` from the DM; `pack` is the world pack document (or its JSON text). Anyone else is answered
  `Only the DM can load a world.`; anyone not seated, `Join a table first.`
- The checks, in order: who; the table's pack budget (`LIMIT_PACKS`, shared with `pack`); the size; the rules'
  `loadWorld` (an iterative budget on the document as sent: at most 4 MB of JSON pictures included, no
  `__proto__`, `constructor` or `prototype` key, no control character, nothing that is not plain data; then the
  linter: every map through `lintMap`, every monster of an encounter table one of the SRD's or of the table's
  homebrew packs, at most 300 places nested 8 deep, 60 maps, 100 pins a place, 500 routes, 50 tables of 100 rows,
  50 pictures each a PNG, JPEG or WebP by its bytes; `WORLD_LIMITS` in `rules/src/worldpack.js`); the engine's own
  refusals, tried on a copy of the game (in a fight, on a journey, an older version of the same world, a place
  kept at the table that the pack would turn from a battle map into another kind, a pack place with the id of one
  made at the table); then the pictures go into the store (by their bytes, under the store's limits; one the
  table's last world had, byte for byte, is used again); then `worldIndex` through `apply`; and only then the
  record changes. A refusal at any step changes nothing (a picture stored before it is removed again) and is
  `{t:"error", world: true, error, problems}`, the linter's plain sentences, at most 20.
- On success the DM's undo history is cleared (an undo step cannot cross into another world), the last world's
  pictures that nothing shown any more names (the map in play, a parked place's map or scene, a handout, a place
  of the index) are deleted, and every seated DM is sent `{t:"world", world: {id, name, version, hash, nodes, maps,
  routes, tables}}`; a DM sitting down is sent it too. A table file whose world record is not that shape loads
  without it, and the DM is sent `{t:"world", world: null, dropped: true}`.
- Players are sent nothing of the world: no message, no `worldLoaded` event (it is not in the players' allow
  list), nothing in their view (which has no `world`), and so no right to fetch its pictures (a player may fetch
  only files their own view names). What players learn of places is W4's (`docs/specs/travel.md`, Decision 12).
- `worldIndex` cannot be sent as an action, by the DM or anyone: `A table's world is loaded with the world message.`
- **The fill.** An action that may enter a battle place for the first time, or put one back as prepared
  (`enter`, `leave`, `loadMap {node}`, `goTo {stale: "reset"}`, `resetPlace`), has any `map` the client put in it
  dropped, and the world pack's map of that place put in instead when the place is not in play or kept. A place
  made at the table (`nodeAdd`, `added`) is not the pack's, and the DM's own map stays. The size of an action is
  checked on what the client sent, before the fill; the action applied, recorded and undone is the filled one.
- `export` carries `world` (the record as the table keeps it, or null) beside `state` and `packs`; the pictures are among `assets`,
  taken before any other file (what the game shows and every picture the world uses, its unvisited maps' backgrounds included).
- `DELETE /assets/<code>/<id>` of a picture the world uses is refused with `409` and
  `That picture belongs to the table's world (a place or one of its maps shows it). Load a world without it first.`
- A DM's socket that leaves (`{t:"leave"}`), or is welcomed as anything but the DM, is held to the small frame again.
- The solo game does the same in the browser: the record in IndexedDB (`hextable-world`), the pictures among the
  tab's files, and the same fill (`packages/client/transport.js`).
- `npm run world -- <world.json> [--pack <homebrew.json> ...]` checks a file with these checks before import.

### Connection quality (#246)

Two small messages for the connection dot. Neither reaches the rules engine: they change no game state, add nothing to the
undo history or the record, make no save, and are not actions.

| Message | Who | Answer |
|---|---|---|
| `{t:"ping", n}` | any connection, seated or not | `{t:"pong", n}` at once; `n` is echoed if it is a whole number, else `0`. The client times the round trip itself. |
| `{t:"link", state, rtt?}` | a member let in: `state` is `good`, `shaky` or `lost`, `rtt` the client's average reply time in milliseconds (0 to 60000, else left out) | no reply. Relayed as `{t:"link", from: userId, state, rtt?}` |

Who is sent what: a player's report goes to the DM and back to that player; the DM's goes to every player let in and back to the
DM. A player is never sent another player's, and someone waiting to be let in sends and is sent nothing. A connection that is
let in is sent what the other side last reported (the DM: each player's; a player: the DM's). Reports are kept in memory only.

Limits: a `ping` and a `link` each take a token from the connection's message bucket like any message, so a flood of pings is
refused and closes the connection exactly as any other flood does (a free message type would be a free way to keep a connection
busy; a client that pings every few seconds never notices the cost). A `link` closer than 2 seconds to the connection's last one
is dropped without an answer. The client sends one at most every 3 seconds when the state changes and every 15 seconds
otherwise; the DM's screen counts a player not heard from for 40 seconds as lost.

### Reactions

Standing instructions for a creature's reactions are an ordinary action (rules
`reactions.js`; design `docs/specs/rules-expansion.md`, Decision 4 build notes):

| Action | Who | Events (as the DM gets them) |
|---|---|---|
| `{type:"reactions", actor, set:{[reactionId]: "always"\|"never"\|"miss"\|"ask"}}` | the creature's controller or the DM, at any time but while a question waits | `reactionsSet {id,set}` (never sent to a player) |
| `{type:"react", prompt:n, take: reactionId\|null, slot?}` | the asked creature's controller, or the DM (overrides) | `reactionAnswered {id,n,take,by}` (DM only), then the waiting action's own events |

Which values a reaction takes depends on it (`miss` only for one that adds to AC). A player's view
carries `reactions: { [creatureId]: { [reactionId]: when } }` for their own creatures only, with
only what differs from the default; the shared part of the view never has a creature's
`reactions`. A reaction taken sends `reaction {id,reaction,name,trigger,against?}` to everyone who
could see it (`trigger`: `leave`, `hit`, `targeted`, `cast`, `damaged`, `saveFailed`: Countercharm,
`always` or `never` only).

**Class features (#154).** More fields on actions the engine already takes, all checked there:
`feature` takes `mode` (Divine Spark: `heal`, `radiant`, `necrotic`), `form` (Wild Shape: a pack
Beast's id; none leaves the form), `make` or `spend` (Font of Magic: a slot level), and `cure`
(Lay On Hands: a list of conditions, with `amount` 0 or more). `cast` takes `via` (a feature that
casts without a slot: Divine Intervention), `metamagic` (a list of option ids) with `careful` (ids),
`heightened` (an id) and `transmute` (a damage type). `shortRest` takes `restore` (ids: Sorcerous
Restoration). New event `form {id, form, name}` (sent where the creature is known; `form` null when
it ends); `save` and `attack` events may carry `rescued {name, dice, add}` (a Bardic Inspiration
die or Peerless Skill) and a `save` may carry `careful` or `reroll`. State version 17.
Since #169: a creature not of the party in a form is seen by players only as the Beast (its
`name`, `tpl` and `size` are the Beast's, `kind` is `npc`, and no `look` or `form` is sent);
`careful` may not name the caster; `restore` names each creature once; a feature that casts
(Divine Intervention) is refused through `feature` (use `cast` with `via`); a second Bardic
Inspiration die is refused for a creature that holds one.

**Multiclassing (#175). State version 18.** A sheet for `setSheet` and `levelUp` may list
`classes: [{ class, level, subclass?, spells? }, ...]` (the first class taken first) in place of
`class`, `level`, `subclass` and `spells`; a sheet with one class is unchanged. `levelUp` takes one
more level in a class the character has, or level 1 in a new class at the end of the list; the
new class's prerequisites are checked by `validate`. The record of such a character carries
`classes [{ id, level, subclass? }]`, `hitDice` (a count by die size, when there are several sizes)
and `spellAbil` (spell id to ability, for spells of a class whose ability is not `castAbil`); the
creature carries `hdBy` (Hit Dice left by size) beside `hd`. `shortRest` `spend` spends the largest
dice first. A feature both classes have is played under the later class's id in front
(`bard-spellcasting`, `paladin-channel-divinity`), with its own uses and `choices` key.

**Feats (#189).** No new action and no state change. A sheet for `setSheet` and `levelUp` may list
`feats: [{ id, at, abilities?, skills?, tools?, list?, ability?, spells? }]`: `id` a feat of the pack
(`CONTENT.feats`), `at` the place it is taken (`background`, `species`, or a class feature with
`feat`: `ability-score-improvement-4`, `epic-boon`, `bard-ability-score-improvement-8`), and the feat's
own choices. A sheet's `abilities` are its scores before the feats it lists; a choice left out adds
nothing. `validate` checks the place, the category, the prerequisite, repeats and each choice. The
record gains a feature for each feat (`feat-<id>`, `feat-<id>-2` for a repeat) with its modifiers,
senses and uses; Magic Initiate's spells join `spells` (with `spellAbil`) and its level 1 spell is
cast once per Long Rest with `cast` and `via: "feat-magic-initiate"`. A feature with `freeCast.spells`
now casts at the spell's own casting time (it was always the Magic action, which only Divine
Intervention's `freeCast.list` keeps). `featChoices(sheet)` and `featSlots(sheet)` in `derive.js` say
what a screen should offer.

**Magic items (#189). State version 20.** A sheet may hold `items: [{ id, item, base?, type?, spell?,
equipped?, attuned?, charges? }]` (`item` a magic item of the pack, `CONTENT.items`) and `attuning: { item, end? }`.
New actions, by the controller or the DM, outside a fight:
- `equip { actor, item: key, on?: true | false }`: put on or take off (a ring, a cloak, armour, a Shield, a weapon in hand).
  Event `equip { id, key, item, on }`.
- `attune { actor, item: key | null, end?: true }`: choose the item to attune to (or stop attuning to) at the next Short
  Rest; `null` clears the choice. Event `attuning { id, key?, item?, end?, cleared? }`. The DM's `shortRest` makes it:
  event `attuned { id, key, item, end?, failed? }`.
`give` also takes a pack item id with `base`, `damageType` or `spell` (built character: onto the sheet, event `gear`
with `key` and `pack`; typed in by hand: its name into `gear`, `nameOnly`), and `{ item: key, take: true }` takes one
back. A `conclusion` loot line may say `item` (and `base`, `type`, `spell`); its `name` defaults to the item's. Players
are sent these events only for the party's creatures. The migration to 20 converts nothing.

**Map format 2 (#249). State version 21.** A map document (`loadMap`, `mapEdit`, `state.map`, and
the map in every view) is `{ format: 2, id, name, grid, cellFeet, levels, walls, objects, regions,
starts }`: `grid` is `"hex"` or `"square"` and `cellFeet` (format 1's `hexFeet`) is 5. Players are
sent `grid` and `cellFeet` with the rest of the map header; nothing about the grid is secret. A
square map is refused for now ("Square maps come in a later version.", docs/specs/square-grid.md
task S6). `loadMap` takes format 2 only: a format 1 document is refused with "Its format is 1; this
game reads format 2." and changes nothing; `migrateMap` in `rules/src/map.js` brings one up (the
editor runs it on every map file it opens). A build that reads format 1 refuses a format 2 map
rather than playing it on the wrong grid. Saved tables and exports migrate when they are loaded: the
map gains `grid: "hex"` and `cellFeet: 5` and loses `hexFeet`, nothing else changes, and, as with
every version change, a saved undo history is dropped once.

**Spell vocabulary (#165).** No new action. `cast` of a spell with a teleport step (Misty Step,
Dimension Door) takes the destination in `hex` (`{ q, r, z? }`), as an area spell is aimed; a
player may name only a place the party has been shown; with no `hex` the DM moves the caster.
`choice` may be a condition (Lesser Restoration). A teleport arrives as a `moved` event with a
one-hex `path` and `teleport: true`. New event `remains {id, remains}` (`frozen-statue` or `dust`,
sent where the creature is known); a creature seen by players carries `remains` when it has some.
A repeat save made on taking damage is a `save` event with `against`. State version 17, unchanged.

**Asking in the moment** (Decision 4 build notes, part 2). Where a player's creature has `ask`, the
action that reaches it stops and nothing it did is kept; the state's `pending` holds it (the DM's
view has it whole). Each player's view carries `prompt`:

- `null`: nothing waits.
- for the player who controls the creature asked:
  `{ n, reactor, trigger, options: [{ reaction, name, slots?, ac? }], by?, attack?, total?, ac?, crit?, spell? }`.
  `slots` are the spell slot levels it may use (the lowest is used if `slot` is not sent); `ac` is
  what an option adds to Armor Class; `total` and `ac` (top level) are the attack roll and the Armor
  Class it beat, for `hit`. `by` only where the party knows of that creature. A `cast` question
  never names the spell.
- for every other player: `{ waiting: true }`, nothing more, when the party can perceive what set the
  question off (the creature that did and the creature whose action waits are known to the party);
  otherwise `null`, as if nothing waited.

The player asked also gets `reactionAsked {id,n,ask}` (live and in `history`); nobody else does.
Until it is answered every action but `react`, `say`, `note`, `claim`, `release`, `askCheck` and
the handout actions is refused with "The table is waiting for a reaction to be answered." The
answer re-runs the waiting action, which may ask again (a new `n`). There is no time limit in the
engine or the server; the DM answers for a player who does not. A spell lost to Counterspell
sends `countered {id,by?}` to players, with `spell` and `name` only if it was theirs. The DM's
undo of an answer puts the question back.

### Scene actions, events and view

Design: `docs/specs/maps-and-objects.md`, Scenes, and its build notes ("Scenes: for the screen").
Text is cut of control characters and trimmed; limits are `SCENE_LIMITS` in
`packages/rules/src/scenes.js`.

| Action | Who | Events (as the DM gets them) |
|---|---|---|
| `{type:"scene", scene:{title?, image?, open?}}` | DM | new: `sceneStart`; opened: `sceneStart`; `open:false` on an open one: `sceneEnd {why:"set aside"}`; otherwise `sceneEdit` |
| `{type:"endScene"}` | DM | `sceneEnd {scene,title}` |
| `{type:"sceneNpc", npc:{id?, name?, portrait?, notes?}}`, or `{npc:{id}, remove:true}` | DM | `sceneNpc {scene,npc,name,change:"added"\|"edited"\|"removed",changed?}` |
| `{type:"say", as: ownCharacterId \| npcId \| null, text}` | a player as their own character or `null`; the DM as anyone in the party, any NPC of the open scene, or `null` | `say {from,as,name,text,scene?,line?}` (`scene`/`line` only while a scene is open) |
| `{type:"askCheck", actor, skill}` | a player for their own character | `checkAsked {actor,skill,by}`; the DM answers with `check` |
| `{type:"sceneChronicle", title, lines?:[from,to], scene?, text?, public?}` | DM | `chronicle {title,text,tags:["scene"],scene?,public?}` |

A scene with `open:false` (being prepared, or set aside) is the DM's alone: its events carry
`prep:true` and no player is sent them, live or from `history`; a player's `state.scene` is `null`;
its files are not theirs to fetch. A fight that starts ends an open scene (`sceneEnd {why:"a fight
began"}`) and leaves a prepared one alone. Players' `state.scene` is
`null | {id, title, image?, present:[{id,name,portrait?}], open:true}`, never `notes`. Players get
`sceneNpc` without `changed` and not at all when only notes changed; `checkAsked` only for their own
request; a `check`'s roll but never its DC or success; a `chronicle` only if `public`. The transcript
is the `say` events: ask `{t:"history",types:["say"],limit:200}` to rebuild it after joining (the
answer repeats `types`).

Client to server: `{t:"host",name}`, `{t:"join",code,name}`,
`{t:"resume",code,token}`, `{t:"act",action}`, `{t:"approve",userId,ok}`,
`{t:"leave"}`, `{t:"history",types?,since?,limit?}`, `{t:"history",fight}`, `{t:"sync"}`, `{t:"export"}` (DM only),
`{t:"undo"}`, `{t:"redo"}` and `{t:"rewind",to:"fight"|"rest"}` (DM only), `{t:"ping",n}` and `{t:"link",state,rtt?}` (see Connection quality).

Server to client: `{t:"welcome",role,userId,name,code,token,approved}`,
`{t:"update",seq,events,state}` or `{t:"update",seq,events,patch}`, `{t:"lobby",members,pending}`,
`{t:"error",error,expired?}`, `{t:"history",entries,recent?,types?}`, `{t:"history",fight,entries,cut}`, `{t:"export",table}`,
`{t:"undoable",undo,redo,pins:{fight,rest}}` (DM only), `{t:"pong",n}`, `{t:"link",from,state,rtt?}`.

An update's `state` is the receiver's view of the game and never includes the
timeline. The first update a connection gets carries the whole view; later
ones carry a `patch` with only what changed, numbered by `seq`. `seq` counts the
updates sent on that connection (1, 2, 3, ...), not changes to the table: a
connection for which nothing it may see changed (no event for it and an empty
patch, such as a player while a hidden creature acts) is sent nothing at all, and
no number is used up. A client that sees a gap in `seq` sends `sync` and is sent
the whole view again. The patch
format is in `packages/rules/src/patch.js`. Past entries come through `history`, redacted for players in the
same way as live events. On joining or rejoining, each client is sent its last
50 visible entries with `recent: true`.

A fight is named in the record: `encounterStart` has `fight` (its number) and `where` (the name of the
revealed region at its centre, else the map's name; never a region the party has not found), and
`encounterEnd` has `fight`. `{t:"history",fight}` asks for one fight's record: the entries from its
`encounterStart` to its `encounterEnd` (or to now, while it goes on), redacted for the asker like any
`history`, at most 500 from the start (`cut: true` if more were left out). An unknown fight answers
with no entries.

## Limits and hardening

- **Address (#205).** Limits are per client address. By default that is the socket's own
  address, and `x-forwarded-for` is ignored, because a client can put anything at the left of
  it. Behind a proxy every client then looks like the proxy, so set `TRUST_PROXY` to the
  number of proxies that append to the header: the server takes the Nth entry from the right
  (the one the nearest trusted proxy wrote), never the leftmost, and uses the socket address
  if there are fewer entries than that. Alternatively set `CLIENT_IP_HEADER` (with
  `TRUST_PROXY=1` to switch it on) to a single-valued header the platform overwrites. A value
  that is not an IP address falls back to the socket address, and IPv4-mapped IPv6 is read as
  IPv4. Only set these when the server is reachable through the proxy alone; a server also open
  to the internet directly lets a client forge what a proxy would have written.
  **Railway:** unset, every player shares the proxy's address and its limits, so set the
  variable in the service's dashboard (the Dockerfile does not). Railway's own statements
  disagree on which `x-forwarded-for` entry is the client (see PR #205), so test it on the live
  service before choosing. There is no debug endpoint; use the connection limit as the probe.
  Deploy with `TRUST_PROXY=1` and `LIMIT_CONNECTIONS=1`, then run this in two terminals, the
  second only after the first is connected (it holds the connection open), changing only the
  fake leftmost address:
  `curl -i -N --http1.1 -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H 'X-Forwarded-For: 198.51.100.1' https://<service>/ws`
  (then `198.51.100.2` in the second). If the second prints `Too many requests`, the entry
  at the right is you and `TRUST_PROXY=1` is right. If it connects, the right-hand entry is
  something else (a Railway hop) or the header was replaced: repeat with `CLIENT_IP_HEADER=x-real-ip`.
  Never run production with `LIMIT_CONNECTIONS=1`; restore the default afterwards.
- **Connections and messages.** At most 20 open connections per address; at most 5 `host`
  messages per address per hour and 20 `join` messages per address per 10 minutes; each
  connection may burst 20 messages and sustain 5 a second. Over a limit the client gets
  `{t:"error", error:"Too many requests. Wait a moment and try again."}`. Too many
  connections, or too many messages on one connection, also closes the connection; an
  over-limit `host` or `join` is refused and the connection stays open.
- **Origin.** A WebSocket upgrade is refused (403) when it has an `Origin` header whose host
  differs from the `Host` header, so a page on another site cannot drive a table from a
  visitor's browser. No `Origin` (scripts, tests) is allowed. A proxy that rewrites `Host`
  must pass the original one through.
- **Headers.** Every HTTP response carries `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY` and a `Content-Security-Policy`:
  scripts and connections only from this origin, Google Fonts for styles and fonts, inline
  style attributes (the UI sets colours that way), and pictures from this origin, `data:` and
  `blob:` (table files are shown from blob: URLs, see Table files). A table file gets a stricter
  CSP of its own.
- **Sizes.** An action over 4 KB of JSON is refused with `That action is too large.` The one
  exception is the DM's `loadMap`, `mapEdit` and the travel actions that may carry a place's map
  (`enter`, `leave`, `goTo`, `resetPlace`, `nodeAdd`), which may be up to 1 MiB. A player sending
  those is held to 4 KB. WebSocket frames are capped to match: 16 KB until someone is seated as the
  DM, and after that 4 MB and 64 KB, for a world pack (`{t:"world"}`, at most 4 MB of JSON); an action
  in such a frame is still held to 1 MiB. A larger frame closes the connection with code 1009.
- **Idle tables.** A table nobody has sat down at, acted in or left for 30 days stops counting
  against the cap of 500 tables, so abandoned tables cannot lock out new ones. It is not
  deleted: its DM or players can still resume it, and it counts again from then. The stamp
  (`active`, milliseconds) is saved with the table; tables saved before it existed start the
  clock when the server loads them.

## Player feedback (#353)

`POST /feedback` takes one report from the game's feedback button (`docs/specs/feedback.md`):
JSON, at most 24 KB, checked field by field (`packages/server/src/feedback.js`), 5 a minute and
30 an hour per address (`LIMIT_FEEDBACK_MINUTE`, `LIMIT_FEEDBACK_HOUR`; the address is found as
described under Limits; IPv6 counts by /64). Each report is one JSON line in `DATA_DIR/feedback.jsonl`; at 5 MB
(`FEEDBACK_MAX_BYTES`) it moves to the next free `feedback.N.jsonl`, five files in all (`FEEDBACK_FILES`), and when all are
full new reports are refused (nothing is deleted). The answer is `{ "ref": "FB-XXXXXX" }`. CORS is
open for this route only, without credentials.

To also file each report as a GitHub issue labelled `feedback`, set `FEEDBACK_GITHUB_REPO`
(`owner/name`) and `FEEDBACK_GITHUB_TOKEN` (a fine-grained token with Issues: write on that
repository, nothing else). The token is never logged or sent to a client. A failure to file is
logged and the local line is kept. The server as a whole files at most 20 issues an hour and 100 a day
(`LIMIT_FEEDBACK_FORWARD_HOUR`, `LIMIT_FEEDBACK_FORWARD_DAY`).

## Which build is running (`GET /build.json`)

The server answers `/build.json` itself (`src/build-info.js`): `{ commit, when, pr?, subject?, source: "server", from, started }`.
The commit and the first line of the commit message come from `RAILWAY_GIT_COMMIT_SHA` and `RAILWAY_GIT_COMMIT_MESSAGE`, which Railway
provides "if the deploy originated from a GitHub trigger" ([Railway variables reference](https://docs.railway.com/variables/reference)); without them
(`from: "image"`) it is the `dist/build.json` written when the image was built. No other environment variable is read or shown.

## Table files (assets)

Pictures a DM uploads for handouts and level backgrounds. Design: `docs/specs/maps-and-objects.md`,
"Images and other files".

- **Where.** `DATA_DIR/assets/<table code>/<id>` holds the bytes and `<id>.json` the record
  `{ id, kind: "image", mime, bytes, name, when }`. The id is 16 bytes from `crypto.randomBytes`
  (base64url, 22 characters), never derived from the file name; the name is a cleaned label only.
  When the server starts, a folder whose table no longer exists is deleted with everything in it,
  so deleting a table's file deletes its pictures. (There is no "delete table" message yet; if one
  is added it should call `assets.removeTable(code)`.)
- **Who.** Requests carry the session token from the socket's `welcome` in the `X-Hextable-Token`
  header. A token belongs to one table and works only once its holder has been let in.

| Request | Who | Answer |
|---|---|---|
| `POST /assets/<code>`, body = the raw bytes, `Content-Type: image/png`, `image/jpeg` or `image/webp`; optional `X-Asset-Name` (URI-encoded) | the DM, with the table open (a live connection on that seat) | `201 {asset}`; `403` anyone else, or the DM's token with no live connection; `415` not one of the three types *by its bytes*; `413` too big or the table is full; `507` the server is full; `408` the body was too slow; `429` over the upload limit or too many uploads at once |
| `GET /assets/<code>` | the DM | `200 {assets, usage, limits}`; any `GET` or `HEAD` over the read limit is `429` |
| `GET /assets/<code>/<id>` | the DM: any file of the table. A player: only a file named by something in *their own view* of the game (a handout shown to them, the background of a level they are sent), worked out on the server for each request | `200` the bytes |
| `DELETE /assets/<code>/<id>` | the DM | `204`; `409` for a picture the table's world uses |

  Every refusal to read is the same `404 {"error":"Not found"}`: no token, a wrong token, another
  table's token, a file not shown to you, a guessed id, a malformed id and a missing file all look
  alike. Routes are matched on the raw path, before any decoding, against the strict shapes of a
  code and an id; `..`, encoded slashes and absolute paths cannot match, and the file path is built
  only from a matched code and id and checked to lie inside the folder.
- **How a browser shows one.** `<img>` cannot send a header, and a token in a URL would end up in
  history, logs and screenshots. So the client fetches the file with the header and shows it from a
  `blob:` URL (`packages/client/assets.js`). The page's CSP allows `img-src 'self' data: blob:`. No
  signed URLs, so there is no server secret to keep and nothing to expire.
- **Serving.** `Content-Type` from the stored record (one of the three), `X-Content-Type-Options:
  nosniff`, `Content-Disposition: inline`, `Cache-Control: private, no-cache`,
  `Cross-Origin-Resource-Policy: same-origin`, and a CSP of its own (`default-src 'none'; sandbox`)
  so that a file opened on its own can never run anything.
- **Uploads** must come from this site: a request with an `Origin` header for another host is
  refused. Only the DM's seat may upload, and only while it has a live connection, so a token kept
  from an old session is not enough. Bodies are read into memory only up to the per-file limit (cut
  off as they arrive, or refused at once by `Content-Length`). A `Content-Length` larger than the
  room left in the table (`413`) or on the server (`507`) is refused before the body is read. At most
  8 uploads are read at a time on the whole server, 2 from one address and 2 to one table (a third
  is `429`), and a body must arrive within 180 seconds and, after its first 10 seconds, average at
  least 32 KiB a second (a 5 MB file at that rate takes 160 s); one that does not is cut off with
  `408` and its place freed, so slow senders cannot hold every place.
- **Disk.** Besides each table's 50 MB, all tables' files together are capped (2 GiB): an upload
  past it is refused with `507` and `The server has no room left for files.`, so tables left idle
  cannot fill the disk over time. A write that fails (a full disk) leaves no partial file, and at
  start the server clears whatever a crash left in a table's folder (`.tmp` files, bytes with no
  record, a record with no bytes).
- **Reads** are limited per address (120 at once, 10 a second). What a player may read is worked
  out from their view once per change of the table, not once per request.
- **Solo play** keeps files in the browser's IndexedDB, at most 2 MB a file, 20 MB and 50 files.

### Threat model for table files

1. Attacker: anyone on the internet, a player at the table, or a player of another table. The DM of a table is trusted with that table only.
2. Assets protected: the pictures (they can give away plot), the server's disk, and the game page's origin.
3. A file must never run as code in our origin: the type comes from the bytes (PNG, JPEG, WebP only; never SVG or HTML), is served with `nosniff`, its own sandboxing CSP, and only ever shown in `<img>`.
4. A request must never reach a path outside `DATA_DIR/assets/<code>/`: ids are server-made, routes are matched raw against strict patterns, paths are re-checked.
5. A player must get only files that something already sent to them names; the check runs on the server from that player's view, on every request, so hiding a handout takes the file back.
6. Existence must not leak: every refusal to read is one identical 404, and ids (128 random bits) cannot be guessed.
7. Disk and memory must not be exhausted: per-file, per-table and whole-server byte caps; per-address limits on uploads and reads; uploads read at once capped per address, per table and on the server, each with a deadline and a minimum rate; partial files and orphaned folders cleared.
8. Another site must not upload or read with a visitor's session: the token is in a header (not a cookie, not a URL), so cross-site requests carry none, and uploads with a foreign `Origin` are refused.
9. Tokens are compared in constant time and only seated, let-in members count.
10. Not covered: a malformed image that exploits the browser's own decoder, a player who saves a picture they were shown, and per-address limits when `TRUST_PROXY` is set wrongly for the host (see Address above). Anyone can host a table and so become a DM; uploads are bounded, not prevented. Many addresses together can still take the 8 server-wide upload places, each for at most the deadline.

## Exporting a table

Tables live on one disk, so the DM can keep their own copy. **Export table** in the DM panel
sends `{t:"export"}`; the reply is `{t:"export", table:{code, exportedAt, state, assets, assetsSkipped, assetLimit}}` and the
browser saves it as `hextable-<code>-<yyyy-mm-dd>.json`. Only the DM gets it; a player (or
anyone not yet let in) is answered with an error. `state` is the whole game state, including
the dice seed, hidden creatures and the timeline, which is why it is DM only. It holds no
`members` and no tokens. `assets` is the table's files, `[{record, data}]` with `data` the file's
bytes in base64 and `record` as the store keeps it (`id, kind, mime, bytes, name, when`): the
files the game refers to first (handouts, level pictures), then the rest oldest first, up to
`assetLimit` bytes of files (24 MB, `EXPORT_ASSET_BYTES` in `handouts.js`; a table may keep 50 MB
but an export is one message). A file that would pass the limit is left out and its record is
listed in `assetsSkipped`, so nothing is dropped unseen; the client says how many in a toast.
In solo play the same button saves the local state without
contacting a server, with the files kept in the tab. There is no import yet: loading a file back means accepting game state
from a browser, which needs validation designed first.

## Undo

The DM can take back the last actions and take them again. Every action that
succeeds is recorded (by anyone, the monster AI included) except `claim` and
`release`, which are about who sits where, and letting players in. The history is
kept by `packages/rules/src/history.js` as reverse patches: undoing restores the
whole game exactly, the dice seed, the clock and the timeline entries included.

- `{t:"undo"}` / `{t:"redo"}` from the DM. Anyone else gets `Only the DM can undo.`
  (or redo); with nothing to take back, `Nothing to undo.`
- After one, every member is sent a whole view (`{t:"update",seq,state,events}`),
  built through the same view as every other update. The DM's events are
  `[{type:"undone"|"redone", label}]`. Players get the same event only if they could
  see the step: every creature it names is one they know of, and at least one of its
  events reached them. Otherwise their update has no events, and a player whose
  view the step did not change is sent nothing.
- After every recorded action, undo and redo, the DM's connections get
  `{t:"undoable", undo:[labels], redo:[labels], pins:{fight,rest}}`, newest first. Players never do.
- Redo does not re-roll: the seed comes back with everything else, so the same
  action gives the same result. A new action after an undo clears what could be redone.
- The history is saved beside the table: `DATA_DIR/<CODE>.undo.json` next to `<CODE>.json`,
  written in the same flush (and, like the table, when the server stops), only when it has
  changed. It is loaded with the table, so Undo still works after a restart. It is the DM's
  alone: never sent to a player, never in an export. It is held to the same limits as a live
  one (the last 30 steps, 8 MB), also when loaded.
- The file records the table's `seq`, which moves with every change to the game. A history is
  used only if its `seq` matches the table file and the table needed no migration; otherwise
  (the server stopped between the two writes, say) it is dropped, because its patches would not
  fit that state. A history file that is missing, cut off, not JSON or not in the exact shape
  `history.js` writes is ignored with a line in the log, and the table loads with an empty history.

### Rewind: the start of the fight, the last rest

Thirty steps do not reach back to the start of a fight. So the history also keeps two **pins**,
whole copies of the game (`docs/specs/table-ui.md`, Decision 1):

- the **fight pin**, the game as it was just before an action that started a fight (an
  `encounterStart` event: `startEncounter`, or a move, attack or spell that began one);
- the **rest pin**, the game just after a `rest` or `shortRest`. A rest drops the fight pin;
  `loadMap` drops both. Undo and redo leave the pins alone.

`{t:"rewind",to:"fight"|"rest"}` from the DM puts the game back as it was at that pin, as one
step that Undo takes back (and Redo does again, exactly). Anyone else gets `Only the DM can
rewind.`; with no such pin, `No fight to go back to.` or `No rest to go back to.` Kept from now,
not from the pin: the **dice stream** (so the fight fought again rolls new dice; the dice are a
stream in the game state, so replaying actions from any saved state still gives exactly the same
results), the id counter `seq` (so the new fight has a new id), the timeline (the lost fight stays
in the record) and who holds which character. Everyone is sent a whole view; the DM's event is
`{type:"rewound",to,label}`, players' is `{type:"rewound",to}`. `undoable` carries
`pins:{fight,rest}`, booleans, for the DM's buttons. Pins are saved in the history file (`v: 2`; a
file from before pins, `v: 1`, loads with none), count in its 8 MB, and are never trimmed to make
room: undo steps go first.

## Rewards at the end of a fight

Nothing here is a server message: it is all the `conclusion` action and the state (rules
`rewards.js`, `docs/specs/table-ui.md`, Decision 4). A fight won or ended by the DM leaves
`state.conclusion` (table setting `conclusion`: `dm` reviews first, `auto` publishes at once, `off`
makes none; `xpShare`: `split` or `full`). The DM's view holds it all; a player's holds
`{id, fight, pending: true}` until the DM publishes, then the published card: the foes the party
knew of (no XP each, no total), each character's share, the bonus lines with reasons and the loot.
The DM's events `conclusionReady` and `conclusionEdited` are never sent to players; `conclusion`
(shaped like the card), `xp`, `levelReady`, `gear` (for their own creatures, with `why`) and
`conclusionSkipped` are.

## The timeline cap

`state.timeline` is the table's record of events. Every `chronicle` entry is kept forever; of all
other entries only the newest `TIMELINE_CAP` (default 5000) are kept, and the oldest beyond that are
dropped. This is done here, right after a successful undoable action and before it is recorded for
undo, and not inside `apply()`, which stays pure and independent of any setting. The undo step keeps
what was dropped, so undoing it restores the timeline exactly (after an undo the table may sit a few
entries over the cap until the next action). `claim` and `release` are not capped; the next recorded
action does it. A table saved with a longer timeline is cut when it is loaded, and then its saved undo
history is not used. The solo transport in the browser applies the same cap. See
`packages/rules/src/timeline.js`.

## Hosting

The server needs a host that runs a long-lived Node process, allows
WebSockets, and gives it a disk that survives restarts for `DATA_DIR`. The
`Dockerfile` in the repo root builds a ready-to-run image.

### Docker

```
docker build -t hextable .
docker run -p 8080:8080 -v hextable-data:/data hextable
```

- The image holds the built game, the rules and the server only: no `docs/`, `reference/`, tests,
  scripts or `.github` (`.dockerignore` lets in just what the `Dockerfile` copies).
- The server runs as the `node` user (uid 1000), not as root. The container starts as root for a
  moment: `docker-entrypoint.mjs` gives `DATA_DIR` (default `/data`) and everything in it to `node`,
  then drops root with `setuid` before the server starts. That is what lets a volume that arrives
  root-owned, or files an older image saved as root, work without any setting. Started as another
  user already (`docker run --user 1000:1000`), it changes nothing; then the folder must already be
  writable for that user.
- If the entrypoint cannot change the ownership (a volume that refuses `chown`) it says so on stderr
  and keeps running as root so tables are still saved; fix the volume and restart.
- At start the server writes and removes a small file in `DATA_DIR`. If that fails it prints
  `DATA_DIR ... is not writable` and exits with code 1 rather than run without saving tables.

### Railway

Add a volume to the service and mount it at `/data` (the image's `DATA_DIR`). Railway mounts volumes
as root (its docs suggest `RAILWAY_RUN_UID=0` for images that run as a non-root user). This image does
not need it: it starts as root, the entrypoint fixes the ownership and drops to `node`. Leave
`RAILWAY_RUN_UID` unset; if it is set to `0` the service still works, since the process then also
starts as root and drops the same way. Never mount the volume anywhere but `DATA_DIR`, or set
`DATA_DIR` to the mount path. After a deploy, the log should show `Hextable table server at ...` and no
`entrypoint:` warning.

### How deploys are verified (review R1, #617)

- **Before a merge.** The `Docker` workflow (`.github/workflows/docker.yml`) runs on every pull request and push to `main`. It builds the
  image (with `--build-arg GITHUB_SHA=<head>` so `dist/build.json` names the commit), starts it with an empty data volume and runs
  `scripts/ci/check-image.mjs`: `/api/ping`, `/build.json` (its commit must be the head sha), `/` and its script, and a WebSocket to `/ws`
  that hosts a table and gets the answer to one action. It then requires a container log with no error and a table saved to the
  volume after a clean stop. `packages/server/test/docker.test.js` also walks every relative import from `docker-entrypoint.mjs` and requires
  the run-time stage to copy each file; a server that imports from a folder the stage leaves out fails there, not on Railway.
- **After a merge.** The `Live check` workflow (`.github/workflows/live-check.yml`, every 30 minutes and on demand) reads the head of
  `main` and `/build.json` on Railway (`https://hextable-production.up.railway.app`) and GitHub Pages (`https://imburk.github.io/hextable`).
  When main's head is over 20 minutes old and a site reports another commit, it opens the issue **Live site is not the merged version**
  (or comments on the open one) with both shas, and closes it when they match again. `DRY_RUN=1 node scripts/ci/live-check.mjs` shows
  what it would do. It checks the commit only: not `TRUST_PROXY` or the volume on the live service (DEBT T3b, T15).

## Known limits

- Players are sent a view of the game, not the game: no dice seed, and other
  creatures only as name, position and a health word. Creatures the DM marks
  hidden are not sent at all until the party finds them. Players still see
  the whole map and every creature that is not hidden. See `docs/specs/hidden-information.md`.
- The dice of a hosted table come from a 256-bit key the server makes with
  `randomBytes` (ChaCha20, `rules/src/rng.js`), so they cannot be worked out from
  the rolls players see. A table saved with the older 32-bit seed is given a key
  once, when the server loads it, and its undo history is dropped. The DM's view,
  the export and the undo file hold the key; nothing sent to a player does.
- Anyone with a table code can ask to join, and the DM decides. There are no
  accounts or passwords.
- The DM's browser runs the monster AI, so monsters wait while the DM is away.
