// Keeping the timeline from growing without limit.
//
// The timeline is the table's record of what happened. Every entry of type `chronicle` (what the
// DM and players wrote down on purpose) is kept forever. Of everything else, the most recent
// `max` entries are kept and the oldest beyond that are dropped.
//
// This is not done inside apply(): apply is pure and replays a game exactly, and its result must
// not depend on a setting. It is done by whoever keeps the game, the table server and the solo
// transport, right after a successful action, before that action is recorded for undo:
//
//   const dropped = capTimeline(state.timeline, max);
//   history.record(before, state, label, dropped);
//
// The history keeps what was dropped with the step, so undoing it restores the timeline exactly.
// Non-undoable actions (claim, release) are not capped; the next recorded action does it.
export const TIMELINE_CAP = 5000;

export const kept = (e) => e.type === 'chronicle';

// Drop the oldest non-chronicle entries beyond `max`, in place. Returns what was dropped as
// [{ i, e }]: the entry and the place it had in the list before anything was dropped, lowest first.
export function capTimeline(timeline, max = TIMELINE_CAP) {
  if (!Array.isArray(timeline) || !(max >= 0)) return [];
  let others = 0;
  for (const e of timeline) if (!kept(e)) others++;
  let excess = others - Math.floor(max);
  if (excess <= 0) return [];
  const dropped = [];
  let to = 0;
  for (let i = 0; i < timeline.length; i++) {
    const e = timeline[i];
    if (excess > 0 && !kept(e)) { dropped.push({ i, e }); excess--; } else timeline[to++] = e;
  }
  timeline.length = to;
  return dropped;
}
