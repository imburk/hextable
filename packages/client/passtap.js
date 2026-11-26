// #793: after a spell's choices open the sheet over the map, one tap on the dimmed map closes the sheet and is also the tap on the map.
// The scrim sits over the canvas, so the canvas never sees that tap; the drawer notes where the finger went down and, on the click, says whether it was a tap
// (the renderer's own rule: under 8 px of travel and under 600 ms) and where it landed. A drag, or a press held, only closes.
export const TAP_PX = 8, TAP_MS = 600;
export function mapTap(down, up, wanted) {
  if (!wanted || !down || !up) return null;
  if (Math.abs(up.x - down.x) + Math.abs(up.y - down.y) >= TAP_PX || up.t - down.t >= TAP_MS) return null;
  return { x: up.x, y: up.y, type: down.type };
}
