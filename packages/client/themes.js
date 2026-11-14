// Skins. A theme restyles everything the player sees (terrain, pawns, UI colors, type)
// and touches no rules. Add a theme by adding an entry; later a theme can also point at
// model packs and animation sets for its presenters.
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
// The look of floors and walls. Three client preferences (hextable.floors, hextable.cutaway, hextable.caves, kept by Settings), and
// an address parameter still wins for one visit, so a test or a bug report can force a look:
//   floors:  'rooms' (the default: one floor per room with a faint grid, docs/specs/renderer.md) or 'hex' (each hex raised on its own,
//            the old look). ?hex in the address gives 'hex'.
//   cutaway: whether walls between the camera and a room are cut down to a stub so the room can be seen into (rooms look only).
//            ?nocut turns it off.
//   arenaEdge: 'dim' (default: a fight dims everything outside its arena) or 'edge' (that, plus a glowing edge round it). The device preference
//            `hextable.arenaEdge`; a refused move flashes the edge in either. Not locked by the address.
//   caves:   whether a level that is mostly rock with open hexes carved out is drawn as a cave (floors.js, caveOf). ?nocave turns it off.
const query = () => { try { return new URLSearchParams(globalThis.location?.search ?? ''); } catch { return new URLSearchParams(); } };
const stored = (k) => { try { return JSON.parse(globalThis.localStorage?.getItem(`hextable.${k}`)); } catch { return null; } };
export const lookLocked = () => { const q = query(); return { floors: q.has('hex'), cutaway: q.has('nocut'), caves: q.has('nocave') }; };
export const LOOK = (() => {
  const q = query(), lk = lookLocked();
  return {
    floors: lk.floors ? 'hex' : stored('floors') === 'hex' ? 'hex' : 'rooms',
    cutaway: lk.cutaway ? false : stored('cutaway') !== false,
    caves: lk.caves ? false : stored('caves') !== false,
    arenaEdge: stored('arenaEdge') === 'edge' ? 'edge' : 'dim',
  };
})();
const FLOORS = LOOK.floors, CUTAWAY = LOOK.cutaway, CAVES = LOOK.caves, ARENA_EDGE = LOOK.arenaEdge;

export const THEMES = {
  classic: {
    name: 'Classic Tabletop',
    ui: {
      '--bg': '#1d2622', '--panel': '#26322dee', '--panel-2': '#31403a', '--ink': '#efe9d8', '--muted': '#a9b3a6',
      '--accent': '#d7a84a', '--accent-ink': '#1d2622', '--line': '#4a5a52', '--good': '#7fc48a', '--bad': '#e0685a',
      '--display': "'Vollkorn SC', Georgia, serif", '--body': "'Source Sans 3', 'Segoe UI', system-ui, sans-serif", '--radius': '6px',
    },
    sky: rgb('#1d2622'), fog: [40, 34],
    tiles: { grass: rgb('#6f8f55'), forest: rgb('#4f7446'), stone: rgb('#9a978c'), water: rgb('#3f6f8c'), rock: rgb('#77736a') },
    tree: rgb('#2f5a35'), shadow: { a: 0.42 }, wall: rgb('#7d766a'), wallWindow: rgb('#8fb4c8'), door: rgb('#8a5a2b'), curtain: rgb('#6d4a7c'), rim: 0.8, side: 0.58, floors: FLOORS, cutaway: CUTAWAY, caves: CAVES, arenaEdge: ARENA_EDGE, grid: 0.95, arenaRim: rgb('#e9c46a'),
    sides: { party: rgb('#e6dcc0'), foe: rgb('#8c2f2a') }, foeBody: rgb('#7a5a4a'),
    pawn: { sides: 14, profile: [[0.6, 0], [0.6, 0.12], [0.42, 0.14], [0.2, 1.0], [0.3, 1.12], [0.31, 1.32], [0.2, 1.5], [0, 1.55]] },
    hl: { move: [0.95, 0.8, 0.35, 0.34], area: [1, 0.45, 0.2, 0.5], target: [0.95, 0.3, 0.25, 0.95], ally: [0.5, 0.9, 0.6, 0.95], select: [1, 1, 1, 0.9] },
  },
  sunlit: {
    name: 'Sunlit Wilds',
    ui: {
      '--bg': '#8fd0e8', '--panel': '#fffdf4f2', '--panel-2': '#eef4dc', '--ink': '#23412f', '--muted': '#5f7a68',
      '--accent': '#2f9e6b', '--accent-ink': '#ffffff', '--line': '#c9dab5', '--good': '#2f9e6b', '--bad': '#d9483b',
      '--display': "'Baloo 2', 'Trebuchet MS', sans-serif", '--body': "'Nunito', 'Segoe UI', system-ui, sans-serif", '--radius': '14px',
    },
    sky: rgb('#8fd0e8'), fog: [44, 40],
    tiles: { grass: rgb('#8ed65a'), forest: rgb('#58b558'), stone: rgb('#d8cfae'), water: rgb('#4fb5e6'), rock: rgb('#a89b84') },
    tree: rgb('#2f8f4c'), shadow: { a: 0.3 }, wall: rgb('#b89a72'), wallWindow: rgb('#b9e8f7'), door: rgb('#c27a38'), curtain: rgb('#ee7c9a'), rim: 0.9, side: 0.7, floors: FLOORS, cutaway: CUTAWAY, caves: CAVES, arenaEdge: ARENA_EDGE, grid: 0.95, arenaRim: rgb('#fff27a'),
    sides: { party: rgb('#ffffff'), foe: rgb('#d9483b') }, foeBody: rgb('#8b5fb0'),
    pawn: { sides: 16, profile: [[0.58, 0], [0.58, 0.1], [0.4, 0.12], [0.3, 0.8], [0.36, 0.95], [0.42, 1.25], [0.3, 1.52], [0, 1.6]] },
    hl: { move: [1, 1, 1, 0.42], area: [1, 0.55, 0.15, 0.55], target: [0.9, 0.2, 0.2, 0.95], ally: [0.15, 0.6, 0.4, 0.95], select: [1, 1, 1, 0.95] },
  },
  pocket: {
    name: 'Pocket Meadow',
    ui: {
      '--bg': '#c7e8c1', '--panel': '#2b2d42f2', '--panel-2': '#3a3d5c', '--ink': '#f8f7ff', '--muted': '#b8b8d1',
      '--accent': '#ffd23f', '--accent-ink': '#2b2d42', '--line': '#545880', '--good': '#8be28b', '--bad': '#ff6b6b',
      '--display': "'Silkscreen', 'Courier New', monospace", '--body': "'Nunito', 'Segoe UI', system-ui, sans-serif", '--radius': '2px',
    },
    sky: rgb('#c7e8c1'), fog: [46, 40],
    tiles: { grass: rgb('#9bdc7c'), forest: rgb('#6cc070'), stone: rgb('#e6dcc2'), water: rgb('#6ac3f0'), rock: rgb('#b9a98f') },
    tree: rgb('#3f9a5a'), shadow: { a: 0.32, sides: 4, hard: true }, wall: rgb('#8d6e63'), wallWindow: rgb('#7fd1ff'), door: rgb('#ffa94d'), curtain: rgb('#b57edc'), rim: 0.86, side: 0.66, floors: FLOORS, cutaway: CUTAWAY, caves: CAVES, arenaEdge: ARENA_EDGE, grid: 0.95, arenaRim: rgb('#ffd23f'),
    sides: { party: rgb('#2b2d42'), foe: rgb('#ff6b6b') }, foeBody: rgb('#f08a5d'),
    pawn: { sides: 4, profile: [[0.6, 0], [0.6, 0.14], [0.42, 0.14], [0.42, 0.85], [0.5, 0.85], [0.5, 1.5], [0, 1.5]] },
    hl: { move: [1, 0.85, 0.25, 0.4], area: [1, 0.4, 0.3, 0.55], target: [1, 0.3, 0.3, 0.95], ally: [0.2, 0.2, 0.3, 0.95], select: [1, 1, 1, 0.95] },
  },
};
export const hexColor = rgb;

// Change one of the three looks on every theme (they all carry them); the caller then hands the theme to the renderer again.
export function setLook(key, value) {
  if (!(key in LOOK) || lookLocked()[key]) return false;
  LOOK[key] = value;
  for (const t of Object.values(THEMES)) t[key] = value;
  return true;
}
