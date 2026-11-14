// The event timeline (docs/specs/renderer.md, decisions 2 and 3). Pure: no DOM, no WebGL, no imports, and no clock of its own
// (the clock is passed in), so it runs in Node under test.
//
// What it does. Each update from the table (a state and the events that made it) is turned into beats: the events in the
// order they happened, each with a time in seconds, grouped as the spec says (an attack with its damage and fall; a spell
// with every save and damage it causes). The beats of the updates received are played one after another. While they
// play, the *shown* state stays behind the true state: a creature's hit points, death, place and conditions change when the
// beat that is about them plays, not when the update arrives. When the queue is empty the shown state is the true state.
//
//   const tl = createTimeline({ clock, pace, speed, gridOf, onBeat, onShow, onDone, onIdle })
//   gridOf(state)                  the grid of the state's map (shared/grid.js `gridOf(state.map)`); its `dist` says whether a
//                                  target is next to the attacker. Without it distances are hex distances.
//   tl.push(state, events, meta?)  queue an update. meta: { fresh, instant, flush } (see below), kept for onDone
//   tl.tick()                      play what is due; the caller calls it often (a timer or a frame)
//   tl.skip()                      finish every queued beat at once (a tap, Escape, a hidden tab coming back)
//   tl.busy()                      whether beats are still to play
//   tl.whenIdle()                  a promise for the moment the queue is empty (already resolved if it is)
//   tl.setPace(p) / tl.setSpeed(n) 'wait' | 'flow' | 'instant'; 1 or 2 (a player's own speed)
//   tl.shown()                     the state as the table should be drawn now
//
//   onBeat(ev, { update, instant, index })  an event plays now (the log line, the floating text, the camera)
//   onShow(shownState, events)              the picture should be brought to shownState; events are those that just played
//   onDone(update)                          every beat of an update has played ({ state, events, meta })
//   onIdle()                                the queue is empty
//
// meta.fresh   a state that is not a continuation (joining, a reset): nothing plays, the state is shown at once
// meta.instant this update shows at once (a question waiting for an answer must not sit behind queued beats)
// meta.flush   everything queued before it is finished first (undo and redo take the table back: no animation)
// Pace `instant` plays every beat the moment the update arrives, which is how the game played before the timeline.

export const PACES = ['wait', 'flow', 'instant'];
export const LIMIT = 3;              // an update's beats are scaled to fit in this many seconds (a walk keeps its own length)
export const CATCH_UP = 3;           // more than this far behind: play at double speed
export const SKIP_ALL = 8;           // more than this far behind: only the last update plays; the rest are shown at once
const RANK = { instant: 0, flow: 1, wait: 2 };

// The pace in force for one player: the table's setting (`wait` if the table has none yet), which a player may only make
// quicker, never slower; and reduced motion, which means `instant` unless the player has chosen otherwise.
export function paceFor({ table, mine, reduced } = {}) {
  const t = table in RANK ? table : 'wait';
  const m = mine in RANK ? mine : reduced ? 'instant' : t;
  return RANK[m] < RANK[t] ? m : t;
}

// ---------- events to beats ----------
const DUR = {
  turn: 0.4, encounterStart: 1.2, encounterEnd: 0.6, joined: 0.3, placed: 0.3, damage: 0.4, heal: 0.5, down: 0.6, died: 0.6,
  deathSave: 0.6, cond: 0.3, condEnd: 0.3, stood: 0.4, std: 0.5, note: 0.5, noticed: 0.5, triggered: 0.6, fell: 0.6, region: 0.6,
  revealed: 0.4, spawned: 0.4, removed: 0.3, size: 0.4, effectStart: 0.4, effectEnd: 0.4, map: 0.8,
};
const STEP = 0.18, WALK_MAX = 2, FORCED = 0.25, MELEE = 0.6, RANGED = 0.8, GESTURE = 0.4, AREA = 0.5;
const AFTER_ATTACK = new Set(['damage', 'down', 'died', 'cond', 'condEnd', 'tempHp', 'concentration', 'save']);
const AFTER_CAST = new Set(['save', 'damage', 'heal', 'down', 'died', 'cond', 'condEnd', 'tempHp', 'concentration', 'effectStart', 'effectEnd', 'size', 'speed']);
// How many cells apart two positions are, when no grid is given: the hex count the timeline has always used.
const HEXES = { dist: (a, b) => { const dq = a.q - b.q, dr = a.r - b.r; return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2; } };

// How long an event takes on its own. `G` is the map's grid (anything with `dist(a, b)`); the default is hexes.
export function durationOf(ev, state, G = HEXES) {
  switch (ev.type) {
    case 'moved': return ev.forced ? FORCED : Math.min(WALK_MAX, STEP * (ev.path?.length ?? 0));
    case 'attack': {
      const a = state?.entities?.[ev.actor]?.pos, t = state?.entities?.[ev.target]?.pos;
      return a && t && G.dist(a, t) > 1 ? RANGED : MELEE;      // from where they stand: a far target is shot at
    }
    case 'cast': return GESTURE + (ev.hexes?.length ? AREA : 0);
    case 'save': return ev.success ? 0.3 : 0;                    // "Saved" floats; a failure shows nothing of its own
    case 'object': return /portcullis/i.test(ev.name ?? '') ? 0.8 : 0.5;
    default: return DUR[ev.type] ?? 0;                           // types the spec does not list play nothing and take no time
  }
}

// The beats of one update. Returns { items: [{ ev, at }], total } with `at` in seconds from the start of the update, in order.
// Events that belong together share a beat: they start together, or the followers start as the lead's strike ends.
export function planBeats(events, state, G = HEXES) {
  const slots = [];
  for (let i = 0; i < events.length; i++) {
    const lead = events[i], dur = durationOf(lead, state, G), slot = { dur, fixed: lead.type === 'moved', members: [[lead, 0]] };
    const follows = lead.type === 'attack' ? AFTER_ATTACK : lead.type === 'cast' ? AFTER_CAST : null;
    if (follows) {
      let tail = 0;
      while (i + 1 < events.length && follows.has(events[i + 1].type)) {
        const f = events[++i];
        slot.members.push([f, dur]); tail = Math.max(tail, durationOf(f, state, G));
      }
      slot.dur = dur + tail;
    }
    slots.push(slot);
  }
  const scalable = slots.filter((s) => !s.fixed).reduce((n, s) => n + s.dur, 0), k = scalable > LIMIT ? LIMIT / scalable : 1;
  const items = [];
  let t = 0;
  for (const s of slots) {
    const f = s.fixed ? 1 : k;
    for (const [ev, off] of s.members) items.push({ ev, at: t + off * f });
    t += s.dur * f;
  }
  return { items, total: t };
}

// ---------- the shown state ----------
// The state object the transport hands over is changed in place, so what each creature looked like is copied when an update
// arrives. Only what a beat can be about is copied: hit points, death, place and conditions.
const snapOf = (state) => {
  const o = {};
  for (const [id, e] of Object.entries(state?.entities ?? {})) o[id] = { hp: e.hp, tempHp: e.tempHp, dead: e.dead, pos: e.pos ? { ...e.pos } : e.pos, cond: e.cond ? { ...e.cond } : e.cond };
  return o;
};
// Which part of a creature's picture an event is about, if any: [id, part].
const aboutOf = (ev) => {
  switch (ev.type) {
    case 'damage': case 'heal': return [ev.target, 'hp'];
    case 'deathSave': return [ev.id, 'hp'];
    case 'died': return [ev.id, 'dead'];
    case 'moved': case 'placed': return [ev.id, 'pos'];
    case 'cond': case 'condEnd': case 'stood': return [ev.id, 'cond'];
    default: return null;
  }
};

export function createTimeline({ clock = () => Date.now() / 1000, pace = 'wait', speed = 1, gridOf = () => HEXES, onBeat, onShow, onDone, onIdle } = {}) {
  let queue = [], cur = null, last = clock(), serial = 0, dirty = false, lastAfter = null, lastState = null, waiters = [];
  let fired = [];

  const backlog = () => (cur ? cur.total - cur.local : 0) + queue.reduce((n, u) => n + u.total, 0);

  // The picture of update u at this moment: its state, with what its unplayed beats are about still as it was.
  function materialize(u) {
    if (!u.before) return u.state;
    const pending = {};
    for (const it of u.items) { if (it.done) continue; const a = aboutOf(it.ev); if (a) (pending[a[0]] ??= new Set()).add(a[1]); }
    const entities = { ...u.state.entities };
    for (const [id, parts] of Object.entries(pending)) {
      const was = u.before[id], now = u.after[id], live = entities[id];
      if (!was || !now || !live) continue;                    // it did not exist before: nothing earlier to show
      const f = { ...now }, played = u.now[id] ?? {};
      if (parts.has('hp')) { f.hp = played.hp ?? was.hp; f.tempHp = played.tempHp ?? was.tempHp; }
      if (parts.has('dead')) f.dead = was.dead;
      if (parts.has('pos')) f.pos = played.pos ?? was.pos;
      if (parts.has('cond')) f.cond = was.cond;
      entities[id] = { ...live, ...f };
    }
    // Everything else is as of this update, whatever later updates have done to the shared object.
    for (const [id, now] of Object.entries(u.after)) if (!pending[id] && entities[id]) entities[id] = { ...entities[id], ...now };
    return { ...u.state, entities };
  }

  function play(u, it) {
    it.done = true;
    const ev = it.ev, who = aboutOf(ev)?.[0];
    if (who !== undefined) {
      const n = (u.now[who] ??= {});
      if (ev.type === 'damage' || ev.type === 'heal' || ev.type === 'deathSave') { if (ev.hp !== undefined) n.hp = ev.hp; if (ev.tempHp !== undefined) n.tempHp = ev.tempHp; }
      if (ev.type === 'moved' && ev.path?.length) n.pos = { ...(u.after[who]?.pos ?? {}), ...ev.path.at(-1) };
      if (ev.type === 'placed' && ev.to) n.pos = { ...(u.after[who]?.pos ?? {}), ...ev.to };
    }
    fired.push(ev);
    onBeat?.(ev, { update: u, instant: u.instant, index: u.items.indexOf(it) });
  }

  const finish = (u) => {
    for (const it of u.items) if (!it.done) play(u, it);
    lastState = u.state; dirty = true; cur = null;
    onDone?.(u);
  };

  function show() {
    const evs = fired; fired = [];
    if (!evs.length && !dirty) return;
    dirty = false;
    onShow?.(cur ? materialize(cur) : lastState, evs);
  }

  function idle() {
    const w = waiters; waiters = [];
    onIdle?.();
    for (const r of w) r();
  }

  // Everything that is queued, shown at once, in order.
  function flushAll(keepLast = false) {
    if (cur) finish(cur);
    while (queue.length > (keepLast ? 1 : 0)) finish(queue.shift());
  }

  function advance(dt) {
    let left = dt;
    for (;;) {
      if (!cur) {
        if (!queue.length) break;
        cur = queue.shift(); cur.local = 0; dirty = true;
      }
      const step = Math.min(left, cur.total - cur.local);
      cur.local += step; left -= step;
      for (const it of cur.items) if (!it.done && it.at <= cur.local + 1e-9) play(cur, it);
      if (cur.local >= cur.total - 1e-9) { finish(cur); continue; }
      break;                                                  // this update has more to play and no time is left
    }
  }

  function run(dt) {
    const had = !!(cur || queue.length);
    if (backlog() > SKIP_ALL) flushAll(true);                  // far behind: only the newest update plays
    advance(dt * speed * (backlog() > CATCH_UP ? 2 : 1));
    show();
    if (had && !cur && !queue.length) idle();
  }

  const tl = {
    push(state, events = [], meta = {}) {
      const after = snapOf(state), instant = pace === 'instant' || !!meta.fresh || !!meta.instant;
      const plan = instant ? { items: (events ?? []).map((ev) => ({ ev, at: 0 })), total: 0 } : planBeats(events ?? [], state, gridOf(state) ?? HEXES);
      const u = { id: ++serial, state, events, meta, instant, before: meta.fresh ? null : lastAfter, after, now: {}, items: plan.items.map((it) => ({ ...it, done: false })), total: plan.total, local: 0 };
      lastAfter = after;
      if (pace === 'instant' || meta.fresh || meta.flush) flushAll();
      queue.push(u);
      if (!cur && queue.length === 1) last = clock();
      run(0);
      return u.id;
    },
    tick() {
      const now = clock(), dt = Math.max(0, now - last);
      last = now;
      if (cur || queue.length) run(dt);
    },
    skip() { if (!cur && !queue.length) return false; flushAll(); show(); idle(); return true; },
    busy: () => !!(cur || queue.length),
    whenIdle: () => (cur || queue.length ? new Promise((r) => waiters.push(r)) : Promise.resolve()),
    setPace(p) { if (p in RANK) { pace = p; if (p === 'instant') tl.skip(); } },
    setSpeed(n) { speed = n === 2 ? 2 : 1; },
    get pace() { return pace; },
    shown: () => (cur ? materialize(cur) : lastState),
    behind: backlog,
  };
  return tl;
}
