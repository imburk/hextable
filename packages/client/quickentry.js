// Quick entry: the DM types a character in from a paper sheet, or corrects one already at the table.
// This file only builds the form and sends `addCharacter`, `editCharacter` and `remove` through `act`.
// Every number is checked by lintRecord (the same check the engine runs), so nothing here decides a rule.
import { ABILITIES, DAMAGE_TYPES, SIZES, SKILLS, lintRecord } from './shared/content/schema.js';
import { SPELLS } from './shared/content/index.js';
import { initBuild } from './buildsheet.js';
import { initImport } from './importfg.js';

const ABIL_NAME = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const nice = (id) => cap(id.replace(/-/g, ' '));
const modOf = (score) => Math.floor((score - 10) / 2);
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
const num = (s) => (String(s ?? '').trim() === '' ? NaN : Number(s));
const kebab = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const profFor = (level) => (Number.isInteger(level) && level >= 1 && level <= 20 ? 2 + Math.floor((level - 1) / 4) : 2);
const DEFAULT_COLOR = '#3a7d44';
// Parts of a record this form has no field for. They are kept as they were when a sheet is edited.
const KEEP = ['speeds', 'hover', 'resist', 'vuln', 'immune'];

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k in e && k !== 'list') e[k] = v; else e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...kids.filter((x) => x != null));
  return e;
}

// ---------- the form's own copy of a sheet: text and booleans, so half-typed input is allowed ----------
function blank() {
  return {
    name: '', cls: '', level: '1', size: 'medium', ac: '10', hp: '', speed: '30', prof: '2', profTouched: false,
    abil: Object.fromEntries(ABILITIES.map((a) => [a, '10'])), saveProf: [], skills: [], expertise: [], thieves: false, tools: [],
    attacks: [], castAbil: '', spells: [], slots: {}, secondWind: '', sneak: '', extraAttack: '', gear: '', color: DEFAULT_COLOR, extra: {},
  };
}
function fromRecord(r) {
  const m = blank(), s = (v) => (v === undefined || v === null ? '' : String(v));
  Object.assign(m, { name: s(r.name), cls: s(r.cls), level: s(r.level), size: r.size ?? 'medium', ac: s(r.ac), hp: s(r.hp), speed: s(r.speed), prof: s(r.prof), profTouched: true });
  m.abil = Object.fromEntries(ABILITIES.map((a) => [a, s(r.abil?.[a])]));
  m.saveProf = [...(r.saveProf ?? [])]; m.skills = [...(r.skills ?? [])]; m.expertise = [...(r.expertise ?? [])];
  m.thieves = (r.tools ?? []).includes('thieves-tools'); m.tools = (r.tools ?? []).filter((t) => t !== 'thieves-tools');
  m.attacks = (r.attacks ?? []).map((a) => ({ name: s(a.name), type: a.type ?? 'melee', bonus: s(a.bonus), damage: s(a.damage), dtype: a.dtype ?? 'slashing',
    reach: s(a.reach ?? 5), near: s(a.range?.[0] ?? 80), far: s(a.range?.[1] ?? 320), finesse: !!a.finesse }));
  m.castAbil = r.castAbil ?? ''; m.spells = [...(r.spells ?? [])];
  m.slots = Object.fromEntries(Object.entries(r.slots ?? {}).map(([l, n]) => [l, s(n)]));
  m.secondWind = s(r.features?.secondWind); m.sneak = s(r.features?.sneak); m.extraAttack = s(r.features?.extraAttack);
  m.gear = (r.gear ?? []).join('\n'); m.color = r.look?.color ?? DEFAULT_COLOR;
  m.extra = Object.fromEntries(KEEP.filter((k) => r[k] !== undefined).map((k) => [k, structuredClone(r[k])]));
  return m;
}
// Ids come from the names; a repeated name gets -2, -3 and so on.
function attackIds(attacks) {
  const used = new Set();
  return attacks.map((a) => {
    const base = kebab(a.name) || 'attack'; let id = base, n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id); return id;
  });
}
function toRecord(m) {
  const r = { name: m.name.trim() };
  if (m.cls.trim()) r.cls = m.cls.trim();
  Object.assign(r, { level: num(m.level), size: m.size, ac: num(m.ac), hp: num(m.hp), speed: num(m.speed), prof: num(m.prof) });
  r.abil = Object.fromEntries(ABILITIES.map((a) => [a, num(m.abil[a])]));
  r.saveProf = ABILITIES.filter((a) => m.saveProf.includes(a));
  r.skills = Object.keys(SKILLS).filter((k) => m.skills.includes(k));
  r.expertise = r.skills.filter((k) => m.expertise.includes(k));
  r.tools = [...(m.thieves ? ['thieves-tools'] : []), ...m.tools];
  const ids = attackIds(m.attacks);
  r.attacks = m.attacks.map((a, i) => ({
    id: ids[i], name: a.name.trim(), type: a.type, bonus: num(a.bonus), damage: a.damage.trim(), dtype: a.dtype,
    ...(a.type === 'melee' ? { reach: num(a.reach) } : { range: [num(a.near), num(a.far)] }),
    ...(a.finesse ? { finesse: true } : {}),
  }));
  if (m.castAbil) r.castAbil = m.castAbil;
  if (m.spells.length) r.spells = m.spells.filter((id) => SPELLS[id]);
  const slots = Object.entries(m.slots).filter(([, v]) => String(v).trim() !== '');
  if (slots.length) r.slots = Object.fromEntries(slots.map(([l, v]) => [l, num(v)]));
  const features = {};
  if (m.secondWind.trim() !== '') features.secondWind = num(m.secondWind);
  if (m.sneak.trim() !== '') features.sneak = m.sneak.trim();
  if (String(m.extraAttack ?? '').trim() !== '') features.extraAttack = num(m.extraAttack);
  if (Object.keys(features).length) r.features = features;
  const gear = m.gear.split('\n').map((g) => g.trim()).filter(Boolean);
  if (gear.length) r.gear = gear;
  Object.assign(r, structuredClone(m.extra));
  r.look = { color: m.color };
  return r;
}
// A creature in the game back to a record: only what lintRecord lists. Spent slots and lost hit points are not part of a sheet.
function recordOf(e) {
  const r = {};
  for (const k of ['name', 'cls', 'level', 'size', 'ac', 'speed', 'prof', 'abil', 'saveProf', 'skills', 'expertise', 'tools', 'castAbil', 'gear', ...KEEP, 'look']) if (e[k] !== undefined) r[k] = structuredClone(e[k]);
  r.hp = e.maxHp ?? e.hp;
  r.attacks = (e.attacks ?? []).map((a) => Object.fromEntries(['id', 'name', 'type', 'bonus', 'damage', 'dtype', 'reach', 'range', 'finesse'].filter((k) => a[k] !== undefined).map((k) => [k, structuredClone(a[k])])));
  if (e.spells?.length) r.spells = e.spells.filter((id) => SPELLS[id]);
  if (e.slotsMax && Object.keys(e.slotsMax).length) r.slots = { ...e.slotsMax };
  const f = {};
  if (e.features?.secondWind !== undefined) f.secondWind = e.features.secondWind;
  if (e.features?.sneak !== undefined) f.sneak = e.features.sneak;
  if (e.features?.extraAttack !== undefined) f.extraAttack = e.features.extraAttack;
  if (Object.keys(f).length) r.features = f;
  return r;
}

// ---------- the screen ----------
export function initQuickEntry({ act, toast, getState, getSelected }) {
  let m = blank(), editing = null, pending = null, sureTimer = null;
  const refs = {};
  const q = (id) => refs[id];

  // The buttons in the DM panel.
  const host = document.getElementById('dm-qe');
  const bAdd = el('button', { type: 'button', id: 'qe-add', text: 'Add a character' });
  const bEdit = el('button', { type: 'button', id: 'qe-edit', text: 'Edit sheet', disabled: true });
  const bRemove = el('button', { type: 'button', id: 'qe-remove', text: 'Remove selected', disabled: true });
  const sure = el('div', { class: 'qe-sure', id: 'qe-sure', hidden: true });
  const bBuild = el('button', { type: 'button', id: 'qb-add', text: 'Build from class' });
  const bLevel = el('button', { type: 'button', id: 'qb-levelup', text: 'Level up', disabled: true });
  const IM = initImport({ act, toast, getState, getSelected });      // a Fantasy Grounds character, read and shown before it is set up
  host.append(el('h3', { text: 'Characters' }), el('div', { class: 'row' }, bAdd, bBuild, IM.button(), bEdit, bLevel, bRemove), sure);
  const B = initBuild({ act, toast, getState, getSelected, importButton: () => IM.button() });
  bBuild.onclick = () => B.open({ mode: 'add' });
  bLevel.onclick = () => { const e = getState()?.entities[getSelected()]; if (e?.sheet) B.open({ mode: 'levelup', entity: e }); };

  // The form, in a panel of its own.
  const panel = el('aside', { id: 'qe', class: 'panel qe', hidden: true, 'aria-label': 'Quick entry' });
  document.body.append(panel);

  function field(label, id, key, opts = {}) {
    const input = el('input', { id: `qe-${id}`, type: 'text', value: opts.get ? opts.get() : m[key], inputMode: opts.mode ?? 'numeric', autocomplete: 'off', maxLength: opts.max, placeholder: opts.ph, spellcheck: false, autocapitalize: opts.cap });
    input.oninput = () => { if (opts.set) opts.set(input.value); else m[key] = input.value; if (key === 'level' && !m.profTouched) { m.prof = String(profFor(num(m.level))); refs.prof.value = m.prof; } changed(); };
    refs[id] = input;
    return el('label', { class: `qe-f ${opts.cls ?? ''}` }, el('span', { text: label }), input);
  }
  function select(label, id, options, get, set, cls = '') {
    const s = el('select', { id: `qe-${id}` }, ...options.map(([v, t]) => el('option', { value: v, text: t })));
    s.value = get(); s.onchange = () => { set(s.value); changed(); };
    refs[id] = s;
    return el('label', { class: `qe-f ${cls}` }, el('span', { text: label }), s);
  }
  function tick(label, checked, set, id) {
    const c = el('input', { type: 'checkbox', checked, id });
    c.onchange = () => { set(c.checked); changed(); };
    return el('label', { class: 'check qe-tick' }, c, el('span', { text: label }));
  }
  const toggle = (list, v, on) => { const i = list.indexOf(v); if (on && i < 0) list.push(v); if (!on && i >= 0) list.splice(i, 1); };

  function build() {
    panel.textContent = '';
    for (const k of Object.keys(refs)) delete refs[k];
    const head = el('div', { class: 'qe-head' }, el('h2', { text: editing ? `Edit ${editing.name}` : 'Add a character' }), el('button', { type: 'button', class: 'close', id: 'qe-close', text: 'Close', onclick: close }),
      ...(editing ? [] : [el('button', { type: 'button', id: 'qe-to-build', text: 'Build from class and level instead', onclick: () => { close(); B.open({ mode: 'add' }); } })]));
    // Who
    const who = el('section', {}, el('h3', { text: 'Who' }), el('div', { class: 'qe-grid qe-2' },
      field('Name', 'name', 'name', { mode: 'text', max: 40, cap: 'words', cls: 'wide' }), field('Class', 'cls', 'cls', { mode: 'text', max: 40, cap: 'words' }),
      field('Level', 'level', 'level', { max: 2 }), select('Size', 'size', SIZES.map((s) => [s, cap(s)]), () => m.size, (v) => (m.size = v)),
      field('Armor Class', 'ac', 'ac', { max: 2 }), field('Hit Points', 'hp', 'hp', { max: 3 }),
      field('Speed (ft)', 'speed', 'speed', { max: 3 }), field('Proficiency Bonus', 'prof', 'prof', { max: 1, set: (v) => { m.prof = v; m.profTouched = true; } }),
      el('label', { class: 'qe-f' }, el('span', { text: 'Colour' }), (refs.color = el('input', { type: 'color', id: 'qe-color', value: m.color, oninput: (ev) => { m.color = ev.target.value; changed(); } })))));
    // Abilities and saves
    const ab = el('div', { class: 'qe-abil' });
    for (const a of ABILITIES) {
      const out = el('output', { class: 'qe-mod', id: `qe-mod-${a}` });
      refs[`mod-${a}`] = out;
      ab.append(el('div', { class: 'qe-ab' }, field(a.toUpperCase(), `abil-${a}`, a, { get: () => m.abil[a], set: (v) => (m.abil[a] = v), max: 2, cls: 'qe-ab-in' }), out,
        tick('Save', m.saveProf.includes(a), (on) => toggle(m.saveProf, a, on), `qe-save-${a}`)));
    }
    const abilities = el('section', {}, el('h3', { text: 'Ability scores and saving throws' }), ab);
    // Skills and tools
    const sk = el('div', { class: 'qe-skills' });
    for (const k of Object.keys(SKILLS)) {
      const ex = tick('Expertise', m.expertise.includes(k), (on) => toggle(m.expertise, k, on), `qe-exp-${k}`);
      ex.hidden = !m.skills.includes(k); ex.classList.add('qe-exp'); refs[`exp-${k}`] = ex;
      sk.append(el('div', { class: 'qe-sk' }, tick(`${nice(k)} (${SKILLS[k].toUpperCase()})`, m.skills.includes(k), (on) => { toggle(m.skills, k, on); if (!on) toggle(m.expertise, k, false); ex.hidden = !on; if (!on) ex.querySelector('input').checked = false; }, `qe-skill-${k}`), ex));
    }
    const skills = el('section', {}, el('h3', { text: 'Skills' }), sk, el('h3', { text: 'Tools' }), tick("Thieves' Tools", m.thieves, (on) => (m.thieves = on), 'qe-thieves-tools'));
    // Attacks
    const atk = el('div', { id: 'qe-attacks' });
    const drawAttacks = () => {
      atk.textContent = '';
      const ids = attackIds(m.attacks);
      m.attacks.forEach((a, i) => {
        const inp = (label, key, opts = {}) => el('label', { class: `qe-f ${opts.cls ?? ''}` }, el('span', { text: label }), el('input', { type: 'text', value: a[key], inputMode: opts.mode ?? 'numeric', autocomplete: 'off', spellcheck: false, maxLength: opts.max, class: `qe-atk-${key}`, oninput: (ev) => { a[key] = ev.target.value; if (key === 'name') idNote.textContent = `id: ${attackIds(m.attacks)[i]}`; changed(); } }));
        const idNote = el('small', { class: 'note', text: `id: ${ids[i]}` });
        const typeSel = el('select', { class: 'qe-atk-type', onchange: (ev) => { a.type = ev.target.value; drawAttacks(); changed(); } }, el('option', { value: 'melee', text: 'Melee' }), el('option', { value: 'ranged', text: 'Ranged' }));
        typeSel.value = a.type;
        const dt = el('select', { class: 'qe-atk-dtype', onchange: (ev) => { a.dtype = ev.target.value; changed(); } }, ...DAMAGE_TYPES.map((d) => el('option', { value: d, text: cap(d) })));
        dt.value = a.dtype;
        atk.append(el('div', { class: 'qe-atk' },
          el('div', { class: 'qe-grid qe-2' },
            inp('Attack name', 'name', { mode: 'text', max: 40, cls: 'wide' }),
            el('label', { class: 'qe-f' }, el('span', { text: 'Kind' }), typeSel), inp('Bonus to hit', 'bonus', { mode: 'text', max: 3 }),
            inp('Damage dice', 'damage', { mode: 'text', max: 12 }), el('label', { class: 'qe-f' }, el('span', { text: 'Damage type' }), dt),
            ...(a.type === 'melee' ? [inp('Reach (ft)', 'reach', { max: 2 })] : [inp('Normal range (ft)', 'near', { max: 4 }), inp('Long range (ft)', 'far', { max: 4 })])),
          el('div', { class: 'row qe-atk-foot' }, tick('Finesse', a.finesse, (on) => (a.finesse = on), undefined), idNote, el('button', { type: 'button', class: 'qe-remove-atk', text: 'Remove attack', onclick: () => { m.attacks.splice(i, 1); drawAttacks(); changed(); } }))));
      });
    };
    drawAttacks();
    const addAtk = el('button', { type: 'button', id: 'qe-add-attack', text: 'Add an attack', onclick: () => {
      if (m.attacks.length >= 12) return toast('Twelve attacks at most.');
      m.attacks.push({ name: '', type: 'melee', bonus: '0', damage: '', dtype: 'slashing', reach: '5', near: '80', far: '320', finesse: false }); drawAttacks(); changed();
      atk.lastElementChild?.querySelector('input')?.focus();
    } });
    const attacks = el('section', {}, el('h3', { text: 'Attacks' }), atk, addAtk);
    // Spells
    const byLevel = {};
    for (const sp of Object.values(SPELLS)) (byLevel[sp.level] ??= []).push(sp);
    const sp = el('div', { class: 'qe-spells' });
    for (const lv of Object.keys(byLevel).map(Number).sort((a, b) => a - b)) {
      sp.append(el('h4', { text: lv === 0 ? 'Cantrips' : `Level ${lv}` }), el('div', { class: 'qe-ticks' }, ...byLevel[lv].sort((a, b) => a.name.localeCompare(b.name)).map((s) => tick(s.name, m.spells.includes(s.id), (on) => toggle(m.spells, s.id, on), `qe-spell-${s.id}`))));
    }
    const slots = el('div', { class: 'qe-slots' });
    for (let l = 1; l <= 9; l++) slots.append(field(`Level ${l}`, `slot-${l}`, `slot${l}`, { get: () => m.slots[l] ?? '', set: (v) => { if (v.trim() === '') delete m.slots[l]; else m.slots[l] = v; }, max: 1 }));
    const magic = el('section', {}, el('h3', { text: 'Spellcasting' }),
      select('Spellcasting ability', 'castAbil', [['', 'None'], ...ABILITIES.map((a) => [a, ABIL_NAME[a]])], () => m.castAbil, (v) => (m.castAbil = v)),
      sp, el('h3', { text: 'Spell slots' }), slots);
    // Features, gear
    const gear = el('textarea', { id: 'qe-gear', rows: 4, value: m.gear, placeholder: 'One item per line', autocomplete: 'off', oninput: (ev) => { m.gear = ev.target.value; changed(); } });
    const more = el('section', {}, el('h3', { text: 'Features' }), el('div', { class: 'qe-grid qe-2' },
      field('Second Wind uses (0 to 10)', 'secondWind', 'secondWind', { max: 2 }), field('Sneak Attack dice (like 3d6)', 'sneak', 'sneak', { mode: 'text', max: 8 }),
      field('Extra Attack (1 to 3 more)', 'extraAttack', 'extraAttack', { max: 1 })),
      el('h3', { text: 'Gear' }), gear);
    // Copy and paste
    const text = el('textarea', { id: 'qe-text', rows: 6, spellcheck: false, autocomplete: 'off', placeholder: 'The character as text appears here. Paste a saved character here and press Paste from text.' });
    refs.text = text; refs.textMsg = el('p', { class: 'qe-problems', id: 'qe-text-msg', hidden: true });
    const move = el('section', {}, el('h3', { text: 'Move this character' }), el('p', { class: 'note', text: 'Copy the sheet as text to keep it in a file or take it to another table. Paste it back here to fill the form.' }),
      el('div', { class: 'row' }, el('button', { type: 'button', id: 'qe-copy', text: 'Copy as text', onclick: copyText }), el('button', { type: 'button', id: 'qe-paste', text: 'Paste from text', onclick: pasteText })), text, refs.textMsg);
    // Save
    refs.problems = el('ul', { class: 'qe-problems', id: 'qe-problems', 'aria-live': 'polite' });
    refs.save = el('button', { type: 'button', id: 'qe-save', class: 'qe-save', text: editing ? 'Save changes' : 'Add to the table', onclick: save });
    const foot = el('div', { class: 'qe-foot' }, refs.problems, el('div', { class: 'row' }, refs.save, el('button', { type: 'button', id: 'qe-cancel', text: 'Cancel', onclick: close })));
    panel.append(head, who, abilities, skills, attacks, magic, more, move, foot);
    changed();
  }

  function changed() {
    for (const a of ABILITIES) { const n = num(m.abil[a]); refs[`mod-${a}`].textContent = Number.isFinite(n) ? signed(modOf(n)) : '–'; }
    const problems = lintRecord(toRecord(m), { spells: SPELLS });
    refs.problems.textContent = '';
    for (const p of problems) refs.problems.append(el('li', { text: p }));
    refs.save.disabled = problems.length > 0 || !!pending;
    refs.problems.hidden = problems.length === 0;
  }
  function open(record, actor) {
    editing = actor ? { id: actor, name: record.name } : null; pending = null;
    m = record ? fromRecord(record) : blank();
    build(); panel.hidden = false; panel.scrollTop = 0;
  }
  function close() { panel.hidden = true; pending = null; }
  function save() {
    const record = toRecord(m);
    if (lintRecord(record, { spells: SPELLS }).length) return;
    pending = editing ? 'edited' : 'spawned'; refs.save.disabled = true;
    setTimeout(() => { if (pending) { pending = null; if (!panel.hidden) changed(); } }, 4000);   // the engine said no (its toast is showing): let the DM fix it
    act(editing ? { type: 'editCharacter', actor: editing.id, record } : { type: 'addCharacter', record });
  }
  async function copyText() {
    const json = JSON.stringify(toRecord(m), null, 2);
    refs.text.value = json; refs.textMsg.hidden = true;
    try { await navigator.clipboard.writeText(json); toast('Copied. It is also in the box below.', true); }
    catch { refs.text.select(); toast('Select the text below and copy it.', true); }
  }
  function pasteText() {
    const showBad = (list) => { refs.textMsg.textContent = ''; refs.textMsg.append(...list.map((p) => el('li', { text: p }))); refs.textMsg.hidden = false; };
    let record;
    try { record = JSON.parse(refs.text.value); } catch { return showBad(['That is not a character: the text could not be read. Paste the whole text that Copy as text gave you.']); }
    const problems = lintRecord(record, { spells: SPELLS });
    if (problems.length) return showBad(problems);
    m = fromRecord(record); const scroll = panel.scrollTop, txt = refs.text.value;
    build(); refs.text.value = txt; panel.scrollTop = scroll; toast('Sheet filled in from the text.', true);
  }

  // Remove: asked again in the page before anything is sent.
  function ask(e) {
    clearTimeout(sureTimer); sure.textContent = '';
    sure.append(el('span', { text: `Remove ${e.name} from the game?` }),
      el('button', { type: 'button', id: 'qe-remove-yes', class: 'leave', text: 'Yes, remove', onclick: () => { sure.hidden = true; act({ type: 'remove', actor: e.id }); } }),
      el('button', { type: 'button', id: 'qe-remove-no', text: 'Keep', onclick: () => { sure.hidden = true; } }));
    sure.hidden = false; sure.scrollIntoView({ block: 'nearest' }); sureTimer = setTimeout(() => (sure.hidden = true), 8000);
  }
  bAdd.onclick = () => open(null, null);
  bEdit.onclick = () => { const e = getState()?.entities[getSelected()]; if (e?.sheet) B.open({ mode: 'edit', entity: e }); else if (e?.kind === 'pc') open(recordOf(e), e.id); };
  bRemove.onclick = () => { const e = getState()?.entities[getSelected()]; if (e) ask(e); };

  return {
    // Called whenever the DM panel is drawn: what is selected decides which buttons work.
    sync(state, selId) {
      const e = state?.entities[selId];
      bEdit.disabled = !(e?.kind === 'pc' && e.abil); bRemove.disabled = !e;
      bLevel.disabled = !(e?.kind === 'pc' && e.sheet && e.sheet.level < 20 && !(state.encounter?.order ?? []).some((o) => o.id === e.id));
      bLevel.title = bLevel.disabled ? 'Select a built character outside a fight' : '';
      bEdit.title = bEdit.disabled ? 'Select a character first' : ''; bRemove.title = bRemove.disabled ? 'Select a creature first' : '';
      if (!sure.hidden && !e) sure.hidden = true;
    },
    // Called with each batch of events: an added or corrected character closes the form.
    events(events) {
      B.events(events); IM.events(events);
      if (!pending) return;
      const done = events.find((ev) => ev.type === pending);
      if (!done) return;
      const name = getState()?.entities[done.id]?.name ?? 'The character';
      close(); toast(pending === 'edited' ? `${name} corrected.` : `${name} joins the party.`, true);
    },
    refused: (msg) => IM.refused(msg),
    open, recordOf, toRecord, fromRecord,
  };
}
