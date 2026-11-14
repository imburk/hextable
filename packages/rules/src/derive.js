// Characters built from class and level: a sheet of choices in, the record the engine plays out.
//
//   derive(sheet)   -> { record, why }      the finished record (the shape lintRecord checks), and
//                                           for each derived number the reasons, in words
//   validate(sheet) -> [ "plain words", ... ]   what is wrong with a sheet; empty when it can be played
//
// A sheet records choices only (docs/specs/rules-expansion.md, decision 1 and "Built characters"):
//   { name, class, subclass?, level, abilities: { str, dex, con, int, wis, cha },
//     skills: [class skill picks and skills from features], extraSkills?: [from background or species],
//     expertise?: [skills], choices?: { featureId: optionId }, armour?: id, shield?: true,
//     weapons?: [ids, "unarmed-strike"], spells?: [cantrips and prepared spells],
//     size?, speed?, senses?, tools?, gear?, look? }
// Ability scores are entered as they stand after background and feats; class features that raise
// them (Primal Champion) are added here. Pure: no state, no dice.
//
// A character with more than one class (SRD "Multiclassing") lists them in the order taken, in
// place of `class`, `level`, `subclass` and `spells`:
//   { name, classes: [{ class, level, subclass?, spells? }, ...], abilities, skills, ... }
// Its level is the sum; each class's features and resources go by that class's level; the
// Proficiency Bonus, cantrips and Hit Dice by the total. A sheet with one class is unchanged.
import { CONTENT } from './content/index.js';
import { ABILITIES, DAMAGE_TYPES, SKILLS, WEAR_ONE } from './content/schema.js';

export const mod = (score) => Math.floor((score - 10) / 2);
export const proficiencyFor = (level) => 2 + Math.floor((level - 1) / 4);
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
const dice = (d, n) => (n ? `${d}${signed(n)}` : d);
const nice = (id) => id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
// Bigger of two dice of one count ("1d6" or "1d8" -> "1d8").
const sides = (d) => +(/d(\d+)/.exec(d)?.[1] ?? 0);
const bigger = (a, b) => (sides(b) > sides(a) ? b : a);

const ABILITY_NAMES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
// The first class (the one a character started in).
export const classOf = (sheet) => CONTENT.classes[Array.isArray(sheet?.classes) ? sheet.classes[0]?.class : sheet?.class] ?? null;
export const multiclassed = (sheet) => Array.isArray(sheet?.classes);
// Each class the sheet has, in the order taken: { c, level, subclass, spells, first, i }. A sheet with one
// class gives one, from its `class`, `level`, `subclass` and `spells`.
export function classesOf(sheet) {
  const list = multiclassed(sheet) ? sheet.classes : [{ class: sheet?.class, level: sheet?.level, subclass: sheet?.subclass, spells: sheet?.spells }];
  return list.map((x, i) => ({ c: CONTENT.classes[x?.class] ?? null, level: x?.level | 0, subclass: x?.subclass, spells: x?.spells, first: i === 0, i }));
}
// The character's level: the sum of its class levels.
export const levelOf = (sheet) => classesOf(sheet).reduce((n, k) => n + k.level, 0);

// A later class's feature whose id an earlier class's feature has (Spellcasting, Channel Divinity,
// Ability Score Improvement) is played under the class's id in front ("bard-spellcasting"), and so
// are what the class's own features say of it (a cost in its uses, `with`), so each keeps its own
// uses and choices. The first class's ids are never changed.
const REFS = ['resource', 'of', 'with', 'while', 'pool', 'cost', 'after', 'regain', 'unless'];
function relabel(x, map) {
  if (Array.isArray(x)) return x.map((y) => relabel(y, map));
  if (!x || typeof x !== 'object') return x;
  const out = {};
  for (const [k, v] of Object.entries(x)) out[k] = (k === 'id' || REFS.includes(k)) && typeof v === 'string' && map.has(v) ? map.get(v) : relabel(v, map);
  return out;
}

// Every feature the character has from its classes: each class's, its subclass's from the level it
// is gained, and each option chosen. Returns [{ f, option?, of?, cls }], `cls` the class it is from
// (classesOf), whose level its numbers go by.
function classFeatures(sheet) {
  const out = [], taken = new Set();
  for (const k of classesOf(sheet)) {
    const c = k.c;
    if (!c) continue;
    const own = [...c.features, ...c.subclass.features];
    const map = new Map(own.filter((f) => taken.has(f.id)).map((f) => [f.id, `${c.id}-${f.id}`]));
    for (const f of own) taken.add(f.id);
    const sub = k.subclass === c.subclass.id ? c.subclass.features : [];
    for (const f0 of [...c.features, ...sub].filter((x) => x.level <= k.level).sort((a, b) => a.level - b.level)) {
      const f = map.size ? relabel(f0, map) : f0;
      out.push({ f, cls: k });
      if (f.options) {
        // A feature with `pick: n` takes a list of n options (Metamagic); otherwise one.
        const chose = sheet.choices?.[f.id], ids = Array.isArray(chose) ? (f.pick ? chose : []) : [chose];   // a picked list, or one option
        // An option that is a feat (a Fighting Style feat) grants what the feat grants.
        for (const o of f.options.filter((x) => ids.includes(x.id))) out.push({ f: { ...o, ...(o.feat ? { grants: CONTENT.feats[o.feat]?.grants } : {}), id: `${f.id}-${o.id}`, level: f.level, checked: f.checked }, option: true, of: f.id, cls: k });
      }
    }
  }
  return out;
}

// ---------- feats ----------
// A sheet's feats (SRD "Feats"; docs/specs/rules-expansion.md, "Feats" amendment):
//   feats: [{ id, at, abilities?, skills?, tools?, list?, ability?, spells? }]
// `at` is the place the feat is taken: "background" (the background's Origin feat), "species" (an
// Origin feat a species gives: the Human's Versatile; species are not entered, so the DM checks it), or
// the id of a class feature with `feat` (Ability Score Improvement, Epic Boon; "bard-ability-score-
// improvement-4" for a later class). A Fighting Style feat taken with a class's Fighting Style feature
// is that feature's choice (`choices`), as before. The other fields are the feat's own choices: ability
// points (`abilities: { str: 2 }`), skills and tools (Skilled), a spell list, an ability and spells
// (Magic Initiate). A choice left out adds nothing, so the scores typed on the sheet stand for it: a
// sheet's `abilities` are its scores before the feats it lists.
const FEAT_CLASS = { id: 'feat', name: 'Feat', table: {}, features: [], subclass: { id: null, features: [] } };
const ORIGIN_SLOTS = [{ at: 'background', name: 'Background: Origin feat' }, { at: 'species', name: 'Species: Origin feat (Human)' }];
// The places this sheet has for a feat, in the order they are gained: { at, name, category, level }.
// `level` is the character level the place comes at, for a feat's level prerequisite: the class level
// for a character with one class; with several, the character's level now (the order the levels were
// taken in is not recorded).
export function featSlots(sheet, cf = classFeatures(sheet)) {
  const multi = multiclassed(sheet), total = levelOf(sheet);
  return [...ORIGIN_SLOTS.map((o) => ({ ...o, category: 'origin', level: 1 })),
    ...cf.filter((x) => x.f.feat && !x.option).map((x) => ({ at: x.f.id, name: multi ? `${x.f.name} (${x.cls.c.name} ${x.f.level})` : `${x.f.name} (level ${x.f.level})`, category: x.f.feat, level: multi ? total : x.f.level }))];
}
// The sheet's feats that name a feat of the pack and a place the sheet has, in the order of the places,
// each with the id its feature has in the record (`feat-alert`, `feat-skilled-2` for the second).
function chosenFeats(sheet, cf) {
  if (!Array.isArray(sheet?.feats)) return [];
  const slots = featSlots(sheet, cf), order = new Map(slots.map((sl, i) => [sl.at, i]));
  const out = [];
  sheet.feats.forEach((x, i) => {
    const def = x && typeof x === 'object' ? CONTENT.feats[x.id] : null, slot = def ? slots.find((sl) => sl.at === x.at) : null;
    if (def && slot) out.push({ x, def, slot, i });
  });
  out.sort((a, b) => order.get(a.slot.at) - order.get(b.slot.at) || a.i - b.i);
  const seen = {};
  for (const y of out) { const n = seen[y.def.id] = (seen[y.def.id] ?? 0) + 1; y.rid = n === 1 ? `feat-${y.def.id}` : `feat-${y.def.id}-${n}`; }
  return out;
}
// The ability points a feat places, as the sheet chose them (only abilities the feat allows, whole and positive).
const points = (y) => Object.entries(y.x.abilities && typeof y.x.abilities === 'object' ? y.x.abilities : {}).filter(([a, n]) => y.def.increase?.from.includes(a) && Number.isInteger(n) && n > 0);
// Scores after each feat in turn: `before[i]` is what they were before the i-th; none above the feat's maximum.
function raised(base, chosen) {
  const abil = { ...base }, before = [];
  for (const y of chosen) { before.push({ ...abil }); for (const [a, n] of points(y)) abil[a] = Math.max(abil[a], Math.min(y.def.increase.max, abil[a] + n)); }
  return { abil, before };
}
const listOf = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
// A chosen feat as a feature the engine plays: its grants, and for Magic Initiate the free casting of its level 1 spell.
function featFeature(y, total) {
  const d = y.def, x = y.x, grants = structuredClone(d.grants ?? {});
  let name = d.name, uses = null;
  if (d.spellPick && d.spellPick.lists.includes(x.list)) {
    name = `${d.name} (${CONTENT.classes[x.list]?.name ?? x.list})`;
    const l1 = listOf(x.spells).filter((id) => CONTENT.spells[id]?.level === 1);
    if (l1.length) { grants.freeCast = { spells: l1 }; uses = { max: 1, recharge: 'long' }; }
  }
  return { f: { id: y.rid, name, level: y.slot.level, tier: d.tier, text: d.text, checked: d.checked, ...(Object.keys(grants).length ? { grants } : {}), ...(uses ? { uses } : {}) },
    cls: { c: FEAT_CLASS, level: total, i: -1, first: false }, feat: d.id, at: y.slot.at };
}
// Every feature the character has: its classes' (classFeatures) and then its feats', each as a feature.
export function featuresOf(sheet) {
  const cf = classFeatures(sheet), total = levelOf(sheet);
  return [...cf, ...chosenFeats(sheet, cf).map((y) => featFeature(y, total))];
}

// ---------- magic items ----------
// A sheet's magic items (SRD "Magic Items"; docs/specs/rules-expansion.md, "Magic items" amendment):
//   items: [{ id, item, base?, type?, spell?, equipped?, attuned?, charges? }]
// `id` is the item's own short key on the sheet ("i1"), `item` a magic item of the pack, `base` the weapon or
// armour it is made from where the item lets you choose, `type` and `spell` its variant (a Ring of Resistance's
// damage type, a Spell Scroll's spell). An item works while worn or held (`equipped`; one that works from your
// person needs nothing) and, if it needs Attunement, while `attuned`. Its magic flows into the record: the armour
// worn, a Shield, attacks, Armor Class, scores, and features whose modifiers modifiers.js reads. Without the
// Attunement it needs, it gives only what its mundane item gives. `attuning: { item, end? }` is the item the
// character will spend its next Short Rest attuning to, or ending its Attunement to (engine.js, shortRest).
export const ATTUNE_MAX = 3;
export const ORBIT_MAX = 3;
export function heldItems(sheet) {
  if (!Array.isArray(sheet?.items)) return [];
  return sheet.items.filter((x) => x && typeof x === 'object' && Object.hasOwn(CONTENT.items, x.item)).map((x) => ({ x, def: CONTENT.items[x.item] }));
}
// The mundane weapon or armour a magic item is: the sheet's `base` if the item allows it, else the one item it names.
export function itemBase(def, x) {
  const b = def?.base;
  if (!b) return null;
  const weapon = b.weapon !== undefined, pool = weapon ? CONTENT.weapons : CONTENT.armour, want = weapon ? b.weapon : b.armour;
  const fits = (id) => Object.hasOwn(pool, id) && (want === 'any' ? weapon || pool[id].category !== 'shield' : want === 'melee' ? pool[id].kind === 'melee' : want.includes(id));
  if (x?.base !== undefined) return fits(x.base) ? pool[x.base] : null;
  return Array.isArray(want) && want.length === 1 ? pool[want[0]] : null;
}
// "Spear +1" for a Weapon, +1 made from a Spear; a named item keeps its name.
export function itemName(def, x) {
  if (!def) return '';
  if (/^(Weapon|Armor|Shield), \+\d$/.test(def.name)) return `${def.wear === 'shield' ? 'Shield' : itemBase(def, x)?.name ?? def.name.split(',')[0]} +${def.bonus}`;
  if (def.variant === 'spell' && CONTENT.spells[x?.spell]) return `${def.name} (${CONTENT.spells[x.spell].name})`;
  if (def.variant === 'damageType' && typeof x?.type === 'string') return `${def.name} (${nice(x.type)})`;
  return def.name;
}
const isWorn = (y) => y.def.wear === 'carried' || y.x.equipped === true;
export const itemActive = (y) => isWorn(y) && (!y.def.attune || y.x.attuned === true);
// An active item that grants something, as a feature the engine plays. Its Armor Class bonuses that hold
// always are put in the record's AC (`acBonus`), not left as modifiers, so the sheet shows the AC played.
function itemFeature(y, level) {
  const g = structuredClone(y.def.grants ?? {});
  for (const m of g.modifiers ?? []) if (Array.isArray(m.types)) m.types = m.types.map((t) => (t === 'chosen' ? y.x.type : t));
  let acBonus = 0;
  if (g.modifiers) {
    g.modifiers = g.modifiers.filter((m) => { const flat = m.on === 'ac' && m.op === 'add' && typeof m.value === 'number' && !m.when; if (flat) acBonus += m.value; return !flat; });
    if (!g.modifiers.length) delete g.modifiers;
  }
  return { f: { id: `item-${y.x.id}`, name: itemName(y.def, y.x).slice(0, 60), level: 1, tier: y.def.tier, text: y.def.text, checked: y.def.checked, ...(Object.keys(g).length ? { grants: g } : {}), ...(acBonus ? { acBonus } : {}) },
    cls: { c: FEAT_CLASS, level, i: -1, first: false }, item: y.x.id };
}

// A number that grows with the class (schema.js, lintAmount).
export function amount(x, c, level, abil, pb = proficiencyFor(level)) {
  if (typeof x === 'number') return x;
  if (x?.prof !== undefined) return x.prof * pb;                                   // so many times the Proficiency Bonus (Alert)
  if (x?.column !== undefined) return c.table[x.column][level - 1];
  // { mod, min, die }: so many of that die as the modifier (Sear Undead: Wisdom modifier d8s, at least one).
  if (x?.mod !== undefined && x.die !== undefined) return `${Math.max(x.min ?? 0, mod(abil[x.mod]))}d${x.die}`;
  if (x?.mod !== undefined) return Math.max(x.min ?? -Infinity, mod(abil[x.mod]));
  if (x?.perLevel !== undefined) return x.perLevel * level;
  // { byLevel: { 7: "1d8", 14: "2d8" } }: the value for the highest class level reached (Divine Strike).
  if (x?.byLevel !== undefined) { const at = Object.keys(x.byLevel).map(Number).filter((l) => l <= level).sort((a, b) => b - a)[0]; return at === undefined ? null : x.byLevel[at]; }
  return x;
}
const isAmount = (v) => !!v && typeof v === 'object' && ['column', 'mod', 'perLevel', 'byLevel', 'prof'].some((k) => v[k] !== undefined);
// A class feature's modifiers and steps with their numbers put in.
function bakeAt(list, c, level, abil, pb = proficiencyFor(level)) {
  return structuredClone(list).map((x) => {
    const fix = (m) => { if (m && isAmount(m.value)) m.value = amount(m.value, c, level, abil, pb); };
    fix(x); fix(x.modifier);
    if (x.addLevel) { x.heal = dice(x.heal, level); delete x.addLevel; }
    for (const k of ['heal', 'tempHp', 'damage']) {
      if (x[k] && typeof x[k] === 'object') x[k] = amount(x[k], c, level, abil);                  // a die from the class table
      if (k in x && typeof x.addMod === 'string') { x[k] = dice(x[k], mod(abil[x.addMod])); delete x.addMod; }
    }
    if ('save' in x && typeof x.dc === 'string') x.dc = 8 + pb + mod(abil[x.dc]);   // the class's own DC (Proficiency Bonus by total level)
    for (const b of ['onHit', 'onMiss', 'onFail', 'onSuccess']) if (Array.isArray(x[b])) x[b] = bakeAt(x[b], c, level, abil, pb);   // and inside branches
    return x;
  });
}

// Steps that come with a later feature (`with: feature id`: Sear Undead's damage in Turn Undead)
// are kept only if the character has that feature, and lose the mark.
function prune(steps, held) {
  return steps.filter((x) => x.with === undefined || held.has(x.with)).map((x) => {
    const { with: _w, ...y } = x;
    for (const b of ['onHit', 'onMiss', 'onFail', 'onSuccess']) if (Array.isArray(y[b])) y[b] = prune(y[b], held);
    return y;
  });
}

// What a weapon category word in a class's list covers.
function weaponTrained(w, words) {
  return words.some((k) => k === w.category || (k === 'martial-light' && w.category === 'martial' && w.properties.includes('light'))
    || (k === 'martial-finesse-or-light' && w.category === 'martial' && (w.properties.includes('light') || w.properties.includes('finesse'))));
}
const grantsOf = (feats) => feats.map((x) => x.f.grants).filter(Boolean);

// Everything the sheet's classes and features add up to, before the record is assembled. A class
// taken after the first gives only its multiclass training (SRD, each class's "As a Multiclass
// Character"); saving throw proficiencies come from the first class alone.
function gather(sheet) {
  const ks = classesOf(sheet), c = ks[0].c, level = ks.reduce((n, k) => n + k.level, 0), cf = classFeatures(sheet), chosen = chosenFeats(sheet, cf);
  const held = heldItems(sheet), on = held.filter(itemActive);
  const feats = [...cf, ...chosen.map((y) => featFeature(y, level)), ...on.filter((y) => y.def.grants).map((y) => itemFeature(y, level))], G = grantsOf(feats);
  // Scores as typed, then each feat's points in the order the feats were taken, then class features that raise them (Primal Champion).
  const typed = Object.fromEntries(ABILITIES.map((a) => [a, sheet.abilities?.[a] ?? 10]));
  const { abil, before } = raised(typed, chosen);
  // A bonus never lowers a score already above its maximum.
  for (const g of G) if (g.abilityBonus) for (const a of ABILITIES) if (g.abilityBonus[a]) abil[a] = Math.max(abil[a], Math.min(g.abilityBonus.max ?? 30, abil[a] + g.abilityBonus[a]));
  // A score an item sets (Amulet of Health: Constitution 19) holds unless the score is already as high; of two, the higher.
  for (const g of G) for (const [a, v] of Object.entries(g.setAbility ?? {})) abil[a] = Math.max(abil[a], v);
  const armourWords = new Set(c.armour), weaponWords = new Set(c.weapons);
  for (const k of ks.slice(1)) { for (const a of k.c.multiclass.armour) armourWords.add(a); for (const w of k.c.multiclass.weapons) weaponWords.add(w); }
  for (const g of G) { for (const a of g.proficiency?.armour ?? []) armourWords.add(a); for (const w of g.proficiency?.weapons ?? []) weaponWords.add(w); }
  // Magic armour worn as if trained (Elven Chain): its own category.
  const suit = held.find((y) => isWorn(y) && y.def.wear === 'armour'), shieldItem = held.find((y) => isWorn(y) && y.def.wear === 'shield');
  const trainedSuit = suit?.def.trained ? itemBase(suit.def, suit.x)?.category : null;
  // Skills and tools a feat gives (Skilled).
  const featSkills = chosen.flatMap((y) => (y.def.proficiencies ? listOf(y.x.skills).filter((k) => Object.hasOwn(SKILLS, k)) : []));
  const featTools = chosen.flatMap((y) => (y.def.proficiencies ? listOf(y.x.tools) : []));
  return { ks, c, level, cf, chosen, before, typed, feats, G, abil, armourWords, weaponWords, featSkills, featTools, held, suit, shieldItem, trainedSuit, pb: proficiencyFor(level) };
}

// ---------- the record ----------

export function derive(sheet) {
  const { ks, c, level, chosen, feats, G, abil, armourWords, weaponWords, featSkills, featTools, held, suit, shieldItem, trainedSuit, pb } = gather(sheet);
  const multi = ks.length > 1;
  const why = {};
  // Magic armour or a magic Shield worn is the armour or Shield (validate refuses a second); its bonus only with the Attunement it needs.
  const armour = suit ? itemBase(suit.def, suit.x) : sheet.armour ? CONTENT.armour[sheet.armour] : null, shield = !!sheet.shield || !!shieldItem;
  const shieldOk = shield && armourWords.has('shield');
  const unarmoured = !armour, bare = unarmoured && !shield;
  const sum = (k) => G.reduce((n, g) => n + (typeof g[k] === 'number' ? g[k] : 0), 0);

  // Hit Points: the Hit Die's highest number at level 1, its fixed value after; each level adds the
  // Constitution modifier, at least 1 Hit Point a level (SRD "Gaining a Level"). Another class's
  // levels add its own fixed value; only the first class gives the level 1 Hit Points (Multiclassing).
  const con = mod(abil.con);
  let hp = 0;
  why.hp = [];
  ks.forEach((k, i) => {
    const fixed = k.c.hitDie / 2 + 1, n = i === 0 ? k.level - 1 : k.level;
    if (i === 0) { hp += Math.max(1, k.c.hitDie + con); why.hp.push(`${k.c.hitDie} at level 1`); }
    hp += n * Math.max(1, fixed + con);
    if (n) why.hp.push(multi ? `${fixed} for each of ${n} ${k.c.name} level${n === 1 ? '' : 's'}${i === 0 ? ' after the first' : ''}` : `${fixed} for each of ${n} more levels`);
  });
  why.hp.push(`Constitution ${signed(con)} a level`);
  for (const x of feats) if (x.f.grants?.hp) { const n = amount(x.f.grants.hp, x.cls.c, x.cls.level, abil); hp += n; why.hp.push(`${x.f.name} ${signed(n)}`); }

  // Armor Class: the armour's, or 10 + Dexterity, or the best Unarmored Defense; a Shield adds 2 if
  // trained (and not for a formula that forbids it); Defense adds 1 in armour.
  const dex = mod(abil.dex);
  let ac, acWhy;
  if (armour) {
    const d = armour.dex === 'full' ? dex : typeof armour.dex === 'number' ? Math.min(dex, armour.dex) : 0;
    ac = armour.ac + d; acWhy = [`${armour.name} ${armour.ac}`, ...(armour.dex !== undefined ? [`Dexterity ${signed(d)}`] : [])];
  } else {
    ac = 10 + dex; acWhy = ['10', `Dexterity ${signed(dex)}`];
    for (const x of feats) {
      const f = x.f.grants?.ac;
      if (!f || (!f.shield && shield)) continue;
      const n = f.base + f.abilities.reduce((t, a) => t + mod(abil[a]), 0);
      if (n > ac) { ac = n; acWhy = [`${x.f.name}: ${f.base}`, ...f.abilities.map((a) => `${nice(a)} ${signed(mod(abil[a]))}`)]; }
    }
  }
  if (shieldOk) { ac += 2; acWhy.push('Shield +2'); }
  if (armour && sum('armouredAc')) { ac += sum('armouredAc'); acWhy.push(`Defense ${signed(sum('armouredAc'))}`); }
  // Magic armour and Shields, items that add to AC (Ring of Protection), and those that add only with no armour and no Shield (Bracers of Defense).
  for (const y of [suit, shieldItem]) if (y && y.def.bonus && itemActive(y)) { ac += y.def.bonus; acWhy.push(`Magic +${y.def.bonus} (${itemName(y.def, y.x)})`); }
  for (const x of feats) if (x.f.acBonus) { ac += x.f.acBonus; acWhy.push(`${x.f.name} ${signed(x.f.acBonus)}`); }
  if (!armour && !shield) for (const x of feats) if (x.f.grants?.bareAc) { ac += x.f.grants.bareAc; acWhy.push(`${x.f.name} +${x.f.grants.bareAc}`); }
  why.ac = acWhy;

  // Speed: the sheet's (from species, 30 if not given), heavy armour too heavy for the wearer
  // costs 10 feet, and features add.
  let speed = sheet.speed ?? 30;
  why.speed = [`${speed} ft`];
  if (armour?.strength && abil.str < armour.strength) { speed -= 10; why.speed.push(`${armour.name} needs Strength ${armour.strength}: -10 ft`); }
  for (const x of feats) {
    const sp = x.f.grants?.speed;
    if (!sp) continue;
    if (sp.unless === 'heavy' && armour?.category === 'heavy') continue;
    if (sp.unless === 'armour' && !bare) continue;
    const n = amount(sp.add, x.cls.c, x.cls.level, abil);
    speed += n; why.speed.push(`${x.f.name} +${n} ft`);
  }
  const speeds = {};
  for (const g of G) {
    if (Array.isArray(g.speeds)) for (const m of g.speeds) speeds[m] = Math.max(speeds[m] ?? 0, speed);
    else for (const [m, v] of Object.entries(g.speeds ?? {})) speeds[m] = Math.max(speeds[m] ?? 0, v);     // feet (Ring of Swimming)
  }
  const senses = { ...(sheet.senses ?? {}) };
  for (const g of G) for (const [k, v] of Object.entries(g.senses ?? {})) senses[k] = Math.max(senses[k] ?? 0, v);
  for (const g of G) for (const [k, v] of Object.entries(g.senseRange ?? {})) senses[k] = (senses[k] ?? 0) + v;     // gained, or longer (Goggles of Night)

  // Saves, skills, expertise.
  const saveProf = new Set(c.saves);
  for (const g of G) { if (g.saves === 'all') ABILITIES.forEach((a) => saveProf.add(a)); else for (const a of g.saves ?? []) saveProf.add(a); }
  const skills = Object.keys(SKILLS).filter((k) => sheet.skills?.includes(k) || sheet.extraSkills?.includes(k) || featSkills.includes(k));
  const expertise = skills.filter((k) => sheet.expertise?.includes(k));

  // Attacks, from the weapons carried.
  const maX = feats.find((x) => x.f.grants?.martialArts), maDie = maX && bare ? amount(maX.f.grants.martialArts, maX.cls.c, maX.cls.level, abil) : null;
  const ranged = sum('rangedAttack');
  const attacks = [];
  const add = (a) => attacks.push(a);
  // A weapon's attacks. A magic weapon (`it`) adds its bonus to attack and damage, and may deal another type or
  // have more properties (Sun Blade); `id` and `name` are the item's.
  const magicPlus = {};
  const weaponAttacks = (w0, it = null) => {
    const w = it?.props ? { ...w0, properties: [...new Set([...w0.properties, ...it.props])] } : w0;
    const key = it?.id ?? w.id, label = it?.name ?? w.name, plus = it?.plus ?? 0;
    if (plus) for (const sfx of ['', '-two-handed', '-thrown']) magicPlus[`${key}${sfx}`] = `${label} +${plus}`;
    const monkWeapon = maDie && w.kind === 'melee' && (w.category === 'simple' || w.properties.includes('light'));
    const finesse = w.properties.includes('finesse') || monkWeapon;
    const ab = finesse ? (abil.dex > abil.str ? 'dex' : 'str') : w.kind === 'ranged' ? 'dex' : 'str';
    const m = mod(abil[ab]), trained = weaponTrained(w, [...weaponWords]);
    const base = m + (trained ? pb : 0) + plus, die = monkWeapon ? bigger(w.damage, maDie) : w.damage;
    const dmg = (d) => (/^\d+$/.test(d) ? signed(+d + m + plus) : dice(d, m + plus));
    const common = { dtype: it?.dtype ?? w.type, abil: ab, weapon: w.id, ...(finesse && w.properties.includes('finesse') ? { finesse: true } : {}) };
    const reach = w.properties.includes('reach') ? 10 : 5;
    if (w.kind === 'melee') {
      add({ id: key, name: label, type: 'melee', bonus: base, damage: dmg(die), reach, ...common });
      // Versatile: the two-handed damage, while no Shield takes the other hand.
      if (w.versatile && !shield) add({ id: `${key}-two-handed`, name: `${label} (two hands)`, type: 'melee', bonus: base, damage: dmg(monkWeapon ? bigger(w.versatile, maDie) : w.versatile), reach, ...common });
      if (w.properties.includes('thrown')) add({ id: `${key}-thrown`, name: `${label} (thrown)`, type: 'ranged', bonus: base, damage: dmg(w.damage), range: [...w.range], ...common });
    } else add({ id: key, name: label, type: 'ranged', bonus: base + ranged, damage: dmg(die), range: [...w.range], ...common });
  };
  for (const id of sheet.weapons ?? []) {
    if (id === 'unarmed-strike') continue;
    const w = CONTENT.weapons[id];
    if (w) weaponAttacks(w);
  }
  // Magic weapons held (a Staff of Striking is a magic Quarterstaff). Without the Attunement one needs, it is its plain weapon.
  for (const y of held) {
    const w = y.def.base?.weapon !== undefined && isWorn(y) ? itemBase(y.def, y.x) : null;
    if (!w) continue;
    const on = itemActive(y);
    weaponAttacks(w, { id: `item-${y.x.id}`, name: itemName(y.def, y.x).slice(0, 28), plus: on ? y.def.bonus ?? 0 : 0, ...(on && y.def.damageType ? { dtype: y.def.damageType } : {}), ...(on && y.def.properties ? { props: y.def.properties } : {}) });
  }
  // Unarmed Strike: 1 + Strength modifier Bludgeoning; Martial Arts makes it its die with the
  // better of Strength and Dexterity, and adds one as a Bonus Action.
  if (maDie || sheet.weapons?.includes('unarmed-strike')) {
    const ab = maDie && abil.dex > abil.str ? 'dex' : 'str', m = mod(abil[ab]);
    const u = { name: 'Unarmed Strike', type: 'melee', bonus: m + pb, damage: maDie ? dice(maDie, m) : signed(1 + m), dtype: 'bludgeoning', reach: 5, abil: ab };
    add({ id: 'unarmed-strike', ...u });
    if (maDie) add({ id: 'unarmed-strike-bonus', ...u, name: 'Unarmed Strike (Bonus Action)', time: 'bonus' });
  }

  // Spellcasting. Each class prepares its own spells and casts them with its own ability (`spellAbil`
  // for those whose ability is not the first casting class's). With Spellcasting from more than one
  // class the slots come from the Multiclass Spellcaster table by combined caster level (Multiclassing).
  const casters = ks.filter((k) => k.c.casting), spells = [], slots = {}, spellAbil = {};
  const castAbil = casters[0]?.c.casting.ability;
  let pact = false;
  for (const k of casters) {
    const always = new Set(), ab = k.c.casting.ability;
    for (const x of feats) if (x.cls.i === k.i) for (const id of x.f.grants?.spells ?? []) always.add(id);
    for (const [l, list] of Object.entries(k.subclass === k.c.subclass.id ? k.c.subclass.spells ?? {} : {})) if (+l <= k.level) list.forEach((id) => always.add(id));
    for (const id of [...(k.spells ?? []), ...always]) {
      if (!CONTENT.spells[id]) continue;
      // A spell two classes prepare is cast with the better of their abilities.
      if (!spells.includes(id)) { spells.push(id); if (ab !== castAbil) spellAbil[id] = ab; }
      else if (mod(abil[ab]) > mod(abil[spellAbil[id] ?? castAbil])) { if (ab === castAbil) delete spellAbil[id]; else spellAbil[id] = ab; }
    }
  }
  if (casters.length === 1) {
    const k = casters[0], cast = k.c.casting;
    if (cast.kind === 'pact') { slots[cast.slotLevel[k.level - 1]] = cast.slots[k.level - 1]; pact = true; }
    else cast.slots[k.level - 1].forEach((n, i) => { slots[i + 1] = n; });
  } else if (casters.length > 1) {
    // Pact Magic beside Spellcasting is refused by validate (not built); its slots are left out here.
    const at = casters.reduce((n, k) => n + (k.c.multiclass.caster === 'full' ? k.level : k.c.multiclass.caster === 'half' ? Math.ceil(k.level / 2) : 0), 0);
    if (at > 0) CONTENT.multiclass.slots[Math.min(20, at) - 1].forEach((n, i) => { slots[i + 1] = n; });
  }
  // Spells a feat teaches (Magic Initiate), cast with the ability chosen for it; one a class also prepares uses the better.
  const featCast = [];
  let firstAbil = castAbil;
  for (const y of chosen) {
    const sp0 = y.def.spellPick, ab = y.x.ability;
    if (!sp0 || !sp0.lists.includes(y.x.list) || !sp0.abilities.includes(ab)) continue;
    firstAbil ??= ab;
    for (const id of listOf(y.x.spells)) {
      if (!CONTENT.spells[id]) continue;
      featCast.push(`${CONTENT.spells[id].name} (${y.def.name}, ${nice(ab)})`);
      if (!spells.includes(id)) { spells.push(id); if (ab !== firstAbil) spellAbil[id] = ab; }
      else if (mod(abil[ab]) > mod(abil[spellAbil[id] ?? firstAbil])) { if (ab === firstAbil) delete spellAbil[id]; else spellAbil[id] = ab; }
    }
  }
  const cast = casters.length > 0 || featCast.length > 0;

  // Features the engine plays: their uses, modifiers and actions, with the numbers put in.
  const feat = [];
  const legacy = {};
  let critOn = 20;
  const bonusActs = new Set(), resist = new Set(), condImmune = new Set();
  for (const x of feats) {
    const f = x.f, g = f.grants ?? {}, c = x.cls.c, level = x.cls.level;            // a feature's numbers go by its own class's level
    const bake = (list) => bakeAt(list, c, level, abil, pb);
    const out = { id: f.id, name: f.name, tier: f.tier, text: f.text };
    if (f.uses) {
      const rest = typeof f.uses.recharge === 'string' ? f.uses.recharge : Object.entries(f.uses.recharge).filter(([l]) => +l <= level).sort((a, b) => b[0] - a[0])[0][1];
      out.uses = { max: amount(f.uses.max, c, level, abil), recharge: rest, ...(f.uses.short && rest === 'long' ? { short: f.uses.short } : {}) };
    }
    if (g.modifiers) out.modifiers = bake(g.modifiers);
    if (g.action) {
      const a = structuredClone(g.action);
      const held = new Set(feats.map((y) => y.f.id));
      if (a.orCost?.with !== undefined) { if (held.has(a.orCost.with)) delete a.orCost.with; else delete a.orCost; }   // Sorcery Incarnate
      if (a.effects) a.effects = prune(bake(a.effects), held);
      for (const m of a.modes ?? []) m.effects = prune(bake(m.effects), held);
      if (a.form) for (const k of ['maxCr', 'fly', 'hours', 'tempHp']) if (isAmount(a.form[k])) a.form[k] = amount(a.form[k], c, level, abil);
      if (isAmount(a.target?.creature?.count)) a.target.creature.count = amount(a.target.creature.count, c, level, abil);
      if (a.gain?.attacks) a.gain.attacks.n = amount(a.gain.attacks.n, c, level, abil);
      out.action = a;
    }
    if (g.recover) out.recover = { ...g.recover };
    if (g.freeCast) out.freeCast = structuredClone(g.freeCast);
    for (const k of ['metamagic', 'metamagicMax', 'exchange']) if (g[k]) out[k] = structuredClone(g[k]);
    if (g.restore) out.restore = { of: g.restore.of, max: amount(g.restore.max, c, level, abil) };
    // An aura (Aura of Protection): what it gives its holder and allies within range (modifiers.js, aurasOn).
    if (g.aura) out.aura = { range: amount(g.aura.range, c, level, abil), ...(g.aura.modifiers ? { modifiers: bake(g.aura.modifiers) } : {}), ...(g.aura.immune ? { immune: [...g.aura.immune] } : {}) };
    // A reaction's cut with its class numbers put in (Deflect Attacks: 1d10 + Dexterity + Monk level).
    if (g.reaction) {
      const r = structuredClone(g.reaction);
      if (r.cut?.add) { r.cut = { dice: dice(r.cut.dice, r.cut.add.reduce((n, x) => n + amount(x, c, level, abil), 0)) }; }
      out.reaction = r;
    }
    // Since #224: movement with another feature's action, Brutal Strike's options, Relentless Rage's
    // Hit Points, and what happens on rolling Initiative, with their class numbers put in.
    if (g.moveWith) out.moveWith = { ...g.moveWith };
    if (g.brutal) out.brutal = { ...(g.brutal.after ? { after: g.brutal.after, dice: g.brutal.dice } : {}), options: g.brutal.options.map((o) => ({ ...o, effects: bake(o.effects) })) };
    if (g.relentless) out.relentless = { ...g.relentless, hp: amount(g.relentless.hp, c, level, abil) };
    if (g.initiative) {
      const { addLevel, heal, ...rest } = g.initiative;
      out.initiative = { ...rest, ...(heal !== undefined ? { heal: addLevel ? dice(amount(heal, c, level, abil), level) : amount(heal, c, level, abil) } : {}) };
    }
    if (g.reroll) out.reroll = { cost: g.reroll.cost, ...(g.reroll.add !== undefined ? { add: amount(g.reroll.add, c, level, abil) } : {}) };
    if (g.missed) out.missed = structuredClone(g.missed);
    if (g.extraAttack) legacy.extraAttack = Math.max(legacy.extraAttack ?? 0, g.extraAttack);
    if (g.sneak) legacy.sneak = amount(g.sneak, c, level, abil);
    if (g.critOn) critOn = Math.min(critOn, g.critOn);
    for (const b of g.bonusActs ?? []) bonusActs.add(b);
    for (const t of g.resist ?? []) resist.add(t);
    for (const t of g.conditionImmune ?? []) condImmune.add(t);
    feat.push(out);
  }

  // Conditions a later feature lets a pool remove (Restoring Touch), added to that pool's own.
  for (const x of feats) {
    const cu = x.f.grants?.cure, to = cu && feat.find((o) => o.id === cu.of)?.action;
    if (to?.cure) to.cure.conditions = [...new Set([...to.cure.conditions, ...cu.conditions])];
  }

  // A feature whose lasting effect another makes last without renewing (Persistent Rage on Rage): its
  // parts no longer end with the turn, and it ends early only on the condition named.
  for (const x of feats) {
    const p = x.f.grants?.persist, to = p && feat.find((o) => o.id === p.of)?.action;
    if (!to) continue;
    for (const st of to.effects ?? []) if (st.ends?.on === 'turnEnd') delete st.ends;
    delete to.endsWhenIncapacitated;
    to.endsOn = p.endsOn;
  }

  const named = (k) => (k.subclass === k.c.subclass.id && k.level >= 3 ? `${k.c.name} (${k.c.subclass.name})` : k.c.name);
  const cls = multi ? [ks.map((k) => `${named(k)} ${k.level}`), ks.map((k) => `${k.c.name} ${k.level}`)].map((l) => l.join(' / ')).find((t) => t.length <= 40) ?? ks.map((k) => `${k.c.name} ${k.level}`).join(' / ').slice(0, 40)
    : named(ks[0]).length <= 40 ? named(ks[0]) : c.name;
  // Hit Dice of more than one size are counted apart (Multiclassing, Hit Points and Hit Point Dice).
  const hitDice = {};
  for (const k of ks) hitDice[k.c.hitDie] = (hitDice[k.c.hitDie] ?? 0) + k.level;
  const thieves = ks.some((k, i) => (i === 0 ? k.c.tools : k.c.multiclass.tools) === "Thieves' Tools");
  const record = {
    name: String(sheet.name ?? '').trim(), cls, level, size: sheet.size ?? 'medium',
    ac, hp, speed, ...(Object.keys(speeds).length ? { speeds } : {}), ...(Object.keys(senses).length ? { senses } : {}),
    prof: pb, abil, saveProf: ABILITIES.filter((a) => saveProf.has(a)), skills, expertise,
    tools: [...(thieves ? ['thieves-tools'] : []), ...(sheet.tools ?? []), ...featTools].filter((t, i, l) => l.indexOf(t) === i),
    attacks,
    ...(cast ? { castAbil: firstAbil, spells, slots } : {}),
    ...(Object.keys(spellAbil).length ? { spellAbil } : {}),
    ...(pact ? { pact: true } : {}),
    ...(Object.keys(legacy).length ? { features: legacy } : {}),
    feats: feat, hitDie: c.hitDie,
    ...(multi ? { classes: ks.map((k) => ({ id: k.c.id, level: k.level, ...(k.subclass !== undefined ? { subclass: k.subclass } : {}) })) } : {}),
    ...(Object.keys(hitDice).length > 1 ? { hitDice } : {}),
    armour: armour?.category ?? 'none', ...(shield ? { shield: true } : {}),
    ...(critOn < 20 ? { critOn } : {}), ...(bonusActs.size ? { bonusActs: [...bonusActs] } : {}), ...(resist.size ? { resist: [...resist] } : {}), ...(condImmune.size ? { conditionImmune: [...condImmune] } : {}),
    ...(sheet.gear?.length ? { gear: [...sheet.gear] } : {}),
    ...(sheet.look ? { look: { ...sheet.look } } : {}),
  };
  why.prof = [`Level ${level}: ${signed(pb)}`];
  why.attacks = Object.fromEntries(attacks.map((a) => [a.id, [`${nice(a.abil)} ${signed(mod(abil[a.abil]))}`, ...(a.weapon && !weaponTrained(CONTENT.weapons[a.weapon], [...weaponWords]) ? ['not proficient'] : [`Proficiency ${signed(pb)}`]), ...(a.type === 'ranged' && ranged && !a.id.endsWith('-thrown') ? [`Archery ${signed(ranged)}`] : []), ...(magicPlus[a.id] ? [magicPlus[a.id]] : [])]]));
  if (casters.length) why.spells = [`${nice(castAbil)} ${signed(mod(abil[castAbil]))}`, `Proficiency ${signed(pb)}`, `save DC ${8 + pb + mod(abil[castAbil])}`, `attack ${signed(pb + mod(abil[castAbil]))}`,
    ...casters.filter((k) => k.c.casting.ability !== castAbil).map((k) => `${k.c.name} spells: ${nice(k.c.casting.ability)}, save DC ${8 + pb + mod(abil[k.c.casting.ability])}, attack ${signed(pb + mod(abil[k.c.casting.ability]))}`)];
  if (featCast.length) why.spells = [...(why.spells ?? []), ...featCast];
  // Ability scores: as typed, and what each feat added.
  why.abil = chosen.filter((y) => points(y).length).map((y) => `${y.def.name}: ${points(y).map(([a, n]) => `${nice(a)} +${n}`).join(', ')}`);
  return { record, why };
}

// ---------- what is wrong with a sheet ----------

const SHEET_FIELDS = ['name', 'class', 'subclass', 'level', 'classes', 'abilities', 'skills', 'extraSkills', 'expertise', 'choices', 'armour', 'shield', 'weapons', 'spells',
  'size', 'speed', 'senses', 'tools', 'gear', 'look', 'feats', 'items', 'attuning'];
export function validate(sheet) {
  const bad = [], say = (m) => bad.push(m);
  if (!sheet || typeof sheet !== 'object') return ['A sheet is a record of choices.'];
  for (const k of Object.keys(sheet)) if (!SHEET_FIELDS.includes(k)) say(`"${k}" is not something a sheet has.`);
  if (JSON.stringify(sheet).length > 20000) say('That sheet is too long.');
  const multi = multiclassed(sheet), choose = `Choose a class: ${Object.keys(CONTENT.classes).join(', ')}.`;
  if (multi) {
    // Several classes (Multiclassing): each with its own level, subclass and spells, in the order taken.
    for (const k of ['class', 'level', 'subclass', 'spells']) if (sheet[k] !== undefined) say(`A sheet with several classes keeps "${k}" in each of its classes.`);
    const list = sheet.classes;
    if (!(list.length >= 2 && list.length <= 12)) return [...bad, 'A character with several classes lists 2 to 12 of them, the first class first.'];
    if (!list.every((x) => x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).every((k) => ['class', 'level', 'subclass', 'spells'].includes(k)))) return [...bad, 'Each class is { class, level, subclass?, spells? }.'];
    if (list.some((x) => !CONTENT.classes[x.class])) return [...bad, choose];
    if (new Set(list.map((x) => x.class)).size !== list.length) say('A class is listed twice: add its levels together.');
    if (!list.every((x) => Number.isInteger(x.level) && x.level >= 1)) return [...bad, 'Each class has a level of 1 or more.'];
  }
  const c = classOf(sheet), ks = classesOf(sheet);
  if (!c) return [...bad, choose];
  if (!(typeof sheet.name === 'string' && sheet.name.trim() && sheet.name.trim().length <= 40)) say('It needs a name of up to 40 letters.');
  const level = multi ? levelOf(sheet) : sheet.level;
  if (!(Number.isInteger(level) && level >= 1 && level <= 20)) return [...bad, multi ? 'Its class levels add up to 1 to 20.' : 'Its level is 1 to 20.'];
  for (const k of ks) {
    if (k.subclass !== undefined && k.subclass !== k.c.subclass.id) say(`The ${k.c.name} subclass in the SRD is ${k.c.subclass.name} (${k.c.subclass.id}).`);
    if (k.level >= 3 && k.subclass !== k.c.subclass.id) say(`A level ${k.level} ${k.c.name} has a subclass: choose ${k.c.subclass.name}.`);
  }
  // Who a message is about: "A level 5 Fighter", or for several classes "This character".
  const who = multi ? 'This character' : `A level ${level} ${c.name}`;
  if (!(sheet.abilities && ABILITIES.every((a) => Number.isInteger(sheet.abilities[a]) && sheet.abilities[a] >= 1 && sheet.abilities[a] <= 20))) say('It needs all six ability scores, each 1 to 20 (features that raise them are added for you).');
  if (sheet.size !== undefined && !['small', 'medium'].includes(sheet.size)) say('Its size is Small or Medium.');
  if (sheet.speed !== undefined && !(Number.isInteger(sheet.speed) && sheet.speed >= 5 && sheet.speed <= 60 && sheet.speed % 5 === 0)) say('Its Speed is a multiple of 5 feet.');
  if (bad.some((m) => m.startsWith('It needs all six'))) return bad;
  // Prerequisites (Multiclassing): 13 or more in the primary ability of each of its classes.
  if (multi) for (const k of ks) {
    const rq = k.c.multiclass?.requires;
    if (!rq) { say(`The ${k.c.name} class cannot be combined with another here.`); continue; }
    const ok = rq.all ? rq.all.every((a) => sheet.abilities[a] >= 13) : rq.any.some((a) => sheet.abilities[a] >= 13);
    if (!ok) say(`A character with levels in ${k.c.name} and another class needs ${(rq.all ?? rq.any).map((a) => ABILITY_NAMES[a]).join(rq.all ? ' and ' : ' or ')} of 13 or more.`);
  }
  const { feats, G, abil, armourWords, weaponWords, cf, chosen, before, featSkills, trainedSuit } = gather(sheet);

  // Skills: the class's choices plus any a feature gives.
  const fromClass = c.skills.from === 'any' ? Object.keys(SKILLS) : c.skills.from;
  const extraClass = G.reduce((n, g) => n + (g.skills?.from === 'class' ? g.skills.n : 0), 0), extraAny = G.reduce((n, g) => n + (g.skills?.from === 'any' ? g.skills.n : 0), 0);
  const skills = sheet.skills ?? [];
  if (!Array.isArray(skills) || skills.some((k) => !Object.hasOwn(SKILLS, k))) say('Its skills must be skills.');
  else {
    if (new Set(skills).size !== skills.length) say('A skill is listed twice.');
    const later = ks.slice(1).reduce((n, k) => n + (k.c.multiclass?.skills?.choose ?? 0), 0);       // a skill from Bard, Ranger or Rogue taken later
    const want = c.skills.choose + extraClass + extraAny + later;
    if (multi && skills.length !== want) say(`This character chooses ${want} skill${want === 1 ? '' : 's'} (${c.skills.choose} from the ${c.name} list${later ? `, ${later} from the classes taken later` : ''}${extraClass + extraAny ? `, ${extraClass + extraAny} from features` : ''}); ${skills.length} ${skills.length === 1 ? 'is' : 'are'} ticked.`);
    else if (skills.length !== want) say(`A level ${level} ${c.name} chooses ${want} skill${want === 1 ? '' : 's'}${extraClass + extraAny ? ` (${c.skills.choose} from the class list, and ${extraClass + extraAny} from features)` : ''}; ${skills.length} ${skills.length === 1 ? 'is' : 'are'} ticked.`);
    const onList = skills.filter((k) => fromClass.includes(k)).length;
    if (onList < Math.min(skills.length, c.skills.choose + extraClass)) say(`${c.skills.choose + extraClass} of its skills must come from the ${c.name} list: ${fromClass.map(nice).join(', ')}.`);
  }
  const extra = sheet.extraSkills ?? [];
  if (!Array.isArray(extra) || extra.some((k) => !Object.hasOwn(SKILLS, k))) say('Its background skills must be skills.');
  else if (extra.some((k) => skills.includes(k))) say('A background skill is also ticked as a class skill; choose another class skill.');
  const exp = sheet.expertise ?? [], expMax = G.reduce((n, g) => n + (g.expertise ?? 0), 0);
  if (!Array.isArray(exp) || exp.some((k) => !Object.hasOwn(SKILLS, k))) say('Expertise must be in skills.');
  else {
    if (exp.length > expMax) say(`${who} has Expertise in ${expMax} skill${expMax === 1 ? '' : 's'}; ${exp.length} chosen.`);
    if (exp.some((k) => !skills.includes(k) && !extra.includes(k) && !featSkills.includes(k))) say('Expertise needs proficiency in the same skill.');
  }

  // Choices a feature asks for.
  for (const x of feats) {
    const f = x.f;
    if (!f.options) continue;
    const pick = sheet.choices?.[f.id];
    // Options picked as a list (Metamagic) may be left unchosen: the character then knows none of
    // them yet, and plays as before they were built (the build screen has no list picker yet).
    if (f.pick) {
      if (pick === undefined) continue;
      const list = typeof pick === 'string' ? [pick] : pick;          // one option may be named alone
      if (!(Array.isArray(list) && list.length <= f.pick && new Set(list).size === list.length)) say(`Choose up to ${f.pick} different options for ${f.name}: ${f.options.map((o) => o.name).join(', ')}.`);
      else for (const p of list) if (!f.options.some((o) => o.id === p)) say(`${f.name} has no option "${p}".`);
    } else if (pick === undefined) say(`Choose an option for ${f.name}: ${f.options.map((o) => o.name).join(', ')}.`);
    else if (!f.options.some((o) => o.id === pick)) say(`${f.name} has no option "${pick}".`);
  }
  if (sheet.choices?.['additional-fighting-style'] && sheet.choices['additional-fighting-style'] === sheet.choices['fighting-style']) say('Additional Fighting Style must be a different Fighting Style.');
  checkFeats(sheet, { cf, chosen, before, skills: [...(Array.isArray(skills) ? skills : []), ...(Array.isArray(extra) ? extra : [])] }, say);
  checkItems(sheet, { armourWords, weaponWords, trainedSuit, multi, who }, say);

  // Armour and weapons.
  if (sheet.armour !== undefined && sheet.armour !== null) {
    const a = CONTENT.armour[sheet.armour];
    if (!a || a.category === 'shield') say(`"${sheet.armour}" is not armour in the equipment tables.`);
    else if (!armourWords.has(a.category) && trainedSuit !== a.category) say(`${multi ? 'This character' : `A ${c.name}`} has no training with ${a.category} armour: wearing ${a.name} gives Disadvantage on Strength and Dexterity D20 Tests and stops spellcasting. The engine does not apply that; choose other armour.`);
  }
  if (sheet.shield && !armourWords.has('shield')) say(`${multi ? 'This character' : `A ${c.name}`} has no training with Shields, so a Shield adds nothing. Take it off the sheet.`);
  for (const id of sheet.weapons ?? []) {
    if (id === 'unarmed-strike') continue;
    if (!CONTENT.weapons[id]) say(`"${id}" is not a weapon in the equipment tables.`);
    else if (!weaponTrained(CONTENT.weapons[id], [...weaponWords])) say(`${multi ? 'This character' : `A ${c.name}`} is not proficient with the ${CONTENT.weapons[id].name}: it is added without the Proficiency Bonus.`);
  }

  // Spells, for each class by its own level, as if it were the only one (Multiclassing, Spells Prepared).
  if (multi && ks.filter((k) => k.c.casting).length > 1 && ks.some((k) => k.c.casting?.kind === 'pact')) say('Pact Magic beside another class\'s Spellcasting is not built yet: the engine keeps one kind of spell slot.');
  for (const k of ks) {
    const cc = k.c, cast = cc.casting, chosen = k.spells ?? [], at = k.level, mine = feats.filter((x) => x.cls.i === k.i).map((x) => x.f.grants).filter(Boolean);
    if (!Array.isArray(chosen)) { say('Its spells are a list.'); continue; }
    if (!cast && chosen.length) { say(`A ${cc.name} has no Spellcasting feature.`); continue; }
    if (!cast) continue;
    const lists = new Set([cc.id]);
    for (const g of mine) for (const l of g.spellLists ?? []) lists.add(l);
    const top = cast.kind === 'pact' ? cast.slotLevel[at - 1] : cast.slots[at - 1].length;
    let cantrips = 0, prepared = 0;
    for (const id of chosen) {
      const sp = CONTENT.spells[id];
      if (!sp) { say(`"${id}" is not a spell in the game.`); continue; }
      if (!sp.classes.some((x) => lists.has(x))) say(`${sp.name} is not on the ${[...lists].map(nice).join(', ')} spell list${lists.size > 1 ? 's' : ''}.`);
      if (sp.level > top) say(`${sp.name} is level ${sp.level}; a level ${at} ${cc.name} casts spells up to level ${top}.`);
      if (sp.level === 0) cantrips++; else prepared++;
    }
    const maxC = cast.cantrips[at - 1] + mine.reduce((n, g) => n + (g.cantrips ?? 0), 0), maxP = cast.prepared[at - 1];
    if (cantrips > maxC) say(`A level ${at} ${cc.name} knows ${maxC} cantrip${maxC === 1 ? '' : 's'}; ${cantrips} chosen.`);
    if (prepared > maxP) say(`A level ${at} ${cc.name} prepares ${maxP} spells; ${prepared} chosen (spells the class always has prepared are added and do not count).`);
  }
  for (const k of ['tools', 'gear', 'weapons']) if (sheet[k] !== undefined && !(Array.isArray(sheet[k]) && sheet[k].length <= 60 && sheet[k].every((x) => typeof x === 'string' && x.length <= 60))) say(`Its ${k} are a list of short names.`);
  if (sheet.choices !== undefined && !(sheet.choices && typeof sheet.choices === 'object' && Object.values(sheet.choices).every((v) => typeof v === 'string' || (Array.isArray(v) && v.length <= 10 && v.every((x) => typeof x === 'string'))))) say('Its choices name options.');
  // The same option twice across features that pick from one list (Metamagic at 2 and at 10).
  const picked = feats.filter((x) => x.f.pick).flatMap((x) => [sheet.choices?.[x.f.id] ?? []].flat().map((o) => `${x.f.name}:${o}`));
  if (new Set(picked).size !== picked.length) say('An option is chosen twice.');
  if (sheet.shield !== undefined && typeof sheet.shield !== 'boolean') say('Shield is true or false.');
  void abil;
  return bad;
}

// ---------- feats on a sheet ----------
const FEAT_ENTRY = ['id', 'at', 'abilities', 'skills', 'tools', 'list', 'ability', 'spells'];
const CATEGORY_NAMES = { origin: 'an Origin', general: 'a General', 'fighting-style': 'a Fighting Style', 'epic-boon': 'an Epic Boon' };
// Does the character have a feature of this kind (a feat's prerequisite): its own id, or a later class's ("paladin-fighting-style").
const hasFeature = (cf, id) => cf.some((x) => !x.option && (x.f.id === id || x.f.id.endsWith(`-${id}`)));
// The SRD's rules for taking feats ("Parts of a Feat"): the place's category, the prerequisite, taken
// once unless repeatable, and each choice the feat asks for. A choice left out is allowed (it adds nothing).
function checkFeats(sheet, { cf, chosen, before, skills }, say) {
  if (sheet.feats === undefined) return;
  if (!Array.isArray(sheet.feats) || sheet.feats.length > 30) return say('Its feats are a list of { id, at } and the feat\'s choices.');
  const slots = featSlots(sheet, cf), used = new Set();
  for (const x of sheet.feats) {
    if (!x || typeof x !== 'object' || Array.isArray(x) || Object.keys(x).some((k) => !FEAT_ENTRY.includes(k))) { say('A feat is { id, at } and the feat\'s choices: abilities, skills, tools, list, ability, spells.'); continue; }
    const def = CONTENT.feats[x.id];
    if (!def) { say(`There is no feat "${String(x.id)}" in the game.`); continue; }
    const slot = slots.find((sl) => sl.at === x.at);
    if (!slot) { say(`${def.name}: "${String(x.at)}" is not a place this character has for a feat (${slots.map((sl) => sl.at).join(', ')}).`); continue; }
    if (used.has(slot.at)) say(`Two feats are taken at ${slot.name}.`);
    used.add(slot.at);
  }
  // Fighting Style feats chosen with a class's Fighting Style feature (its `choices`).
  const styles = cf.filter((x) => x.option && x.f.feat).map((x) => x.f.feat);
  const had = [];
  chosen.forEach((y, i) => {
    const { def, x, slot } = y, pr = def.prerequisite ?? {}, was = before[i];
    if (slot.category === 'origin' && def.category !== 'origin') say(`${slot.name} takes an Origin feat; ${def.name} is ${CATEGORY_NAMES[def.category]} feat.`);
    if (pr.level && slot.level < pr.level) say(`${def.name} needs level ${pr.level}; ${slot.name} comes at level ${slot.level}.`);
    if (pr.abilities && !pr.abilities.any.some((a) => was[a] >= pr.abilities.min)) say(`${def.name} needs ${pr.abilities.any.map((a) => ABILITY_NAMES[a]).join(' or ')} of ${pr.abilities.min} or more.`);
    if (pr.feature && !hasFeature(cf, pr.feature)) say(`${def.name} needs the ${nice(pr.feature)} feature.`);
    const again = had.filter((z) => z.def.id === def.id);
    if (again.length && !def.repeatable) say(`${def.name} can be taken only once.`);
    if (def.repeatable === 'list' && again.some((z) => z.x.list !== undefined && z.x.list === x.list)) say(`${def.name} is taken again only with another spell list.`);
    if (styles.includes(def.id)) say(`${def.name} is already this character's Fighting Style.`);
    had.push(y);
    // Ability points: so many, to the abilities the feat names, none above its maximum.
    if (x.abilities !== undefined) {
      const inc = def.increase, list = x.abilities && typeof x.abilities === 'object' && !Array.isArray(x.abilities) ? Object.entries(x.abilities) : null;
      if (!inc) say(`${def.name} raises no ability score.`);
      else if (!list || list.some(([a, n]) => !inc.from.includes(a) || !Number.isInteger(n) || n < 1)) say(`${def.name} raises ${inc.from.length === 6 ? 'any ability score' : inc.from.map((a) => ABILITY_NAMES[a]).join(' or ')}: give whole points to ${inc.from.length === 6 ? 'abilities' : 'those'}.`);
      else if (list.reduce((t, [, n]) => t + n, 0) !== inc.points || (inc.points === 1 && list.length !== 1)) say(`${def.name} gives ${inc.points === 2 ? '+2 to one ability score or +1 to two' : '+1 to one ability score'}.`);
      else for (const [a, n] of list) if (was[a] + n > inc.max) say(`${def.name} can't raise ${ABILITY_NAMES[a]} above ${inc.max} (it is ${was[a]}).`);
    }
    // Skills and tools (Skilled): up to so many, each one the character is not yet proficient in.
    if (x.skills !== undefined || x.tools !== undefined) {
      const sk = x.skills ?? [], tl = x.tools ?? [];
      if (!def.proficiencies) say(`${def.name} gives no skills or tools.`);
      else if (!Array.isArray(sk) || !Array.isArray(tl) || sk.some((k) => !Object.hasOwn(SKILLS, k)) || tl.some((t) => typeof t !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(t) || t.length > 40)) say(`${def.name}: its skills are skills and its tools are kebab-case names such as thieves-tools.`);
      else {
        if (sk.length + tl.length > def.proficiencies.n) say(`${def.name} gives ${def.proficiencies.n} skills or tools; ${sk.length + tl.length} chosen.`);
        const earlier = [...skills, ...had.slice(0, -1).flatMap((z) => listOf(z.x.skills))];
        for (const k of sk) if (earlier.includes(k)) say(`${def.name}: the character is already proficient in ${nice(k)}.`);
        if (new Set(sk).size !== sk.length || new Set(tl).size !== tl.length) say(`${def.name}: a skill or tool is chosen twice.`);
        if ((sheet.tools ?? []).some((t) => tl.includes(t))) say(`${def.name}: the character already has that tool.`);
      }
    }
    // Spells (Magic Initiate): a list, an ability, and so many cantrips and level 1 spells from that list.
    const sp = def.spellPick;
    if (x.list !== undefined || x.ability !== undefined || x.spells !== undefined) {
      if (!sp) say(`${def.name} gives no spells.`);
      else {
        if (x.list !== undefined && !sp.lists.includes(x.list)) say(`${def.name} takes its spells from the ${sp.lists.map(nice).join(', ')} list.`);
        if (x.ability !== undefined && !sp.abilities.includes(x.ability)) say(`${def.name}'s spellcasting ability is ${sp.abilities.map((a) => ABILITY_NAMES[a]).join(', ')}.`);
        if (x.spells !== undefined) {
          if (!Array.isArray(x.spells) || x.spells.some((id) => !CONTENT.spells[id])) say(`${def.name}: its spells must be spells in the game.`);
          else {
            if (x.list === undefined) say(`${def.name}: choose a spell list before its spells.`);
            for (const id of x.spells) if (x.list !== undefined && !CONTENT.spells[id].classes.includes(x.list)) say(`${CONTENT.spells[id].name} is not on the ${nice(String(x.list))} spell list.`);
            const c0 = x.spells.filter((id) => CONTENT.spells[id].level === 0).length, c1 = x.spells.filter((id) => CONTENT.spells[id].level === 1).length;
            if (x.spells.some((id) => CONTENT.spells[id].level > 1)) say(`${def.name} gives cantrips and level 1 spells only.`);
            if (c0 > sp.cantrips || c1 > sp.level1) say(`${def.name} gives ${sp.cantrips} cantrips and ${sp.level1} level 1 spell.`);
            if (new Set(x.spells).size !== x.spells.length) say(`${def.name}: a spell is chosen twice.`);
            if (x.spells.length && x.ability === undefined) say(`${def.name}: choose its spellcasting ability.`);
          }
        }
      }
    }
  });
}

// The places a sheet has for a feat, for a screen that offers them: each place with the feat taken there
// (or null), the feats the character could take there now (`offer`, by validate), and what the taken
// feat still leaves to choose (`open`: "abilities", "skills", "list", "ability", "spells").
export function featChoices(sheet) {
  const slots = featSlots(sheet), list = Array.isArray(sheet?.feats) ? sheet.feats : [];
  return slots.map((sl) => {
    const taken = list.find((x) => x?.at === sl.at) ?? null, others = { ...sheet, feats: list.filter((x) => x?.at !== sl.at) };
    const was = new Set(validate(others));
    const offer = Object.values(CONTENT.feats).filter((d) => validate({ ...others, feats: [...others.feats, { id: d.id, at: sl.at }] }).every((p) => was.has(p))).map((d) => d.id);
    const def = taken && CONTENT.feats[taken.id], open = [];
    if (def?.increase && taken.abilities === undefined) open.push('abilities');
    if (def?.proficiencies && (taken.skills ?? []).length + (taken.tools ?? []).length < def.proficiencies.n) open.push('skills');
    if (def?.spellPick) { for (const k of ['list', 'ability']) if (taken[k] === undefined) open.push(k); if ((taken.spells ?? []).length < def.spellPick.cantrips + def.spellPick.level1) open.push('spells'); }
    return { ...sl, taken, offer, open };
  });
}

// ---------- magic items on a sheet ----------
const ITEM_ENTRY = ['id', 'item', 'base', 'type', 'spell', 'equipped', 'attuned', 'charges'];
// Can the character cast a spell by its own traits or features (an item's Attunement "by a Spellcaster")?
const castsSpells = (sheet) => classesOf(sheet).some((k) => k.c?.casting && k.level >= (k.c.casting.from ?? 1) && (k.c.casting.cantrips[k.level - 1] > 0 || (k.c.casting.kind === 'pact' ? k.c.casting.slots[k.level - 1] > 0 : k.c.casting.slots[k.level - 1]?.length > 0)))
  || (Array.isArray(sheet.feats) && sheet.feats.some((x) => CONTENT.feats[x?.id]?.spellPick && Array.isArray(x.spells) && x.spells.length));
// What a character may attune to: the item needs it, and the character meets its prerequisite (SRD "Attunement Prerequisites").
export function attuneProblem(sheet, def) {
  if (!def.attune) return `${def.name} does not need Attunement.`;
  if (def.attune.by && !classesOf(sheet).some((k) => def.attune.by.includes(k.c?.id))) return `Only a ${def.attune.by.map(nice).join(', ').replace(/, ([^,]*)$/, ' or $1')} can attune to ${def.name}.`;
  if (def.attune.spellcaster && !castsSpells(sheet)) return `Only a spellcaster can attune to ${def.name}.`;
  return null;
}
// The SRD's rules for items: what each is and is made from, where it is worn, how many of a kind (one pair of
// footwear, of gloves, of bracers, one suit of armour, one headwear, one cloak, one Shield, three Ioun Stones),
// and Attunement (its prerequisite, three items at most, one copy of an item).
function checkItems(sheet, { armourWords, weaponWords, trainedSuit, multi, who }, say) {
  if (sheet.items === undefined) { if (sheet.attuning !== undefined) say('There is no item to attune to.'); return; }
  if (!Array.isArray(sheet.items) || sheet.items.length > 60) return say('Its items are a list of up to 60.');
  const keys = new Set(), worn = {}, attuned = [];
  for (const x of sheet.items) {
    if (!x || typeof x !== 'object' || Array.isArray(x) || Object.keys(x).some((k) => !ITEM_ENTRY.includes(k))) { say('An item is { id, item } with base, type, spell, equipped, attuned or charges.'); continue; }
    if (!(typeof x.id === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(x.id) && x.id.length <= 12) || keys.has(x.id)) say('Each item has its own short id, like "i1".');
    keys.add(x.id);
    const def = CONTENT.items[x.item];
    if (!def) { say(`There is no magic item "${String(x.item)}" in the game.`); continue; }
    const name = itemName(def, x);
    for (const k of ['equipped', 'attuned']) if (x[k] !== undefined && typeof x[k] !== 'boolean') say(`${name}: ${k} is true or false.`);
    // What it is made from.
    if (def.base) {
      const b = itemBase(def, x), want = def.base.weapon ?? def.base.armour;
      if (!b) say(x.base !== undefined ? `${def.name} can't be made from "${String(x.base)}".` : `Choose what ${def.name} is: ${want === 'any' ? (def.base.weapon ? 'any weapon' : 'any armour') : want === 'melee' ? 'any Melee weapon' : want.map((id) => (CONTENT.weapons[id] ?? CONTENT.armour[id]).name).join(' or ')}.`);
    } else if (x.base !== undefined) say(`${def.name} is not made from another item.`);
    if (def.variant === 'damageType' ? !DAMAGE_TYPES.includes(x.type) : x.type !== undefined) say(def.variant === 'damageType' ? `Choose the damage type of ${def.name}.` : `${def.name} has no damage type to choose.`);
    if (def.variant === 'spell' ? !CONTENT.spells[x.spell] : x.spell !== undefined) say(def.variant === 'spell' ? `Name the spell on the ${def.name}.` : `${def.name} holds no spell.`);
    if (x.charges !== undefined && !(def.charges && Number.isInteger(x.charges) && x.charges >= 0 && x.charges <= def.charges.max)) say(def.charges ? `${name} has 0 to ${def.charges.max} charges.` : `${name} has no charges.`);
    // Worn or held.
    if (x.equipped === true && def.wear !== 'carried') (worn[def.wear] ??= []).push(name);
    if (x.equipped === true && def.wear === 'armour') {
      const b = itemBase(def, x);
      if (b && !armourWords.has(b.category) && trainedSuit !== b.category) say(`${multi ? 'This character' : who} has no training with ${b.category} armour, so can't wear ${name}. Take it off.`);
    }
    if (x.equipped === true && def.wear === 'shield' && !armourWords.has('shield')) say(`${name}: no training with Shields. Take it off.`);
    if (x.equipped === true && def.base?.weapon !== undefined) { const b = itemBase(def, x); if (b && !weaponTrained(b, [...weaponWords])) say(`${multi ? 'This character' : who} is not proficient with the ${b.name}, so ${name} would attack without the Proficiency Bonus. Leave it unequipped.`); }
    // Attunement.
    if (x.attuned === true) {
      const why = attuneProblem(sheet, def);
      if (why) say(why); else attuned.push(x.item);
    }
  }
  if (sheet.armour && worn.armour) say(`It wears ${CONTENT.armour[sheet.armour]?.name ?? 'armour'} and ${worn.armour[0]}: one suit of armour at a time.`);
  if (sheet.shield && worn.shield) say(`It holds a Shield and ${worn.shield[0]}: one Shield at a time.`);
  const WORDS = { feet: 'pair of footwear', hands: 'pair of gloves or gauntlets', wrists: 'pair of bracers', armour: 'suit of armour', head: 'item of headwear', cloak: 'cloak', shield: 'Shield' };
  for (const [k, list] of Object.entries(worn)) if (WEAR_ONE.includes(k) && list.length > 1) say(`One ${WORDS[k]} at a time: ${list.join(' and ')}.`);
  if ((worn.orbit ?? []).length > ORBIT_MAX) say(`Up to ${ORBIT_MAX} Ioun Stones orbit a head at once.`);
  if (attuned.length > ATTUNE_MAX) say(`A creature is attuned to ${ATTUNE_MAX} magic items at most; ${attuned.length} are marked attuned.`);
  const twice = attuned.find((id, i) => attuned.indexOf(id) !== i);
  if (twice) say(`Attuned to two copies of ${CONTENT.items[twice].name}: one at most.`);
  // The item it will spend its next Short Rest attuning to, or ending its Attunement to.
  const at = sheet.attuning;
  if (at !== undefined) {
    const x = at && typeof at === 'object' && Object.keys(at).every((k) => ['item', 'end'].includes(k)) && (at.end === undefined || typeof at.end === 'boolean') ? sheet.items.find((y) => y?.id === at.item) : null;
    const def = x && CONTENT.items[x.item];
    if (!def) say('Attuning names an item the character has.');
    else if (at.end) { if (x.attuned !== true) say(`It is not attuned to ${itemName(def, x)}.`); }
    else if (x.attuned === true) say(`It is already attuned to ${itemName(def, x)}.`);
    else { const why = attuneProblem(sheet, def); if (why) say(why); }
  }
}
