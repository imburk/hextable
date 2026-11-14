# Table server

Serves the game and runs multiplayer tables. One process, no dependencies.

```
npm start        # from the repo root: builds the site, then serves it on http://localhost:8080
```

| Setting | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Port to listen on (`0`: any free port, printed at start) |
| `DATA_DIR` | `./data` | Where tables are saved, one JSON file each |
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
- `src/limits.js` — the per-address and per-connection limits, with an injectable clock.
- `src/ws.js` — a minimal WebSocket implementation on Node's `http` and `crypto`.
- `src/assets.js` — the store of table files on disk: type sniffing, ids, limits. No network code.
- `src/assets-http.js` — the `/assets` routes: who may upload, fetch and delete.
- `src/index.js` — HTTP, static files (html, js, css, json and svg gzipped with Node's `zlib` when the client accepts it, compressed once per file and kept until the file changes; uploads are never compressed), `/api/ping`, `/assets`, `/ws`, and saving to disk.

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
`{t:"undo"}`, `{t:"redo"}` and `{t:"rewind",to:"fight"|"rest"}` (DM only).

Server to client: `{t:"welcome",role,userId,name,code,token,approved}`,
`{t:"update",seq,events,state}` or `{t:"update",seq,events,patch}`, `{t:"lobby",members,pending}`,
`{t:"error",error,expired?}`, `{t:"history",entries,recent?,types?}`, `{t:"history",fight,entries,cut}`, `{t:"export",table}`,
`{t:"undoable",undo,redo,pins:{fight,rest}}` (DM only).

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
  exception is the DM's `loadMap` and `mapEdit`, which carry a whole map document and may
  be up to 1 MiB. A player sending those is held to 4 KB. WebSocket frames are capped to match:
  16 KB until someone is seated as the DM, about 1 MiB after. A larger frame closes the
  connection with code 1009.
- **Idle tables.** A table nobody has sat down at, acted in or left for 30 days stops counting
  against the cap of 500 tables, so abandoned tables cannot lock out new ones. It is not
  deleted: its DM or players can still resume it, and it counts again from then. The stamp
  (`active`, milliseconds) is saved with the table; tables saved before it existed start the
  clock when the server loads them.

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
| `DELETE /assets/<code>/<id>` | the DM | `204` |

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
`Dockerfile` in the repo root builds a ready-to-run image; mount a volume at
`/data`.

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
