// How good is the connection to the table? Pure: no DOM, no timers, no network (tested in packages/client/test/linkquality.test.js).
//
// The transport (transport.js) measures: a small ping over the table's own socket every few seconds, whether it was answered, and what the
// browser says (online/offline, the socket closed and being reopened). Each measurement is one sample. `step` folds a sample into the
// judgement and `explain` says it in plain words. The thresholds are all in LINK, in one place, and a test or a smoke pass may shorten
// them (`?link=fast` in the address, see app.js).
//
// States: 'good', 'shaky' (works, but slowly or with trouble: warn), 'lost' (no way to the table now). The state changes only after a short
// run of samples that all say the same new thing, so a single slow reply never flickers the dot.
//
// A sample is { t: ms, kind: 'ok' | 'miss' | 'down', rtt?: ms (for ok), offline?: true (the browser says it is offline, for down),
//   attempt?: n (which reconnect this is, for down), flaps: reconnects in the last LINK.flapMs }.

export const LINK = {
  pingMs: 4000,        // a ping every so often over the table's socket
  pongMs: 3000,        // a reply later than this counts as missed
  slowMs: 800,         // one reply slower than this is a slow sample
  window: 5,           // replies averaged for the number shown
  lostMisses: 3,       // this many missed replies in a row: no way through (lost)
  needWorse: 2,        // samples in a row that must say worse before the state gets worse
  needBetter: 3,       // samples in a row that must say better before the state gets better
  flapMs: 180000,      // reconnects counted over this long ...
  flapCount: 3,        // ... this many or more is shaky however fast the replies are
  reportMs: 3000,      // a player's state goes to the server at most this often
  heartbeatMs: 15000,  // and is repeated this often while it does not change, so the DM can tell a silent player from a steady one
  staleMs: 40000,      // the DM counts a player whose state has not been heard for this long as lost
};

// The same thresholds, shortened, for tests and smoke passes. Same rules, faster clock.
export const LINK_FAST = { ...LINK, pingMs: 300, pongMs: 250, reportMs: 200, heartbeatMs: 1000, staleMs: 4000, flapMs: 20000 };

export const STATES = ['good', 'shaky', 'lost'];
const RANK = { good: 0, shaky: 1, lost: 2 };

export const start = (t = 0) => ({ state: 'good', since: t, run: { grade: 'good', n: 0 }, misses: 0, rtts: [], last: null });

// What one sample says on its own.
export function grade(m, s, cfg = LINK) {
  let g;
  if (s.kind === 'down') g = 'lost';
  else if (s.kind === 'miss') g = m.misses >= cfg.lostMisses ? 'lost' : 'shaky';
  else g = s.rtt > cfg.slowMs ? 'shaky' : 'good';
  if (g === 'good' && (s.flaps ?? 0) >= cfg.flapCount) g = 'shaky';
  return g;
}

// Fold in one sample. Returns a new judgement; the one it was given is left as it was.
export function step(m, s, cfg = LINK) {
  const next = { ...m, last: s };
  if (s.kind === 'ok') { next.misses = 0; next.rtts = [...m.rtts, s.rtt].slice(-cfg.window); }
  else if (s.kind === 'miss') next.misses = m.misses + 1;
  const g = grade(next, s, cfg);
  if (g === m.state) next.run = { grade: g, n: 0 };
  else {
    const n = m.run.grade === g ? m.run.n + 1 : 1;
    next.run = { grade: g, n };
    if (n >= (RANK[g] > RANK[m.state] ? cfg.needWorse : cfg.needBetter)) { next.state = g; next.since = s.t; next.run = { grade: g, n: 0 }; }
  }
  return next;
}

export const average = (m) => (m.rtts.length ? m.rtts.reduce((a, b) => a + b, 0) / m.rtts.length : null);
// A non-breaking space before the unit, so "1.2 s" is never cut at the end of a line.
export const seconds = (ms) => (ms < 1000 ? `${Math.max(1, Math.round(ms / 10) * 10)}\u00a0ms` : `${(ms / 1000).toFixed(1)}\u00a0s`);

// The state in plain words: { label (a word or two), text (the sentence a tap shows) }.
export function explain(m, cfg = LINK) {
  const l = m.last, avg = average(m);
  if (m.state === 'lost') {
    const text = l?.kind === 'down' ? (l.offline ? 'This device says it is offline. The table comes back when the network does.' : `Reconnecting, attempt ${l.attempt ?? 1}`)
      : `No answer from the table for about ${Math.round((m.misses * cfg.pingMs) / 1000)} s`;
    return { label: 'Lost', text };
  }
  if (m.state === 'shaky') {
    const flaps = l?.flaps ?? 0;
    const text = flaps >= cfg.flapCount ? `The connection dropped ${flaps} times in the last ${Math.max(1, Math.round(cfg.flapMs / 60000))} minutes`
      : m.misses > 0 || avg === null ? 'Some replies from the table are not arriving'
      : `Slow replies from the table: about ${seconds(avg)}`;
    return { label: 'Shaky', text };
  }
  return { label: 'Good', text: avg === null ? 'Connected to the table' : `Connected. Replies in about ${seconds(avg)}` };
}

// How the DM sees a player: what the player last reported (`report`: { state, rtt?, at }), whether the server says they are at the table
// (`online`, from the lobby), and the time. Nothing heard, or heard too long ago, is lost; nobody at the table is lost.
export function seenState(report, online, now, cfg = LINK) {
  if (online === false) return { state: 'lost', text: 'Not connected to the table' };
  if (!report) return { state: 'lost', text: 'Not heard from yet' };
  if (now - report.at > cfg.staleMs) return { state: 'lost', text: `Not heard from for ${Math.round((now - report.at) / 1000)} s` };
  const text = report.state === 'good' ? 'Good' : report.state === 'shaky' ? 'Shaky' : 'Lost';
  return { state: STATES.includes(report.state) ? report.state : 'lost', text: typeof report.rtt === 'number' && report.state !== 'lost' ? `${text}: replies in about ${seconds(report.rtt)}` : text };
}
