# Table server

Serves the game and runs multiplayer tables. One process, no dependencies.

```
npm start        # from the repo root: builds the site, then serves it on http://localhost:8080
```

| Setting | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Port to listen on |
| `DATA_DIR` | `./data` | Where tables are saved, one JSON file each |

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
- `src/ws.js` — a minimal WebSocket implementation on Node's `http` and `crypto`.
- `src/index.js` — HTTP, static files, `/api/ping`, `/ws`, and saving to disk.

## Protocol

JSON messages over the WebSocket at `/ws`.

Client to server: `{t:"host",name}`, `{t:"join",code,name}`,
`{t:"resume",code,token}`, `{t:"act",action}`, `{t:"approve",userId,ok}`,
`{t:"leave"}`.

Server to client: `{t:"welcome",role,userId,name,code,token,approved}`,
`{t:"update",state,events}`, `{t:"lobby",members,pending}`,
`{t:"error",error,expired?}`.

## Hosting

The server needs a host that runs a long-lived Node process, allows
WebSockets, and gives it a disk that survives restarts for `DATA_DIR`. The
`Dockerfile` in the repo root builds a ready-to-run image; mount a volume at
`/data`.

## Known limits

- Players are sent a view of the game, not the game: no dice seed, and other
  creatures only as name, position and a health word. They still see every
  creature that is not marked hidden, the whole map, and the DM's timeline is
  not yet split out for the DM. See `docs/specs/hidden-information.md`.
- The whole state is re-sent after every action. Fine for one table of this
  size; send only changes if maps grow large.
- Anyone with a table code can ask to join, and the DM decides. There are no
  accounts or passwords.
- The DM's browser runs the monster AI, so monsters wait while the DM is away.
