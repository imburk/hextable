# Table server (not built yet)

The client already speaks the protocol this server will implement. With no
server present, `GET ./api/ping` fails and the client runs solo in the browser.

What the client expects (see `packages/client/transport.js`):

- `GET /api/ping` → `{ "ok": true }`
- WebSocket at `/ws`, JSON messages:
  - client → server: `{t:"host",name}`, `{t:"join",code,name}`,
    `{t:"resume",code,token}`, `{t:"act",action}`, `{t:"approve",userId,ok}`
  - server → client: `{t:"welcome",role,userId,name,code,token,approved}`,
    `{t:"update",state,events}`, `{t:"lobby",members,pending}`,
    `{t:"error",error,expired?}`

The server owns the game state, runs every action through
`apply(state, action, {role, userId})` from `packages/rules`, and broadcasts the
result.
