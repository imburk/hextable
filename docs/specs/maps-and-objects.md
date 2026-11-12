# Spec: maps and objects

Status: agreed. Built so far: M1 (map document, levels, height in positions), M2 (walls and doors), M3 (regions and reveal), M4 (objects, triggers, hidden things), M5 (checks and finding), M6 (height in play), M7 (size and footprints). M8 to M14 are open. Owner of the design: Claude (Fable).

Covers what a map is, buildings and caves, walls and doors, floors and
height, creature size, objects with states (doors, levers, chests, traps),
finding hidden things, revealing a place room by room, handouts, and scenes
for conversation. It also covers how maps get into the game.

It replaces decision 5 ("one model of space") and task R9 of
`rules-expansion.md`, which described height and size on their own. They
are designed here together with walls and floors because all three change
what a position is.

Rule details marked **(check)** are from memory of the SRD 5.2.1 and must be
confirmed against its text before coding.

## Where we are

A map today is one flat sheet of hexes: `map.tiles["q,r"] = { t, h }`, where
`t` is a terrain type and `h` a height used only for looks. A creature's
position is `{ q, r }`. There are no walls, no doors, no floors, no objects,
and every creature fills one hex. Players are sent the whole map.

The questions this spec answers came from play:

- How does a party check for a secret door, or fall into a pit trap?
- How do we show a puzzle, or run an interview with an NPC?
- How do we run a building or a cave, and how does one get into the game?

## Goals

1. A DM can run a multi-floor building or a cave with rooms that are
   revealed as the party explores.
2. Doors, levers, chests and traps are things on the map with states, and
   the engine runs them from data in the same step vocabulary as spells.
3. Hidden things stay hidden from players' browsers until found, by a
   search, by passing close, or by the DM.
4. A map made elsewhere can be brought in, and a map made here can be saved,
   shared and reused.
5. Conversation, puzzles and private notes have a place at the table that
   does not pretend to be combat.
6. Everything already true stays true: one `apply()`, pure and replayable,
   and views decide what players are sent.

Not in this spec: line of sight, light and cover (the sight spec, which
builds on the walls defined here), mounts and vehicles, weather, and
generating maps with AI beyond naming where it would plug in.

## The seven decisions

### Decision 1: a map is a document, separate from the game

A map is one self-contained JSON document:

```js
{
  format: 1, id: "old-watchtower", name: "The old watchtower",
  hexFeet: 5,
  levels:  [ { id: "ground", name: "Ground floor", z: 0,  tiles: { "0,0": { t: "stone" }, ... }, image: null },
             { id: "upper",  name: "Upper floor",  z: 10, tiles: { ... } },
             { id: "cellar", name: "Cellar",       z: -10, tiles: { ... } } ],
  walls:   [ { id: "w1", level: "ground", a: [x1, y1], b: [x2, y2], kind: "wall" }, ... ],
  objects: [ { id: "o1", def: "door-wooden", level: "ground", at: { q: 2, r: 0 }, edge: 3, state: "closed" }, ... ],
  regions: [ { id: "hall", name: "Entrance hall", level: "ground", hexes: ["0,0", "1,0", ...] }, ... ],
  starts:  [ { level: "ground", q: 0, r: 0 } ],
  assets:  { "bg-ground": { kind: "image", bytes: 184213 } },
}
```

- A table's game state holds its own copy of the map it is playing on, plus
  what has changed in play (which doors are open, which regions are
  revealed). Editing the copy never changes the saved original.
- A map can be exported to a file, imported, kept in a library on the
  server, and shipped inside a content pack as part of a scenario.
- The current generated valley becomes a map document with one level. Its
  generator stays as one way of making a map.
- `format` is the document's own version, with its own `migrate`.

### Decision 2: position has height, and floors are levels

A creature's position becomes `{ q, r, z }`, with `z` in feet.

- A **level** is a sheet of hexes at a base height `z`. A tile may add its
  own offset (`h`, in feet) for slopes, steps and rubble. Standing on a tile
  puts a creature at `level.z + tile.h`.
- A creature is either **standing** (its `z` matches a tile under it, on
  some level) or **in the air**. Nothing else is stored: which level it is
  on is worked out from `z`.
- Moving between neighbouring hexes on foot is allowed when the height
  difference is small. Proposed: up to 2.5 feet is free, up to 5 feet is
  Difficult Terrain, and more needs climbing **(the thresholds are a design
  choice, not SRD text)**.
- **Stairs and ramps** are simply tiles whose offsets rise from one level to
  the next. **Ladders, ropes and trapdoors** are objects that connect two
  positions (decision 4).
- **Movement modes.** A record has a speed per mode: walk, climb, swim, fly,
  burrow, plus `hover`. Climbing a tree, a wall or a ladder and flying are
  the same mechanism moving through `z`, which is why fighting from a tree
  or a balcony needs no separate code.
- **Distance** uses all three axes. How vertical distance combines with
  horizontal is a table rule, since tables differ.
- **Falling.** A creature with nothing under it and no way to stay up falls
  to the next tile below and takes falling damage **(check amounts and
  limits)**. That covers a flyer knocked Prone, a floor that gives way, and
  a pit.
- A tree, a ledge or a bridge is a small level or a single raised tile: a
  place to stand at a height, with whatever is under it still usable.

### Decision 3: size is a footprint

Size (`tiny` to `gargantuan`) is data on the record. Each size has a
footprint: the set of hexes it fills, anchored on one hex, and a height in
feet.

- Proposed footprints: Tiny, Small and Medium fill one hex; Large three;
  Huge seven; Gargantuan twelve. The table lives in the content pack.
- Movement, reach, areas, opportunity attacks and "is this hex free" all
  work on footprints. Several Tiny creatures may share a hex.
- A creature fits through a gap only if its footprint does; squeezing
  follows the size rules **(check)**.
- One creature can be **attached to** another (grappled and dragged,
  swallowed, carried, later mounted): its position follows the other's.

### Decision 4: walls are line segments; the hex grid is derived from them

A wall is a line segment in map coordinates on one level, with a kind:

| Kind | Blocks movement | Blocks sight |
|---|---|---|
| `wall` | yes | yes |
| `window` | yes | no |
| `rail` (low wall, fence) | yes | no |
| `curtain` (also fog, foliage) | no | yes |
| `door` | when closed | when closed (a door is an object with a wall of its own) |

- Movement between two neighbouring hexes is blocked if a blocking segment
  crosses the line between their centres. The engine works that out once
  per level and keeps a table of blocked edges, rebuilt when a wall or door
  changes.
- **Why segments and not "walls on hex edges".** Painted walls can still
  snap to hex edges, and those are just segments that happen to lie on
  them. But maps traced from an image or imported from another tool have
  walls wherever the picture has them, and most published maps are drawn on
  squares. Segments hold both without loss, and they are what the sight
  calculation will need.
- **Solid hexes** remain: rock, deep water, a pillar. A cave is mostly solid
  hexes with open ones carved out, which is quicker to paint than walls.
- A square-grid map under a hex grid never lines up exactly. A corridor one
  square wide may be one hex wide in places and blocked in others. The
  editor shows blocked hexes while tracing so the DM can nudge a wall, and
  the DM can mark any hex open or closed by hand. This is a known cost of
  choosing hexes.

### Decision 5: objects are data with states, and they act through effect steps

An object is something on the map that is not a creature: a door, a lever,
a chest, a statue, a trap, a campfire, a ladder. Like spells and monsters,
objects are defined once in a content pack and placed on maps.

```js
// definition, in content/srd52/objects.js
{
  id: "pit-trap", name: "Pit trap", source: "SRD 5.2.1", tier: "auto", checked: false,
  states: ["hidden", "open"], initial: "hidden",
  find: { dc: 15 },                       // what it takes to notice it
  disarm: { dc: 15, tool: "thieves-tools", sets: "open" },
  triggers: [
    { on: "enter", when: { state: "hidden" }, sets: "open",
      effects: [{ save: "dex", dc: 15, onFail: [{ fall: 10 }] }] },
  ],
  text: "A covered pit. Anyone who steps on it must leap clear or fall in.",
}
```

- **States.** An object is always in exactly one of its named states.
  Players see the object as it is in its current state, or not at all if
  that state is hidden.
- **Interactions.** `use` lists what a creature can do to it and what that
  takes: an action or a free interaction, a check against a DC, a key. A
  door has open, close, lock, unlock, force. Each sets a new state and may
  run effect steps.
- **Triggers.** `on` is one of a closed list: a creature enters its hex,
  leaves it, comes within a distance, uses it, or another named object
  changes state. A trigger may be once only.
- **Effects** are the same steps spells use, so a trap that fires arrows is
  an attack step and one that fills a room with gas is a save in an area.
  Anything the steps cannot say is a `manual` step, shown to the DM.
- **Linking.** A lever names the object it works: pulling it sets the
  portcullis to `raised`. Chains of these make simple mechanical puzzles
  that the engine can run.
- **Blocking.** An object says per state whether it blocks movement and
  sight (a closed door, a raised portcullis, a statue).
- **Connecting.** A ladder, rope or trapdoor connects two positions; using
  it moves the creature between them at a movement cost.

Three additions to the closed step vocabulary are needed, each an engine
change recorded here:

| New step | Meaning |
|---|---|
| `fall` | the target drops a number of feet, or to the next surface, and takes falling damage |
| `set` | put a named object into a named state |
| `reveal` | make a hidden object or creature known to the players |

`move` was already in the vocabulary and is implemented with this work.

### Decision 6: hidden things, and three ways to find them

Any object, and so any door, can be hidden. A hidden object is not sent to
players at all, exactly as hidden creatures already are not. A hidden door
is sent as plain wall.

It is found in one of three ways:

1. **Searching.** A creature takes the Search action. The engine rolls its
   Wisdom (Perception) check once and reveals every hidden thing within a
   stated distance whose `find.dc` the roll meets. What counts as "within"
   and whether a wall blocks it is refined by the sight spec; until then it
   is a distance on the same level inside revealed regions.
2. **Passing by.** As a table rule, when a creature moves, its passive
   Perception is compared with the DC of each hidden thing it comes near.
   Choices: off, on for everything, on for traps only.
3. **The DM** reveals it, whenever the story calls for it.

Stepping onto a hidden trap triggers it; the existing rule for walking onto
an unseen creature already stops movement there. A trap that is found is
shown to everyone and can be avoided or disarmed.

This needs **ability checks**, which the engine does not have yet: a d20
plus an ability modifier plus proficiency in a skill or tool, through the
`check` hook in the modifier system. Records gain skill and tool
proficiencies, entered by hand in quick entry and derived for built sheets.
The check action is general: `{ type: "check", actor, skill | ability, dc? }`.
Only the DM may set or see a DC.

### Decision 7: regions reveal a place room by room

A region is a named set of hexes on one level: a room, a corridor, a cave
chamber, the outside. Each is either revealed or not.

- Players are sent only what lies in revealed regions: their tiles, the
  walls around them, the objects and creatures in them. An unrevealed room
  is simply absent from their browser.
- A region is revealed when a party member enters it, when a door into it
  is opened, or when the DM taps it. Once revealed it stays revealed.
- A creature in an unrevealed region is not sent, which also covers the
  monsters waiting in the next room without the DM marking each one hidden.
- Hexes in no region are always sent. A map with no regions behaves as maps
  do today.

This is not line of sight. Inside a revealed room everything not hidden is
visible, even around a pillar, and a room is revealed all at once. It is
how most virtual tabletops ran for years, it needs no geometry, and it is
what makes a dungeon playable soon. The sight spec later narrows what is
seen *within* revealed space and adds light and darkness. It replaces
nothing here.

## Putting a place into the game

Four routes, all producing the same map document. They are listed in the
order they should be built.

1. **Paint it in the game.** A DM-only editor on the same 3D view: pick a
   terrain and paint hexes, set heights, add a level, drag walls (snapping
   to hex edges or free), drop doors and other objects from the pack, draw
   regions. It must work on a tablet. This is enough for small sites,
   improvised scenes and caves.
2. **Trace an image.** Upload a picture as the floor of a level, set its
   scale by marking a known distance, then draw walls, doors and regions
   over it. This is how most people will bring in maps they already have.
3. **Import a file.** The Universal VTT format is the one to read first. It
   is a JSON file that carries the map image together with walls, doors and
   windows as line segments, and lights. Several map-making tools export
   it and several tabletops read it, under the extensions `.dd2vtt`,
   `.df2vtt` and `.uvtt`. Because this spec stores walls as segments, an
   import is close to a direct copy. Tools differ in how they mark doors and
   windows, so an imported map opens in the editor for a check before play.
   Reading this format has not been tested against real files yet.
4. **Generate it.** "A five-room cave" made by rules or by an AI, then
   corrected in the editor. The generator's only job is to output a map
   document, so nothing else needs to know how it was made.

A map never arrives with secret doors or traps already hidden from the DM.
Those are added in the editor, where they show plainly.

### Images and other files

Background images and handouts are **assets**: files stored on the table
server and referred to by id.

- Only the DM of a table may upload. Accepted types are a short list of
  image formats; each file and each table has a size limit.
- An asset is served only to members of the table it belongs to.
- Solo play keeps assets in the browser's own storage, with a smaller limit.
- Assets a map refers to are exported with it.

This is the first time the server stores files people upload. It is a
security boundary and is reviewed as one.

## Sharing things that are not on the map

### Handouts

A handout is a picture or a piece of text the DM shows: a riddle, a rune
wall, a letter, a portrait, a map fragment.

- The DM prepares handouts ahead and shows one to everyone or to chosen
  players. Who has been shown what is part of the game state, so a player
  who rejoins still has it.
- Players can open any handout they have been shown, and point at it;
  everyone looking sees the pointer.
- A puzzle with moving parts (levers, plates pressed in order) is objects on
  the map and is run by the engine. A puzzle that is a picture and an
  answer is a handout and is judged by the DM.

### Notes to one player

The DM can send a note to one player ("only you notice the smell of
smoke"), and a player can send one to the DM. The view system already
decides who is sent what; a note is an event with a list of recipients.

### Scenes

Not everything happens on a grid. A **scene** is a mode of the table for
conversation, with no map and no turns:

- a title and a picture, and the people present: the party and one or more
  NPCs with a name, a portrait, and notes only the DM sees;
- a running transcript of what is said, in or out of character;
- **checks on request.** A player asks to make an Influence or Insight
  check, or the DM calls for one. The engine rolls it with the character's
  real numbers against a DC the DM sets and keeps private;
- what was learned is written to the chronicle with one tap.

The DM switches between the map and a scene; a fight can start from either.
The transcript and the chronicle are the record an AI DM, or an AI playing
an NPC, will read and speak from, so a scene is also where that plugs in
later.

## What players are sent

Additions to the view layer, all by allow list:

| Thing | A player is sent |
|---|---|
| Levels and tiles | those in revealed regions, and those in no region |
| Walls | those touching a revealed region; a hidden door as plain wall |
| Objects | those in revealed regions that are not in a hidden state, with their current state but not `find`, `disarm` DCs or untriggered triggers |
| Regions | their outline and name once revealed; nothing before |
| Creatures | as now, and additionally none in an unrevealed region |
| Handouts | those shown to them |
| Notes | those addressed to them |
| Scene | title, picture, people present, transcript; never the DM's notes or a DC |
| Assets | those referred to by something else they were sent |

The properties to test are the same in kind as for hidden creatures: a
hidden object's id, a DC, an unrevealed room's contents and the DM's NPC
notes reach no message to a player until the moment they are revealed, and
a guessed id gets the same answer as one that does not exist.

## How it looks

The renderer has to draw several levels, walls with height, doors, and
objects, and get out of the way: floors above the party fade out, and so do
roofs when someone is inside. The current hand-written renderer can draw
walls and a level at a time. Anything richer (real interiors, models for
furniture, light) belongs to the renderer plan, which is the next spec
after this one and decides the move to Three.js. Nothing in this spec
depends on that move; the map document and the rules are the same either
way.

## Known costs and risks

- **Hexes against square maps.** Described under decision 4. It will
  annoy people who import a lot of published maps. A square-grid mode for
  the whole engine is a far larger change and is not proposed.
- **Regions are coarse.** A long L-shaped room is revealed at once. The DM
  can split it into two regions.
- **Uploads** make the server hold files, with all that implies for limits,
  abuse and backups.
- **Checks** are new engine ground and touch every character record.
- **The map in the state gets bigger.** Sending only changes already keeps
  updates small, but the first full view of a large building is large.
  Sending one level at a time is the remedy if it matters.
- **Footprints change most movement code.** Every "is this hex free" and
  every distance has to think about more than one hex.

## Tasks

Order matters down to M5. After that the editor, assets and scenes can run
in parallel.

| # | Task | Who | Touches | Done when |
|---|---|---|---|---|
| M1 | Map document: format, levels, `z` in positions, the valley as a one-level map, state migration. No change in play | Fable | `engine.js`, `hex.js`, `scenario.js`, `migrate.js`, `view.js` | Every existing test passes; a saved table loads; positions carry `z` |
| M2 | Walls and doors: segments, blocked edges, door object with open, close, lock, force; drawn simply | Fable, renderer part any agent | new `walls.js`, `engine.js`, `render.js` | A creature cannot walk through a wall; opening a door unblocks it for everyone |
| M3 | Regions and reveal | Fable | `view.js`, `engine.js` | Nothing in an unrevealed room reaches a player until a party member enters or a door opens |
| M4 | Objects: definitions, linter, instances, states, interactions, triggers, linking; `set`, `reveal`, `fall`, `move` steps | Fable | `content/schema.js`, new `objects.js`, `effects.js` | A lever raises a portcullis; a pit trap fires from data |
| M5 | Checks and finding: skills on records, the check action, Search, passive finding as a table rule | Fable | `engine.js`, `modifiers.js`, quick entry | A secret door is found by a search that meets its DC and not by one that does not |
| M6 | Height in play: standing and in the air, step limits, climb, fly, fall, distance in three axes | Fable | `engine.js`, `hex.js` | A character climbs to a ledge and shoots from it; a flyer knocked Prone falls |
| M7 | Size and footprints | Fable | `engine.js`, `hex.js`, `render.js` | A Large creature blocks three hexes and cannot enter a one-hex corridor |
| M8 | Map editor, paint mode | any agent, reviewed | `app.js`, `index.html`, `render.js` | A DM builds a three-room cellar with a door and a region on a tablet |
| M9 | Assets and handouts, with upload limits | any agent, security review by Fable | `packages/server`, `app.js` | The DM shows an image to one player and no one else can fetch it |
| M10 | Editor: trace an image | any agent | editor | A downloaded battle map becomes a playable level with walls and doors |
| M11 | Scenes, transcript, notes to one player | any agent, view review by Fable | `app.js`, `tables.js`, `view.js` | An interview with an NPC is run and its outcome lands in the chronicle |
| M12 | Import Universal VTT | any agent | importer | A file exported by a map tool opens in the editor with its walls and doors |
| M13 | Object content: doors, traps, levers, containers from the SRD | any agent | `content/srd52/objects.js` | Linter passes; tier set honestly |
| M14 | Generate a map | later | generator | Outputs a valid map document |

M1 to M3 give a playable dungeon with doors and rooms that reveal. M4 and
M5 add traps and secret doors. M6 and M7 are the height and size work that
`rules-expansion.md` called R9.

## Build notes

Where the build settled a detail the design left open, or changed it.

- **Object states are records, not a list** (M2). `states: { closed: { name, blocks: ["move", "sight"] }, ... }`.
  A state says what it blocks and, from M4, whether it is hidden. The example
  under decision 5 shows the earlier list form.
- **What a creature can do to an object is `use`** (M2): each entry has `from`
  states, a `to` state, a `time` (`free` or `action`), and optionally `key` or
  a `check`. In a fight the first object handled on a turn is free and anything
  more takes the action **(check against the SRD's rule on interacting with
  objects)**.
- **Reach** (M2). A door is used from within 5 ft of its line; a thing from its
  own hex or the next.
- **Keys** are items named in a creature's gear; the DM hands them out with the
  `give` action.
- **Walls stop attacks and spells now, not only movement** (M2). Until the sight
  spec, the engine draws a straight line between the two hex centres and refuses
  an attack or a targeted spell if a wall or shut door crosses it; areas do not
  reach creatures behind one; and walking up to a wall does not start a fight
  with what is behind it. Windows, rails and curtains do not stop attacks. This
  is cruder than cover and is replaced by the sight spec.
- **Editing in play** (M2). The DM action `mapEdit` takes a list of changes
  (tile, level, wall, object, starts), applies them to a copy and lints the
  copy, so a bad edit changes nothing. The editor (M8) is a UI over this action.
- **Checks on objects are handed to the DM until M5.** Picking or forcing a lock
  spends the action and tells the DM the check and DC; players are not told the DC.

- **A region is revealed by standing beside it, not only in it** (M3). A party
  member reveals the region they stand in and any region next to them with
  nothing blocking sight between. That is what makes an open archway work: a
  player cannot tap a hex they have not been sent. An opened door reveals the
  room behind it only if someone from the party is beside the door to look.
- **Unseen creatures stay out of fights** (M3). A creature in an unrevealed
  region does not join a fight or trigger one; it joins when its region is
  revealed. If it attacks or casts from there, its region is revealed.
- **Walls are sent in pieces** (M3). Players get only the stretches of a wall
  that run beside hexes they have been shown, so a long wall does not draw the
  outline of rooms they have not seen. A level with nothing shown is not
  mentioned at all. Objects are sent without their DCs.
- **The DM can hide a region again** (M3), outside a fight and with no party
  member in it.

- **Triggers** (M4) are `{ on, from, to?, effects?, feet?, who?, area? }` with `on`
  one of enter, leave, near. Only a thing in a hex has them. A trigger with
  effects ends the walk of whoever set it off. Being placed by the DM or shoved
  sets nothing off.
- **Linking lives on the map, not in the definition** (M4). A placed object has
  `links: [{ object, when, sets }]`: when it enters state `when`, `object` is
  put into `sets`. A lever's definition therefore knows nothing about gates.
  The whole chain is worked out and checked before anything changes. Players
  are never sent links. The `set` and `reveal` steps remain for effects.
- **Hidden is a property of a state** (M4), and `find: { to }` names the state
  an object is found in. Finding a secret door moves it from `secret` to
  `closed`. An object in a hidden state is not sent; a hidden door that blocks
  is sent as a wall, and walls are sorted and renumbered in what players are
  sent so that nothing marks which one is not a wall.
- **Known traps and paths** (M4). No path runs across a trap its walker knows
  about. The party knows the traps it has spotted and may still step onto one on
  purpose; other creatures know all of them and never do.
- **`fall` in M4 is damage and Prone only**: 1d6 Bludgeoning per 10 feet, 20d6 at
  most, Prone if any damage was taken **(check)**. The creature's height does
  not change until M6. **`move`** shoves a creature away from or toward the
  source, hex by hex, stopping at walls, drops and other creatures.
- **A trap's attack has no creature behind it** (M4): its events carry
  `actor: null` and the trap's name.
- The objects in the pack (doors, portcullis, secret door, lever, pressure
  plate, pit trap, arrow trap) are Hextable's own generic definitions, marked
  as such, not SRD text. The SRD's sample traps are M13.

- **Checks** (M5). A creature record has `skills`, `expertise` and `tools`
  (lists) and, for monsters, `skillBonus` (listed totals). The `check` action
  rolls any skill or ability; with a DC from the DM, players are sent their roll
  but neither the DC nor whether it was met. Checks made on an object (picking a
  lock, disarming) do show their outcome, since the object shows it anyway, but
  never the DC. A tool check needs the tool in the creature's gear.
- **Search** (M5) is one Wisdom (Perception) roll against every hidden object
  within 15 feet that touches a hex the players have been shown, with nothing
  solid between. It takes the action in a fight. The 15 feet is a design choice.
- **Noticing in passing** (M5) is the table rule `passiveFind`: `off` (the
  default, as the 2024 rules lean), `traps` or `all`. It compares passive
  Perception with what is hidden within 10 feet before a walk starts and after
  each step, and a walk stops when something is noticed.
- **Disarming** (M5). The pit and arrow traps have a `disarm` use: a Dexterity
  check with Thieves' Tools once the trap has been spotted.
- Still to come from decision 6: hidden *creatures* found by a search. That
  needs Stealth against Perception and belongs with the sight spec.

- **Ways of moving** (M6). A creature has `speed` (walking) and `speeds`
  (`climb`, `swim`, `fly`, `burrow`), and may `hover`. In a fight the ways of
  moving share the turn: what is left of each is its Speed less everything moved
  so far, so `budget.move` (walking feet left) can go below zero after flying.
- **Climbing** (M6). A rise or drop of more than 5 ft between neighbouring hexes
  is a climb: 5 ft for the hex plus the height, doubled without a Climb Speed.
  The way must be open above the lower place, and only a wall at the top blocks
  it. The table rule `climbing` turns it off. No check is asked for.
- **Ladders** (M6). An object whose definition has `connects: true` joins its hex
  to the place named in its `to`. Going along it costs the height as a climb.
- **Flying** (M6). A flyer moves in 5 ft steps in any of the six directions,
  level, rising or dropping, or straight up or down, each costing 5 ft. It
  cannot pass through a floor, passes over rails, and is stopped by walls up to
  10 ft above their level's floor. Things on the floor do not notice it. The
  engine looks for routes up to 40 ft above the highest floor or the flyer.
- **Falling** (M6). After every action, whatever has nothing under it and cannot
  stay up drops to the surface below and takes falling damage. A flyer stays up
  with a Fly Speed above 0 unless it is Prone or Incapacitated and cannot hover
  **(check)**. This is also what happens when a floor is removed under someone.
- **Distance** (M6) counts height by the table rule `vertical`: `max` (the
  default: a diagonal counts once), `sum`, or `true` (straight line). Under 5 ft
  of height counts as none. Areas have height: a cone, sphere or emanation
  reaches as far up as across; a cylinder as high as its size unless its data
  gives a `height`.
- **Floors block** (M6). An attack or spell is refused if a floor lies between
  the two creatures. A wall blocks only if neither is above its top. Both are
  centre to centre and are replaced by the sight spec.
- Not built from decision 2: swimming and burrowing have speeds but no rules of
  their own yet, and two creatures landing in one hex are left for the DM.

- **Footprints** (M7) are 1, 3, 7 and 12 hexes: the hex, a triangle, the hex and
  its six neighbours, the triangle and everything around it. Heights are 5, 10,
  15 and 20 ft. The table is `content/sizes.js`. Up to four Tiny creatures can
  share a hex.
- **A big creature moves as one** (M7): every hex of it needs a floor within a
  step of its own, no wall may run between two parts of it, and no part may
  cross a wall. Distance, reach, opportunity attacks, areas, traps and the
  line for attacks all use the nearest parts of the creatures involved, and a
  tall creature reaches up by its height.
- Not built from decision 3: **squeezing** through a space one size smaller, and
  moving through the space of a creature two sizes apart. The DM's `place` puts
  a creature anywhere, which covers a squeeze by hand. "Attached to" (grappled
  and dragged, carried, mounted) is not built either; it belongs with grappling.
- The DM's `setSize` action changes a creature's size where it stands, if there
  is room. Forms (R11) will use the same check.

- **Assets** (M9). Files live on the table server under `DATA_DIR/assets/<code>/`, with server-made
  random ids; only PNG, JPEG and WebP, decided from the bytes. A player may fetch a file only if their
  own view of the game names it (a handout shown to them, the background of a level they are sent);
  the server works this out from `view()` on each request, so nothing else has to keep a list of who
  may see what. Requests carry the session token in a header, never in a URL; the browser fetches
  the bytes and shows them from a `blob:` URL. Every refusal to read is one identical 404. Limits,
  routes and the threat model are in `packages/server/README.md`. Solo play keeps files in IndexedDB.
- **Handouts** (M9) are `state.handouts: [{ id, title, text?, asset?, shown: [userIds] | 'all' }]`,
  changed by the DM actions `handout`, `showHandout`, `hideHandout` and `removeHandout`
  (`packages/rules/src/handouts.js`). Players are sent the handouts shown to them without `shown`.
  "Point at it, and everyone sees the pointer" is not built.
- **Notes to one player** (M9, ahead of M11) are the action `note { to, text }`, DM to a player or a
  player to the DM. The event is `privateNote { from, to, text }`, not `note`: the engine already had
  a public `note` event. It goes on the timeline; players are sent it, live or from the record, only
  if it is from or to them. The server checks a DM's note is addressed to a player at the table.
- **A level's background** (M9) is `level.image: { asset, feet: [w, h], origin: [x, y] }`, in the
  feet that walls use, set or cleared (`image: null`) with the `level` edit. Players get it only with
  a level they are sent. The renderer draws it (PR #73) as a flat textured quad at the level's floor
  and draws that level's hexes as a faint outline once the picture has arrived.
- **Trace** (M10) is the editor's Trace tool over a level's picture. Walls are free segments: taps
  snap to the end of a wall already there (so corners meet) or round to a chosen step (default 1 ft).
  A traced door is an object with `seg`, its `at` the hex nearest its middle (a stone tile is added
  there if the level has none). Dragging a wall end moves every wall and door that meets there. Fill
  floor lays stone on every empty hex whose centre is inside the picture, in one edit (at most 2000
  hexes). The amber bars show each step between neighbouring tiles that `barriers(map).blocked`
  stops, so the DM can see where a square-grid picture and the hexes disagree and nudge a wall.

## Sources

- [Universal VTT (Dungeondraft guide)](https://dungeondraft-encyclopaedia.gitbook.io/guide/final-steps/exporting-your-map/universal-vtt)
- [Universal Virtual Tabletop (UVTT) Support (Roll20 Help Center)](https://help.roll20.net/hc/en-us/articles/41643201127831-Universal-Virtual-Tabletop-UVTT-Support)
