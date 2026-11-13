// Controls for class features that need a choice before they are used: a mode (Divine Spark), a
// Beast form (Wild Shape), Hit Points and conditions (Lay On Hands), a slot level (Font of Magic),
// a spell (Divine Intervention) and Metamagic on a cast. Design: GitHub issue #170; the actions are
// in packages/server/README.md ("Class features").
//
// The engine decides everything. This file lists what the creature's own record and the rules
// content offer (`feats`, `e.uses`, the pack's monsters), lets the player choose, and sends the
// documented action. A refusal is shown in the panel in the engine's words and the choice is kept.
// It shows only what the view gives; a creature's controller and the DM see these controls.
import { CONTENT, SPELLS } from './shared/content/index.js';
import { targetCount } from './shared/effects.js';
import { blocked } from './shared/engine.js';
import { conditionName } from './shared/modifiers.js';

const TIME = { action: 'Action', bonus: 'Bonus Action', reaction: 'Reaction', free: 'No action' };
export const crText = (cr) => ({ 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' })[cr] ?? String(cr);
const nice = (id) => String(id).replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el[k] = v;
    else if (k in el && k !== 'list' && k !== 'form') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}

// ---------- what a feature needs, by what its record says ----------
export const formOf = (e) => (typeof e.form === 'string' ? e.form : e.form?.block) ?? null;
export const formName = (e) => { const id = formOf(e); return id ? CONTENT.monsters[id]?.name ?? nice(id) : ''; };
// Which chooser a feature has: 'modes', 'form', 'pool', 'exchange', 'free' (casts through it), or null.
export function kindOf(f) {
  if (f.action?.modes?.length) return 'modes';
  if (f.action?.form) return 'form';
  if (f.action?.pool) return 'pool';
  if (f.exchange) return 'exchange';
  if (f.freeCast) return 'free';
  return null;
}
export const needsChoice = (f) => kindOf(f) !== null;
export const metamagicKnown = (e) => (e.feats ?? []).filter((f) => f.metamagic);

// Forms the feature offers: pack Beasts within its limits (`action.form`: types, maxCr, fly). The engine checks again.
export function formsFor(f) {
  const F = f.action.form;
  return Object.values(CONTENT.monsters).filter((m) => F.types.includes(m.type) && m.cr <= F.maxCr && (F.fly || !m.speed?.fly))
    .sort((a, b) => a.cr - b.cr || a.name.localeCompare(b.name));
}
const speedText = (m) => Object.entries(m.speed ?? {}).filter(([, v]) => typeof v === 'number').map(([k, v]) => (k === 'walk' ? `${v} ft` : `${k} ${v} ft`)).join(', ');

// Spells Divine Intervention (a feature with `freeCast`) may cast: its list, up to its level, or named spells.
export function freeSpells(f) {
  const fc = f.freeCast;
  return Object.values(SPELLS).filter((sp) => (fc.spells ? fc.spells.includes(sp.id) : (sp.def.classes ?? []).includes(fc.list) && sp.level <= fc.maxLevel))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

export function initClasses({ act, state, mine, isDM, toast, arm, castSpell }) {
  const S = () => state();
  const root = h('div', { id: 'cp', hidden: true });
  document.body.append(root);
  const ui = {};                                // what the player has chosen, kept per creature and feature
  let open = null, last = null, pend = null;    // the open panel; what was just sent; Metamagic chosen for a spell not yet cast
  const mem = (key, init) => (ui[key] ??= init());

  // ---------- the panel ----------
  function close() { open = null; root.hidden = true; root.textContent = ''; document.body.classList.remove('cp-open'); }
  // spec: { key, title, note, body: [nodes], buttons: [{ label, primary, send?, run?, id }], reopen }
  function show(spec, error = '') {
    open = spec;
    const err = h('p', { class: 'cp-err', id: 'cp-err', role: 'alert', hidden: !error, text: error });
    const card = h('div', { class: 'cp-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cp-title', 'data-panel': spec.key },
      h('h2', { id: 'cp-title', text: spec.title }),
      spec.note ? h('p', { class: 'cp-note', text: spec.note }) : null,
      ...spec.body, err,
      h('div', { class: 'cp-go' },
        ...spec.buttons.map((b) => h('button', { type: 'button', class: b.primary ? 'cp-primary' : '', id: b.id, text: b.label, onclick: () => go(spec, b) })),
        h('button', { type: 'button', class: 'cp-close', id: 'cp-close', text: 'Close', onclick: close })));
    root.textContent = ''; root.append(card); root.hidden = false; document.body.classList.add('cp-open');
    card.querySelector('.cp-primary, button')?.focus({ preventScroll: true });
  }
  function go(spec, b) {
    if (b.run) return b.run();
    const action = typeof b.send === 'function' ? b.send() : b.send;
    if (!action) return;
    last = { spec, action };
    close();
    act(action);
  }
  root.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } });
  root.addEventListener('click', (ev) => { if (ev.target === root) close(); });

  const creatures = (e) => Object.values(S().entities).filter((x) => x.pos && !x.dead && !x.hidden)
    .sort((a, b) => (a.id === e.id ? -1 : b.id === e.id ? 1 : (a.side === e.side ? 0 : 1) - (b.side === e.side ? 0 : 1) || a.name.localeCompare(b.name)));
  const seen = (x) => (x.abil ? ` (${x.hp}/${x.maxHp} HP)` : '');
  const usesLeft = (e, f) => (f.uses ? e.uses?.[f.id] ?? 0 : f.action?.cost?.resource ? e.uses?.[f.action.cost.resource] ?? 0 : null);
  const usesName = (f) => (f.uses ? '' : f.action?.cost?.resource ? ` ${nice(f.action.cost.resource)}` : '');

  // ---------- Divine Spark and the like: one of several modes ----------
  function modesPanel(e, f) {
    const a = f.action, aimed = !!a.target?.creature || !!a.target?.area;
    return {
      key: `${e.id}:${f.id}`, title: f.name, note: `${[TIME[a.time], usesLeft(e, f) !== null ? `${usesLeft(e, f)}${usesName(f)} left` : ''].filter(Boolean).join(' · ')}. ${f.text}`,
      body: [h('div', { class: 'cp-modes', role: 'group', 'aria-label': `${f.name}: choose` }, ...a.modes.map((m) => h('button', { type: 'button', class: 'cp-mode', 'data-mode': m.id, text: m.name,
        onclick: () => {
          if (aimed) { close(); arm({ id: f.id, name: `${f.name} (${m.name})`, extra: { mode: m.id } }); }
          else go(null, { send: { type: 'feature', actor: e.id, feature: f.id, mode: m.id } });
        } })))],
      buttons: [],
      reopen: () => modesPanel(e, f),
    };
  }

  // ---------- Lay On Hands: a number of Hit Points and conditions to remove ----------
  function poolPanel(e, f) {
    const a = f.action, left = usesLeft(e, f), st = mem(`${e.id}:${f.id}`, () => ({ target: e.id, amount: 0, cure: [] }));
    if (!S().entities[st.target]) st.target = e.id;
    const sel = h('select', { id: 'cp-target', 'aria-label': 'Target', onchange: () => { st.target = sel.value; } },
      ...creatures(e).map((x) => h('option', { value: x.id, text: `${x.id === e.id ? 'Yourself' : x.name}${seen(x)}`, selected: x.id === st.target })));
    const amount = h('input', { id: 'cp-amount', type: 'number', min: 0, max: left, step: 1, inputMode: 'numeric', value: st.amount, 'aria-label': 'Hit Points to restore',
      oninput: () => { st.amount = Math.max(0, Math.floor(Number(amount.value) || 0)); } });
    const conds = a.cure?.conditions ?? [];
    return {
      key: `${e.id}:${f.id}`, title: f.name, note: `${left} Hit Points left in the pool. Reach 5 ft. ${TIME[a.time]}.`,
      body: [
        h('label', { class: 'cp-f' }, h('span', { text: 'Who' }), sel),
        h('label', { class: 'cp-f' }, h('span', { text: 'Hit Points to restore' }), h('div', { class: 'cp-row' }, amount, h('button', { type: 'button', id: 'cp-all', text: 'All left', onclick: () => { st.amount = left; amount.value = left; } }))),
        ...(conds.length ? [h('div', { class: 'cp-f' }, h('span', { text: `Remove a condition (${a.cure.cost} Hit Points each)` }), ...conds.map((c) => h('label', { class: 'cp-check' },
          h('input', { type: 'checkbox', 'data-cure': c, checked: st.cure.includes(c), onchange: (ev) => { st.cure = ev.target.checked ? [...st.cure, c] : st.cure.filter((x) => x !== c); } }), h('span', { text: conditionName(c) }))))] : []),
      ],
      buttons: [{ label: `Use ${f.name}`, primary: true, id: 'cp-use', send: () => ({ type: 'feature', actor: e.id, feature: f.id, target: st.target, amount: st.amount, ...(st.cure.length ? { cure: st.cure } : {}) }) }],
      reopen: () => poolPanel(e, f),
    };
  }

  // ---------- Font of Magic: points for a slot, or a slot for points ----------
  function exchangePanel(e, f) {
    const x = f.exchange, st = mem(`${e.id}:${f.id}`, () => ({ how: 'make', level: null })), levels = Object.keys(x.costs).map(Number);
    const slotsOf = (l) => `${e.slots?.[l] ?? 0}/${e.slotsMax?.[l] ?? 0}`;
    const draw = () => show(exchangePanel(e, f));
    const how = h('div', { class: 'cp-seg', role: 'group', 'aria-label': 'Exchange' },
      ...[['make', 'Make a spell slot'], ['spend', 'Spell slot into points']].map(([v, t]) => h('button', { type: 'button', 'data-how': v, 'aria-pressed': st.how === v, text: t, onclick: () => { st.how = v; st.level = null; draw(); } })));
    const opts = st.how === 'make' ? levels : Object.keys(e.slotsMax ?? {}).map(Number).filter((l) => (e.slots?.[l] ?? 0) > 0);
    const list = h('div', { class: 'cp-levels', role: 'group', 'aria-label': 'Slot level' }, ...(opts.length ? opts.map((l) => h('button', { type: 'button', 'data-level': l, 'aria-pressed': st.level === l,
      text: st.how === 'make' ? `Level ${l}: ${x.costs[l]} points (from level ${x.minLevel[l]})` : `Level ${l}: +${l} points (slots ${slotsOf(l)})`, onclick: () => { st.level = l; draw(); } })) : [h('p', { class: 'cp-note', text: 'No spell slots to spend.' })]));
    return {
      key: `${e.id}:${f.id}`, title: f.name, note: `${usesLeft(e, f)} of ${f.uses.max} Sorcery Points. Making a slot takes a Bonus Action; spending one takes no action.`,
      body: [how, list],
      buttons: [{ label: st.how === 'make' ? 'Make the slot' : 'Spend the slot', primary: true, id: 'cp-use', send: () => (st.level ? { type: 'feature', actor: e.id, feature: f.id, [st.how]: st.level } : (show(exchangePanel(e, f), 'Choose a slot level.'), null)) }],
      reopen: () => exchangePanel(e, f),
    };
  }

  // ---------- Wild Shape: choose a form, or leave it ----------
  function formPanel(e, f) {
    const F = f.action.form, now = formOf(e), forms = formsFor(f), st = mem(`${e.id}:${f.id}`, () => ({ form: null }));
    if (!forms.some((m) => m.id === st.form)) st.form = forms.find((m) => m.id !== now)?.id ?? forms[0]?.id ?? null;
    const info = h('p', { class: 'cp-note', id: 'cp-form-info' });
    const fill = () => {
      const m = CONTENT.monsters[st.form];
      info.textContent = m ? `${m.name}: Challenge ${crText(m.cr)} · ${nice(m.size)} · AC ${m.ac} · ${m.hp} HP (yours stay) · Speed ${speedText(m)}` : '';
    };
    const sel = h('select', { id: 'cp-form', 'aria-label': 'Form', onchange: () => { st.form = sel.value; fill(); } });
    for (const cr of [...new Set(forms.map((m) => m.cr))]) sel.append(h('optgroup', { label: `Challenge ${crText(cr)}` }, ...forms.filter((m) => m.cr === cr).map((m) => h('option', { value: m.id, text: m.name, selected: m.id === st.form }))));
    fill();
    const hrs = `${F.hours} hour${F.hours === 1 ? '' : 's'}`;
    return {
      key: `${e.id}:${f.id}`, title: f.name,
      note: `${usesLeft(e, f)} of ${f.uses.max} uses left. ${TIME[f.action.time]}. A form of Challenge ${crText(F.maxCr)} or lower${F.fly ? '' : ', with no Fly Speed'}, for up to ${hrs}${F.tempHp ? `, with ${F.tempHp} Temporary Hit Points` : ''}.`,
      body: [now ? h('p', { class: 'cp-form-now', id: 'cp-form-now', text: `${e.name} is in the form of a ${formName(e)}.` }) : null,
        h('label', { class: 'cp-f' }, h('span', { text: now ? 'Change to' : 'Take the form of' }), sel), info],
      buttons: [{ label: now ? 'Change form' : 'Take the form', primary: true, id: 'cp-use', send: () => (st.form ? { type: 'feature', actor: e.id, feature: f.id, form: st.form } : null) },
        ...(now ? [{ label: 'Leave the form', id: 'cp-leave', send: { type: 'feature', actor: e.id, feature: f.id } }] : [])],
      reopen: () => formPanel(e, f),
    };
  }

  // ---------- Divine Intervention: cast a spell of the list through the feature ----------
  function freePanel(e, f) {
    const list = freeSpells(f), st = mem(`${e.id}:${f.id}`, () => ({ spell: null }));
    if (!list.some((s) => s.id === st.spell)) st.spell = list[0]?.id ?? null;
    const sel = h('select', { id: 'cp-spell', 'aria-label': 'Spell', onchange: () => { st.spell = sel.value; } },
      ...list.map((sp) => h('option', { value: sp.id, text: `${sp.name} (${sp.level ? `level ${sp.level}` : 'cantrip'})`, selected: sp.id === st.spell })));
    return {
      key: `${e.id}:${f.id}`, title: f.name, note: `${usesLeft(e, f)} left. Casts a spell from the list with no spell slot. ${f.text}`,
      body: [h('label', { class: 'cp-f' }, h('span', { text: 'Spell' }), sel)],
      buttons: [{ label: 'Choose targets', primary: true, id: 'cp-use', run: () => { if (!st.spell) return; close(); setPending({ actor: e.id, spell: st.spell, extra: { via: f.id }, label: `${f.name}: no spell slot` }); castSpell(e, st.spell); } }],
      reopen: () => freePanel(e, f),
    };
  }

  // ---------- Metamagic ----------
  // Which options could apply to a spell, from the spell's own data. Only for greying a choice out; the engine
  // refuses what does not apply, and says why.
  const TRANSMUTE = ['acid', 'cold', 'fire', 'lightning', 'poison', 'thunder'];
  const AFTER_ROLL = ['empowered', 'seeking'];
  function spellFacts(sp) {
    const types = [], save = { is: false };
    const walk = (steps) => { for (const st of steps ?? []) { if (!st || typeof st !== 'object') continue; if ('save' in st) save.is = true; if ('damage' in st && st.type) types.push(st.type); for (const v of Object.values(st)) if (Array.isArray(v)) walk(v); else if (v && typeof v === 'object' && Array.isArray(v.effects)) walk(v.effects); } };
    walk(sp.def.effects);
    return { saves: save.is, types };
  }
  function reasonNot(opt, sp) {
    const id = opt.id, { saves, types } = spellFacts(sp), def = sp.def;
    if (AFTER_ROLL.includes(id)) return 'Decided after a roll: the DM applies it.';
    if ((id === 'careful' || id === 'heightened') && !saves) return 'Needs a spell that calls for saving throws.';
    if (id === 'quickened' && sp.time !== 'action') return 'Needs a spell cast as an action.';
    if (id === 'transmuted' && !types.some((t) => TRANSMUTE.includes(t))) return 'Needs a spell that deals Acid, Cold, Fire, Lightning, Poison or Thunder damage.';
    if (id === 'extended' && !/(minute|hour|day)/i.test(String(def.duration ?? ''))) return 'Needs a spell that lasts 1 minute or longer.';
    if (id === 'distant' && !(def.range === 'touch' || (typeof def.range === 'number' && def.range >= 5))) return 'Needs a spell with a range of Touch or 5 feet or more.';
    return '';
  }
  // The most options a spell may take: one, or what a feature allows while another is going (the view names a lasting effect, not its feature).
  function mostOptions(e) {
    let n = 1;
    for (const f of e.feats ?? []) {
      if (!f.metamagicMax) continue;
      const w = (e.feats ?? []).find((x) => x.id === f.metamagicMax.while);
      if (w && (S().effects ?? []).some((fx) => fx.source === e.id && fx.name === w.name)) n = Math.max(n, f.metamagicMax.n);
    }
    return n;
  }
  const spellsToCast = (e) => (e.spells ?? []).map((id) => SPELLS[id]).filter((sp) => sp && !AFTER_ROLL.includes(sp.id));

  function metaPanel(e, spellId) {
    const known = metamagicKnown(e), pool = known[0].metamagic.pool, left = e.uses?.[pool] ?? 0, most = mostOptions(e);
    const st = mem(`${e.id}:meta`, () => ({ spell: null, picked: [], careful: [], heightened: null, transmute: null }));
    if (spellId) st.spell = spellId;
    const list = spellsToCast(e);
    if (!list.some((s) => s.id === st.spell)) st.spell = list[0]?.id ?? null;
    const sp = SPELLS[st.spell];
    const draw = () => show(metaPanel(e));
    const cost = (ids) => ids.reduce((n, id) => n + (known.find((f) => f.metamagic.id === id)?.metamagic.cost ?? 0), 0);
    const spellSel = h('select', { id: 'cp-spell', 'aria-label': 'Spell', onchange: () => { st.spell = spellSel.value; st.picked = []; st.careful = []; st.heightened = null; st.transmute = null; draw(); } },
      ...list.map((s) => h('option', { value: s.id, text: `${s.name} (${s.level ? `level ${s.level}` : 'cantrip'})`, selected: s.id === st.spell })));
    const rows = known.map((f) => {
      const o = f.metamagic, why = sp ? reasonNot(o, sp) : '', on = st.picked.includes(o.id);
      const off = !!why || (!on && st.picked.length >= most);
      return h('label', { class: `cp-check cp-opt${off ? ' off' : ''}`, 'data-option': o.id },
        h('input', { type: 'checkbox', 'data-meta': o.id, checked: on, disabled: off && !on, onchange: (ev) => { st.picked = ev.target.checked ? [...st.picked, o.id] : st.picked.filter((x) => x !== o.id); draw(); } }),
        h('span', {}, h('b', { text: `${nice(o.id)} Spell` }), ` · ${o.cost} SP`, h('small', { text: why || (off ? `Only ${most} option${most === 1 ? '' : 's'} a spell.` : f.text) })));
    });
    const extra = [];
    if (st.picked.includes('careful')) {
      extra.push(h('div', { class: 'cp-f', 'data-extra': 'careful' }, h('span', { text: 'Careful Spell protects (up to your Charisma modifier, at least one)' }),
        ...creatures(e).map((x) => h('label', { class: 'cp-check' }, h('input', { type: 'checkbox', 'data-careful': x.id, checked: st.careful.includes(x.id),
          onchange: (ev) => { st.careful = ev.target.checked ? [...st.careful, x.id] : st.careful.filter((i) => i !== x.id); } }), h('span', { text: x.id === e.id ? `${x.name} (you)` : x.name })))));
    }
    if (st.picked.includes('heightened')) {
      extra.push(h('label', { class: 'cp-f', 'data-extra': 'heightened' }, h('span', { text: 'Heightened Spell: one target has Disadvantage on its first save' }),
        h('select', { id: 'cp-heightened', onchange: (ev) => { st.heightened = ev.target.value; } }, h('option', { value: '', text: 'Choose a target…' }),
          ...creatures(e).map((x) => h('option', { value: x.id, text: x.name, selected: st.heightened === x.id })))));
    }
    if (st.picked.includes('transmuted')) {
      const own = spellFacts(sp).types;
      extra.push(h('label', { class: 'cp-f', 'data-extra': 'transmuted' }, h('span', { text: 'Transmuted Spell: change the damage type to' }),
        h('select', { id: 'cp-transmute', onchange: (ev) => { st.transmute = ev.target.value; } }, h('option', { value: '', text: 'Choose a type…' }),
          ...TRANSMUTE.filter((t) => !own.includes(t)).map((t) => h('option', { value: t, text: nice(t), selected: st.transmute === t })))));
    }
    const total = cost(st.picked);
    const build = () => ({ metamagic: st.picked, ...(st.picked.includes('careful') ? { careful: st.careful } : {}), ...(st.picked.includes('heightened') && st.heightened ? { heightened: st.heightened } : {}),
      ...(st.picked.includes('transmuted') && st.transmute ? { transmute: st.transmute } : {}) });
    return {
      key: `${e.id}:meta`, title: 'Cast with Metamagic',
      note: `${left} Sorcery Points left${total ? `; this costs ${total}, leaving ${left - total}` : ''}. Up to ${most} option${most === 1 ? '' : 's'} a spell.`,
      body: [h('label', { class: 'cp-f' }, h('span', { text: 'Spell' }), spellSel), h('div', { class: 'cp-f' }, h('span', { text: 'Options you know' }), ...rows), ...extra],
      buttons: [{ label: sp?.aim === 'self' || sp?.aim === 'none' ? `Cast ${sp?.name ?? ''}` : 'Choose targets', primary: true, id: 'cp-use', run: () => {
        if (!sp) return;
        close(); setPending({ actor: e.id, spell: sp.id, extra: build(), twinned: st.picked.includes('twinned'), label: st.picked.length ? `${st.picked.map(nice).join(' + ')}: ${total} SP` : '' });
        castSpell(e, sp.id);
      } }],
      reopen: () => metaPanel(e),
    };
  }

  // ---------- what a cast carries ----------
  function setPending(p) { pend = p; }
  // A cast is sent with what was chosen for it: Metamagic, or the feature that casts it.
  function decorate(action) {
    if (action.type !== 'cast' || !pend || pend.actor !== action.actor || pend.spell !== action.spell) return action;
    const out = { ...action, ...structuredClone(pend.extra) };
    last = { action: out, spec: null, pend };
    return out;
  }
  const chosenFor = (e, spellId) => (pend && pend.actor === e.id && pend.spell === spellId ? pend : null);

  // ---------- the buttons of the action bar ----------
  function buttons(e) {
    const out = [];
    const st = S();
    for (const f of e.feats ?? []) {
      const kind = kindOf(f);
      if (!kind || !f.action && kind !== 'exchange' && kind !== 'free') continue;
      const a = f.action, time = a ? (a.time === 'free' ? null : a.time) : null, left = usesLeft(e, f);
      let label = f.name, sub = '', why = '', cls = a && (a.time === 'bonus' || a.time === 'free') ? 'bonus' : '', panel = () => null;
      if (kind === 'modes') { sub = [TIME[a.time], left === null ? '' : `${left}${usesName(f)} left`].filter(Boolean).join(' · '); panel = () => modesPanel(e, f); }
      else if (kind === 'pool') { sub = [TIME[a.time], `${left} HP left`].join(' · '); panel = () => poolPanel(e, f); }
      else if (kind === 'exchange') { sub = `${left} of ${f.uses.max} points`; panel = () => exchangePanel(e, f); cls = ''; }
      else if (kind === 'free') { label = f.name; sub = `Cast free · ${left} left`; panel = () => freePanel(e, f); }
      else if (kind === 'form') {
        const now = formOf(e);
        label = now ? `${f.name}: ${formName(e)}` : f.name; sub = now ? `${TIME[a.time]} · leave or change` : `${TIME[a.time]} · ${left} left`; cls = `${cls} ${now ? 'armed' : ''}`; panel = () => formPanel(e, f);
      }
      if (time) why = blocked(st, e, time) || '';
      if (kind === 'modes' || kind === 'pool') { const cost = a.cost?.n ?? 1; if (left !== null && !a.pool && left < cost) why ||= `${e.name} has no uses of ${f.name} left.`; if (a.pool && left < 1) why ||= `${f.name} has no Hit Points left.`; }
      out.push({ label, sub, cls, why: kind === 'exchange' || kind === 'free' ? '' : why, onClick: () => show(panel()), feature: f.id });
    }
    if (metamagicKnown(e).length && spellsToCast(e).length) {
      const known = metamagicKnown(e), pool = known[0].metamagic.pool, left = e.uses?.[pool] ?? 0;
      const here = pend && pend.actor === e.id;
      out.push({ label: 'Metamagic', sub: `${left} Sorcery Points${here && pend.label ? ` · ${pend.label}` : ''}`, cls: here && pend.extra.metamagic?.length ? 'armed' : '', why: '', feature: 'metamagic', onClick: () => show(metaPanel(e, here ? pend.spell : null)) });
    }
    return out;
  }

  // ---------- the sheet ----------
  const pickable = (f) => kindOf(f) !== null;
  function sheetBanner(e) {
    const now = formOf(e);
    if (!now) return '';
    const f = (e.feats ?? []).find((x) => kindOf(x) === 'form');
    return `<p class="note cp-form-banner" id="sheet-form">In the form of a ${formName(e).replace(/[<>&"]/g, '')}. Hit Points, mental scores, features and proficiencies are the druid's own; the rest is the Beast's.${f && mine(e) ? ' <button type="button" data-leave-form="' + f.id + '">Leave the form</button>' : ''}</p>`;
  }
  function bindSheet(rootEl, e) {
    if (!mine(e)) return;
    for (const b of rootEl.querySelectorAll('[data-feat-use]')) {
      const f = (e.feats ?? []).find((x) => x.id === b.dataset.featUse);
      if (f) b.onclick = () => show(({ modes: modesPanel, form: formPanel, pool: poolPanel, exchange: exchangePanel, free: freePanel })[kindOf(f)](e, f));
    }
    for (const b of rootEl.querySelectorAll('[data-meta-open]')) b.onclick = () => show(metaPanel(e));
    for (const b of rootEl.querySelectorAll('[data-leave-form]')) b.onclick = () => act({ type: 'feature', actor: e.id, feature: b.dataset.leaveForm });
  }

  return {
    buttons, decorate, bindSheet, sheetBanner, pickable, chosenFor,
    // A spell armed with Metamagic that needs more targets (Twinned): the most it may take now.
    most(e, sp, n) { return chosenFor(e, sp.id)?.twinned ? targetCount(sp.def, e.level, sp.level + 1) : n; },
    hint(e, spellId) { const p = chosenFor(e, spellId); return p?.label ? ` · ${p.label}` : ''; },
    // Called on every redraw: a choice for a spell that is no longer armed is forgotten.
    sync(mode) {
      if (!S()) return close();
      last = null;
      if (pend && !(mode?.kind === 'spell' && mode.id === pend.spell)) pend = null;
      if (open && !S().entities[open.key.split(':')[0]]) close();
    },
    // The engine refused something we sent: say why in the panel it came from, with the choice kept.
    refused(msg) {
      if (!last) return false;
      const { spec, pend: p } = last; last = null;
      if (p) { pend = p; show(metaPanel(S().entities[p.actor], p.spell), msg); return true; }
      if (!spec?.reopen) return false;
      show(spec.reopen(), msg); return true;
    },
    isOpen: () => !!open,
    close,
  };
}
