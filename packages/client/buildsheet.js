// Build from class and level: the second way to add a character (the first is the hand-typed form in
// quickentry.js). The screen only collects a sheet of choices (see derive.js) and shows what `derive`
// and `validate` say about it; it decides no rule. Saving sends `setSheet` (new or corrected
// character) or `levelUp`, and the engine checks the sheet again.
import { ABILITIES, SKILLS } from './shared/content/schema.js';
import { CONTENT } from './shared/content/index.js';
import { startBar, loadDraft, saveDraft, keepBuild, dropBuild, whenLine } from './startflow.js';
import { derive, validate, featuresOf, classOf, mod, proficiencyFor, pickFor, featChoices, missingOf } from './shared/derive.js';
import { STANDARD_ARRAY, POINT_COST, POINT_BUDGET, BACKGROUNDS, ARRAY_BY_CLASS, DEFAULT_RULE, BELOW, cleanRule, ruleText, pointsSpent, pointsLeft, rollScores, rollScore, mayReroll, rerollWhy,
  standing, applyBackground, checkScores, scoresLine, dmLine, setText, dayText } from './shared/scores.js';
import { keyedRng } from './shared/rng.js';
import { attach as scrollOn, hide as scrollOff } from './scrolltip.js';

const ABIL_NAME = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const nice = (id) => cap(id.replace(/-/g, ' '));
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
const DEFAULT_COLOR = '#3a7d44';
// The colours a character's pawn can be, offered as a row of swatches (a theme has one colour for the whole party, so this set is the build screen's own).
// The first four are the colours of the starter party. A sheet's colour is always `#rrggbb`, which is what the engine's linter takes.
export const PALETTE = [['#c8553d', 'Red'], ['#d9a441', 'Gold'], ['#4a7c59', 'Green'], ['#5b6fb5', 'Blue'], ['#3a7d44', 'Meadow'], ['#8e5ba6', 'Purple'], ['#3a8f9c', 'Teal'], ['#c2607f', 'Rose'], ['#7d8590', 'Slate']];
// What the "More" box was given as a colour: `#rrggbb` (lower case), or '' when it is not one. A leading # is optional.
export const hexOf = (text) => { const m = /^#?([0-9a-fA-F]{6})$/.exec(String(text ?? '').trim()); return m ? `#${m[1].toLowerCase()}` : ''; };
// Fields of a sheet this screen has no control for: kept as they were when a sheet is edited.
// (`scoreBonus` is the DM's score bonus, e.g. from an import; this screen does not show it yet, DEBT C20.)
export const KEEP = ['extraSkills', 'size', 'speed', 'senses', 'tools', 'gear', 'items', 'attuning', 'shieldStowed', 'scoreBonus'];
// The DM's score bonus as a line ("DM bonus: +2 Charisma"), or '' when there is none; and a kept-fields object without it.
export const bonusText = (sb) => { const l = ABILITIES.filter((a) => Number.isInteger(sb?.[a]) && sb[a] > 0).map((a) => `+${sb[a]} ${ABIL_NAME[a]}`); return l.length ? `DM bonus: ${l.join(', ')}` : ''; };
export const withoutBonus = (keep) => { const { scoreBonus, ...rest } = keep; void scoreBonus; return rest; };
export const keptOf = (s) => Object.fromEntries(KEEP.filter((k) => s[k] !== undefined).map((k) => [k, structuredClone(s[k])]));
// Armour a class (and what a feature grants) gives training in: the categories 'light', 'medium', 'heavy', 'shield'. `grants` are the features' `grants` objects.
export const armourTrained = (c, grants = []) => new Set([...(c?.armour ?? []), ...grants.flatMap((g) => g?.proficiency?.armour ?? [])]);
// The Armour list's choices: [id, label, disabled]. Armour with no training is greyed and says so; `current` (a sheet already wearing it) stays choosable, so
// the screen shows it as it is and the sheet's own sentence from `validate` still speaks.
export const armourOptions = (armour, trained, current) => [['', 'None', false], ...armour.map((a) => { const no = !trained.has(a.category); return [a.id, `${a.name} (AC ${a.ac}, ${a.category})${no ? ' (no training)' : ''}`, no && a.id !== current]; })];
// The line under the Armour list: what is greyed and why, or '' when nothing is.
export function armourNote(c, trained, armour) {
  const no = ['light', 'medium', 'heavy', 'shield'].filter((k) => !trained.has(k) && (k === 'shield' || armour.some((a) => a.category === k)));
  return no.length ? `A ${c.name} has no training with ${no.map((k) => (k === 'shield' ? 'Shields' : `${k} armour`)).join(', ')}, so ${no.length === 1 ? 'it is' : 'they are'} greyed out. A feat or a multiclass that gives the training lifts that.` : '';
}
const REST = { short: 'a Short Rest', long: 'a Long Rest' };

// ---------- ability scores (docs/specs/ability-scores.md, #557) ----------
// The draft of the score section is `sc`: { method: 'hand' | 'standard' | 'pointcost' | 'roll', std, pts, place, roll, rule, saved, bg }. It decides no rule: `scores.js` and `validate` do.
//   std: the Standard Array number on each ability (or null); pts: each ability's score for point cost; roll: { rolls: [{ dice, again? }], rule, by, at } or null, with
//   place: which rolled score (by its place in the list) is on each ability; rule: the reroll rule a roll made now will be made under; saved: the roll came with a saved sheet
//   (so it can no longer be rolled again); bg: { id: '' | an SRD background | 'other', mode: 'twoone' | 'all', plus2, plus1, all: [three abilities for another background] }.
const blank = () => Object.fromEntries(ABILITIES.map((a) => [a, null]));
export const METHOD_NAMES = { standard: 'Standard array', pointcost: 'Point cost', roll: 'Roll', hand: 'Enter by hand' };
export const freshScores = (rule = DEFAULT_RULE) => ({ method: 'hand', std: blank(), pts: Object.fromEntries(ABILITIES.map((a) => [a, 8])), place: blank(), roll: null, rule: cleanRule(rule), saved: false,
  bg: { id: '', mode: 'twoone', plus2: '', plus1: '', all: ['', '', ''] } });
// The abilities a background may raise: its own three for an SRD one, any of the six for another.
export const bgAbilities = (id) => (Object.hasOwn(BACKGROUNDS, id) ? BACKGROUNDS[id].abilities : ABILITIES);
// The numbers placed before the background: { str: 14 | null, ... }.
export function scoreBase(sc) {
  const out = blank();
  for (const a of ABILITIES) {
    if (sc.method === 'standard') out[a] = sc.std[a];
    else if (sc.method === 'pointcost') out[a] = sc.pts[a];
    else if (sc.method === 'roll' && sc.roll && Number.isInteger(sc.place[a]) && sc.roll.rolls[sc.place[a]]) out[a] = standing(sc.roll.rolls[sc.place[a]], sc.roll.rule);
  }
  return out;
}
// The background as the record keeps it ({ id?, abilities }), null for none, or false while its choices are not all made.
export function scoreBackground(sc) {
  const g = sc.bg, abil = bgAbilities(g.id);
  if (!g.id) return null;
  const id = g.id === 'other' ? {} : { id: g.id };
  if (g.mode === 'all') {
    const three = g.id === 'other' ? g.all : BACKGROUNDS[g.id].abilities;
    return three.every((a) => ABILITIES.includes(a)) && new Set(three).size === 3 ? { ...id, abilities: Object.fromEntries(three.map((a) => [a, 1])) } : false;
  }
  return abil.includes(g.plus2) && abil.includes(g.plus1) && g.plus2 !== g.plus1 ? { ...id, abilities: { [g.plus2]: 2, [g.plus1]: 1 } } : false;
}
// What the draft makes: the six scores after the background (8 where one is not placed yet), the record for the sheet (null until everything is placed), and what is missing in words.
export function scoreParts(sc, today = '') {
  const base = scoreBase(sc), bg = scoreBackground(sc), problems = [];
  const open = ABILITIES.filter((a) => base[a] === null).length;
  if (sc.method === 'roll' && !sc.roll) problems.push('Roll the dice first.');
  else if (open) problems.push(`Place all six numbers (${open} still to place).`);
  if (bg === false) problems.push('Choose which abilities the background raises.');
  const placed = Object.fromEntries(ABILITIES.map((a) => [a, base[a] ?? 8]));
  const abilities = applyBackground(placed, bg || undefined);
  let scores = null;
  if (!problems.length) {
    scores = { method: sc.method, base: placed, ...(bg ? { background: bg } : {}) };
    if (sc.method === 'roll') Object.assign(scores, { rolls: structuredClone(sc.roll.rolls), rule: cleanRule(sc.roll.rule), by: sc.roll.by ?? 'device', ...(sc.roll.at !== undefined ? { at: sc.roll.at } : { ...(today ? { at: today } : {}) }) });
  }
  return { abilities, scores, problems };
}
// The draft for a saved sheet: its record if it has one that agrees with its scores, else "enter by hand".
export function scoresDraft(sheet, rule = DEFAULT_RULE) {
  const sc = freshScores(rule), r = sheet?.scores;
  if (!r || checkScores(sheet).length) return sc;
  sc.method = r.method; sc.saved = true;
  if (r.method === 'standard') for (const a of ABILITIES) sc.std[a] = r.base[a];
  if (r.method === 'pointcost') for (const a of ABILITIES) sc.pts[a] = r.base[a];
  if (r.method === 'roll') {
    sc.roll = { rolls: structuredClone(r.rolls), rule: cleanRule(r.rule), by: r.by ?? 'device', ...(r.at !== undefined ? { at: r.at } : {}) };
    const used = new Set();
    for (const a of ABILITIES) {
      const i = sc.roll.rolls.findIndex((s, k) => !used.has(k) && standing(s, sc.roll.rule) === r.base[a]);
      if (i >= 0) { used.add(i); sc.place[a] = i; }
    }
  }
  if (r.background) {
    const es = Object.entries(r.background.abilities), all = es.length === 3;
    Object.assign(sc.bg, { id: r.background.id ?? 'other', mode: all ? 'all' : 'twoone' });
    if (all) sc.bg.all = es.map(([a]) => a);
    else { sc.bg.plus2 = es.find(([, n]) => n === 2)[0]; sc.bg.plus1 = es.find(([, n]) => n === 1)[0]; }
  }
  return sc;
}
// The rule and the unsaved roll kept on this device (this browser's storage; a page that cannot read it plays without).
export const RULE_KEY = 'hextable.scorerule', ROLL_KEY = 'hextable.scoreroll';
const keepRead = (k) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null'); } catch { return null; } };
const keepWrite = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage is refused: nothing is kept */ } };
const dayNow = () => new Date().toISOString().slice(0, 10);
const newKey = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) => x.toString(16).padStart(2, '0')).join('');
// A roll made on this device: the dice are the rules package's (`rollScores`) on a key this page makes.
const rollHere = () => rollScores({ rng: keyedRng(newKey()) }).sets.map((s) => ({ dice: s.faces }));
const rerollHere = () => rollScore({ rng: keyedRng(newKey()) }).faces;

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

// What the scroll card says of a spell: its name, "Level 2 · Wizard, Cleric" (or Cantrip), and its text from the pack.
export const spellCard = (s) => ({ title: s.name, sub: `${s.level ? `Level ${s.level}` : 'Cantrip'} · ${(s.classes ?? []).map(nice).join(', ')}`, text: s.text });
// The Subclass list of a class (docs/specs/homebrew-subclasses.md, B5): the choose line, the SRD subclass, and every subclass of this class that the
// table's packs hold (CONTENT.subclasses holds them while the page's overlay is installed), by name. `current` is the id the sheet names: if the list has
// no such entry (its pack is not loaded here, or it is not this class's) it is kept as an entry, so editing the character does not drop it unseen.
// Pure reading of content: which subclass a sheet may take is `validate`'s word, not this list's. Names are put on the page as text.
export function subclassChoices(c, level, current) {
  const own = Object.values(CONTENT.subclasses).filter((h) => h.class === c.id).sort((a, b) => a.name.localeCompare(b.name));
  const list = [['', level >= 3 ? 'Choose a subclass' : 'None yet (level 3)'], [c.subclass.id, c.subclass.name], ...own.map((h) => [h.id, `${h.name} (homebrew)`])];
  if (typeof current === 'string' && current && !list.some(([v]) => v === current)) list.push([current, `${current} (${current.startsWith('hb-') && !Object.hasOwn(CONTENT.subclasses, current) ? 'not loaded at this table' : `not a ${c.name} subclass here`})`]);
  return list;
}
// What to say under the list about the subclass the sheet names: the pack's own line for a loaded homebrew one, the plain fact for one that is not loaded; '' otherwise.
export function subclassNote(c, current) {
  if (typeof current !== 'string' || !current || current === c.subclass.id) return '';
  const h = Object.hasOwn(CONTENT.subclasses, current) ? CONTENT.subclasses[current] : null;
  if (h && h.class === c.id) return `Homebrew subclass of this table${typeof h.source === 'string' && h.source.startsWith('homebrew:') ? `, from the pack ${h.source.slice(9)}` : ''}.${typeof h.text === 'string' && h.text ? ` ${h.text}` : ''}`;
  if (!h && current.startsWith('hb-')) return 'This subclass is not loaded at this table. The sheet keeps it, and the character plays without its features and spells until its pack is added again.';
  return '';
}
// The class line of a character in a header ("Paladin (Oath of the Ember)"), saying "subclass not loaded" when the sheet names a homebrew subclass this page does not
// have. The record already says it when it was made without the pack; this also says it for one made with the pack and shown after the pack went (`missingOf` is the
// engine's own reading of the sheet). A character with no sheet (hand-typed, or not sent to this page) is shown as its record says.
export function classTitle(e) {
  const cls = String(e?.cls ?? '');
  if (!e?.sheet || /subclass not loaded/.test(cls)) return cls;
  let gone = [];
  try { gone = missingOf(e.sheet); } catch { return cls; }
  if (!gone.length) return cls;
  return `${e.sheet.classes ? cls : cls.replace(/ \([^)]*\)$/, '')} (subclass not loaded)`;
}
// For the DM's sheet: the sentence for each homebrew subclass the sheet names that this page does not have ('' if none). The ids are the sheet's own text.
export function missingText(e) {
  if (!e?.sheet) return '';
  let gone = [];
  try { gone = missingOf(e.sheet); } catch { return ''; }
  if (!gone.length) return /subclass not loaded/.test(String(e.cls ?? '')) ? `${e.name} was made while its subclass was not loaded, and the table has it again. Refresh from sheet brings the subclass features and spells in.` : '';
  return gone.map((m) => `${e.name}: its subclass "${m.id}" is not loaded at this table, so its subclass features and spells are absent until its pack is added again. Refresh from sheet brings them back then.`).join(' ');
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
  let b = fresh(), mode = 'add', target = null, base = null, base0 = null, pending = null, keep = null;       // `keep`: where a sheet goes in 'mine' mode
  // In 'mine' mode (the start flow, issue #556): the trail the title shows, the key of this character's draft ('new' or its id), what the sheet
  // held when it was opened (a draft is kept only once it differs), and whether a draft was picked up.
  let trail = [], draftKey = null, baseline = '', pickedUp = null, opening = false, moreOpen = false;
  const open = new Set(['spells-0']);          // spell groups left open across redraws
  const refs = {};

  const panel = el('aside', { id: 'qb', class: 'panel qe qb', hidden: true, 'aria-label': 'Build a character from class and level' });
  document.body.append(panel);

  function fresh(cls = classIds[0]) {
    const c = CONTENT.classes[cls];
    return { name: '', class: cls, subclass: undefined, level: 1, abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, abilText: null, hand: null, sc: freshScores(keepRead(RULE_KEY)),
      skills: [], expertise: [], choices: {}, feats: [], armour: null, shield: false, weapons: [], spells: [], color: DEFAULT_COLOR, keep: {}, c };
  }
  // The sheet the engine takes: choices only, nothing empty.
  function sheet() {
    const parts = b.sc.method === 'hand' ? null : scoreParts(b.sc, dayNow());
    const s = { name: b.name.trim(), class: b.class, level: b.level, abilities: parts ? parts.abilities : { ...b.abilities }, skills: [...b.skills] };
    if (parts?.scores) s.scores = parts.scores;
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
    x.keep = keptOf(s); x.sc = scoresDraft(s, keepRead(RULE_KEY)); x.hand = { ...x.abilities };
    return x;
  }
  const safeDerive = (s) => { try { return derive(s); } catch { return null; } };

  // ---------- the draft (start flow only): what is filled in is kept in this browser, so Back never loses it ----------
  const snapshot = () => { const { c, ...rest } = b; void c; return JSON.stringify(rest); };
  function keepDraft() {
    if (mode !== 'mine' || !draftKey || opening) return;
    const now = snapshot(), d = loadDraft();
    saveDraft(now === baseline ? dropBuild(d, draftKey) : keepBuild(d, draftKey, JSON.parse(now)));
  }
  const clearDraft = () => { if (draftKey) saveDraft(dropBuild(loadDraft(), draftKey)); };
  // A draft read back: the choices it holds laid over a fresh sheet of its class; null if it does not make sense (then it is not used).
  function fromDraft(saved) {
    try {
      if (!classIds.includes(saved.class)) return null;
      const x = Object.assign(fresh(saved.class), saved, { c: CONTENT.classes[saved.class] });
      x.abilities = { ...fresh().abilities, ...saved.abilities };
      for (const a of ABILITIES) if (!Number.isInteger(x.abilities[a])) x.abilities[a] = NaN;       // an empty box was kept as null
      if (typeof x.name !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(x.color)) return null;
      for (const k of ['skills', 'expertise', 'feats', 'weapons', 'spells']) if (!Array.isArray(x[k])) return null;
      const keepB = b; b = x;
      try { limits(); } catch { b = keepB; return null; }
      b = keepB;
      return x;
    } catch { return null; }
  }

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
    panel.textContent = ''; scrollOff();
    for (const k of Object.keys(refs)) delete refs[k];
    const L = limits(), c = L.c, locked = mode === 'levelup';
    const title = mode === 'levelup' ? `Level up ${target.name}` : mode === 'edit' ? `Edit ${target.name}` : mode === 'mine' ? (target ? `Edit ${target.name}` : 'New character for My characters') : 'Build from class and level';
    let head = el('div', { class: 'qe-head' }, el('h2', { text: title }), el('button', { type: 'button', class: 'close', id: 'qb-close', text: 'Close', onclick: close }));
    if (mode === 'mine') {
      // The start flow: a Back button that says where it goes and a title that says where you are. Back keeps the draft.
      const bar = startBar(el, { backId: 'qb-close', titleId: 'qb-title', onBack: close });
      bar.show(trail); head = bar.bar;
    }
    const parts = [head];
    if (mode === 'mine') parts.push(draftBar());
    if (mode === 'levelup') parts.push(gainedBox());
    if (mode === 'add' && importButton) parts.push(el('div', { class: 'row' }, importButton(), el('small', { class: 'note', text: 'Or start from a Fantasy Grounds export.' })));

    // Who: name, colour, class, subclass, level
    const sel = (label, id, options, value, onchange, disabled, wide) => {
      const s = el('select', { id: `qb-${id}`, disabled }, ...options.map(([v, t]) => el('option', { value: v, text: t })));
      s.value = value; s.onchange = () => onchange(s.value);
      return el('label', { class: wide ? 'qe-f wide' : 'qe-f' }, el('span', { text: label }), s);
    };
    const name = el('input', { id: 'qb-name', type: 'text', value: b.name, maxLength: 40, autocomplete: 'off', autocapitalize: 'words', spellcheck: false, oninput: (ev) => { b.name = ev.target.value; update(); } });
    const color = colourField();
    parts.push(el('section', {}, el('h3', { text: 'Who' }), el('div', { class: 'qe-grid qe-2' },
      el('label', { class: 'qe-f wide' }, el('span', { text: 'Name' }), name),
      sel('Class', 'class', classIds.map((id) => [id, CONTENT.classes[id].name]), b.class, (v) => {
        const keep = { name: b.name, color: b.color, abilities: b.abilities, abilText: b.abilText, hand: b.hand, sc: b.sc, level: b.level, keep: b.keep };   // a new class starts with no feats
        b = Object.assign(fresh(v), keep); autoSubclass(); build();
      }, locked || mode === 'edit'),
      sel('Level', 'levelsel', Array.from({ length: 20 }, (_, i) => [String(i + 1), String(i + 1)]), String(b.level), (v) => { b.level = +v; autoSubclass(); build(); }, locked),
      sel('Subclass', 'subclass', subclassChoices(c, b.level, b.subclass), b.subclass ?? '', (v) => { b.subclass = v || undefined; build(); }, false, true),
      el('div', { class: 'qe-f wide', role: 'group', 'aria-labelledby': 'qb-color-label' }, el('span', { id: 'qb-color-label', text: 'Colour' }), color)),
      ...(subclassNote(c, b.subclass) ? [el('p', { class: 'note', id: 'qb-subclass-note', text: subclassNote(c, b.subclass) })] : [])));

    // Abilities: four ways to make the scores (docs/specs/ability-scores.md)
    parts.push(scoresSection(c, locked));

    // Features that ask for a choice
    const asks = L.feats.filter((x) => x.f.options && !x.option);
    // A feature that picks several options from a list (Metamagic: up to 2 at level 2, 2 more at 10): ticks, none twice across features.
    const pickList = (x) => {
      const mine = Array.isArray(b.choices[x.f.id]) ? b.choices[x.f.id] : [], taken = asks.filter((y) => y !== x && y.f.pick).flatMap((y) => b.choices[y.f.id] ?? []);
      return el('div', { class: 'qb-pick', id: `choice-${x.f.id}` }, el('h4', { text: `${x.f.name}: choose up to ${pickLimit(x)}` }),
        el('p', { class: 'note', id: `count-${x.f.id}`, text: `${mine.length} of ${pickLimit(x)} chosen` }),
        ...x.f.options.map((o) => {
          const need = optionWhy(x, o, mine, b.spells), on = mine.includes(o.id), off = !on && (mine.length >= pickLimit(x) || taken.includes(o.id) || !!need);
          return scrollOn(el('label', { class: 'check qe-tick', 'data-option': o.id }, el('input', { type: 'checkbox', id: `pick-${x.f.id}-${o.id}`, checked: on, disabled: off,
            onchange: (ev) => { const next = ev.target.checked ? [...mine, o.id] : mine.filter((i) => i !== o.id); if (next.length) b.choices[x.f.id] = next; else delete b.choices[x.f.id]; build(); } }),
            el('span', {}, o.name + (taken.includes(o.id) ? ' (chosen above)' : ''), need || (on && optionWhy(x, o, mine.filter((i) => i !== o.id), b.spells)) ? el('small', { class: 'note', text: ` ${need || optionWhy(x, o, mine.filter((i) => i !== o.id), b.spells)}` }) : null)), () => ({ title: o.name, sub: x.f.name, text: o.text }));
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
    const trained = armourTrained(c, L.feats.map((x) => x.f.grants).filter(Boolean)), aNote = armourNote(c, trained, armour), shieldNo = !trained.has('shield');
    const opts = armourOptions(armour, trained, b.armour), armourSel = sel('Armour', 'armour', opts.map(([v, t]) => [v, t]), b.armour ?? '', (v) => { b.armour = v || null; update(); });
    [...armourSel.querySelectorAll('option')].forEach((o, i) => { o.disabled = opts[i][2]; });
    parts.push(el('section', {}, el('h3', { text: 'Armour and weapons' }), el('div', { class: 'qe-grid qe-2' },
      armourSel,
      el('label', { class: 'check qe-tick' }, el('input', { type: 'checkbox', id: 'qb-shield', checked: b.shield, disabled: shieldNo && !b.shield, onchange: (ev) => { b.shield = ev.target.checked; update(); } }), el('span', { text: `Shield (+2 AC)${shieldNo ? ' (no training)' : ''}` }))),
      ...(aNote ? [el('p', { class: 'note', id: 'qb-armour-note', text: aNote })] : []),
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
    parts.push(el('div', { class: 'qe-foot' }, refs.problems, el('div', { class: 'row' }, refs.save, el('button', { type: 'button', id: 'qb-cancel', text: mode === 'mine' ? '\u2190 Back' : 'Cancel', onclick: close }))));
    panel.append(...parts);
    update();
    panel.scrollTop = scroll;
    if (focus && focus !== 'qb-name' && !/^qb-abil/.test(focus)) document.getElementById(focus)?.focus({ preventScroll: true });
  }

  // ---------- ability scores ----------
  const placeholder = (a) => String(b.abilText?.[a] ?? b.abilities[a]);
  // The six typed boxes, as they always were: "Enter by hand" (and a sheet with no record of how its scores were made).
  function handBoxes(c) {
    const ab = el('div', { class: 'qe-abil' });
    for (const a of ABILITIES) {
      const out = el('output', { class: 'qe-mod', id: `qb-mod-${a}`, text: signed(mod(b.abilities[a])) });
      const input = el('input', { id: `qb-abil-${a}`, type: 'text', inputMode: 'numeric', autocomplete: 'off', maxLength: 2, value: placeholder(a),
        oninput: (ev) => {
          (b.abilText ??= {})[a] = ev.target.value;
          const n = Number(ev.target.value.trim() === '' ? NaN : ev.target.value);
          b.abilities[a] = Number.isInteger(n) ? n : NaN; out.textContent = Number.isInteger(n) ? signed(mod(n)) : '–'; update();
        } });
      ab.append(el('div', { class: 'qe-ab' }, el('label', { class: 'qe-f qe-ab-in' }, el('span', { text: a.toUpperCase() }), input), out,
        el('small', { class: 'note', text: c.saves.includes(a) ? 'Save proficiency' : '' })));
    }
    return ab;
  }
  const deviceRule = () => cleanRule(keepRead(RULE_KEY));
  // Switching the way scores are made keeps what was typed (it comes back with "Enter by hand"); nothing is thrown away.
  function setMethod(m) {
    const sc = b.sc;
    if (m === sc.method) return;
    if (sc.method === 'hand') { b.hand = { ...b.abilities }; }
    sc.method = m;
    if (m === 'hand') { b.abilities = { ...(b.hand ?? b.abilities) }; b.abilText = null; }
    else {
      if (m === 'roll' && !sc.roll) { const kept = keepRead(ROLL_KEY); if (kept && Array.isArray(kept.rolls) && kept.rolls.length === 6) { sc.roll = { rolls: kept.rolls, rule: cleanRule(kept.rule), by: 'device', ...(typeof kept.at === 'string' ? { at: kept.at } : {}) }; sc.rule = sc.roll.rule; } }
      b.abilities = scoreParts(sc, dayNow()).abilities;
    }
    build();
  }
  function scoresSection(c, locked) {
    const sc = b.sc, sec = el('section', { id: 'qb-scores', class: 'sc' }, el('h3', { text: 'Ability scores' }));
    const bonus = bonusText(b.keep.scoreBonus);
    const bonusLine = bonus ? el('p', { class: 'note qb-bonus', id: 'qb-scorebonus' }, el('span', { id: 'qb-scorebonus-text', text: `${bonus}. Added after the scores above, up to 30.` }),
      mode === 'mine' ? null : el('button', { type: 'button', id: 'qb-scorebonus-remove', class: 'qb-bonus-remove', text: 'Remove', 'aria-label': `Remove the ${bonus}`, onclick: () => { b.keep = withoutBonus(b.keep); build(); } })) : null;
    // A level-up changes no score: how they were made is shown, not offered.
    if (locked && sc.method !== 'hand') {
      sec.append(el('p', { class: 'note', id: 'qb-sc-line', text: `${scoresLine(sheet())}. A level-up does not change them; a feat chosen below adds its own points.` }),
        el('div', { class: 'sc-final' }, ...ABILITIES.map((a) => el('div', { class: 'qe-ab' }, el('b', { text: a.toUpperCase() }), el('output', { class: 'qe-mod', id: `qb-mod-${a}`, text: `${b.abilities[a]} (${signed(mod(b.abilities[a]))})` })))), ...(bonusLine ? [bonusLine] : []));
      return sec;
    }
    sec.append(el('div', { class: 'sc-methods', role: 'group', 'aria-label': 'How the scores are made' }, ...Object.entries(METHOD_NAMES).map(([m, name]) =>
      el('button', { type: 'button', id: `qb-method-${m}`, class: 'sc-method', 'aria-pressed': String(sc.method === m), text: name, onclick: () => setMethod(m) }))));
    if (sc.method === 'hand') {
      sec.append(handBoxes(c),
        el('p', { class: 'note', id: 'qb-sc-line', text: 'Enter each score as it stands after background. A feat chosen below that raises a score adds its points, and so do features that raise one (Primal Champion). Or choose a way above to make them; what you type here is kept.' }), ...(bonusLine ? [bonusLine] : []));
      return sec;
    }
    const parts = scoreParts(sc, dayNow()), base = scoreBase(sc), bgd = scoreBackground(sc);
    const used = (a) => (bgd && bgd.abilities[a] ? bgd.abilities[a] : 0);
    const rows = el('div', { class: 'sc-rows', id: 'qb-sc-rows' });
    const row = (a, control, shown) => rows.append(el('div', { class: 'sc-row', id: `qb-row-${a}` }, el('span', { class: 'sc-name' }, el('b', { text: a.toUpperCase() }), el('small', { text: ABIL_NAME[a] })), control,
      el('span', { class: 'sc-bg', id: `qb-bg-plus-${a}`, text: used(a) ? `+${used(a)}` : '' }), el('output', { class: 'sc-final-score', id: `qb-final-${a}`, 'aria-label': `${ABIL_NAME[a]} after background` , text: base[a] === null ? '–' : String(parts.abilities[a]) }),
      el('output', { class: 'qe-mod', id: `qb-mod-${a}`, text: base[a] === null ? '–' : signed(mod(parts.abilities[a])) }), shown ?? null));
    const pick = (id, options, value, onchange, label) => { const s = el('select', { id, 'aria-label': label }, ...options.map(([v, tx]) => el('option', { value: v, text: tx }))); s.value = value ?? ''; s.onchange = () => onchange(s.value); return s; };
    let line = '';
    if (sc.method === 'standard') {
      const taken = (a) => ABILITIES.filter((x) => x !== a).map((x) => sc.std[x]);
      const suggest = ARRAY_BY_CLASS[b.class];
      sec.append(el('div', { class: 'row' }, el('button', { type: 'button', id: 'qb-suggest', text: `Suggest for a ${c.name}`, disabled: !suggest, onclick: () => { Object.assign(sc.std, suggest); build(); } }),
        el('small', { class: 'note', text: 'The SRD\'s own placement of 15, 14, 13, 12, 10 and 8 for the class.' })));
      for (const a of ABILITIES) row(a, pick(`qb-std-${a}`, [['', 'Choose…'], ...STANDARD_ARRAY.map((n) => [String(n), taken(a).includes(n) ? `${n} (used)` : String(n)])], sc.std[a] === null ? '' : String(sc.std[a]),
        (v) => { sc.std[a] = v === '' ? null : +v; if (v !== '') for (const x of ABILITIES) if (x !== a && sc.std[x] === +v) sc.std[x] = null; build(); }, `${ABIL_NAME[a]}: a number of the array`));
      line = `Used ${ABILITIES.filter((a) => sc.std[a] !== null).length} of 6 numbers.`;
    } else if (sc.method === 'pointcost') {
      const left = pointsLeft(sc.pts), step = (a, d) => { sc.pts[a] += d; build(); };
      for (const a of ABILITIES) {
        const v = sc.pts[a], next = v < 15 ? POINT_COST[v + 1] - POINT_COST[v] : Infinity;
        row(a, el('span', { class: 'sc-step' }, el('button', { type: 'button', id: `qb-pc-${a}-minus`, text: '−', 'aria-label': `Lower ${ABIL_NAME[a]}`, disabled: v <= 8, onclick: () => step(a, -1) }),
          el('output', { id: `qb-pc-${a}`, text: String(v), 'aria-label': `${ABIL_NAME[a]} before background` }),
          el('button', { type: 'button', id: `qb-pc-${a}-plus`, text: '+', 'aria-label': `Raise ${ABIL_NAME[a]}`, disabled: v >= 15 || next > left, onclick: () => step(a, 1) })));
      }
      const spent = pointsSpent(sc.pts);
      line = `${POINT_BUDGET} points, ${spent} spent, ${left} left. Scores go from 8 to 15 before the background.${left === 0 ? ' No points left: lower a score to raise another.' : ''}`;
    } else {
      const R = sc.roll, rule = R ? R.rule : sc.rule;
      if (!R) {
        const ruleBox = el('div', { class: 'qe-grid qe-2', id: 'qb-rule' },
          el('label', { class: 'qe-f' }, el('span', { text: 'Reroll (rules for rolled scores on this device)' }), pick('qb-rule-reroll', [['none', 'No score may be rolled again (SRD)'], ['below', 'A score below a number, once'], ['each', 'Every score, once']], sc.rule.reroll,
            (v) => { sc.rule = cleanRule({ reroll: v, ...(v === 'below' ? { below: sc.rule.below ?? 10 } : {}), result: sc.rule.result }); keepWrite(RULE_KEY, sc.rule); build(); })),
          sc.rule.reroll === 'below' ? el('label', { class: 'qe-f' }, el('span', { text: 'Below' }), pick('qb-rule-below', [...BELOW].sort((x, y) => x - y).map((n) => [String(n), String(n)]), String(sc.rule.below),
            (v) => { sc.rule = cleanRule({ ...sc.rule, below: +v }); keepWrite(RULE_KEY, sc.rule); build(); })) : null,
          sc.rule.reroll !== 'none' ? el('label', { class: 'qe-f wide' }, el('span', { text: 'The result that stands' }), pick('qb-rule-result', [['new', 'The new roll stands'], ['higher', 'The higher of the two stands']], sc.rule.result,
            (v) => { sc.rule = cleanRule({ ...sc.rule, result: v }); keepWrite(RULE_KEY, sc.rule); build(); })) : null);
        sec.append(ruleBox, el('p', { class: 'note', id: 'qb-rule-text', text: ruleText(sc.rule) }),
          el('div', { class: 'row' }, el('button', { type: 'button', id: 'qb-roll', class: 'sc-roll', text: 'Roll the dice', onclick: () => {
            sc.roll = { rolls: rollHere(), rule: cleanRule(sc.rule), by: 'device', at: dayNow() }; sc.place = blank(); sc.saved = false;
            keepWrite(ROLL_KEY, { rolls: sc.roll.rolls, rule: sc.roll.rule, at: sc.roll.at }); build(); } })),
          el('p', { class: 'note', text: 'Four dice for each score, the lowest set aside, six times. Rolled on this device: the DM will see this, and that it was not rolled at the table.' }));
      } else {
        const where = R.by === 'table' ? 'Rolled at the table.' : `Rolled on this device${dayText(R.at) ? ` on ${dayText(R.at)}` : ''}. The DM will see this.`;
        sec.append(el('p', { class: 'note', id: 'qb-rule-text', text: `${where} ${ruleText(R.rule)}` }));
        const chips = el('div', { class: 'sc-chips', id: 'qb-chips' });
        R.rolls.forEach((s, i) => {
          const why = sc.saved ? 'This character was saved with these rolls.' : rerollWhy(s, R.rule), can = !sc.saved && mayReroll(s, R.rule);
          const onto = ABILITIES.find((a) => sc.place[a] === i);
          chips.append(el('div', { class: 'sc-chip', id: `qb-chip-${i}`, 'data-score': String(standing(s, R.rule)) }, el('b', { text: `Roll ${i + 1}: ${standing(s, R.rule)}` }), el('small', { text: setText(s, R.rule).replace(/^\d+ /, '') }),
            onto ? el('small', { class: 'note', text: `On ${onto.toUpperCase()}` }) : null,
            can ? el('button', { type: 'button', id: `qb-reroll-${i}`, text: 'Roll this score again', onclick: () => { s.again = rerollHere(); keepWrite(ROLL_KEY, { rolls: R.rolls, rule: R.rule, at: R.at }); build(); } })
              : el('small', { class: 'note', id: `qb-noreroll-${i}`, text: why })));
        });
        sec.append(chips);
        for (const a of ABILITIES) {
          const free = R.rolls.map((s, i) => i).filter((i) => i === sc.place[a] || !ABILITIES.some((x) => sc.place[x] === i));
          row(a, pick(`qb-place-${a}`, [['', 'Choose…'], ...free.map((i) => [String(i), `${standing(R.rolls[i], R.rule)} (roll ${i + 1})`])], Number.isInteger(sc.place[a]) ? String(sc.place[a]) : '',
            (v) => { sc.place[a] = v === '' ? null : +v; build(); }, `${ABIL_NAME[a]}: a rolled score`));
        }
        const rerolled = R.rolls.filter((s) => s.again).length;
        line = `${where}${rerolled ? ` ${rerolled} of 6 rolled again.` : ''}`;
      }
    }
    if (sc.method !== 'roll' || sc.roll) sec.append(rows);
    // The background's increase
    const g = sc.bg, abil = bgAbilities(g.id), names = (list) => list.map((a) => [a, ABIL_NAME[a]]);
    const bgBox = el('div', { class: 'sc-bgbox', id: 'qb-bgbox' }, el('label', { class: 'qe-f wide' }, el('span', { text: 'Background' }), pick('qb-bg', [['', 'No increase from a background'], ...Object.entries(BACKGROUNDS).map(([id, d]) => [id, d.name]), ['other', 'Another background (your GM\'s)']], g.id,
      (v) => { Object.assign(g, { id: v, plus2: '', plus1: '', all: ['', '', ''] }); build(); }, 'Background')));
    if (g.id) {
      bgBox.append(el('label', { class: 'qe-f wide' }, el('span', { text: 'Its increase' }), pick('qb-bg-mode', [['twoone', '+2 to one ability and +1 to another'], ['all', '+1 to each of three abilities']], g.mode, (v) => { g.mode = v; build(); }, 'Its increase')));
      if (g.mode === 'twoone') bgBox.append(el('div', { class: 'qe-grid qe-2' },
        el('label', { class: 'qe-f' }, el('span', { text: '+2 to' }), pick('qb-bg-plus2', [['', 'Choose…'], ...names(abil)], g.plus2, (v) => { g.plus2 = v; if (g.plus1 === v) g.plus1 = ''; build(); }, '+2 to')),
        el('label', { class: 'qe-f' }, el('span', { text: '+1 to' }), pick('qb-bg-plus1', [['', 'Choose…'], ...names(abil)], g.plus1, (v) => { g.plus1 = v; if (g.plus2 === v) g.plus2 = ''; build(); }, '+1 to'))));
      else if (g.id === 'other') bgBox.append(el('div', { class: 'qe-grid qe-2' }, ...[0, 1, 2].map((i) => el('label', { class: 'qe-f' }, el('span', { text: `+1 to (${i + 1})` }), pick(`qb-bg-all-${i}`, [['', 'Choose…'], ...names(ABILITIES)], g.all[i], (v) => { g.all[i] = v; build(); }, `+1 to ability ${i + 1}`)))));
      else bgBox.append(el('p', { class: 'note', text: `${BACKGROUNDS[g.id].name} raises ${BACKGROUNDS[g.id].abilities.map((a) => ABIL_NAME[a]).join(', ')} by 1 each.` }));
      bgBox.append(el('p', { class: 'note', text: 'No score goes above 20. The background\'s feat, skills and tool are chosen where they always were.' }));
    }
    sec.append(bgBox, el('p', { class: 'note', id: 'qb-sc-line', text: line }));
    if (sc.method === 'roll' && sc.roll && parts.scores) sec.append(el('p', { class: 'note', id: 'qb-dm-line', text: `What the DM sees: ${dmLine({ ...sheet(), scores: parts.scores })}` }));
    sec.append(el('p', { class: 'note', text: 'What you typed under "Enter by hand" is kept.' }), ...(bonusLine ? [bonusLine] : []));
    return sec;
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
              return scrollOn(el('label', { class: 'check qe-tick' }, el('input', { type: 'checkbox', id: `feat-${key}-spell-${x.id}`, checked: on, disabled: !on && here.length >= most,
                onchange: (ev) => { const next = ev.target.checked ? [...spells, x.id] : spells.filter((i) => i !== x.id); put({ spells: next.length ? next : undefined }); build(); } }), el('span', { text: x.name })), () => spellCard(x));
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
          return scrollOn(el('label', { class: 'check qe-tick' }, el('input', { type: 'checkbox', id: `qb-spell-${s.id}`, checked: on || auto, disabled: auto || (!on && full),
            onchange: (ev) => { toggle(b.spells, s.id, ev.target.checked); build(); } }), el('span', { text: auto ? `${s.name} (always prepared)` : s.name })), () => spellCard(s));
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
  const featureRow = (f) => el('details', { class: 'qb-feat' }, scrollOn(el('summary', { text: `${f.name}${f.uses ? ` · ${usesText(f.uses)}` : ''}` }), () => ({ title: f.name, text: f.text })), el('p', { class: 'note', text: f.text ?? '' }));

  // The colour: a row of swatches (44 px each, a tick on the chosen one) and "More", which opens a box for any `#rrggbb`. No browser dialog.
  function colourField() {
    const wrap = el('div', { class: 'qb-colour', id: 'qb-color' });
    const row = el('div', { class: 'qb-swatches', role: 'radiogroup', 'aria-label': 'Colour' });
    // The last swatch is the colour in use when it is not one of the nine (an imported sheet, or one typed in More); it is hidden otherwise.
    const custom = el('button', { type: 'button', role: 'radio', class: 'qb-swatch', id: 'qb-color-current', 'aria-label': 'Current colour', title: 'Current colour', hidden: true });
    const mark = () => {
      const mine = b.color.toLowerCase(), listed = PALETTE.some(([v]) => v === mine);
      custom.hidden = listed; if (!listed) { custom.dataset.color = mine; custom.style.background = mine; }
      for (const sw of row.querySelectorAll('.qb-swatch')) { const on = !sw.hidden && sw.dataset.color === mine; sw.setAttribute('aria-checked', String(on)); sw.classList.toggle('on', on); sw.textContent = on ? '\u2713' : ''; }
    };
    for (const [v, name] of PALETTE) {
      row.append(el('button', { type: 'button', role: 'radio', class: 'qb-swatch', id: `qb-color-${v.slice(1)}`, 'data-color': v, 'aria-label': name, title: name, style: `background:${v}`,
        onclick: () => { b.color = v; mark(); if (hex) hex.value = v; update(); } }));
    }
    row.append(custom);
    const hex = el('input', { type: 'text', id: 'qb-color-hex', value: b.color, maxLength: 7, autocomplete: 'off', autocapitalize: 'off', spellcheck: false, 'aria-label': 'Colour as #rrggbb', 'aria-describedby': 'qb-color-note',
      oninput: () => { const v = hexOf(hex.value); note.textContent = v || !hex.value.trim() ? '' : 'Type a colour like #c8553d: a # and six letters or digits (0 to 9, a to f).'; if (v) { b.color = v; mark(); update(); } } });
    const note = el('p', { class: 'note qb-colour-note', id: 'qb-color-note', role: 'status' });
    const box = el('div', { class: 'qb-more', hidden: !moreOpen }, el('label', { for: 'qb-color-hex', text: 'Any colour, as #rrggbb' }), hex, note);
    const more = el('button', { type: 'button', class: 'qb-more-btn', id: 'qb-color-more', text: moreOpen ? 'Fewer' : 'More\u2026', 'aria-expanded': String(moreOpen),
      onclick: () => { moreOpen = !moreOpen; box.hidden = !moreOpen; more.textContent = moreOpen ? 'Fewer' : 'More\u2026'; more.setAttribute('aria-expanded', String(moreOpen)); if (moreOpen) hex.focus({ preventScroll: true }); } });
    row.append(more);
    wrap.append(row, box);
    mark();
    return wrap;
  }
  // Under the title in the start flow: whether a draft was picked up, and Start over (two taps: it empties the sheet).
  function draftBar() {
    const over = el('button', { type: 'button', class: 'quiet leave', id: 'qb-startover', text: 'Start over' });
    over.onclick = () => {
      if (over.dataset.armed !== '1') { over.dataset.armed = '1'; over.textContent = 'Tap again to empty the sheet'; setTimeout(() => { over.dataset.armed = ''; over.textContent = 'Start over'; }, 3000); return; }
      clearDraft(); pickedUp = null;
      b = target && base0 ? fromSheet(base0) : fresh(); autoSubclass(); baseline = snapshot(); build();
    };
    return el('div', { class: 'sf-draft', id: 'qb-draft' }, el('p', { class: 'note', id: 'qb-draft-note', text: pickedUp ? `Picked up where you left off (saved ${whenLine(pickedUp)}). It is kept here until you save or start over.` : 'What you fill in is kept on this device if you go Back.' }), over);
  }

  // The live numbers and the problems; redrawn after every change.
  function update() {
    if (!refs.derived) return;
    keepDraft();
    const s = sheet(), problems = [...(b.sc.method === 'hand' ? [] : scoreParts(b.sc, dayNow()).problems), ...validate(s)], d = safeDerive({ ...s, abilities: Object.fromEntries(ABILITIES.map((a) => [a, Number.isInteger(s.abilities[a]) ? s.abilities[a] : 10])) });
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
    if (validate(s).length || (b.sc.method !== 'hand' && scoreParts(b.sc, dayNow()).problems.length)) return;
    // A roll that was kept on this device is used up once a sheet is saved with it (a new character rolls anew).
    const used = () => { if (s.scores?.method === 'roll' && s.scores.by === 'device') keepWrite(ROLL_KEY, null); };
    if (mode === 'mine') {
      const why = keep?.(s);
      if (why) { refs.problems.append(el('li', { text: why })); refs.problems.hidden = false; return; }
      used();
      clearDraft();
      return close();
    }
    used();
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
      trail = o.trail ?? ['New character']; draftKey = mode === 'mine' ? (o.cid ?? 'new') : null; base0 = mode === 'mine' ? (o.sheet ?? null) : null; pickedUp = null; moreOpen = false;
      panel.classList.toggle('over-lobby', mode === 'mine');             // it opens over the lobby, which is above the usual panels
      if (mode === 'mine') { b = o.sheet ? fromSheet(o.sheet) : fresh(); target = o.sheet ? { name: o.sheet.name } : null; autoSubclass(); }
      else if (mode === 'add') b = fresh(); else {
        b = fromSheet(o.entity.sheet);
        if (mode === 'levelup') {
          base = safeDerive(o.entity.sheet)?.record ?? null;
          b.level = Math.min(20, o.entity.sheet.level + 1); autoSubclass();
        }
      }
      if (mode === 'mine') {
        baseline = snapshot();
        const saved = loadDraft().build[draftKey], x = saved ? fromDraft(saved.b) : null;
        if (x) { b = x; pickedUp = saved.at; } else if (saved) saveDraft(dropBuild(loadDraft(), draftKey));    // a draft that makes no sense is thrown away
      }
      opening = true;
      try { build(); } finally { opening = false; }
      panel.hidden = false; panel.scrollTop = 0;
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
