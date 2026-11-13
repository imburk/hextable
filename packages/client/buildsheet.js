// Build from class and level: the second way to add a character (the first is the hand-typed form in
// quickentry.js). The screen only collects a sheet of choices (see derive.js) and shows what `derive`
// and `validate` say about it; it decides no rule. Saving sends `setSheet` (new or corrected
// character) or `levelUp`, and the engine checks the sheet again.
import { ABILITIES, SKILLS } from './shared/content/schema.js';
import { CONTENT } from './shared/content/index.js';
import { derive, validate, featuresOf, classOf, mod, proficiencyFor } from './shared/derive.js';

const ABIL_NAME = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const nice = (id) => cap(id.replace(/-/g, ' '));
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
const DEFAULT_COLOR = '#3a7d44';
// Fields of a sheet this screen has no control for: kept as they were when a sheet is edited.
const KEEP = ['extraSkills', 'size', 'speed', 'senses', 'tools', 'gear'];
const REST = { short: 'a Short Rest', long: 'a Long Rest' };

function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k in e && k !== 'list') e[k] = v; else e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...kids.filter((x) => x != null));
  return e;
}
const toggle = (list, v, on) => { const i = list.indexOf(v); if (on && i < 0) list.push(v); if (!on && i >= 0) list.splice(i, 1); };

// How a feature's uses read: "3 uses, all back on a Long Rest (1 on a Short Rest)".
export function usesText(u) {
  if (!u) return '';
  const n = `${u.max} use${u.max === 1 ? '' : 's'}`;
  if (u.recharge === 'short') return `${n}, back on a Short Rest`;
  return `${n}, back on a Long Rest${u.short ? ` (${u.short} on a Short Rest)` : ''}`;
}

export function initBuild({ act, toast, getState, getSelected, importButton }) {
  const classIds = Object.keys(CONTENT.classes);
  let b = fresh(), mode = 'add', target = null, base = null, pending = null;
  const open = new Set(['spells-0']);          // spell groups left open across redraws
  const refs = {};

  const panel = el('aside', { id: 'qb', class: 'panel qe qb', hidden: true, 'aria-label': 'Build a character from class and level' });
  document.body.append(panel);

  function fresh(cls = classIds[0]) {
    const c = CONTENT.classes[cls];
    return { name: '', class: cls, subclass: undefined, level: 1, abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, abilText: null,
      skills: [], expertise: [], choices: {}, armour: null, shield: false, weapons: [], spells: [], color: DEFAULT_COLOR, keep: {}, c };
  }
  // The sheet the engine takes: choices only, nothing empty.
  function sheet() {
    const s = { name: b.name.trim(), class: b.class, level: b.level, abilities: { ...b.abilities }, skills: [...b.skills] };
    if (b.subclass) s.subclass = b.subclass;
    if (b.expertise.length) s.expertise = [...b.expertise];
    if (Object.keys(b.choices).length) s.choices = { ...b.choices };
    if (b.armour) s.armour = b.armour;
    if (b.shield) s.shield = true;
    if (b.weapons.length) s.weapons = [...b.weapons];
    if (b.spells.length) s.spells = [...b.spells];
    for (const k of KEEP) if (b.keep[k] !== undefined) s[k] = structuredClone(b.keep[k]);
    s.look = { color: b.color };
    return s;
  }
  function fromSheet(s) {
    const x = fresh(s.class);
    Object.assign(x, { name: s.name ?? '', subclass: s.subclass, level: s.level, abilities: { ...x.abilities, ...s.abilities }, skills: [...(s.skills ?? [])],
      expertise: [...(s.expertise ?? [])], choices: { ...(s.choices ?? {}) }, armour: s.armour ?? null, shield: !!s.shield, weapons: [...(s.weapons ?? [])],
      spells: [...(s.spells ?? [])], color: s.look?.color ?? DEFAULT_COLOR });
    for (const k of KEEP) if (s[k] !== undefined) x.keep[k] = structuredClone(s[k]);
    return x;
  }
  const safeDerive = (s) => { try { return derive(s); } catch { return null; } };

  // What the class and level allow, worked out from the same data derive and validate read.
  function limits() {
    const s = sheet(), c = classOf(s), feats = featuresOf(s), G = feats.map((x) => x.f.grants).filter(Boolean);
    const extraClass = G.reduce((n, g) => n + (g.skills?.from === 'class' ? g.skills.n : 0), 0), extraAny = G.reduce((n, g) => n + (g.skills?.from === 'any' ? g.skills.n : 0), 0);
    const cast = c.casting, lists = new Set([c.id]);
    for (const g of G) for (const l of g.spellLists ?? []) lists.add(l);
    const L = { c, feats, skills: c.skills.choose + extraClass + extraAny, extraAny, fromClass: c.skills.from === 'any' ? Object.keys(SKILLS) : c.skills.from,
      expertise: G.reduce((n, g) => n + (g.expertise ?? 0), 0), cast, lists };
    if (cast) {
      L.top = cast.kind === 'pact' ? cast.slotLevel[b.level - 1] : cast.slots[b.level - 1].length;
      L.cantrips = cast.cantrips[b.level - 1] + G.reduce((n, g) => n + (g.cantrips ?? 0), 0);
      L.prepared = cast.prepared[b.level - 1];
    }
    return L;
  }

  // ---------- drawing ----------
  function build() {
    const scroll = panel.scrollTop, focus = document.activeElement?.id;
    panel.textContent = '';
    for (const k of Object.keys(refs)) delete refs[k];
    const L = limits(), c = L.c, locked = mode === 'levelup';
    const title = mode === 'levelup' ? `Level up ${target.name}` : mode === 'edit' ? `Edit ${target.name}` : 'Build from class and level';
    const head = el('div', { class: 'qe-head' }, el('h2', { text: title }), el('button', { type: 'button', class: 'close', id: 'qb-close', text: 'Close', onclick: close }));
    const parts = [head];
    if (mode === 'levelup') parts.push(gainedBox());
    if (mode === 'add' && importButton) parts.push(el('div', { class: 'row' }, importButton(), el('small', { class: 'note', text: 'Or start from a Fantasy Grounds export.' })));

    // Who: name, colour, class, subclass, level
    const sel = (label, id, options, value, onchange, disabled) => {
      const s = el('select', { id: `qb-${id}`, disabled }, ...options.map(([v, t]) => el('option', { value: v, text: t })));
      s.value = value; s.onchange = () => onchange(s.value);
      return el('label', { class: 'qe-f' }, el('span', { text: label }), s);
    };
    const name = el('input', { id: 'qb-name', type: 'text', value: b.name, maxLength: 40, autocomplete: 'off', autocapitalize: 'words', spellcheck: false, oninput: (ev) => { b.name = ev.target.value; update(); } });
    const color = el('input', { id: 'qb-color', type: 'color', value: b.color, oninput: (ev) => { b.color = ev.target.value; update(); } });
    parts.push(el('section', {}, el('h3', { text: 'Who' }), el('div', { class: 'qe-grid qe-2' },
      el('label', { class: 'qe-f wide' }, el('span', { text: 'Name' }), name),
      sel('Class', 'class', classIds.map((id) => [id, CONTENT.classes[id].name]), b.class, (v) => {
        const keep = { name: b.name, color: b.color, abilities: b.abilities, level: b.level, keep: b.keep };
        b = Object.assign(fresh(v), keep); autoSubclass(); build();
      }, locked || mode === 'edit'),
      sel('Level', 'levelsel', Array.from({ length: 20 }, (_, i) => [String(i + 1), String(i + 1)]), String(b.level), (v) => { b.level = +v; autoSubclass(); build(); }, locked),
      sel('Subclass', 'subclass', [['', b.level >= 3 ? 'Choose a subclass' : 'None yet (level 3)'], [c.subclass.id, c.subclass.name]], b.subclass ?? '', (v) => { b.subclass = v || undefined; build(); }),
      el('label', { class: 'qe-f' }, el('span', { text: 'Colour' }), color))));

    // Abilities
    const ab = el('div', { class: 'qe-abil' });
    for (const a of ABILITIES) {
      const out = el('output', { class: 'qe-mod', id: `qb-mod-${a}`, text: signed(mod(b.abilities[a])) });
      const input = el('input', { id: `qb-abil-${a}`, type: 'text', inputMode: 'numeric', autocomplete: 'off', maxLength: 2, value: String(b.abilText?.[a] ?? b.abilities[a]),
        oninput: (ev) => {
          (b.abilText ??= {})[a] = ev.target.value;
          const n = Number(ev.target.value.trim() === '' ? NaN : ev.target.value);
          b.abilities[a] = Number.isInteger(n) ? n : NaN; out.textContent = Number.isInteger(n) ? signed(mod(n)) : '–'; update();
        } });
      ab.append(el('div', { class: 'qe-ab' }, el('label', { class: 'qe-f qe-ab-in' }, el('span', { text: a.toUpperCase() }), input), out,
        el('small', { class: 'note', text: c.saves.includes(a) ? 'Save proficiency' : '' })));
    }
    parts.push(el('section', {}, el('h3', { text: 'Ability scores' }), ab,
      el('p', { class: 'note', text: 'Enter each score as it stands after background and feats. Features that raise a score (Primal Champion) are added for you.' })));

    // Features that ask for a choice
    const asks = L.feats.filter((x) => x.f.options && !x.option);
    if (asks.length) parts.push(el('section', {}, el('h3', { text: 'Choices' }), ...asks.map((x) => el('div', {},
      sel(x.f.name, `choice-${x.f.id}`, [['', 'Choose…'], ...x.f.options.map((o) => [o.id, o.name])], b.choices[x.f.id] ?? '', (v) => { if (v) b.choices[x.f.id] = v; else delete b.choices[x.f.id]; build(); }),
      b.choices[x.f.id] ? el('p', { class: 'note', text: x.f.options.find((o) => o.id === b.choices[x.f.id])?.text ?? '' }) : null))));

    // Skills
    const picked = b.skills.length, full = picked >= L.skills;
    const skillTick = (k) => {
      const on = b.skills.includes(k);
      const c1 = el('input', { type: 'checkbox', id: `qb-skill-${k}`, checked: on, disabled: !on && full, onchange: (ev) => { toggle(b.skills, k, ev.target.checked); if (!ev.target.checked) toggle(b.expertise, k, false); build(); } });
      const row = [el('label', { class: 'check qe-tick' }, c1, el('span', { text: `${nice(k)} (${SKILLS[k].toUpperCase()})` }))];
      if (L.expertise && on) {
        const ex = b.expertise.includes(k);
        row.push(el('label', { class: 'check qe-tick qe-exp' }, el('input', { type: 'checkbox', id: `qb-exp-${k}`, checked: ex, disabled: !ex && b.expertise.length >= L.expertise, onchange: (ev) => { toggle(b.expertise, k, ev.target.checked); build(); } }), el('span', { text: 'Expertise' })));
      }
      return el('div', { class: 'qe-sk' }, ...row);
    };
    const skillsSec = el('section', {}, el('h3', { text: `Skills: ${picked} of ${L.skills}` }), el('div', { class: 'qe-skills' }, ...L.fromClass.map(skillTick)));
    if (L.extraAny) skillsSec.append(el('h4', { text: 'Any other skill (a feature allows these)' }), el('div', { class: 'qe-skills' }, ...Object.keys(SKILLS).filter((k) => !L.fromClass.includes(k)).map(skillTick)));
    if (L.expertise) skillsSec.append(el('p', { class: 'note', text: `Expertise: ${b.expertise.length} of ${L.expertise}. Tick it under a skill you are proficient in.` }));
    parts.push(skillsSec);

    // Armour, shield, weapons
    const armour = Object.values(CONTENT.armour).filter((a) => a.category !== 'shield');
    const wp = Object.values(CONTENT.weapons);
    const weaponTick = (w) => {
      const on = b.weapons.includes(w.id);
      return el('label', { class: 'check qe-tick' }, el('input', { type: 'checkbox', id: `qb-weapon-${w.id}`, checked: on, onchange: (ev) => { toggle(b.weapons, w.id, ev.target.checked); update(); } }),
        el('span', { text: `${w.name} (${w.damage})` }));
    };
    parts.push(el('section', {}, el('h3', { text: 'Armour and weapons' }), el('div', { class: 'qe-grid qe-2' },
      sel('Armour', 'armour', [['', 'None'], ...armour.map((a) => [a.id, `${a.name} (AC ${a.ac}, ${a.category})`])], b.armour ?? '', (v) => { b.armour = v || null; update(); }),
      el('label', { class: 'check qe-tick' }, el('input', { type: 'checkbox', id: 'qb-shield', checked: b.shield, onchange: (ev) => { b.shield = ev.target.checked; update(); } }), el('span', { text: 'Shield (+2 AC)' }))),
      ...['simple', 'martial'].map((cat) => el('div', {}, el('h4', { text: `${cap(cat)} weapons` }),
        el('div', { class: 'qe-ticks' }, ...wp.filter((w) => w.category === cat).map(weaponTick)))),
      el('div', { class: 'qe-ticks' }, el('label', { class: 'check qe-tick' }, el('input', { type: 'checkbox', id: 'qb-weapon-unarmed-strike', checked: b.weapons.includes('unarmed-strike'), onchange: (ev) => { toggle(b.weapons, 'unarmed-strike', ev.target.checked); update(); } }), el('span', { text: 'Unarmed Strike' })))));

    // Spells
    if (L.cast) parts.push(spellsSection(L));

    // Live numbers, then Save
    refs.derived = el('section', { id: 'qb-derived', class: 'qb-derived' });
    parts.push(refs.derived);
    refs.problems = el('ul', { class: 'qe-problems', id: 'qb-problems', 'aria-live': 'polite' });
    const label = mode === 'levelup' ? `Level up to ${b.level}` : mode === 'edit' ? 'Save changes' : 'Add to the table';
    refs.save = el('button', { type: 'button', id: 'qb-save', class: 'qe-save', text: label, onclick: save });
    parts.push(el('div', { class: 'qe-foot' }, refs.problems, el('div', { class: 'row' }, refs.save, el('button', { type: 'button', id: 'qb-cancel', text: 'Cancel', onclick: close }))));
    panel.append(...parts);
    update();
    panel.scrollTop = scroll;
    if (focus && focus !== 'qb-name' && !/^qb-abil/.test(focus)) document.getElementById(focus)?.focus({ preventScroll: true });
  }

  function spellsSection(L) {
    const have = b.spells.map((id) => CONTENT.spells[id]).filter(Boolean);
    const cantrips = have.filter((s) => s.level === 0).length, prepared = have.length - cantrips;
    const slots = derive(sheet())?.record?.slots ?? {};
    const slotText = Object.entries(slots).map(([l, n]) => `level ${l}: ${n}`).join(' · ');
    const sec = el('section', {}, el('h3', { text: 'Spells' }),
      el('p', { class: 'note', id: 'qb-spell-counts', text: `Cantrips ${cantrips} of ${L.cantrips} · Prepared spells ${prepared} of ${L.prepared} · Spell slots ${slotText || 'none'}${L.cast.kind === 'pact' ? ' (Pact Magic: back on a Short Rest)' : ''}` }));
    const all = Object.values(CONTENT.spells).filter((s) => s.classes.some((k) => L.lists.has(k)) && s.level <= L.top);
    const always = new Set(derive(sheet())?.record?.spells ?? []);
    for (let lv = 0; lv <= L.top; lv++) {
      const list = all.filter((s) => s.level === lv).sort((a, z) => a.name.localeCompare(z.name));
      if (!list.length) continue;
      const mine = list.filter((s) => b.spells.includes(s.id)).length;
      const full = lv === 0 ? cantrips >= L.cantrips : prepared >= L.prepared;
      const d = el('details', { id: `qb-spells-${lv}`, open: open.has(`spells-${lv}`) || mine > 0 }, el('summary', { text: `${lv === 0 ? 'Cantrips' : `Level ${lv}`}${mine ? ` (${mine} chosen)` : ''}` }),
        el('div', { class: 'qe-ticks' }, ...list.map((s) => {
          const on = b.spells.includes(s.id), auto = !on && always.has(s.id);
          return el('label', { class: 'check qe-tick', title: s.text ?? '' }, el('input', { type: 'checkbox', id: `qb-spell-${s.id}`, checked: on || auto, disabled: auto || (!on && full),
            onchange: (ev) => { toggle(b.spells, s.id, ev.target.checked); build(); } }), el('span', { text: auto ? `${s.name} (always prepared)` : s.name }));
        })));
      d.ontoggle = () => (d.open ? open.add(`spells-${lv}`) : open.delete(`spells-${lv}`));
      sec.append(d);
    }
    return sec;
  }

  // What a level brings, for the level-up screen: the new sheet's record against the old one's.
  function gainedBox() {
    const box = el('section', { class: 'qb-gain', id: 'qb-gain' });
    const was = base, now = safeDerive(sheet())?.record;
    if (!was || !now) return box;
    box.append(el('h3', { text: `Level ${was.level} to ${now.level}` }));
    const lines = [`Hit Points ${was.hp} to ${now.hp} (${signed(now.hp - was.hp)})`];
    if (now.prof !== was.prof) lines.push(`Proficiency Bonus ${signed(was.prof)} to ${signed(now.prof)}`);
    if (now.ac !== was.ac) lines.push(`Armor Class ${was.ac} to ${now.ac}`);
    const wasSlots = JSON.stringify(was.slots ?? {}), nowSlots = JSON.stringify(now.slots ?? {});
    if (nowSlots !== wasSlots) lines.push(`Spell slots: ${Object.entries(now.slots).map(([l, n]) => `level ${l}: ${n}`).join(', ')}`);
    const L = limits(), c = L.c;
    if (c.casting) {
      const dc = c.casting.cantrips[now.level - 1] - c.casting.cantrips[was.level - 1], dp = c.casting.prepared[now.level - 1] - c.casting.prepared[was.level - 1];
      if (dc) lines.push(`${signed(dc)} cantrip${Math.abs(dc) === 1 ? '' : 's'} known`);
      if (dp) lines.push(`${signed(dp)} prepared spell${Math.abs(dp) === 1 ? '' : 's'}`);
    }
    box.append(el('ul', {}, ...lines.map((t) => el('li', { text: t }))));
    const old = new Map((was.feats ?? []).map((f) => [f.id, f]));
    const fresh = (now.feats ?? []).filter((f) => !old.has(f.id));
    const grown = (now.feats ?? []).filter((f) => old.has(f.id) && f.uses && JSON.stringify(f.uses) !== JSON.stringify(old.get(f.id).uses));
    if (fresh.length) box.append(el('h4', { text: 'New features' }), ...fresh.map(featureRow));
    if (grown.length) box.append(el('h4', { text: 'Features that grow' }), ...grown.map((f) => el('p', { class: 'note', text: `${f.name}: ${usesText(old.get(f.id).uses)} becomes ${usesText(f.uses)}` })));
    if (!fresh.length && !grown.length) box.append(el('p', { class: 'note', text: 'No new features at this level.' }));
    box.append(el('p', { class: 'note', text: 'Anything below that needs a choice (a subclass, skills, spells, ability scores for a feat) is listed beside the button.' }));
    return box;
  }
  const featureRow = (f) => el('details', { class: 'qb-feat' }, el('summary', { text: `${f.name}${f.uses ? ` · ${usesText(f.uses)}` : ''}` }), el('p', { class: 'note', text: f.text ?? '' }));

  // The live numbers and the problems; redrawn after every change.
  function update() {
    if (!refs.derived) return;
    const s = sheet(), problems = validate(s), d = safeDerive({ ...s, abilities: Object.fromEntries(ABILITIES.map((a) => [a, Number.isInteger(s.abilities[a]) ? s.abilities[a] : 10])) });
    refs.problems.textContent = '';
    for (const p of problems) refs.problems.append(el('li', { text: p }));
    refs.problems.hidden = problems.length === 0;
    refs.save.disabled = problems.length > 0 || !!pending;
    const D = refs.derived; D.textContent = '';
    if (!d) return void D.append(el('h3', { text: 'Numbers' }), el('p', { class: 'note', text: 'These cannot be worked out until the sheet is filled in.' }));
    const r = d.record, stat = (k, v, id) => el('div', { class: 'qb-stat', id }, el('small', { text: k }), el('b', { text: String(v) }));
    const cast = r.castAbil ? 8 + r.prof + mod(r.abil[r.castAbil]) : null;
    D.append(el('h3', { text: 'The numbers' }), el('div', { class: 'qb-stats' }, stat('Hit Points', r.hp, 'qb-hp'), stat('Armor Class', r.ac, 'qb-ac'), stat('Speed', `${r.speed} ft`, 'qb-speed'), stat('Proficiency', signed(r.prof), 'qb-prof'),
      ...(cast !== null ? [stat('Spell save DC', cast, 'qb-dc'), stat('Spell attack', signed(r.prof + mod(r.abil[r.castAbil])), 'qb-spell-attack')] : [])));
    D.append(el('p', { class: 'note', id: 'qb-saves', text: `Saving throws: ${ABILITIES.map((a) => `${a.toUpperCase()} ${signed(mod(r.abil[a]) + (r.saveProf.includes(a) ? r.prof : 0))}${r.saveProf.includes(a) ? '*' : ''}`).join(' · ')}  (* proficient)` }));
    D.append(el('p', { class: 'note', id: 'qb-why', text: `Hit Points: ${d.why.hp.join(', ')}. Armor Class: ${d.why.ac.join(', ')}.` }));
    if (r.attacks.length) D.append(el('h4', { text: 'Attacks' }), el('table', { id: 'qb-attacks' }, el('tr', {}, el('th', { text: 'Attack' }), el('th', { text: 'To hit' }), el('th', { text: 'Damage' })),
      ...r.attacks.map((a) => el('tr', {}, el('td', { text: a.name }), el('td', { text: signed(a.bonus) }), el('td', { text: `${a.damage} ${a.dtype}` })))));
    if (r.feats?.length) D.append(el('h4', { text: 'Features' }), el('div', { id: 'qb-feats' }, ...r.feats.map(featureRow)));
  }

  function autoSubclass() { if (b.level >= 3 && !b.subclass) b.subclass = b.c.subclass.id; }
  function close() { panel.hidden = true; pending = null; }
  function save() {
    const s = sheet();
    if (validate(s).length) return;
    pending = mode === 'add' ? 'spawned' : 'edited'; refs.save.disabled = true;
    setTimeout(() => { if (pending) { pending = null; if (!panel.hidden) update(); } }, 4000);   // the engine said no (its toast is showing): let the DM fix it
    if (mode === 'levelup') act({ type: 'levelUp', actor: target.id, sheet: s });
    else act(mode === 'edit' ? { type: 'setSheet', actor: target.id, sheet: s } : { type: 'setSheet', sheet: s });
  }

  return {
    // { mode: 'add' } | { mode: 'edit', entity } | { mode: 'levelup', entity }
    open(o = { mode: 'add' }) {
      mode = o.mode; pending = null; target = o.entity ? { id: o.entity.id, name: o.entity.name } : null;
      if (mode === 'add') b = fresh(); else {
        b = fromSheet(o.entity.sheet);
        if (mode === 'levelup') {
          base = safeDerive(o.entity.sheet)?.record ?? null;
          b.level = Math.min(20, o.entity.sheet.level + 1); autoSubclass();
        }
      }
      build(); panel.hidden = false; panel.scrollTop = 0;
    },
    close,
    events(events) {
      if (!pending) return;
      const done = events.find((ev) => ev.type === pending);
      if (!done) return;
      const name = getState()?.entities[done.id]?.name ?? 'The character';
      const was = mode;
      close(); toast(was === 'levelup' ? `${name} is now level ${getState()?.entities[done.id]?.level}.` : was === 'edit' ? `${name} corrected.` : `${name} joins the party.`, true);
    },
    sheetOf: sheet, proficiencyFor,
  };
}
