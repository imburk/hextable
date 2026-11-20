// The create-character screen's pure parts (#603): item texts in our own words, who is trained in what, what a class feature does and when it is used,
// the class resource (Focus Points, Spell slots, ...), and the live sheet's lines. Read from the class data the client already has; no class is named here
// (the one presentation table, RESOURCE_NICKNAME, holds a plain-words alias for a resource). No DOM, so it runs in Node under test. It decides no rule:
// `derive` and `validate` do, and the numbers shown come from `derive`.
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
export const nice = (id) => cap(String(id ?? '').replace(/-/g, ' '));
export const signed = (n) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

// ---------- item texts (our own words; the numbers are the data's) ----------
export const PROP_TEXT = {
  finesse: 'Finesse: use Strength or Dexterity for the attack and the damage.',
  light: 'Light: after you attack with it, a Bonus Action can attack with another Light weapon in the other hand.',
  heavy: 'Heavy: Disadvantage on the attack if your Strength (melee) or Dexterity (ranged) is below 13.',
  reach: 'Reach: it reaches 5 feet further.',
  thrown: 'Thrown: throw it for a ranged attack, using the same ability as in melee.',
  'two-handed': 'Two-Handed: needs both hands to attack.',
  versatile: 'Versatile: one die size larger when held in two hands.',
  loading: 'Loading: one shot per action, Bonus Action or Reaction, whatever your number of attacks.',
  ammunition: 'Ammunition: needs ammunition; half of it can be found again after a fight.',
};
export const MASTERY_TEXT = {
  slow: 'Slow: a hit that deals damage cuts the target\'s Speed by 10 feet until your next turn starts.',
  nick: 'Nick: the extra Light attack is part of the Attack action, not a Bonus Action.',
  vex: 'Vex: a hit that deals damage gives you Advantage on your next attack against that creature.',
  sap: 'Sap: a hit gives the target Disadvantage on its next attack roll.',
  topple: 'Topple: a hit makes the target pass a Constitution save or fall Prone.',
  push: 'Push: a hit can push a Large or smaller target 10 feet away.',
  graze: 'Graze: a miss still deals damage equal to your ability modifier.',
  cleave: 'Cleave: once a turn, a melee hit lets you attack a second creature next to the first.',
};
export const DON = { light: 'Takes 1 minute to put on and 1 to take off.', medium: 'Takes 5 minutes to put on and 1 to take off.', heavy: 'Takes 10 minutes to put on and 5 to take off.' };

// The lines of a weapon's text: each property, the range, then the mastery.
export const weaponLines = (w) => [
  `${cap(w.category)} ${w.kind} weapon. ${w.damage}${w.versatile ? ` (${w.versatile} in two hands)` : ''} ${w.type}.`,
  ...w.properties.filter((x) => PROP_TEXT[x]).map((x) => PROP_TEXT[x]),
  w.range ? `Range ${w.range[0]} feet; up to ${w.range[1]} feet with Disadvantage.` : '',
  MASTERY_TEXT[w.mastery] ? `Mastery (if you have Weapon Mastery): ${MASTERY_TEXT[w.mastery]}` : ''].filter(Boolean);
// One line for the row: kind, damage, range, properties.
export const weaponSummary = (w) => [w.kind === 'ranged' ? 'Ranged' : 'Melee', `${w.damage} ${w.type}`, ...(w.range ? [`range ${w.range[0]}/${w.range[1]}`] : []), ...w.properties.map(cap)].join(' · ');
export const armourAcText = (a) => (a.category === 'shield' ? `+${a.ac} AC` : a.category === 'light' ? `AC ${a.ac} + DEX` : a.category === 'medium' ? `AC ${a.ac} + DEX (max 2)` : `AC ${a.ac}`);
export const armourSummary = (a) => (a.category === 'shield' ? '+2 AC if you are trained' : `${cap(a.category)} · ${armourAcText(a)}`);
export function armourLines(a) {
  if (a.category === 'shield') return ['Shield: +2 Armor Class while held, if you are trained with Shields.', 'Takes an action to put on or take off (the Utilize action).'];
  const ac = a.category === 'light' ? `${a.ac} + your Dexterity modifier` : a.category === 'medium' ? `${a.ac} + your Dexterity modifier (at most +2)` : `${a.ac}, Dexterity does not count`;
  return [`${cap(a.category)} armour: Armor Class ${ac}.`, a.strength ? `Speed −10 feet unless your Strength is ${a.strength} or more.` : '', a.stealth ? 'Disadvantage on Dexterity (Stealth) checks.' : '', DON[a.category] ?? ''].filter(Boolean);
}

// ---------- who is trained in what (the same reading as derive.js; a test pins that they agree) ----------
export const weaponWords = (c, grants = []) => new Set([...(c?.weapons ?? []), ...grants.flatMap((g) => g?.proficiency?.weapons ?? [])]);
export const weaponTrained = (w, words) => [...words].some((k) => k === w.category || k === w.id || (k === 'martial-light' && w.category === 'martial' && w.properties.includes('light'))
  || (k === 'martial-finesse-or-light' && w.category === 'martial' && (w.properties.includes('light') || w.properties.includes('finesse'))));
// "Simple weapons and Martial weapons with the Light property": what a class's words cover, as a sentence.
const WORD = { simple: 'Simple weapons', martial: 'Martial weapons', 'martial-light': 'Martial weapons with the Light property', 'martial-finesse-or-light': 'Martial weapons with the Finesse or Light property' };
export const trainLine = (c, trainedArmour, words) => {
  const arm = ['light', 'medium', 'heavy'].filter((k) => trainedArmour.has(k)), wp = [...words].map((k) => WORD[k] ?? nice(k));
  return `Armour: ${arm.length ? arm.join(', ') : 'none'} · Shields: ${trainedArmour.has('shield') ? 'yes' : 'no'} · Weapons: ${wp.length ? wp.join('; ') : 'none'}.`;
};
// Features that need no armour and no Shield (a Monk's Martial Arts, Unarmored Defense, Unarmored Movement), read from the data: the ones armour turns off.
export const bareFeatures = (entries) => entries.filter((x) => { const g = x.f.grants ?? {}; return g.martialArts || g.ac?.shield === false || g.speed?.unless === 'armour'; }).map((x) => x.f.name);

// ---------- class features: when each is used, and what it does ----------
export function featureWhen(f) {
  const g = f.grants ?? {}, a = g.action, t = f.text ?? '';
  if (a?.time === 'bonus') return 'Bonus Action';
  if (a?.time === 'action') return 'Action';
  if (g.reaction || /\bReaction\b/.test(t.slice(0, 90))) return 'Reaction';
  if (g.extraAttack) return 'Attack action';
  if (g.initiative?.regain) return 'Roll Initiative';
  if (a?.time === 'free') return 'When you hit';
  if (g.ac || g.martialArts || g.speed || g.skills || g.expertise || g.saves || g.modifiers) return 'Always on';
  if (/\bBonus Action\b/.test(t.slice(0, 120))) return 'Bonus Action';
  if (f.uses?.recharge === 'short') return 'Short Rest';
  if (g.recover || g.restore) return /Short Rest/.test(t) ? 'After a Short Rest' : 'Rest';
  return 'Always on';
}
export const GROUPS = ['Attacks', 'Defence', 'Casting', 'Movement and recovery', 'Skills', 'Other'];
export function featureGroup(f) {
  const g = f.grants ?? {}, txt = `${f.name} ${(f.text ?? '').slice(0, 140)}`;
  if (g.martialArts || g.extraAttack || g.brutal || g.sneak || g.cunning || g.action?.gain?.attacks || g.missed) return 'Attacks';
  if (g.ac || g.reaction || g.evasion || g.saves || g.aura || g.steadfast || g.allTypes) return 'Defence';
  if (g.spells || g.spellLists || g.freeCast || g.metamagicMax || /\bspell|ritual|cantrip|Pact Magic/i.test(txt)) return 'Casting';
  if (g.skills || g.expertise) return 'Skills';
  if (g.speed || g.speeds || g.moveWith || g.surfaces || g.restore || g.recover || g.initiative || g.selfCure || g.cure || g.restExhaustion || f.uses) return 'Movement and recovery';
  return 'Other';
}
// The one line under a feature's name: its first sentence.
export const firstSentence = (t) => String(t ?? '').split(/(?<=[.!?]) /)[0];
export function usesText(u) {
  if (!u) return '';
  const n = `${u.max} use${u.max === 1 ? '' : 's'}`;
  if (u.recharge === 'short') return `${n}, back on a Short Rest`;
  return `${n}, back on a Long Rest${u.short ? ` (${u.short} on a Short Rest)` : ''}`;
}

// ---------- the class resource ----------
// A plain-words alias for a resource, beside its title ("Monk's Focus: your chi"). Presentation only: the data names the feature, this adds a word.
export const RESOURCE_NICKNAME = { 'monks-focus': 'your chi' };
// The resources of the character's features: a feature with `uses` that other features spend (`grants.action.cost.resource`). `entries` is featuresOf(sheet),
// `recFeats` the record's features (with the uses worked out for the level). Each: { id, name, title, alias, max, recharge, short, spenders: [feature] }.
export function resourcesOf(entries, recFeats = []) {
  const rec = new Map(recFeats.map((f) => [f.id, f])), out = [];
  const spend = new Map();
  for (const x of entries) { const r = x.f.grants?.action?.cost?.resource; if (r) (spend.get(r) ?? spend.set(r, []).get(r)).push(x.f); }
  for (const x of entries) {
    if (!x.f.uses || !spend.has(x.f.id)) continue;
    const u = rec.get(x.f.id)?.uses ?? x.f.uses, col = x.f.uses.max?.column;
    out.push({ id: x.f.id, name: x.f.name, title: col ? String(col).split('-').map(cap).join(' ') : x.f.name, alias: `${x.f.name}${RESOURCE_NICKNAME[x.f.id] ? `: ${RESOURCE_NICKNAME[x.f.id]}` : ''}`, max: u.max, recharge: u.recharge ?? 'long', short: u.short, spenders: spend.get(x.f.id), feature: x.f });
  }
  return out;
}
export const costText = (res, f) => { const n = f.grants?.action?.cost?.n ?? 1, t = res.title; return `${n} ${n === 1 ? t.replace(/s$/, '') : t}`; };
// Features to list in the groups: not the resource feature itself, not what spends it (those are under the card), and not a feat place (it is under Feats).
export function groupedFeatures(entries, resources) {
  const skip = new Set(resources.flatMap((r) => [r.id, ...r.spenders.map((f) => f.id)]));
  const by = {};
  for (const x of entries) { if (skip.has(x.f.id) || x.f.feat) continue; (by[featureGroup(x.f)] ??= []).push(x.f); }
  return GROUPS.filter((g) => by[g]).map((g) => [g, by[g].sort((a, b) => a.level - b.level)]);
}
// Spell slots as a list: [[level, n]], from the record's `slots` ({ 1: 4, 2: 3 }).
export const slotList = (slots) => Object.entries(slots ?? {}).map(([l, n]) => [Number(l), n]).filter(([, n]) => n > 0);

// ---------- the live sheet ----------
// The attack rows: the record's attacks, with "(Bonus Action)" twins folded into their base row (said in the note instead).
export function attackRows(attacks) {
  const ids = new Set(attacks.map((a) => a.id));
  return attacks.filter((a) => !(a.id.endsWith('-bonus') && ids.has(a.id.slice(0, -6)))).map((a) => ({ id: a.id, name: a.name.replace(/ \(Bonus Action\)$/, ''), hit: a.dc && !a.bonus ? `DC ${a.dc}` : signed(a.bonus), dmg: a.damage, dtype: a.dtype ?? '', sig: `${a.bonus}|${a.damage}` }));
}
// The heads-up lines: what the chosen gear costs right now. `s`: { armour: def|null, shield: bool, weapons: [def], abil, trained: { armour:Set, weapons:Set words }, caster, bare: [names], cls }
export function headsUp(s) {
  const out = [];
  const a = s.armour, noTrain = a && !s.trained.armour.has(a.category);
  if (noTrain) { if (s.caster) out.push('Cannot cast spells'); out.push('Disadvantage on every Strength and Dexterity roll'); }
  if (a?.strength && (s.abil?.str ?? 10) < a.strength) out.push(`Speed −10 ft: ${a.name} needs Strength ${a.strength}`);
  if (a?.stealth) out.push('Disadvantage on Stealth checks');
  if (s.shield && !s.trained.armour.has('shield')) out.push('The Shield gives no AC (not trained)');
  if ((a || s.shield) && s.bare.length) out.push(`${s.bare.join(', ')} ${s.bare.length === 1 ? 'is' : 'are'} off`);
  for (const w of s.weapons) if (!weaponTrained(w, s.trained.weapons)) out.push(`No Proficiency Bonus with the ${w.name}`);
  return out;
}
// The sentence a weapon row without training carries.
export const weaponCost = (hit, prof) => `No Proficiency Bonus on the attack roll: ${signed(hit)} instead of ${signed(hit + prof)}`;
// The sentence an armour row without training carries, and its second line. `bare`: the features armour turns off (bareFeatures).
export function armourCost(a, caster, bare = []) {
  if (a.category === 'shield') return `No AC bonus without training${bare.length ? ` \u00b7 turns off ${bare.join(', ')}` : ''}`;
  return `Disadvantage on Strength and Dexterity rolls${caster ? ' \u00b7 can\u2019t cast spells' : ''}${bare.length ? ` \u00b7 turns off ${bare.join(', ')}` : ''}`;
}
export const armourAlso = (a) => [a.stealth ? 'Disadvantage on Stealth' : '', a.strength ? `Speed \u221210 ft unless Strength ${a.strength}` : ''].filter(Boolean).join(' \u00b7 ');

// The spell's roll tag (Attack / DEX save / No roll), #605: it needs a field in the spell data, so there is none yet. Every place a spell row is drawn asks here; return a chip node when it exists.
export const spellTag = () => null;
