# Spec: hidden information

Status: tasks 1 and 2 built (views, and the server sending them); 3 to 5 open. Owner of the design: Claude (Fable). Tasks at
the end are sized for one pull request each.

## Problem

After every action the server sends the complete game state to every player.
A player who opens the browser console can read:

1. **The dice seed** (`state.rng`). The client also has the rules engine, so a
   player can run `apply()` on a copy and see the result of any action before
   taking it. This is the most serious leak: it breaks every roll.
2. **Monster numbers**: exact hit points, Armor Class, attack bonuses and
   saving throws of creatures they are fighting.
3. **The DM's chronicle and the whole timeline**, which will hold plot the
   players have not discovered and is what an AI DM will read.
4. **Creatures the party has not met.** Every monster on the map is in the
   state from the start.

Two related costs: the state is about 31 KB for the starter valley and is
re-sent in full after each action, and `state.timeline` grows without limit.

## Goals

- A player's browser receives only what that player's characters could know.
- The DM's browser, and any AI DM, still receive everything.
- The rules engine stays pure and replayable; hiding is a separate layer.
- Solo play is unchanged (the solo player is the DM).
- The client keeps using engine helpers (`moveOptions`, `targetsFor`,
  `blocked`, `areaHexes`) on what it receives, without special cases.

Not in this spec: line of sight, light and fog of war. Those decide *which*
creatures and hexes are visible; this spec builds the mechanism they will
plug into, with a manual "hidden" flag as the first rule.

## Design

### 1. Views

A new pure module, `packages/rules/src/view.js`:

```js
view(state, viewer)                 // -> a new object, safe to send to that viewer
viewEvents(events, state, viewer)   // -> the events that viewer may see, redacted
```

`viewer` is `{ role, userId }`, the same shape `apply()` takes as `ctx`.

- `role: 'dm'` gets the state and events untouched (the same objects, no copy).
- Anyone else gets a redacted deep copy built field by field from an allow
  list. Anything not listed is not sent. New state fields are therefore
  hidden by default until someone decides otherwise.

The server calls `view()` and `viewEvents()` once per approved member each
time it sends an update. The engine never sees a view and never produces one.

### 2. What a player's view contains

Top level:

| Field | Player view |
|---|---|
| `version`, `seq`, `clock`, `settings` | as is |
| `rng` | **removed** |
| `map` | as is (terrain is public for now) |
| `timeline` | **removed** from state (see section 4) |
| `entities` | filtered and redacted, below |
| `encounter` | redacted, below |

Each creature falls into one of three classes for a given viewer:

| Class | Who | What is sent |
|---|---|---|
| **Open** | every creature with `side: 'party'` | the full record. Players at a table share their sheets, which matches how the UI already shows party numbers. |
| **Seen** | any other creature that is not hidden | the public record, below |
| **Hidden** | a creature with `hidden: true` | nothing. It is absent from `entities` and from every event. |

The public record of a **Seen** creature:

```js
{ id, name, kind, side, tpl, pos, look, dead,
  hp,          // 1 if it is up, 0 if it is down or dead; never the real number
  health,      // 'healthy' | 'bloodied' | 'down' | 'dead'
  cond }       // only prone, unconscious, dodging: what you could see by looking
```

`hp` is kept as 0 or 1 so that `up(e)` and the helpers that call it work on a
view unchanged. `bloodied` means at or below half its hit point maximum.
Everything else (`maxHp`, `ac`, `abil`, `prof`, `attacks`, `spells`, `slots`,
`features`, resistances, `death`, `uses`, `gear`) is not sent.

Monster stat blocks in `content/` are public SRD text and ship with the
client; that is fine. What is hidden is this particular creature's state.

`encounter` for a player:

- `order`: ids in order. `init` and `dex` are kept for Open creatures and
  removed for Seen ones. Hidden creatures cannot be in an encounter (section 5).
- `budget`: sent only while the active creature is Open; otherwise all zeros
  (`{move: 0, action: 0, bonus: 0}`), so the engine's helpers run on a view
  without a null check.
- `id`, `center`, `radius`, `arena`, `round`, `turn`, `flags`: as is.

### 3. What a player sees of events

Events are what the log and floating numbers are drawn from. Rule of thumb:
a player sees what the DM would say out loud at a table.

| Event | Player sees |
|---|---|
| any event whose `id`, `actor` or `target` is Hidden | dropped |
| `attack` by an Open creature | everything except `ac` when the target is Seen |
| `attack` by a Seen creature | `actor`, `target`, `name`, `hit`, `crit`, `mode`, `why`, `opportunity`. No `rolls`, `nat`, `total`. `ac` only when the target is Open |
| `damage`, `heal` | `amount`, `dtype`, `note` as is. `hp` becomes the 0 or 1 value and a `health` field is added when the target is Seen |
| `save` | Open creature saving: as is. Seen creature saving: `id`, `abil`, `success`, plus `dc` only when the caster is Open |
| `deathSave` | as is (only player characters make them) |
| `encounterStart`, `joined` | `init` and `dex` removed for Seen creatures |
| `chronicle` | dropped unless the entry has `public: true` |
| `cast` | as is, with any Hidden creature removed from `targets` |
| `moved`, `turn`, `stood`, `cond`, `std`, `note`, `down`, `died`, `claimed`, `released`, `rest`, `time`, `encounterEnd`, `spawned`, `placed`, `revealed` | as is |
| any event type not named in this table | dropped, so a new event type is private until it is listed |

`viewEvents` needs the state to classify creatures. It is called with the
state as it is *after* the action. One consequence to handle: a creature that
was Hidden before the action and revealed by it must have its reveal sent
first (see section 5), so the client knows the creature before it sees the
event about it.

### 4. The timeline leaves the state

`state.timeline` stays in the server's state and in saved tables, because it
is the record the DM and an AI DM read. It is no longer part of what is sent
after each action.

- Players get events as they happen (already true) and nothing else.
- The DM's client gets the chronicle through a new message,
  `{t:"history", types, since, limit}`, answered with
  `{t:"history", entries}` from `recall()`. The DM panel's chronicle list
  uses it. Players may call it too; their answer is passed through
  `viewEvents`.
- On join or resume, each client gets the last 50 visible entries so the log
  is not empty.

Solo play keeps `timeline` in its local state and calls `recall()` directly,
as now.

### 5. Hidden creatures

- New optional creature field `hidden: true`, set by the DM when spawning or
  through a new DM-only action `{type:"reveal", actor, hidden: false|true}`.
  The DM panel gets a "Hidden" checkbox when adding a creature and a
  Reveal/Hide button on the selected creature.
- A Hidden creature is revealed automatically, in the engine, when:
  - it becomes part of an encounter (starting or joining one), or
  - it is attacked, targeted or caught in an area, or
  - a party creature moves within `ENGAGE_RANGE` of it (this already starts a
    fight when auto-engage is on), or
  - a party creature tries to move onto its hex. The move stops short and the
    creature is revealed, so a refused move never silently confirms that
    something is there.
- Revealing emits `{type:"revealed", id}`. `viewEvents` sends `revealed`
  first in the batch, and the view sent with it already contains the creature.
- Hiding a creature that is in an encounter is refused.

This is deliberately a DM switch, not the SRD's Hide action or the Invisible
condition. Those are creature abilities with their own rules and come with
the conditions work in the rules expansion spec.

### 6. Sending only changes

Once views exist, the server keeps, per connection, the last view it sent and
sends a patch.

```js
{ t: "update", seq, events,
  patch: {
    entities: { [id]: record | null },   // changed or new records; null = gone
    encounter,                           // present only if it changed (null = fight over)
    clock, settings,                     // present only if changed
    map                                  // present only if the map changed
  } }
```

- `seq` counts updates per table. A client that receives `seq` other than
  last + 1 sends `{t:"sync"}` and gets a full `{t:"update", seq, state}`.
- Change detection is by comparing each record's JSON with the last one sent.
  At this scale that is cheaper and safer than tracking mutations in the
  engine. The map is compared by a version number bumped when tiles change.
- Welcome, resume and sync always send full state.

Expected effect on the starter valley: a move goes from about 31 KB per
player to well under 1 KB.

## Security properties to test

These are the acceptance tests for the whole spec. Each is a test in
`packages/rules/test/view.test.js` or `packages/server/test/`.

1. **No seed.** For any player viewer, `JSON.stringify(view(...))` does not
   contain the key `rng`, at any depth.
2. **No fake dice.** `rand()` throws when the state has no integer seed, so
   applying an action to a view fails loudly. (Today a missing seed silently
   behaves as seed 0.)
3. **Allow list.** Add an unknown field to the state and to a monster; neither
   appears in a player view.
4. **Canary.** Give a monster distinctive values (hp 7919, ac 97, an attack
   named `CANARY`) and play a whole AI-driven fight. No message sent to a
   player contains `7919`, `"ac":97` or `CANARY` unless that attack was used,
   in which case only its name appears.
5. **Hidden means absent.** With a hidden monster on the map, no player
   message contains its id until a `revealed` event for it has been sent.
6. **Helpers still work.** `moveOptions`, `targetsFor`, `blocked` and
   `areaHexes` run on player views of every state reached in a whole
   AI-driven fight without throwing, and `moveOptions` returns the same
   reachable hexes as on the full state whenever no Hidden creature is
   involved.
7. **DM unchanged.** A DM viewer gets the identical state object and events.
8. **Patches converge.** Applying every patch in order to the first full
   state yields exactly the full view at the end, for every viewer, across a
   whole fight; and a dropped update triggers a sync that restores it.
9. **Chronicle stays private.** A DM chronicle entry never reaches a player
   unless marked public.

## Client changes

- The creature card and pawn health bar read `health` for Seen creatures and
  never divide by `maxHp` when it is absent.
- The character sheet button is offered only for Open creatures (already the
  case; make it depend on the record having `abil`, not on `side`).
- The log formats redacted `attack` and `save` events ("The goblin hits
  Brenna" with no numbers).
- The DM panel's chronicle list uses the `history` message when online.
- `transport.js` applies patches and requests a sync on a gap.

## Known limits after this work

- A player still sees every non-hidden creature anywhere on the map, and the
  whole map. Line of sight is the next layer.
- Damage amounts dealt to monsters are visible, so a careful player can work
  out a monster's remaining hit points. That matches play at a real table.
- The DM's browser still runs the monster AI and so must hold everything.
  Moving the AI to the server is separate work.
- Anyone who can read the server's disk can read everything.

## Tasks

Each is one pull request and must keep `npm test` green. Tasks 1 to 3 are the
ones that close the leaks; do them in order.

| # | Task | Touches | Done when |
|---|---|---|---|
| 1 | `view()` and `viewEvents()` with the allow lists above; seed guard in `rand()` | `packages/rules/src/view.js`, `rng.js`, new test file | Properties 1, 2, 3, 6, 7 pass. No other file changes. |
| 2 | Server sends views; client tolerates redacted records | `tables.js`, `app.js`, `render.js` | Properties 4 and 9 pass against the real server; the two-browser play-through still works on desktop and phone sizes |
| 3 | Timeline out of the state; `history` message | `tables.js`, `transport.js`, `app.js` | A player's messages never contain `timeline`; the DM's chronicle list still works |
| 4 | Hidden creatures: field, `reveal` action, automatic reveal, DM controls | `engine.js`, `view.js`, `app.js`, `index.html` | Property 5 passes; engine tests for each automatic reveal |
| 5 | Patches and `sync` | `tables.js`, `transport.js` | Property 8 passes; a move sends under 1 KB per player |

Tasks 1 to 4 touch the rules engine or the server's trust boundary and should
be built or reviewed by the strongest available model. Task 5 is mechanical
once 1 to 3 are in.
