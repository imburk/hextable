# Spec: travel, and the atlas of maps

Status: draft by an agent (#293), to be reviewed by the design owner. **Amended 15 November
2026** (#347) to the owner's answers to all twelve questions (issue #193, the comment "Q&A
lead, 15 November, 08:30 ET"): four changed the design (parked places go stale after 10
days; the pin and route editor is in the first build; day and night light by the world
clock comes with travel; waiting players watch the place in play live), the rest are
confirmed on their defaults; see "Questions for the owner". Covers the owner's requests
of 14 November: large moves between places (a keep far from a port city), arriving by teleport,
leaving by teleport, or riding, walking or sailing there, "without moving 10,000 squares"; and,
added the same day, an **atlas of nested maps**: a continent map that shows where each group of
the party is, a click on a place that drops the table into it, a city map with jump points
between its locations, and a fight possible at any of those levels. The world is made once in
prep and imported. It also covers the debt lines P18 (`loadMap` and `starts`), the Teleport and
Teleportation Circle rows of the spell table, and the part of P12 about one scene at a time and
the size of a table file.

Every rules number below is from `reference/srd52/srd52-flow.txt`; line numbers refer to that
file. What is not SRD text is marked **(design choice)**. No published place, setting, adventure
or map is named or shipped: the examples are "a continent map", "a keep" and "a port city", and
every navigation picture is an image the DM uploads. The repo ships none.

## Problem

A table today is one map. `loadMap` (`engine/dm.js`) swaps it for another: the party is set down on
the new map's `starts`, every creature that is not the party's is deleted, the lasting effects of
those creatures and every area laid on the old map end ("the party moved on"), and what had
changed on the old map (open doors, revealed rooms, what the party has seen, the DM's edits in
play) is thrown away. That is enough for "next session we are in the cave". It is not enough for:

1. **Maps that are not battle maps.** A continent map or a city plan is about getting from one
   place to another. Walking across it cell by cell, at 5 feet a cell, is absurd: a port city two
   days away is tens of thousands of cells. On such a map you move by jump points and routes, and
   the map's job is to show where everyone is and let the table drop into a place.
2. **A world of several places, kept.** The party goes from the keep to the port city and back. On
   their return the gate they forced is still broken and the guard they left tied up is still
   there. Today the keep is gone the moment they leave.
3. **Getting there.** Walking two days, a day on a boat, a gallop for an hour: time passes, things
   recharge at dawn, spells run out, there may be an ambush on the road. Today the DM presses
   `advanceTime` and `loadMap` and does the arithmetic in their head.
4. **Arriving somewhere in particular.** A map has a list of `starts`, used in order. A party that
   sails in should land at the harbour, one that rides in at the gate, one that teleports at the
   circle in the temple.
5. **A split party.** Two characters at the keep, two in the port city. The engine has one map,
   one party and one fight.
6. **A fight wherever the party is.** Wolves on the road, a brawl in a city street: a fight needs
   5-foot cells, and a continent map has none.
7. **Teleporting.** Teleport, Teleportation Circle and Word of Recall are `manual`: the engine has
   no idea of a destination that is not on the map in play.
8. **Prep.** The atlas, the routes and the encounter tables are the DM's own work, made once and
   used by an adventure, like the market pack of the shops spec (#292) and the homebrew pack
   (`homebrew.md`). They are private files, never in this repo.

## What the SRD says

- **Travel is often summarised.** "The GM can summarize this travel without calculating exact
  distances or travel times, or the GM might have you use the travel pace rules below" (1647-1653).
  So skipping is a rule, not a shortcut: the DM must always be able to say "you arrive".
- **Travel Pace** (1658-1710). A group moves at Fast, Normal or Slow pace:

  | Pace | Per minute | Per hour | Per day |
  |---|---|---|---|
  | Fast | 400 feet | 4 miles | 30 miles |
  | Normal | 300 feet | 3 miles | 24 miles |
  | Slow | 200 feet | 2 miles | 18 miles |

  Fast gives Disadvantage on Wisdom (Perception or Survival) and Dexterity (Stealth) checks;
  Normal gives Disadvantage on Dexterity (Stealth) checks; Slow gives Advantage on Wisdom
  (Perception or Survival) checks (1706-1710).
- **Mounts.** "If riding horses or other mounts, the group can move twice that distance for 1
  hour, after which the mounts need a Short or Long Rest before they can move at that increased
  pace again" (1662-1665).
- **Land vehicles** (wagons, carriages) choose a pace as normal. **Waterborne vessels** go at the
  vessel's speed with no pace, and "ships might be able to travel for up to 24 hours per day",
  depending on vessel and crew (1712-1717, 34615-34620).
- **Terrain** (Gameplay Toolbox, 34572-34790). The predominant terrain of a stage sets the maximum
  pace, and gives an encounter distance and Foraging, Navigation and Search DCs:

  | Terrain | Maximum pace | Encounter distance | Foraging DC | Navigation DC | Search DC |
  |---|---|---|---|---|---|
  | Arctic | Fast (with equipment such as skis) | 6d6 x 10 feet | 20 | 10 | 10 |
  | Coastal | Normal | 2d10 x 10 feet | 10 | 5 | 15 |
  | Desert | Normal | 6d6 x 10 feet | 20 | 10 | 10 |
  | Forest | Normal | 2d8 x 10 feet | 10 | 15 | 15 |
  | Grassland | Fast | 6d6 x 10 feet | 15 | 5 | 15 |
  | Hill | Normal | 2d10 x 10 feet | 15 | 10 | 15 |
  | Mountain | Slow | 4d10 x 10 feet | 20 | 15 | 20 |
  | Swamp | Slow | 2d8 x 10 feet | 10 | 15 | 20 |
  | Underground (the SRD's row for travel below the surface) | Normal | 2d6 x 10 feet | 20 | 10 | 20 |
  | Urban | Normal | 2d6 x 10 feet | 20 | 15 | 15 |
  | Waterborne | by the vessel | 6d6 x 10 feet | 15 | 10 | 15 |

  **Good roads** raise the maximum pace one step (Slow to Normal, Normal to Fast) (34580-34584).
  **Slower travellers**: the group must go at Slow pace if any member's Speed is reduced to half or
  less (34586-34589). **Extended travel**: past 8 hours a day, at the end of each extra hour each
  character makes a Constitution save, DC 10 plus 1 for each hour past 8, or gains 1 Exhaustion
  level (34591-34597). **Special movement** (flying, a fast magical Speed): miles per hour = Speed
  / 10; miles per day at Normal = miles per hour x hours travelled (typically 8); Fast = that x 1 1/3,
  Slow = that x 2/3, both rounded down; flying or ignoring Difficult Terrain allows Fast pace in any
  terrain (34599-34613). The SRD defines no rule for getting lost or for foraging beyond the DCs in
  the table, and no random encounter tables: those are the DM's.
- **Vessels** (22749-22940): Airship 8 mph, Galley 4 mph, Keelboat 1 mph, Longship 3 mph, Rowboat
  1 1/2 mph, Sailing Ship 2 mph, Warship 2 1/2 mph, each with crew, passengers, AC, HP and damage
  threshold. Against a strong wind a ship moves at half speed; in a dead calm it cannot sail and
  must be rowed; going downstream adds the current, "typically 3 miles per hour"; a ship larger
  than a Keelboat or Rowboat needs a crew of skilled hirelings.
- **Food and water.** A Small or Medium creature needs 1 pound of food and 1 gallon of water a day
  (Malnutrition 33855-33870, Dehydration 33291-33300, tables by size). Less than half the water: 1
  Exhaustion level at the day's end. Less than half the food: DC 10 Constitution save or 1 Exhaustion
  level at the day's end; no food for 5 days: 1 level at the end of the fifth day and each day after.
  Rations are "travel-ready food" (22517-22521).
- **Teleport** (31433-31520). Range 10 feet; the caster and up to eight willing creatures it can see
  in range, or one Large or smaller object; the destination must be known and on the same plane.
  "The GM rolls 1d100" on the Teleportation Outcome table:

  | Familiarity | Mishap | Similar Area | Off Target | On Target |
  |---|---|---|---|---|
  | Permanent circle | | | | 01-00 |
  | Linked object | | | | 01-00 |
  | Very familiar | 01-05 | 06-13 | 14-24 | 25-00 |
  | Seen casually | 01-33 | 34-43 | 44-53 | 54-00 |
  | Viewed once or described | 01-43 | 44-53 | 54-73 | 74-00 |
  | False destination | 01-50 | 51-00 | | |

  Permanent circle: one whose sigil sequence the caster knows. Linked object: an object taken from
  the destination within the last six months. Very familiar: visited often, studied carefully, or
  in sight when cast. Seen casually: seen more than once. Viewed once or described: seen once, or
  known from a description or a map. False destination: a place that does not exist. **Mishap**:
  each teleporting creature takes 3d10 Force damage and the GM rerolls (mishaps can repeat).
  **Similar Area**: the nearest place visually or thematically like the target. **Off Target**:
  2d12 miles away, direction by 1d8 (1 east, 2 southeast, 3 south, 4 southwest, 5 west, 6
  northwest, 7 north, 8 northeast). **On Target**: where intended.
- **Teleportation Circle** (31564-31595). Casting time 1 minute, range 10 feet, 50+ GP of inks
  consumed, duration 1 round. A 5-foot-radius circle linked to a permanent circle whose sigil
  sequence the caster knows; the portal is open until the end of the caster's next turn; any
  creature that enters it appears within 5 feet of the destination circle, or in the nearest
  unoccupied space. On gaining the spell a caster learns two sigil sequences "determined by the
  GM"; studying a sequence for 1 minute commits it to memory. Casting it in one place every day for
  365 days makes a permanent circle.
- **Dimension Door** (26006-26026). 500 feet; the caster and one willing creature within 5 feet,
  which arrives within 5 feet of the caster's destination; arriving in an occupied or filled space
  deals 4d6 Force damage to each and the teleport fails.
- **Word of Recall** (32397-32410). The caster and up to five willing creatures within 5 feet
  teleport to a sanctuary designated earlier by casting the spell there; they appear in the
  nearest unoccupied space to the designated spot; without a sanctuary the spell has no effect.

## Goals

1. An **atlas**: maps nested in maps, from a continent down to a room. Coarse maps are for
   getting around: jump points and routes, never cells. The table drops into a place by choosing
   it, and climbs back out.
2. The atlas **shows where everyone is**: each group of the party as a marker with its names.
3. Leaving a place **keeps it as it was**, creatures and all, and returning finds it so.
4. **Getting there takes the time the SRD says**, or none if the DM skips, and time passing does
   everything it already does when `advanceTime` runs (dawn, lasting effects), plus what travel
   adds (extended travel, mounts, food reminders).
5. **An arrival picks an entry** of the destination's map: the gate, the harbour, the circle.
6. **A fight can start at any level**, always on a battle map bound to the spot.
7. **The party can split** across places; the first build follows one group at a time, with the
   others **watching it live**, and does not close the door on running groups at once later.
8. **Teleport, Teleportation Circle and Word of Recall** play by the engine, with the familiarity
   table rolled by the engine for the DM.
9. **The atlas is prep**: a private world pack, imported, never in the repo, and the DM can place
   pins and draw routes on it in the game itself (Decision 13).
10. **Outdoor light follows the world clock**: a map can say a level or a place is outdoors, and
    its light is the hour's (Decision 14).
11. **Nothing changes for a table that does not use it**: a single map with no world plays exactly
    as today, and `loadMap` without the new fields does exactly what it does now. Hex and square
    battle maps mix freely in one atlas. One `apply()`, pure and replayable, views by allow list.

Not in this spec: generating a map (M14; this spec names where it plugs in), weather (day and night
light by the clock is in, Decision 14), a ship's
crew as creatures, chases, downtime, shops (the shops spec, #292), moving between planes (Plane
Shift stays `manual`).

## The decisions

### Decision 1: the atlas is a tree of nodes, each a navigation map, a battle map or a scene

Every place in the world is a **node**. A node has a **scale** and is one of three kinds:

| Kind | Scale | What it is | How you move on it |
|---|---|---|---|
| **Navigation** | `world`, `region`, `city`, `district`, `site` | an uploaded **picture with pins** and an optional scale (miles or feet per 100 pixels): a continent map, a region, a city plan, a district, the outside of a building | between pins (**jump points**) and along **routes**, by time; never by cells |
| **Battle** (`tactical`) | always 5 ft cells | an existing **map document** (`maps-and-objects.md` Decision 1), hex or square | by cells, by every existing rule; fights happen only here |
| **Scene** | any | a picture and a title, no map: a meeting on the road, a dream, a council the DM will not draw | none; talk, checks, handouts (`scenes.js`) |

A **vessel** (Decision 8) is a battle node that moves.

- **Nesting.** Each node but the root has a `parent`, and each **pin** on a navigation node points
  down to a child node, optionally to one of its **entries** (Decision 3): the continent map's pin
  "The port city" leads to the city plan; the city plan's pin "The harbour tavern" leads to the
  tavern's battle map at its door; the pin "The old quarter" leads to a district plan, whose pins
  lead to its buildings. **The same drop-in rule repeats at every level**, to a depth of 8
  **(design choice)**. A node can also be reached from several parents (the harbour is on the city
  plan and on the region map), so the atlas is a tree for "up" (each node has one `parent`) and a
  graph for routes.
- **Up and down.** `enter { pin, who? }` drops a group from a navigation node into the pin's child,
  at the pin's entry (or the child's default entry), in no time unless a route joins them. `leave
  { who? }` climbs from a node to its parent, at the pin that leads back to it. Down and up are the
  whole of "drop into a location without moving 10,000 squares": choosing a place and an entry.
- **Jump points.** On a navigation node a group stands **at a pin** (`e.pin`), not on a cell. `jump
  { pin, who? }` moves it to another pin of the same node. The time it takes is the route's that
  joins the two pins if the pack has one; else, if the node has a scale, the straight distance
  between the pins on the picture at the Normal travel pace (300 feet a minute, 3 miles an hour,
  1658-1705); else none. The DM can give `minutes` to any jump.
- **Routes** join any two nodes at any level, or two pins of one node: the road from the keep to
  the port city on the continent map, the ferry across the city's river, a secret passage between
  two buildings of a district. A long route is a **journey** (Decision 6); a short one is a jump.
  Teleport is not a route: it is a spell that picks a node and an entry (Decision 9).
- **What is reused.** Battle nodes are map documents, unchanged. A navigation node's picture is an
  **asset** (M9), and its table talk is a **scene** (the scene screen, transcript and checks on
  request), so a navigation node is a scene with pins and a scale. Entries are named **starts**
  (Decision 3). Arriving is **`loadMap`**, extended.
- **What is new.** Pins and scale on a navigation node; `parent`; routes; the world pack that holds
  them (Decision 2); `e.pin`; parking (Decision 5); the actions `enter`, `leave`, `jump`, `goTo` and
  the journey actions.
- **Why a navigation map is not a map document with big cells.** Every rule in the engine assumes
  5-foot cells (`lintMap` insists on `cellFeet: 5`): reach, areas, footprints, sight. A continent
  map with 1-mile cells would make each of them wrong, and moving cell by cell is what the owner
  asked to avoid. A picture with pins says exactly what a navigation map means: where things are,
  and what leads where.
- **What the engine holds while the table is on a navigation or scene node.** The engine always
  has an `s.map`, and dozens of rules read it. On a navigation or scene node it holds a **holding
  map**: a small one-level clearing made by `holdingMap()` (`map.js`), marked `holding: true`, big
  enough for the group. The creatures stand on it so that every rule keeps its invariants; the
  screens never draw it (they draw the node's picture), players are not sent it, and a fight
  cannot start on it (Decision 7).

### Decision 2: the world pack is prep, and the state keeps its index

The **world pack** is a JSON document the DM makes once, then imports into any number of tables:

```js
{
  format: 'hextable-world', v: 1,
  world: { id: 'river-country', name: 'The river country', version: 1, root: 'continent' },
  nodes: [
    { id: 'continent', kind: 'nav', scale: 'world', name: 'The continent', image: 'a1', size: [4000, 3000],
      miles: 25,                                              // 25 miles per 100 pixels
      pins: [ { id: 'p-keep', at: [1210, 840], name: 'The keep', to: 'keep', entry: 'gate' },
              { id: 'p-port', at: [2930, 1710], name: 'The port city', to: 'port' } ] },
    { id: 'keep', kind: 'map', scale: 'tactical', parent: 'continent', map: 'keep-map', terrain: 'hill' },
    { id: 'port', kind: 'nav', scale: 'city', parent: 'continent', name: 'The port city', image: 'a2',
      size: [2400, 1800], feet: 120, terrain: 'urban', battle: ['street-map'],
      pins: [ { id: 'p-harbour', at: [600, 1500], name: 'The harbour', to: 'harbour' },
              { id: 'p-tavern',  at: [1100, 900], name: 'A tavern', to: 'tavern', entry: 'door' },
              { id: 'p-temple',  at: [1500, 400], name: 'The temple', to: 'temple', entry: 'circle' } ] },
    { id: 'tavern', kind: 'map', scale: 'tactical', parent: 'port', map: 'tavern-map' },
    { id: 'hermit', kind: 'scene', parent: 'continent', name: "A hermit's hut", image: 'a7' },
    { id: 'barge', kind: 'vessel', parent: 'continent', map: 'barge-map', vessel: 'keelboat' },
  ],
  routes: [
    { id: 'road', from: 'keep', to: { node: 'port', pin: 'p-gate' }, back: { node: 'keep', entry: 'gate' },
      mode: 'foot', miles: 48, terrain: 'grassland', road: true,
      encounters: { table: 'road-table', every: 240, roll: 'engine' }, wayside: ['forest-road'] },
    { id: 'river', from: 'keep', to: { node: 'harbour', entry: 'quay' }, mode: 'boat', aboard: 'barge',
      miles: 30, current: 3, hoursPerDay: 24 },
    { id: 'ferry', node: 'port', from: 'p-harbour', to: 'p-temple', mode: 'boat', minutes: 20 },
  ],
  tables: [
    { id: 'road-table', name: 'On the road', die: '1d20', rows: [
      { range: [1, 14] },                                        // nothing
      { range: [15, 18], text: 'Wolves on the road.', foes: [{ monster: 'wolf', count: '1d4+1' }] },
      { range: [19, 20], text: 'A merchant with a broken axle.', scene: true },
    ] },
  ],
  maps: { 'keep-map': { format: 2, ... }, 'tavern-map': { ... }, 'street-map': { ... } },
  assets: { a1: { kind: 'image', data: '<base64>' }, ... },
}
```

- **Ids** are the DM's, lower-case kebab, unique per kind. They are never sent to players
  (Decision 12), so a DM may call a node `cult-hideout` without giving anything away.
- **`maps`** are full map documents, linted by `lintMap` on import. **`assets`** are embedded like
  a table export's (#83) and uploaded into the table's asset store on import; the pack's
  references are rewritten to the store's ids. The navigation pictures are the DM's own uploads:
  the repo ships none.
- **`battle`** on a navigation node or a pin lists the battle maps bound to it for a fight there
  (Decision 7). **`terrain`** is a key of the Travel Terrain table. **`mode`** is `foot`, `mount`,
  `wagon`, `boat`, `fly` or `custom` (a `custom` route gives `mph`, `hours` or `minutes` and is
  played like a vessel: no pace). A route may give `hours` or `minutes` instead of `miles`; given
  neither, the distance between its pins times the node's scale is the miles. **`back`** makes a
  route two-way, with its own arrival.
- **`encounters.roll`** is who may roll the table: `engine` (seeded, seen by the DM alone),
  `open` (seeded, the roll and row seen by the players too), `dm` (the engine reminds the DM at
  each interval; the DM rolls as they like) or absent (no checks).
- **Monsters** in tables are pack ids: SRD ids or the table's homebrew (`hb-`) ids. The linter
  refuses any other.
- **Limits** **(design choice)**, in one constant `WORLD_LIMITS`: 4 MB as JSON, 300 nodes, 60
  battle maps, 100 pins a node, 500 routes, 50 tables of up to 100 rows, depth 8, names 60
  letters, texts 1,500 letters. A budget runs before the linter, as for homebrew (`homebrew.md`
  Decision 2), iterative and with the same refusal of prototype-looking keys and control
  characters.

**Where it lives.** In the table's record on the server, beside `state`, not in it, as homebrew
packs are (`homebrew.md` Decision 3): `table.world = { id, version, hash, data }`. Solo play keeps
it in IndexedDB with the device's assets. The **state keeps an index**, without maps or pictures:
`s.world = { id, version, hash, root, nodes, routes, tables }`, each battle node with the `entries`
list of its map (Decision 3) so the engine can check an arrival without the map. The index is a
few KB for a large world, so it can be in every undo patch and save. Only the DM may load or
replace a world (`world { pack }`, a lobby-level message the server handles, like a homebrew
pack); the engine action that records the index is `worldIndex`, sent by the server, never by a
client.

**How a battle map reaches the engine.** The engine is pure and cannot read the table record. An
action that enters a battle node for the first time carries its map in `a.map`, as `loadMap` does
today. The **transport fills it**: the server (and the solo transport) looks at every action that
names a node not yet in play (`enter`, `loadMap { node }`, `journey`, a Teleport `cast`), and puts
the pack's map in the action before `apply()`. A `map` a client put in such an action is dropped
first. The action, map included, is what the history records, so a replay needs nothing but the
history. The size limit on actions (`MAX_MAP_ACTION_BYTES`, 1 MB) is checked on what the client
sent, before the fill.

**Reasons.** One map document per battle node keeps every existing rule exactly as it is: the atlas
never has to know what a hex is. Keeping maps and pictures outside the state keeps the state, the
undo history and every player's first view small. Filling by the transport keeps `apply()` pure
and replayable, the trick `loadMap` already uses.

**Cost.** A world is a third kind of import beside homebrew and the market pack. They share the
budget code and the server's pack message; the DM sees them in one Packs screen.

### Decision 3: entries are named starts, and an arrival picks one

A battle map gains **entries**, and a start may belong to one:

```js
entries: [
  { id: 'gate',    name: 'The town gate', kind: 'gate' },
  { id: 'harbour', name: 'The harbour',   kind: 'dock' },
  { id: 'roof',    name: 'The tavern roof', kind: 'other' },
  { id: 'circle',  name: 'The temple circle', kind: 'circle', object: 'o14' },
  { id: 'far',     name: 'The far side', kind: 'far' },
],
starts: [
  { level: 'ground', q: 4, r: 0, entry: 'gate' }, { level: 'ground', q: 5, r: 0, entry: 'gate' }, ...
  { level: 'roof', q: 2, r: 3, z: 25, entry: 'roof' },
  { level: 'ground', q: 0, r: 0 },                     // no entry: the map's default
]
```

- `kind` is `gate`, `dock`, `circle`, `landing` (where a flyer comes down), `near`, `far` (the two
  ends of a battle map used for a fight, Decision 7) or `other`; it labels the screens and lets a
  route, a spell or a fight ask for "a dock" or "the far side" when it names no entry.
- An entry of kind `circle` names its **permanent circle** object (Decision 9).
- **Arrival.** `loadMap` gains `entry`. The party is set down on that entry's starts in order
  (a start nobody can stand on is passed over, as #154 does for all starts), then, for anyone
  left, by the spiral out from the entry's first start, as today. No `entry`: the starts with no
  entry, then the spiral: today's behaviour exactly for a map with no entries. An entry with no
  start a creature can stand on is refused ("Nobody can stand at The town gate."). Arrivals are
  set down **in marching order** (`byMarch`), so the column comes through the gate in the order
  it walked.
- **A start on an upper level** gets its `z` from its level when it has none (the rest of P18):
  `landing(map, st, level.z)` instead of `st.z ?? 0`.
- **Format.** Both fields are optional and an older build ignores them (`lintMap` reads only a
  start's `level`, `q` and `r`), so the map `format` stays 2. `lintMap` checks that entry ids are
  unique, that every `start.entry` names an entry, that every entry has a start, and that a
  `circle` entry's object exists. `mapEdit` gains an `entries` change beside `starts`.

**Reasons.** This extends `starts` and `loadMap` (P18) instead of adding a concept: an entry is a
name on a group of starts. A map made today keeps working.

### Decision 4: where the party is, and the markers

- **Where.** Every creature is in exactly one node: the node in play (`s.place`) or a parked one
  (Decision 5). On a battle node it has a cell (`pos`), as now. On a navigation node it stands at a
  pin (`e.pin`), and on the holding map. On a scene node it is simply there.
- **A group** is the party creatures in one node at one pin (or on one battle map). Groups are
  worked out, not stored: nothing has to be kept in step when someone moves.
- **The markers.** Any navigation node draws a marker for each group that is in it or below it:
  a group in the tavern inside the port city is drawn on the continent map at the port city's pin,
  and on the city plan at the tavern's pin. A marker shows who is in it (portraits or initials,
  then names on a tap). Two members at the keep and two in the port city are two markers.
- **Placing a party** when it joins a campaign: `place { who, node, pin? | entry? }` (the DM's
  existing `place`, given a node) puts creatures at a pin or an entry of any node. A character
  added later (`addCharacter`) is added where the DM says, by the same fields.
- **Clicking a marker.** The **DM** may click any: it sends `goTo { node }` and the table's focus
  moves there (Decision 5). A **player** may click any marker: it shows who is in it and the name of
  where it is (for a place known to them), nothing more. A player's screen already shows the place
  in play, live, whichever group they are in (Decision 5), so a marker is for knowing who is where,
  not for looking.
- **Clicking a pin.** On a navigation node in play, a pin offers Go there (`jump`), Go in
  (`enter`) if it leads down, and, on a child, Go out (`leave`). Who may send them is the table rule
  `atlasMoves`: `dm` or `players` (the default: players may move their own group's characters on
  a navigation node when it is in play and there is no fight; the DM always may) **(confirmed by
  the owner, question 9)**. Journeys between nodes (Decision 6) are always started by the DM.

### Decision 5: a split party: one place in play at a time first, concurrency later

The engine holds one map, one set of creatures and one fight (`s.map`, `s.entities`,
`s.encounter`), and every rule reads them. Two ways to let a party be in two places:

#### V1: one place in play, the others parked

```js
s.place:  null | 'keep'                 // the node in play: the table's focus; null for a table with no world
s.parked: { [nodeId]: {                  // every other node that holds anything of play
  map,                                    // its map document (or its holding map), with doors, regions, `seen` and edits as left
  entities: { [id]: entity },             // everyone there, the party's included
  effects: [ ... ],                       // lasting effects that stay with it
  scene: null | { ... },                  // its scene, prepared or set aside
  encounter: null, pending: null,         // always null in V1; there so a parked place has the shape a V2 place needs
  since: clock,                           // when it was parked (what the dawns it missed are counted from)
  kept: clock | null,                     // when the DM last said it is as it should be (below)
  stale: clock | null,                    // set when it went stale and the DM has not yet chosen
} }
```

- **The focus.** Only the node in play is live: its creatures act, its fight runs. Every other
  node that holds anything is **parked**: frozen exactly as it was. `goTo { node }` (DM) parks the
  node in play and unparks the other. It is refused during a fight and during a journey. The
  **clock is shared**: cutting does not move it.
- **Leaving parks, entering unparks.** With a world, leaving a node parks it with whoever stays;
  entering a parked node unparks it, and entering a node for the first time builds it from the
  pack. **Plain `loadMap` with no `node`** does what it does today (the old map is thrown away),
  world or not.
- **Stale places** (the owner, 15 November: "it's only a valid state for a 10 day per the world
  clock, otherwise life moves on"). A parked battle place **goes stale** when 10 days of the world
  clock (14,400 minutes, `TRAVEL_LIMITS.staleDays`) have passed since it was parked or since the
  DM last kept it, whichever is later. A navigation node and a scene hold nothing that goes stale.
  It is checked wherever the clock moves (`advanceTime`, a rest, a journey's stretch, a jump with
  minutes), by one pure function that marks every parked battle place that has crossed the line
  and sends the DM, and only the DM, one event, `placeStale { node, days }`, shown in the Travel
  section ("The keep has been left for 10 days") and as a chip on the place. **Nothing resets by
  itself.** The owner chose that the place is marked stale, the DM is told, and the DM decides:
  - **Keep it as left**: `keepPlace { node }`. The mark clears and the ten days count again from
    now (`kept`). The place is exactly as it was.
  - **Reset it to how it was prepared**: `resetPlace { node }`. The place is rebuilt from the world
    pack as a first visit builds it (the map, the creatures that are not the party's, the zones and
    effects laid on it, doors and what was seen), and the party creatures in it, if any, are set down
    at the entry they came by, or the node's default **(design choice, lead's proposal)**. The DM
    is told in one sentence what was dropped. Refused for a node the pack lacks (`gone`).
  - **Edit it by hand**: go there (`goTo`) and use the DM's ordinary map and creature edits; going
    there with `stale: 'edit'` keeps the place as left and clears the mark.
  - **Going to a stale place asks first.** `goTo`, `enter`, `loadMap { node }` and a journey's
    arrival into a stale place are refused with the question ("The keep has been left for 12 days.
    Keep it as it was, put it back as prepared, or edit it first.") until the action carries
    `stale: 'keep' | 'reset' | 'edit'`. A creature that arrives by a portal or a spell the DM was
    not at the table for (`travel` step, Decision 9) goes in with the place **kept as left**, the
    mark cleared and the DM told, because the engine may not choose to reset for them.
  - A stale place still counts toward the 16 (below); `forgetPlace` still drops one.
  - **Noted, not decided.** The owner also thought aloud: "Can the state be archived". As an idea
    for the design: a parked place put away, not counted in the 16, and brought back later. It
    is not in this spec, and it is not blocked by it: W10 (a parked place kept as its
    differences from the pack's) is the nearest piece. The owner has not decided it.
- **What goes and what stays.** Movers are named (`who`, default the whole group); everyone else
  stays. A creature bonded to a mover (`companions.md` Decision 1) goes with its master, a mount
  with its rider, a pocketed familiar with its master's pocket. An effect stays with its node if it
  is a zone or changed ground laid on the node's cells (E8), or if its source and all its targets
  stay. An effect whose source and targets end up in different nodes **ends**, with an `effectEnd`
  "the party moved on", as `loadMap` does today; a zone that follows a mover (Spirit Guardians)
  goes with it **(confirmed by the owner, question 4)**.
- **Catching up on unparking.** Nothing is simulated for the time a node was parked (no monster
  walks). Then, before anything else: `tick` ends its lasting effects whose time is up, and each
  creature there gets the **dawns** it missed, `dawnsBetween(since, s.clock)`, through the same
  code as `rest` and `advanceTime` (`rests.js` `dawn`, made to take a list of creatures).
- **Away.** A party creature in a parked node is **away**. It is not in `s.entities`, so nothing in
  play can touch it, and rests, levelling and gear changes do not reach it until the focus comes
  to it (confirmed by the owner, question 3).
- **What players see** (the owner, 15 November: waiting players **watch the other group's scene live**
  rather than a frozen view of their own place). Today every player is sent one view, built once
  (`sight.md` S7: "the party sees as one"). In V1 every player is sent **the live player view of
  the place in play**, the one `sight.md` S7 builds for the group that is there: the map as that
  group has seen it (what it sees now and what it remembers), the creatures it can see, the
  events it was told, and the table's out-of-character talk. A player whose characters are in the
  node in play gets it as a member of the group. A player whose characters are parked gets the same
  view marked `watching`, with their own group's marker on the atlas and their characters as
  read-only away sheets; a player with characters in two groups gets the view as a member. The
  view of a parked place is not built and not kept: a parked place is frozen, so there is no
  "as shown when it was parked" copy to store.
  - **Never DM-only content.** What a watching player is sent is exactly what a player of the
    group in play is sent, by the allow list, and no more: no hidden creature, unrevealed room or
    secret door, no DC, secret roll or `unseen` entry, no DM note or whisper, no encounter table or
    wayside, nothing the group cannot see. Things sent to one player only (a handout shown to a
    named player, a private note, one character's own sheet-only information) go to the players
    they are shown to, as today, and a watcher is not added to them. **This replaces the old
    hidden-information point of this decision** (V1 sent a parked group nothing of the place in
    play, and one view per group was the review point): the point is now that the single view built
    for the group in play reaches watchers unchanged, and the test is that nothing outside it does.
  - **In-character speech.** A line said in character in the place in play (`say`, which carries
    its node) is sent to **every** player, so the watchers hear the group they watch. A line said in
    character by a parked group's player reaches only the players of that node and the DM: their
    characters are not where the table is. Out-of-character lines reach everyone, as before.
  - **What their characters know** (a point for review, not decided by the engine). The engine
    does not model what a character knows: a watching player has seen and heard a scene their
    characters were not in, and nothing stops them acting on it. It is the same thing as at any
    table where one group's scene is played in front of the others, and the rule is the table's:
    the player knows, the character does not. The screen says so in the band ("Your characters are
    not here. What you watch is not what they know."), the DM's party bar shows who is watching,
    and the engine records nothing. A table rule, `watching: 'live' | 'off'` (default `live`, the
    owner's wish), lets a DM who finds it spoils a scene turn the watching off; players then see
    the band and out-of-character talk only **(design choice, lead's proposal; the owner chose live
    and was not asked for the switch)**.
  - This is a change to `view.js` and to the server's one-view-for-all, and it is the
    hidden-information review point of the first build, though smaller than the frozen views it
    replaces: one view to build and diff, not one per group.
- **Initiative.** One fight at a time, in the node in play. A fight elsewhere waits until the focus
  comes to it.
- **Undo** is the one table history, as now: undoing a `goTo` cuts back.
- **Size.** A parked node is its whole map (35 to 70 KB for the stock maps, P17) and its
  creatures; a parked navigation node is its small holding map. `TRAVEL_LIMITS.parked` is 16 battle
  nodes **(design choice)**, about 1.1 MB of state at the largest stock size, inside the undo budget
  (`UNDO_BYTES`, 8 MB). When it is reached, entering a new battle node is refused ("Sixteen places
  hold changes. Let one of them go back to how the world pack has it.") until the DM sends
  `forgetPlace { node }`, which drops a parked record (refused if party creatures are in it).
  Nothing is lost without the DM saying so. Storing only the differences of an unedited parked map
  from the pack's is a later stage (W10).

#### V2: places run at once

Every node in play is live: `s.places[nodeId] = { map, entities, encounter, effects, scene,
pending }`, and `apply()` finds the actor's node (a DM action names it) and runs the handler with a
**place lens**: `s.map`, `s.entities`, `s.encounter`, `s.effects`, `s.scene` set to that node's for
the length of one synchronous call and put back in a `finally`, as `homebrew.md` Decision 3 does for
content. The handlers would not change. What would:

- **Initiative and the clock.** Two fights each add 6 seconds a round to one shared clock, which is
  wrong for both. Each node needs its own clock (an offset from the world's), dawns per node, and a
  rule for when two groups meet with different times.
- **Undo.** One history means undoing the port's last action also undoes the keep's later ones.
  Undo per node needs independent histories, and the **dice** are one seeded stream: rewinding one
  node's rolls changes the next roll in the other. Per-node seed streams and histories are a change
  to `rng.js`, `history.js` and the table server.
- **Waiting.** A reaction prompt pauses the whole table today (`pending`); it would pause one node.
  The monster AI and the timeline's pace run per node.
- **Hidden information.** As V1 (the player view of a group, never DM-only content), but each group's
  view is live and rebuilt on every change of its node, and a player is sent their own group's view
  and may be shown another's too.
- **The screens.** The DM needs to watch two fights at once: two panes or a switch, and every
  per-fight control (tracker, conclusion, rewards) per node.
- **Size.** As V1: the same records, all live.

**Recommendation: V1 for the first build.** It needs no change to how any rule, the dice or undo
work, and its parked records have V2's shape, so V2 later is "more than one node unparked" plus the
lens, per-node clocks, seeds and histories: a spec amendment and a large engine stage (W12), not a
rewrite. **What V1 forecloses**, until V2: two fights at the same time; a parked group doing
anything (moving, checks, rests) while the focus is elsewhere; a fight that spans two places. What
it does not foreclose: a split party, cutting between groups as often as the DM likes, every
group's place kept as it was, and, since 15 November, players watching the group in play live.

### Decision 6: a journey is a stretch of time on a route, played as a scene

```js
s.journey: null | {
  route: 'road', dir: 'to' | 'back', travellers: [ids], pace: 'fast' | 'normal' | 'slow',
  total: minutes, done: minutes,          // how long the route takes at this pace; how much is behind them
  today: minutes,                          // travelled since the travellers' last Long Rest (extended travel)
  next: minutes,                           // `done` at which the next encounter check falls
  gallop: false,                           // the mounts' hour at twice the distance is spent
  stopped: null | 'fight' | 'dm' | 'between',
  wayside: null | nodeId,                  // the battle node of a fight on the way (Decision 7)
}
```

- **Starting.** `journey { route, dir?, who?, pace?, depart? }` (DM). `who` defaults to every party
  creature in the group. The route must start at the node in play. The engine parks the node
  with whoever stays, and the table is **on the road**: the node in play becomes the route's vessel
  if it has one (Decision 8), otherwise a **road scene**, a scene node made for the journey: its
  scene opens titled with the route ("On the road to the port city") and the world map as its
  picture. `say`, handouts, notes, checks on request all work there as in any scene. On the
  atlas, the group's marker is drawn along the route between its two pins, at `done / total` of
  the way. A short route inside one navigation node (the ferry, 20 minutes) is not a journey: it
  is a `jump` that takes the route's time.
- **Pace.** The DM chooses; the engine refuses a pace above the route's maximum: the terrain's
  maximum pace, one step higher for a `road`, Fast in any terrain if every traveller flies, and
  **Slow if any traveller's Speed is half its normal or less** (the record's `speed` against its
  sheet's). Vessels and `custom` routes have no pace.
- **How long.** `total` from the route: `hours` if given; else for foot, mount and wagon `miles /
  (4, 3 or 2 mph)`; for a vessel `miles / (vessel mph + current)`, half the vessel's speed under
  `wind: 'against'`; for `fly` and other special movement, the slowest traveller's Speed / 10 mph,
  Fast or Slow by the SRD's 1 1/3 and 2/3 of a day's miles, rounded down (34599-34613). A route that
  gives neither `miles` nor `hours` asks the DM for the hours when started.
- **Stretches.** `journeyStep { hours? }` (DM) moves the journey on: by `hours`, or to the next
  thing that stops it, whichever is first: the end of the travel day (8 hours of travel since the
  last Long Rest, or the vessel's `hoursPerDay`), an encounter check that finds something, or the
  arrival. Each stretch runs time exactly as `advanceTime` does: the clock moves, `dawn` runs for
  every creature on the journey, `tick` ends what has run out. The DM can step an hour at a time to
  play the road, or a day at a time to skip it.
- **The travel day.** At 8 hours the journey stops and offers the DM: camp (the existing `rest`,
  allowed on the road; a Long Rest resets `today`), or **push on**: each further hour, at its end,
  every traveller makes the Constitution save, DC 10 plus the hours past 8, or gains 1 Exhaustion
  level (34591-34597), rolled by the engine with each traveller's real save. A vessel with
  `hoursPerDay` above 8 carries its passengers without these saves **(design choice: the SRD puts
  the 8-hour limit on "characters" pushing themselves; passengers on a crewed ship are not)**.
- **Mounts.** On a `mount` route with every traveller riding (`companions.md` Decision 8), the DM
  may `journeyStep { gallop: true }` once: one hour at twice the distance, after which `gallop` is
  spent until the mounts have had a Short or Long Rest (1662-1665). Before C6 is built, "riding" is
  the route's `mode` alone.
- **Pace on checks.** While a journey is under way, each traveller has a lasting effect, "Travelling
  at a Fast pace", built from the existing modifier vocabulary (`scope.skill`): Disadvantage on
  Perception, Survival and Stealth at Fast, on Stealth at Normal, Advantage on Perception and
  Survival at Slow (1706-1710). It ends with the journey. No new vocabulary.
- **Food and water.** At the end of each travel day the DM is told, with a `manual` event, who
  needs what by size (1 pound of food and 1 gallon of water for a Small or Medium creature, by the
  SRD's tables) and what follows from going short. The engine does not track rations: sheets
  have no quantities for everyday gear the engine counts. Spending rations is a later stage if the
  shops spec gives gear quantities.
- **Navigation, foraging, searching.** When the route has a terrain, the DM's travel controls
  offer a check with the terrain's DC (the existing `check` with a private DC). What a failure
  means is the DM's; the SRD gives no rule.
- **Arrival.** When `done` reaches `total`, the travellers are set down at the route's arrival
  (`to.entry`, or the place's default), as `loadMap { node, entry }` does, the road scene is
  closed, and the journey ends. Arriving at a place for the first time fills its map
  (Decision 2).

**Reasons.** A journey is time, not distance on a grid: no creature walks a hex on the way, which is
the whole point ("without moving 10,000 squares"). Running each stretch through the code of
`advanceTime` means dawn recharges (#287), lasting effects and Concentration timers behave on the
road exactly as at camp. Playing the road as a scene reuses the transcript, checks on request and
the chronicle, and is where an AI DM narrates later.

### Decision 7: a fight at any level is fought on a battle map bound to the spot

The owner's question: the party is moving on the continent map or the city plan by jump points,
and a fight breaks out. How does the table get to combat-level play there?

- **The rule.** A fight happens only on a battle node: 5-foot cells, hex or square, every existing
  rule. `startEncounter`, the `autoEngage` start and an attack or hostile cast are refused while
  the node in play is a navigation or scene node (its holding map is no battlefield): "This is not a
  battle map. Choose one to fight on." So a fight is always one step: **bind a battle map to the
  spot, drop into it, fight**.
- **Which battle map**, in this order, offered to the DM by the "Fight here" chooser (and by a
  journey's encounter, below):
  1. **Bound to the spot.** The pin the group stands at, or the navigation node itself, lists
     `battle` maps: the city plan's "A tavern" pin leads to the tavern; the node "The port city"
     binds a street map and a market square; the keep's pin binds the courtyard. A pin whose child
     is a battle node is itself bound to it.
  2. **A stock map by terrain.** When nothing is bound, the chooser lists the stock maps
     (`content/maps/`) whose new `terrain` tags match the node's or the route's terrain: road,
     forest, hill, shore, city street, underground. Each stock map gains a `near` and a `far`
     entry. The group is set down at the entry they came by if the map has one, else at `near`;
     the foes at `far`, or, on a journey, at the encounter distance below.
  3. **Drawn now.** The DM opens the editor on a blank battle map of either grid (`maps-and-objects.md`
     M8), paints the spot, and fights on it. When M14 is built, "generate one" sits here.
- **The fight map is a child node.** Whatever was chosen becomes a battle node under the navigation
  node, at the group's pin (a **site** made in play, `nodeAdd`), and the group drops into it with
  `enter`. Only the creatures in that group go; the rest of the party stays parked where it is.
- **After the fight**, `leave` takes the group back up to the navigation node at the same pin. The
  clock has already moved by the rounds fought (6 seconds each, `ROUND`), so nothing is added. The
  site is thrown away unless the DM keeps it (`keep: true`: it stays a child node with its pin, and
  the bodies and broken doors are there next time).
- **Fights on a journey.** At each encounter check (every `encounters.every` minutes of travel, the
  first at that interval after departure) a table with `roll: 'engine'` or `open` is rolled with the
  seeded dice. A row with no `foes` and no `scene` is nothing. A row with `scene: true` stops the
  journey and puts its text in the road scene's notes for the DM. A row with `foes` stops the
  journey (`stopped: 'fight'`) and offers the DM `journeyFight` with that row, or skipping it
  (`journeyStep` carries on). With `roll: 'dm'` the engine only stops at the interval and reminds
  the DM. `journeyFight { map?, stock?, foes?, row? }` makes the wayside battle node by the same
  chooser: a map bound to the route (`wayside`), a stock map by the route's terrain, the vessel's own
  map if the journey is aboard one, or one drawn now. The foes (the row's, or the DM's list) are
  placed at the **encounter distance** rolled for the route's terrain (2d8 x 10 feet in a forest,
  and so on, from the table above), measured from the travellers' entry, at the nearest cells that
  fit along a line toward the `far` entry; if the map is too small for the distance they are put
  at `far` and the DM is told. Then the fight starts, or the DM lets the travellers see the foes
  first and talk. `journeyResume` puts the travellers back on the road and the journey goes on from
  `done`.
- **Zooming in further.** A city plan can lead to a district plan, a district to a building's
  outside, a building to its battle map: the same `enter` rule at each level. A fight at the
  district level is bound the same way, to the district's or the pin's battle maps.
- **A chase, or a fight that spills into the next place.** Not in V1: a fight is on one battle map.
  Foes that flee off it are removed or parked by the DM; if the fight goes on in the next building,
  the DM ends it (`endEncounter`), the group `enter`s the next node, and a new fight starts there.
  The SRD's chase rules are not designed here. Two fights at once need V2.
- Both grids: each battle node's own grid decides, as any map's; the encounter distance is in feet,
  converted by the map's `cellFeet`. A hex keep and a square city street can be children of one
  city plan.

### Decision 8: vessels and vehicles

- **A vessel is a battle node that moves.** A ship, a barge, a wagon train the DM wants to draw is a
  battle node of `kind: 'vessel'` with a `vessel` key from the SRD's table (or `custom` with `mph`).
  A route with `aboard: 'barge'` plays its journey on that node instead of a road scene: the
  travellers are set down at the vessel's entry (the gangplank), can walk its decks, and a fight on
  the way is fought on its map. On arrival the travellers land at the destination's entry, and the
  vessel is parked with `at: nodeId` (its marker is drawn at that node), so a route `aboard` it can
  start from there. A vessel's crew and its own Hit Points are the DM's: the engine has no ship
  damage. The speed from the SRD (22792-22935) and the route's `current` and `wind` set the
  journey's length; the crew rule ("a ship larger than a Keelboat or Rowboat needs a crew") is the
  DM's to honour.
- **A vehicle on a battle map that carries creatures** (a cart rolling through the keep's yard with
  two people in it, a rowboat crossing the moat) is P3's "attached to": an object that moves and
  takes along whoever stands on it. It is the mechanism of a rider on a mount (`companions.md`
  Decision 8, "moving together"), with an object as the carrier: an object definition gains
  `carries: true` and a deck (its cells), and moving the object moves everyone on its deck. That is
  stage W11, engine lane, after companions C6, described here only so nothing in this spec blocks
  it. Until then the DM moves the cart and its passengers with `place`.

### Decision 9: teleport spells hand the party to an arrival

Like a route, a teleport joins two nodes at any level; unlike a route it takes no time, and
"dropping into a location" is the same arrival as every other: a node and an entry. The `teleport`
step (#165) moves a creature within the map in play. It gains two optional fields,
a **spec amendment to the step vocabulary** (`content/schema.js`, `effects.js`):

- `with: { count, within, willing: true }`: passengers. Each must be within `within` feet of the
  caster (and seen by it, for Teleport) and willing: party-side or bonded to the caster; anyone
  else needs the DM's word (the cast is held and the DM is asked, as a reaction prompt holds an
  action). The cast names them in `with: [ids]`.
- `node: true`: the destination may be a node of the atlas (`cast { node, entry? }`), not only a cell.

The four spells:

- **Teleport** (`teleport: 0, with: { count: 8, within: 10 }, node: true, familiarity: true`). The
  caster names a node at any level, and optionally an entry (on a battle node), a pin (on a
  navigation node: "into the port city" lands the travellers at the city plan's temple pin, from
  where they can go in) or, for the place in play, a cell. The destination
  must be **known**: the caster has a familiarity with it, a sigil of a circle in it, or a linked
  object from it; otherwise refused ("Brenna doesn't know that place."), nothing spent. The engine
  rolls 1d100 for the DM (a DM-only roll: "The GM rolls 1d100") and applies the row:
  - **On Target**: the travellers arrive at the entry named, or at the cell for a very familiar
    place in sight, through the same arrival as `loadMap { node, entry }` (Decision 3). An entry
    of kind `circle` is a permanent circle; the place is filled from the pack if first visited.
  - **Off Target**: the engine rolls 2d12 miles and 1d8 for the direction and tells the DM (and the
    players: "You are not where you meant to be"). The engine does not know what lies there, even
    on a map with a scale **(the engine never pretends)**: the travellers are put **between places**
    (`s.journey.stopped: 'between'`, on a road scene with the distance and direction in its
    scene's notes for the DM) until the DM sends `loadMap { node, entry }` or `nodeAdd` for where
    they landed. If the node they set out for is on a navigation map with a scale, the DM is also
    shown the pins that lie about that far in that direction, to choose from.
  - **Similar Area**: as Off Target, with the DM told to pick the nearest similar place.
  - **Mishap**: each traveller takes 3d10 Force damage and the engine rolls again, repeating while
    mishaps come (at most 20 rolls, then the DM decides: a safety stop, not a rule).
  - **False destination**: a place marked `false: true` in the pack or by the DM (an illusion
    scried, a place since destroyed) uses that row whatever the caster's familiarity.
  - **Familiarity** is kept per creature in `s.world.known[entityId][nodeId]`. The engine sets
    `once` on a creature's first arrival at a place and `casual` on its second **(design choice:
    "seen more than once")**; `very` only by the DM's `familiarity` (visited "often" and "carefully
    studied" are judgements). A place in sight when cast (the place in play, a cell the caster
    sees) is very familiar. `described` is set by the DM ("viewed once or described", from a map
    or a tale). A **linked object** is an item on the caster's sheet that the DM marked with `link`,
    good for 180 days from the clock when it was taken **(design choice: "six months" as 6 x 30
    days)**.
- **Teleportation Circle**. Casting it (1 minute, outside a fight) names a circle whose sigil the
  caster knows and places a **portal** object, a generic Hextable definition (not SRD text) filling
  the 5-foot-radius circle within 10 feet, by the area rules of the grid in play. It has an `enter`
  trigger whose step is the new `travel { node, entry }` step **(spec amendment)**: a creature
  that enters is taken out of the place in play and set down within 5 feet of the destination
  circle, or the nearest unoccupied space, in that place's parked record (which is built from the
  pack if it is the first visit). The portal ends at the end of the caster's next turn (outside a
  fight, after one round, 6 seconds, on the clock; how `durations.js` times a 1-round effect outside a
  fight is checked in W8). **When the
  last party creature in the place goes through, the table goes with it** (the destination becomes
  the place in play); if the portal closes with the party split, the table stays where it is and
  the DM can `goTo` the others. **Permanent circles** are objects of the generic definition
  `teleportation-circle` with a `sigil` field the DM writes, the target of an entry of kind
  `circle`. Sigils known are `s.world.sigils[entityId]`: two given by the DM when the spell is
  learned (`sigil`), and one learned by studying a circle for 1 minute (a `use` on the object, time
  `1 minute`, outside a fight). The 365 days to make a permanent circle are the DM's.
- **Word of Recall**: `cast { designate: true }` in a place records `s.world.sanctuary[casterId] =
  { node, at }` (the slot is spent: designating is a casting); a later cast takes the caster and
  up to five willing creatures within 5 feet to the nearest unoccupied space to that spot, through
  the same arrival. With no sanctuary the spell has no effect and the slot is spent, as the SRD
  says.
- **Dimension Door** stays on the map in play; its passenger moves through `with` (one creature
  within 5 feet, set down within 5 feet of the destination), which closes its `manual` step. A
  destination it describes off the edge of the map ("500 feet north") is handed to the DM.

What the engine cannot do stays `manual` with a reason: Teleport of an object, a destination on
another plane, an unwilling passenger the DM has not confirmed. Transport via Plants and Tree
Stride can later use the same `node` field; they stay as they are in this spec.

### Decision 10: the actions

| Action | Who | What it does |
|---|---|---|
| `worldIndex { index }` | server | records the index of the world the DM imported (Decision 2) |
| `loadMap { map?, node?, entry?, who?, stale? }` | DM | today's action; with `node`, parks the node in play and enters `node` at `entry`, taking `who` (default the group); `stale` as for `goTo` |
| `enter { pin, who? }`, `leave { who?, keep? }`, `jump { pin, who?, minutes? }` | DM, or players for their own characters under `atlasMoves: 'players'` | drop into a pin's child, climb to the parent, move between pins (Decisions 1 and 4); refused in a fight |
| `place { who, node, pin?, entry? }` | DM | the existing `place`, given a node: put creatures anywhere in the atlas |
| `goTo { node, stale? }` | DM | move the table's focus to another group (Decision 5); into a stale place it carries `stale: 'keep' \| 'reset' \| 'edit'` or is refused with the question |
| `forgetPlace { node }` | DM | drop a parked node's changes (Decision 5) |
| `keepPlace { node }`, `resetPlace { node }` | DM | the DM's answer to a stale place: keep it as left (the ten days count again), or rebuild it from the pack with the party set down at its entry (Decision 5) |
| `nodeAdd { node }` | DM | add a node in play: a battle map from the stock maps or the editor, a scene, a site; recorded in `s.world.nodes` with `added: true`, exported with the table, not written back to the pack. A pin on a navigation node is `atlasEdit`'s |
| `atlasEdit { op, ... }` | DM | the atlas editor's one action (Decision 13): add, move, rename and remove a pin; add and remove a route; add a navigation node from an uploaded picture; set a node's scale. Edits the index, marked `edited` |
| `showPlace { node, known }`, `showRoute { route, known }` | DM | tell the players of a node or route they have not been to (a rumour, a map they bought) |
| `journey { route, dir?, who?, pace? }` | DM | start a journey (Decision 6) |
| `journeyStep { hours?, gallop?, push? }` | DM | move it on |
| `journeyEnd { arrive: 'now' \| 'time' \| false }` | DM | arrive now with no more time passing (`now`: the SRD's summary), arrive with the rest of the time passed in one stretch and no encounter checks (`time`), or **stop on the way** (`false`): the travellers stay on the road scene, `stopped: 'dm'`, until a `journeyStep` or a `loadMap { node }` |
| `journeyFight { map?, stock?, foes?, row? }`, `journeyResume { keep? }` | DM | a fight on the way, and back on the road (Decision 7) |
| `familiarity { actor, node, level }`, `sigil { actor, circle, known }`, `link { actor, item, node }` | DM | what a character knows of a place, for Teleport (Decision 9) |

Players also send `cast` for the teleport spells. Names are checked against the existing handlers:
none is taken (`place` is extended, not added; `keepPlace`, `resetPlace` and `atlasEdit` are new).
A `staleCheck` runs inside the actions that move the clock; it is not an action.

### Decision 11: undo, saving and exporting

- **Undo** keeps reverse patches of the whole state (`history.js`), and every new field is in the
  state, so a journey, a split, a drop-in, a Teleport and a parking come back exactly, down to the
  dice. `describeStep` names the new actions ("The party set out for the port city", "Brenna
  teleported the party to the port city", "The table cut to the keep", "Ada and Brenna went into
  the tavern"). A rewind to the last rest crosses journeys like anything else. Every arrival's patch
  holds the old map (about 70 KB), so a session of many back-to-back moves drops older undo steps
  sooner by the byte cap.
- **Saving.** The table file holds the state (with its parked nodes) and, beside it, the world pack
  (`table.world`). A table of a dozen visited battle nodes of the stock maps' size is about 1 MB of
  state; the world pack is at most 4 MB, pictures included.
- **Exporting.** A table export (#83) carries the world pack with the state and the files, so
  another server can open it. Importing a table export is still not built (P12).
- **Replacing a world** with a newer version keeps parked nodes as they are (they hold their own
  maps) and the known lists by pack id; a node the new version lacks keeps its parked record and is
  marked `gone` (a false destination, for Teleport). The DM is told what changed.
- **The state version** goes from 21 to 22, with a migration adding `world: null, place: null,
  parked: {}, journey: null`. (The stale marks are fields of a parked record, so they add no
  version of their own; the table rule `watching` is a setting, absent meaning `live`.)
- **Atlas edits** (Decision 13) live in the index in the state, so undo, saving and the table
  export carry them with no other change; the pack in `table.world` is never rewritten.

### Decision 12: what players are sent

The players' view (`view.js`: in V1 one live view, that of the group in play, for every player, with
`watching` for those whose characters are elsewhere, Decision 5) gains, by allow list, nothing that
is not listed here:

| Thing | A player is sent |
|---|---|
| The world | its `name` once any node is known to them |
| Nodes | only **known** nodes: visited by a party creature, or shown with `showPlace`, and the ancestors of those. Each as `{ id, name, kind, scale, parent?, image?, pins? }` with an **id given when first known** (`pl1`, `pl2`, ... in that order), never the pack's id, as scenes number theirs (`scenes.js`). A navigation node's picture asset is sent with it, so the server lets them fetch it (M9) |
| Pins | of a known navigation node: those that lead to known nodes, and those the DM shows; renumbered, without `battle` |
| Entries | of a known battle node: those a party creature arrived by, those of kind `gate`, `dock` or `circle` whose cells the party has seen, and those the DM shows; by name and kind, renumbered; never `near` or `far` |
| Routes | only those travelled or shown, between known nodes, with `mode`, `miles`, `hours` or `minutes`; never `encounters`, tables or `wayside` |
| The place in play | to every player, the live player view of the group there (Decision 5): the same map, creatures and events whichever group the player's characters are in; for a player whose characters are parked it comes marked `watching` and, under the table rule `watching: 'off'`, as the band alone. Never anything a player of that group is not sent |
| Markers | every group of the party: who is in it and the known node (and pin) it is at. Never anything else of a node they are not in |
| The journey | `{ route, mode, pace, travellers, done, total }` when the route is known, in hours. Never `next`, never the table. A stop is sent as stopped, not why |
| Encounter checks | nothing, unless the route's `roll` is `open` (then the roll and the row's `text`) |
| Teleport | its outcome as the travellers live it: where they are, the damage. The 1d100 is the DM's; Off Target's miles and direction are told in words, not numbers **(confirmed by the owner, question 6)** |
| Away party members | the full record of each (they are Open party records), drawn as read-only sheets |
| Parked nodes | a parked place is never sent as a place, to anyone: no map, no creatures, no events (its players watch the place in play instead). To everyone: the name of the node, if known, and who of the party is there |
| Stale places and the stale choice | the DM only: `placeStale`, the choice and `keepPlace` / `resetPlace` events. A player is told nothing of a place going stale |
| The atlas editor | edits are the DM's; a player sees an edited atlas only through the known-node and shown-pin rules above (a pin the DM just placed that leads nowhere known is not sent) |
| Sigils, familiarity, sanctuary | for party creatures only, to their players and the DM |

- **Player ids for nodes, pins and entries.** A player's `enter`, `jump` or `cast { node, entry }`
  names them by the ids they were sent; `apply()` translates them first, as it translates hidden
  creature ids now, and an unknown id gets the same answer as one that does not exist.
- **The map of a new battle node** is sent whole on arrival, as `loadMap` sends it now (35 to 70
  KB), and only what the region and sight rules allow of it. A holding map is never sent.
- **Acceptance tests** (in `view.test.js`): a world with a node called by a canary id and name,
  never visited or shown, leaks neither to any player message through a journey, a split, a drop-in,
  a Teleport and an undo; a route's table and its monsters reach no player; a `roll: 'engine'` check
  that finds wolves sends nothing until the fight; with the party split, the players at the port city
  are sent the keep's view exactly as the players at the keep are sent it (the same messages), and
  a canary of DM-only content at the keep (a hidden creature, an unrevealed room, a secret roll, a
  DM note, a handout shown to one named player, a stale notice) reaches none of them; they are sent
  nothing of the port city's own parked map or creatures, and the in-character lines said at the
  port reach only the players of the port; with `watching: 'off'` they are sent the band only; a
  player's `enter` on a guessed `pl` id is refused as unknown.

### Decision 13: the atlas editor is in the first build

**Question.** Is a world pack made only outside the game, or can the DM place pins on an uploaded
picture and draw routes in the game?

**What changed.** The first draft kept the in-game editor for a later stage (question 8). The
owner answered on 15 November 2026 that the **pin and route editor is wanted in the first
build**. The engine side is W5b and the screen is W9b (Build plan); a world pack made outside
and checked by `npm run world` is still the way to bring a large atlas in.

Everything below except the fact that the editor is in the first build is **(design choice,
lead's proposal)**; the owner chose the stage, not the design.

- **One action, `atlasEdit { op, ... }`** (DM only), taking over "a pin on a navigation node" from
  `nodeAdd`, which keeps battle maps, scenes and sites. Its operations:
  - `pin`: add (`node`, `at: [x, y]` on the picture, `name`, `to?`, `entry?`), move, rename,
    re-point (`to`, `entry`) and remove a pin; a pin is dropped by a tap and moved by a drag;
  - `route`: add (`from`, `to`, `mode`, and `miles`, `hours` or `minutes`, `terrain?`, `road?`,
    `back?`), change and remove a route. Drawn by tapping the two pins; `miles` is filled from the
    picture's scale when the two pins are on one node and the scale is set;
  - `node`: add a **navigation node** from a picture the DM uploads (the existing asset upload,
    M9; its size is the asset rules'), with a name, a `scale` (`world`, `region`, `city`,
    `district`, `site`), a `parent`, and optionally `terrain`; rename and remove one that no
    creature is in and no parked record holds;
  - `scale`: set a node's miles or feet per 100 pixels by tapping two points on the picture and
    typing the distance between them (as tracing a map sets its scale, `maps-and-objects.md` M10).
- **Where it writes.** The edit is made to the **index** in `s.world` (pins and routes are in it,
  Decision 2), marked `edited: true` (a node or pin the DM made also `added: true`, as `nodeAdd`
  does). `table.world` and the pack's maps and pictures are not rewritten. It is therefore undoable
  like any action, saved with the table and carried in the table export, and **"Save the atlas"**
  in the Packs screen writes a new world file from the pack and the index together
  (`*.hextable-world.json`, the format of Decision 2) so a DM can reuse what they drew. Replacing a
  world with a newer version keeps the DM's added nodes and pins (Decision 11) and lists the ones
  whose target the new version lacks.
- **What it does not edit** in the first build: encounter tables and their monsters (text in the
  pack, checked by `npm run world`), a vessel's definition, and a route's `wayside` list; binding a
  battle map to a pin is a picker over the pack's maps and the stock maps (the "Fight here"
  chooser's data, Decision 7).
- **Limits.** The same `WORLD_LIMITS` as an imported pack (300 nodes, 100 pins a node, 500 routes,
  depth 8, names 60 letters); an edit past one is refused with a sentence and changes nothing.
  Ids are made by the engine from the name (kebab, `-2` on a clash) and never typed.
- **What players are sent.** Nothing new: a pin or route is sent by the known-node rules of
  Decision 12, so a pin the DM has just placed that leads to an unknown place stays unseen until
  the DM shows it (`showPlace`) or the party has been there.
- **The screen.** The atlas view of "The screens" gains an **Edit** mode for the DM: tap to drop
  a pin, drag to move it, a bottom sheet for its name, target and entry; Route (tap pin, tap pin);
  Add a map (pick a picture); Scale (two taps and a distance); pinch to zoom as in the atlas.
  Touch targets 44 pixels or more at 390 x 844.

**Reasons.** The owner wants to build the world in the game. Editing the index keeps `apply()`
pure and every edit undoable, and leaves the pack as the DM imported it.

**Cost.** One engine action with a linter's checks (W5b), one client mode (W9b), and a world-file
writer for "Save the atlas".

### Decision 14: outdoor light follows the world clock

**Question.** The engine has a world clock (it starts at 08:00, `scenario.js`) and takes dawn as
06:00 (`rests.js`), and the renderer already tints the picture by the hour (`lightAt(clock)` in
`render.js`), but a level's light is fixed: `sight.md` Decision 3 says a level is `bright`, `dim`
or `dark` as the map sets it. Should light outdoors change with the hour?

**What changed.** The first draft left day and night out (question 7). The owner answered on
15 November 2026 that outdoor light should follow the world clock, **with travel**: it is its own
decision and stage (W6b), because a journey moves the clock by days and a party walking into
dusk is the case that matters. The SRD gives no hours of light; what the engine does with the clock
is below, and all of it is **(design choice, lead's proposal)** except that the light follows the
clock and comes with travel.

- **The flag.** A level or a region may say `daylight: true` ("this is outdoors"). It is optional,
  so a map without it is lit exactly as before and the map `format` stays 2; `lintMap` refuses a
  level or region that gives both `daylight` and `light` ("A place is either outdoors or lit as it
  is set"). The map editor sets it with the same Light selector that sets ambient light
  (`sight.md`: "Same as the level"), as an extra choice, "Outdoors (follows the hour)".
- **The hours.** From the clock's minute of the day: **bright from 06:00 to 18:00**; **dim**
  (twilight) from 18:00 to 20:00 and from 04:30 to 06:00; **dark** from 20:00 to 04:30, or **dim**
  when the table rule `night` is `moon` (moonlight, `sight.md`'s "dusk, moonlight"; the default
  is `dark`, so torches matter). The hours are close to the renderer's own colour grade (its night
  value is reached by 21:30) and the engine's dawn at 06:00; both read the same table from one pure
  function, so the picture and the rules cannot disagree.
- **What it feeds.** The ambient light of a `daylight` place is the hour's, in place of the fixed
  value: `ambientAt` (`sight.js`) takes the clock; sources add light as now (a torch in the dark is
  still a torch); a region's own `light` still wins over its level's `daylight`, so a lit hall on
  an outdoor level stays lit. Under the `light` sight rule this decides who can see whom, Dim
  Light's Disadvantage on Perception, and what players are sent, exactly as `sight.md` has it.
- **Cost of the cache.** The party's view (`vision.js`) is kept and rebuilt when something it
  depends on changes. The hour's band (bright, dim, dark) becomes one of those things: it is
  rebuilt when the band changes, not each minute, and never on a map with no `daylight` place.
- **Telling the table.** When the band changes on a map that has a `daylight` place in play, one
  event, `lightBand { band }`, goes to every player and the log says "Dusk falls.", "Night falls.",
  "Dawn breaks."; the clock chip already shows the time.
- **The stock maps.** The starter valley is **not** flagged, so a game that rests through a night
  plays exactly as it does now (every row of this spec keeps the valley as it plays today). The
  stock maps W7 tags for roads, forests, hills and shores are flagged, since a fight on the road at
  night is the case this is for; the owner may flag the valley too.
- **Not here.** Weather, seasons, the moon's phases and indoor windows. A level that is partly
  open to the sky uses a region.

**Reasons.** The owner asked for it, the clock and the picture already exist, and a flag keeps
every existing map as it is.

**Cost.** One optional field and its linter and editor row, `ambientAt` taking the clock, one
cache key, one event and its log line, a table rule, and tests on `sight.md`'s cases at the three
bands (W6b). `sight.md` Decision 3 gets a pointer when W6b is built.

## The screens

- **The atlas view**, for everyone: the navigation node's picture with its pins and the group
  markers; pinch to zoom and drag on a phone, wheel and drag on a desktop. A pin's tap offers Go
  there, Go in and, on a child, Go out (as the table rule allows); a marker's tap shows who is in it
  and, for the DM, Go to. A breadcrumb at the top (The continent > The port city > A tavern) climbs
  back. Places with no pin are a list under it. On a phone it is full screen with the breadcrumb and
  a bottom sheet for the pin or marker tapped. For the DM an **Edit** mode (Decision 13): drop and
  move pins, draw routes, add a map from a picture, set its scale.
- **The battle map** is the existing 3D view, entered from the atlas; its breadcrumb's last step is
  the map's name, and Go out returns to the atlas.
- **The DM's Travel section** in the drawer (`table-ui.md` Decision 2): the nodes (in play, parked
  with who is there, not yet visited), Go to, Forget; routes from here with Set out (pace, who); a
  journey bar with Next stretch, Next hour, Gallop, Camp, Push on, Arrive now, Stop, the encounter
  check that came up (Fight here, with the chooser of Decision 7; Skip), and checks by terrain DC.
  "Fight here" is also on the atlas view whenever the DM is on a navigation node.
- **The road scene** is the existing scene screen (`packages/client/scenes.js`) with a header of the
  route, pace and progress, and the atlas with the moving marker one tap away.
- **Away** characters are listed in the party bar as "At the keep", with a read-only sheet. A parked
  group's players watch the place in play, live, under a band: "Watching Ada and Brenna at the keep.
  Your characters are at the port city. What you watch is not what they know." (Decision 5; with
  `watching: 'off'` the band is all they see). The DM's party bar marks who is watching. A stale
  place carries a chip in the Travel section with Keep, Reset and Edit; going to it asks first.
- **The Packs screen** imports a world pack, shows the linter's problems in plain sentences, and
  lists what it holds. The atlas is made outside the game: in a text editor, by a script, or by an
  AI model writing the JSON (as `homebrew.md` describes for packs), checked by `npm run world --
  file.json`, or in the game with the atlas editor (Decision 13, in the first build), whose
  **Save the atlas** writes the pack and the DM's edits back out as a world file.

## Build plan

Each row is one pull request. Engine rows change `engine/`, the vocabulary or what players are
sent, and need the strongest model; their review points are the hidden-information tests and "a
rejected action changes nothing". Every row runs `npm test`, `npm run content` and `npm run build`;
client rows also run their smoke passes at 1280 x 800 and at 390 x 844 with touch. After every row
the valley plays as before, and a table without a world is unchanged.

| # | Task | Lane | Files it may touch | Done when |
|---|---|---|---|---|
| W1 | **Entries.** `entries` and `start.entry` in `lintMap` and `mapEdit`; `loadMap { entry }`; marching order at arrival; a start's `z` from its level (P18) | **engine** | `map.js`, `engine/dm.js`, `packages/rules/test/map.test.js`, `test/travel.test.js` (new) | the keep with a `gate` and a `roof` entry sets the party down at each; an unknown entry and one nobody can stand on are refused with nothing changed; every stock map still loads as before |
| W2 | **Nodes and parking (V1).** `s.place`, `s.parked`, the holding map, `loadMap { node, who }`, `enter`, `leave`, `goTo`, `forgetPlace`, `nodeAdd`, `place { node }`, catching up (`tick`, `dawn` for a list of creatures), the parked cap, the fight refusal off battle nodes; **the stale rule** (`staleDays`, the check wherever the clock moves, `placeStale`, `keepPlace`, `resetPlace`, `stale` on `goTo`, `enter` and `loadMap`); state version 22; `describeStep` labels | **engine** | new `places.js`, new `engine/travel.js`, `engine.js` (spread the handlers), `engine/dm.js`, `engine/rests.js` (export `dawn` for a list), `engine/resolve.js` (the fight refusal), `map.js` (`holdingMap`), `migrate.js`, `history.js`, tests | leave the keep with a door open and a goblin tied up, come back: both as left; a Wand's charges come back for each dawn an away member missed; a split party cut back and forth; `startEncounter` on a navigation node is refused and nothing changes; undo of an arrival restores both nodes exactly; a valley table is unchanged by the migration but for the four new fields; a place parked for 9 days 23 hours is not stale and one parked for 10 days is, the DM alone is told, going to it without `stale` is refused with the question and nothing changes, `keep` clears the mark and starts the ten days again, `reset` rebuilds it from the pack and sets the party down at its entry, nothing ever resets by itself, and a portal arrival keeps it as left |
| W3 | **The world pack.** `worldpack.js`: budget, linter, `WORLD_LIMITS`, the index; `worldIndex`; the server's `world` message, storage beside the state, the fill of `map` into actions, assets on import; the solo transport the same; `npm run world` | **engine** + server | new `packages/rules/src/worldpack.js`, `engine/travel.js`, `packages/server/src/tables.js` (named for this row), `packages/server/src/index.js`, `packages/server/README.md`, `packages/client/transport.js` (the solo fill), `scripts/world.mjs` (new), `package.json` (the script line), tests | a pack with a continent, a city plan, two battle maps and a route imports; one with a bad map, a monster not in the pack, 301 nodes, depth 9 or a `__proto__` key is refused with a plain sentence; a client's own `map` in an `enter` is replaced by the pack's |
| W4 | **The view of the place in play for everyone, and the groups' markers.** groups, markers, the live player view of the group in play sent to every player and marked `watching` for those whose characters are parked, the table rule `watching`, `say` by node, player ids for nodes, pins and entries, the allow list of Decision 12 | **engine** + server | `view.js`, `engine.js` (the id translation), `scenes.js` (`say` carries its node), `packages/server/src/tables.js` (a view per group), `packages/client/transport.js`, tests in `view.test.js` and the server's | the acceptance tests of Decision 12 pass, including that a watcher is sent exactly what a player of the group in play is sent and that no DM-only canary reaches one; with no world, every player is sent exactly what they are sent today |
| W5 | **Moving on navigation maps.** `jump` with route, scale or given minutes; pins' routes; the `atlasMoves` table rule | **engine** | `engine/travel.js`, `engine/dm.js` (the setting), `travelrules.js` (new: the SRD's numbers, pure), tests | a jump of 1,500 feet across a city plan with a scale takes 5 minutes at Normal pace; the ferry takes its 20; a player moves their own character and is refused for another's, and for anyone under `atlasMoves: 'dm'` |
| W5b | **The atlas editor, engine.** `atlasEdit` (pins, routes, a navigation node from an uploaded picture, a node's scale), its linter checks inside `WORLD_LIMITS`, the `edited` and `added` marks, the world file written from the pack and the index, `describeStep` labels. First build (the owner, 15 November) | **engine** | `engine/travel.js`, `worldpack.js` (the writer), `history.js`, tests | a pin dropped on the city plan is sent to no player until the DM shows it; a route between two pins takes its `miles` from the scale; a pin past 100 on a node, a node past 300 and a route past 500 are refused with nothing changed; undo takes an edit back; the pack in `table.world` is unchanged; the world file written from a table with edits imports into a fresh table and gives the same atlas |
| W6 | **Journeys.** `journey`, `journeyStep`, `journeyEnd`, the road scene, pace and its limits from terrain, roads and slow travellers, vessels, special movement, the travel day and extended travel saves, gallop, the pace effect on checks, the food and water reminder, arrival | **engine** | `engine/travel.js`, `travelrules.js`, `engine/rests.js` (rest on the road, gallop reset), `scenes.js` (a scene owned by a journey), `view.js` (journey), tests | 48 miles of grassland road at Normal is 16 hours over two travel days; Fast is refused on a mountain route and allowed with a road on a hill; a traveller at half Speed forces Slow; a ninth hour asks each traveller for a DC 11 Constitution save; a 1-hour spell ends on the road; a Wand regains charges at the dawn passed; `journeyEnd { arrive: 'now' }` arrives with the clock unmoved |
| W6b | **Day and night light.** `daylight` on a level and a region in `lintMap` and the map editor's Light selector, the one pure table of the hour's bands shared with the renderer's grade, `ambientAt` taking the clock, the `vision.js` cache key, the table rule `night`, the `lightBand` event and its log line, the stock maps W7 tags. Comes with travel (the owner, 15 November) | **engine** + client (the editor row) | `sight.js`, `vision.js`, `map.js`, `engine/dm.js` (the setting), `view.js` (the event), `packages/client/editor.js` (the selector), `packages/client/render.js` and `render-three.js` (read the shared table), `docs/specs/sight.md` (a pointer under Decision 3), tests | on a `daylight` level the party sees a goblin at 12:00 and not at 22:00 without a torch, and sees it with one; a region with its own `light` on that level is unchanged at night; the same map at the three bands passes `sight.md`'s cases; a map with no `daylight` is byte for byte as before, valley included; the view is rebuilt when the band changes and not each minute; a table that rests through the night gets "Night falls." once |
| W7 | **Fights at any level.** the "Fight here" chooser's data (bound `battle` maps, stock maps by `terrain`), sites as child nodes, `keep`; encounter checks, `roll` modes, `journeyFight`, the encounter distance, `journeyResume`; `terrain` tags and `near`/`far` entries on the stock maps | **engine** + content | `engine/travel.js`, `engine/dm.js` (foe placing shared with `spawn`), `view.js`, `scripts/gen-maps.mjs`, `packages/rules/src/content/maps/*.js` (regenerated), `docs/maps.md`, tests on hexes and on `undercroft` | a fight called on the city plan offers the bound street map first and the stock maps tagged `urban` next; after it, `leave` returns the group to its pin with the clock moved by the rounds; a seeded road check finds 1d4+1 wolves placed 2d8 x 10 feet from the party on `forest-road`, and nothing of it reaches a player before the fight |
| W8 | **Teleport spells.** `with` and `node` on the `teleport` step, the `travel` step, familiarity and the 1d100 table, Off Target and Similar Area handed to the DM, mishaps, the portal and the permanent circle objects, sigils, sanctuary, `familiarity`/`sigil`/`link` | **engine** + content | `content/schema.js` (the step fields, a spec amendment), `effects.js`, `engine/resolve.js` (`KIT`), `engine/casting.js`, `engine/travel.js`, `view.js`, `content/srd52/spells-4.js`, `spells-5.js`, `spells-6.js`, `spells-7.js` (Dimension Door, Teleportation Circle, Word of Recall, Teleport only), `content/srd52/objects.js` (the two generic definitions), tests | Teleport to a very familiar place with the seed set to roll 03 is a Mishap: 3d10 each and a reroll; at 30 it is On Target at the named entry; eight willing passengers go, a ninth is refused; a portal takes two of five through and the table stays; the fifth through takes the table; Word of Recall without a sanctuary spends the slot and does nothing; `npm run content` shows the four at their new tiers |
| W9 | **The screens.** the atlas view with pins, markers and the breadcrumb; Go in, Go out, Go there; the DM's Travel section and the Fight here chooser; the road scene's header; away characters and the watching band, with the party bar's mark of who watches; the stale chip with Keep, Reset and Edit; the Packs screen's world import | client | new `packages/client/atlas.js`, `atlas.css`, new `packages/client/travel.js`, `drawer.js`, `scenes.js`, `app.js`, `index.html`, `scripts/smoke/travel.mjs` (new), `scripts/smoke.mjs` (one registry line) | `SMOKE_ONLY=travel` at both sizes, touch at 390 x 844: import a world, see two groups' markers on the continent map, drop into the port city's plan, jump to the tavern pin, go in, fight on the tavern map, go out, set out on the road, fight wolves, arrive at the keep's gate; a player sees only the places they have been, and a player whose group is parked watches the group in play live under the band, and a DM-only canary never reaches them; no page errors |
| W9b | **The atlas editor, screen.** the atlas view's Edit mode: drop and drag pins, a sheet for name and target, Route by two taps, Add a map from a picture, Scale by two taps and a distance, Save the atlas. First build (the owner, 15 November) | client | `packages/client/atlas.js`, `atlas.css`, `scripts/smoke/travel.mjs` | at both sizes, touch at 390 x 844: add a map from a picture, drop three pins, point one at a battle map, draw a route, set the scale, save the atlas and import the file into a fresh table; the DM's edit shows to a player only once shown; no page errors |
| W10 | **Smaller parked nodes**, only if table files prove too big: an unedited parked map kept as its differences from the pack's | **engine** | `places.js`, tests | a parked keep with three doors changed is under 2 KB of state and comes back identical |
| W11 | **Vehicles that carry creatures** on a battle map (P3), after companions C6 | **engine** | `engine/movement.js`, `engine/world.js`, `space.js`, `content/schema.js` (`carries`), tests on both grids | a cart moved 30 feet takes its two passengers along; a passenger pushed off falls |
| W12 | **V2: places at once**, only if the owner wants it, after a spec amendment: the place lens, per-node clocks, seed streams and histories, per-node waiting, two fights | **engine** | `engine.js`, `places.js`, `rng.js`, `history.js`, `durations.js`, `view.js`, `packages/server/src/tables.js`, the client's tracker and drawer | to be written in the amendment |

**What can run side by side.** W1 first. W2 after W1. W3 can start with W2 (merge one first: both
hold `engine/travel.js`). W4 after W2 and W3. W5 and W6 after W4. W5b after W5 (it holds
`engine/travel.js` too: merge one first). W6b after W6, beside W7 and W8 (it holds `sight.js`,
`vision.js` and `map.js`, and shares `view.js` with them: merge one first). W7 and W8 after W6, side
by side if they do not both hold `view.js` (merge one first). W9 after W5, its journey and fight
parts after W6 and W7; W9b after W9 and W5b. W10, W11 and W12 when needed. The work can stop after
any row: after W2 a DM can keep several places with `loadMap { node }`; after W5 the atlas works;
after W9b a DM can build one in the game; after W6 the party travels; after W6b the road has a
night; after W8 it teleports. The editor (W5b, W9b) is in the first build, not a later stage, and
the light (W6b) comes with the journeys (W6): both are the owner's answers of 15 November.

**Build notes, W2 (#579, #580).** On a navigation or scene node nobody, the DM included, can `move`: the group stands at a
pin and goes between pins and places, never by cells, and every walk there is refused in the same words, so the answer never
depends on a creature the player cannot see.

## What stays manual

- Getting lost, foraging and what a Search finds on the road: the DM, with the terrain's DC offered.
- Where Off Target and Similar Area land; the 365 days of a permanent circle; Teleport of an object;
  other planes.
- A ship's crew, its damage, the wind and the weather.
- Spending rations and water (until gear has quantities).
- What happens in a parked place while the party is away; two fights at once (V2).
- Weather, seasons and the moon: day and night light by the clock is in (Decision 14); the SRD
  gives no hours, so the hours are a design choice.

## Risks

- **`loadMap` is shared by every map change.** W1 and W2 change it; with no `entry` and no `node` it
  must do exactly what it does now. A test loads every stock map both ways and compares.
- **Parking moves creatures out of `s.entities`.** Anything that keeps an id of an away creature (a
  `follow`, a bond, an effect, a reaction instruction, the fight order) must be cleared or carried
  with it. W2 lists every field that holds a creature id (a source-reading test, as companions C1
  does for `.owner ===`).
- **The holding map.** Rules that run after every action (gravity, watching for hidden creatures,
  lookAround) run on it too; it must be plain enough that they do nothing there. W2 tests a long
  stay on a navigation node with every after-action pass.
- **A watching player is sent a scene their characters were not in.** The owner chose it. The
  view is the player view of the group in play, never DM-only content (W4 is the review point,
  and its canary test the guard); what the character knows is the table's to rule, said in the
  band, with the `watching` switch for a DM who wants it off. With no world every player is sent
  exactly what they are sent today. The "party sees as one" assumption of `sight.md` S7 holds,
  since there is one view for all, not one per group.
- **Stale is a notice, not a rule of the world.** Nothing resets by itself; a DM who ignores the
  chips keeps every place as left. A reset throws away a place's changes (the DM is told what),
  and undo brings them back while the history lasts.
- **The atlas editor writes into the index in the state.** A bad edit is a bad state, so every
  operation is checked by the same limits as an imported pack and changes nothing when refused.
- **Daylight changes who sees whom.** On a flagged map, the hour is a rule. The valley is not
  flagged so that it plays as before; the cache is rebuilt by band, not by minute, and W6b tests
  that a map with no `daylight` is byte for byte unchanged.
- **Undo size.** Arrivals carry a map each way; measured in W2.
- **The server fills actions.** A new path between the table record and `apply()`; it must run after
  the size check and before the history records the action. W3 tests both orders.

## Questions for the owner

All twelve were answered by the owner on 15 November 2026 (issue #193, the comment "Q&A
lead, 15 November, 08:30 ET"; the 14 November comment numbered eight of them differently,
and this list keeps the spec's own numbers). Eight are confirmed on their defaults, four
changed the design. Where an answer left a detail open, the spec marks the proposal
"(design choice, lead's proposal)" for the owner to confirm.

1. **Split party: one place at a time or several at once.** *Answered 15 November 2026:
   default confirmed, V1: one place in play (the table's focus) and the others parked,
   with V2's shape kept so V2 can follow.* V2 (places running at once) costs per-place
   clocks, dice and undo; W12. What changed: nothing (but see question 12: the parked
   group now watches).
2. **Parked places in full.** *Answered 15 November 2026: default confirmed (the whole map
   is kept, 16 battle places at most, the DM lets one go to make room), with a caveat.* The
   owner: "it's only a valid state for a 10 day per the world clock, otherwise life moves
   on." Asked what happens when the 10 days run out, he chose: the place is marked stale,
   the DM is told, and the DM decides (keep it as left, reset it to how it was prepared, or
   edit it by hand); nothing resets by itself. What changed: Decision 5 gains "Stale
   places", the parked record gains `kept` and `stale`, and `keepPlace`, `resetPlace` and
   `stale` on `goTo` are added (Decision 10, W2). What a reset does to the party creatures in
   the place and when the ten days restart are the lead's proposals. He also thought aloud:
   "Can the state be archived." That is an idea, not a decision: a parked place put away,
   not counted in the 16, and brought back later. It is recorded in Decision 5 as noted and
   not built; compaction (W10) remains only if table files prove too big.
3. **Away characters.** *Answered 15 November 2026: default confirmed: an away character
   is parked with its place and cannot rest, level up or change gear until the table is
   with it.* What changed: nothing.
4. **Effects across places.** *Answered 15 November 2026: default confirmed, an effect that
   would span two places ends at the parting, as `loadMap` does today, except what moves
   with a traveller*, after a discussion. His view, for the record: "The effect is either
   temporal or proximic or both, it should apply per the rules. I'm concerned that we're
   creating code rather than conditions. If it's proximic at application then every
   character would carry it with them. If it's proximic to a character or object then it's
   a distance check. If it's temporal, then the clock tells us everything." The lead
   explained that the draft's rule is a shortcut (parked places are frozen and have no
   distance between them) and is not always the rules (Bless needs range only when cast), and
   offered his rule, his rule later, or the default; he chose the default. What changed:
   nothing; his rule is not designed here.
5. **The travel day.** *Answered 15 November 2026: default confirmed, 8 hours of travel
   since the travellers' last Long Rest*, then the extended travel saves; a crewed vessel's
   passengers make none. The SRD says "per day". What changed: nothing.
6. **Off Target in numbers.** *Answered 15 November 2026: default confirmed: players are told
   in words; the DM gets the miles and the direction.* What changed: nothing.
7. **Day and night.** *Answered 15 November 2026: changed.* Wanted **with travel**: outdoor
   light follows the world clock. What changed: its own Decision 14 and stage W6b; the
   `daylight` flag, the hours of each band, the table rule `night`, the cache key, the
   `lightBand` event, and which stock maps are flagged are the lead's proposals, and the
   valley stays unflagged so it plays as before. "What stays manual" and Goal 10 follow.
8. **An atlas editor in the game** (placing pins on an uploaded picture, drawing routes).
   *Answered 15 November 2026: changed.* The pin and route editor is wanted **in the first
   build**, not later. What changed: Decision 13, `atlasEdit` (Decision 10), stages W5b and
   W9b, "Save the atlas", the Packs screen and the atlas view's Edit mode. The design of the
   editor is the lead's proposal; the owner chose the stage.
9. **Who moves on a navigation map.** *Answered 15 November 2026: default confirmed:
   players move their own characters between pins and in and out of places when the table is
   on that map and not fighting; the DM can switch it to DM-only (`atlasMoves`).* Journeys are
   always started by the DM. What changed: nothing.
10. **Who chooses the pace.** *Answered 15 November 2026: default confirmed, the DM*, on the
    party's word at the table. What changed: nothing.
11. **Familiarity by visits.** *Answered 15 November 2026: "whichever is easier."* The default
    stays: first arrival is "viewed once", second "seen casually", "very familiar" only by
    the DM. What changed: nothing now. If W8's builder finds that the DM setting it all is
    simpler, W8 says so in its pull request and amends Decision 9 then; that is the
    owner's answer applied, not a new question.
12. **A parked group's screen.** *Answered 15 November 2026: changed.* Waiting players
    **watch the other group's scene live** rather than a frozen view of their own place.
    The lead's assumption, not asked: they see what that group's players see, never
    DM-only things. What changed: Decision 5 "What players see" (one live view for all, the
    old hidden-information point rewritten, in-character speech, what their characters know
    flagged for review, the `watching` switch), Decision 12, the Screens, W4, W9, the risks
    and the V2 notes. The frozen view and the "as shown when parked" copy are gone.

## Adventure modules

A world pack inside an adventure module takes its maps and assets from the module: see [adventure-module.md](adventure-module.md) ("Where this spec changes or meets existing specs", item 2).
