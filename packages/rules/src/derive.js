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
import { CONTENT } from './content/index.js';
import { ABILITIES, SKILLS } from './content/schema.js';

export const mod = (score) => Math.floor((score - 10) / 2);
export const proficiencyFor = (level) => 2 + Math.floor((level - 1) / 4);
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
const dice = (d, n) => (n ? `${d}${signed(n)}` : d);
const nice = (id) => id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
// Bigger of two dice of one count ("1d6" or "1d8" -> "1d8").
const sides = (d) => +(/d(\d+)/.exec(d)?.[1] ?? 0);
const bigger = (a, b) => (sides(b) > sides(a) ? b : a);

export const classOf = (sheet) => CONTENT.classes[sheet?.class] ?? null;

// Every feature the character has at its level: the class's, the subclass's from the level it is
// gained, and each option chosen. Returns [{ f, option?, source }].
export function featuresOf(sheet) {
  const c = classOf(sheet);
  if (!c) return [];
  const level = sheet.level | 0;
  const sub = sheet.subclass === c.subclass.id ? c.subclass.features : [];
  const out = [];
  for (const f of [...c.features, ...sub].filter((x) => x.level <= level).sort((a, b) => a.level - b.level)) {
    out.push({ f });
    if (f.options) {
      const o = f.options.find((x) => x.id === sheet.choices?.[f.id]);
      if (o) out.push({ f: { ...o, id: `${f.id}-${o.id}`, level: f.level, checked: f.checked }, option: true, of: f.id });
    }
  }
  return out;
}

// A number that grows with the class (schema.js, lintAmount).
export function amount(x, c, level, abil) {
  if (typeof x === 'number') return x;
  if (x?.column !== undefined) return c.table[x.column][level - 1];
  if (x?.mod !== undefined) return Math.max(x.min ?? -Infinity, mod(abil[x.mod]));
  if (x?.perLevel !== undefined) return x.perLevel * level;
  return x;
}
// A class feature's modifiers and steps with their numbers put in.
function bake(list, c, level, abil) {
  return structuredClone(list).map((x) => {
    const fix = (m) => { if (m && m.value && typeof m.value === 'object' && (m.value.column !== undefined || m.value.mod !== undefined || m.value.perLevel !== undefined)) m.value = amount(m.value, c, level, abil); };
    fix(x); fix(x.modifier);
    if (x.addLevel) { x.heal = dice(x.heal, level); delete x.addLevel; }
    for (const k of ['heal', 'tempHp']) {
      if (x[k] && typeof x[k] === 'object') x[k] = amount(x[k], c, level, abil);                  // a die from the class table
      if (k in x && typeof x.addMod === 'string') { x[k] = dice(x[k], mod(abil[x.addMod])); delete x.addMod; }
    }
    if ('save' in x && typeof x.dc === 'string') x.dc = 8 + proficiencyFor(level) + mod(abil[x.dc]);   // the class's own DC
    return x;
  });
}

// What a weapon category word in a class's list covers.
function weaponTrained(w, words) {
  return words.some((k) => k === w.category || (k === 'martial-light' && w.category === 'martial' && w.properties.includes('light'))
    || (k === 'martial-finesse-or-light' && w.category === 'martial' && (w.properties.includes('light') || w.properties.includes('finesse'))));
}
const grantsOf = (feats) => feats.map((x) => x.f.grants).filter(Boolean);

// Everything the sheet's class and features add up to, before the record is assembled.
function gather(sheet) {
  const c = classOf(sheet), level = sheet.level, feats = featuresOf(sheet), G = grantsOf(feats);
  const abil = Object.fromEntries(ABILITIES.map((a) => [a, sheet.abilities?.[a] ?? 10]));
  for (const g of G) if (g.abilityBonus) for (const a of ABILITIES) if (g.abilityBonus[a]) abil[a] = Math.min(g.abilityBonus.max ?? 30, abil[a] + g.abilityBonus[a]);
  const armourWords = new Set(c.armour), weaponWords = new Set(c.weapons);
  for (const g of G) { for (const a of g.proficiency?.armour ?? []) armourWords.add(a); for (const w of g.proficiency?.weapons ?? []) weaponWords.add(w); }
  return { c, level, feats, G, abil, armourWords, weaponWords, pb: proficiencyFor(level) };
}

// ---------- the record ----------

export function derive(sheet) {
  const { c, level, feats, G, abil, armourWords, weaponWords, pb } = gather(sheet);
  const why = {};
  const armour = sheet.armour ? CONTENT.armour[sheet.armour] : null, shield = !!sheet.shield;
  const shieldOk = shield && armourWords.has('shield');
  const unarmoured = !armour, bare = unarmoured && !shield;
  const sum = (k) => G.reduce((n, g) => n + (typeof g[k] === 'number' ? g[k] : 0), 0);

  // Hit Points: the Hit Die's highest number at level 1, its fixed value after; each level adds the
  // Constitution modifier, at least 1 Hit Point a level (SRD "Gaining a Level").
  const con = mod(abil.con), fixed = c.hitDie / 2 + 1;
  let hp = Math.max(1, c.hitDie + con) + (level - 1) * Math.max(1, fixed + con);
  why.hp = [`${c.hitDie} at level 1`, ...(level > 1 ? [`${fixed} for each of ${level - 1} more levels`] : []), `Constitution ${signed(con)} a level`];
  for (const x of feats) if (x.f.grants?.hp) { const n = amount(x.f.grants.hp, c, level, abil); hp += n; why.hp.push(`${x.f.name} ${signed(n)}`); }

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
    const n = amount(sp.add, c, level, abil);
    speed += n; why.speed.push(`${x.f.name} +${n} ft`);
  }
  const speeds = {};
  for (const g of G) for (const m of g.speeds ?? []) speeds[m] = speed;
  const senses = { ...(sheet.senses ?? {}) };
  for (const g of G) for (const [k, v] of Object.entries(g.senses ?? {})) senses[k] = Math.max(senses[k] ?? 0, v);

  // Saves, skills, expertise.
  const saveProf = new Set(c.saves);
  for (const g of G) { if (g.saves === 'all') ABILITIES.forEach((a) => saveProf.add(a)); else for (const a of g.saves ?? []) saveProf.add(a); }
  const skills = Object.keys(SKILLS).filter((k) => sheet.skills?.includes(k) || sheet.extraSkills?.includes(k));
  const expertise = skills.filter((k) => sheet.expertise?.includes(k));

  // Attacks, from the weapons carried.
  const ma = G.find((g) => g.martialArts)?.martialArts, maDie = ma && bare ? amount(ma, c, level, abil) : null;
  const ranged = sum('rangedAttack');
  const attacks = [];
  const add = (a) => attacks.push(a);
  for (const id of sheet.weapons ?? []) {
    if (id === 'unarmed-strike') continue;
    const w = CONTENT.weapons[id];
    if (!w) continue;
    const monkWeapon = maDie && w.kind === 'melee' && (w.category === 'simple' || w.properties.includes('light'));
    const finesse = w.properties.includes('finesse') || monkWeapon;
    const ab = finesse ? (abil.dex > abil.str ? 'dex' : 'str') : w.kind === 'ranged' ? 'dex' : 'str';
    const m = mod(abil[ab]), trained = weaponTrained(w, [...weaponWords]);
    const base = m + (trained ? pb : 0), die = monkWeapon ? bigger(w.damage, maDie) : w.damage;
    const dmg = (d) => (/^\d+$/.test(d) ? signed(+d + m) : dice(d, m));
    const common = { dtype: w.type, abil: ab, weapon: w.id, ...(finesse && w.properties.includes('finesse') ? { finesse: true } : {}) };
    const reach = w.properties.includes('reach') ? 10 : 5;
    if (w.kind === 'melee') {
      add({ id: w.id, name: w.name, type: 'melee', bonus: base, damage: dmg(die), reach, ...common });
      // Versatile: the two-handed damage, while no Shield takes the other hand.
      if (w.versatile && !shield) add({ id: `${w.id}-two-handed`, name: `${w.name} (two hands)`, type: 'melee', bonus: base, damage: dmg(monkWeapon ? bigger(w.versatile, maDie) : w.versatile), reach, ...common });
      if (w.properties.includes('thrown')) add({ id: `${w.id}-thrown`, name: `${w.name} (thrown)`, type: 'ranged', bonus: base, damage: dmg(w.damage), range: [...w.range], ...common });
    } else add({ id: w.id, name: w.name, type: 'ranged', bonus: base + ranged, damage: dmg(die), range: [...w.range], ...common });
  }
  // Unarmed Strike: 1 + Strength modifier Bludgeoning; Martial Arts makes it its die with the
  // better of Strength and Dexterity, and adds one as a Bonus Action.
  if (maDie || sheet.weapons?.includes('unarmed-strike')) {
    const ab = maDie && abil.dex > abil.str ? 'dex' : 'str', m = mod(abil[ab]);
    const u = { name: 'Unarmed Strike', type: 'melee', bonus: m + pb, damage: maDie ? dice(maDie, m) : signed(1 + m), dtype: 'bludgeoning', reach: 5, abil: ab };
    add({ id: 'unarmed-strike', ...u });
    if (maDie) add({ id: 'unarmed-strike-bonus', ...u, name: 'Unarmed Strike (Bonus Action)', time: 'bonus' });
  }

  // Spellcasting.
  const cast = c.casting, spells = [], slots = {};
  let pact = false;
  if (cast) {
    const always = new Set();
    for (const g of G) for (const id of g.spells ?? []) always.add(id);
    for (const [l, list] of Object.entries(sheet.subclass === c.subclass.id ? c.subclass.spells ?? {} : {})) if (+l <= level) list.forEach((id) => always.add(id));
    for (const id of [...(sheet.spells ?? []), ...always]) if (CONTENT.spells[id] && !spells.includes(id)) spells.push(id);
    if (cast.kind === 'pact') { slots[cast.slotLevel[level - 1]] = cast.slots[level - 1]; pact = true; }
    else cast.slots[level - 1].forEach((n, i) => { slots[i + 1] = n; });
  }

  // Features the engine plays: their uses, modifiers and actions, with the numbers put in.
  const feat = [];
  const legacy = {};
  let critOn = 20;
  const bonusActs = new Set(), resist = new Set();
  for (const x of feats) {
    const f = x.f, g = f.grants ?? {};
    const out = { id: f.id, name: f.name, tier: f.tier, text: f.text };
    if (f.uses) {
      const rest = typeof f.uses.recharge === 'string' ? f.uses.recharge : Object.entries(f.uses.recharge).filter(([l]) => +l <= level).sort((a, b) => b[0] - a[0])[0][1];
      out.uses = { max: amount(f.uses.max, c, level, abil), recharge: rest, ...(f.uses.short && rest === 'long' ? { short: f.uses.short } : {}) };
    }
    if (g.modifiers) out.modifiers = bake(g.modifiers, c, level, abil);
    if (g.action) {
      const a = structuredClone(g.action);
      if (a.effects) a.effects = bake(a.effects, c, level, abil);
      if (a.gain?.attacks) a.gain.attacks.n = amount(a.gain.attacks.n, c, level, abil);
      out.action = a;
    }
    if (g.recover) out.recover = { ...g.recover };
    if (g.extraAttack) legacy.extraAttack = Math.max(legacy.extraAttack ?? 0, g.extraAttack);
    if (g.sneak) legacy.sneak = amount(g.sneak, c, level, abil);
    if (g.critOn) critOn = Math.min(critOn, g.critOn);
    for (const b of g.bonusActs ?? []) bonusActs.add(b);
    for (const t of g.resist ?? []) resist.add(t);
    feat.push(out);
  }

  const cls = sheet.subclass === c.subclass.id && level >= 3 ? `${c.name} (${c.subclass.name})` : c.name;
  const record = {
    name: String(sheet.name ?? '').trim(), cls: cls.length <= 40 ? cls : c.name, level, size: sheet.size ?? 'medium',
    ac, hp, speed, ...(Object.keys(speeds).length ? { speeds } : {}), ...(Object.keys(senses).length ? { senses } : {}),
    prof: pb, abil, saveProf: ABILITIES.filter((a) => saveProf.has(a)), skills, expertise,
    tools: [...(c.tools === "Thieves' Tools" ? ['thieves-tools'] : []), ...(sheet.tools ?? [])].filter((t, i, l) => l.indexOf(t) === i),
    attacks,
    ...(cast ? { castAbil: cast.ability, spells, slots } : {}),
    ...(pact ? { pact: true } : {}),
    ...(Object.keys(legacy).length ? { features: legacy } : {}),
    feats: feat, hitDie: c.hitDie,
    armour: armour?.category ?? 'none', ...(shield ? { shield: true } : {}),
    ...(critOn < 20 ? { critOn } : {}), ...(bonusActs.size ? { bonusActs: [...bonusActs] } : {}), ...(resist.size ? { resist: [...resist] } : {}),
    ...(sheet.gear?.length ? { gear: [...sheet.gear] } : {}),
    ...(sheet.look ? { look: { ...sheet.look } } : {}),
  };
  why.prof = [`Level ${level}: ${signed(pb)}`];
  why.attacks = Object.fromEntries(attacks.map((a) => [a.id, [`${nice(a.abil)} ${signed(mod(abil[a.abil]))}`, ...(a.weapon && !weaponTrained(CONTENT.weapons[a.weapon], [...weaponWords]) ? ['not proficient'] : [`Proficiency ${signed(pb)}`]), ...(a.type === 'ranged' && ranged && !a.id.endsWith('-thrown') ? [`Archery ${signed(ranged)}`] : [])]]));
  if (cast) why.spells = [`${nice(cast.ability)} ${signed(mod(abil[cast.ability]))}`, `Proficiency ${signed(pb)}`, `save DC ${8 + pb + mod(abil[cast.ability])}`, `attack ${signed(pb + mod(abil[cast.ability]))}`];
  return { record, why };
}

// ---------- what is wrong with a sheet ----------

const SHEET_FIELDS = ['name', 'class', 'subclass', 'level', 'abilities', 'skills', 'extraSkills', 'expertise', 'choices', 'armour', 'shield', 'weapons', 'spells',
  'size', 'speed', 'senses', 'tools', 'gear', 'look'];
export function validate(sheet) {
  const bad = [], say = (m) => bad.push(m);
  if (!sheet || typeof sheet !== 'object') return ['A sheet is a record of choices.'];
  for (const k of Object.keys(sheet)) if (!SHEET_FIELDS.includes(k)) say(`"${k}" is not something a sheet has.`);
  if (JSON.stringify(sheet).length > 20000) say('That sheet is too long.');
  const c = classOf(sheet);
  if (!c) return [...bad, `Choose a class: ${Object.keys(CONTENT.classes).join(', ')}.`];
  if (!(typeof sheet.name === 'string' && sheet.name.trim() && sheet.name.trim().length <= 40)) say('It needs a name of up to 40 letters.');
  const level = sheet.level;
  if (!(Number.isInteger(level) && level >= 1 && level <= 20)) return [...bad, 'Its level is 1 to 20.'];
  if (sheet.subclass !== undefined && sheet.subclass !== c.subclass.id) say(`The ${c.name} subclass in the SRD is ${c.subclass.name} (${c.subclass.id}).`);
  if (level >= 3 && sheet.subclass !== c.subclass.id) say(`A level ${level} ${c.name} has a subclass: choose ${c.subclass.name}.`);
  if (!(sheet.abilities && ABILITIES.every((a) => Number.isInteger(sheet.abilities[a]) && sheet.abilities[a] >= 1 && sheet.abilities[a] <= 20))) say('It needs all six ability scores, each 1 to 20 (features that raise them are added for you).');
  if (sheet.size !== undefined && !['small', 'medium'].includes(sheet.size)) say('Its size is Small or Medium.');
  if (sheet.speed !== undefined && !(Number.isInteger(sheet.speed) && sheet.speed >= 5 && sheet.speed <= 60 && sheet.speed % 5 === 0)) say('Its Speed is a multiple of 5 feet.');
  if (bad.some((m) => m.startsWith('It needs all six'))) return bad;
  const { feats, G, abil, armourWords, weaponWords } = gather(sheet);

  // Skills: the class's choices plus any a feature gives.
  const fromClass = c.skills.from === 'any' ? Object.keys(SKILLS) : c.skills.from;
  const extraClass = G.reduce((n, g) => n + (g.skills?.from === 'class' ? g.skills.n : 0), 0), extraAny = G.reduce((n, g) => n + (g.skills?.from === 'any' ? g.skills.n : 0), 0);
  const skills = sheet.skills ?? [];
  if (!Array.isArray(skills) || skills.some((k) => !Object.hasOwn(SKILLS, k))) say('Its skills must be skills.');
  else {
    if (new Set(skills).size !== skills.length) say('A skill is listed twice.');
    const want = c.skills.choose + extraClass + extraAny;
    if (skills.length !== want) say(`A level ${level} ${c.name} chooses ${want} skill${want === 1 ? '' : 's'}${extraClass + extraAny ? ` (${c.skills.choose} from the class list, and ${extraClass + extraAny} from features)` : ''}; ${skills.length} ${skills.length === 1 ? 'is' : 'are'} ticked.`);
    const onList = skills.filter((k) => fromClass.includes(k)).length;
    if (onList < Math.min(skills.length, c.skills.choose + extraClass)) say(`${c.skills.choose + extraClass} of its skills must come from the ${c.name} list: ${fromClass.map(nice).join(', ')}.`);
  }
  const extra = sheet.extraSkills ?? [];
  if (!Array.isArray(extra) || extra.some((k) => !Object.hasOwn(SKILLS, k))) say('Its background skills must be skills.');
  else if (extra.some((k) => skills.includes(k))) say('A background skill is also ticked as a class skill; choose another class skill.');
  const exp = sheet.expertise ?? [], expMax = G.reduce((n, g) => n + (g.expertise ?? 0), 0);
  if (!Array.isArray(exp) || exp.some((k) => !Object.hasOwn(SKILLS, k))) say('Expertise must be in skills.');
  else {
    if (exp.length > expMax) say(`A level ${level} ${c.name} has Expertise in ${expMax} skill${expMax === 1 ? '' : 's'}; ${exp.length} chosen.`);
    if (exp.some((k) => !skills.includes(k) && !extra.includes(k))) say('Expertise needs proficiency in the same skill.');
  }

  // Choices a feature asks for.
  for (const x of feats) {
    const f = x.f;
    if (!f.options) continue;
    const pick = sheet.choices?.[f.id];
    if (pick === undefined) say(`Choose an option for ${f.name}: ${f.options.map((o) => o.name).join(', ')}.`);
    else if (!f.options.some((o) => o.id === pick)) say(`${f.name} has no option "${pick}".`);
  }
  if (sheet.choices?.['additional-fighting-style'] && sheet.choices['additional-fighting-style'] === sheet.choices['fighting-style']) say('Additional Fighting Style must be a different Fighting Style.');

  // Armour and weapons.
  if (sheet.armour !== undefined && sheet.armour !== null) {
    const a = CONTENT.armour[sheet.armour];
    if (!a || a.category === 'shield') say(`"${sheet.armour}" is not armour in the equipment tables.`);
    else if (!armourWords.has(a.category)) say(`A ${c.name} has no training with ${a.category} armour: wearing ${a.name} gives Disadvantage on Strength and Dexterity D20 Tests and stops spellcasting. The engine does not apply that; choose other armour.`);
  }
  if (sheet.shield && !armourWords.has('shield')) say(`A ${c.name} has no training with Shields, so a Shield adds nothing. Take it off the sheet.`);
  for (const id of sheet.weapons ?? []) {
    if (id === 'unarmed-strike') continue;
    if (!CONTENT.weapons[id]) say(`"${id}" is not a weapon in the equipment tables.`);
    else if (!weaponTrained(CONTENT.weapons[id], [...weaponWords])) say(`A ${c.name} is not proficient with the ${CONTENT.weapons[id].name}: it is added without the Proficiency Bonus.`);
  }

  // Spells.
  const cast = c.casting, chosen = sheet.spells ?? [];
  if (!Array.isArray(chosen)) say('Its spells are a list.');
  else if (!cast && chosen.length) say(`A ${c.name} has no Spellcasting feature.`);
  else if (cast) {
    const lists = new Set([c.id]);
    for (const g of G) for (const l of g.spellLists ?? []) lists.add(l);
    const top = cast.kind === 'pact' ? cast.slotLevel[level - 1] : cast.slots[level - 1].length;
    let cantrips = 0, prepared = 0;
    for (const id of chosen) {
      const sp = CONTENT.spells[id];
      if (!sp) { say(`"${id}" is not a spell in the game.`); continue; }
      if (!sp.classes.some((k) => lists.has(k))) say(`${sp.name} is not on the ${[...lists].map(nice).join(', ')} spell list${lists.size > 1 ? 's' : ''}.`);
      if (sp.level > top) say(`${sp.name} is level ${sp.level}; a level ${level} ${c.name} casts spells up to level ${top}.`);
      if (sp.level === 0) cantrips++; else prepared++;
    }
    const maxC = cast.cantrips[level - 1] + G.reduce((n, g) => n + (g.cantrips ?? 0), 0), maxP = cast.prepared[level - 1];
    if (cantrips > maxC) say(`A level ${level} ${c.name} knows ${maxC} cantrip${maxC === 1 ? '' : 's'}; ${cantrips} chosen.`);
    if (prepared > maxP) say(`A level ${level} ${c.name} prepares ${maxP} spells; ${prepared} chosen (spells the class always has prepared are added and do not count).`);
  }
  for (const k of ['tools', 'gear', 'weapons']) if (sheet[k] !== undefined && !(Array.isArray(sheet[k]) && sheet[k].length <= 60 && sheet[k].every((x) => typeof x === 'string' && x.length <= 60))) say(`Its ${k} are a list of short names.`);
  if (sheet.choices !== undefined && !(sheet.choices && typeof sheet.choices === 'object' && Object.values(sheet.choices).every((v) => typeof v === 'string'))) say('Its choices name options.');
  if (sheet.shield !== undefined && typeof sheet.shield !== 'boolean') say('Shield is true or false.');
  void abil;
  return bad;
}
