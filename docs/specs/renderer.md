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
| Licence | Ours (MIT) | MIT, compatible |

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

Every model in the repo must have a licence that allows redistribution in an
MIT project, and a line in `packages/client/assets/models/LICENSES.md`. The
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

1. The pixel ratio, from 2 to 1.5 to 1 (fill rate is usually the limit on a
   phone).
2. Real shadows, replaced by today's blob shadows.
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
| R5 | The interface: `createRenderer`, only the listed members used by `app.js` and `editor.js`, `stats()`, the quality governor (pixel ratio steps) | any agent | `render.js`, `app.js`, `editor.js` | A second, empty renderer class can be selected and the UI still loads |
| R6 | Outdoors: height field, blended colours, scattered trees, boulders, banks at rules steps; behind a theme flag until the owner approves | any agent, look approved by the design owner | `floors.js`, `render.js` | The valley reads as a valley with no hex rims, and its picking is unchanged |
| R7 | Caves: rock edges with seeded noise, open floor as patches | any agent | `floors.js` | A cave painted as rock with open hexes looks like a cave |
| R8 | `level.image`: stored in the map document, linted, kept with exports; the UVTT import fills it; floors textured by it | design owner (map format), then any agent (drawing) | `map.js`, `import-uvtt.js`, assets (M9), `render.js` | An imported map shows its picture as the floor with walls on its painted walls |
| R9 | Spell shapes and trap effects from data | any agent | `render.js` or the Three renderer | Each of the six shapes and the three generic traps play; unknown ones flash |
| R10 | Vendor Three.js: pinned release, imports rewritten, hashes, `vendor/README`, build copies it; gzip in the server; the reason added to `DESIGN.md` | design owner (needs network) | `packages/client/vendor/`, `scripts/build.mjs`, `packages/server`, `docs/DESIGN.md` | The built game loads the module; sizes are recorded in the README |
| R11 | The Three.js renderer at parity, behind the interface, selectable as a preference | any agent | new `client/render-three.js` | Every check of R1 to R9 passes on a phone and a desktop within the frame budget |
| R12 | Models: theme model packs, glTF loading, size scaling, clips mapped to beats, fallbacks; a starter pack after the owner verifies licences | any agent; licences by the design owner | `render-three.js`, `themes.js`, `assets/models/` | A goblin, a skeleton and the four heroes walk, strike and fall; a Large ogre fills three hexes |
| R13 | Sight S8: remembered tiles shaded, light per corner, light sources, last-seen markers, "see as the party" | any agent, after sight S7 | the renderer in use | A player can tell what is in view from what is remembered, and a torch lights a cave |
| R14 | Remove the hand-written renderer | any agent | `render.js`, `app.js` | One renderer remains; every check still passes |

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
- **R1 turned on** (13 November, owner's decision). `floors` is `'rooms'` unless the page address has `?hex`.
  Decision 8 (Three.js) is accepted by the owner on the same day.
