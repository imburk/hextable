// Reads a Fantasy Grounds 5E character export (the XML a "Save character" makes) and returns
// { character, report }. Pure: no I/O, no DOM, no randomness, no dependencies. Docs: docs/import-characters.md.
//
// `character` is a SHEET in the shape `setSheet` takes (derive.js, "A sheet records choices only"): the same
// thing "Build from class and level" produces. Nothing new is invented; the engine makes the record from it.
// `report` says what was not mapped and why, so the DM can see the gap. Nothing from the file's descriptive
// text is read or kept: only names, numbers and flags. What does not match an entry in the content pack is
// carried as a name-only note, never as stats.
//
// This reads the sheet, it does not play it: the engine can build SRD classes (several, by the multiclassing rules), SRD subclasses, SRD spells, SRD
// weapons and armour. Whatever it cannot is reported, and where a sheet needs a value to load at all (an SRD
// subclass at level 3, an option of a feature), the stand-in is listed under `adjustments`.
import { CONTENT, SPELLS } from './content/index.js';
import { ABILITIES, SKILLS, lintRecord } from './content/schema.js';
import { derive, featSlots, featuresOf, itemName, mod, proficiencyFor, validate } from './derive.js';

// ---------- a small XML reader ----------
// Elements, attributes, text, comments, CDATA, processing instructions. A DOCTYPE is skipped unless it has an
// internal subset, which is refused: no entity is ever defined or expanded (only the five built in and numeric
// references are read). Iterative, so a deep file cannot overflow the stack; capped in size, depth and nodes.
export class XmlError extends Error {}
export const XML_LIMITS = { chars: 4_000_000, depth: 48, nodes: 300_000, attrs: 24 };

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decode(s) {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|[a-z]{2,4});/g, (m, e) => {
    if (e[0] !== '#') return Object.hasOwn(NAMED, e) ? NAMED[e] : m;
    const cp = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : '';
  });
}

export function parseXml(text, limits = {}) {
  const lim = { ...XML_LIMITS, ...limits };
  if (typeof text !== 'string') throw new XmlError('The file is not text.');
  if (text.length > lim.chars) throw new XmlError(`The file is too big to read (over ${lim.chars} characters).`);
  const n = text.length;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0, nodes = 0, roots = 0;
  const doc = { tag: '#document', attrs: {}, kids: [], text: '' };
  const stack = [doc];
  const NAME = /[A-Za-z_][\w.:-]*/y, ATTR = /\s*([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/y, CLOSE = /<\/([A-Za-z_][\w.:-]*)\s*>/y;
  const to = (s, from, what) => { const e = text.indexOf(s, from); if (e < 0) throw new XmlError(`The file ends inside ${what}.`); return e; };
  while (i < n) {
    const lt = text.indexOf('<', i), end = lt < 0 ? n : lt;
    if (end > i) {
      const chunk = text.slice(i, end);
      if (stack.length > 1) stack[stack.length - 1].text += decode(chunk);
      else if (chunk.trim()) throw new XmlError('There is text outside the root element.');
    }
    if (lt < 0) break;
    i = lt;
    if (text.startsWith('<!--', i)) { i = to('-->', i + 4, 'a comment') + 3; continue; }
    if (text.startsWith('<![CDATA[', i)) {
      const e = to(']]>', i + 9, 'a CDATA section');
      if (stack.length > 1) stack[stack.length - 1].text += text.slice(i + 9, e);
      i = e + 3; continue;
    }
    if (text.startsWith('<?', i)) { i = to('?>', i + 2, 'a processing instruction') + 2; continue; }
    if (text.startsWith('<!', i)) {
      const e = to('>', i, 'a declaration'), decl = text.slice(i, e + 1);
      if (decl.includes('[') || /<!ENTITY/i.test(decl)) throw new XmlError('Entity declarations and DTD subsets are not supported.');
      i = e + 1; continue;
    }
    if (text[i + 1] === '/') {
      CLOSE.lastIndex = i;
      const m = CLOSE.exec(text);
      if (!m) throw new XmlError('A closing tag is malformed.');
      const top = stack[stack.length - 1];
      if (stack.length < 2 || top.tag !== m[1]) throw new XmlError(`The closing tag </${m[1]}> does not match ${stack.length < 2 ? 'an open element' : `<${top.tag}>`}.`);
      stack.pop(); i = CLOSE.lastIndex; continue;
    }
    NAME.lastIndex = i + 1;
    const nm = NAME.exec(text);
    if (!nm) throw new XmlError('A tag has no name.');
    const el = { tag: nm[0], attrs: {}, kids: [], text: '' };
    let p = NAME.lastIndex, na = 0;
    for (;;) {
      ATTR.lastIndex = p;
      const a = ATTR.exec(text);
      if (!a) break;
      if (++na > lim.attrs) throw new XmlError('An element has too many attributes.');
      if (!Object.hasOwn(el.attrs, a[1])) el.attrs[a[1]] = decode(a[2] ?? a[3] ?? '');
      p = ATTR.lastIndex;
    }
    while (p < n && /\s/.test(text[p])) p++;
    const selfClose = text[p] === '/';
    if (selfClose) p++;
    if (text[p] !== '>') throw new XmlError(`The tag <${el.tag}> is not closed properly.`);
    if (++nodes > lim.nodes) throw new XmlError('The file has too many elements.');
    const parent = stack[stack.length - 1];
    if (stack.length === 1 && ++roots > 1) throw new XmlError('There is more than one root element.');
    parent.kids.push(el);
    if (!selfClose) {
      if (stack.length > lim.depth) throw new XmlError('Elements are nested too deeply.');
      stack.push(el);
    }
    i = p + 1;
  }
  if (stack.length > 1) throw new XmlError(`The element <${stack[stack.length - 1].tag}> is never closed.`);
  if (!doc.kids.length) throw new XmlError('The file has no elements.');
  return doc.kids[0];
}

const kid = (n, tag) => n?.kids.find((k) => k.tag === tag);
const kids = (n, tag) => (n ? n.kids.filter((k) => !tag || k.tag === tag) : []);
const txt = (n, tag) => (tag === undefined ? n?.text : kid(n, tag)?.text)?.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() ?? '';
const int = (n, tag) => { const t = txt(n, tag); return /^[-+]?\d{1,6}$/.test(t) ? parseInt(t, 10) : null; };

// ---------- names ----------
const plain = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[‘’`]/g, "'").toLowerCase();
const norm = (s) => plain(s).replace(/'/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const kebab = (s) => norm(s).replace(/ /g, '-');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
// A name for the report. A name over this length is a description that was typed into a name box: it is not copied.
const NAME_MAX = 60;
const show = (s) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length <= NAME_MAX ? t : `[a long entry, ${t.length} characters]`; };

// The player's name follows the character's in brackets or parentheses; it is dropped and never kept.
export function characterName(raw) {
  const t = String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return t.replace(/\s*(\[[^\]]*\]|\([^)]*\))$/, '').trim();
}

// ---------- what the pack holds, by name ----------
const classByKey = new Map();
for (const c of Object.values(CONTENT.classes)) { classByKey.set(norm(c.id), c); classByKey.set(norm(c.name), c); }
const spellByKey = new Map();
for (const s of Object.values(CONTENT.spells)) { spellByKey.set(norm(s.id), s); spellByKey.set(norm(s.name), s); }
const weaponByKey = new Map(), armourByKey = new Map();
const singular = (k) => k.replace(/s$/, '');
for (const w of Object.values(CONTENT.weapons)) { weaponByKey.set(norm(w.name), w); weaponByKey.set(singular(norm(w.name)), w); }
for (const a of Object.values(CONTENT.armour)) {
  armourByKey.set(norm(a.name), a);
  armourByKey.set(norm(a.name).replace(/ armor$/, ''), a);         // "Plate", "Half Plate", "Studded Leather"
}

// What a spell is called on a sheet: "Detect Magic (RIT) (30) (C)" is Detect Magic.
const spellKey = (name) => norm(String(name).replace(/\([^)]*\)/g, ' ').replace(/\*+/g, ' '));
// "Crossbow, Heavy" is a Heavy Crossbow; "Greatsword, +2" and "Spear +1" are a Greatsword and a Spear with a bonus.
function itemKeys(name) {
  const raw = String(name ?? '').replace(/\*+/g, ' ').trim();
  const bonus = /[,\s(]\+(\d)\)?\s*$/.exec(raw)?.[1];
  const base = raw.replace(/[,\s(]*\+\d\)?\s*$/, '').trim();
  const keys = [norm(base)];
  const comma = /^([^,]+),\s*([^,]+)$/.exec(base);
  if (comma) keys.push(norm(`${comma[2]} ${comma[1]}`));
  const head = base.split(/[-"“–(]/)[0].trim();
  if (head && head !== base) keys.push(norm(head));
  return { keys: keys.filter(Boolean), bonus: bonus ? +bonus : 0 };
}
const find = (map, keys) => { for (const k of keys) { const v = map.get(k) ?? map.get(singular(k)); if (v) return v; } return null; };

// Magic items of the pack, by name, and the 2014 names of the same SRD items ("Potion of Greater Healing", "Potion of
// Hill Giant Strength", "Quaal's Feather Token", "Scroll of Fireball", "Ioun Stone (Awareness)"). Returns { item, base?,
// spell? } or null; a "+1" weapon, armour or Shield is read from its base item (`magicGear`).
const itemByKey = new Map();
for (const d of Object.values(CONTENT.items)) { itemByKey.set(norm(d.name), d); itemByKey.set(norm(d.id), d); }
const GIANTS = { hill: 'hill', frost: 'frost-or-stone', stone: 'frost-or-stone', fire: 'fire', cloud: 'cloud', storm: 'storm' };
export function packItem(name) {
  const k = norm(String(name ?? '').replace(/\(from [^)]*\)/i, ' '));
  if (!k) return null;
  const direct = itemByKey.get(k);
  if (direct && !direct.base && direct.variant !== 'spell') return { item: direct.id };
  let m;
  if ((m = /^potion of (greater|superior|supreme) healing$/.exec(k))) return { item: `potion-of-healing-${m[1]}` };
  if ((m = /^(potion|belt) of (hill|frost|stone|fire|cloud|storm) giant strength$/.exec(k))) return { item: `${m[1] === 'belt' ? 'belt' : 'potion'}-of-giant-strength-${GIANTS[m[2]]}` };
  if (/^(quaals )?feather token\b/.test(k)) return { item: 'feather-token' };
  if (k === 'luckstone') return { item: 'stone-of-good-luck' };
  if (/^iron bands of \w+$/.test(k)) return { item: 'iron-bands' };            // the 2014 name
  if ((m = /^(?:spell )?scroll(?: of)? (.+)$/.exec(k))) { const sp = spellByKey.get(m[1]); return sp ? { item: 'spell-scroll', spell: sp.id } : null; }
  if (direct?.base) { const b = direct.base.weapon ?? direct.base.armour; return { item: direct.id, ...(Array.isArray(b) && b.length === 1 ? { base: b[0] } : {}) }; }
  return null;
}
const magicGear = (kind, bonus, base) => (bonus >= 1 && bonus <= 3 ? { item: `${kind}-plus-${bonus}`, ...(base ? { base } : {}) } : null);

// ---------- 2014 and 5.2 differences that can be told from a name ----------
// The SRD 5.2 text (reference/srd52) lists these species and backgrounds; the pack holds none of them yet.
const SRD_SPECIES = ['dragonborn', 'dwarf', 'elf', 'gnome', 'goliath', 'halfling', 'human', 'orc', 'tiefling'];
const SRD_BACKGROUNDS = ['acolyte', 'criminal', 'sage', 'soldier'];
// Feats are found in the pack by name. These SRD 5.2 feats share a name with a 2014 feat whose rules were different: a
// sheet's feat of that name is built as the 5.2 version, and the report says so.
const FEAT_CHANGED = new Set(['alert', 'grappler', 'magic-initiate', 'savage-attacker', 'great-weapon-fighting']);
const featByKey = new Map();
for (const f of Object.values(CONTENT.feats)) { featByKey.set(norm(f.name), f); featByKey.set(norm(f.id), f); }
// Class features whose 2014 name is not a 5.2 feature, and what 5.2 has instead (each checked against the SRD text).
const CHANGED = new Map(Object.entries({
  'divine sense': 'In 5.2 this is a Channel Divinity option (Paladin level 3).',
  'divine smite': 'In 5.2 Divine Smite is a spell, always prepared, which Paladin\'s Smite (level 2) also lets the paladin cast free once per Long Rest.',
  'improved divine smite': 'Not in 5.2; Radiant Strikes (level 11) is the paladin\'s extra radiant damage.',
  'divine health': 'Not in 5.2.',
  'destroy undead': 'Not in 5.2; Sear Undead (Cleric level 5) is its replacement.',
  'sorcerous origin': 'In 5.2 this is the Sorcerer subclass choice.',
  'dragon ancestor': 'Not a 5.2 feature: the Draconic Sorcery subclass (the 2014 Draconic Bloodline) has Draconic Resilience, Elemental Affinity and its spells.',
  'divine domain': 'In 5.2 this is the Cleric subclass choice.',
  'devine domain': 'In 5.2 this is the Cleric subclass choice.',
  'blessed strikes': 'In 5.2 Blessed Strikes is a core Cleric feature at level 7 with two options.',
  'great weapon fighting': 'In 5.2 this is a Fighting Style feat.',
  'fighting style': 'In 5.2 a Fighting Style is a feat.',
}));
const SPECIES_TRAITS_MAPPED = ['speed', 'darkvision', 'size', 'age', 'alignment', 'languages', 'ability score increase', 'ability score increases'];
const TOOL_WORDS = /(kit|supplies|tools?|instrument|flute|lute|lyre|drum|horn|viol|bagpipes|dulcimer|shawm|pan flute|dice set|playing card|chess|vehicles)/i;
const SENSE_NAMES = ['darkvision', 'blindsight', 'tremorsense', 'truesight'];

const CATEGORIES = ['multiclass', 'subclass', 'species', 'background', 'feats', 'features', 'spells', 'magicItems', 'gear', 'proficiencies', 'ruleDifferences', 'numbers'];

function newReport() {
  const r = { ok: true, loadable: false, problems: [], name: '', source: {}, imported: {}, languages: [], state: {}, spellTiers: { auto: [], assist: [], manual: [] }, builtFeatures: { auto: 0, assist: 0, manual: 0 }, adjustments: [], counts: {} };
  for (const c of CATEGORIES) r[c] = [];
  return r;
}
const count = (r) => { for (const c of CATEGORIES) r.counts[c] = r[c].length; r.counts.adjustments = r.adjustments.length; return r; };
function failure(error) { const r = newReport(); r.ok = false; r.error = error; r.problems = [error]; return { character: null, report: count(r) }; }

// ---------- the importer ----------
export function importFgxml(xml, options = {}) {
  let root;
  try { root = parseXml(xml, options.limits); } catch (e) { return failure(e instanceof XmlError ? `This is not readable XML: ${e.message}` : 'This file could not be read.'); }
  const ch = kid(root, 'character');
  if (root.tag !== 'root' || !ch) return failure('This is not a Fantasy Grounds character export: it has no <character> inside <root>.');
  try { return build(root, ch, options); } catch { return failure('This Fantasy Grounds sheet could not be read: some part of it is not in the expected form.'); }
}

function build(root, ch, options) {
  const R = newReport();
  R.source = { format: 'fantasy-grounds-5e', version: root.attrs.version ?? null, release: root.attrs.release ?? null };
  const note = (cat, name, why, extra = {}) => { if (!R[cat].some((x) => x.name === show(name) && x.why === why)) R[cat].push({ name: show(name), why, ...extra }); };
  const adjust = (what, from, to, why) => R.adjustments.push({ what, from: from === undefined ? undefined : show(from), to: show(to), why });

  // Who
  let name = characterName(txt(ch, 'name'));
  if (!name) { name = 'Imported character'; adjust('name', undefined, name, 'The sheet has no name.'); }
  if (name.length > 40) { name = name.slice(0, 40).trim(); adjust('name', undefined, name, 'A name is at most 40 letters.'); }
  R.name = name;

  // Classes. Every SRD class on the sheet is built (Multiclassing): the first class taken is the one whose saving
  // throw proficiencies the sheet shows (only the first class gives them), else the sheet's first. A class not in
  // the SRD is reported and left out.
  const classes = kids(kid(ch, 'classes')).map((c) => ({ name: txt(c, 'name'), level: int(c, 'level') ?? 0, spec: txt(c, 'specialization') })).filter((c) => c.name && c.level > 0);
  if (!classes.length) return { character: null, report: count(Object.assign(R, { ok: false, error: 'The sheet has no class.', problems: ['The sheet has no class.'] })) };
  const known = classes.map((c) => ({ ...c, def: classByKey.get(norm(c.name)) ?? null }));
  const supported = known.filter((c) => c.def);
  if (!supported.length) {
    note('multiclass', known.map((c) => `${c.name} ${c.level}`).join(', '), 'None of these classes is in the SRD 5.2 pack, so nothing can be built.');
    return { character: null, report: count(Object.assign(R, { ok: false, error: 'No class on the sheet is one the engine knows.', problems: ['No class on the sheet is one the engine knows.'] })) };
  }
  const multi = supported.length > 1;
  const savesShown = (() => {
    const pb = int(ch, 'profbonus');
    if (pb === null) return null;
    const words = { str: 'strength', dex: 'dexterity', con: 'constitution', int: 'intelligence', wis: 'wisdom', cha: 'charisma' };
    return ABILITIES.filter((a) => { const node = kid(kid(ch, 'abilities'), words[a]), sv = int(node, 'save'), sc = int(node, 'score'); return sv !== null && sc !== null && sv - mod(sc) >= pb; });
  })();
  let order = supported;
  if (multi) {
    const fits = supported.filter((o) => savesShown && o.def.saves.every((a) => savesShown.includes(a)));
    if (fits.length >= 1 && fits[0] !== supported[0]) order = [fits[0], ...supported.filter((o) => o !== fits[0])];
    if (fits.length !== 1) adjust('first class', undefined, supported[0].name, `The sheet does not show which class came first (its saving throw proficiencies fit ${fits.length ? fits.map((o) => o.name).join(' and ') : 'none of its classes'}); ${order[0].name} was taken as the first. The DM should check: the first class gives the saving throws, level 1 Hit Points and full armour training.`);
  }
  const main = multi ? order[0] : supported.reduce((a, c) => (c.level > a.level ? c : a), supported[0]);
  const c = main.def, totalLevel = classes.reduce((n, x) => n + x.level, 0);
  const level = multi ? order.reduce((n, o) => n + o.level, 0) : Math.min(20, main.level);
  for (const o of known) if (o !== main && !(multi && o.def)) {
    note('multiclass', `${o.name} ${o.level}`, o.def
      ? `The engine builds one class. ${main.name} ${level} was built; the ${o.name} levels, features and spell slots are not on the sheet.`
      : `${o.name} is not an SRD 5.2 class, so it cannot be built.`);
  }
  if (classes.length > 1 && level !== totalLevel) R.ruleDifferences.push({ name: 'Total level', why: `The sheet is level ${totalLevel}; the engine's sheet is level ${level} (${multi ? order.map((o) => `${o.def.name} ${o.level}`).join(' / ') : c.name}), so its Proficiency Bonus, Hit Points and slots follow that level.` });

  const sheet = multi ? { name, classes: order.map((o) => ({ class: o.def.id, level: o.level })), abilities: {}, skills: [] } : { name, class: c.id, level, abilities: {}, skills: [] };
  const standIns = new Set();             // classes whose subclass is a stand-in, so what it always prepares is not the character's

  // Subclass, for each class
  const SUB_ALIAS = { evoker: ['evocation'], fiend: ['fiend'], 'open-hand': ['open hand'] };
  const words = (hay, needle) => ` ${hay} `.includes(` ${needle} `);
  order.filter((o) => multi || o === main).forEach((o, i) => {
    const at = multi ? sheet.classes[i] : sheet, lv = multi ? o.level : level, cd = o.def, sub = cd.subclass, specKey = norm(o.spec);
    const isSrdSub = !!specKey && (specKey === norm(sub.name) || words(specKey, norm(sub.id)) || (SUB_ALIAS[sub.id] ?? []).some((a) => words(specKey, a)));
    if (lv >= 3) {
      at.subclass = sub.id;
      if (isSrdSub) {
        if (specKey !== norm(sub.name)) R.ruleDifferences.push({ name: o.spec, why: `The 2014 name of the SRD subclass ${sub.name}; its features are built as the 5.2 ones.` });
      } else if (options.substituteSubclass === false) {
        delete at.subclass;
      } else {
        standIns.add(cd.id);
        note('subclass', o.spec || '(none named)', `Not an SRD 5.2 subclass, so none of its features exist in the pack. ${o.name} subclass features are not built.`);
        adjust('subclass', o.spec || '(none named)', sub.name, `A level ${lv} ${multi ? `${cd.name} ` : ''}sheet cannot load without the SRD subclass. ${sub.name} is a stand-in: its features are NOT this character's.`);
      }
    } else if (o.spec && !isSrdSub) note('subclass', o.spec, 'Not an SRD 5.2 subclass.');
  });

  // Abilities
  for (const a of ABILITIES) {
    const word = { str: 'strength', dex: 'dexterity', con: 'constitution', int: 'intelligence', wis: 'wisdom', cha: 'charisma' }[a];
    let v = int(kid(kid(ch, 'abilities'), word), 'score');
    if (v === null) { adjust(`${a.toUpperCase()} score`, undefined, 10, 'The sheet has no score for it.'); v = 10; }
    if (v > 20) { adjust(`${a.toUpperCase()} score`, v, 20, 'Above what the engine derives: a sheet\'s scores are 1 to 20 before its feats, and only an Epic Boon (level 19+) or a magic item takes one past 20. Set to 20; the DM should check what raised it.'); v = 20; }
    if (v < 1) { adjust(`${a.toUpperCase()} score`, v, 1, 'A sheet holds scores of 1 to 20.'); v = 1; }
    sheet.abilities[a] = v;
  }

  // Skills. A sheet lists the class's picks in `skills` (the exact number the class and its features allow) and any other
  // proficiency in `extraSkills`; their union is what the character is proficient in.
  const profs = [], expert = [];
  for (const s of kids(kid(ch, 'skilllist'))) {
    const key = kebab(txt(s, 'name')), p = int(s, 'prof');
    if (!Object.hasOwn(SKILLS, key) || !p) continue;
    if (p === 1 || p === 2) { profs.push(key); if (p === 2) expert.push(key); }
  }
  const pre = () => featuresOf(sheet).map((x) => x.f.grants).filter(Boolean);
  const wantClass = () => c.skills.choose + pre().reduce((n, g) => n + (g.skills?.from === 'class' ? g.skills.n : 0), 0);
  // A class taken later may add a skill (Bard any, Ranger and Rogue from their lists): counted with the free picks.
  const later = multi ? order.slice(1).reduce((n, o) => n + (o.def.multiclass?.skills?.choose ?? 0), 0) : 0;
  const wantAny = () => later + pre().reduce((n, g) => n + (g.skills?.from === 'any' ? g.skills.n : 0), 0);
  const onList = (k) => c.skills.from === 'any' || c.skills.from.includes(k);
  // Choices of features that ask for one, resolved below; they can change what a feature grants, so they come first.
  const names = [...kids(kid(ch, 'featurelist')), ...kids(kid(ch, 'featlist'))].map((f) => norm(txt(f, 'name')));
  // Options picked as a list (Metamagic) are often named only in the powers list ("Metamagic (Quickened Spell)").
  const pickNames = [...names, ...kids(kid(ch, 'powers')).map((p) => norm(txt(p, 'name')))].filter(Boolean);
  const unpicked = new Set();
  const isNamed = (o, list) => o.name && list.some((n) => ` ${n} `.includes(` ${norm(o.name)} `));
  // A feature that takes a list of options (Metamagic at 2, 10 and 17): each option once across the features of that
  // name (derive.js refuses an option chosen twice), in the order the sheet's features come; what is not named is
  // left for the DM, which the engine allows for these; what is named beyond the places there are is reported.
  const resolvePick = (f) => {
    const same = featuresOf(sheet).filter((y) => y.f.pick && y.f.name === f.name && y.f.id !== f.id);
    const taken = new Set(same.flatMap((y) => [sheet.choices?.[y.f.id] ?? []].flat()));
    const named = f.options.filter((o) => !taken.has(o.id) && isNamed(o, pickNames));
    const later = same.filter((y) => !sheet.choices?.[y.f.id] && !unpicked.has(y.f.id)).length;   // places still to fill
    const mine = named.slice(0, f.pick);
    if (mine.length) (sheet.choices ??= {})[f.id] = mine.map((o) => o.id);
    else unpicked.add(f.id);
    if (mine.length < f.pick) note('features', `${f.name} (level ${f.level})`, `${f.pick - mine.length} option${f.pick - mine.length === 1 ? '' : 's'} not named on the sheet, or named for an earlier ${f.name}: left unchosen for the DM to choose.`, { level: f.level });
    if (!later) for (const o of named.slice(f.pick)) note('features', `${f.name}: ${o.name}`, `Named on the sheet more times than ${f.name} has places, or twice; an option is known once, so it is left out.`);
  };
  const resolveChoices = () => {
    for (let pass = 0; pass < 12; pass++) {
      const ask = featuresOf(sheet).filter((x) => x.f.options && !x.option && !sheet.choices?.[x.f.id] && !unpicked.has(x.f.id));
      if (!ask.length) return;
      const x = ask[0], f = x.f;
      if (f.pick) { resolvePick(f); continue; }
      const named = f.options.find((o) => o.name && names.some((n) => ` ${n} `.includes(` ${norm(o.name)} `)));
      let pick = named, why = 'It is named on the sheet.';
      if (!pick) {
        // Not on the sheet (a 2014 sheet has no such choice): take the option the sheet's own gear fits, else the first.
        const score = (o) => validate({ ...sheet, ...gearSheet(), choices: { ...(sheet.choices ?? {}), [f.id]: o.id } }).filter((p) => /training|proficient/.test(p)).length;
        pick = f.options.map((o) => [score(o), o]).sort((a, b) => a[0] - b[0])[0][1];
        adjust(f.name, undefined, pick.name, `A 5.2 choice with no counterpart on a 2014 sheet. ${pick.name} was set so the sheet loads (chosen as the option the sheet's gear fits, else the first): the DM should choose.`);
      } else void why;
      (sheet.choices ??= {})[f.id] = pick.id;
      if (named && pick.feat && FEAT_CHANGED.has(pick.feat)) R.ruleDifferences.push({ name: pick.name, why: `5.2 version: the engine builds the SRD 5.2 ${pick.name} feat, whose rules differ from the 2014 fighting style of that name.` });
    }
  };

  // Gear is read before choices, so a choice can be judged by what the character carries.
  const items = kids(kid(ch, 'inventorylist')).map((it, idx) => ({ node: it, id: it.tag, name: txt(it, 'name'), type: txt(it, 'type'), subtype: txt(it, 'subtype'), rarity: txt(it, 'rarity'), carried: int(it, 'carried') ?? 0, ac: int(it, 'ac'), attune: int(it, 'attune') === 1, count: Math.max(1, int(it, 'count') ?? 1), idx }));
  // Magic items of the pack found on the sheet, put on it after its armour and weapons: { spec, name, equipped, attuned, count }.
  const itemSpecs = [];
  const wantItem = (spec, i, name) => itemSpecs.push({ spec, name, equipped: (i?.carried ?? 2) === 2, attuned: !!i?.attune, count: CONTENT.items[spec.item].category === 'potion' || CONTENT.items[spec.item].category === 'scroll' ? Math.min(10, i?.count ?? 1) : 1 });
  const byId = new Map(items.map((i) => [i.id, i]));
  const isMagic = (i) => (!!i.rarity && !/^\(?\s*common\s*\)?$/i.test(i.rarity)) || /\+\d\s*$/.test(i.name) || /^(wondrous|ring|rod|staff|wand|potion|scroll)/i.test(i.type);
  const armourCands = [], weaponCands = [], usedItems = new Set();
  let wantShield = false;
  for (const i of items) {
    if (/^armor$/i.test(i.type) || /shield|armor/i.test(i.subtype)) {
      if (i.carried < 2) continue;
      const { keys, bonus } = itemKeys(i.name), named = packItem(i.name);
      if (/shield/i.test(i.subtype) || /^shield$/i.test(norm(i.name))) {
        usedItems.add(i.id);
        const spec = named && CONTENT.items[named.item].wear === 'shield' ? named : magicGear('shield', bonus);
        if (spec) { wantItem(spec, i, i.name); continue; }
        wantShield = true;
        if (isMagic(i) || /\+\d/.test(i.name)) note('magicItems', i.name, 'Imported as a plain Shield (+2 AC); its magic is not an SRD 5.2 item the pack holds.', { importedAs: 'shield' });
        continue;
      }
      let a = find(armourByKey, keys), viaSubtype = false;
      if (!a) { a = find(armourByKey, [norm(i.subtype)]); viaSubtype = !!a; }
      const asItem = named && CONTENT.items[named.item].wear === 'armour' ? { ...named, ...(a && !named.base ? { base: a.id } : {}) } : a && a.category !== 'shield' ? magicGear('armor', bonus, a.id) : null;
      if (asItem) { usedItems.add(i.id); wantItem(asItem, i, i.name); continue; }
      if (a && a.category !== 'shield') {
        armourCands.push({ a, i });
        usedItems.add(i.id);
        if (viaSubtype || bonus || isMagic(i)) note('magicItems', i.name, `Imported as plain ${a.name}; its magic is not an SRD 5.2 item the pack holds.`, { importedAs: a.id });
      } else note('gear', i.name, 'Armour that is not in the SRD 5.2 pack; AC is not taken from it.');
    }
  }
  for (const w of kids(kid(ch, 'weaponlist'))) {
    const carried = int(w, 'carried') ?? 0;
    const link = txt(kid(w, 'shortcut'), 'recordname').split('.').pop().split('@')[0];
    const inv = byId.get(link);
    const label = inv?.name || txt(w, 'name');
    if (inv) usedItems.add(inv.id);
    const dmg = kids(kid(w, 'damagelist')).map((d) => txt(d, 'type')).join(',');
    const { keys, bonus } = itemKeys(label);
    let wp = find(weaponByKey, keys), viaSubtype = false;
    if (!wp && inv) { wp = find(weaponByKey, [norm(inv.subtype)]); viaSubtype = !!wp; }
    const magic = bonus > 0 || /magic/i.test(dmg) || (inv && isMagic(inv)) || viaSubtype;
    if (carried < 1) { note('gear', label, 'Listed as not carried on the sheet; not imported.'); continue; }
    // A magic weapon of the pack (Sun Blade, Staff of Striking), or a "+1" one made from a weapon of the pack.
    const named = packItem(label), nd = named && CONTENT.items[named.item];
    const asItem = nd && nd.wear === 'weapon' ? { ...named, ...(wp && nd.base && !named.base ? { base: wp.id } : {}) } : wp ? magicGear('weapon', bonus, wp.id) : null;
    if (asItem) { if (!itemSpecs.some((x) => x.name === label)) wantItem(asItem, { ...(inv ?? {}), carried, attune: inv?.attune }, label); continue; }
    if (!wp) { note('magicItems', label, 'A weapon that is not in the SRD 5.2 pack, so it has no attack on the sheet.'); continue; }
    if (magic) note('magicItems', label, `Imported as a plain ${wp.name}; its magic is not an SRD 5.2 item the pack holds.`, { importedAs: wp.id });
    if (!weaponCands.some((x) => x.w.id === wp.id)) weaponCands.push({ w: wp, equipped: carried === 2 });
  }
  weaponCands.sort((a, b) => b.equipped - a.equipped);
  armourCands.sort((a, b) => b.a.ac - a.a.ac);
  const gearSheet = () => ({ ...(armourCands[0] ? { armour: armourCands[0].a.id } : {}), ...(wantShield ? { shield: true } : {}), weapons: weaponCands.map((x) => x.w.id) });

  // The sheet's choices (fighting style and the like), then skills, which the choices can change.
  resolveChoices();
  const classPicks = profs.filter(onList).slice(0, wantClass());
  const anyPicks = profs.filter((k) => !classPicks.includes(k)).slice(0, wantAny());
  sheet.skills = [...classPicks, ...anyPicks];
  const extra = profs.filter((k) => !sheet.skills.includes(k));
  if (extra.length) sheet.extraSkills = extra;
  if (sheet.skills.length < wantClass() + wantAny()) {
    adjust('skills', undefined, `${sheet.skills.length} of ${wantClass() + wantAny()}`, `The sheet has fewer skill proficiencies the ${c.name} list allows than a level ${level} ${multi ? 'character with these classes' : c.name} chooses, so the sheet cannot load until the DM picks the rest.`);
  }
  const expMax = pre().reduce((n, g) => n + (g.expertise ?? 0), 0);
  const keepExp = expert.slice(0, expMax);
  if (keepExp.length) sheet.expertise = keepExp;
  if (expert.length > keepExp.length) for (const k of expert.slice(keepExp.length)) note('features', `Expertise in ${k}`, `${multi ? 'This character' : c.name} has Expertise in ${expMax} skills at level ${level} in the engine; this one is kept as an ordinary proficiency.`);

  // Armour, shield, weapons: each is added only if the engine accepts it for this class.
  const before = new Set(validate(sheet));
  const tryAdd = (patch) => {
    const trial = { ...sheet, ...patch };
    const added = validate(trial).filter((p) => !before.has(p));
    return added.length ? { ok: false, why: added[0] } : { ok: true, trial };
  };
  for (const { a } of armourCands) {
    const t = tryAdd({ armour: a.id });
    if (t.ok) { sheet.armour = a.id; break; }
    note('gear', a.name, `Worn on the sheet, not imported: ${t.why}`);
  }
  if (wantShield) {
    const t = tryAdd({ shield: true });
    if (t.ok) sheet.shield = true; else note('gear', 'Shield', `Held on the sheet, not imported: ${t.why}`);
  }
  const weapons = [];
  let dropped = 0;
  for (const { w } of weaponCands) {
    const t = tryAdd({ weapons: [...weapons, w.id] });
    let ok = t.ok, why = t.why;
    if (ok) {
      try { ok = derive({ ...t.trial }).record.attacks.length <= 12; } catch { ok = false; }
      if (!ok) why = 'A character holds twelve attacks at most.';
    }
    if (ok) weapons.push(w.id); else { dropped++; note('gear', w.name, `Carried on the sheet, not imported: ${why}`); }
  }
  void dropped;
  if (weapons.length) sheet.weapons = weapons;

  // Mundane gear: names only. Magic items and anything unmatched are notes.
  const gear = [];
  for (const i of items) {
    if (usedItems.has(i.id) || !i.name) continue;
    if (/^(weapon|armor)$/i.test(i.type)) {
      // A magic weapon listed only in the inventory ("Mace, +1").
      const { keys, bonus } = itemKeys(i.name), named = packItem(i.name), wp = find(weaponByKey, keys);
      const spec = named && CONTENT.items[named.item].wear === 'weapon' ? named : /^weapon$/i.test(i.type) && wp ? magicGear('weapon', bonus, wp.id) : null;
      if (spec && i.carried >= 1) { wantItem(spec, i, i.name); continue; }
      if (!byId.has(i.id) || i.carried >= 1) note(isMagic(i) ? 'magicItems' : 'gear', i.name, isMagic(i) ? 'A magic weapon or armour with no base item in the pack.' : 'A weapon or armour that is not in the SRD 5.2 pack.');
      continue;
    }
    if (isMagic(i) || packItem(i.name)) {
      const spec = packItem(i.name);
      if (spec && i.carried >= 1) { wantItem(spec, i, i.name); continue; }
      note('magicItems', i.name, spec ? 'An SRD 5.2 item, listed as not carried on the sheet; not imported.' : `${i.type || 'Magic item'}: not an SRD 5.2 magic item the pack holds; a name-only note.`, { carried: i.carried > 0 });
      continue;
    }
    if (i.carried < 1) continue;
    if (i.name.length > NAME_MAX) { note('gear', i.name, 'An entry with a long description in its name; not imported.'); continue; }
    if (!/^(adventuring gear|treasure|tool|)$/i.test(i.type)) note('gear', i.name, 'Gear the pack does not hold; kept as a name only.');
    if (gear.length < 60) gear.push(i.name);
  }
  if (gear.length) sheet.gear = gear;

  // Magic items of the pack: each put on the sheet as worn and attuned as the file says, if the sheet accepts it; if
  // not, attuned only if that alone is refused, then carried; what cannot be held at all is a note with the reason.
  for (const it of itemSpecs) {
    const def = CONTENT.items[it.spec.item];
    if (def.variant === 'damageType') { note('magicItems', it.name, `${def.name}: the sheet does not say its damage type, so it is not on the sheet; the DM gives it with its type.`); continue; }
    const tries = [{ equipped: it.equipped && def.wear !== 'carried', attuned: it.attuned && !!def.attune }];
    if (tries[0].attuned) tries.push({ ...tries[0], attuned: false });
    if (tries[0].equipped) tries.push({ equipped: false, attuned: false });
    let put = null, first = null;
    for (const t of tries) {
      const list = [...(sheet.items ?? [])], start = list.length;
      for (let n = 0; n < it.count; n++) list.push({ id: `i${start + n + 1}`, ...it.spec, ...(t.equipped ? { equipped: true } : {}), ...(t.attuned ? { attuned: true } : {}) });
      const r = tryAdd({ items: list });
      if (r.ok) { put = { list, t }; break; }
      first ??= r.why;
    }
    if (!put) { note('magicItems', it.name, `${def.name}, not on the sheet: ${first}`); continue; }
    sheet.items = put.list;
    const lost = [tries[0].equipped && !put.t.equipped ? 'worn' : '', tries[0].attuned && !put.t.attuned ? 'attuned' : ''].filter(Boolean);
    note('magicItems', it.name, `Mapped to the SRD 5.2 ${itemName(def, it.spec)}${it.count > 1 ? ` x${it.count}` : ''} (${def.tier})${put.t.equipped ? ', worn' : ''}${put.t.attuned ? ', attuned' : ''}.${lost.length ? ` Not ${lost.join(' or ')} as on the sheet: ${first}` : ''}`, { item: it.spec.item, tier: def.tier });
  }

  // Tools, size, speed, senses
  const tools = [];
  for (const p of kids(kid(ch, 'proficiencylist'))) {
    const n = txt(p, 'name');
    if (!n) continue;
    if (/armor|shield/i.test(n) || /weapon/i.test(n) || find(weaponByKey, [norm(n)])) continue;           // training: the class decides it
    if (/^tool:|choice|one type|any/i.test(n)) { note('proficiencies', n, 'A choice written on the sheet, not a named tool.'); continue; }
    if (TOOL_WORDS.test(n) && kebab(n).length <= 40) tools.push(kebab(n)); else note('proficiencies', n, 'Not a tool the engine can name.');
  }
  const classTool = c.tools ? kebab(c.tools) : '';
  const toolList = tools.filter((t, k) => tools.indexOf(t) === k && t !== classTool && !(classTool.includes(t) && classTool)).filter((t) => c.tools !== "Thieves' Tools" || t !== 'thieves-tools');
  if (toolList.length) sheet.tools = toolList;
  const size = norm(txt(ch, 'size'));
  if (size === 'small' || size === 'medium') { if (size !== 'medium') sheet.size = size; } else if (size) { adjust('size', txt(ch, 'size'), 'medium', 'A sheet is Small or Medium.'); }
  const base = int(kid(ch, 'speed'), 'base');
  if (base !== null && base >= 5 && base <= 60 && base % 5 === 0) { if (base !== 30) sheet.speed = base; } else if (base !== null) adjust('speed', base, 30, 'A sheet\'s Speed is a multiple of 5 feet from 5 to 60.');
  const senses = {};
  for (const m of txt(ch, 'senses').matchAll(/([A-Za-z]+)\s*(\d{1,3})/g)) {
    const k = m[1].toLowerCase(), v = +m[2];
    if (SENSE_NAMES.includes(k) && v % 5 === 0 && v > 0) senses[k] = v;
  }
  if (Object.keys(senses).length) sheet.senses = senses;

  // Species and background: no species or background data in the pack, only names.
  const race = txt(ch, 'race');
  if (race) {
    const srd = /\bhalf\b/i.test(race) ? undefined : SRD_SPECIES.find((s) => norm(race).split(' ').includes(s));
    note('species', race, srd ? `${srd[0].toUpperCase()}${srd.slice(1)} is an SRD 5.2 species, but the pack holds no species; speed, size and senses are carried, its traits are not.` : `Not an SRD 5.2 species (${race}); the pack holds no species. Speed, size and senses are carried, its traits are not.`);
    if (srd) R.ruleDifferences.push({ name: race, why: `The 5.2 ${srd} differs from the 2014 one: species give no ability score bonuses any more, and its traits are rewritten.` });
    else R.ruleDifferences.push({ name: race, why: '2014 species give ability score increases; 5.2 gives them through the background. The scores were imported as they stand on the sheet.' });
  }
  for (const t of kids(kid(ch, 'traitlist'))) {
    const n = txt(t, 'name');
    if (n && !SPECIES_TRAITS_MAPPED.includes(norm(n))) note('species', n, 'A species trait; the engine has no species traits.');
  }
  for (const g of kids(kid(ch, 'powers'))) {
    if (/innate/i.test(txt(g, 'group')) && txt(g, 'name')) note('species', `${txt(g, 'name')} (innate spell)`, 'A spell a species grants; not on the sheet.');
  }
  const bg = txt(ch, 'background');
  if (bg) {
    const srd = SRD_BACKGROUNDS.includes(norm(bg));
    note('background', bg, srd ? 'An SRD 5.2 background, but the pack holds none; it gives an Origin feat and ability scores in 5.2.' : 'Not an SRD 5.2 background (those are Acolyte, Criminal, Sage and Soldier); the pack holds none.');
  }

  // Feats: one the pack holds by name is put on the sheet at the first place for a feat it can be taken at (an Origin
  // feat at the background's place first), with its choices left open: the sheet does not say which scores, skills
  // or spells it gave, and its scores are taken as they stand. Any other is a name-only note.
  const featNames = [];
  for (const f of kids(kid(ch, 'featlist'))) {
    const n = txt(f, 'name'), def = n ? featByKey.get(norm(n.replace(/\([^)]*\)/g, ' '))) : null;
    if (!n) continue;
    if (!def) { note('feats', n, 'A 2014 feat that is not in SRD 5.2; it can only be a DM-entered note.'); continue; }
    if (featNames.includes(def.id) && !def.repeatable) continue;
    featNames.push(def.id);
    const was = new Set(validate(sheet)), places = featSlots(sheet).filter((sl) => sl.at !== 'species' && !(sheet.feats ?? []).some((x) => x.at === sl.at));
    const at = places.find((sl) => validate({ ...sheet, feats: [...(sheet.feats ?? []), { id: def.id, at: sl.at }] }).every((p) => was.has(p)));
    if (!at) { note('feats', n, `An SRD 5.2 feat, but this character has no free place for a feat it can take (${def.name}: ${def.category} feat); not on the sheet.`); continue; }
    (sheet.feats ??= []).push({ id: def.id, at: at.at });
    const open = def.increase || def.proficiencies || def.spellPick;
    note('feats', n, `An SRD 5.2 feat, taken at ${at.name} (${def.tier}).${open ? ' Its choices (ability points, skills or spells) are not on the sheet: left open, so the sheet\'s scores and skills stand as they are.' : ''}`, { feat: def.id, at: at.at, tier: def.tier });
    if (FEAT_CHANGED.has(def.id)) R.ruleDifferences.push({ name: n, why: `5.2 version: the engine builds the SRD 5.2 ${def.name}, whose rules differ from the 2014 feat of that name.` });
  }
  const openPlaces = featSlots(sheet).filter((sl) => sl.at !== 'species' && !(sheet.feats ?? []).some((x) => x.at === sl.at));
  if (openPlaces.length) R.ruleDifferences.push({ name: 'Places for a feat', why: `${plural(openPlaces.length, 'place')} for a feat left open (${openPlaces.map((sl) => sl.name).join(', ')}): the sheet does not say what was taken there (an Ability Score Improvement's raised scores are already in the scores imported).` });

  // Class features
  const mine = new Map(featuresOf({ ...sheet, spells: undefined }).map((x) => [norm(x.f.name), x.f]));
  for (const x of featuresOf(sheet)) if (x.f.tier && !x.option) R.builtFeatures[x.f.tier] = (R.builtFeatures[x.f.tier] ?? 0) + 1;
  const otherNames = new Map();
  for (const o of known) if (o !== main && o.def && !multi) for (const f of [...o.def.features, ...o.def.subclass.features]) otherNames.set(norm(f.name), o.name);
  for (const f of kids(kid(ch, 'featurelist'))) {
    const raw = txt(f, 'name'), lv = int(f, 'level') ?? 0;
    if (!raw) continue;
    const key = norm(raw.replace(/\([^)]*\)/g, ' ').replace(/:.*$/, ' ')), full = norm(raw);
    const ruleNote = CHANGED.get(key) ?? CHANGED.get(full);
    if (ruleNote) R.ruleDifferences.push({ name: raw, why: ruleNote });
    if (!lv) { if (!ruleNote) note('background', raw, 'A feature of the species or background (no level on the sheet); the pack holds none.'); continue; }
    if (key === 'ability score improvement' || /^(sorcerous origin|sacred oath|druid circle|divine domain|devine domain|bard college)$/.test(key)) continue;   // the feat or the subclass choice, reported elsewhere
    if (key === 'spellcasting') continue;
    const have = mine.get(key);
    if (have) { if (have.tier !== 'auto') note('features', raw, `In the pack at level ${have.level} as ${have.tier === 'assist' ? 'assist (the engine plays part of it)' : 'manual (the DM applies it)'}.`, { level: lv, tier: have.tier }); continue; }
    const elsewhere = otherNames.get(key);
    if (elsewhere) { note('features', raw, `A ${elsewhere} feature; ${elsewhere} is not built.`, { level: lv }); continue; }
    const anyClass = Object.values(CONTENT.classes).find((k) => [...k.features, ...k.subclass.features].some((x) => norm(x.name) === key));
    note('features', raw, anyClass ? `A ${anyClass.name} feature, not one of ${main.name}.` : (lv > 6 ? 'Not in the SRD 5.2 pack (a subclass or 2014 feature), level 7 or above.' : 'Not in the SRD 5.2 pack (a subclass or 2014 feature).'), { level: lv });
  }

  // Spells, for each class that casts, from the sheet's group for that class ("Spells (Bard)"); spells in a group
  // that names no class go to the first class that casts.
  const castGroups = new Map();         // class id -> entries { name, key, level, prepared }
  const generic = [];
  for (const p of kids(kid(ch, 'powers'))) {
    if (!txt(p, 'school') && !txt(p, 'castingtime')) continue;
    const grp = txt(p, 'group'), pname = txt(p, 'name');
    if (!pname || /innate/i.test(grp)) continue;
    const e = { name: pname.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim(), key: spellKey(pname), level: int(p, 'level') ?? 0, prepared: int(p, 'prepared') === 1 };
    const m = /^spells\s*\(\s*([^)]+?)\s*\)$/i.exec(grp);           // "Spells (Druid)"; a copy such as "Spells (Druid) (Name)" is left out
    if (m) { const cd = classByKey.get(norm(m[1])); if (cd) { if (!castGroups.has(cd.id)) castGroups.set(cd.id, []); castGroups.get(cd.id).push(e); continue; } }
    if (/^spells$/i.test(grp)) generic.push(e);
  }
  const uniq = (list) => { const seen = new Set(); return list.filter((e) => !seen.has(e.key) && seen.add(e.key)); };
  const built = multi ? order.map((o) => o.def) : [c];
  for (const [cid, list] of castGroups) {
    if (built.some((d) => d.id === cid)) continue;
    const other = CONTENT.classes[cid], prep = uniq(list.filter((e) => e.level > 0 && e.prepared));
    if (prep.length) note('spells', `${other.name} spells (${prep.length} prepared)`, `Prepared on the sheet as ${other.name} spells; ${other.name} is not built.`, { items: prep.map((e) => e.name) });
  }
  // The spells of class `i` (its entry in a sheet with several classes), as a patch for tryAdd.
  const spellsPatch = (i, list) => (multi ? { classes: sheet.classes.map((x, j) => (j === i ? { ...x, spells: list } : x)) } : { spells: list });
  const casting = built.map((d, i) => ({ d, i })).filter(({ d }) => d.casting);
  const have = [];
  casting.forEach(({ d: cc, i }, n) => {
    const cast = cc.casting, lv = multi ? order[i].level : level, mineGrants = featuresOf(sheet).filter((x) => !multi || x.cls.i === i).map((x) => x.f.grants).filter(Boolean);
    const mineList = castGroups.get(cc.id) ?? [], gen = n === 0 ? generic : [];
    const maxC = cast.cantrips[lv - 1] + mineGrants.reduce((t, g) => t + (g.cantrips ?? 0), 0);
    const classCantrips = uniq(mineList.filter((e) => e.level === 0));
    // Cantrips: a sheet that lists no more than the class knows is a list of known cantrips; a longer one lists the class's
    // spells and flags the chosen, so only the flagged count.
    const wanted = classCantrips.length <= maxC
      ? uniq([...classCantrips, ...gen.filter((e) => e.level === 0 && e.prepared)])
      : uniq([...mineList, ...gen].filter((e) => e.level === 0 && e.prepared));
    if (classCantrips.length > maxC) adjust('cantrips', `${classCantrips.length} listed, ${maxC} known`, `${wanted.length} used`, `The sheet lists more cantrips than the ${multi ? `${cc.name} class` : 'class'} knows; only those flagged as prepared were taken.`);
    const always = new Set(derive({ ...sheet, ...spellsPatch(i, []) }).record.spells ?? []);
    let preparedList = uniq([...mineList, ...gen].filter((e) => e.level > 0 && e.prepared)).sort((a, z) => z.level - a.level || a.name.localeCompare(z.name));
    // A sheet's "prepared" flags are a list only when they are about as many as the sheet says it prepares (plus the oath or
    // domain spells the subclass always has). A class that flags its whole list (clerics, druids) says nothing about the choice.
    const groupCount = kids(kid(ch, 'powergroup')).filter((g) => norm(txt(g, 'name')) === `spells ${norm(cc.name)}`).map((g) => int(g, 'prepared')).find((v) => v !== null) ?? cast.prepared[lv - 1];
    if (preparedList.length > groupCount + 10) {
      note('spells', multi ? `Prepared ${cc.name} spells` : 'Prepared spells', `The sheet flags ${preparedList.length} spells as prepared but says it prepares ${groupCount}, so its flags are not a list of the choice. No leveled spells were imported; the DM chooses ${cast.prepared[lv - 1]} from the ${cc.name} list.`, { items: preparedList.map((e) => e.name) });
      preparedList = [];
    }
    const chosen = [];
    const pool = [...wanted.sort((a, z) => a.name.localeCompare(z.name)), ...preparedList];
    for (const e of pool) {
      const sp = spellByKey.get(e.key);
      if (!sp) { note('spells', e.name, `Level ${e.level}: not in the SRD 5.2 pack.`, { level: e.level }); continue; }
      if (always.has(sp.id)) continue;                                  // an oath or domain spell the subclass always has prepared
      const t = tryAdd(spellsPatch(i, [...chosen, sp.id]));
      if (!t.ok) {
        const why = /prepares \d+ spells/.test(t.why) ? `Over the 5.2 limit of prepared spells at ${multi ? `${cc.name} ` : ''}level ${lv}.` : /cantrip/.test(t.why) ? `Over the 5.2 limit of cantrips at ${multi ? `${cc.name} ` : ''}level ${lv}.` : /is not on the/.test(t.why) ? `Not on the 5.2 ${cc.name} spell list (an oath or domain spell of a non-SRD subclass, or from another class).` : t.why;
        note('spells', sp.name, why, { level: sp.level, inPack: true });
        continue;
      }
      chosen.push(sp.id);
    }
    if (chosen.length) { if (multi) sheet.classes[i].spells = chosen; else sheet.spells = chosen; }
    if (multi && !chosen.length && !mineList.length && !gen.length) note('spells', `${cc.name} spells`, `The sheet lists no spells under "Spells (${cc.name})", so none were imported for the ${cc.name}; the DM chooses ${cast.cantrips[lv - 1]} cantrips and ${cast.prepared[lv - 1]} spells from the ${cc.name} list.`);
    if (standIns.has(cc.id)) have.push(...chosen);
  });
  if (casting.length) {
    const all = standIns.size ? [...new Set([...have, ...(derive(sheet).record.spells ?? []).filter((id) => !casting.some(({ d }) => standIns.has(d.id)) || have.includes(id))])] : derive(sheet).record.spells ?? [];
    for (const id of all) { const sp = CONTENT.spells[id]; R.spellTiers[sp.tier ?? 'manual'].push(sp.name); }
  } else {
    const any = uniq(generic.filter((e) => e.prepared && e.level > 0));
    if (any.length) note('spells', `Spells (${any.length})`, `${c.name} has no Spellcasting feature in the pack.`, { items: any.map((e) => e.name) });
  }

  // Languages and state: not part of a sheet, so they go in the report for the DM or a client to use.
  R.languages = kids(kid(ch, 'languagelist')).map((l) => show(txt(l, 'name'))).filter(Boolean);
  const slotsUsed = {};
  for (let l = 1; l <= 9; l++) { const u = int(kid(kid(ch, 'powermeta'), `spellslots${l}`), 'used'); if (u) slotsUsed[l] = u; }
  R.state = { hp: int(kid(ch, 'hp'), 'total'), hpCurrent: (int(kid(ch, 'hp'), 'total') ?? 0) - (int(kid(ch, 'hp'), 'wounds') ?? 0), tempHp: int(kid(ch, 'hp'), 'temporary') ?? 0, slotsUsed, languages: R.languages.length };

  // Numbers on the sheet against what the engine derives from it
  let record = null;
  try { record = derive(sheet).record; } catch { record = null; }
  const problems = validate(sheet);
  if (record) {
    const lint = lintRecord(record, { spells: SPELLS });
    problems.push(...lint);
    const cmp = (what, theirs, mine, why) => { if (theirs !== null && theirs !== undefined && theirs !== mine) R.numbers.push({ what, sheet: theirs, engine: mine, ...(why ? { why } : {}) }); };
    cmp('Hit Points', int(kid(ch, 'hp'), 'total'), record.hp, 'The engine takes the fixed value per level plus Constitution; a sheet can hold rolled Hit Points, a feat or an item.');
    cmp('Armor Class', int(kid(kid(ch, 'defenses'), 'ac'), 'total'), record.ac, 'The engine counts armour, Shield, Dexterity, Defense, Unarmored Defense and the SRD magic items on the sheet; items not in the pack and spells are not counted.');
    cmp('Speed', int(kid(ch, 'speed'), 'total'), record.speed);
    cmp('Proficiency Bonus', int(ch, 'profbonus'), record.prof, classes.length > 1 && level !== totalLevel ? 'The sheet uses its total level.' : undefined);
    for (const a of ABILITIES) {
      const word = { str: 'strength', dex: 'dexterity', con: 'constitution', int: 'intelligence', wis: 'wisdom', cha: 'charisma' }[a];
      cmp(`${a.toUpperCase()} saving throw`, int(kid(kid(ch, 'abilities'), word), 'save'), mod(record.abil[a]) + (record.saveProf.includes(a) ? record.prof : 0));
    }
    const skillDiff = [];
    for (const s of kids(kid(ch, 'skilllist'))) {
      const key = kebab(txt(s, 'name'));
      if (!Object.hasOwn(SKILLS, key)) continue;
      const theirs = int(s, 'total');
      const mineB = mod(record.abil[SKILLS[key]]) + (record.expertise.includes(key) ? 2 * record.prof : record.skills.includes(key) ? record.prof : 0);
      if (theirs !== null && theirs !== mineB) skillDiff.push(`${key} ${theirs} vs ${mineB}`);
    }
    if (skillDiff.length) R.numbers.push({ what: 'Skill bonuses', sheet: `${skillDiff.length} differ`, engine: skillDiff.slice(0, 6).join('; '), why: 'Half proficiency (Jack of All Trades), item bonuses and a different Proficiency Bonus or ability score show here.' });
    if (record.castAbil) {
      const groups = kids(kid(ch, 'powergroup')).filter((g) => txt(g, 'stat'));
      const g = groups.find((x) => norm(txt(x, 'name')).startsWith(`spells ${norm((casting[0]?.d ?? c).name)}`)) ?? groups[0];
      const word = g ? txt(g, 'stat').toLowerCase() : '';
      const abil = ABILITIES.find((a) => ({ str: 'strength', dex: 'dexterity', con: 'constitution', int: 'intelligence', wis: 'wisdom', cha: 'charisma' })[a] === word);
      if (g && abil) {
        const dc = 8 + (int(g, 'saveprof') === 0 ? 0 : (int(ch, 'profbonus') ?? record.prof)) + mod(int(kid(kid(ch, 'abilities'), word), 'score') ?? 10) + (int(g, 'savemod') ?? 0);
        cmp('Spell save DC', dc, 8 + record.prof + mod(record.abil[record.castAbil]));
      }
      for (let l = 1; l <= 9; l++) {
        const theirs = int(kid(kid(ch, 'powermeta'), `spellslots${l}`), 'max') ?? 0;
        const pact = int(kid(kid(ch, 'powermeta'), `pactmagicslots${l}`), 'max') ?? 0;
        const mineS = record.slots?.[l] ?? 0;
        if (theirs + pact !== mineS) R.numbers.push({ what: `Level ${l} spell slots`, sheet: theirs + pact, engine: mineS, ...(classes.length > 1 && !multi ? { why: 'The sheet combines its classes\' slots.' } : {}) });
      }
    }
  }

  R.problems = problems;
  R.loadable = problems.length === 0;
  const spellsOnSheet = (multi ? sheet.classes.flatMap((x) => x.spells ?? []) : sheet.spells ?? []).map((id) => CONTENT.spells[id]);
  R.imported = {
    class: c.id, level, subclass: (multi ? sheet.classes[0].subclass : sheet.subclass) ?? null,
    ...(multi ? { classes: sheet.classes.map((x) => ({ class: x.class, level: x.level, subclass: x.subclass ?? null })) } : {}), armour: sheet.armour ?? null, shield: !!sheet.shield, weapons: sheet.weapons ?? [],
    skills: [...(sheet.skills ?? []), ...(sheet.extraSkills ?? [])].length, expertise: (sheet.expertise ?? []).length, tools: (sheet.tools ?? []).length, gear: (sheet.gear ?? []).length,
    cantrips: spellsOnSheet.filter((s) => s.level === 0).length, prepared: spellsOnSheet.filter((s) => s.level > 0).length,
    proficiencyBonus: proficiencyFor(level),
  };
  return { character: sheet, report: count(R) };
}
