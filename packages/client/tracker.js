// The combat tracker: a tab of the drawer (docs/specs/table-ui.md, Decision 3). It lists the fight in initiative order, one row to
// a turn and top to bottom (or the party, outside a fight), with health, conditions and lasting effects. It only reads the state it
// is given and sends existing actions (harm, mend, setHp for the dead, endTurn, reveal); it never changes anything itself. It shows
// only what that state holds, so a player's tracker shows exactly what the player's view sent: no hidden creature, no number the
// view held back, and a turn taken by a creature the party cannot see is one row that says so and names no one.
import { inFight, clockText, FT, up } from './shared/engine.js';
import { under } from './shared/space.js';
import { conditionName } from './shared/modifiers.js';
import { barFor } from './three-build.js';
import { MONSTERS } from './shared/content/index.js';
import { rowDotHTML } from './linkdot.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WORD = { dead: 'Dead', down: 'Down', bloodied: 'Bloodied', healthy: 'Healthy' };

// The rows, in order. In a fight: one per slot of the order, { e, init, now } for a creature the viewer is sent and { unseen: true, now }
// for the one slot a creature's unseen turn is (it holds no id, no name, no number). Outside a fight: the party, and for the DM the
// creatures hidden from the players. `init` is there only where the view sent it (open creatures; everyone for the DM).
export function trackerRows(S, { dm = false } = {}) {
  const enc = S?.encounter;
  if (enc) {
    const inOrder = new Set(enc.order.map((o) => o.id));
    return enc.order.flatMap((o, i) => {
      if (o.someone) return [{ unseen: true, now: i === enc.turn }];
      const e = S.entities[o.id]; if (!e) return [];
      const item = { e, init: typeof o.init === 'number' ? o.init : undefined, now: i === enc.turn };
      // A controlled mount that is being ridden has no turn of its own: it is drawn with its rider (companions.md, C6).
      const m = e.riding && S.entities[e.riding.on];
      return m && !inOrder.has(m.id) ? [item, { e: m, now: false, carried: true }] : [item];
    });
  }
  const all = Object.values(S?.entities ?? {});
  const party = all.filter((e) => e.side === 'party');
  // A companion stands under its master, as this viewer was sent it.
  const kids = (m) => party.filter((c) => c.bond?.to === m.id);
  const head = party.filter((e) => !(e.bond && S.entities[e.bond.to]?.side === 'party'));
  const ordered = head.flatMap((m) => [m, ...kids(m)]);
  return [...ordered, ...party.filter((e) => !ordered.includes(e)), ...(dm ? all.filter((e) => e.hidden && e.side !== 'party') : [])].map((e) => ({ e, now: false }));
}

// What a creature is called on screen. A companion the viewer was sent the bond of (the party's own) reads as its master's: "Brenna's wolf".
// A creature the DM gave a name of its own ("Fang") keeps it after the master's name; one still called by its monster's name drops to lower case.
export function shownName(S, e) {
  const m = e?.bond ? S?.entities?.[e.bond.to] : null;
  if (!m || e.name.startsWith(m.name)) return e?.name ?? '';
  return `${m.name}'s ${MONSTERS[e.tpl]?.name === e.name ? e.name.toLowerCase() : e.name}`;
}

// What the header says about the turn: "Tor's turn", "Something moves unseen", or nothing (the table says nothing of an unseen turn).
export function turnLine(S) {
  const enc = S?.encounter; if (!enc) return '';
  const o = enc.order[enc.turn];
  return !o ? '' : o.someone ? 'Something moves unseen' : S.entities[o.id] ? `${shownName(S, S.entities[o.id])}'s turn` : '';
}

// The turn line of the clean screen (docs/specs/one-token-menu.md, Decision 1): one line, in a fight only. "Round 2 · Goblin's turn · you in 3", "Round 2 · Your turn",
// "Round 2 · Something moves unseen" (just "Round 2" when the table says nothing of an unseen turn). `mine(e)` says whether the viewer plays e.
// Returns { text, mine } or null outside a fight; `mine` is true on the viewer's own turn.
// M6 (Decision 7): `waiting` (the table waits for someone else's reaction: a player's view says only that, `prompt.waiting`) puts "Waiting for a reaction…" in the
// line's place; a player whose one character is down and dying reads "You are down · Death saves ✓ ✓ ○ ✗ ○ ○" there (the round and whose turn it is are in Turns).
// The count to the viewer's turn steps over the turns that will be taken: an unseen creature's slot is one, a dead creature's is none.
// `mine` stays true on the viewer's own turn whatever the words, so End turn stays.
export const deathMarks = (e) => { const d = e?.death ?? {}, row = (n, mark) => Array.from({ length: 3 }, (_, i) => (i < (n ?? 0) ? mark : '\u25cb')).join(' '); return `${row(d.s, '\u2713')} ${row(d.f, '\u2717')}`; };
export const turnsAway = (S, mine = () => false) => {
  const enc = S?.encounter; if (!enc) return 0;
  let n = 0;
  for (let k = 1; k <= enc.order.length; k++) {
    const x = enc.order[(enc.turn + k) % enc.order.length], e = x && !x.someone ? S.entities[x.id] : null;
    if (x?.someone) { n++; continue; }
    if (!e || e.dead) continue;
    n++;
    if (up(e) && mine(e)) return n;
  }
  return 0;
};
export function screenTurnLine(S, mine = () => false) {
  const enc = S?.encounter; if (!enc) return null;
  const o = enc.order[enc.turn], round = `Round ${enc.round}`;
  const cur = o && !o.someone ? S.entities[o.id] : null, myTurn = !!cur && mine(cur);
  if (S.prompt?.waiting === true) return { text: 'Waiting for a reaction\u2026', mine: myTurn, waiting: true };
  const played = Object.values(S.entities).filter((e) => e.kind === 'pc' && mine(e));
  if (played.length === 1 && !played[0].dead && played[0].hp <= 0 && played[0].death) return { text: played[0].cond?.stable ? 'You are down \u00b7 Stable' : `You are down \u00b7 Death saves ${deathMarks(played[0])}`, mine: myTurn, down: true };
  if (!o) return { text: round, mine: false };
  if (o.someone) return { text: S.settings?.unseenTurns === 'quiet' ? round : `${round} \u00b7 Something moves unseen`, mine: false };
  if (!cur) return { text: round, mine: false };
  if (myTurn) return { text: `${round} \u00b7 Your turn`, mine: true };
  const away = turnsAway(S, mine);
  return { text: `${round} \u00b7 ${shownName(S, cur)}'s turn${away === 1 ? ' \u00b7 you next' : away ? ` \u00b7 you in ${away}` : ''}`, mine: false };
}

// One row. `opts`: { dm, mine(e), ticked: Set } . The same function draws every viewer's row; what differs is what the state holds.
export function rowHTML(S, item, { dm = false, mine = () => false, ticked = new Set(), link = () => null } = {}) {
  if (item.unseen) return `<li class="tr-ghost${item.now ? ' now' : ''}" data-side="unseen"${item.now ? ' aria-current="step"' : ''}><span class="tr-init"></span><span class="tr-main"><span class="tr-name">Something moves unseen</span></span></li>`;
  const { e, now, init } = item, enc = S.encounter, nm = shownName(S, e);
  const full = !!e.abil && typeof e.maxHp === 'number', numbers = full && (mine(e) || e.side === 'party');
  const word = e.health ?? (e.dead ? 'dead' : typeof e.maxHp === 'number' ? (e.hp <= 0 ? 'down' : e.hp <= e.maxHp / 2 ? 'bloodied' : 'healthy') : null);
  const dying = full && e.kind === 'pc' && !e.dead && e.hp <= 0 && e.death;
  const stable = !!(dying && e.cond?.stable);
  let hp = numbers ? `${e.hp} / ${e.maxHp}${e.tempHp > 0 ? ` +${e.tempHp}` : ''}` : WORD[word] ?? '';
  if (dying) hp = stable ? 'Stable' : `Dying ${e.death.s}\u2713 ${e.death.f}\u2717`;
  const tags = [];
  if (e.size && e.size !== 'medium') tags.push(e.size[0].toUpperCase() + e.size.slice(1));
  let sf = null; try { sf = e.pos && S.map ? under(S.map, e.pos) : null; } catch { /* no surface: say nothing */ }
  if (sf && e.pos.z - sf.z >= FT) tags.push(`\u2191 ${Math.floor((e.pos.z - sf.z) / FT) * FT} ft`);
  if (e.hidden) tags.push('Hidden from players');
  // Companions (C8): whose it is, whose turn it is, the words of its order (typed by a person: escaped below with every tag), and riding.
  if (e.bond && S.entities[e.bond.to]) {
    tags.push(`Companion of ${S.entities[e.bond.to].name}`);
    if (enc && now) tags.push(e.bond.commanded ? 'Its turn: commanded' : 'Its own turn');
    const w = typeof e.bond.commanded?.order === 'string' ? e.bond.commanded.order : typeof e.bond.standing === 'string' ? e.bond.standing : '';
    if (w) tags.push(`Order: ${w}`);
  }
  if (e.riding && S.entities[e.riding.on]) tags.push(`Riding ${S.entities[e.riding.on].name}`);
  if (item.carried) tags.push('Carries its rider: no turn of its own');
  else if (e.rider && S.entities[e.rider]) tags.push(`Carrying ${S.entities[e.rider].name}`);      // a mount that keeps its own place in the order (it is told of its rider only where the rider is sent too)
  if (full && enc && inFight(S, e.id) && e.reactionUsed) tags.push('Reaction used');
  const conds = Object.keys(e.cond || {}).filter((c) => e.cond[c] && c !== 'stable').map((c) => conditionName(c) + (e.cond[c].level ? ` ${e.cond[c].level}` : ''));
  if (e.cond?.stable && !stable) conds.push('Stable');
  const fx = (S.effects || []).filter((f) => f.source === e.id || (f.parts || []).some((p) => p.target === e.id && !p.ended)).map((f) => {
    const left = !f.until ? '' : f.until.clock !== undefined ? ` until ${clockText(f.until.clock)}` : enc ? ` ${Math.max(0, f.until.round - enc.round)}r` : '';
    return `${f.name}${f.conc ? ' (C)' : ''}${left}`;
  });
  // The table's rule for foes' health (Decision 7a): under `hidden` a player's row for a foe says nothing of its health: no bar, no word, and no greying for Down.
  const bar = barFor(e, { dm, foeHealth: S.settings?.foeHealth === 'hidden' ? 'hidden' : 'rough' });
  if (!bar.show) hp = '';
  const out = e.dead || (bar.show && (typeof e.hp === 'number' ? e.hp <= 0 : word === 'down'));
  const ctl = (dm ? `${typeof e.maxHp === 'number' ? '<button type="button" data-do="dmg" aria-label="Damage by the typed amount">\u2212</button><button type="button" data-do="heal" aria-label="Heal by the typed amount">+</button>' : ''}` +
      `${enc && now ? '<button type="button" data-do="skip">Skip turn</button>' : ''}${e.hidden ? '<button type="button" data-do="reveal">Reveal</button>' : ''}` : '') +
    (e.abil ? `<button type="button" data-do="sheet" aria-label="Sheet: ${esc(nm)}">Sheet</button>` : '');
  return `<li data-id="${esc(e.id)}" data-side="${esc(e.side)}" class="${now ? 'now' : ''} ${out ? 'out' : ''}${e.bond && !item.carried ? ' tr-comp' : ''}${item.carried ? ' tr-carried' : ''}"${now ? ' aria-current="step"' : ''}>
      ${dm && typeof e.maxHp === 'number' ? `<input type="checkbox" class="tr-tick" aria-label="Select ${esc(nm)}" ${ticked.has(e.id) ? 'checked' : ''}>` : '<span class="tr-nobox"></span>'}
      <span class="tr-init">${init !== undefined ? init : ''}</span>
      <button type="button" class="tr-main" data-do="pick"><span class="tr-name">${now ? '<b class="tr-turn" aria-hidden="true">\u25B6</b>' : ''}${esc(nm)}${now ? '<span class="sr-only"> (current turn)</span>' : ''}${dm && link(e) ? `<span class="tr-link">${rowDotHTML(link(e).state, link(e).who ?? e.name, link(e).text)}</span>` : ''}</span>
        ${bar.show ? `<span class="tr-hp"><span class="bar${bar.notch ? ' notch' : ''}"><i style="width:${bar.frac * 100}%"></i></span><span>${esc(hp)}</span></span>` : ''}
        ${tags.length || conds.length || fx.length ? `<span class="tr-tags">${[...tags, ...conds, ...fx].map((t) => `<span>${esc(t)}</span>`).join('')}</span>` : ''}</button>${ctl ? `<span class="tr-ctl">${ctl}</span>` : ''}</li>`;
}

// ctx: { root, state(), isDM(), mine(e), act(a), pick(id), openSheet(id), toast(msg), link(e) } where link(e) is the connection state of the
// player who plays e, { state, text } (the DM's tracker only; see linkdot.js), or null.
export function createTracker(ctx) {
  const { root } = ctx;
  const ticked = new Set();
  let lastKey = '';
  root.innerHTML = `<div class="tr-head"><div><strong id="tr-title"></strong><span id="tr-turn"></span><span id="tr-clock"></span></div><button type="button" id="tr-edit" aria-pressed="false" hidden>Edit</button></div>
    <div class="tr-dm" id="tr-dm" hidden><input id="tr-amt" type="number" inputmode="numeric" min="0" placeholder="Amount" aria-label="Hit Points amount">
      <button type="button" data-all="dmg">Damage ticked</button><button type="button" data-all="heal">Heal ticked</button></div>
    <ol id="tr-list"></ol>`;
  const q = (id) => root.querySelector(`#${id}`), list = q('tr-list');
  const amount = () => { const n = Math.floor(Number(q('tr-amt').value)); return n > 0 ? n : 0; };

  // Hit points after taking (sign -1) or receiving (sign 1) the typed amount. Only the DM has maxHp.
  function setHp(id, sign) {
    const e = ctx.state().entities[id], n = amount();
    if (!n) return ctx.toast('Type an amount first.');
    if (typeof e?.maxHp !== 'number') return;
    // By the rules: Temporary Hit Points first, Resistance, Concentration, death saves. Raising the dead is a DM ruling, so that alone sets Hit Points.
    if (e.dead) return ctx.act({ type: 'setHp', actor: id, hp: sign > 0 ? Math.min(e.maxHp, n) : 0 });
    ctx.act(sign < 0 ? { type: 'harm', actor: id, amount: n } : { type: 'mend', actor: id, amount: n });
  }

  function render() {
    const S = ctx.state();
    if (!S) return;
    if (root.hidden) { lastKey = ''; return; }       // the drawer shows another tab: nothing is drawn, and the turn is scrolled to when it comes back
    const dm = ctx.isDM(), enc = S.encounter, rs = trackerRows(S, { dm });
    q('tr-title').textContent = enc ? `Round ${enc.round}` : 'The party';
    q('tr-turn').textContent = turnLine(S);
    q('tr-clock').textContent = clockText(S.clock);      // the clock left the top bar: it is the header of Turns now
    q('tr-dm').hidden = !dm; q('tr-edit').hidden = !dm;      // the button shows on a phone only (style.css)
    for (const id of [...ticked]) if (!S.entities[id]) ticked.delete(id);
    const keep = list.scrollTop, opts = { dm, mine: ctx.mine, ticked, link: ctx.link };
    list.innerHTML = rs.map((r) => rowHTML(S, r, opts)).join('') || '<li class="tr-empty">Nobody yet.</li>';
    list.scrollTop = keep;
    const key = `${enc ? 'f' : 'x'}${enc?.turn}${enc?.round}`;
    if (key !== lastKey) { lastKey = key; list.querySelector('.now')?.scrollIntoView({ block: 'nearest' }); }
  }

  list.addEventListener('change', (ev) => {
    const id = ev.target.closest('li')?.dataset.id;
    if (id && ev.target.classList.contains('tr-tick')) ev.target.checked ? ticked.add(id) : ticked.delete(id);
  });
  list.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-do]'), id = b?.closest('li')?.dataset.id;
    if (!id) return;
    const w = b.dataset.do;
    if (w === 'pick') ctx.pick(id);
    else if (w === 'sheet') ctx.openSheet(id);
    else if (w === 'dmg') setHp(id, -1);
    else if (w === 'heal') setHp(id, 1);
    else if (w === 'skip') ctx.act({ type: 'endTurn', actor: id });
    else if (w === 'reveal') ctx.act({ type: 'reveal', actor: id, hidden: false });
  });
  q('tr-dm').addEventListener('click', (ev) => {
    const w = ev.target.closest('button[data-all]')?.dataset.all; if (!w) return;
    if (!ticked.size) return ctx.toast('Tick the creatures first.');
    for (const id of ticked) setHp(id, w === 'dmg' ? -1 : 1);
  });
  // On a phone the DM's controls fold away so the list has the room; Edit brings them back.
  q('tr-edit').onclick = (ev) => { const on = !root.classList.contains('edit'); root.classList.toggle('edit', on); ev.currentTarget.setAttribute('aria-pressed', String(on)); };

  return { render };
}
