// The log by combat (docs/specs/table-ui.md, Decision 5 and T7c).
//
// The log is a list of blocks. A fight is one block: a summary line made from what the viewer was sent (where, rounds, outcome, who,
// XP and items from the `conclusion`), and inside it the blow-by-blow under "Round N" headings, then the spoils. Between fights the
// entries go in an Exploring block, which ends at the next fight or after an hour of world time. Trades, loot and items picked up
// or dropped are entries of their own kind and are always kept.
//
// The client filters nothing for secrecy: every entry here came from an event the viewer's view delivered (live, `recent`, a
// history answer or, in solo, the local timeline). Nothing is made up to fill a gap.
//
//   the model     createLog(), add(), seed(), merge(), record(), view()   pure, no page; tests drive them from engine events
//   the page      initLogView(ctx)                                        chips, <details> groups, the open state, lazy load
import { foeLine, shares } from './conclusion.js';

export const CHIPS = [['combat', 'Fights'], ['explore', 'Exploring'], ['loot', 'Loot and trades'], ['talk', 'Talk'], ['dm', 'DM only']];
const FILTER = 'hextable.logFilter';
export const GAP = 60;           // minutes of world time that end an Exploring block
const MAX_ENTRIES = 2500;        // the oldest blocks go when the log is longer than this

// ---- what an event is, for the filters ----
const COMBAT = new Set(['encounterStart', 'encounterEnd', 'turn', 'joined', 'attack', 'damage', 'heal', 'cast', 'act', 'recharge', 'save', 'down', 'died', 'deathSave', 'std', 'cond', 'condEnd', 'effectStart', 'effectEnd', 'concentration', 'stood', 'tempHp', 'fell', 'countered']);
const LOOT = new Set(['gear', 'conclusion', 'conclusionSkipped', 'levelReady']);
const TALK = new Set(['say', 'note', 'privateNote', 'checkAsked']);
// What players are never sent, or what is the DM's own bookkeeping. A player is sent the undo lines, so those stay in a player's log.
const DM_ONLY = new Set(['undone', 'redone', 'chronicle', 'manual', 'conclusionReady', 'concealed']);
const REWARD = new Set(['conclusionReady', 'conclusion', 'conclusionSkipped', 'levelReady', 'xp', 'conclusionEdited']);

// The log's kind of an event: combat, explore, loot, talk or dm. Where it stands (inside a fight or not) refines combat and explore.
export function kindOf(ev) {
  const t = ev?.type;
  if (DM_ONLY.has(t)) return 'dm';
  if (LOOT.has(t)) return 'loot';
  if (TALK.has(t)) return 'talk';
  if (t === 'rewound') return ev.to === 'rest' ? 'explore' : 'combat';
  return COMBAT.has(t) ? 'combat' : 'explore';
}
// Inside a fight everything that is not loot, talk or the DM's is the fight's; outside, a stray blow is just something that happened.
const placed = (kind, inFight) => (kind === 'combat' || kind === 'explore' ? (inFight ? 'combat' : 'explore') : kind);

// ---- the model ----
export function createLog() {
  return { blocks: [], fights: new Map(), byFight: new Map(), cursor: { cur: null, round: null, post: null }, bid: 0, anon: 0, lastT: 0, lastFight: null };
}
const metaOf = (m, id) => { let f = m.fights.get(id); if (!f) m.fights.set(id, f = { id, where: null, rounds: null, result: null, conclusion: null, skipped: false, taken: false, open: false, t: null }); return f; };

function fightBlock(m, id, loaded) {
  let b = m.byFight.get(id);
  if (!b) { b = { id: ++m.bid, type: 'fight', fight: id, entries: [], loaded: loaded !== false, loading: false, cut: false }; m.blocks.push(b); m.byFight.set(id, b); }
  return b;
}
function exploreBlock(m, t) {
  const last = m.blocks[m.blocks.length - 1];
  if (last?.type === 'explore' && t - last.t1 <= GAP) { last.t1 = Math.max(last.t1, t); return last; }
  const b = { id: ++m.bid, type: 'explore', t0: t, t1: t, entries: [] };
  m.blocks.push(b);
  return b;
}

// One event, with its words `line` = [text, class, kind] from the app's describe (null when the event says nothing). The cursor
// says which fight is going on; a record rebuilt for one fight brings its own. opts: { clock, loaded }.
export function add(m, ev, line, cursor = m.cursor, opts = {}) {
  const t = typeof ev.t === 'number' ? ev.t : (opts.clock ?? m.lastT);
  let fight = null, spoils = false, round = null;
  switch (ev.type) {
    case 'encounterStart': {
      const id = ev.fight ?? `local${++m.anon}`, f = metaOf(m, id);
      Object.assign(f, { where: ev.where ?? null, t, open: true, taken: false });
      cursor.cur = id; cursor.round = 0; cursor.post = null; m.lastFight = id;
      fightBlock(m, id, opts.loaded);
      break;
    }
    case 'encounterEnd': {
      const id = ev.fight ?? cursor.cur;
      if (id != null) { Object.assign(metaOf(m, id), { result: ev.result, rounds: ev.rounds, open: false }); cursor.post = id; round = cursor.round; fight = id; }
      cursor.cur = null;
      break;
    }
    case 'turn': if (cursor.cur != null) cursor.round = ev.round; break;
    case 'undone': {
      // Taking back the start of a fight closes it as taken back.
      if (ev.label === 'The fight began' && cursor.cur != null) { Object.assign(metaOf(m, cursor.cur), { taken: true, open: false }); fight = cursor.cur; cursor.cur = null; }
      break;
    }
    case 'rewound': {
      const id = ev.to === 'rest' ? null : (cursor.cur ?? cursor.post ?? m.lastFight);
      if (id != null) { Object.assign(metaOf(m, id), { taken: true, open: false }); fight = id; spoils = true; }
      cursor.cur = null;
      break;
    }
    case 'conclusion': {
      const id = ev.fight ?? cursor.post;
      if (id != null) { metaOf(m, id).conclusion = ev; fight = id; spoils = true; if (cursor.post === id) cursor.post = null; }
      break;
    }
    case 'conclusionSkipped': {
      const id = ev.fight ?? cursor.post;
      if (id != null) { metaOf(m, id).skipped = true; fight = id; spoils = true; if (cursor.post === id) cursor.post = null; }
      break;
    }
    case 'chronicle':
      // The record of a fight is written to the chronicle too; the log shows the conclusion, so inside its group that line is dropped.
      if ((ev.tags ?? []).includes('fight') && (ev.fight === undefined || m.fights.has(ev.fight))) return null;
      break;
    default:
  }
  if (fight === null) {
    if (cursor.cur != null) fight = cursor.cur;
    else if (cursor.post != null && (REWARD.has(ev.type) || (ev.type === 'gear' && ev.why === 'loot'))) { fight = ev.fight ?? cursor.post; spoils = true; }
  }
  if (ev.type === 'turn' && cursor.cur != null) round = cursor.round;
  else if (fight !== null && !spoils && round === null) round = cursor.cur === fight ? cursor.round : null;
  m.lastT = Math.max(m.lastT, t);
  if (!line) return null;
  const e = { type: ev.type, kind: line[2] ?? kindOf(ev), text: line[0], cls: line[1] || '', dice: ev.dice?.length ? ev.dice : null, round, spoils, t };
  const block = fight !== null ? fightBlock(m, fight, opts.loaded) : exploreBlock(m, t);
  block.entries.push(e);
  if (m.blocks.length > 1) trim(m);
  return e;
}
function trim(m) {
  let n = m.blocks.reduce((a, b) => a + b.entries.length, 0);
  while (n > MAX_ENTRIES && m.blocks.length > 1) {
    const b = m.blocks.shift(); n -= b.entries.length;
    if (b.type === 'fight') { m.byFight.delete(b.fight); m.fights.delete(b.fight); }
  }
}

// pairs: [[event, line], ...] oldest first. A scratch log that has read them, for seed, merge and record.
function scratch(pairs, loaded, start = null) {
  const s = createLog();
  // A batch that begins in the middle of a fight says so by ending it before it starts one.
  const first = pairs.find(([ev]) => ev.type === 'encounterStart' || ev.type === 'encounterEnd');
  if (first && first[0].type === 'encounterEnd' && first[0].fight !== undefined) s.cursor.cur = first[0].fight;
  if (start !== null) s.cursor.cur = start;
  let sawStart = s.cursor.cur === null;
  for (const [ev, line] of pairs) {
    if (ev.type === 'encounterStart') sawStart = true;
    add(s, ev, line, s.cursor, { loaded: loaded && sawStart });
  }
  return s;
}
// What happened before this device sat down (the `recent` history, or in solo the whole local timeline): goes in front of what is there.
// A fight that began before the batch has only its tail: it is marked as not loaded, to be asked for when opened.
export function seed(m, pairs, loaded = true) {
  const s = scratch(pairs, loaded);
  const front = [];
  for (const b of s.blocks) {
    const had = b.type === 'fight' && m.byFight.get(b.fight);
    if (had) { had.entries = [...b.entries, ...had.entries]; had.loaded = had.loaded && b.loaded; } else front.push(b);
  }
  for (const [id, f] of s.fights) { const mine = m.fights.get(id); if (mine) fill(mine, f); else m.fights.set(id, f); }
  for (const b of front) { b.id = ++m.bid; if (b.type === 'fight') m.byFight.set(b.fight, b); }
  m.blocks.unshift(...front);
  if (m.lastFight === null) m.lastFight = s.lastFight;
  trim(m);
}
const fill = (to, from) => { for (const k of ['where', 'rounds', 'result', 'conclusion', 't']) if (to[k] == null && from[k] != null) to[k] = from[k]; if (from.skipped) to.skipped = true; if (from.taken) to.taken = true; };
// Older fights, from their start, end and conclusion events only: one collapsed block each, before everything the log holds.
export function merge(m, pairs) {
  const s = scratch(pairs, false);
  const older = [];
  for (const b of s.blocks) if (b.type === 'fight' && !m.byFight.has(b.fight)) older.push(b);
  for (const [id, f] of s.fights) { const mine = m.fights.get(id); if (mine) fill(mine, f); }
  for (const b of older) { b.id = ++m.bid; b.loaded = false; m.byFight.set(b.fight, b); m.fights.set(b.fight, s.fights.get(b.fight)); }
  older.sort((a, b) => String(a.fight).localeCompare(String(b.fight), undefined, { numeric: true }));
  m.blocks.unshift(...older);
  trim(m);
}
// One fight's blow-by-blow, as the viewer may see it (the server's answer to history { fight }). Its start and end come with it; the
// spoils and the conclusion, which follow the end, are kept from what the block already has.
export function record(m, id, pairs, cut = false) {
  const b = m.byFight.get(id);
  if (!b) return false;
  const s = scratch(pairs, true, null);
  const got = s.byFight.get(id) ?? s.blocks.find((x) => x.type === 'fight');
  b.entries = [...(got?.entries ?? []), ...b.entries.filter((e) => e.spoils)];
  b.loaded = true; b.loading = false; b.cut = !!cut;
  return true;
}

// ---- words ----
const num = (n) => Number(n).toLocaleString('en-US');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const OUTCOME = { victory: 'Won', defeat: 'Fell', ended: 'Ended by the DM', stalemate: 'Stalemate' };
const list = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
// The summary of a fight, as far as the viewer was sent it: { title, sub }. A part nobody sent is left out, with no placeholder.
export function summaryOf(f, n, nameOf = (id) => id) {
  const outcome = f.taken ? 'Taken back' : f.open ? 'In progress' : (OUTCOME[f.result] ?? null);
  const title = [`Fight ${n}`, f.where, f.rounds ? plural(f.rounds, 'round') : null, outcome].filter(Boolean).join(' · ');
  const c = f.conclusion, parts = [];
  if (c) {
    const names = (c.party ?? []).map(nameOf), foes = foeLine(c.foes);
    if (names.length && foes) parts.push(`${list(names)} beat ${foes}`);
    const sh = shares(c, nameOf);
    if (sh.rows.length) parts.push(sh.each !== null ? `${num(sh.each)} XP each` : sh.rows.map((r) => `${r.name} ${num(r.n)}`).join(', '));
    if (c.loot?.length) parts.push(plural(c.loot.length, 'item'));
  } else if (f.skipped) parts.push('No rewards');
  return { title, sub: parts.join(' · ') };
}

// ---- what to draw ----
// filter: a Set of kinds; empty means everything. A player has no DM chip, so a stored one does not count.
export function activeFilter(filter, dm) { const f = new Set([...(filter ?? [])].filter((k) => dm || k !== 'dm')); return f; }
// The blocks as the viewer sees them, filtered: a fight keeps its summary line whatever the filter and shows inside only what matches.
// Exploring blocks with nothing that matches are left out.
export function view(m, { filter = [], dm = false, nameOf, clockText = String } = {}) {
  const f = activeFilter(filter, dm), out = [];
  let fights = 0;
  for (const b of m.blocks) {
    const inFight = b.type === 'fight';
    const shown = b.entries.filter((e) => f.size === 0 || f.has(placed(e.kind, inFight)));
    const common = { id: b.id, total: b.entries.length, entries: shown, last: b === m.blocks[m.blocks.length - 1] };
    if (inFight) {
      const meta = metaOf(m, b.fight);
      out.push({ ...common, type: 'fight', fight: b.fight, n: ++fights, open: meta.open, loaded: b.loaded, loading: b.loading, cut: b.cut, ...summaryOf(meta, fights, nameOf) });
    } else if (shown.length) {
      out.push({ ...common, type: 'explore', title: `Exploring · ${clockText(b.t0)}` });
    }
  }
  return out;
}
// Entries of a group by round: the start, Round 1, Round 2 ..., the spoils.
export function rounds(entries) {
  const out = [];
  for (const e of entries) {
    const key = e.spoils ? 'spoils' : e.round;
    const r = out[out.length - 1];
    if (r && r.key === key) r.entries.push(e); else out.push({ key, label: key === 'spoils' ? 'Spoils' : key === 0 ? 'Start' : key == null ? '' : `Round ${key}`, entries: [e] });
  }
  return out;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// The list's markup. `line(entry, inFight)` gives one entry's <li> (the app adds the dice glyphs); `isOpen(group)` the open state.
export function html(groups, { line, isOpen, filtered = false }) {
  const li = (e, inFight) => (line ? line(e, inFight) : `<li class="lg-line ${esc(e.cls)}" data-kind="${placed(e.kind, inFight)}">${esc(e.text)}</li>`);
  const body = (g) => {
    const inFight = g.type === 'fight';
    if (inFight && g.loading) return '<p class="lg-note" role="status">Loading the blow-by-blow…</p>';
    if (!g.entries.length) return `<p class="lg-note">${filtered ? 'Nothing in this fight matches the filter.' : 'Nothing was recorded.'}</p>`;
    return rounds(g.entries).map((r) => `<li class="lg-round">${r.label ? `<h4 class="lg-h">${r.label}</h4>` : ''}<ol class="lg-lines">${r.entries.map((e) => li(e, inFight)).join('')}</ol></li>`).join('')
      + (g.cut ? '<p class="lg-note">The record is cut here: only its first lines were sent.</p>' : '');
  };
  return groups.map((g) => {
    const open = isOpen(g) ? ' open' : '';
    if (g.type === 'fight') {
      return `<li class="lg-group lg-fight"><details data-b="${g.id}" data-fight="${esc(g.fight)}"${open}><summary><span class="lg-title">${esc(g.title)}</span>${g.sub ? `<span class="lg-sub">${esc(g.sub)}</span>` : ''}</summary><ol class="lg-rounds">${body(g)}</ol></details></li>`;
    }
    return `<li class="lg-group lg-explore"><details data-b="${g.id}"${open}><summary><span class="lg-title">${esc(g.title)}</span><span class="lg-sub">${plural(g.entries.length, 'entry').replace('entrys', 'entries')}</span></summary><ol class="lg-rounds"><li class="lg-round"><ol class="lg-lines">${g.entries.map((e) => li(e, false)).join('')}</ol></li></ol></details></li>`;
  }).join('');
}

// ---- the page ----
// ctx: { root (#log), list (#log-list), prefs, isDM(), nameOf(id), clockText(min), line(entry, inFight), ask(fightId) }
export function initLogView(ctx) {
  let m = createLog();
  const open = new Map();        // block id -> what the person chose, over the default
  const chips = document.createElement('div'); chips.id = 'log-chips'; chips.className = 'lg-chips'; chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'Filter the log');
  ctx.list.before(chips);
  const stored = () => { const v = ctx.prefs.get(FILTER); return Array.isArray(v) ? v.filter((k) => CHIPS.some(([c]) => c === k)) : []; };
  let filter = stored();

  const scroller = () => { for (let e = ctx.list.parentElement; e; e = e.parentElement) { const o = getComputedStyle(e).overflowY; if ((o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight) return e; } return null; };
  function drawChips() {
    const dm = ctx.isDM(), f = activeFilter(filter, dm);
    chips.innerHTML = CHIPS.filter(([k]) => dm || k !== 'dm').map(([k, label]) => `<button type="button" class="lg-chip" data-kind="${k}" aria-pressed="${f.has(k)}">${label}</button>`).join('');
  }
  function render(stick = false) {
    if (ctx.root.hidden) return;
    const sc = scroller(), atEnd = !sc || sc.scrollHeight - sc.scrollTop - sc.clientHeight < 60;
    drawChips();
    const dm = ctx.isDM(), groups = view(m, { filter, dm, nameOf: ctx.nameOf, clockText: ctx.clockText });
    ctx.list.innerHTML = html(groups, { line: ctx.line, filtered: activeFilter(filter, dm).size > 0, isOpen: (g) => open.get(g.id) ?? (g.type === 'fight' ? g.open : g.last) });
    if (stick || atEnd) (scroller() ?? document.scrollingElement)?.scrollTo?.(0, 1e9);
  }
  chips.addEventListener('click', (ev) => {
    const k = ev.target.closest?.('.lg-chip')?.dataset.kind; if (!k) return;
    const f = new Set(activeFilter(filter, ctx.isDM())); f.has(k) ? f.delete(k) : f.add(k);
    filter = [...f]; ctx.prefs.set(FILTER, filter);
    render();
    chips.querySelector(`[data-kind="${k}"]`)?.focus({ preventScroll: true });
  });
  // `toggle` does not bubble: caught on the way down. Opening a fight whose blow-by-blow was never sent asks for it.
  ctx.list.addEventListener('toggle', (ev) => {
    const d = ev.target; if (!(d instanceof HTMLDetailsElement) || !d.dataset.b) return;
    const id = Number(d.dataset.b), b = m.blocks.find((x) => x.id === id); if (!b) return;
    open.set(id, d.open);
    if (d.open && b.type === 'fight' && !b.loaded && !b.loading) { b.loading = true; ctx.ask(b.fight); render(); }
  }, true);

  return {
    reset() { m = createLog(); open.clear(); },
    add: (ev, line, clock) => { add(m, ev, line, m.cursor, { clock }); render(); },
    seed: (pairs, loaded) => { seed(m, pairs, loaded); render(true); },
    merge: (pairs) => { merge(m, pairs); render(); },
    record: (id, pairs, cut) => { if (record(m, id, pairs, cut)) render(); },
    render,
    get model() { return m; },
  };
}
