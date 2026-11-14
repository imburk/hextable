// Build from class and level: the second way to add a character (the first is the hand-typed form in
// quickentry.js). The screen only collects a sheet of choices (see derive.js) and shows what `derive`
// and `validate` say about it; it decides no rule. Saving sends `setSheet` (new or corrected
// character) or `levelUp`, and the engine checks the sheet again.
import { ABILITIES, SKILLS } from './shared/content/schema.js';
import { CONTENT } from './shared/content/index.js';
import { derive, validate, featuresOf, classOf, mod, proficiencyFor, pickFor, featChoices } from './shared/derive.js';

const ABIL_NAME = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const nice = (id) => cap(id.replace(/-/g, ' '));
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
const DEFAULT_COLOR = '#3a7d44';
// Fields of a sheet this screen has no control for: kept as they were when a sheet is edited.
const KEEP = ['extraSkills', 'size', 'speed', 'senses', 'tools', 'gear', 'items', 'attuning'];
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

// How many options a feature that picks from a list takes at this level: a number (Metamagic), or by the class
// table (Eldritch Invocations, `pick: { column }`). `x` is an entry of featuresOf().
export const pickLimit = (x) => pickFor(x.f, x.cls.c, x.cls.level);

// Why an option of a pick list cannot be ticked yet ('' if it can): its `requires` (#232), `{ level?, option?, spell? }`, read as validate reads it. `mine` is what is ticked in
// the list, `spells` the spells chosen on the sheet. The engine checks again; this only says why in words.
export function optionWhy(x, o, mine, spells) {
  const q = o.requires;
  if (!q) return '';
  if (q.level !== undefined && x.cls.level < q.level) return `Needs ${x.cls.c.name} level ${q.level}.`;
  if (q.option !== undefined && !mine.includes(q.option)) return `Needs ${x.f.options.find((y) => y.id === q.option)?.name ?? q.option}.`;
  if (q.spell !== undefined && !spells.includes(q.spell)) return `Needs ${CONTENT.spells[q.spell]?.name ?? q.spell} among the spells.`;
  return '';
}

// The abilities of a feat's ability points, as the sheet takes them: `first` gets +2, or +1 with `second` (which gets +1 too); a feat of one point gives it to `first`.
export function featPoints(inc, first, second) {
  if (!inc || !first) return undefined;
  if (inc.points === 1) return { [first]: 1 };
  return second && second !== first ? { [first]: 1, [second]: 1 } : { [first]: 2 };
}

// How a feature's uses read: "3 uses, all back on a Long Rest (1 on a Short Rest)".
export function usesText(u) {
  if (!u) return '';
  const n = `${u.max} use${u.max === 1 ? '' : 's'}`;
  if (u.recharge === 'short') return `${n}, back on a Short Rest`;
  return `${n}, back on a Long Rest${u.short ? ` (${u.short} on a Short Rest)` : ''}`;
}

// The build screen is one panel for the page. `openBuild` opens it for My characters (mycharacters.js, #308): no game is attached, and
// Save hands the sheet to `onSave(sheet)`, which returns '' when it kept it or the reason it could not. { mode: 'mine', sheet?, onSave }
let current = null;
export function openBuild(o) {
  if (!current) throw new Error('The build screen is not ready.');
  current.open(o);
}

export function initBuild({ act, toast, getState, getSelected, importButton }) {
  const classIds = Object.keys(CONTENT.classes);
  let b = fresh(), mode = 'add', target = null, base = null, pending = null, keep = null;       // `keep`: where a sheet goes in 'mine' mode
  const open = new Set(['spells-0']);          // spell groups left open across redraws
  const refs = {};

  const panel = el('aside', { id: 'qb', class: 'panel qe qb', hidden: true, 'aria-label': 'Build a character from class and level' });
  document.body.append(panel);

  function fresh(cls = classIds[0]) {
    const c = CONTENT.classes[cls];
    return { name: '', class: cls, subclass: undefined, level: 1, abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, abilText: null,
      skills: [], expertise: [], choices: {}, feats: [], armour: null, shield: false, weapons: [], spells: [], color: DEFAULT_COLOR, keep: {}, c };
  }
  // The sheet the engine takes: choices only, nothing empty.
  function sheet() {
    const s = { name: b.name.trim(), class: b.class, level: b.level, abilities: { ...b.abilities }, skills: [...b.skills] };
    if (b.subclass) s.subclass = b.subclass;
    if (b.expertise.length) s.expertise = [...b.expertise];
    if (Object.keys(b.choices).length) s.choices = { ...b.choices };
    if (b.feats.length) s.feats = structuredClone(b.feats);
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
      expertise: [...(s.expertise ?? [])], choices: { ...(s.choices ?? {}) }, feats: structuredClone(s.feats ?? []), armour: s.armour ?? null, shield: !!s.shield, weapons: [...(s.weapons ?? [])],
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
    const title = mode === 'levelup' ? `Level up ${target.name}` : mode === 'edit' ? `Edit ${target.name}` : mode === 'mine' ? (target ? `Edit ${target.name}` : 'New character for My characters') : 'Build from class and level';
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
        const keep = { name: b.name, color: b.color, abilities: b.abilities, level: b.level, keep: b.keep };   // a new class starts with no feats
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
      el('p', { class: 'note', text: 'Enter each score as it stands after background. A feat chosen below that raises a score adds its points, and so do features that raise one (Primal Champion).' })));

    // Features that ask for a choice
    const asks = L.feats.filter((x) => x.f.options && !x.option);
    // A feature that picks several options from a list (Metamagic: up to 2 at level 2, 2 more at 10): ticks, none twice across features.
    const pickList = (x) => {
      const mine = Array.isArray(b.choices[x.f.id]) ? b.choices[x.f.id] : [], taken = asks.filter((y) => y !== x && y.f.pick).flatMap((y) => b.choices[y.f.id] ?? []);
      return el('div', { class: 'qb-pick', id: `choice-${x.f.id}` }, el('h4', { text: `${x.f.name}: choose up to ${pickLimit(x)}` }),
        el('p', { class: 'note', id: `count-${x.f.id}`, text: `${mine.length} of ${pickLimit(x)} chosen` }),
        ...x.f.options.map((o) => {
          const need = optionWhy(x, o, mine, b.spells), on = mine.includes(o.id), off = !on && (mine.length >= pickLimit(x) || taken.includes(o.id) || !!need);
          return el('label', { class: 'check qe-tick', 'data-option': o.id }, el('input', { type: 'checkbox', id: `pick-${x.f.id}-${o.id}`, checked: on, disabled: off,
            onchange: (ev) => { const next = ev.target.checked ? [...mine, o.id] : mine.filter((i) => i !== o.id); if (next.length) b.choices[x.f.id] = next; else delete b.choices[x.f.id]; build(); } }),
            el('span', {}, o.name + (taken.includes(o.id) ? ' (chosen above)' : ''), need || (on && optionWhy(x, o, mine.filter((i) => i !== o.id), b.spells)) ? el('small', { class: 'note', text: ` ${need || optionWhy(x, o, mine.filter((i) => i !== o.id), b.spells)}` }) : null));
        }));
    };
    if (asks.length) parts.push(el('section', {}, el('h3', { text: 'Choices' }), ...asks.map((x) => x.f.pick ? pickList(x) : el('div', {},
      sel(x.f.name, `choice-${x.f.id}`, [['', 'Choose…'], ...x.f.options.map((o) => [o.id, o.name])], b.choices[x.f.id] ?? '', (v) => { if (v) b.choices[x.f.id] = v; else delete b.choices[x.f.id]; build(); }),
      b.choices[x.f.id] ? el('p', { class: 'note', text: x.f.options.find((o) => o.id === b.choices[x.f.id])?.text ?? '' }) : null))));

    // Feats: Ability Score Improvement places, the origin feats (the engine's `featChoices` says what each place offers)
    const feats = featsSection();
    if (feats) parts.push(feats);

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
    const label = mode === 'levelup' ? `Level up to ${b.level}` : mode === 'edit' ? 'Save changes' : mode === 'mine' ? 'Save to My characters' : 'Add to the table';
    refs.save = el('button', { type: 'button', id: 'qb-save', class: 'qe-save', text: label, onclick: save });
    parts.push(el('div', { class: 'qe-foot' }, refs.problems, el('div', { class: 'row' }, refs.save, el('button', { type: 'button', id: 'qb-cancel', text: 'Cancel', onclick: close }))));
    panel.append(...parts);
    update();
    panel.scrollTop = scroll;
    if (focus && focus !== 'qb-name' && !/^qb-abil/.test(focus)) document.getElementById(focus)?.focus({ preventScroll: true });
  }

  // ---------- feats (C13): `sheet.feats` is [{ id, at, abilities?, skills?, list?, ability?, spells? }]; the places and what each offers are `featChoices` ----------
  function featsSection() {
    const slots = featChoices(sheet());
    if (!slots.length) return null;
    const setEntry = (at, f) => { const i = b.feats.findIndex((x) => x.at === at); if (i >= 0) b.feats.splice(i, 1); if (f) b.feats.push(f); };
    const pickOne = (id, label, options, value, onchange) => {
      const sl = el('select', { id }, ...options.map(([v, t]) => el('option', { value: v, text: t })));
      sl.value = value ?? ''; sl.onchange = () => onchange(sl.value);
      return el('label', { class: 'qe-f' }, el('span', { text: label }), sl);
    };
    const sec = el('section', { id: 'qb-feats-pick' }, el('h3', { text: 'Feats' }),
      el('p', { class: 'note', text: 'Ability scores above are the scores before these feats: a feat that raises one adds its points for you.' }));
    for (const sl of slots) {
      const def = sl.taken ? CONTENT.feats[sl.taken.id] : null, key = sl.at.replace(/[^a-z0-9]+/gi, '-');
      const ids = new Set(sl.offer); if (sl.taken && !ids.has(sl.taken.id)) ids.add(sl.taken.id);
      const box = el('div', { class: 'qb-pick', id: `feat-${key}`, 'data-at': sl.at }, pickOne(`feat-${key}-id`, sl.name,
        [['', 'None'], ...[...ids].map((id) => [id, CONTENT.feats[id].name])], sl.taken?.id, (v) => { setEntry(sl.at, v ? { id: v, at: sl.at } : null); build(); }));
      if (def) {
        const t = sl.taken, put = (patch) => { const next = { ...t, ...patch }; for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k]; setEntry(sl.at, next); };
        box.append(el('p', { class: 'note', text: def.text ?? '' }));
        const inc = def.increase;
        if (inc) {
          const [first, second] = Object.keys(t.abilities ?? {}), two = inc.points === 2 && Object.keys(t.abilities ?? {}).length === 1 && Object.values(t.abilities)[0] === 2;
          const opts = (none) => [['', none], ...inc.from.map((a) => [a, ABIL_NAME[a]])];
          box.append(el('div', { class: 'qe-grid qe-2' },
            pickOne(`feat-${key}-a1`, inc.points === 2 ? 'Ability score (+2, or +1 with a second)' : 'Ability score (+1)', opts('Choose…'), first, (v) => { put({ abilities: featPoints(inc, v, two ? undefined : second) }); build(); }),
            inc.points === 2 ? pickOne(`feat-${key}-a2`, 'Second ability score (+1 each)', opts('None: +2 to the first'), two ? '' : second, (v) => { put({ abilities: featPoints(inc, first, v) }); build(); }) : null));
        }
        if (def.proficiencies) {
          const n = def.proficiencies.n, mine = t.skills ?? [];
          box.append(el('h4', { text: `Skills: ${mine.length} of ${n}` }), el('div', { class: 'qe-skills' }, ...Object.keys(SKILLS).map((k) => {
            const on = mine.includes(k), had = b.skills.includes(k);
            return el('label', { class: 'check qe-tick' }, el('input', { type: 'checkbox', id: `feat-${key}-skill-${k}`, checked: on, disabled: !on && (had || mine.length >= n),
              onchange: (ev) => { const next = ev.target.checked ? [...mine, k] : mine.filter((i) => i !== k); put({ skills: next.length ? next : undefined }); build(); } }), el('span', { text: `${nice(k)}${had ? ' (already proficient)' : ''}` }));
          })));
        }
        const sp = def.spellPick;
        if (sp) {
          const spells = t.spells ?? [], list = t.list, pool = list ? Object.values(CONTENT.spells).filter((x) => x.classes.includes(list)) : [];
          box.append(el('div', { class: 'qe-grid qe-2' },
            pickOne(`feat-${key}-list`, 'Spell list', [['', 'Choose…'], ...sp.lists.map((l) => [l, nice(l)])], list, (v) => { put({ list: v || undefined, spells: undefined }); build(); }),
            pickOne(`feat-${key}-ability`, 'Spellcasting ability', [['', 'Choose…'], ...sp.abilities.map((a) => [a, ABIL_NAME[a]])], t.ability, (v) => { put({ ability: v || undefined }); build(); })));
          for (const [lv, most, name] of [[0, sp.cantrips, 'Cantrips'], [1, sp.level1, 'Level 1 spells']]) {
            if (!most) continue;
            const here = spells.filter((id) => CONTENT.spells[id]?.level === lv);
            box.append(el('h4', { text: `${name}: ${here.length} of ${most}` }), !list ? el('p', { class: 'note', text: 'Choose a spell list first.' }) : el('div', { class: 'qe-ticks' }, ...pool.filter((x) => x.level === lv).sort((a, z) => a.name.localeCompare(z.name)).map((x) => {
              const on = spells.includes(x.id);
              return el('label', { class: 'check qe-tick' }, el('input', { type: 'checkbox', id: `feat-${key}-spell-${x.id}`, checked: on, disabled: !on && here.length >= most,
                onchange: (ev) => { const next = ev.target.checked ? [...spells, x.id] : spells.filter((i) => i !== x.id); put({ spells: next.length ? next : undefined }); build(); } }), el('span', { text: x.name }));
            })));
          }
        }
      }
      sec.append(box);
    }
    return sec;
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
  function close() { panel.hidden = true; pending = null; keep = null; panel.classList.remove('over-lobby'); }
  function save() {
    const s = sheet();
    if (validate(s).length) return;
    if (mode === 'mine') {
      const why = keep?.(s);
      if (why) { refs.problems.append(el('li', { text: why })); refs.problems.hidden = false; return; }
      return close();
    }
    pending = mode === 'add' ? 'spawned' : 'edited'; refs.save.disabled = true;
    setTimeout(() => { if (pending) { pending = null; if (!panel.hidden) update(); } }, 4000);   // the engine said no (its toast is showing): let the DM fix it
    if (mode === 'levelup') act({ type: 'levelUp', actor: target.id, sheet: s });
    else act(mode === 'edit' ? { type: 'setSheet', actor: target.id, sheet: s } : { type: 'setSheet', sheet: s });
  }

  const api = {
    // { mode: 'add' } | { mode: 'edit', entity } | { mode: 'levelup', entity } | { mode: 'mine', sheet?, onSave }
    open(o = { mode: 'add' }) {
      mode = o.mode; pending = null; target = o.entity ? { id: o.entity.id, name: o.entity.name } : null;
      keep = mode === 'mine' ? o.onSave : null;
      panel.classList.toggle('over-lobby', mode === 'mine');             // it opens over the lobby, which is above the usual panels
      if (mode === 'mine') { b = o.sheet ? fromSheet(o.sheet) : fresh(); target = o.sheet ? { name: o.sheet.name } : null; autoSubclass(); }
      else if (mode === 'add') b = fresh(); else {
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
  current = api;
  return api;
}
