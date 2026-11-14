# Spec: renderer

Status: draft by an agent, to be reviewed by the design owner.

Covers how the game is drawn: floors, walls and rooms built from the map
document, creatures with models, sizes and height, doors, traps and spell
effects, the order and pace of animations, light and remembered places from
the sight spec, what a phone can afford, and the interface between the table
UI and a renderer. It decides whether to keep the hand-written WebGL renderer
or move to Three.js.

Nothing here changes a rule. The rules stay on 5-foot hexes, the engine stays
pure, and the server stays authoritative and instant. Two small engine-side
additions are named (a table setting, and `image` on a level, which
`maps-and-objects.md` already lists), and they are marked where they occur.

## Where we are

`packages/client/render.js` is 553 lines of plain WebGL 1 with no textures.

- One shader: vertex colours, one directional light, fog, a tint per draw, a
  colour grade for the hour of the day.
- **Terrain** is every tile drawn as its own raised hexagon: a top, a rim in a
  darker shade, and six side faces down to below the floor. A slight random
  shade per hex makes the grid stand out further. Forest tiles carry two
  lathe-turned trees each.
- **Walls** are slabs 1.15 units high (about 3.3 ft at the drawing scale, so
  the camera sees over them) along each wall segment, with no joints. Doors
  are thinner slabs; an open door is drawn swung back. Things in a hex are a
  ring on the floor and sometimes a post.
- **Creatures** are lathe-turned pawns, one profile per theme, scaled by size
  and placed at the middle of their footprint. Fliers float with a mark on the
  floor under them. Shadows are soft blobs.
- **Overlay**: movement and area hexes, rings for targets, allies, the turn
  and the selection, and a glowing curtain round the arena in a fight.
- **Animation**: a `moved` event walks the pawn along its path; `damage`
  flashes the target; a critical hit shakes it. Everything else (health bars,
  falling over, doors) changes the moment the new state arrives. Floating
  numbers are timed by `app.js` with fixed delays.
- **Picking** marches a ray from the camera and tests pawns as cylinders and
  hex columns by height. It works on several levels.
- **Levels above** whoever is selected are not drawn (`setCeiling`).
- **Regions the players have not seen** are drawn darker for the DM.
- Names, health bars and floating text are HTML laid over the canvas.

The whole terrain is rebuilt into one buffer when the map, the reveal or the
ceiling changes, and the overlay is rebuilt when highlights change. On the
starting valley the frame cost is small; there are no textures to load and
nothing to download.

What the owner asked for that it cannot do today: rooms that look like rooms
rather than a honeycomb, a floor that is a picture, models and animation, a
paced sequence of events, light, and memory of places out of sight.

## Goals

1. **Draw rooms, not hexes.** A building looks like a building and a cave
   like a cave. The hex grid is there to read, faintly, and strongly where it
   matters: movement, areas, the arena.
2. **Events play in order, and the table waits for them** if it wants to,
   without the server waiting for anyone.
3. **Creatures have models and animation**, with the right footprint and
   height, flying, on ledges and under floors.
4. **Doors, traps and spells are seen to happen.**
5. **It runs on a phone**, with a frame budget and a known order of what to
   cut.
6. **Light, darkness and memory** from the sight spec are drawn.
7. **The renderer can be swapped** behind a written interface, so the current
   one and a new one can stand side by side while one replaces the other.

Not in this spec: the map editor's own tools, sound, a free-roaming first
person camera, and character portraits.

## The eight decisions

### Decision 1: floors are built from the map document, not drawn per hex

The picture of a level is built from its tiles, walls and regions in map
feet. The rules keep their hexes; the picture does not show them as separate
pieces.

**Patches.** The tiles of one level are grouped into patches. A patch is a
connected set of tiles with the same region (or none), the same terrain and
the same height (`level.z + tile.h`). A patch is drawn as one flat surface
with one colour (varied smoothly across the floor by position, not per hex),
and one edge.

**Cells.** Each tile starts as its hexagon in map feet (`center()` in
`walls.js` gives the middle; a hex is 5 ft across the flats).

1. **Clip to walls.** Where a wall segment that blocks movement (`wall`,
   `window`, `rail`, a shut or open door's frame line) crosses a cell from
   side to side, the cell keeps only the side its centre is on. A traced
   diagonal wall then gets a straight floor edge instead of a zigzag.
2. **Fill to walls.** Where a wall runs through a hex that has no tile, the
   part of that hex on the side of a neighbouring floor tile is added to the
   patch beside it, for the picture only. A corridor drawn between two traced
   walls then fills exactly the space between them. The rules are unchanged:
   that sliver is not a hex anyone can stand in, and it is not pickable.
3. **Merge.** Cell edges shared by two cells of the same patch are dropped.
   What remains is the outline. Every cell is convex, so the top is drawn as
   a fan of triangles per cell and no general polygon code is needed.

**Edges.** An outline edge is drawn as a side face (a skirt) down to the
patch below or to the ground, with a thin lip, but only where it faces: no
tile, a different height, or a wall. Where two patches meet at the same
height with no wall between (an archway between a hall and a nook, a puddle
in a stone floor), they meet with a colour change and no rim.

**The grid** becomes an overlay: thin hex outlines over the floors, drawn with
a theme alpha (`grid`, about 0.12 outside a fight). Inside a fight's arena it
is drawn stronger. Movement and area highlights stay as filled hexes, since
that is what the rules count.

**Walls** are built from their segments at the full rules height
(`WALL_HEIGHT`, 10 ft) with a thickness of about half a foot, and a post at
every point where segments meet so corners close. To keep the room visible,
walls between the camera and the focus are **cut away** to a low stub (about
3 ft) with a darker top cap, which is the usual answer in games seen from
above. Walls on the far side stand at full height. Which walls are near is
worked out per frame from the camera's yaw by the wall's facing, which is
cheap. A theme can choose low walls everywhere (today's look) instead.

**Doors** are a leaf in a frame. The frame is part of the wall; the leaf turns
on its hinge when the state changes (decision 4). A portcullis slides. A
secret door is drawn as wall for players until it is found (players are sent
it as wall, so the renderer has nothing to hide).

**Outdoors** (a level with no walls and no regions, like the valley) is a
height field: the corners of hexes are shared, each corner's height is the
average of the `lift` of the tiles around it, and colours blend at corners.
Where the rules height (`h`) changes by more than 2.5 ft between neighbours,
the field is not smoothed and a bank is drawn, because the rules see a step
there. Water is a flat sheet at its level. Forest is trees placed by a seeded
scatter over the forest tiles, not two per hex, with no hex rims. Rock tiles
are drawn as boulders and outcrops filling their hex. Until that is built and
approved, the valley is drawn exactly as today.

**Caves** are mostly rock with open hexes carved out. Rock tiles that touch an
open tile become cave wall: the boundary between them is drawn as a wall face
whose outline is pushed out into the rock by deterministic noise (seeded by
position, so every client draws the same), never into the open hex, so the
picture never shows rock where a creature may stand. Rock with no open
neighbour is not drawn, or is drawn as a dark mass at wall-top height. Open
cave floor is a patch like any other.

**A picture as the floor.** `level.image` is in the map document as designed
(decision 1 of `maps-and-objects.md`) but is not built: the Universal VTT
importer returns its image separately and nothing stores it yet. When it is,
it holds an asset id, the picture's size in feet and its origin. The level's
patches are then drawn with the picture as their texture, by map feet, instead
of a terrain colour. Walls are drawn thin and low by default, since the
picture has its own walls painted on, and the grid overlay stays faint. The
picture is scaled down in the browser to the device's texture limit, and to
2048 pixels on a side on phones (16 MB of GPU memory as RGBA).

**Levels above.** As today, floors above the creature being followed are not
drawn. They fade out over a third of a second instead of vanishing, and a
roof over the party's region is cut away the same way.

**Where it is built.** The patch, outline, wall and grid geometry is worked out
by a new pure module, `packages/client/floors.js`, that takes a map document
and returns plain arrays of triangles and lines in map feet with a colour key
per vertex. It imports only from `./shared/`. It is the same whichever
renderer draws it (decision 7), and because it is pure it can be tested with
Node's runner like the rules, which gives the client its first unit tests
(today it has a page smoke test, `npm run smoke`).

### Decision 2: the renderer plays events in order, on a timeline in seconds

`apply()` returns events in the order things happened. The renderer turns them
into **beats** and plays the beats one after another.

The new state arrives already final: the goblin is already dead in it. So the
renderer keeps the picture it last finished (the *shown* state: every
creature's place, pose, health bar and visibility, every object's state,
every region's reveal) and changes only what each beat is about, when that
beat plays. When the queue is empty, everything is brought in line with the
newest state it was given. That last step means the picture can never stay
wrong, whatever the events said or left out.

What each event type does, and how long it may take at normal speed. Types not
listed play nothing and take no time.

| Event | What is seen | Time |
|---|---|---|
| `moved` | walks the path, turning to face it; a step up is a hop, a climb is a climb clip | 0.18 s a hex, at most 2 s (faster on long paths) |
| `moved` with `forced` | slides back along the path | 0.25 s |
| `placed` | fades out and in at the new place | 0.3 s |
| `turn` | camera glides to the creature; its ring appears | 0.4 s |
| `encounterStart` | the arena edge rises and flashes (as today) | 1.2 s |
| `encounterEnd` | the edge sinks | 0.6 s |
| `joined` | ring pulse on the creature | 0.3 s |
| `attack` | the attacker faces the target and strikes, or shoots a projectile; a miss is a dodge | 0.6 s melee, 0.8 s ranged |
| `damage` | flash, health bar drains, the number floats | 0.4 s, starts with the end of the strike |
| `heal` | glow, bar fills, number floats | 0.5 s |
| `cast` | caster gesture, then the area's shape (decision 5) | 0.4 s + up to 0.8 s |
| `save` | "Saved" floats, or nothing | 0.3 s |
| `down`, `died` | falls over | 0.6 s |
| `deathSave` | the roll floats | 0.6 s |
| `cond`, `condEnd` | badge appears or goes; Prone lies down or gets up | 0.3 s |
| `stood` | gets up | 0.4 s |
| `std`, `note` | the words float | 0.5 s |
| `object` | door swings, portcullis slides, lever throws, chest opens | 0.5 s (portcullis 0.8 s) |
| `noticed` | pulse on the thing found | 0.5 s |
| `triggered` | the trap goes off (decision 5), then its own attack, save and damage beats | 0.6 s |
| `fell` | drops under gravity, dust | up to 0.6 s |
| `region` | the room rises out of the dark | 0.6 s |
| `revealed`, `spawned` | fades in | 0.4 s |
| `removed` | fades out | 0.3 s |
| `size` | grows or shrinks | 0.4 s |
| `effectStart`, `effectEnd` | an aura appears or goes | 0.4 s |
| `map` | fades to black, the new place fades in | 0.8 s |
| `time`, `rest` | the light eases to the new hour (as today), without holding the queue | 1.5 s, not waited for |
| `undone`, `redone` | the queue is skipped and the state shown at once | 0 |

**Grouping.** Beats that belong together overlap instead of queueing:

- an attack and its damage, and a `down` that follows them, are one beat;
- after a `cast`, every `save` and `damage` for different targets plays at
  once, so a fireball on eight goblins takes the time of one;
- the steps of one walk that were split by an opportunity attack are separate
  beats with the attack between them, which is what happened.

**Length of one action.** The beats of one update are scaled down together if
they add up to more than 3 s, except a walk, which has its own cap. A long
monster turn stays readable and never drags.

The log line and the floating text of an event are shown on its beat, not
when the update arrives, so the log does not give away the dice before the
sword lands. The renderer calls `onBeat(event)` as each event plays; `app.js`
writes the log line then. With pace `instant` every beat fires at once, which
is today's behaviour.

### Decision 3: the table waits for the picture; the server never does

A table setting, `pace`, says what happens while beats are playing:

| Value | Meaning |
|---|---|
| `wait` (default) | your own controls do nothing while beats are playing, apart from skipping. The monster AI waits for them before its next move |
| `flow` | beats play, but you can act at once; your action's beats join the queue |
| `instant` | no animation: everything shows at once, as today |

This is the one engine change in the timeline: `pace` is added to `SETTINGS`
in `engine.js`. It changes no rule, and settings are already sent to players.

*Built (#154):* `SETTINGS.pace` is `['wait', 'flow', 'instant']`, a new game has
`settings.pace: 'wait'`, and a table saved before it migrates to `wait` (no
state version of its own, like `unseenTurns`). The DM sets it with
`{ type: 'setting', key: 'pace', value }`. The engine never reads it; a test
plays one fight under each value and finds the same state and rolls.

How the wait works without the server waiting:

- The server applies every action at once and sends the result, as now. It
  does not know about animation.
- Each client queues the updates it receives and plays them. In `wait`, the
  action bar shows a quiet "…" while the queue plays; a tap on a control, or on
  the map, skips instead of acting. Nothing the player taps is lost silently:
  the skip is the visible answer.
- The monster AI runs in the DM's browser. It now starts its next step when
  the DM's queue is empty plus a short pause, instead of after a fixed 800 ms,
  so monsters act at the pace the DM sees. Players' queues are usually a beat
  behind or level with the DM's, never ahead, since they receive the same
  updates at the same time.
- Another player's action that arrives while your queue is playing is queued
  after it. Two players acting at once in exploration see both, in the order
  the server applied them.

**A slow phone** drops frames, not time: beats are timed in seconds, so a
phone at 15 frames a second finishes a 0.6 s strike in 0.6 s with fewer
pictures. If the queue falls more than 3 s behind (many updates at once, a
phone that stalled), it plays at double speed; more than 8 s behind, it skips
to the last update's beats. A tab that was hidden skips everything on its
return.

**Skipping.** A tap on the map, the "…", or the Escape key finishes every
queued beat at once. Each player can also choose their own speed (1× or 2×)
and a reduced-motion preference that behaves as `instant` for them alone. The
browser's reduced-motion setting turns that on by default.

### Decision 4: creatures are models chosen by the theme, sized by the rules

A creature's look comes from the theme's **model pack**, chosen in this order:
the monster's own id, then its creature type, then the character's `look`,
then the pawn. The pawn stays as the fallback, and it is what is drawn while a
model loads.

- **Format** is glTF 2.0 binary (`.glb`): meshes, a skeleton, and named clips.
  The clips a model may have: `idle`, `walk`, `run`, `fly`, `attack`, `shoot`,
  `cast`, `hit`, `dodge`, `fall`, `die`, `prone`, `stand`. A missing clip
  falls back (no `shoot`: `attack`; no `die`: `fall`; none at all: the pawn's
  moves, which are done by moving the whole model).
- **Size.** A model is scaled to the creature's size, not its own: its width
  to the footprint (about 5, 9, 15 and 19 ft across for 1, 3, 7 and 12 hexes)
  and its height to the size's height in `content/sizes.js`, whichever is
  smaller, and placed at the middle of the footprint, as pawns are now. A model
  file may state its own scale; the size wins.
- **Height.** A flier is drawn at its `z` with its shadow and a mark on the
  surface under it, as now, and a thin line down to it when it is more than
  10 ft up. On a ledge it stands on the ledge. Creatures on levels above the
  ceiling are not drawn. A creature under a floor that is drawn shows as an
  outline through it, for its owner and the DM only.
- **Picking** stays a test against simple shapes, not model triangles: a
  cylinder per creature sized to its footprint and height. It is cheap, and it
  is easier to hit with a finger. On a small screen the cylinder is never
  narrower than 44 CSS pixels.
- **Dead** creatures lie where they fell, as today.

Models are loaded when a creature of that kind first appears and kept in the
browser's cache. They are not part of the game's first download.

### Decision 5: doors, traps and spells are drawn from data the client already has

The renderer looks things up in the content pack, which the client already
has, and in the events. No new event fields are needed.

- **Doors and objects**: the object definition's `kind` and id choose an
  animation (swing, slide, throw, lift lid); unknown kinds change at once with a
  small pulse. The state names come from the definition.
- **Traps**: `triggered` names the object. A pit opens (its floor cell drops to
  black), an arrow trap fires a projectile from the nearest wall, a gas trap
  fills its area. Then the trap's attack, save and damage beats play as for a
  creature's. Unknown traps flash and float their name.
- **Spells by area shape.** The `cast` event carries the spell id and the hexes
  hit. The spell's `target.area` gives the shape and size, and the caster's
  place gives the origin.

| Shape | Drawn as |
|---|---|
| `cone` | a fan from the caster, filling out to its length |
| `line` | a beam from the caster |
| `sphere` | a burst growing from the point to its radius |
| `cylinder` | a column rising from the floor |
| `cube` | a box filling from its face |
| `emanation` | a ring spreading from the creature |
| no area | a bolt or a glow from caster to each target |

  The colour comes from the first damage type in the spell's data, through a
  theme table (fire orange, cold pale blue, and so on); healing is gold. The
  shape is drawn over the hexes in the event, so it always matches what was
  hit. Lasting zones (debt S4) are drawn later as tinted floor while the
  effect is in the state.

### Decision 6: light and memory are a shade per hex corner

The sight spec's layers 2 and 3 (task S8) are drawn like this:

- **Remembered, not in view.** Tiles the party has seen but cannot see now are
  drawn desaturated and at about 45 % brightness, with walls likewise. Players
  are not sent creatures out of sight, so none are drawn there. A **last-seen
  marker** (a faint outline of the creature's model or pawn) is kept by the
  client where a creature left view, until it comes back or the map changes.
  It is the client's own memory and is not trusted for anything.
- **Light.** Each hex is bright, dim or dark. The floor mesh carries a light
  value per hex corner, averaged from the hexes around the corner, so light
  falls off smoothly instead of in hex steps: bright 1.0, dim 0.55, dark 0.2.
  What a creature with Darkvision sees in darkness is drawn grey and
  desaturated. Tiles never lit for the party are not sent, so they are simply
  not there.
- **Light sources** (a lit brazier, a carried torch) also add a warm point
  light in the shader, the four nearest the focus at most, with a slight
  flicker. On a phone that is the first thing cut after shadows.
- The hour of the day (already drawn) multiplies all of this outdoors.
- The **DM** sees everything, with regions the players have not seen drawn
  darker as now, and a "see as the party" toggle that draws only what the
  party sees.

The renderer only shades what it was sent. It never works out sight itself to
decide what to show; that is the server's job (`view.js`).

### Decision 7: the renderer sits behind a written interface

`app.js` and `editor.js` today use fourteen members of the renderer and its
constructor. They become the interface, with additions for the timeline and
housekeeping. Any renderer is a
class with these members and nothing else is used from outside.

```js
const R = createRenderer(kind, canvas, labels, theme);   // kind: 'gl' (today's) or 'three'

// What to draw
R.setState(state, events)   // state is final; events are what led there, in order (decision 2)
R.setTheme(theme)
R.setCeiling(feet)          // floors above this height are not drawn
R.setHighlights({ move, area, targets, allies, selected, turn })   // hex keys and creature ids
R.setPace({ pace, speed, reduced })                                // decision 3

// Camera
R.focus(id, snap)  R.rotate(radians)  R.zoom(factor)
R.inset = px                // screen height covered by the UI at the bottom

// Timeline
R.busy                      // true while beats are playing
R.skip()                    // finish every queued beat now
R.onBeat = (event) => {}    // called as each event plays
R.onIdle = () => {}         // called when the queue empties
R.floater(id, text, cls)    // a floating word over a creature, now

// Input
R.onTap = ({ hex, id }) => {}       R.onHover = (hex | null) => {}
R.onPoint = (x, y) => {} | null     // the editor: taps report screen points
R.onDrag = { down, move, end, cancel } | null
R.planeHex(px, py, feet)  -> hex | null
R.screenOf(hex)           -> { x, y } | null

// Housekeeping
R.stats()   -> { frameMs, quality }
R.dispose()
```

What a renderer may read from the state, and nothing else: `map` (levels,
tiles, walls, objects, regions and their reveal, and from the sight work
`seen` and light), `entities` (id, name, pos, size, side, kind, tpl, look,
dead, hp and maxHp or `health`, the shown conditions, hidden), `encounter`
(id, arena), `clock`, `effects`, `settings.pace`. It may call pure helpers
from `./shared/` (`space.js`, `walls.js`, `hex.js`, content lookups). It
never calls `apply`, never changes the state, and never decides what a player
may know.

The timeline (decision 2) is written once, in its own module
(`packages/client/timeline.js`), and used by both renderers. It turns events
into beats with start times and lengths and tells the renderer what to change
when; the renderer only draws.

### Decision 8: move to Three.js, after the work that is ours either way

**The question.** Keep extending the hand-written WebGL renderer, or move to
Three.js. The repo's rule is no dependency without a written reason, and a
library would have to be vendored as one ES module file in the repo, since
nothing is installed from the network.

**What is the same either way.** Most of what the owner asked for is ours to
write whichever library draws it: floors from the map document, walls and
cutaways, caves, the event timeline and the pace setting, picking hexes on
several levels, light and memory shading, labels and floating text, and the
interface. Those are decisions 1 to 3, 5 to 7. They are written as plain
modules (`floors.js`, `timeline.js`) producing plain arrays and instructions,
so they serve both renderers.

**What differs** is the general 3D machinery under models: loading glTF,
skinned meshes, blending animation clips, materials and textures, real
shadows, many lights, and instancing.

| | Keep the hand-written renderer | Move to Three.js |
|---|---|---|
| Download | Nothing added. `render.js` is about 25 KB | About 600 KB minified and 145 KB gzipped for release r145 (a third-party measurement; current releases are split into two files and are probably larger: measure when vendoring), plus the glTF loader and its helpers, which are not minified upstream. Today the whole game's script is 1.43 MB and 274 KB gzipped, so roughly +50 to +70 % gzipped |
| Our own server | Unchanged | It sends files uncompressed today; gzip from Node's own `zlib` becomes necessary, which is a small server task with no dependency |
| glTF | Write a loader: the binary container, accessors, meshes, materials, skins, animation samplers (step, linear, cubic), and the many ways exporters differ. Draco and meshopt compression would not be supported. Estimate 1,200 to 1,800 lines, and a long tail of "this model looks wrong" | `GLTFLoader`, used by most of the web, maintained upstream |
| Skeletal animation | Write skinning in the shader (bone matrices in a texture, since WebGL 1 on phones has too few uniforms), an animation mixer with cross-fades | `SkinnedMesh` and `AnimationMixer`, with cross-fades and per-clip speed |
| Shadows and lighting | A shadow-map pass, a few point lights, about 300 lines, and per-device bugs | Built in, with switches per light and per object |
| Picking | Ours, and good for hexes | Ours still: the hex-column march is better than its ray caster for this; only the camera ray changes |
| Rewrite of today's 553 lines | None; it grows by 2,000 to 3,000 lines over the plan | About 30 % (the matrix kit, shader, buffer, setup and draw code, about 150 lines) replaced by Three objects. Terrain building, overlay, picking, input, camera, labels kept and moved into the shared modules |
| WebGL version | WebGL 1, every phone | Current Three.js needs WebGL 2: every current phone browser has it (iOS Safari since 15). Very old devices lose 3D |
| Change upstream | None | Three.js breaks its API often between releases. Pin one version, record it and its hash, upgrade on purpose |
| Who can work on it | Agents have done well on it so far, but GPU code has only a page smoke test (`npm run smoke`), and its bugs are the kind tests do not catch | Agents and people know Three.js widely; most problems have a known answer |
| Licence | Ours (AGPL-3.0-or-later) | MIT, compatible |

**Recommendation: move to Three.js, at the start of the model work, not
before.** The reason, for `DESIGN.md`: models and animation are a large body
of general GPU code that Three.js already has, tested by a great many users,
and which would otherwise be written and debugged here without tests; the cost
is about 150 to 250 KB more to download once, the vendoring step, and a pinned
version to keep. Everything specific to Hextable (rooms, timeline, sight,
picking) is written first, in plain modules, inside the current renderer,
where it gives visible improvement now and carries over without change. The
hand-written renderer stays the default until the Three.js one passes the
same checks on a phone and a desktop, then it is removed in one pull request;
two renderers are not kept alive side by side for long.

The case for keeping the hand-written renderer is honest too: if the owner
decides models are far off, or that pawns and simple animated shapes are
enough, then nothing in this plan before task R8 needs Three.js, and the plan
can stop there.

**Vendoring.** A person with network access downloads one pinned release (the
`build/` module files and the glTF loader with its two helpers from
`examples/jsm/`), rewrites their `from 'three'` imports to a relative path,
and commits them under `packages/client/vendor/` with a `README` that names the
version, where each file came from, and its SHA-256. The build copies them to
`dist/`. Nothing else in the repo may import them except the Three renderer.

### Where models come from

Every model in the repo must have a licence that allows redistribution in a
public AGPL-3.0-or-later project: permanently free, CC0 preferred, CC-BY
acceptable with a credit line; nothing non-commercial, share-alike or GPL, and
no Mixamo (owner's decision, 13 November 2026). Each model gets a line in
`packages/client/assets/models/LICENSES.md`. AI-generated models (Tripo) fill
the gaps the free sources leave. The
SRD rule applies to models too: no creature from outside the SRD, under any
name. These sources are **candidates to verify**, not facts; each licence is
checked on the source's own page for the exact pack before anything is
committed.

| Source | What it has | Licence it states (verify) |
|---|---|---|
| Quaternius | Low-poly animated characters and monsters | CC0 |
| KayKit (Kay Lousberg) | Adventurers, skeletons, dungeon pieces, rigged and animated | CC0 |
| Kenney | Dungeon and town kits, props, a few characters | CC0 |
| Poly Pizza | A collection from many authors | Mixed CC0 and CC-BY, per model |
| Sketchfab | A large market of models | Per model; CC-BY usable with credit, CC-BY-NC not usable |
| OpenGameArt | Community assets | Mixed; CC0 and CC-BY usable, share-alike and GPL need the owner's decision |
| Mixamo (Adobe) | Rigged characters and animation clips | Adobe's own terms; probably does not allow putting the raw files in a public repo. Treat as not usable until checked |

Size limits for models in the starter pack: at most 3,000 triangles and
300 KB per `.glb`, textures at most 512 pixels square or vertex colours only,
and the whole pack under 20 MB in the repo. Bigger packs can live outside the
repo and be loaded by a theme from a URL later.

## Phones

**Budget.** On a mid-range phone from about 2021 the game holds 30 frames a
second while a fight animates: 33 ms a frame, of which the renderer may take
16 ms of CPU and GPU together, leaving the rest to the UI and the browser.
Desktops aim for 60 (16.7 ms). Limits that keep a phone inside it:

| Thing | Phone | Desktop |
|---|---|---|
| Draw calls a frame | 150 | 600 |
| Triangles on screen | 150,000 | 1,000,000 |
| Animated (skinned) creatures at full rate | 12 | 40 |
| GPU memory for textures | 64 MB | 256 MB |
| Pixel ratio | 2 at most, as now | 2 |

Floors are one buffer per level, the grid one, walls one, so a whole map is a
handful of draw calls. Trees and repeated props are instanced.

**Measurement.** `R.stats()` reports the median frame time over the last 120
frames. A quality governor steps down when the median stays above 28 ms for 2
seconds, and back up when it stays under 14 ms for 10 seconds.

**What is cut first**, in this order:

1. Real shadows, replaced by today's blob shadows (R15 changed the order of
   this list: shadows go before the pixel ratio, since a sharp picture matters
   more on a phone than a soft shadow does).
2. The pixel ratio, from 2 to 1.5 to 1 (fill rate is usually the limit on a
   phone).
3. Point lights from light sources beyond the nearest one.
4. Particles in spell and trap effects, halved.
5. Animation of creatures off screen or far away, at a lower rate or paused.
6. Decor: tree and prop density outdoors.
7. Models, beyond the nearest twelve creatures, replaced by pawns.

Never cut: labels and health bars, highlights, the grid in a fight, the arena
edge, the light and memory shading (they are rules information), and the
beats themselves (a cut beat still takes no longer, and the state still lands).

Antialiasing is chosen when the canvas is created and cannot change later; it
is off on phones whose screens have a pixel ratio of 2 or more, where it buys
little.

## Known costs and risks

- **Fill to walls draws floor outside the hex grid.** A player sees floor in a
  sliver they cannot stand on. It is narrower than half a hex and lies against
  a wall, where nobody tries to stand; the grid overlay shows where the hexes
  are.
- **Cutaway walls depend on the camera.** A room seen from a low angle can
  show a wall cut that looks odd. The theme can turn cutaways off.
- **Waiting makes play slower.** It is the default because the owner asked
  for it, it can be skipped by a tap, and a table can choose `flow` or
  `instant`.
- **The DM's browser paces the monsters.** A DM on a slow phone slows monster
  turns for everyone, at most by the beat lengths above, since beats are timed
  in seconds.
- **Models multiply the download.** Loaded per kind of creature, cached, and
  replaced by pawns while loading.
- **Three.js is a large file we did not write**, pinned and vendored. Upgrades
  are deliberate and reviewed.
- **Two renderers for a while.** The interface keeps the period short; the
  task list ends with removing one.

## Tasks

Ordered so that the first three each give a visible improvement on their own.
"Any agent" tasks touch only the client unless the row says otherwise.

| # | Task | Who | Touches | Done when |
|---|---|---|---|---|
| R1 | Rooms, not hexes, in today's renderer: one floor per height with one edge, faint grid overlay, behind a theme flag. Prototype built (see build notes); left: turning it on | design owner decides; any agent | `themes.js` | The owner has looked at `?rooms` and the flag is on by default, or it is dropped |
| R2 | Floors module: patches, clip and fill to walls, outlines, wall posts and cutaways, as a pure module with tests; R1 drawn from it | any agent | new `client/floors.js`, its test, `render.js`, `package.json` test script | A traced diagonal wall gives a straight floor edge; a corridor between two traced walls is filled; tests pass in Node |
| R3 | Timeline and pace: beats, grouping, the shown state, skip, catch-up, `onBeat`, `onIdle`; log lines and floaters moved onto beats; the AI waits for idle; the `pace` setting | any agent; the one-line `SETTINGS` change by the design owner | new `client/timeline.js`, `render.js`, `app.js`, `engine.js` (one line) | A goblin's attack, damage and fall play in order before the player's buttons wake; a tap skips; an `instant` table plays as today |
| R4 | Beats in today's renderer: doors swing, falls, deaths and Prone, region fade-in, fade in and out, the arena rising | any agent | `render.js` | Each row of the event table that needs no model has its animation |
| R5 | (built, see build notes) The interface: `createRenderer`, only the listed members used by `app.js` and `editor.js`, `stats()`, the quality governor (pixel ratio steps) | any agent | `render.js`, `app.js`, `editor.js` | A second, empty renderer class can be selected and the UI still loads |
| R6 | Outdoors: height field, blended colours, scattered trees, boulders, banks at rules steps; behind a theme flag until the owner approves | any agent, look approved by the design owner | `floors.js`, `render.js` | The valley reads as a valley with no hex rims, and its picking is unchanged |
| R7 | Caves: rock edges with seeded noise, open floor as patches | any agent | `floors.js` | A cave painted as rock with open hexes looks like a cave |
| R8 | `level.image`: stored in the map document, linted, kept with exports; the UVTT import fills it; floors textured by it | design owner (map format), then any agent (drawing) | `map.js`, `import-uvtt.js`, assets (M9), `render.js` | An imported map shows its picture as the floor with walls on its painted walls |
| R9 | Spell shapes and trap effects from data | any agent | `render.js` or the Three renderer | Each of the six shapes and the three generic traps play; unknown ones flash |
| R10 | Vendor Three.js: pinned release, imports rewritten, hashes, `vendor/README`, build copies it; gzip in the server; the reason added to `DESIGN.md` | design owner (needs network) | `packages/client/vendor/`, `scripts/build.mjs`, `packages/server`, `docs/DESIGN.md` | The built game loads the module; sizes are recorded in the README |
| R11 | The Three.js renderer at parity, behind the interface, selectable as a preference | any agent | new `client/render-three.js` | Every check of R1 to R9 passes on a phone and a desktop within the frame budget |
| R12 | Models: theme model packs, glTF loading, size scaling, clips mapped to beats, fallbacks; a starter pack after the owner verifies licences | any agent; licences by the design owner | `render-three.js`, `themes.js`, `assets/models/` | A goblin, a skeleton and the four heroes walk, strike and fall; a Large ogre fills three hexes |
| R13 | Sight S8: remembered tiles shaded, light per corner, light sources, last-seen markers, "see as the party" | any agent, after sight S7 | the renderer in use | A player can tell what is in view from what is remembered, and a torch lights a cave |
| R14 | Remove the hand-written renderer | any agent | `render.js`, `app.js` | One renderer remains; every check still passes |
| R15 | Real shadows on the Three.js renderer: a sun's depth pass, floors that read it, soft edges, off by default on a phone, the governor drops them before the pixel ratio | any agent (renderer) | `render-three.js`, `governor.js`, `settings.js` | A pawn and a wall throw a shadow on the floor on hexes and on squares; a phone starts without them |

R1 to R5 need no library and no engine change beyond one setting. R6 to R9
can run in parallel after R2. R10 decides the rest.

## Build notes

- **R1 prototype** (landed with this spec). The theme flag `floors` is `'hex'`
  in every theme unless the page address has `?rooms`, so nobody's game
  changes until the owner turns it on. With it, a level that has walls or
  regions draws every tile at one height as one floor: even colour (no
  per-hex shading), a grid line about a tenth as wide as today's rim and only
  slightly darker than the floor (`grid` in the theme), and side faces and a
  low kerb only where the floor ends or changes height. Rooms at the same
  height with no wall between run on into each other, which is what an
  archway looks like; this is simpler than the patches of decision 1, which
  also split by region and terrain. Inside a fight's arena the grid is drawn
  wider in the arena colour. Levels without walls or regions, such as the
  valley, are drawn by the old code and are pixel for pixel the same.
  Picking, highlights, levels above, objects, sizes and the DM's dimming are
  untouched. Not done: clipping and filling to walls, so a room's outline still
  follows hex edges (R2).
- **R10 vendoring** (`vendor-three`). Three.js **r187** (tag `r187`, commit `7e89746a687bb88271253698fa108b1dd59825d0`) is in
  `packages/client/vendor/three/`, with upstream's LICENSE and `packages/client/vendor/README.md` (the version, the upstream
  path, size and SHA-256 of every file, the five rewritten import lines, the upgrade steps). Files: `three.module.js` and
  `three.core.js` (r187 splits the build in two; the first imports the second), `GLTFLoader.js`, and its two helpers
  `BufferGeometryUtils.js` and `SkeletonUtils.js`, all flat in one folder. Upstream ships **no minified file** in `build/`, so
  the readable build is what is vendored; nothing here can minify it (no npm), and that is left, see below.
  **Measured sizes replace the spec's estimate** (600 KB and 145 KB gzipped for r145, "roughly +50 to +70 %"): the Three.js
  scripts are 2,304,270 bytes raw and **457,683 gzipped** (`gzip -9`, file by file; three.core.js alone is 1,474,799 and
  289,875). The game's own scripts today (every `.js` in `dist/`, 95 files) are 2,620,347 raw and 605,873 gzipped, so Three.js adds
  **+88 % raw and +75.5 % gzipped**: about three times the spec's 150 to 250 KB. The cause is that r145 was one minified file of
  600 KB and r187 is two unminified ones; a minified r187 would likely be about a third of the raw size, and the gzipped size
  perhaps 120 to 200 KB (an estimate, not measured). It is paid once, only by a client that loads the Three renderer, and then comes from
  the browser's cache; the default renderer and the page load fetch nothing from `vendor/` (checked in the smoke pass).
  **Server.** `packages/server/src/index.js` sends html, js, css, json and svg files of the built game gzipped when the request's
  `Accept-Encoding` allows it (`q=0` and `*` are read), with `Vary: Accept-Encoding` and the right `Content-Length`; each file is
  compressed once, with Node's `zlib`, and kept until its modification time or size changes. Files under 1 KB, other types, and
  requests with a `Range` header go as they were; uploads and table files (`assets-http.js`) are untouched. Before this the
  server sent everything raw. `.json` and `.svg` now have their proper content types (they were `application/octet-stream`).
  **What R11 imports.** Nothing imports the vendored files yet except `packages/client/three-check.js`, which only the smoke pass
  uses. `render-three.js` imports from `./vendor/three/three.module.js` (`import * as THREE` or named imports), the glTF loader
  from `./vendor/three/GLTFLoader.js` (`GLTFLoader`) and `clone` from `./vendor/three/SkeletonUtils.js`, and loads them with a
  dynamic `import()` when the `'three'` kind is chosen, so that `renderer.js` does not pull 458 KB into every page (a static import in
  `renderer.js` would). Do not import the files by any other path and do not edit them. Needs WebGL 2. The addons are not
  reachable as `three/addons/...`; there is no import map. Check: `SMOKE_ONLY=three npm run smoke` (the page loads without
  fetching `vendor/`, then the module is imported, a cube is drawn on an `OffscreenCanvas`, the loaders import, and the files
  arrive gzipped).
  Not done: a minified build (needs a person with npm and a named tool, see `vendor/README.md`); tree shaking (a browser gets
  the whole library); the CSP is unchanged (`script-src 'self'` already allows the files).
- **R1 turned on** (13 November, owner's decision). `floors` is `'rooms'` unless the page address has `?hex`.
  Decision 8 (Three.js) is accepted by the owner on the same day.
- **R2 floors module** (built). `packages/client/floors.js` is pure (no WebGL, no DOM) and imports only from
  `./shared/`. `buildFloors(map, { levels })` returns, per level, patches (same level, region, terrain and drawn
  height, touching, with no wall between), each with convex cells in map feet, an outline of edges
  (`open`, `drop`, `rise`, `wall`, `seam`) with a mitred inset line for the kerb, plus wall faces and posts as plain
  data. `cutaway(faces, toCam)` says which walls stand between the camera and a room. `render.js` draws the rooms
  look from it; `?hex` and levels without walls or regions are drawn by the old code, unchanged.
  Settled:
  - A wall cuts a hex only if it crosses it from side to side. Collinear segments that meet end to end (a wall
    traced in pieces, a door's frame line) are joined first. A door's line cuts whether it is shut or open.
  - A piece with no tile of its own (the far side of a cut hex, or a hex with no tile) takes the floor it
    reaches across a shared border without crossing a wall, the longest border first, and is dropped if there is
    none. So the picture can be cut off by a wall and filled up to it, and the rules never see it: a fill cell
    names the tile it borrows (`hex`) and is marked `fill`.
  - Colour is chosen per cell from the tile named in `hex` (so the arena lock, the DM's dimming and the sight
    shades work as before); the grid is the border strips of the hex, cut to the cell, not drawn on fill pieces
    or along a wall. A step down gets a skirt to the lower floor.
  - The renderer draws posts at wall joins in rooms mode at today's low wall height.
  - Tests: `packages/client/test/floors.test.js` (picked up by the existing `npm test` glob). It copies the rules
    next to `floors.js` as `./shared` in a temporary folder, as the build does.
  Not done: a wall that ends or bends inside a hex does not cut it, so a room whose walls turn inside a hex still
  follows hex edges there; the end of a corridor follows its tiles (fill only runs from a neighbouring piece);
  cut-away is data and a tested function but is not drawn (walls are still low, full height with cut-away is the
  follow-up); colour is even per cell, not smooth across a floor; no rim shading between patches; Decision 1's
  outdoors, caves and picture floors are untouched.
- **R3 timeline and pace** (built). `packages/client/timeline.js` is pure (no DOM, no WebGL, no imports; the clock is
  passed in) with tests in `packages/client/test/timeline.test.js`. `planBeats(events, state)` gives each event a start
  time in seconds from the table in decision 2; `createTimeline` plays the updates it is given one after another
  (`push`, `tick`, `skip`, `busy`, `whenIdle`, `shown`) and calls `onBeat(ev)`, `onShow(shownState, events)`, `onDone`
  and `onIdle`. Settled:
  - Grouping: after an `attack`, the `damage`, `down`, `died`, `cond`, `condEnd`, `tempHp`, `concentration` and `save`
    that follow it start together as the strike ends (0.6 s melee, 0.8 s when the target is more than a hex away,
    judged from the positions in the state). After a `cast`, every `save`, `damage`, `heal`, `down`, `died`, `cond`,
    `condEnd`, `tempHp`, `concentration`, `effectStart`, `effectEnd`, `size` and `speed` that follows starts together. A
    `moved` is its own beat and keeps its own length when the rest of the update is scaled to 3 s. A failed `save` shows
    nothing of its own and takes no time. `act` is not a leader: a monster's Multiattack is plain attack beats.
  - The shown state. The transport changes one state object in place, so the timeline copies hit points, temporary
    hit points, `dead`, place and conditions of every creature when an update arrives, and shows those copies. A
    creature's hit points change when its `damage`, `heal` or `deathSave` beat plays (to the `hp` the event carries),
    `dead` when `died` plays, place when `moved` or `placed` plays, conditions when `cond`, `condEnd` or `stood` plays.
    Everything else in the state (map, regions, objects, effects) is shown when the update's first beat starts; doors,
    regions and the arena get their own timing with R4. At rest the shown state is the state itself.
  - Catch-up: more than 3 s behind plays at double speed; more than 8 s, only the newest update plays and the others are
    shown at once (their log lines are kept). A hidden tab skips on its return. A fresh state (joining, a reset), an
    undo or redo, and any update that carries a question for a player (`state.prompt` or `state.pending`) are shown
    at once and finish what was queued first, so the reaction prompt never sits behind beats (the strike that led to the
    question is not animated).
  - In `app.js` the log line, the floating text and the camera move to the beat of their event; the roll of dice is
    still thrown before the update's beats start (it waits for the queue to be still), which keeps the order dice,
    then picture. The character card, tracker, sheet and action bar are redrawn when the picture is still, not per
    beat. In `wait` the dock shows a quiet "…" (a tap on it, on the map or on a control, or Escape, skips and does
    not act), and the monster AI starts its next step 350 ms after the picture is still; in `flow` and `instant` it
    keeps its 800 ms. The server never waits.
  - `pace` is read in one place, `pace()` in `app.js`, from `paceFor({ table, mine, reduced })`: the table's setting
    (`state.settings.pace`, `wait` if absent), which a player may only make quicker through their own preference
    `hextable.pace` (the "Animation on this device" choice in the log panel); with no preference, the browser's
    reduced-motion setting means `instant`. Pace `instant` runs every beat inside `push`, with the floaters staggered by
    0.28 s as before, which is today's behaviour.
  - The table setting `pace` (`wait`, `flow`, `instant`; default `wait`) is in `SETTINGS` (PR #157), and `app.js` reads it
    from `state.settings.pace`; a DM control that sends `{ type: 'setting', key: 'pace', value }` is not built yet.
  - `npm run smoke` runs every page at pace `instant`; `SMOKE_ONLY=timeline` runs the pacing pass at `wait` (a goblin's
    hit in order with the "…" until the fall is done; a tap, Escape and a button skip without acting; a DM's monsters
    act only when the picture is still while a phone follows).
  Not done: a speed of 1x or 2x chosen by the player (the timeline has `setSpeed`), animations for doors, falls and
  deaths (R4), and the camera gliding on a `turn` is still `R.focus` as before.
  Not done at that point (finished in the next two notes): a wall that ends or bends inside a hex; the end of a corridor;
  the cut-away. Still not done: colour is even per cell, not smooth across a floor; no rim shading between patches;
  Decision 1's outdoors and picture floors are untouched.
- **R2 finished** (`floors-r2b`). *Cuts.* A hex is cut by every wall that crosses a piece of it from side to side, where
  a piece is what the cuts so far left (so a wall across a corridor, ending on the two side walls, cuts the strip the side
  walls leave of each hex, and the corridor ends at that wall, not at its last tile). A wall may stop 0.25 ft short of
  the one it meets (`JOIN`) and still cut. Where two or more walls end at one point inside a hex (a bend, a corner), the
  line of each arm is carried on through the hex too, so the hex falls apart into convex wedges; the wedges the wall does
  not separate are joined again into one patch, because no wall is on the edge between them (the carried-on points are
  put into the wedges' edges, so a cut line that is wall for half its length is split where the wall stops). A wall
  that ends in the open inside a hex (a dead end) still does not cut. A piece is picture-only (`fill`) only if it lies in
  another hex than the tile it is drawn as, so the wedges of one hex keep their grid lines. *Cut-away drawn.*
  `render.js` keeps walls, doors and the things standing in hexes in their own mesh (`wallMesh`), built again when the set
  of cut faces changes (the camera has turned about a degree, not every frame; the set is a few hundred keys at most).
  `cutaway()` now also lowers a wall seen nearly edge on if there is floor beside it, because a wall traced along hex edges
  shows a facet edge on every other step and the tall ones stood up in a low run; a wall with no floor beside it stands.
  Faces now include doors (`o:<id>`, `object: true`), and posts name the faces that meet at them (`keys`). Cut walls
  are 3 ft (the old look: 1.15 drawing units) with a dark cap; the rest are 10 ft, windows a 3 ft sill with glass up to
  7 ft, rails stay low, a shut door's leaf is 7 ft with wall over it, a post is as tall as the tallest wall that stands
  at it. Theme flag `cutaway` (`?nocut` in the address turns it off): without it every wall is low, as before. `?hex` and
  levels the rooms look does not draw are as before. Walls are not in the pick, so picking is unchanged.
  Not done: walls snap between low and tall when the camera turns, they do not fade; floors above are not cut; a
  door's swing is not animated (R4).
- **R7 caves** (`floors-r2b`). `isCave(map, level)`: 30% rock or more, some open tiles, no walls (a level with walls is
  drawn as rooms: the walls are then the walls). Theme flag `caves` (`?nocave` turns it off). **On by default**: at 1280x800
  and 390x844 on the stock cave the open floor reads as a pale patch with a ragged edge cut into a dark mass with a
  craggy face of rock standing up from it, which the flat hex grid (rock and floor in two near greys) did not. Built in
  `floors.js`: `buildFloors(map, { caves })` drops rock tiles, so open floor is patches as for any room; `caveOf(map, fl)`
  chains the open edges against rock or nothing, cuts each hex side in 3, and pushes every point out into the rock along
  its mitred normal by `cavePush` (at most 1.6 ft, 1.35 times that at a corner), from value noise of the point's position
  seeded by `caveSeed(map.id, level.id)`: two hexes that share a point agree, every client draws the same cave, and no
  `Math.random` is used. It never pushes into an open hex (tested), so no rock is drawn where a creature may stand and the
  hex grid, picking and the rules are untouched. Rock is drawn as a mass at `CAVE_WALL` (4 ft) above the nearest open
  floor (so rock over the ledge is higher, with a step face between rock tiles of different height), flat in one colour,
  with a two-band face down to the floor and a face down to the ground where rock meets no tile. Colours follow the same
  rules as rooms (the DM's dimming of unseen regions, sight, the arena's locked hexes). Not done: rock is a flat top with
  no cracks or boulders; the face is not lowered when it stands between the camera and the floor (the cut-away's idea; 4 ft
  was low enough on the stock cave); rock with an open hex's `forest` or water beside it is simply rock; a cave level
  with a picture is drawn by its picture; trees on forest tiles in a cave are not drawn.
- **R4 beats in today's renderer** (`beats-r4`). `render.js` plays the rows of decision 2 that need no model; `app.js` hands
  it three things (`onShow` passes `{ instant }`, `onIdle` calls `R.settle()`, a `snapping` flag marks a fresh, undone or
  question-carrying update). Tweens run on the wall clock for the table's nominal time. Settled:
  - Two kinds. What the timeline already holds back (hit points, death, place, conditions) is eased as soon as it changes:
    lying down (Prone) 0.3 s, a fall to 0 hit points 0.6 s, getting up 0.4 s, and a death falls and the living pawn fades
    into the grey fallen one (a crossfade drawn over the corpse, so the pawn is never see-through). What arrives with the
    update (doors, regions, the arena, a creature that was not there) is held as it looked until its event is given to
    `setState` (`object`, `region`, `encounterStart`/`encounterEnd`, `spawned`/`revealed`/`placed`/`removed`/`fell`), then
    eased; `settle()` (every idle, so also a skip) ends all of it at once, and a hold with no event ends by itself after 4 s.
  - Done: doors swing (0.5 s) about the first end of their line, shut line to the open one; a region just revealed is
    covered dark over its floor and the dark fades (0.6 s); a creature appearing (`spawned`, `revealed`) fades in (0.4 s),
    one `removed` fades out (0.3 s), `placed` fades out where it stood and in where it is (0.3 s); the arena curtain rises
    out of the ground with the flash (1.2 s) and sinks (0.6 s); `fell` drops under gravity (0.6 s).
  - Nothing is half played: `instant` pace, a state that is not a continuation (first, fresh, undo, redo, a prompt), a new
    map id, `map`, `mapEdit`, `undone` and `redone` set everything at once, and finish what ran.
  - Hidden: a creature the view marks `hidden` is never animated, and an event about one is not sent by the view. A
    creature leaving the view fades out only if the `removed` event comes in the same update, otherwise it goes at once.
  - Not done, and why: the portcullis slides (0.8 s) is drawn as a swing (same as its still picture); `fell` plays only when
    its event comes with the state change (the timeline shows a creature's height with the update's first beat), and has no dust;
    `size`, `effectStart`/`effectEnd`, `joined`, `noticed`, `triggered`, the `turn` ring and the `map` fade are not animated;
    the walls of a room that has just been revealed show at once (only its floor fades). Attack, damage and move clips need a
    model (R5). Animations keep the table's nominal times: a beat the timeline scaled down or ran at 2x is not matched, as
    `onBeat` hands over no length (a timeline change). Checked at 1280x800 and 390x844 with touch on the valley (fight rise and
    sink, a goblin killed) and the stock dungeon (a door, a region); `SMOKE_ONLY=beats`.
- **R5 the interface** (`interface-r5`). `packages/client/renderer.js` is the one way the app gets a renderer:
  `createRenderer(kind, canvas, labels, theme)` with kind `'gl'` (render.js, the default) or `'none'` (`EmptyRenderer`: draws
  nothing, implements everything, never throws), and `rendererKind(search, pref)`, which reads `?renderer=none` in the address,
  then the device preference `hextable.renderer`, else `'gl'`. `packages/client/governor.js` is the quality governor, pure.
  `test/renderer.test.js` reads `app.js` and `editor.js` and fails on any `R.x` / `this.R.x` that is not in `MEMBERS`, on any
  other way the renderer object is passed around, checks that the empty renderer and the GL renderer have every method, and
  tests the governor. **The final interface** (what `app.js` and `editor.js` may use, and nothing else):
  - What to draw: `setState(state, events, { instant })`, `settle()`, `setTheme(theme)`, `setCeiling(feet)`,
    `setHighlights({ move, area, targets, allies, selected, turn })`, `setPins(points, levelZ)`, `setBars(bars, levelZ)`.
  - Camera: `focus(id, snap)`, `rotate(radians)`, `zoom(factor)`, `inset` (px of screen covered by the UI at the bottom).
  - Floating words: `floater(id, text, cls, delay)`.
  - Input: callbacks `onTap({ hex, id })`, `onHover(hex | null)`, `onPoint(x, y) | null`, `onDrag { down, move, end, cancel } | null`;
    questions `planeHex(px, py, feet)`, `planePoint(px, py, feet)` (a point in map feet), `screenOf(hex)`,
    `screenPoint(x, y, feet)`, `screenAxes()`, `zonesAt(hex)`.
  - Pictures: `hasPicture(levelId)`, `onPicture` (called when a level's picture has arrived), `assetUrl(id)` (set by the app).
  - Housekeeping: `stats()` -> `{ frameMs, quality, pixelRatio, drawCalls }`, `dispose()`.
  **Changes to Decision 7's list, and why.** Added, because the code already used them and each is real: `settle()` (R4: the
  timeline's `onIdle` ends whatever the renderer is still easing); `planePoint`, `screenPoint`, `screenAxes`, `setPins`, `setBars`,
  `hasPicture`, `onPicture`, `assetUrl` (the editor's picture, scale and trace tools, and the picture floors of M9);
  `zonesAt` (hover and tap name the zones over a hex); the `delay` of `floater` and the `{ instant }` option of `setState` (the
  pace). Not members, though the spec listed them: `busy`, `skip`, `onBeat`, `onIdle` and `setPace`. The timeline is
  written once and lives in `app.js` (`TL`), which calls `setState` and `settle` when its beats say so; a renderer is told what
  the state is now and animates the change, it does not run a queue of its own, so there is nothing for `busy` or `skip`
  to report on the renderer. Pace reaches it as `{ instant }`. If a renderer ever needs the beats themselves, they come as
  `events`, as now. `labels` is not a member: the editor puts its hex numbers into the page's `#labels` element itself. `stats()` also
  reports `pixelRatio` and `drawCalls`.
  **The governor** (`governor.js`; the renderer feeds it every frame's time and applies the pixel ratio it names). The steps are
  2, 1.5, 1, each at most the screen's own ratio (a screen of ratio 1 has one step and the governor does nothing).
  The spec's numbers are used as written: down one step when the median of the last 120 frames stays above 28 ms for
  2 s, up one when it stays under 14 ms for 10 s. Added, to keep it from bouncing: the window is emptied after a step and 30 new
  frames come before anything is judged; the level just left is not tried again for 2 minutes; a step up that is followed by a
  step down inside a minute bans that level until the canvas changes size (a model of a device that cannot hold 1.5 steps down,
  up once, down, and then stays, all in the first few minutes); frames over 1 s (a hidden tab) are not counted. One more change to
  the spec's thresholds: a display locked to 60 Hz can never show a median under 14 ms, so the governor would never step up
  there; once it has seen a full window with a median between 14 and 18 ms, it counts a median 12 % over that as recovered
  (18.7 ms on a 60 Hz screen). `frameMs` is the time between frames, as the player sees it, not the renderer's own work. Only the
  pixel ratio is governed; the rest of the cut list (shadows, lights, particles, decor) has nothing to cut yet. (R15: the Three.js renderer's governor also steps its shadows, first.)
  Checked at 1280x800 and 390x844 with touch, solo, on the valley and the stock dungeon: screenshots before and after are
  identical to the pixel (with `Math.random` fixed, since the valley's trees are drawn from a random seed per game).
  `SMOKE_ONLY=interface`: the page loads with the empty renderer (address flag on a desktop, preference on a phone), a table is
  hosted, a character moves by action, the tracker, sheet, undo, a fight and a map change work, no page or console errors; and
  the default renderer reports `stats()`. The smoke script still reads the default renderer's insides through
  `window.hextable.R` (`cam`, `floorData`, `actors`, `doors`...): that is its documented test surface and the app does not use it.
- **R11 the Three.js renderer** (`three-r11`). `?renderer=three` (or the preference `hextable.renderer`) selects kind `'three'`; the default
  stays `'gl'`. Files: `render-three.js` (the class, about 600 lines), `three-build.js` (pure: Builder, terrain, walls, cave, arena edge,
  overlay, pawns, from floors.js and the rules; tested in Node, `test/render-three.test.js`), and in `renderer.js` a stand-in, `LazyThree`,
  because `createRenderer` answers at once and the library does not: it keeps the latest of each setter and the camera moves, loads
  `render-three.js` with a dynamic `import()` (so `vendor/` is fetched only then), replays them with the last state shown at once, and falls
  back to the default renderer if WebGL 2 or the import is missing. Settled:
  - *Same pictures.* One ShaderMaterial does render.js's shader (vertex colour with alpha, one directional light, fog, the hour's grade, a tint
    per draw) with Three's matrices; output colour space is linear so nothing is converted. One BufferGeometry (interleaved) per kind:
    terrain, walls, doors, grid, shadows, overlay, arena edge, and one mesh per pawn and veil. Draw order is the default renderer's.
  - *Same camera and picking.* A PerspectiveCamera with 0.75 rad, near 0.3, far 200, the inset as the projection's y offset. `screenOf`,
    `screenPoint`, `screenAxes` read Three's matrices; the ray for `planeHex`, `planePoint` and the tap is Three's unproject, and the
    hex-column march is render.js's, unchanged (Decision 8).
  - *Beats* are render.js's tweens on the same names (`doors`, `actors`, `tiltTw`, `dying`), so the beats smoke pass runs on both
    through `R.inner ?? R`.
  - At parity: everything in the interface; floors, rooms, cut-away, caves, outdoors, levels above the ceiling, the DM's dimming, sight
    shades, arena, pawns by size, fliers and their mark, blob shadows, labels, bars, floaters, pins, bars across steps, lasting zones, doors,
    falls and Prone, death fade, region fade, spawn, removal and placing fades, the arena rising and sinking, pictures (code only).
  - Not at parity or not done: no real shadows (done in R15, below); no glTF (R12); nothing is drawn until the library has loaded
    (a blank canvas for the first second or two, the first time); a picture floor was written but not exercised by a smoke pass.
  - *Checked* by `SMOKE_ONLY=three-parity` at 1280x800 and 390x844 with touch on the valley (the same map loaded in both pages), the stock
    dungeon and the cave: `screenOf` for 81 hexes, `screenPoint`, `planePoint`, `screenAxes` and the hex picked by a tap at 23 to 26 points
    agree to under 0.01 px with the default renderer, and screenshots differ in under 0.1 % of pixels by more than 40/255. The game plays on
    it (a tap moves a character, a fight starts and the curtain is drawn, a goblin falls, doors swing and close). Frame times (software GL,
    so only comparable): the medians are the same in both, set by the display tick under software GL (desktop dungeon 266.7 ms both, phone dungeon 116.7 ms both), and draw calls are
    equal (11 on the dungeon): the two renderers cost the same here, and neither number says anything about a device.
- **R15 real shadows** (`three-shadows`, Three.js renderer only; the default renderer is untouched). *How.* Each frame the renderer draws what casts
  (the walls, the doors, every pawn, a dying creature and a fading ghost: meshes on layer 1) into a depth map seen from the sun, with one override
  material that writes nothing but depth; the floors (the terrain mesh and a level's picture) read that map in their own shader, under a
  `SHADOWS` define that exists only while shadows are drawn, so a table without them runs the shader it ran before. The sun is the renderer's one
  directional light (the same vector the shader lights with). A shadow darkens and cools the floor (`x 0.5, 0.55, 0.72` at full, 85 % strength) and
  is thrown only onto surfaces that face the sun. *The box.* An orthographic box along the sun. A board that fits in a box of 14 units or more
  across (or `1.15 x` the camera's distance) is covered whole from its middle; a larger one gets the stretch round the camera's focus, moved in
  whole texels so shadows do not crawl as the camera pans (`shadowBox`, pure, tested). Map 2048 square, 1024 on a phone. *Edges.* Nine taps, a
  Poisson disc turned a different way at every pixel (a fine grain instead of banding), about 0.1 unit wide whatever the map's size; the point
  is moved a texel and a half along the normal and a depth bias of two texels (at least 0.03 unit) keeps a floor from shadowing itself. The
  floors do not cast, so there is no self-shadowing to tune out. *Cost.* The pass is redrawn only when something that casts has moved, changed
  its geometry, or the box has moved (a hash of the casters' matrices); a table at rest costs nothing but the floors' extra taps. `stats()` has
  `shadows`, `shadowMode`, `shadowSize`, `shadowPasses` and `shadowCalls`; `drawCalls` is still the picture's own. *Blobs.* With shadows on, the
  pawns' blob shadows are not drawn (the real ones replace them); the terrain's own blobs (trees) stay, since trees do not cast. *Setting.*
  `?shadows=on|off|auto` in the address, then the device preference `hextable.shadows` (`"auto"`, `"on"`, `"off"`), else `auto`. `auto` is on for
  a computer or a tablet, and off for a phone (a touch screen whose shorter side is under 600 CSS pixels) until the governor sees headroom.
  `on` is never given up; `off` is never drawn. The Settings tab has a Shadows control (made by `settings.js`, since `index.html` was not in the
  task); it stores the preference and tells the live renderer with the page event `hextable-shadows`. *The governor* (`governor.js`,
  `shadowLevels`): the ladder under `auto` is shadows at the best pixel ratio, then no shadows at that ratio, then each lower ratio, so shadows
  are given up before any pixel ratio, and a screen of ratio 1 (one pixel ratio) still has a step to give. A phone starts one step down and
  climbs to its shadows under the governor's own rule (the median under 14 ms, or the display's own rate, for 10 s). The default renderer's
  governor is a list of numbers as before (`ratio` still answers the number).
  *Checked* with `SMOKE_ONLY=three` (the two new scenarios, at 1280x800 and 390x844 with touch): the default is on for a computer and off for a
  phone, the Settings control switches it and is stored, the address wins and turns the control off, on the stock dungeon (hexes) and the engine's
  square room (squares) the picture with shadows differs from the picture without them in 3 to 6 % of the pixels of the map area (a patch of floor,
  not the screen), and the sun's pass is not redrawn in 1.5 s with nothing moving. Looked at by eye in screenshots on the valley, dungeon and square
  room, desktop and phone, and on a level with a picture. Frame times (software GL, so only comparable, and the other browser job shares the
  two cores): shadows on against off, medians over the last 120 frames, desktop valley 433 against 117 ms, dungeon 400 against 100 ms, square room
  about 50 against 50; phone valley 450 against 117, dungeon 417 against 67 ms, square 17 against 17. A software rasteriser pays for every tap of every
  pixel, which a GPU does not: nothing here says what a device would do, and none was tried.
  *Left out.* The floors do not cast (a bridge or a balcony does not shade the level under it); a cut-away wall casts no shadow (it is not drawn);
  creatures and walls do not receive shadows (a pawn does not shade another pawn's body, a wall's face is lit by its own normal only); light
  sources (the spec's point lights) cast none; the hour of the day does not move the sun; no cascades (a large board's shadows have the map's
  resolution round the focus and none beyond the box, fading over the last 7 % of its edge); the renderer has no settings control (only the
  shadows one).

### Arena edge (#305, render agent)

*Decision (owner and lead, 14 Nov).* A fight is still one accelerated state for everyone, but the owner liked "here is the battle area" because in
a living world something goes on outside it (see `travel.md`, the concurrent places). So the **lighting change stays** (everything outside the
arena is dimmed and desaturated: `tintOf` and the `locked` colours in `render.js`, the same in `three-build.js`) and the **glowing edge goes by
default**: the tall light wall, the bright rim on the arena's cells, the brighter grid inside them and the pictured level's lit outline.

*The preference.* `hextable.arenaEdge` is `"dim"` (default: lighting only, plus the flash below) or `"edge"` (the old look: dim plus the glowing
edge). It is a look like `floors` and `caves`: `LOOK.arenaEdge` in `themes.js`, copied onto every theme as `theme.arenaEdge` by `setLook`, so both
renderers read it from the theme they were given (`edgeLook(theme)`, exported by `render.js`). A change in Settings (the "Edge of a fight" control,
made by `settings.js`, as the Shadows one is) goes through `setLook` and `R.setTheme`, which rebuilds the terrain and the edge. The address does not
lock it. The `edge` code path is unchanged and is tested (`render-three.test.js`, and the smoke steps below); when the travel spec's concurrent
places arrive it should become the default again: change the fallback in `themes.js` (`'dim'`) and nothing else.

*What is drawn.* In `dim`, `#buildEdge` (`render.js`) and `buildEdge` (`three-build.js`) still run, because they also find `edgeBase` (the height the
edge rises from), but the mesh handed to the GPU is empty; the arena's cells take the same rim and grid as any other floor. The turn ring under
whoever acts keeps `arenaRim`.

*The flash.* A move the arena refuses (the engine's `The arena is locked until the fight ends.`) lights the border cells nearest the hex that was
aimed at: `arenaFlashCells(map, enc, hex, ceiling)` in `render.js` (pure: border cells are those with a side facing outside, the nearest ring and the
one after it, at most eight) and the same curtain code as the edge, limited to those cells (`only`), 1.1 units tall, with a wider band on the floor,
drawn for 1.1 s with two pulses, in either look and either renderer. `app.js` sends it as the page event `hextable-arena-flash` (detail: the hex),
as Shadows does with `hextable-shadows`, so `renderer.js` and its interface list are untouched (a renderer that draws nothing ignores the event). The
toast keeps the engine's sentence and adds "Nobody leaves the lit area of the fight before then." Only a move the player has just tapped flashes
(not one the monster AI tried), and only within four seconds of the tap.

*Checked.* `npm test` client tests (new: default has no curtain, edge look has it, flash cells are the nearest border cells, the preference rides on every theme).
Smoke, one pass at a time: `SMOKE_ONLY=square` (default renderer, squares and hexes, 1280x800 and 390x844 with touch) and `SMOKE_ONLY=three`
(Three.js, hexes and squares, both sizes) each run the steps "the Settings control reads dim; a fight starts and no edge is drawn; a tapped move out
is refused with the rule in words and the flash is made and goes out by itself; the control, stored, brings the edge back and takes it away; the
fight ends and no edge is left". Looked at by eye in screenshots (`/tmp/arena-edge/`) before, during and after a fight, both looks, both renderers,
both grids, both sizes, and the fight in the three themes: the dim outside reads in Classic, Sunlit and Pocket. The flash lasts 1.1 s, which a
software-GL screenshot is slower than, so the shots hold it at its brightest by setting `flashAt` from the page; real timing was not seen on a device.

*Left out.* The lighting is the existing one (not made stronger or given its own preference). The dim does not reach walls, doors, pawns or the
sky, only floors, trees and rock.
