# Spec: sight

Status: proposed. Built so far: S1 (line of sight by centre and corners), S2 (cover) and S4 (light). Owner of the design: Claude (Fable).

Covers line of sight, cover, light and darkness, special senses, hiding and
finding hidden creatures, and what players are sent as a result. It builds on
`maps-and-objects.md`: walls, floors, regions and objects are defined there.

Rule details marked **(check)** are from memory of the SRD 5.2.1 and must be
confirmed against its text before coding.

## Where we are

- A wall has a kind that says whether it blocks sight. Nothing uses that yet
  except room reveal, which looks one hex.
- Whether an attack or spell can reach its target is `clear()`: a straight line
  between two hex centres, blocked by a wall that stops everything or by a
  floor. There is no cover: a target is fully exposed or untargetable.
- Players are sent whole regions once revealed. Inside a revealed room they see
  everything not hidden, around pillars and in the dark.
- `hidden` on a creature is a switch the DM sets. It lifts when the creature
  joins a fight or a party member comes within 10 feet. No roll is involved.
- There is no light. The conditions Blinded and Invisible exist as data, and
  the tag `attacker.unseen` exists but is never true.

## Goals

1. An attack through a doorway or past a pillar gets the cover the rules give.
2. The DM can run a dark cave: torches and Darkvision matter.
3. A creature can hide and be found by the rules, both ways: monsters from the
   party and the party from monsters.
4. Players are sent what their characters can see now, plus what they remember
   of places they have seen. Nothing else.
5. All of it is optional per table. A table that turns it all off plays as it
   does today.
6. It stays cheap: a phone must cope, and the server must not recompute the
   world for every message.

Not in this spec: illusions, scrying, sound, and spells that create light or
darkness as areas (those arrive as content once zones exist).

## The six decisions

### Decision 1: sight is worked out on hexes, from the centre and the corners

A hex-and-segment map has no need of exact visibility polygons. One question
is asked in three strengths:

- **Line of sight** from hex A to hex B exists if a straight line from the
  centre of A to the centre *or any corner* of B crosses nothing that blocks
  sight. Seven lines at most.
- **Cover** from A against a target in B counts how many of B's six corners
  can be reached by a line from the centre of A (decision 2).
- **Height**: a floor between the two blocks, as now. A sight-blocking wall
  blocks unless the line passes above its top. The line's height at the wall
  is interpolated between the two ends, which replaces today's rule that a
  wall counts only if neither creature is above it.

For big creatures the question is asked for each hex of the footprint and the
best answer is used.

What blocks sight: walls and curtains, shut doors, floors, objects whose
current state blocks sight, and solid hexes (rock). Creatures do not block
sight. Windows and rails never do.

**Why corners.** Centre to centre alone makes a creature in a doorway
invisible to anyone not exactly opposite, and it cannot express cover. Centre
to corners is the smallest rule that gets doorways, pillars and corners right,
and it is symmetric enough in practice: where A sees B but B does not see A,
the engine treats them as seeing each other.

**Cost.** Results are kept per map in a table keyed by the two hexes and
level, built on demand and thrown away when a wall or an object changes, as
the table of blocked steps already is. A creature's view out to 12 hexes is a
few hundred lookups.

### Decision 2: cover comes from walls and from creatures

| Corners of the target hex reached | Cover | Effect |
|---|---|---|
| 5 or 6 | none | |
| 3 or 4 | half | +2 to AC and Dexterity saves **(check)** |
| 1 or 2 | three-quarters | +5 to AC and Dexterity saves **(check)** |
| 0 | total | cannot be targeted directly |

- Lines are blocked for cover by anything that blocks *movement and sight*
  (a wall, a shut door, rock), by rails and low walls for half cover only, and
  by a window not at all.
- A creature standing in a hex the centre-to-centre line passes through gives
  half cover **(check)**. That is a table rule, on by default.
- Cover is a modifier, so it goes through the existing hooks: `ac` and
  `save.dex` with a new situation the modifier system is given by the attack
  or save in progress. Two new tags join the closed list: `target.halfCover`
  and `target.threeQuartersCover`. Content that ignores cover (Sharpshooter,
  Spell Sniper, when licensed content arrives) is then just data.
- An area's point of origin applies cover and total cover the same way, from
  the origin instead of an attacker. This replaces the centre-line shelter
  rule for areas.
- Total cover replaces `clear()`. Its message stays: "There is a wall between".

### Decision 3: light is a number per hex, worked out from sources

Each hex is **bright**, **dim** or **dark**.

- A map level has an ambient light: `bright` (daylight, a lit hall), `dim`
  (dusk, moonlight) or `dark` (a cave). A region may override its level.
- A **light source** is an object on the map or an item a creature carries,
  with a bright radius and a dim radius in feet (a torch: 20 and 20 more,
  confirmed in the SRD's Adventuring Gear). Carried lights are a field on the
  creature record; the DM's `setLight` action (not `give`, see the build notes)
  is the interim way to hand someone a torch, and equipment states (R10) make
  it proper.
- A source lights a hex if it has line of sight to it (decision 1). Light does
  not pass walls.
- The light at a hex is the best of ambient and every source that reaches it.
- Light is recomputed when a source moves, a door opens or the map changes.
  For a creature carrying a torch that is every step, but only for hexes
  within its radius.

What light does, by the rules **(check all three)**:

- Dim light is Lightly Obscured: Disadvantage on Wisdom (Perception) checks
  that rely on sight.
- Darkness is Heavily Obscured: a creature trying to see something there has
  the Blinded condition for that purpose.
- So attacking a target you cannot see has Disadvantage, and attacking when
  the target cannot see you has Advantage. These are the existing
  `attacker.unseen` tag and a new `target.unseen` tag, now given real answers.

### Decision 4: senses are data on the creature

`senses: { darkvision: 60, blindsight: 10, tremorsense: 0, truesight: 0 }`,
in feet, on the record. Monsters already list them in the SRD.

- **Darkvision**: within its range, dim counts as bright and dark as dim.
- **Blindsight**: within its range, sees without light and sees the Invisible,
  but not through total cover.
- **Truesight**: sees in darkness and sees the Invisible within range.
- **Tremorsense**: knows where creatures touching the ground are within range,
  without seeing them. It defeats hiding, not darkness penalties.

One function answers everything else in this spec: `canSee(state, viewer,
target)` returns `yes`, `dim` (seen, but Lightly Obscured) or `no`, from line
of sight, the light at the target's hex, the viewer's senses, and the target's
conditions (Invisible) and hidden state (decision 5).

### Decision 5: hiding is a roll, and finding is a roll or a passive score

The DM's `hidden` switch stays, for setting an ambush by fiat. Beside it:

- **Hide** is an action **(check: the Hide action, DC 15, and what it
  requires)**. A creature may try it when no enemy can see it: it is Heavily
  Obscured or behind three-quarters or total cover from every enemy. It rolls
  Dexterity (Stealth). On 15 or more it is hidden, and the total is kept on
  the creature as the DC to find it.
- A hidden creature has the Invisible condition's benefits against anyone who
  has not found it. Who has found it is a list on the creature: hidden is
  per observer, not all or nothing.
- **Finding.** The Search action (already built for objects) also finds hidden
  creatures within range whose DC the roll meets. If the table rule for
  passive noticing is on, each enemy's passive Perception is compared with the
  DC when the hider comes into its line of sight.
- **Hiding ends** when the creature attacks, casts a spell with a spoken
  component, makes a sound louder than a whisper (the DM's call, by the
  existing reveal action), or an enemy finds it **(check)**. Being found by
  one enemy reveals it to that enemy's side, which keeps the table simple.
- Monsters hide and seek by the same rules. The monster AI gains two
  behaviours only: it does not act on creatures it has not found, and one
  whose stat block has a Stealth bonus may open by hiding.

### Decision 6: players are sent what the party sees now and what it remembers

Three layers, each a table rule so a table can stop at any of them:

1. **Rooms** (built). Regions reveal as the party reaches them. Inside a
   revealed room everything is visible.
2. **Line of sight** (`sight: 'los'`). A creature or object is sent only if
   some party member has line of sight to it. Map tiles and walls stay as
   sent once revealed: that is the party's memory of the place. Creatures that
   leave view vanish from the player's map; the client may show a last-seen
   marker, which is the client's business.
3. **Light** (`sight: 'light'`). As layer 2, and what is seen depends on
   light and senses through `canSee`. Tiles that have never been lit for the
   party are not sent even in a revealed region, so a dark cave is discovered
   by torchlight.

Design points:

- **The party sees as one.** A table shares one view: the union of what its
  members can see. Per-player views ("only you see the goblin") are possible
  later because `view()` already takes a viewer, but they multiply the
  server's work and split the table's attention, so they are not proposed.
- **Region reveal by sight.** With layer 2 or 3 on, a region is revealed when
  a party member has line of sight into it, instead of standing beside it.
  Looking down from a gallery then works.
- **Memory is state.** Which tiles the party has seen is kept per level as a
  set in the game state (`map.seen`), so that it survives a reload and is the
  same for everyone. It only grows, except by the DM.
- **The server stays the authority.** Sight is worked out in the rules
  package, in `view.js` and its helpers. The client never decides what it is
  allowed to know. The tests are the same in kind as for hidden creatures: a
  creature out of sight is in no message to a player until it comes into
  view, and a guessed id answers as if it did not exist.
- **Targeting.** A player cannot target what the party cannot see. A creature
  seen by a companion but not by the attacker can be targeted, with the
  unseen-target penalty, which is what the rules give when you know where
  something is.
- **Cost.** The party's view changes only when a party member moves, a light
  moves, or a door or the map changes. The server keeps the last view per
  table and updates it then, not per message. This also removes most of the
  cost noted in the hidden-information spec, where a full view is built per
  player per update.

## Table rules

| Setting | Values | Default |
|---|---|---|
| `cover` | `on`, `off` | `on` |
| `creatureCover` | `on`, `off` | `on` |
| `sight` | `rooms`, `los`, `light` | `rooms` |
| `passiveFind` (exists) | `off`, `traps`, `all` | `off` |

`sight: 'rooms'` with `cover: 'off'` is today's game, except that total cover
is judged by corners instead of one line.

## What changes for content

- Monsters: `senses` on the record (the content agents entering monsters can
  add it now; the linter accepts it once S4 lands).
- Objects: an optional `light: { bright, dim }` per state, so a brazier can be
  lit or out.
- Conditions: Blinded and Invisible already exist as data. Their modifiers
  move from "always" to "when the attacker cannot see the target" and the
  reverse, using the two unseen tags.
- New tags in the closed list: `target.halfCover`,
  `target.threeQuartersCover`, `target.unseen`. `attacker.unseen` exists.

## Known costs and risks

- **Corner tests are an approximation.** A sliver of wall can flip a corner
  count. The DM can always override by setting cover off for a moment or by
  the existing manual tools. Real tables argue about cover too.
- **Light is the expensive layer.** Many torches on a big map mean many
  recomputations. Radii are short, and results are cached per source.
- **Layer 3 changes how a map is drawn.** The renderer needs to dim and hide
  tiles, which is cheap, but it is a visible change the renderer plan must own.
- **Asymmetric sight** is resolved in favour of seeing. The reverse would let
  a creature attack without being attackable, which feels worse.
- **Per-observer hiding** adds a list to every hidden creature and a check in
  every view. It is bounded by the number of creatures in a fight.

## Tasks

| # | Task | Who | Touches | Done when |
|---|---|---|---|---|
| S1 | Line of sight by centre and corners, with height; cached; replaces `clear()` for total cover | Fable | new `sight.js`, `engine.js` | An attack through a doorway works from the side; a pillar blocks; every existing wall test still passes |
| S2 | Cover as modifiers: half and three-quarters from walls and creatures, the two cover tags, table rules | Fable | `sight.js`, `modifiers.js`, `schema.js`, `engine.js` | A goblin behind a low wall has +2 AC and the log says why |
| S3 | Senses on records, in the linter and the monster bridge | any agent | `schema.js`, `content/index.js`, monster data | Darkvision 60 on a monster reaches the engine |
| S4 | Light: ambient per level and region, sources on objects and creatures, light per hex | Fable | `sight.js`, `map.js`, `engine.js` | A torch lights 20 feet bright and 20 more dim, and not past a wall |
| S5 | `canSee`, the unseen tags, Blinded and Invisible through them | Fable | `sight.js`, `modifiers.js`, conditions data | Attacking into darkness has Disadvantage; Darkvision removes it |
| S6 | Hide action, per-observer found lists, Search and passive finding of creatures, AI respects it | Fable | `engine.js`, `ai.js`, `view.js` | A rogue hides behind a pillar and attacks with Advantage; a search finds a hidden goblin |
| S7 | Views by line of sight and by light; seen-tile memory; region reveal by sight; the party's view cached on the server | Fable | `view.js`, `space.js`, `tables.js` | A goblin that walks behind a wall leaves the player's messages; a dark cave is sent as it is lit |
| S8 | Renderer: remembered but unseen tiles dimmed, light shown, last-seen markers | any agent, after the renderer plan | `render.js` | A player can tell what is in view from what is remembered |
| S9 | UI: Hide button, cover and light shown when aiming, the table rules in the DM panel, ambient light in the map editor | any agent | `app.js`, editor | A player sees "half cover" before attacking |

S1 and S2 are worth having on their own and change nothing a table must opt
into. S4 to S7 are the dark-cave work and depend on each other in that order.

## Build notes

- **Corners sit a little inside the hex** (S1), at nine tenths of the way out, so
  a wall on a hex's own far edge is not counted as in front of it. A corner
  counts only if it is on the target's own side of any wall that cuts through
  its hex, which matters for traced walls that do not follow hex edges.
- **Lines run at mid-body height** (S1), 2.5 ft above each creature's feet. A
  wall stops a line if the line is below the wall's top, 10 ft, where they meet.
- **Solid hexes (rock) do not block sight yet** (S1). Only walls, shut doors and
  floors do.
- **Cover is added directly** (S2) to Armor Class in the attack roll and to a
  Dexterity save, and the attack or save event carries `cover` so the log can
  say why. The two cover tags are in the vocabulary and judged, for content that
  will later ignore cover.
- **A trap's own attack ignores cover** (S2): it has no place to be judged from
  that would be fair.
- **Creature cover** (S2) is given by a creature whose hex centre lies within
  1.5 ft of the line between attacker and target, and not by one next to the
  attacker's own hex end or the target's.
- **Light** (S4). A level and a region may carry `light`: `bright`, `dim` or `dark`; a region's
  wins over its level's, and with neither a place is bright, so every existing map is lit as
  before. The DM sets them with the `level` and `region` map edits (`light: null` restores the
  default). A thing on the map gives light in a state that has `light: { bright, dim }` (the
  brazier and the campfire: 20 and 20, as a torch). A creature carries `light: { bright, dim }`,
  set by the DM action `setLight` with an item from `content/lights.js` (SRD gear: Candle 5 + 5,
  Torch 20 + 20, Lamp 15 + 30, Hooded Lantern 30 + 30, or 0 + 5 with the hood lowered) or with
  radii; `item: null` puts it out. The Bullseye Lantern's cone is not supported. Distance to a
  light counts height by the `vertical` table rule.
- **Seeing is not reaching** (S4). Light, and from S5 sight, go by `inView`: the S1 lines stopped by
  anything that blocks sight (walls, curtains, shut doors, floors), where cover and total cover go
  by what blocks movement and sight. So light passes a window or a rail, and a curtain stops it.
  Light is kept per source and position and thrown away when a wall, door or the map changes; a
  carried light that moves is a new source, worked out only for the places asked about.
