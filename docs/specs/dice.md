# Dice on the screen

Status: built in two parts: the faces in events and the `diceThrow` table rule
(rules, #116), then the dice themselves and throwing them (client).

The owner asked to see rolls as dice thrown across the screen, thrown by the
player or the DM, and for that to be a choice.

## 1. The dice shown are the engine's dice

Nothing about how a result is decided changes. The engine rolls from the seed
in the game state as before; the client draws the numbers it was sent. A die
lands on the face the event says. A viewer never sees a die whose number they
were not sent, so dice carry no new information to a player.

## 2. Faces in events

Every event that comes from a roll carries the faces it showed:

    dice:  [{ sides, value, drop?, neg? }, ...]
    bonus: number

The used faces (not `drop`), each negated where `neg`, plus `bonus` add up to
the event's number. `drop` marks the d20 that Advantage or Disadvantage set
aside; `neg` a die taken off (Bane's -1d4). Dice added by modifiers (Bless,
Guidance) are part of `dice`.

| Event | The number the faces make |
|---|---|
| `attack`, `save`, `check`, `concentration` | `total` |
| `deathSave` | `total`, or `roll` where there is no `total` |
| `damage`, `heal`, `tempHp` | `rolled` if present, else `amount` |
| `recharge` | `roll` |
| `encounterStart` (each entry of `order`), `joined` | `init` |

`rolled` is on a damage, healing or Temporary Hit Points event only when what
the dice made is not what landed: halved by a save, changed by Resistance,
Vulnerability or immunity, clamped at 0, or kept Temporary Hit Points (amount
0). Damage events also carry `by`, the creature that rolled (`null` for a thing
on the map or a fall). Damage from one hit split into parts (slashing and
fire) has each part's own faces. An area spell's damage is rolled once, so
every target's event shows the same faces.

Not covered: the d4 of a `damage.taken` adjustment (the Resistance cantrip) is
in `adjusted`, not in `dice`; a Search's second d20 for Dim Light is never
shown, as before. Lay On Hands, the DM setting Hit Points and Stable's 1 Hit
Point roll nothing and have no faces.

## 3. What each viewer gets (view.js)

The DM gets everything. A player gets faces only where they already get the
number those faces make:

- `attack`, `save`, `check`, `concentration`, `deathSave`, initiative: with the
  whole roll, that is, for the party's own rolls. A monster's attack is still
  only hit or miss, its save only success or failure, its initiative only its
  place in the order. None of these carry `dice` to a player.
- `damage`, `heal`, `tempHp`: if one of the party rolled them, the faces,
  `bonus` and `rolled`. Otherwise only when the faces and bonus make exactly
  the amount the player is told; a monster's damage that Resistance halved
  shows no dice, since what it rolled was never told.
- `by` is never sent. `recharge` is never sent to players (as before).

`packages/rules/test/dice.test.js` holds the property tests: over whole fights
the faces make each event's number, and no player message holds faces that do
not make a number in that same message.

## 4. Who throws: the table rule `diceThrow`

`diceThrow` is in `SETTINGS` (state version 12; an older game migrates to
`auto`):

| Value | Meaning |
|---|---|
| `auto` (default) | an action is sent as soon as it is chosen; its dice are thrown for you |
| `throw` | an action that will roll is armed; a tray shows its dice; a tap, click or flick throws them, and **the action is sent at the throw** |

Under `throw` the action is not sent until the throw, so nothing is decided
before it, and every screen shows the same roll (the faces come from the
server's events). Cancel puts the action back unsent. Actions that roll:
attack, cast, act (a monster action), check, search, hide and using an object
with a check. Moving, ending a turn and the rest are sent as before.

The tray shows the dice the action will roll as far as the client can tell
from the action (a d20 for an attack, check or search; a spell with only a
save shows the spell's name). The tray is a promise of when, not what: the
faces always come from the engine.

The DM throws for monsters the same way. The DM's "auto for monsters" option
(per device, on by default) lets the monster AI's turns go without waiting.
Each device also has "always auto-throw mine", which acts as `auto` for that
person's own actions only.

**Limit: rolls inside someone else's action.** A save against a monster's
spell, an opportunity attack, a Concentration save, a death save at the start
of a turn: these happen inside an action someone else sent, and the affected
player cannot be asked to throw without a prompts system, which does not
exist (docs/DEBT.md T6). Those dice are thrown on their behalf and labelled
with whose roll it is.

## 5. Drawing (client, `packages/client/dice.js`)

- A 2D canvas overlay over the board, drawn only while dice are moving: no
  frame cost at rest. Each die is drawn as a projected 3D solid (d4, d6, d8,
  d10, d12, d20; d100 as two d10s, tens and units) with a scripted tumble:
  it is thrown from the roller's side of the screen, spins on two axes,
  bounces and slows, and settles with the chosen face up. No physics, no
  dependency.
- Colour: the roller's side (party, or the DM's monsters), the roller's name
  on the label. Advantage and Disadvantage show two d20s, the unused one
  dimmed. A natural 20 on an attack is marked critical, a natural 1 a miss.
  The total is shown, then the dice fade and clear.
- At most 12 dice at once; more are summarised as "+N more" on the label.
- Per-device preference `dice: off / quick / full`, stored like the theme
  preference (`localStorage`). `quick` is a short throw (about 0.6 s), `full`
  about 1.4 s. `prefers-reduced-motion` makes `full` behave as `quick` with
  no spin.

## 6. Waiting for the dice

While dice are in the air on a client, that client's log lines, hit point
changes and floaters for that update wait until they settle; a tap anywhere on
the dice skips. The server never waits. With dice off nothing waits. This is
the first piece of the event timeline in docs/specs/renderer.md (decision 2:
log lines on their beat), done for dice only; the timeline, when built,
should treat a throw as the beat before an attack, save or damage.

The log line of a roll gains small glyphs for the faces the viewer was sent.

## 7. Where the controls are

- DM panel, Fight: "Dice" (the table rule `diceThrow`) and "Throw the monsters'
  dice for me (on this device)".
- Log panel, on every device: "Dice on this device" (full, quick, off) and
  "Always throw my dice at once".
- `npm run smoke` arms an attack under `throw` and checks that nothing is applied
  until the throw, solo at both sizes. At a two-browser table it checks that the
  DM sees the player's throw, and that the player is shown no d20 of a monster.

Not done: the dice are drawn on a 2D canvas, not in the WebGL scene, so they do
not land on the board or cast shadows on the pawns. Opposite faces of the drawn
d20 do not add up to 21 the way a real die's do. The tray's preview of an
attack's damage dice is text only.
