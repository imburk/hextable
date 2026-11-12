# Table server

Serves the game and runs multiplayer tables. One process, no dependencies.

```
npm start        # from the repo root: builds the site, then serves it on http://localhost:8080
```

| Setting | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Port to listen on |
| `DATA_DIR` | `./data` | Where tables are saved, one JSON file each |
| `LIMIT_CONNECTIONS` | `20` | Open WebSocket connections per address |
| `LIMIT_HOSTS` / `LIMIT_HOST_WINDOW_MS` | `5` / `3600000` | `host` messages per address per window |
| `LIMIT_JOINS` / `LIMIT_JOIN_WINDOW_MS` | `20` / `600000` | `join` messages per address per window |
| `LIMIT_BURST` / `LIMIT_RATE` | `20` / `5` | Messages a connection may send at once, and per second sustained |

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
  network code, so the tests drive it directly.
- `src/limits.js` — the per-address and per-connection limits, with an injectable clock.
- `src/ws.js` — a minimal WebSocket implementation on Node's `http` and `crypto`.
- `src/index.js` — HTTP, static files, `/api/ping`, `/ws`, and saving to disk.

## Protocol

JSON messages over the WebSocket at `/ws`.

Client to server: `{t:"host",name}`, `{t:"join",code,name}`,
`{t:"resume",code,token}`, `{t:"act",action}`, `{t:"approve",userId,ok}`,
`{t:"leave"}`, `{t:"history",types?,since?,limit?}`, `{t:"sync"}`, `{t:"export"}` (DM only),
`{t:"undo"}` and `{t:"redo"}` (DM only).

Server to client: `{t:"welcome",role,userId,name,code,token,approved}`,
`{t:"update",seq,events,state}` or `{t:"update",seq,events,patch}`, `{t:"lobby",members,pending}`,
`{t:"error",error,expired?}`, `{t:"history",entries,recent?}`, `{t:"export",table}`,
`{t:"undoable",undo,redo}` (DM only).

An update's `state` is the receiver's view of the game and never includes the
timeline. The first update a connection gets carries the whole view; later
ones carry a `patch` with only what changed, numbered by `seq`. A client that
sees a gap in `seq` sends `sync` and is sent the whole view again. The patch
format is in `packages/rules/src/patch.js`. Past entries come through `history`, redacted for players in the
same way as live events. On joining or rejoining, each client is sent its last
50 visible entries with `recent: true`.

## Limits and hardening

- **Address.** Limits are per client address: the first entry of `x-forwarded-for` when
  present, else the socket's address. Run behind a proxy that sets that header (the usual
  hosts do). With no proxy a client can forge it and dodge the per-address limits.
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
  scripts and connections only from this origin, Google Fonts for styles and fonts, and inline
  style attributes (the UI sets colours that way).
- **Sizes.** An action over 4 KB of JSON is refused with `That action is too large.` The one
  exception is the DM's `loadMap` and `mapEdit`, which carry a whole map document and may
  be up to 1 MiB. A player sending those is held to 4 KB. WebSocket frames are capped to match:
  16 KB until someone is seated as the DM, about 1 MiB after. A larger frame closes the
  connection with code 1009.
## Exporting a table

Tables live on one disk, so the DM can keep their own copy. **Export table** in the DM panel
sends `{t:"export"}`; the reply is `{t:"export", table:{code, exportedAt, state}}` and the
browser saves it as `hextable-<code>-<yyyy-mm-dd>.json`. Only the DM gets it; a player (or
anyone not yet let in) is answered with an error. `state` is the whole game state, including
the dice seed, hidden creatures and the timeline, which is why it is DM only. It holds no
`members` and no tokens. In solo play the same button saves the local state without
contacting a server. There is no import yet: loading a file back means accepting game state
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
  events reached them. Otherwise their update has no events.
- After every recorded action, undo and redo, the DM's connections get
  `{t:"undoable", undo:[labels], redo:[labels]}`, newest first. Players never do.
- Redo does not re-roll: the seed comes back with everything else, so the same
  action gives the same result. A new action after an undo clears what could be redone.
- The history is in memory only, per table. It is not saved with the table and is
  gone after a server restart. It keeps the last 30 steps, and drops the oldest
  sooner if the steps of one table pass 8 MB (a map edit keeps the parts of the map
  it changed; a big edit or `loadMap` can be large).

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
- Anyone with a table code can ask to join, and the DM decides. There are no
  accounts or passwords.
- The DM's browser runs the monster AI, so monsters wait while the DM is away.
