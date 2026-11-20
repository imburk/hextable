// Build from class and level: the second way to add a character (the first is the hand-typed form in
// quickentry.js). The screen only collects a sheet of choices (see derive.js) and shows what `derive`
// and `validate` say about it; it decides no rule. Saving sends `setSheet` (new or corrected
// character) or `levelUp`, and the engine checks the sheet again.
import { ABILITIES, SKILLS } from './shared/content/schema.js';
import { CONTENT } from './shared/content/index.js';
import { startBar, loadDraft, saveDraft, keepBuild, dropBuild, whenLine } from './startflow.js';
import { derive, validate, featuresOf, classOf, mod, proficiencyFor, pickFor, featChoices, missingOf } from './shared/derive.js';
import { STANDARD_ARRAY, POINT_COST, POINT_BUDGET, BACKGROUNDS, ARRAY_BY_CLASS, DEFAULT_RULE, BELOW, cleanRule, ruleText, pointsSpent, pointsLeft, rollScores, rollScore, mayReroll, rerollWhy, rerollOpen, topThree, tableRule,
  standing, applyBackground, checkScores, scoresLine, dmLine, setText, dayText } from './shared/scores.js';
import { keyedRng } from './shared/rng.js';
import { hide as scrollOff } from './scrolltip.js';
import { el, accordion, pickRow, chip, groupHead, disclosure } from './pickui.js';
import { signed, nice, usesText, weaponLines, weaponSummary, armourLines, armourSummary, armourCost, armourAlso, weaponCost, weaponWords, weaponTrained, trainLine, bareFeatures, featureWhen, firstSentence,
  resourcesOf, costText, groupedFeatures, slotList, attackRows, headsUp, spellTag } from './buildparts.js';
export { usesText };

const ABIL_NAME = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
const DEFAULT_COLOR = '#3a7d44';
// The colours a character's pawn can be, offered as a row of swatches (a theme has one colour for the whole party, so this set is the build screen's own).
// The first four are the colours of the starter party. A sheet's colour is always `#rrggbb`, which is what the engine's linter takes.
export const PALETTE = [['#c8553d', 'Red'], ['#d9a441', 'Gold'], ['#4a7c59', 'Green'], ['#5b6fb5', 'Blue'], ['#3a7d44', 'Meadow'], ['#8e5ba6', 'Purple'], ['#3a8f9c', 'Teal'], ['#c2607f', 'Rose'], ['#7d8590', 'Slate']];
// What the "More" box was given as a colour: `#rrggbb` (lower case), or '' when it is not one. A leading # is optional.
export const hexOf = (text) => { const m = /^#?([0-9a-fA-F]{6})$/.exec(String(text ?? '').trim()); return m ? `#${m[1].toLowerCase()}` : ''; };
// Fields of a sheet this screen has no control for: kept as they were when a sheet is edited.
// (`scoreBonus` is the DM's score bonus, e.g. from an import; this screen does not show it yet, DEBT C20. `species` is the sheet's species,
// docs/specs/species.md: kept whole, its id and choices, until the species picker (SP9) gives it a control.)
export const KEEP = ['extraSkills', 'size', 'speed', 'senses', 'tools', 'gear', 'items', 'attuning', 'shieldStowed', 'scoreBonus', 'species'];
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
    if (sc.method === 'roll') Object.assign(scores, { rolls: structuredClone(sc.roll.rolls), rule: cleanRule(sc.roll.rule), by: sc.roll.by ?? 'device', ...(sc.roll.at !== undefined ? { at: sc.roll.at } : (sc.roll.by ?? 'device') === 'device' && today ? { at: today } : {}) });
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

// ---------- rolling at the table (docs/specs/ability-scores.md, #578) ----------
// In a game the dice are the game's: the sheet sends `rollAbilityScores` and `rerollAbilityScore` and draws what the events say. These are the pure parts.
// `heard` is what this page was told of its own roll: { by, at, rolls: [{ dice, again? }], result? } (`result`: which result stood at the last reroll, where the event shows it).
const faces = (dice) => dice.map((d) => d.value);
export const rollsOfEvent = (ev) => ev.sets.map((s) => ({ dice: faces(s.dice) }));
// A reroll event written into a list of rolls, once.
export function rerollInto(rolls, ev) { const s = rolls[ev.index]; if (s && !s.again) s.again = faces(ev.to.dice); }
// The result that stood at a reroll: `stands: 'old'` can only be "the higher"; a new roll that stood below the old can only be "the new"; otherwise the setting says nothing, so there is none.
export const resultOf = (ev) => (ev.stands === 'old' ? 'higher' : ev.to.total < ev.from.total ? 'new' : undefined);
// The rule a table roll is kept under: the table's rule now, the result that stood where a reroll showed it, and "every score" if the rerolls already made would not fit a narrower rule.
export function tableRollRule(settings, rolls, result) {
  const now = tableRule(settings), rule = result ? cleanRule({ ...now, result }) : now;
  return rolls.every((s) => !s.again || rerollOpen(rule, topThree(s.dice))) ? rule : cleanRule({ reroll: 'each', result: rule.result });
}
const sane = (s) => !!s && Array.isArray(s.dice) && s.dice.length === 4 && (s.again === undefined || (Array.isArray(s.again) && s.again.length === 4));
// The roll this table holds for the one using the sheet, as the draft's `roll`, or null. The DM's view holds every record (`scoreRolls`); a player's holds none, so what
// the events said (`heard`) is all there is. The DM's own id is not told to the sheet: it is the one the first roll came back under, else 'local' (a solo game) or 'dm'.
export function keptRoll(S, heard, myId) {
  const recs = S?.scoreRolls;
  let rolls = null, at;
  if (recs && typeof recs === 'object') {
    const who = myId ?? heard?.by ?? ['local', 'dm'].find((k) => Object.hasOwn(recs, k)) ?? 'local', rec = who !== '#seq' && Object.hasOwn(recs, who) ? recs[who] : null;
    if (rec && Array.isArray(rec.sets) && rec.sets.length === 6 && rec.sets.every(sane)) {
      rolls = rec.sets.map((x) => ({ dice: [...x.dice], ...(x.again ? { again: [...x.again] } : {}) }));
      if (heard && heard.by === who && heard.rolls.every((x, i) => x.dice.join() === rolls[i].dice.join())) at = heard.at;       // the event number is not in the record: only the event said it
    }
  } else if (heard) { rolls = structuredClone(heard.rolls); at = heard.at; }
  if (!rolls) return null;
  return { rolls, rule: tableRollRule(S?.settings, rolls, heard?.result), by: 'table', ...(at !== undefined ? { at } : {}), ...(heard?.result ? { result: heard.result } : {}) };
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

export function initBuild({ act, toast, getState, getSelected, importButton, me = () => undefined }) {
  const classIds = Object.keys(CONTENT.classes);
  let b = fresh(), mode = 'add', target = null, base = null, base0 = null, pending = null, keep = null;       // `keep`: where a sheet goes in 'mine' mode
  // In 'mine' mode (the start flow, issue #556): the trail the title shows, the key of this character's draft ('new' or its id), what the sheet
  // held when it was opened (a draft is kept only once it differs), and whether a draft was picked up.
  let trail = [], draftKey = null, baseline = '', pickedUp = null, opening = false, moreOpen = false;
  // Rolling at the table (#578): what this page was told of its own roll, and whether a roll or reroll is sent and not yet answered.
  let heard = null, waiting = null, checked = false, rolledOut = false;       // checked: the table's history of this member's rolls has come; rolledOut: the engine said this member has rolled and none is known here
  const inGame = () => mode !== 'mine' && !!getState();
  const wait = () => { clearTimeout(waiting?.timer); waiting = { timer: setTimeout(() => { waiting = null; if (!panel.hidden) build(); }, 4000) }; };      // a refusal does not come back as an event: the buttons come back after a moment
  const unwait = () => { clearTimeout(waiting?.timer); waiting = null; };
  const refs = {};

  const panel = el('aside', { id: 'qb', class: 'panel qe qb pk', hidden: true, 'aria-label': 'Build a character from class and level' });
  document.body.append(panel);
  window.matchMedia('(min-width: 900px)').addEventListener?.('change', () => { if (!panel.hidden) build(); });       // the live sheet is a strip or a panel by the width

  function fresh(cls = classIds[0]) {
    const c = CONTENT.classes[cls];
    return { name: '', class: cls, subclass: undefined, level: 1, abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, abilText: null, hand: null, sc: freshScores(keepRead(RULE_KEY)),
      skills: [], expertise: [], choices: {}, feats: [], armour: null, shield: false, weapons: [], spells: [], color: DEFAULT_COLOR, keep: {}, c };
  }
  // The sheet the engine takes: choices only, nothing empty.
  function sheet() {
    if (b.sc.roll?.by === 'table' && !b.sc.saved && inGame()) b.sc.roll.rule = tableRollRule(getState().settings, b.sc.roll.rolls, b.sc.roll.result);
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
  // The screen is one accordion (pickui.js) of sections, with the live sheet pinned beside it: a strip above it on a phone, a panel on its right on a wide screen.
  let acc = 'who';                                  // the open section (an id) or null
  const gearOpen = { armour: false, weapons: false };       // the "not proficient with" lists that were opened by hand
  let liveFolded = false, lastSig = {};
  const wide = () => window.matchMedia('(min-width: 900px)').matches;
  const flagOf = (k) => (k === 'armour' ? gearOpen.armour : gearOpen.weapons);

  // What is still to choose, in words, by section: the same facts `validate` reads (it is the engine's word that decides Save; this says where to look).
  function needs(L) {
    const out = [], s = sheet();
    if (!b.name.trim()) out.push({ sec: 'who', t: 'a name' });
    if (b.level >= 3 && !b.subclass) out.push({ sec: 'who', t: 'a subclass' });
    if (b.sc.method !== 'hand' && scoreParts(b.sc, dayNow()).problems.length) out.push({ sec: 'scores', t: 'ability scores' });
    const n = L.skills - b.skills.length;
    if (n > 0) out.push({ sec: 'skills', t: `${n} skill${n === 1 ? '' : 's'}` });
    for (const x of L.feats.filter((y) => y.f.options && !y.option && !y.f.pick && !b.choices[y.f.id])) out.push({ sec: 'choices', t: x.f.name });
    for (const sl of featChoices(s)) if (sl.taken && sl.open.length) out.push({ sec: 'feats', t: `${CONTENT.feats[sl.taken.id]?.name ?? sl.taken.id}: ${sl.open.join(', ')}` });
    return out;
  }
  const needOf = (nd, sec) => { const l = nd.filter((x) => x.sec === sec); return l.length ? `Choose ${l.map((x) => x.t).join(', ')}` : ''; };

  function sectionList(L, c, locked, nd) {
    const s = sheet(), d = safeDerive({ ...s, abilities: Object.fromEntries(ABILITIES.map((a) => [a, Number.isInteger(s.abilities[a]) ? s.abilities[a] : 10])) }), r = d?.record;
    const res = resourcesOf(L.feats, r?.feats), sub = b.subclass && CONTENT.subclasses[b.subclass]?.name;
    const list = [];
    if (mode === 'levelup') list.push({ id: 'gain', title: `Level ${base?.level ?? ''} to ${b.level}`, tip: 'What this level brings', render: () => gainedBox() });
    list.push({ id: 'who', title: 'Who', tip: `${b.name.trim() || 'Unnamed'} · ${c.name} ${b.level}${sub ? ` · ${sub}` : b.subclass === c.subclass.id ? ` · ${c.subclass.name}` : ''}`, need: needOf(nd, 'who'), render: () => whoSection(c, locked) });
    list.push({ id: 'scores', title: 'Ability scores', tip: ABILITIES.map((a) => `${a.toUpperCase()} ${Number.isInteger(s.abilities[a]) ? s.abilities[a] : '–'}`).join(' · '), need: needOf(nd, 'scores'), render: () => scoresSection(c, locked) });
    list.push({ id: 'skills', title: 'Skills', tip: `${b.skills.length ? b.skills.map(nice).join(', ') : 'None chosen yet'} · ${b.skills.length} of ${L.skills}`, need: needOf(nd, 'skills'), render: () => skillsSection(L) });
    const slots = slotList(r?.slots), nFeat = L.feats.filter((x) => !x.f.feat).length;
    list.push({ id: 'power', title: res.length ? `${res[0].title} and features` : L.cast ? 'Spell slots and features' : 'Class features',
      tip: [res.length ? `${res[0].title} ${res[0].max}, back on ${REST[res[0].recharge]}` : '', L.cast && slots.length ? `Spell slots ${slots.map(([, n]) => n).join('·')}` : '', `${nFeat} features`].filter(Boolean).join(' · '), render: () => powerSection(L, c, r, res) });
    const asks = L.feats.filter((x) => x.f.options && !x.option);
    if (asks.length) list.push({ id: 'choices', title: 'Class choices', tip: asks.map((x) => `${x.f.name}${b.choices[x.f.id] ? `: ${Array.isArray(b.choices[x.f.id]) ? b.choices[x.f.id].length : (x.f.options.find((o) => o.id === b.choices[x.f.id])?.name ?? '')}` : ''}`).join(' · '), need: needOf(nd, 'choices'), render: () => choicesSection(asks) });
    const fs = featChoices(s);
    if (fs.length) list.push({ id: 'feats', title: 'Feats', tip: fs.map((sl) => `${/\(level (\d+)\)/.test(sl.name) ? `Level ${/\(level (\d+)\)/.exec(sl.name)[1]}` : sl.name.replace(/:.*$/, '')}: ${sl.taken ? CONTENT.feats[sl.taken.id]?.name : 'none'}`).join(' · '), need: needOf(nd, 'feats'), render: () => featsSection(fs) });
    list.push({ id: 'gear', title: 'Armour and weapons', tip: gearTip(L, c), render: () => gearSection(L, c, d) });
    if (L.cast) list.push({ id: 'spells', title: 'Spells', tip: spellTip(L), render: () => spellsSection(L) });
    return list;
  }

  function build() {
    const prevBody = refs.accBody, bodyScroll = prevBody?.scrollTop ?? 0, bodyOf = refs.accOpen, focus = document.activeElement?.id;
    panel.textContent = ''; scrollOff();
    for (const k of Object.keys(refs)) delete refs[k];
    if (b.sc.roll?.by === 'table' && !b.sc.saved && inGame()) b.sc.roll.rule = tableRollRule(getState().settings, b.sc.roll.rolls, b.sc.roll.result);       // the rule it is kept under is the table's, as it stands when saved
    const L = limits(), c = L.c, locked = mode === 'levelup';
    const title = mode === 'levelup' ? `Level up ${target.name}` : mode === 'edit' ? `Edit ${target.name}` : mode === 'mine' ? (target ? `Edit ${target.name}` : 'New character for My characters') : 'Build from class and level';
    let head = el('div', { class: 'qe-head' }, el('h2', { text: title }), el('button', { type: 'button', class: 'close', id: 'qb-close', text: 'Close', onclick: close }));
    if (mode === 'mine') {
      // The start flow: a Back button that says where it goes and a title that says where you are. Back keeps the draft.
      const bar = startBar(el, { backId: 'qb-close', titleId: 'qb-title', onBack: close });
      bar.show(trail); head = bar.bar;
    }
    const nd = needs(L), secs = sectionList(L, c, locked, nd);
    if (acc !== null && !secs.some((x) => x.id === acc)) acc = 'who';
    const a = accordion({ sections: secs, open: acc, id: 'qb-acc', onOpen: (id) => { acc = id; build(); } });
    refs.accBody = a.body; refs.accOpen = acc;
    refs.derived = el('div', { id: 'qb-derived', class: 'qb-live', 'aria-label': 'The sheet so far' });
    refs.problems = el('ul', { class: 'qe-problems', id: 'qb-problems', 'aria-live': 'polite' });
    refs.why = el('p', { class: 'qb-why', id: 'qb-save-why', 'aria-live': 'polite' });
    const label = mode === 'levelup' ? `Level up to ${b.level}` : mode === 'edit' ? 'Save changes' : mode === 'mine' ? 'Save to My characters' : 'Add to the table';
    refs.save = el('button', { type: 'button', id: 'qb-save', class: 'qe-save', text: label, onclick: save });
    refs.needs = nd;
    panel.append(head, el('div', { class: 'qb-main' }, refs.derived, el('div', { class: 'qb-left' }, a.node)),
      el('div', { class: 'qb-foot' }, refs.why, refs.problems, el('div', { class: 'row' }, refs.save, el('button', { type: 'button', id: 'qb-cancel', text: mode === 'mine' ? '← Back' : 'Cancel', onclick: close }))));
    update();
    if (refs.accBody && bodyOf === acc) refs.accBody.scrollTop = bodyScroll;
    if (focus && focus !== 'qb-name' && !/^qb-abil/.test(focus)) document.getElementById(focus)?.focus({ preventScroll: true });
  }

  // ---------- Who ----------
  function whoSection(c, locked) {
    const mk = (label, id, options, value, onchange, disabled, wide2) => {
      const s = el('select', { id: `qb-${id}`, disabled }, ...options.map(([v, t]) => el('option', { value: v, text: t })));
      s.value = value; s.onchange = () => onchange(s.value);
      return el('label', { class: wide2 ? 'qe-f wide' : 'qe-f' }, el('span', { text: label }), s);
    };
    const name = el('input', { id: 'qb-name', type: 'text', value: b.name, maxLength: 40, autocomplete: 'off', autocapitalize: 'words', spellcheck: false, oninput: (ev) => { b.name = ev.target.value; update(); } });
    const sec = el('section', {});
    if (mode === 'mine') sec.append(draftBar());
    if (mode === 'add' && importButton) sec.append(el('div', { class: 'row' }, importButton(), el('small', { class: 'note', text: 'Or start from a Fantasy Grounds export.' })));
    sec.append(el('div', { class: 'qe-grid qe-2' },
      el('label', { class: 'qe-f wide' }, el('span', { text: 'Name' }), name),
      mk('Class', 'class', classIds.map((id) => [id, CONTENT.classes[id].name]), b.class, (v) => {
        const keepB = { name: b.name, color: b.color, abilities: b.abilities, abilText: b.abilText, hand: b.hand, sc: b.sc, level: b.level, keep: b.keep };   // a new class starts with no feats
        b = Object.assign(fresh(v), keepB); autoSubclass(); build();
      }, locked || mode === 'edit'),
      mk('Level', 'levelsel', Array.from({ length: 20 }, (_, i) => [String(i + 1), String(i + 1)]), String(b.level), (v) => { b.level = +v; autoSubclass(); build(); }, locked),
      mk('Subclass', 'subclass', subclassChoices(c, b.level, b.subclass), b.subclass ?? '', (v) => { b.subclass = v || undefined; build(); }, false, true),
      el('div', { class: 'qe-f wide', role: 'group', 'aria-labelledby': 'qb-color-label' }, el('span', { id: 'qb-color-label', text: 'Colour' }), colourField())),
      ...(subclassNote(c, b.subclass) ? [el('p', { class: 'note', id: 'qb-subclass-note', text: subclassNote(c, b.subclass) })] : []));
    return sec;
  }

  // ---------- Skills ----------
  // Chips (a short list of single words): tick up to the class's number; Expertise, where a feature gives it, is a second row of chips for the skills ticked.
  function skillsSection(L) {
    const picked = b.skills.length, full = picked >= L.skills;
    const chipTick = (id, text, on, off, onchange) => el('label', {}, el('input', { type: 'checkbox', id, checked: on, disabled: off, onchange }), el('span', { text }));
    const skillTick = (k) => chipTick(`qb-skill-${k}`, `${nice(k)} (${SKILLS[k].toUpperCase()})`, b.skills.includes(k), !b.skills.includes(k) && full, (ev) => { toggle(b.skills, k, ev.target.checked); if (!ev.target.checked) toggle(b.expertise, k, false); build(); });
    const sec = el('section', {}, el('h3', { text: `Skills: ${picked} of ${L.skills}` }), el('p', { class: 'pk-lead', text: `Choose ${L.skills} from the ${L.c.name}'s list. ${picked} of ${L.skills} chosen.${full ? ' Untick one to change your mind.' : ''}` }), el('div', { class: 'chipset' }, ...L.fromClass.map(skillTick)));
    if (L.extraAny) sec.append(groupHead('Any other skill', 'a feature allows these'), el('div', { class: 'chipset' }, ...Object.keys(SKILLS).filter((k) => !L.fromClass.includes(k)).map(skillTick)));
    if (L.expertise) {
      sec.append(groupHead('Expertise', `${b.expertise.length} of ${L.expertise}`), b.skills.length ? el('div', { class: 'chipset' }, ...b.skills.map((k) => chipTick(`qb-exp-${k}`, nice(k), b.expertise.includes(k), !b.expertise.includes(k) && b.expertise.length >= L.expertise, (ev) => { toggle(b.expertise, k, ev.target.checked); build(); })))
        : el('p', { class: 'pk-lead', text: 'Tick a skill above first.' }));
    }
    return sec;
  }

  // ---------- Class resource and features ----------
  const dots = (n, cls = '') => el('span', { class: 'pk-pips', 'aria-hidden': 'true' }, ...Array.from({ length: Math.min(n, 12) }, () => el('span', { class: `pip${cls}` })));
  function featureRow(f0, res, u) {
    const f = f0.grants || f0.feat ? f0 : (featuresOf(sheet()).find((x) => x.f.id === f0.id)?.f ?? f0);       // a record's feature has no grants: read the class's own entry for when it is used
    const when = featureWhen(f), own = u ?? f0.uses ?? f.uses;
    return pickRow({ id: `qb-feature-${f.id}`, kind: 'none', title: f.name, chips: [res ? chip('cost', costText(res, f)) : null, chip('when', when)].filter(Boolean), summary: firstSentence(f.text), also: own && !res ? usesText(own.max !== undefined && typeof own.max === 'number' ? own : null) : '',
      info: { title: f.name, sub: `${when}${res ? ` · costs ${costText(res, f)}` : ''}`, text: f.text } });
  }
  function powerSection(L, c, r, res) {
    const sec = el('section', { class: 'qb-power' }), recFeats = new Map((r?.feats ?? []).map((f) => [f.id, f]));
    const dcOf = (f) => { const e = (f.grants?.action?.effects ?? []).find((x) => typeof x.dc === 'string'); return e?.dc; };
    for (const x of res) {
      const dcAb = x.spenders.map(dcOf).find(Boolean), dc = dcAb && r ? 8 + r.prof + mod(r.abil[dcAb]) : null;
      sec.append(el('div', { class: 'res', id: `qb-res-${x.id}` }, el('h3', {}, x.title, el('span', { class: 'alias', text: x.alias })),
        el('div', { class: 'big' }, el('span', { class: 'num', id: `qb-res-${x.id}-n`, text: String(x.max) }), dots(x.max)),
        el('div', { class: 'back' }, el('b', { text: `All back on ${REST[x.recharge]}` }), x.recharge === 'short' ? ' (or a Long Rest).' : x.short ? ` (${x.short} on a Short Rest).` : '.', dc !== null ? ` Save DC ${dc} (8 + ${dcAb.toUpperCase()} ${signed(mod(r.abil[dcAb]))} + Proficiency ${signed(r.prof)}).` : '')));
      sec.append(groupHead('What spends it', `${costText(x, x.spenders[0])} each`), ...x.spenders.map((f) => featureRow(f, x, recFeats.get(f.id)?.uses)));
    }
    if (L.cast) {
      const slots = slotList(r?.slots);
      sec.append(el('div', { class: 'res', id: 'qb-res-slots' }, el('h3', {}, 'Spell slots', el('span', { class: 'alias', text: 'what casting spends' })),
        ...(slots.length ? slots.map(([l, n]) => el('div', { class: 'slotrow' }, el('span', { class: 'lbl', text: `Level ${l}` }), dots(n), el('span', { text: String(n) }))) : [el('p', { class: 'back', text: 'None at this level.' })]),
        el('div', { class: 'back' }, el('b', { text: `All back on ${L.cast.kind === 'pact' ? 'a Short Rest' : 'a Long Rest'}.` }), r?.castAbil ? ` Spell save DC ${8 + r.prof + mod(r.abil[r.castAbil])}, spell attack ${signed(r.prof + mod(r.abil[r.castAbil]))}.` : '')));
    }
    for (const [g, fs] of groupedFeatures(L.feats, res)) sec.append(groupHead(g), ...fs.map((f) => featureRow(f, null, recFeats.get(f.id)?.uses)));
    if (!sec.children.length) sec.append(el('p', { class: 'pk-lead', text: 'No class features yet at this level.' }));
    return sec;
  }

  // ---------- Class choices (a feature that asks) ----------
  function choicesSection(asks) {
    const sec = el('section', {});
    // A feature that picks several options from a list (Metamagic: up to 2 at level 2, 2 more at 10): ticks, none twice across features.
    for (const x of asks) {
      if (x.f.pick) {
        const mine = Array.isArray(b.choices[x.f.id]) ? b.choices[x.f.id] : [], taken = asks.filter((y) => y !== x && y.f.pick).flatMap((y) => b.choices[y.f.id] ?? []);
        const box = el('div', { class: 'qb-pick', id: `choice-${x.f.id}` }, groupHead(`${x.f.name}: choose up to ${pickLimit(x)}`));
        box.append(el('p', { class: 'pk-lead', id: `count-${x.f.id}`, text: `${mine.length} of ${pickLimit(x)} chosen` }), el('p', { class: 'pk-lead', text: firstSentence(x.f.text) }));
        for (const o of x.f.options) {
          const need = optionWhy(x, o, mine, b.spells), on = mine.includes(o.id), off = !on && (mine.length >= pickLimit(x) || taken.includes(o.id) || !!need);
          const stale = on && optionWhy(x, o, mine.filter((i) => i !== o.id), b.spells);
          const row = pickRow({ id: `pick-${x.f.id}-${o.id}`, kind: 'check', checked: on, disabled: off, title: o.name, summary: firstSentence(o.text), why: taken.includes(o.id) ? '(chosen above)' : need || stale || '', info: { title: o.name, sub: x.f.name, text: o.text },
            onchange: (on2) => { const next = on2 ? [...mine, o.id] : mine.filter((i) => i !== o.id); if (next.length) b.choices[x.f.id] = next; else delete b.choices[x.f.id]; build(); } });
          row.dataset.option = o.id; box.append(row);
        }
        sec.append(box);
      } else {
        const cur = b.choices[x.f.id] ?? '', box = el('div', { class: 'qb-pick', id: `choice-${x.f.id}` }, groupHead(x.f.name, 'choose one'));
        for (const o of x.f.options) {
          const row = pickRow({ id: `qb-choice-${x.f.id}-${o.id}`, kind: 'radio', name: `qb-choice-${x.f.id}`, checked: cur === o.id, title: o.name, summary: firstSentence(o.text), info: { title: o.name, sub: x.f.name, text: o.text }, onchange: () => { b.choices[x.f.id] = o.id; build(); } });
          row.dataset.option = o.id; box.append(row);
        }
        sec.append(box);
      }
    }
    return sec;
  }

  // ---------- Armour and weapons ----------
  const gearTip = (L, c) => {
    const trained = armourTrained(c, L.feats.map((x) => x.f.grants).filter(Boolean)), words = weaponWords(c, L.feats.map((x) => x.f.grants).filter(Boolean));
    const a = b.armour ? CONTENT.armour[b.armour] : null, no = (a && !trained.has(a.category)) || (b.shield && !trained.has('shield')) || b.weapons.some((id) => CONTENT.weapons[id] && !weaponTrained(CONTENT.weapons[id], words));
    return `${a ? a.name : 'No armour'}${b.shield ? ' + Shield' : ''} · ${b.weapons.length} weapon${b.weapons.length === 1 ? '' : 's'}${no ? ' · not proficient with something' : ' · all trained'}`;
  };
  function gearSection(L, c, d) {
    const G = L.feats.map((x) => x.f.grants).filter(Boolean), trained = armourTrained(c, G), words = weaponWords(c, G), bare = bareFeatures(L.feats);
    const s = sheet(), abil = Object.fromEntries(ABILITIES.map((a) => [a, Number.isInteger(s.abilities[a]) ? s.abilities[a] : 10]));
    const what = (patch) => safeDerive({ ...s, abilities: abil, ...patch })?.record;
    const armour = Object.values(CONTENT.armour).filter((a) => a.category !== 'shield'), shield = CONTENT.armour.shield, wp = Object.values(CONTENT.weapons);
    const sec = el('section', { class: 'qb-gear' });
    sec.append(el('p', { class: 'pk-lead' }, el('b', { text: `${c.name} training. ` }), trainLine(c, trained, words)));
    if (bare.length) {
      const off = !!(b.armour || b.shield);
      sec.append(el('div', { class: `pk-note${off ? ' alert' : ''}`, id: 'qb-bare-note' }, el('div', {}, el('b', { text: off ? 'Right now these are OFF: ' : 'Armour or a Shield turns off ' }), `${bare.join(', ')}${off ? ', because of the armour or Shield.' : `. A ${c.name} keeps them by wearing nothing.`}`)));
    }
    // armour
    const ar = (a, np) => pickRow({ id: `qb-armour-${a.id}`, kind: 'radio', name: 'qb-armour', checked: b.armour === a.id, disabled: np && b.armour !== a.id, np: np, title: a.name, chips: np ? [chip('np', 'Not proficient')] : [],
      summary: armourSummary(a), cost: np ? armourCost(a, !!L.cast, bare) : '', also: np ? armourAlso(a) : '', info: { title: a.name, sub: `${nice(a.category)} armour`, text: armourLines(a) }, onchange: () => { b.armour = a.id; build(); } });
    const none = what({ armour: undefined, shield: undefined });
    sec.append(groupHead('Armour', 'one suit'),
      pickRow({ id: 'qb-armour-none', kind: 'radio', name: 'qb-armour', checked: !b.armour, title: 'No armour', chips: [chip('good', 'Trained')], summary: none ? `AC ${none.ac}${bare.length ? ` · keeps ${bare.join(', ')}` : ''}` : '', onchange: () => { b.armour = null; build(); } }),
      ...armour.filter((a) => trained.has(a.category)).map((a) => ar(a, false)));
    const npA = armour.filter((a) => !trained.has(a.category));
    if (npA.length) {
      const open = gearOpen.armour || npA.some((a) => b.armour === a.id);
      sec.append(disclosure({ id: 'qb-armour-more', open, text: open ? 'Armour you are not proficient with' : `Show armour you are not proficient with (${npA.length})`, sub: `Each says what it costs. The game cannot apply these costs yet, so they cannot be picked.`, onToggle: (v) => { gearOpen.armour = v; build(); } }), ...(open ? npA.map((a) => ar(a, true)) : []));
    }
    // shield
    const noSh = !trained.has('shield');
    sec.append(groupHead('Shield'), pickRow({ id: 'qb-shield', kind: 'check', checked: b.shield, disabled: noSh && !b.shield, np: noSh, title: 'Shield', chips: noSh ? [chip('np', 'Not proficient')] : [], summary: '+2 AC if you are trained', cost: noSh ? armourCost(shield, !!L.cast, bare) : '',
      info: { title: 'Shield', sub: 'Shield', text: armourLines(shield) }, onchange: (on) => { b.shield = on; build(); } }));
    // weapons
    const prof = d?.record?.prof ?? proficiencyFor(b.level), has = (id) => b.weapons.includes(id);
    const bonusOf = (w) => { const q = what({ weapons: [...new Set([...b.weapons, w.id])] }); const at = q?.attacks.find((x) => x.id === w.id); return at ? at.bonus : null; };
    const martial = L.feats.some((x) => x.f.grants?.martialArts), isOwn = (w) => martial && w.kind === 'melee' && (w.category === 'simple' || w.properties.includes('light'));
    const wRow = (w, ok) => { const hit = bonusOf(w); return pickRow({ id: `qb-weapon-${w.id}`, kind: 'check', checked: has(w.id), disabled: !ok && !has(w.id), np: !ok, title: w.name, chips: ok ? [] : [chip('np', 'Not proficient')], right: hit === null ? '' : signed(hit),
      summary: weaponSummary(w), cost: !ok && hit !== null ? `${weaponCost(hit, prof)}${martial && w.kind === 'melee' ? '. Not a ' + c.name + ' weapon: no Martial Arts die.' : ''}` : '', info: { title: w.name, sub: `${nice(w.category)} ${w.kind} weapon`, text: weaponLines(w) },
      onchange: (on) => { toggle(b.weapons, w.id, on); build(); } }); };
    const okW = wp.filter((w) => weaponTrained(w, words)), npW = wp.filter((w) => !weaponTrained(w, words));
    sec.append(groupHead('Weapons', 'tick what you carry'));
    if (martial) {
      const own = okW.filter(isOwn), rest = okW.filter((w) => !isOwn(w)), un = what({ weapons: b.weapons })?.attacks.find((x) => x.id === 'unarmed-strike');
      sec.append(groupHead(`${c.name} weapons`, 'Martial Arts die and Dexterity'), pickRow({ id: 'qb-weapon-unarmed-strike', kind: 'none', title: 'Unarmed Strike', chips: [chip('good', `${c.name} weapon`)], right: un ? signed(un.bonus) : '', summary: un ? `Always available · ${un.damage} ${un.dtype}` : 'Always available',
        info: { title: 'Unarmed Strike', sub: 'Always available', text: ['You can always strike with fist, elbow, knee or foot.', 'With Martial Arts, no armour and no Shield it uses the Martial Arts die and Dexterity.'] } }), ...own.map((w) => wRow(w, true)));
      if (rest.length) sec.append(groupHead(`Trained, but not ${c.name} weapons`, 'normal damage'), ...rest.map((w) => wRow(w, true)));
    } else for (const [cat, list] of [['simple', okW.filter((w) => w.category === 'simple')], ['martial', okW.filter((w) => w.category === 'martial')]]) if (list.length) sec.append(groupHead(`${nice(cat)} weapons`, 'you are proficient'), ...list.map((w) => wRow(w, true)));
    if (npW.length) {
      const ticked = npW.filter((w) => has(w.id)).length, open = gearOpen.weapons || ticked > 0;
      sec.append(disclosure({ id: 'qb-weapons-more', open, text: open ? 'Weapons you are not proficient with' : `Show weapons you are not proficient with (${npW.length})`, sub: `${ticked ? `${ticked} ticked. ` : ''}They add no Proficiency Bonus to the attack roll. The game cannot apply that yet, so they cannot be picked.`, onToggle: (v) => { gearOpen.weapons = v; build(); } }), ...(open ? npW.map((w) => wRow(w, false)) : []));
    }
    void flagOf;
    return sec;
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
      if (m === 'roll' && !sc.roll && inGame()) { sc.roll = keptRoll(getState(), heard, me()); if (sc.roll) { sc.rule = sc.roll.rule; sc.place = blank(); sc.saved = false; } }
      else if (m === 'roll' && !sc.roll) { const kept = keepRead(ROLL_KEY); if (kept && Array.isArray(kept.rolls) && kept.rolls.length === 6) { sc.roll = { rolls: kept.rolls, rule: cleanRule(kept.rule), by: 'device', ...(typeof kept.at === 'string' ? { at: kept.at } : {}) }; sc.rule = sc.roll.rule; } }
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
      if (!R && inGame()) {
        sec.append(el('p', { class: 'note', id: 'qb-rule-text', text: `This table: ${ruleText(tableRule(getState().settings))}` }),
          // A member who has rolled is not offered a button the engine would refuse: until the table has said what this member holds, and once it has been refused, a sentence instead.
          rolledOut ? el('p', { class: 'note', id: 'qb-rolled-out' , text: 'You have rolled at this table; ask the DM to roll for you.' })
            : el('div', { class: 'row' }, el('button', { type: 'button', id: 'qb-roll', class: 'sc-roll', text: waiting ? 'Rolling…' : !checked && !getState().scoreRolls ? 'Checking your rolls…' : 'Roll the dice', disabled: !!waiting || (!checked && !getState().scoreRolls), onclick: () => { wait(); build(); act({ type: 'rollAbilityScores' }); } })),
          el('p', { class: 'note', text: 'Four dice for each score, the lowest set aside, six times, rolled by the table: the roll is recorded, and only you and the DM see the numbers.' }));
      } else if (!R) {
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
        const table = R.by === 'table', live = table && !sc.saved && inGame() ? tableRule(getState().settings) : R.rule;       // a table roll may be rolled again as the table's rule is now
        const where = table ? `Rolled at the table${Number.isInteger(R.at) ? ` (event ${R.at})` : ''}.` : `Rolled on this device${dayText(R.at) ? ` on ${dayText(R.at)}` : ''}. Not witnessed: the table did not roll these. The DM will see this.`;
        sec.append(el('p', { class: 'note', id: 'qb-rule-text', text: `${where} ${table && !sc.saved && inGame() ? `This table: ${ruleText(live)}` : ruleText(R.rule)}` }));
        const chips = el('div', { class: 'sc-chips', id: 'qb-chips' });
        R.rolls.forEach((s, i) => {
          const why = sc.saved ? 'This character was saved with these rolls.' : rerollWhy(s, live), can = !sc.saved && mayReroll(s, live);
          const onto = ABILITIES.find((a) => sc.place[a] === i);
          chips.append(el('div', { class: 'sc-chip', id: `qb-chip-${i}`, 'data-score': String(standing(s, R.rule)) }, el('b', { text: `Roll ${i + 1}: ${standing(s, R.rule)}` }), el('small', { text: setText(s, R.rule).replace(/^\d+ /, '') }),
            onto ? el('small', { class: 'note', text: `On ${onto.toUpperCase()}` }) : null,
            can ? el('button', { type: 'button', id: `qb-reroll-${i}`, text: 'Roll this score again', disabled: !!waiting,
              onclick: table ? () => { wait(); build(); act({ type: 'rerollAbilityScore', index: i }); } : () => { s.again = rerollHere(); keepWrite(ROLL_KEY, { rolls: R.rolls, rule: R.rule, at: R.at }); build(); } })
              : el('small', { class: 'note', id: `qb-noreroll-${i}`, text: why })));
        });
        sec.append(chips);
        // The DM's view holds every record, and the DM may always roll a fresh set in place of the kept one; a player is not offered one.
        if (table && !sc.saved && inGame() && getState().scoreRolls) sec.append(el('div', { class: 'row' }, el('button', { type: 'button', id: 'qb-roll-fresh', text: waiting ? 'Rolling…' : 'Roll a fresh set (DM)', disabled: !!waiting, onclick: () => { wait(); build(); act({ type: 'rollAbilityScores' }); } }),
          el('small', { class: 'note', text: 'Replaces the roll the table holds for you.' })));
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
    if (sc.method === 'roll' && sc.roll && parts.scores) sec.append(el('p', { class: 'note', id: 'qb-dm-line', text: `What the DM sees: ${dmLine({ ...sheet(), scores: parts.scores }, inGame() ? tableRule(getState().settings) : undefined)}` }));
    sec.append(el('p', { class: 'note', text: 'What you typed under "Enter by hand" is kept.' }), ...(bonusLine ? [bonusLine] : []));
    return sec;
  }

  // ---------- feats (C13): `sheet.feats` is [{ id, at, abilities?, skills?, list?, ability?, spells? }]; the places and what each offers are `featChoices` ----------
  // Every feat of the place's kinds is a row: its category, a one-line summary and the i button before anything is chosen; one the place does not offer is greyed
  // with the engine's own sentence (why it cannot be taken). Radio rows: one feat a place.
  const TIME = { action: 'Action', bonus: 'Bonus Action', reaction: 'Reaction', minute: '1 minute', hour: '1 hour' };
  const spellMeta = (s) => [TIME[s.time] ?? s.time, s.range === 'self' ? 'Self' : s.range === 'touch' ? 'Touch' : typeof s.range === 'number' ? `${s.range} ft` : s.range, s.concentration ? 'Concentration' : '', s.ritual ? 'Ritual' : ''].filter(Boolean).join(' · ');
  const spellRow = (s, o) => pickRow({ id: o.id, kind: 'check', checked: o.on, disabled: o.off, title: s.name, lead: s.level ? `(lvl ${s.level})` : '(cantrip)', chips: [spellTag(s)].filter(Boolean), summary: firstSentence(s.text), also: spellMeta(s), why: o.why, info: () => spellCard(s), onchange: o.onchange });
  const chipRadios = (id, label, options, value, onchange) => el('div', { class: 'abpick', id }, el('span', { class: 'pk-lead', text: label }),
    el('div', { class: 'chipset', role: 'radiogroup', 'aria-label': label }, ...options.map(([v, t]) => el('label', {}, el('input', { type: 'radio', name: id, id: `${id}-${v || 'none'}`, checked: (value ?? '') === v, onchange: () => onchange(v) }), el('span', { text: t })))));
  function featsSection(slots) {
    const s = sheet();
    const setEntry = (at, f) => { const i = b.feats.findIndex((x) => x.at === at); if (i >= 0) b.feats.splice(i, 1); if (f) b.feats.push(f); };
    const sec = el('section', { id: 'qb-feats-pick' }, el('h3', { text: 'Feats' }),
      el('p', { class: 'pk-lead', text: 'Ability scores above are the scores before these feats: a feat that raises one adds its points for you. Each feat says what it does in one line; the i button, a 3 second rest of the mouse or a press-hold shows all of it.' }));
    for (const sl of slots) {
      const key = sl.at.replace(/[^a-z0-9]+/gi, '-'), ids = new Set(sl.offer); if (sl.taken && !ids.has(sl.taken.id)) ids.add(sl.taken.id);
      const cats = new Set([...sl.offer].map((id) => CONTENT.feats[id]?.category));
      const others = { ...s, feats: (s.feats ?? []).filter((x) => x.at !== sl.at) }, was = new Set(validate(others));
      const whyNot = (f) => validate({ ...others, feats: [...others.feats, { id: f.id, at: sl.at }] }).filter((p) => !was.has(p))[0] ?? 'This feat cannot be taken here.';
      const box = el('div', { class: 'qb-pick', id: `feat-${key}`, 'data-at': sl.at }, groupHead(sl.name, 'choose one'));
      box.append(pickRow({ id: `feat-${key}-none`, kind: 'radio', name: `feat-${key}`, checked: !sl.taken, title: 'None', summary: 'No feat here', onchange: () => { setEntry(sl.at, null); build(); } }));
      const all = Object.values(CONTENT.feats).filter((f) => ids.has(f.id) || cats.has(f.category)).sort((x, y) => (ids.has(y.id) - ids.has(x.id)) || x.name.localeCompare(y.name));
      for (const f of all) {
        const on = sl.taken?.id === f.id, offered = ids.has(f.id);
        box.append(pickRow({ id: `feat-${key}-${f.id}`, kind: 'radio', name: `feat-${key}`, checked: on, disabled: !offered && !on, why: offered || on ? '' : whyNot(f), title: f.name, chips: [chip('cat', nice(f.category))], summary: firstSentence(f.text),
          info: { title: f.name, sub: `${nice(f.category)} feat`, text: f.text }, onchange: () => { setEntry(sl.at, { id: f.id, at: sl.at }); build(); } }));
        if (on) box.append(...featExtras(sl, f, key, setEntry));
      }
      sec.append(box);
    }
    return sec;
  }
  // What a chosen feat still asks: ability points, skills, a spell list and spells.
  function featExtras(sl, def, key, setEntry) {
    const t = sl.taken, out = [], put = (patch) => { const next = { ...t, ...patch }; for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k]; setEntry(sl.at, next); };
    const inc = def.increase;
    if (inc) {
      const [first, second] = Object.keys(t.abilities ?? {}), two = inc.points === 2 && Object.keys(t.abilities ?? {}).length === 1 && Object.values(t.abilities)[0] === 2;
      const opts = (none) => [['', none], ...inc.from.map((a) => [a, a.toUpperCase()])];
      out.push(chipRadios(`feat-${key}-a1`, inc.points === 2 ? 'Ability score (+2, or +1 with a second)' : 'Ability score (+1)', opts('None yet'), first, (v) => { put({ abilities: featPoints(inc, v, two ? undefined : second) }); build(); }));
      if (inc.points === 2) out.push(chipRadios(`feat-${key}-a2`, 'Second ability score (+1 each)', opts('None: +2 to the first'), two ? '' : second, (v) => { put({ abilities: featPoints(inc, first, v) }); build(); }));
    }
    if (def.proficiencies) {
      const n = def.proficiencies.n, mine = t.skills ?? [];
      out.push(el('p', { class: 'pk-lead', text: `Skills: ${mine.length} of ${n}` }), el('div', { class: 'chipset' }, ...Object.keys(SKILLS).map((k) => {
        const on = mine.includes(k), had = b.skills.includes(k);
        return el('label', {}, el('input', { type: 'checkbox', id: `feat-${key}-skill-${k}`, checked: on, disabled: !on && (had || mine.length >= n), onchange: (ev) => { const next = ev.target.checked ? [...mine, k] : mine.filter((i) => i !== k); put({ skills: next.length ? next : undefined }); build(); } }), el('span', { text: `${nice(k)}${had ? ' (already proficient)' : ''}` }));
      })));
    }
    const sp = def.spellPick;
    if (sp) {
      const spells = t.spells ?? [], list = t.list, pool = list ? Object.values(CONTENT.spells).filter((x) => x.classes.includes(list)) : [];
      out.push(chipRadios(`feat-${key}-list`, 'Spell list', [['', 'Choose…'], ...sp.lists.map((l) => [l, nice(l)])], list, (v) => { put({ list: v || undefined, spells: undefined }); build(); }),
        chipRadios(`feat-${key}-ability`, 'Spellcasting ability', [['', 'Choose…'], ...sp.abilities.map((a) => [a, ABIL_NAME[a]])], t.ability, (v) => { put({ ability: v || undefined }); build(); }));
      for (const [lv, most, name] of [[0, sp.cantrips, 'Cantrips'], [1, sp.level1, 'Level 1 spells']]) {
        if (!most) continue;
        const here = spells.filter((id) => CONTENT.spells[id]?.level === lv);
        out.push(groupHead(name, `${here.length} of ${most}`), ...(!list ? [el('p', { class: 'pk-lead', text: 'Choose a spell list first.' })] : pool.filter((x) => x.level === lv).sort((a, z) => a.name.localeCompare(z.name)).map((x) => {
          const on = spells.includes(x.id);
          return spellRow(x, { id: `feat-${key}-spell-${x.id}`, on, off: !on && here.length >= most, onchange: (c2) => { const next = c2 ? [...spells, x.id] : spells.filter((i) => i !== x.id); put({ spells: next.length ? next : undefined }); build(); } });
        })));
      }
    }
    return out;
  }

  // ---------- spells ----------
  const spellTip = (L) => {
    const have = b.spells.map((id) => CONTENT.spells[id]).filter(Boolean), cantrips = have.filter((s) => s.level === 0).length;
    return `${cantrips} of ${L.cantrips} cantrips · ${have.length - cantrips} of ${L.prepared} prepared`;
  };
  function spellsSection(L) {
    const have = b.spells.map((id) => CONTENT.spells[id]).filter(Boolean);
    const cantrips = have.filter((s) => s.level === 0).length, prepared = have.length - cantrips;
    const slots = derive(sheet())?.record?.slots ?? {};
    const slotText = Object.entries(slots).map(([l, n]) => `level ${l}: ${n}`).join(' · ');
    const sec = el('section', {}, el('h3', { text: 'Spells' }),
      el('p', { class: 'pk-lead', id: 'qb-spell-counts', text: `Cantrips ${cantrips} of ${L.cantrips} · Prepared spells ${prepared} of ${L.prepared} · Spell slots ${slotText || 'none'}${L.cast.kind === 'pact' ? ' (Pact Magic: back on a Short Rest)' : ''}` }));
    const all = Object.values(CONTENT.spells).filter((s) => s.classes.some((k) => L.lists.has(k)) && s.level <= L.top);
    const always = new Set(derive(sheet())?.record?.spells ?? []);
    for (let lv = 0; lv <= L.top; lv++) {
      const list = all.filter((s) => s.level === lv).sort((a, z) => a.name.localeCompare(z.name));
      if (!list.length) continue;
      const mine = list.filter((s) => b.spells.includes(s.id)).length, full = lv === 0 ? cantrips >= L.cantrips : prepared >= L.prepared;
      sec.append(groupHead(lv === 0 ? 'Cantrips' : `Level ${lv}`, mine ? `${mine} chosen` : ''), ...list.map((s) => {
        const on = b.spells.includes(s.id), auto = !on && always.has(s.id);
        return spellRow(s, { id: `qb-spell-${s.id}`, on: on || auto, off: auto || (!on && full), why: auto ? 'Always prepared' : '', onchange: (c2) => { toggle(b.spells, s.id, c2); build(); } });
      }));
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
    if (fresh.length) box.append(el('h4', { text: 'New features' }), ...fresh.map((f) => featureRow(f)));
    if (grown.length) box.append(el('h4', { text: 'Features that grow' }), ...grown.map((f) => el('p', { class: 'note', text: `${f.name}: ${usesText(old.get(f.id).uses)} becomes ${usesText(f.uses)}` })));
    if (!fresh.length && !grown.length) box.append(el('p', { class: 'note', text: 'No new features at this level.' }));
    box.append(el('p', { class: 'note', text: 'Anything below that needs a choice (a subclass, skills, spells, ability scores for a feat) is listed beside the button.' }));
    return box;
  }

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

  // The live sheet and the problems; redrawn after every change. Numbers are `derive`'s: this draws them and decides no rule.
  const initOf = (s, r) => {
    const G = [...featuresOf(s).map((x) => x.f.grants), ...(s.feats ?? []).map((f) => CONTENT.feats[f.id]?.grants)].filter(Boolean);
    return mod(r.abil.dex) + G.flatMap((g) => g.modifiers ?? []).filter((m) => m.on === 'initiative' && m.op === 'add').reduce((n, m) => n + (typeof m.value === 'number' ? m.value : (m.value?.prof ?? 0) * r.prof), 0);
  };
  function update() {
    if (!refs.derived) return;
    keepDraft();
    const s = sheet(), problems = [...(b.sc.method === 'hand' ? [] : scoreParts(b.sc, dayNow()).problems), ...validate(s)], d = safeDerive({ ...s, abilities: Object.fromEntries(ABILITIES.map((a) => [a, Number.isInteger(s.abilities[a]) ? s.abilities[a] : 10])) });
    refs.problems.textContent = '';
    for (const p of problems) refs.problems.append(el('li', { text: p }));
    refs.problems.hidden = problems.length === 0;
    refs.save.disabled = problems.length > 0 || !!pending;
    const nd = needs(limits());
    refs.why.textContent = problems.length ? (nd.length ? `Save is greyed. To choose: ${nd.map((x) => x.t).join(', ')}.` : 'Save is greyed. See below.') : '';
    refs.why.hidden = !problems.length; refs.why.classList.toggle('has-needs', nd.length > 0);
    const D = refs.derived; D.textContent = '';
    D.classList.toggle('wide', wide());
    if (!d) return void D.append(el('p', { class: 'note', text: 'These cannot be worked out until the sheet is filled in.' }));
    const r = d.record, c = classOf(s), L = limits();
    const stat = (k, v, id, key) => el('span', { class: `stat${key ? ' key' : ''}`, id }, `${k} `, el('b', { text: String(v) }));
    const res = resourcesOf(L.feats, r.feats), slots = slotList(r.slots);
    const cast = r.castAbil ? { dc: 8 + r.prof + mod(r.abil[r.castAbil]), atk: r.prof + mod(r.abil[r.castAbil]) } : null;
    const resStat = res[0] ? stat(res[0].title, res[0].max, 'qb-live-res', true) : slots.length ? stat('Slots', slots.map(([, n]) => n).join('·'), 'qb-live-res', true) : null;
    const chips = el('div', { class: 'chips' }, stat('AC', r.ac, 'qb-ac', true), stat('HP', r.hp, 'qb-hp'), stat('Speed', `${r.speed} ft`, 'qb-speed'), stat(wide() ? 'Initiative' : 'Init', signed(initOf(s, r)), 'qb-init'), ...(wide() ? [stat('Proficiency', signed(r.prof), 'qb-prof')] : []), ...(wide() && resStat ? [resStat] : []),
      ...(wide() && cast ? [stat('Spell save DC', cast.dc, 'qb-dc'), stat('Spell attack', signed(cast.atk), 'qb-spell-attack')] : []));
    const rows = attackRows(r.attacks), sig = {}, flash = [];
    const list = el('ul', { class: 'alist', id: 'qb-attacks', 'aria-live': 'polite' }, ...rows.map((a) => {
      sig[a.id] = a.sig; const changed = lastSig[a.id] !== a.sig && Object.keys(lastSig).length > 0;
      const li = el('li', { class: `arow${changed ? ' flash' : ''}`, 'data-aid': a.id }, el('span', { class: 'n', text: a.name }), el('span', { class: 'h', text: a.hit }), el('span', { class: 'dm', text: `${a.dmg}${a.dtype ? ` ${a.dtype}` : ''}` }));
      if (changed) flash.push(li); return li;
    }));
    lastSig = sig;
    const heads = headsUp({ armour: b.armour ? CONTENT.armour[b.armour] : null, shield: b.shield, weapons: b.weapons.map((id) => CONTENT.weapons[id]).filter(Boolean), abil: r.abil, trained: { armour: armourTrained(c, L.feats.map((x) => x.f.grants).filter(Boolean)), weapons: weaponWords(c, L.feats.map((x) => x.f.grants).filter(Boolean)) }, caster: !!L.cast, bare: bareFeatures(L.feats) });
    const warn = heads.length ? el('div', { class: 'heads', id: 'qb-heads' }, el('ul', {}, ...heads.map((t) => el('li', { text: t })))) : null;
    const note = c && L.feats.some((x) => x.f.grants?.extraAttack) ? 'more than one per Attack action' : '1 per Attack action';
    if (wide()) {
      D.append(el('h3', { class: 'live-name', text: b.name.trim() || 'Unnamed' }), el('p', { class: 'sub', text: `${c.name} ${r.level}. This sheet follows every choice.` }), chips,
        el('p', { class: 'acwhy', id: 'qb-why', text: `AC ${r.ac} = ${d.why.ac.join(', ')}. HP ${r.hp}: ${d.why.hp.join(', ')}.` }));
      if (res[0]) D.append(el('h4', { text: res[0].title }), el('div', { class: 'chips' }, el('span', { class: 'stat key' }, el('b', { text: String(res[0].max) }), ` of ${res[0].max} `, dots(res[0].max)), el('span', { class: 'stat', text: `back on ${REST[res[0].recharge]}` })),
        el('p', { class: 'acwhy', text: `Spent on ${res[0].spenders.map((f) => f.name).join(', ')}.` }));
      if (slots.length) D.append(el('h4', { text: 'Spell slots' }), el('div', { class: 'chips' }, ...slots.map(([l, n]) => el('span', { class: 'stat' }, `Level ${l} `, dots(n)))));
      D.append(el('h4', {}, 'Attacks ', el('small', { text: note })), list, ...(warn ? [warn] : []),
        el('p', { class: 'acwhy', id: 'qb-saves', text: `Saving throws: ${ABILITIES.map((a) => `${a.toUpperCase()} ${signed(mod(r.abil[a]) + (r.saveProf.includes(a) ? r.prof : 0))}${r.saveProf.includes(a) ? '*' : ''}`).join(' · ')}  (* proficient)` }));
    } else {
      const fold = el('button', { type: 'button', id: 'qb-live-fold', 'aria-expanded': String(!liveFolded), 'aria-label': `${liveFolded ? 'Show' : 'Hide'} the attacks list`, text: liveFolded ? '▾' : '▴', onclick: () => { liveFolded = !liveFolded; update(); } });
      D.append(chips, el('div', { class: 'livehead' }, ...(resStat ? [resStat] : []), el('b', { text: 'Attacks' }), el('span', { class: 'note1', text: note }), el('span', { class: 'sp' }), fold), ...(liveFolded ? [] : [list]), ...(warn ? [warn] : []));
      if (!liveFolded) list.scrollTop = 0;
    }
    if (flash.length) { const f = flash[0]; list.scrollTop = Math.max(0, f.offsetTop - list.offsetTop - 2); }
  }

  // What the table said of this page's own roll (the events a roller is sent whole): written to `heard`, and to the draft if its roll is a table's.
  function tableEvent(ev) {
    const mine = (by) => (me() !== undefined ? by === me() : !!(waiting || (heard && heard.by === by)));      // our id is told by the page; without it, an answer to our own request
    if (ev.type === 'scoresRolled' && Array.isArray(ev.sets)) {
      if (!mine(ev.by) || (heard && heard.by === ev.by && Number.isInteger(heard.at) && Number.isInteger(ev.at) && heard.at > ev.at)) return;      // not ours, or older than what we hold (the history comes after a live roll)
      heard = { by: ev.by, at: ev.at, rolls: rollsOfEvent(ev) }; unwait(); rolledOut = false;
      if (!panel.hidden && mode !== 'mine' && !b.sc.saved && b.sc.method === 'roll') { b.sc.roll = keptRoll(getState(), heard, me()); b.sc.rule = b.sc.roll?.rule ?? b.sc.rule; b.sc.place = blank(); build(); }
    } else if (ev.type === 'scoreRerolled' && ev.from && ev.to && heard && mine(ev.by) && heard.by === ev.by) {
      if (heard.rolls[ev.index]?.again) return;
      rerollInto(heard.rolls, ev); heard.result = resultOf(ev) ?? heard.result; unwait();
      const R = b.sc.roll;
      if (!panel.hidden && R?.by === 'table' && !b.sc.saved) { rerollInto(R.rolls, ev); R.result = heard.result; build(); }
    }
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
      if (!getState()) { heard = null; checked = false; rolledOut = false; }                // no game: whatever an earlier table said is no one's now
      unwait(); mode = o.mode; pending = null; acc = o.mode === 'levelup' ? 'gain' : 'who'; gearOpen.armour = gearOpen.weapons = false; lastSig = {}; liveFolded = false; target = o.entity ? { id: o.entity.id, name: o.entity.name } : null;
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
    // The table's answer about this member's own rolls has come (a page that asked for it), or the engine refused something.
    fresh() { heard = null; checked = false; rolledOut = false; unwait(); },       // a new table's first state: nothing of an earlier table is held
    scoresChecked() { checked = true; if (!panel.hidden) build(); },
    refused(msg) { if (/already rolled your ability scores/.test(String(msg))) { rolledOut = true; unwait(); if (!panel.hidden) build(); } },
    events(events) {
      for (const ev of events) tableEvent(ev);
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
