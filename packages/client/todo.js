// The DM's to-do tray: a card for every note the engine handed to the DM (a `manual` event) and for every creature that has
// abilities the DM runs (Spellcasting, Legendary Actions), each with the nearest tools and Done. Design: docs/specs/dm-todo.md.
//
//   const TD = initTodo({ mount, state, isDM, act, toast, place });
//   TD.sync()      after every update: draws the cards, says once when a new one arrives
//   TD.count()     how many cards are open: the DM's badge counts them
//   TD.waiting()   for a player: draws the "waiting for the DM" line for what their own creatures used
//
// The cards are in the game state (`state.todo`, the DM's alone: rules/src/todo.js), so a reload, a second tab and an undo all
// find them as they were. This module only draws them and sends actions; it keeps one thing in memory, which tool is open.
// It is its own module with one mount point, so the one-token menu (docs/specs/one-token-menu.md, M6) can move it to "Waiting for you".
import { CONTENT } from './shared/content/index.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TYPES = ['untyped', 'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];
const TOOLS = [['place', 'Place'], ['harm', 'Damage'], ['mend', 'Heal'], ['cond', 'Condition'], ['ac', 'AC']];

export function initTodo({ mount, state, isDM, act, toast, place, waitLine = null }) {
  let edit = null;                 // { n, id, tool }: the tool open under a creature of a card
  let sig = null, seen = null;     // what was drawn last; the newest card number the DM has been told of

  const S = () => state();
  const open = () => {
    const s = S();
    return (Array.isArray(s?.todo?.cards) ? s.todo.cards : []).filter((c) => c.kind !== 'run' || (s.entities[c.actor] && !s.entities[c.actor].dead));
  };
  const cond = (e) => Object.keys(e.cond ?? {});
  const stat = (e) => `HP ${e.hp}/${e.maxHp}${e.tempHp ? ` (+${e.tempHp})` : ''} · AC ${e.ac}${cond(e).length ? ` · ${cond(e).map((c) => CONTENT.conditions[c]?.name ?? c).join(', ')}` : ''}${e.dead ? ' · dead' : ''}`;

  function creature(c, e) {
    const key = (t) => edit && edit.n === c.n && edit.id === e.id && edit.tool === t;
    const tools = TOOLS.map(([t, label]) => `<button type="button" class="todo-tool${key(t) ? ' on' : ''}" data-tool="${t}" aria-pressed="${key(t)}">${label}</button>`).join('');
    let form = '';
    if (edit && edit.n === c.n && edit.id === e.id) {
      const t = edit.tool;
      if (t === 'harm') form = `<input type="number" inputmode="numeric" min="1" max="9999" placeholder="Damage" aria-label="Damage" data-f="n"><select data-f="type" aria-label="Damage type">${TYPES.map((x) => `<option>${x}</option>`).join('')}</select><button type="button" data-go="harm">Damage</button>`;
      else if (t === 'mend') form = `<input type="number" inputmode="numeric" min="1" max="9999" placeholder="Hit Points" aria-label="Hit Points to heal" data-f="n"><button type="button" data-go="mend">Heal</button>`;
      else if (t === 'cond') form = `<select data-f="cond" aria-label="Condition">${Object.values(CONTENT.conditions).map((x) => `<option value="${x.id}">${esc(x.name)}${e.cond?.[x.id] ? ' (on)' : ''}</option>`).join('')}</select><button type="button" data-go="condOn">Add</button><button type="button" data-go="condOff">Remove</button>`;
      else if (t === 'ac') form = `<button type="button" data-go="acDown" aria-label="One less">−1</button><input type="number" inputmode="numeric" min="0" max="40" value="${e.ac}" aria-label="Armor Class" data-f="ac"><button type="button" data-go="acUp" aria-label="One more">+1</button><button type="button" data-go="acSet">Set AC</button>`;
    }
    return `<div class="todo-cr" data-id="${esc(e.id)}"><div class="todo-line"><b>${esc(e.name)}</b><span>${esc(stat(e))}</span></div><div class="todo-tools">${tools}</div>${form ? `<div class="todo-form">${form}</div>` : ''}</div>`;
  }

  function card(c) {
    const s = S();
    // The creatures the words name come first, the actor last: the tool for the target sits under the note, not under the caster.
    const named = (c.ids ?? []).filter((id) => id !== c.actor), ids = [...new Set([...named.slice(0, 3), c.actor, ...named.slice(3)])].filter((id) => typeof id === 'string' && s.entities[id]).slice(0, 4);
    const head = c.kind === 'run'
      ? `<b>You run: ${c.runs.map((r) => esc(r.name)).join(', ')}</b><span class="todo-who">${esc(c.name)}${c.why === 'turn' ? ' · its turn' : ' · added'}</span>`
      : `<b>${esc(c.name || 'A note for you')}</b>${c.actor && s.entities[c.actor] ? `<span class="todo-who">${esc(s.entities[c.actor].name)}</span>` : ''}${c.count > 1 ? `<span class="todo-count">×${c.count}</span>` : ''}`;
    const body = c.kind === 'run'
      ? c.runs.map((r) => `<details><summary>${esc(r.name)}</summary><p class="note">${esc(r.text)}</p></details>`).join('') + '<p class="note">The engine does not run these. Nothing is rolled or applied for you.</p>'
      : `<p class="todo-text">${esc(c.text)}</p>`;
    return `<article class="todo-card" data-n="${c.n}" data-kind="${c.kind}"><header>${head}</header>${body}${ids.map((id) => creature(c, s.entities[id])).join('')}<div class="todo-foot"><button type="button" class="todo-done" data-done="${c.n}">Done</button></div></article>`;
  }

  function sync() {
    if (!mount) return;
    const s = S(), cards = isDM() && s ? open() : [];
    // What was told of before: nothing on the first look at a table (a reload finds its cards waiting; it need not shout), then each new card once.
    const top = cards.reduce((m, c) => Math.max(m, c.up ?? c.n), 0);
    if (seen === null) seen = top;
    else if (top > seen) {
      const fresh = cards.filter((c) => (c.up ?? c.n) > seen);
      seen = top;
      if (fresh.length && document.body.classList.contains('drawer-open') === false) toast(fresh.length === 1 ? `To do: ${fresh[0].kind === 'run' ? `you run ${fresh[0].name}'s abilities` : fresh[0].name || 'a note'}` : `${fresh.length} new things to do`, true);
    }
    const next = JSON.stringify([cards, cards.flatMap((c) => [c.actor, ...(c.ids ?? [])]).filter((id) => s?.entities[id]).map((id) => { const e = s.entities[id]; return [id, e.name, e.hp, e.maxHp, e.tempHp, e.ac, e.dead, cond(e)]; }), edit]);
    mount.hidden = !cards.length;
    if (next === sig) return;
    sig = next;
    if (edit && !cards.some((c) => c.n === edit.n)) edit = null;
    mount.innerHTML = cards.length ? `<h3>To do <span class="todo-n">${cards.length}</span></h3><p class="note">What the engine left for you to apply. Done takes a card away.</p>${[...cards].reverse().map(card).join('')}${cards.length > 1 ? '<div class="row"><button type="button" class="quiet" data-done="all">Done with all</button></div>' : ''}` : '';
    // A tool just opened is brought into view: on a phone the dock covers the foot of the menu.
    if (edit) mount.querySelector('.todo-form')?.scrollIntoView({ block: 'nearest' });
  }

  mount?.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b || !mount.contains(b)) return;
    if (b.dataset.done) return act({ type: 'todoDone', ...(b.dataset.done === 'all' ? { all: true } : { n: Number(b.dataset.done) }) });
    const cardEl = b.closest('.todo-card'), crEl = b.closest('.todo-cr');
    if (!cardEl || !crEl) return;
    const n = Number(cardEl.dataset.n), id = crEl.dataset.id;
    if (b.dataset.tool) {
      if (b.dataset.tool === 'place') { place(id); return; }
      edit = edit && edit.n === n && edit.id === id && edit.tool === b.dataset.tool ? null : { n, id, tool: b.dataset.tool };
      sig = null; sync();
      return;
    }
    const f = (k) => crEl.querySelector(`[data-f="${k}"]`)?.value;
    const num = () => Number.parseInt(f('n'), 10);
    const done = () => { edit = null; sig = null; };
    switch (b.dataset.go) {
      case 'harm': if (!(num() > 0)) return toast('Type how much damage.'); act({ type: 'harm', actor: id, amount: num(), ...(f('type') && f('type') !== 'untyped' ? { dtype: f('type') } : {}) }); return done();
      case 'mend': if (!(num() > 0)) return toast('Type how many Hit Points.'); act({ type: 'mend', actor: id, amount: num() }); return done();
      case 'condOn': act({ type: 'condition', actor: id, condition: f('cond'), on: true }); return done();
      case 'condOff': act({ type: 'condition', actor: id, condition: f('cond'), on: false }); return done();
      case 'acSet': act({ type: 'setAc', actor: id, ac: Number.parseInt(f('ac'), 10) }); return done();
      case 'acUp': act({ type: 'setAc', actor: id, ac: (S().entities[id]?.ac ?? 0) + 1 }); return done();
      case 'acDown': act({ type: 'setAc', actor: id, ac: (S().entities[id]?.ac ?? 0) - 1 }); return done();
    }
  });

  // A player's own: what their creatures used that waits on the DM, by name only (rules/src/view.js, viewWaiting).
  function waiting() {
    if (!waitLine) return;
    const w = !isDM() && Array.isArray(S()?.waiting) ? S().waiting : [];
    waitLine.hidden = !w.length;
    const text = w.map((x) => `${S().entities[x.id]?.name ?? 'Someone'}'s ${x.name}`).join(', ');
    waitLine.textContent = w.length ? `${text}: waiting for the DM` : '';
  }

  return { sync, count: () => (isDM() ? open().length : 0), waiting };
}
