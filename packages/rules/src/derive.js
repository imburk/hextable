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
import { ABILITIES, SKILLS } from './content/schema.js';

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
const REFS = ['resource', 'of', 'with', 'while', 'pool', 'cost'];
function relabel(x, map) {
  if (Array.isArray(x)) return x.map((y) => relabel(y, map));
  if (!x || typeof x !== 'object') return x;
  const out = {};
  for (const [k, v] of Object.entries(x)) out[k] = (k === 'id' || REFS.includes(k)) && typeof v === 'string' && map.has(v) ? map.get(v) : relabel(v, map);
  return out;
}

// Every feature the character has at its levels: each class's, its subclass's from the level it is
// gained, and each option chosen. Returns [{ f, option?, of?, cls }], `cls` the class it is from
// (classesOf), whose level its numbers go by.
export function featuresOf(sheet) {
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
        for (const o of f.options.filter((x) => ids.includes(x.id))) out.push({ f: { ...o, id: `${f.id}-${o.id}`, level: f.level, checked: f.checked }, option: true, of: f.id, cls: k });
      }
    }
  }
  return out;
}

// A number that grows with the class (schema.js, lintAmount).
export function amount(x, c, level, abil) {
  if (typeof x === 'number') return x;
  if (x?.column !== undefined) return c.table[x.column][level - 1];
  // { mod, min, die }: so many of that die as the modifier (Sear Undead: Wisdom modifier d8s, at least one).
  if (x?.mod !== undefined && x.die !== undefined) return `${Math.max(x.min ?? 0, mod(abil[x.mod]))}d${x.die}`;
  if (x?.mod !== undefined) return Math.max(x.min ?? -Infinity, mod(abil[x.mod]));
  if (x?.perLevel !== undefined) return x.perLevel * level;
  // { byLevel: { 7: "1d8", 14: "2d8" } }: the value for the highest class level reached (Divine Strike).
  if (x?.byLevel !== undefined) { const at = Object.keys(x.byLevel).map(Number).filter((l) => l <= level).sort((a, b) => b - a)[0]; return at === undefined ? null : x.byLevel[at]; }
  return x;
}
const isAmount = (v) => !!v && typeof v === 'object' && ['column', 'mod', 'perLevel', 'byLevel'].some((k) => v[k] !== undefined);
// A class feature's modifiers and steps with their numbers put in.
function bakeAt(list, c, level, abil, pb = proficiencyFor(level)) {
  return structuredClone(list).map((x) => {
    const fix = (m) => { if (m && isAmount(m.value)) m.value = amount(m.value, c, level, abil); };
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
  const ks = classesOf(sheet), c = ks[0].c, level = ks.reduce((n, k) => n + k.level, 0), feats = featuresOf(sheet), G = grantsOf(feats);
  const abil = Object.fromEntries(ABILITIES.map((a) => [a, sheet.abilities?.[a] ?? 10]));
  for (const g of G) if (g.abilityBonus) for (const a of ABILITIES) if (g.abilityBonus[a]) abil[a] = Math.min(g.abilityBonus.max ?? 30, abil[a] + g.abilityBonus[a]);
  const armourWords = new Set(c.armour), weaponWords = new Set(c.weapons);
  for (const k of ks.slice(1)) { for (const a of k.c.multiclass.armour) armourWords.add(a); for (const w of k.c.multiclass.weapons) weaponWords.add(w); }
  for (const g of G) { for (const a of g.proficiency?.armour ?? []) armourWords.add(a); for (const w of g.proficiency?.weapons ?? []) weaponWords.add(w); }
  return { ks, c, level, feats, G, abil, armourWords, weaponWords, pb: proficiencyFor(level) };
}

// ---------- the record ----------

export function derive(sheet) {
  const { ks, c, level, feats, G, abil, armourWords, weaponWords, pb } = gather(sheet);
  const multi = ks.length > 1;
  const why = {};
  const armour = sheet.armour ? CONTENT.armour[sheet.armour] : null, shield = !!sheet.shield;
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
  for (const g of G) for (const m of g.speeds ?? []) speeds[m] = speed;
  const senses = { ...(sheet.senses ?? {}) };
  for (const g of G) for (const [k, v] of Object.entries(g.senses ?? {})) senses[k] = Math.max(senses[k] ?? 0, v);

  // Saves, skills, expertise.
  const saveProf = new Set(c.saves);
  for (const g of G) { if (g.saves === 'all') ABILITIES.forEach((a) => saveProf.add(a)); else for (const a of g.saves ?? []) saveProf.add(a); }
  const skills = Object.keys(SKILLS).filter((k) => sheet.skills?.includes(k) || sheet.extraSkills?.includes(k));
  const expertise = skills.filter((k) => sheet.expertise?.includes(k));

  // Attacks, from the weapons carried.
  const maX = feats.find((x) => x.f.grants?.martialArts), maDie = maX && bare ? amount(maX.f.grants.martialArts, maX.cls.c, maX.cls.level, abil) : null;
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
  const cast = casters.length > 0;

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
    tools: [...(thieves ? ['thieves-tools'] : []), ...(sheet.tools ?? [])].filter((t, i, l) => l.indexOf(t) === i),
    attacks,
    ...(cast ? { castAbil, spells, slots } : {}),
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
  why.attacks = Object.fromEntries(attacks.map((a) => [a.id, [`${nice(a.abil)} ${signed(mod(abil[a.abil]))}`, ...(a.weapon && !weaponTrained(CONTENT.weapons[a.weapon], [...weaponWords]) ? ['not proficient'] : [`Proficiency ${signed(pb)}`]), ...(a.type === 'ranged' && ranged && !a.id.endsWith('-thrown') ? [`Archery ${signed(ranged)}`] : [])]]));
  if (cast) why.spells = [`${nice(castAbil)} ${signed(mod(abil[castAbil]))}`, `Proficiency ${signed(pb)}`, `save DC ${8 + pb + mod(abil[castAbil])}`, `attack ${signed(pb + mod(abil[castAbil]))}`,
    ...casters.filter((k) => k.c.casting.ability !== castAbil).map((k) => `${k.c.name} spells: ${nice(k.c.casting.ability)}, save DC ${8 + pb + mod(abil[k.c.casting.ability])}, attack ${signed(pb + mod(abil[k.c.casting.ability]))}`)];
  return { record, why };
}

// ---------- what is wrong with a sheet ----------

const SHEET_FIELDS = ['name', 'class', 'subclass', 'level', 'classes', 'abilities', 'skills', 'extraSkills', 'expertise', 'choices', 'armour', 'shield', 'weapons', 'spells',
  'size', 'speed', 'senses', 'tools', 'gear', 'look'];
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
  const { feats, G, abil, armourWords, weaponWords } = gather(sheet);

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
    if (exp.some((k) => !skills.includes(k) && !extra.includes(k))) say('Expertise needs proficiency in the same skill.');
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

  // Armour and weapons.
  if (sheet.armour !== undefined && sheet.armour !== null) {
    const a = CONTENT.armour[sheet.armour];
    if (!a || a.category === 'shield') say(`"${sheet.armour}" is not armour in the equipment tables.`);
    else if (!armourWords.has(a.category)) say(`${multi ? 'This character' : `A ${c.name}`} has no training with ${a.category} armour: wearing ${a.name} gives Disadvantage on Strength and Dexterity D20 Tests and stops spellcasting. The engine does not apply that; choose other armour.`);
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
