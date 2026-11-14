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
- Colour: the roller's side (party, or the DM's monsters). Advantage and
  Disadvantage show two d20s, the unused one dimmed. A natural 20 on an attack
  is marked critical, a natural 1 a miss. The result is shown, then the dice
  fade and clear.
- At most 12 dice at once; more are summarised as "+N more dice" under the title.
- Per-device preference `dice: off / quick / full`, stored like the theme
  preference (`localStorage`). `quick` is a short throw (about 0.6 s), `full`
  about 1.4 s. `prefers-reduced-motion` makes `full` behave as `quick` with
  no spin.

### 5.1 Titles (#236)

Every throw carries a title for as long as it is on screen, in the air and at
rest: **who, and what for**. It is built from the event that caused the roll
and the events before it in the same update, never from log text
(`titleOf` and `nextSource` in dice.js):

| Event | Title |
|---|---|
| `attack` | `Brenna: Longsword attack`; `Goblin: Opportunity Attack (Scimitar)` |
| `damage`, `heal`, `tempHp` | `Brenna: Longsword damage`; the attack or spell before it, when it hit this same target; else only `Fire damage`, `Healing` |
| `save` | `Goblin Warrior 2: Dexterity save vs Burning Hands` (`against` of the event, else the spell, action or attack before it that names this creature) |
| `check` | `Pip: Stealth check`, `Pip: Hide (Stealth)`, `Brenna: Search`, `Pip: Force open (Iron door)` |
| `concentration`, `deathSave`, `recharge`, `joined` | `Brenna: Concentration (Bless)`, `Pip: Death Save`, ... |
| initiative | `Initiative`, with each name and number under it |

Under the title, once the dice are down, the result as before (`17 vs AC 15 ·
Hit`). The title wraps to two lines on a phone and keeps clear of the camera
buttons, the turn order and the dock.

**Several rolls in one action.** Each roll is its own throw with its own
title, in order (attack, then its damage; each target's save). Advantage and
Disadvantage are one roll, one title, two d20s. An area spell's damage is one
roll shared by every target: one title (`Odessa: Burning Hands damage`), the
targets in the line under it. When an update has more than four throws the
first three keep their titles and the rest are thrown together as `N more
rolls`.

**What a viewer is shown.** A title uses only what the viewer's own view
already tells them (view.js, section 3):

- A creature that is not in the state the viewer was sent is `Someone`. A
  player's state has no record of a creature the DM has hidden, and its
  attacks and saves are not sent at all, so they have no throw and no title.
- `by` is never sent to a player, so a player's title for damage names the
  roller and the weapon or spell only when the attack, spell or action before
  it in the same update was sent to them, hit this target and no new turn,
  move or fight has begun since. A hidden creature's damage that was sent
  (faces and amount agree) is therefore just `Slashing damage`: no name, no
  weapon. The DM is sent `by` and everything else, so the DM's title names
  the roller (`Goblin Warrior 1: Scimitar damage`).
- A check's DC is never in a title. A DM-only roll is never sent to a player.
- Limit: a hidden creature's damage that follows, on the same target and in
  the same update, a visible attack that hit it is indistinguishable for a
  player from that attack's own further damage part and takes its title.

### 5.2 Lying on the board (#236)

The dice rest in the plane of the board, seen from the camera that is on
screen: `R.cameraAngles()` (renderer.js; `{ yaw, pitch }`, implemented in
render.js and render-three.js) is read every frame. The camera turn is `Rx(pitch)`
after `Ry(-yaw)`; it takes the board's up to `(0, cos pitch, sin pitch)` on
screen. A settled die is its chosen face taken to world up, plus a twist
about up chosen so the number is upright on screen for the camera that threw
it (a little jitter either way). The tumble is turned in world space and
seen through the camera, so a die follows the camera if it turns mid-throw.
Under the dice are a patch of the board (an ellipse flattened by the sine of
the pitch) and a shadow under each die at the point it stands on (the lowest
vertex: a d4 balances on a point, which a real one does not, as before).
Rows of dice go up the screen by the sine of the pitch, but never closer than
the dice are tall.

*Readable at every pitch.* The cameras allow pitch 0.45 to 1.45 rad. The number
on the top face is foreshortened by `sin(pitch)`, at least 0.43. The plane is
kept; the die is biased instead: drawn up to 1.9 times larger at the
shallowest pitch (`sizeBias`, 1.0 from straight above), and the counted face's
numeral is drawn larger once the others have faded (`topScale`, up to 1.5
times more at the shallowest pitch). A phone (390 px wide) at 0.45 rad shows a
d20's number about 19 px tall; a unit test holds it above 14. If twelve dice
do not fit between the turn order and the dock the dice shrink to fit.

### 5.3 Only the rolled number stays (#236)

From the moment a die settles, the numerals on its other faces fade out over
0.35 s (`quick`) or 0.45 s (`full`), after a 0.05 s pause, leaving only the
counted face's number, which grows a little. With Advantage the set-aside d20
is dimmed and keeps its own top number, so which die counted is still plain.
The tray still shows every face (it is not on the board).

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

Not done: the dice are drawn on a 2D canvas, not in the WebGL scene: they lie
in the board's plane as the camera sees it (5.2) but do not cast shadows on the
pawns or hide behind a tree or a wall. Opposite faces of the drawn
d20 do not add up to 21 the way a real die's do. The tray's preview of an
attack's damage dice is text only.
