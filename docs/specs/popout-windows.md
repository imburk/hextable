# Spec: pop-out windows

Status: agreed design (the owner's answers of 21 November, and "merge the design", 26 November); not built.

Issue #626. Nothing here is built. The owner, 20 November: split
the game across windows (map in one, character sheet in another, log, dice and turn order in others) and Alt-Tab between
them. Decided by the owner and not reopened here: one window holds the connection; pop-outs are `window.open` of the same
origin and talk over a `BroadcastChannel`; they send actions back through the main window; they get the same player view and
nothing more; solo and tables both work.

## Rules that bind this design

- **Everything goes through `apply()`.** A pop-out never calls the engine or opens a connection; its taps become the
  actions the main window would send, and the server decides.
- **A pop-out knows only what the owner window knows**, not one field more than `T.on.update` gave the owner.
- **A rejected action changes nothing**, and the pop-out is told why in words.
- **Phones are not offered pop-outs** (Decision 7). No dependency, no bundler, rules package untouched.

## Where things are today

- `transport.js` makes one object, `{ you, send, undo, on: { update(state, events), error, ... } }`, for solo or a table.
  `app.js` holds it as `T`, the state as `S`, and the UI as module globals; `T.on.update` ends in `refresh()`.
- Panels are not modules yet: the sheet is `renderSheet()` in `app.js`; the log is `logview.js`, the turn order `tracker.js`,
  the dice `dice.js`, all reading globals. The map is the WebGL renderer `R`.
- #625 gives each window its own table seat and a solo save one writer, so a second normal window is never a view of the first.
- The protocol has no message numbers (review section 4). **R7** adds an `id` to every action and `re: id` and a `code` to
  every answer. Pop-outs depend on it (Decision 3).
- #627 adds `pickui.js` (`el`, `accordion`, `pickRow`, `chip`, `reveal`); review R6 makes that the one `ui.js`. Panels use it.

## Decisions

Each has options, a choice, and the reason. The owner may overrule any.

### 1. Which window owns the connection

1. **The window that holds the game is the owner; pop-outs never connect.** Chosen.
2. A `SharedWorker` holds the connection. Rejected: missing on Android Chrome and older Safari; the solo engine would move.
3. Each pop-out connects itself. Rejected: a second seat (#625) and, in solo, two writers.

A window opened with `#popout=...` is never an owner: it does not read or write `hextable.session`, `hextable.lastSession`
or `hextable.solo`, and does not call `claimWriter`.

### 2. How pop-outs get state and events

**A `BroadcastChannel` named `hextable.pop.<id>`, where `<id>` is a random 128-bit string the owner makes and keeps in its
own `sessionStorage`** (so a reload of the owner keeps it). Chosen. Rejected: `postMessage` over a window handle (`noopener` removes it); `localStorage` events (slow, leaky).

The id matters: two owner windows of one browser can be a DM and a player (#625), and a fixed name would hand the DM's view
to the player's pop-out. The id travels in the URL fragment (`index.html#popout=<id>&panel=sheet`), never sent to a server.

Messages, all JSON, all with `v: 1` and a type from a closed list:

| From | Type | Carries |
|---|---|---|
| pop-out | `hello` | `{ panel, pid }` (`pid` is the pop-out's own random id) |
| owner | `state` | `{ seq, fresh, you, state, packs }`: the view the owner's `received()` was given, whole |
| owner | `events` | `{ seq, events }` with the same `seq`, so the log and dice can show what happened |
| owner | `ui` | `{ selId, theme, reducedMotion }`: what a panel follows (which character, the look) |
| owner | `bye` | the owner is closing or leaving the table |
| pop-out | `act` | `{ pid, id, action }` |
| owner | `ack` | `{ pid, re: id, ok, code?, error? }` |
| pop-out | `focus` | `{ what }`: "show this on the map" (Decision 3) |

`state` is sent whole (27 to 87 KB today), cloned once per update for all listeners. A later row sends patches if measured to matter. `seq` rises by one per update; a pop-out that sees a gap waits for
the next `state` (the owner sends a whole one every 10 updates and on any `hello`), and drops anything with a `seq` lower than
its own. `packs` is the owner's own content overlay, so a homebrew spell shows by name.

**The view is the owner's, not a second one.** The owner forwards what it was given; in solo that is what the solo screen shows. A test pins that nothing is added.

### 3. How pop-outs send actions

**Through the owner.** The pop-out posts `act`; the owner checks the shape and the size, then calls the same `act()` its own
UI uses, so a pop-out's action is exactly what a tap in the main window would send. The server still checks it with the sender's role. Chosen; the alternative is Decision 1's rejected option.

**This needs R7.** Without a message id the owner cannot tell a pop-out which of its taps was refused: an error comes back
as unnumbered text and the owner would have to guess whose it was. With R7 the owner sends the pop-out `ack` with the
matching `re`, and the pop-out can show "Pending", then a result or the refusal in place. So **the build starts after R7**; read-only pop-outs first is question 3.

Actions that need the map (aiming, choosing a hex) are not made in a pop-out: its button says "Aim on the map window" and
sends `focus`; the owner arms the action as if pressed there and tries `window.focus()` (a browser may refuse; Alt-Tab is
the player's). Plain actions (a rest, a feature, an item, ending a turn, a roll) work in the pop-out.

The owner accepts only: a closed list of message types, `action.type` as a string already known to the engine's table (the
same test `apply()` makes), a size under the transport's action cap, and no more than 20 messages per second per `pid`.
Anything else is dropped and counted, not answered.

### 4. When the owner closes

1. **Pop-outs go quiet and offer to open the game normally.** Chosen. On `bye`, or 10 seconds of silence, a pop-out keeps its
   last state, greys it, says "The main window closed. Open the game here" (a link to the ordinary page, where #625's Rejoin
   finds the seat) and sends nothing. A reload of the owner keeps its id, so pop-outs wake by themselves.
2. Close all pop-outs. Rejected as the only behaviour: unkind when the owner was only reloaded. Exception: when the player
   leaves the table for good (`reallyLeave`), `bye` says so and pop-outs close.
3. Promote a pop-out to owner. Rejected: it would hand the seat token or solo save over a channel, and it has no renderer.

### 5. Solo and table

Both work the same way: an owner with a transport. In solo the owner holds the single-writer claim (#625) and the pop-out never
saves; undo, redo and rewind stay the owner's. At a table a player's pop-out shows that player's view, the DM's the DM's; when
the owner reports the link down, pop-outs show "Waiting for the main window".

### 6. Which panels pop out first, and how they are built

**Order: turn order, log, dice, sheet. The map later.** Chosen. The first three mostly read, so they prove the channel with
little risk; the sheet sends many actions; the map is the WebGL renderer with camera, selection and pointer paths, and a second
instance is its own piece of work. The owner asked for the map too: a later stage, not dropped (question 2).

A panel is a module with one shape: `mount(host, ctx)` builds it with the shared UI module and returns `{ update(view),
destroy() }`. `ctx` is `{ you, send(action) -> Promise<ack>, follows(), theme }`, one shape for both windows (in the main window
`send` is `act()`; in a pop-out it is the channel with R7's ack). A panel reads only `view` and `ctx`, never `S`, `T`, `R`
or the canvas; where the sheet and tracker do today, the extracting row fixes that first, in the main window, with the old
tests passing.

The pop-out page is `index.html` in popout mode: `popout.js`, the panel, the shared UI module and the style sheets; no
Three.js, no `app.js`. The title names panel and character ("Hextable: Sheet, Brenna") for the Alt-Tab list. A pop-out is the
owner's own seat, so it keeps all its controls and carries a small panel label. The sheet follows `ui.selId`, with a pin; the
dice window plays the throws of the events it receives with `dice.js`. Sizes are remembered per panel in
`hextable.popout.<panel>` (a size only); pop-outs are not reopened on load (question 5).

### 7. Mobile

**Not offered on phones, and not on touch tablets in the first stage.** Chosen. The button shows only when
`matchMedia('(pointer: fine) and (min-width: 900px)')` matches and `BroadcastChannel` exists. A phone's `window.open` makes a
tab, and a second tab costs memory the game needs. A touch tablet waits until tried (question 4). Nothing changes on a phone.

### 8. Browser support and fallbacks

`BroadcastChannel` has been in Chrome, Edge and Firefox for years and in Safari since 15.4. The pop-out button needs it and
`window.open`; if either is missing the button is not drawn and nothing else changes (the same rule #625's `solowriter.js`
follows when it has no Web Lock). The other cases:

- **Popups blocked:** `window.open` with `noopener` returns `null` either way, so the owner waits 3 seconds for `hello`;
  none shows "Your browser may have blocked the window. Allow pop-ups for this site and try again."
- **Pop-out gone:** the owner stops posting to a `pid` silent for 15 seconds.
- **Storage off:** works; the channel needs none (the owner's id lives in memory).
- **Another profile or device:** not supported; that is a seat.

### 9. Security

- **Same origin only.** A `BroadcastChannel` reaches only same-origin pages of one browser profile; no server is involved.
- **No `window.opener`.** `window.open(url, name, 'popup,noopener,width=..,height=..')`: neither side has a handle on the
  other, and `sessionStorage` is not copied in (a copy would hand over the seat, #625). Cost: blocked-popup detection by
  handshake, and the owner closes pop-outs by `bye`.
- **The channel id** keeps one owner's view from another owner's pop-outs and from stray tabs. It is no defence against
  script already in the origin; that is the page's own policy (`script-src 'self'`), which a pop-out keeps.
- **Messages are untrusted input to the owner**: closed types, shape and size checks, rate limit; the server checks again.
- **Nothing secret crosses:** no token, session, save or seed; `state` is the player's view; packs as the owner holds them.
  The pop-out loads same-origin files only.

## Tests

- **Unit, with fake channels.** `popchannel.js` takes the channel class as an argument (as `claimWriter` takes `BC`). Cases:
  hello gets a whole state; a `seq` gap waits; stale `seq` dropped; unknown type, oversize message and flood dropped; `act`
  reaches `act()` and returns the ack for its `id`; a refusal shows the owner's words; `bye` and silence grey a pop-out;
  another id hears nothing; the pop-out's view is deep-equal to the owner's; a source test that the pop-out imports no
  `transport.js`, `app.js` or renderer.
- **A two-page smoke** (pattern: `scripts/smoke/windows.mjs` from #625): owner plus a pop-out from its button. Same turn
  order; a sheet action arrives and the map updates; a refusal shows in the pop-out; an owner reload wakes it; closing the
  owner greys it; a second owner (another seat) is not heard. At 390x844 the button is absent.

## Build plan

Small rows, in order, each its own pull request. Rows 1 to 3 are the base; each panel row adds one module.

| # | Row | Files | Done when |
|---|---|---|---|
| 0 | **Prerequisites** (not this spec's work): R7 (message ids and codes), #603 (`pickui.js`) and review R6 (one `ui.js` and one `ctx`) | `transport.js`, `packages/server/src/*`, `client/pickui.js` | `send` returns a promise of the ack, `re: id` is on every answer, and the shared UI module is on `main` |
| 1 | **The channel**: protocol, `seq`, validation, rate limit, fake channel for tests | `client/popchannel.js`, `client/test/popchannel.test.js` | the unit cases above pass; the module has no imports |
| 2 | **Owner side**: fan out `state`, `events`, `ui`, `bye`; take `act`, answer `ack`; the per-owner id | `client/popowner.js`, `app.js` (a call in `received` and `start`), its test | with a fake pop-out, an update reaches it, an action goes through `act()`, a refusal returns with the owner's words; main window unchanged |
| 3 | **Pop-out shell**: `#popout=` mode, `popout.js`, title, grey-out on `bye` and silence, the open-normally link | `client/index.html`, `client/popout.js`, `client/popout.css`, test | a page loaded with the fragment mounts a stub panel, shows owner state, greys when the owner goes; it imports no `transport.js` |
| 4 | **Turn order panel**: extract `tracker.js` to the panel shape; first pop-out | `client/tracker.js`, `client/popout-panels.js`, tests | the main window's tracker still passes its tests; the pop-out draws the same rows |
| 5 | **Log panel**: `logview.js` to the panel shape | `client/logview.js`, tests | same rows, same fight grouping, in both |
| 6 | **Dice panel**: the events' throws played in a window | `client/dice.js`, tests | a throw seen in the owner is seen in the pop-out, once |
| 7 | **Sheet panel**: extract `renderSheet()`; sends through `ctx.send`; follow and pin; `focus` for aimed actions | `client/app.js` (the extraction), `client/sheetpanel.js`, tests | the sheet's actions work from the pop-out; a refusal shows there; aimed ones say "Aim on the map window" |
| 8 | **The button**: in the drawer, per panel, hidden on phones and where the browser lacks the pieces; blocked-popup message; size memory | `client/drawer.js`, `client/popout.js`, `client/settings.js`, tests | the button follows Decision 7 and 8 in a phone-size and a desktop-size test |
| 9 | **Two-page smoke** | `scripts/smoke/popout.mjs`, `scripts/smoke.mjs` | the scenario above passes in CI |
| 10 | **Patches instead of whole states**, if the numbers ask for it | `client/popchannel.js` | the same tests pass; bytes per update shown in the test |
| 11 | **Map in its own window** (a second renderer; the camera and pointer paths) | after a renderer review | decided with the owner (question 2) |

## Questions for the owner

Each has a default; if you say nothing, the default is what gets built.

1. **Close or promote when the main window closes?** Default: pop-outs grey out and offer "Open the game here"; they do not
   close and are never promoted (Decision 4).
2. **Is the map in a window part of the first release, or a later one?** Default: later (row 11). The first release is turn
   order, log, dice and sheet.
3. **If R7 is late, ship read-only pop-outs first (rows 1 to 6, no sending)?** Default: no; wait for R7 so the sheet is not
   a second class of window.
4. **Touch tablets?** Default: not offered in the first release; a fine-pointer tablet or a laptop with a touch screen is.
5. **Reopen the pop-outs you had last time when the game starts?** Default: no. A browser allows `window.open` only from a tap,
   so the game could only offer one "Reopen" button. Sizes are remembered.
6. **Should the sheet window follow the selected character or stay on one?** Default: follow, with a pin button.
7. **May a pop-out undo and redo for the DM?** Default: no; the DM does that from the owner.
8. **Several pop-outs of one kind?** Default: one per panel; a second request focuses the first (by window name).
