// Forms: a creature that takes another shape for a while (Wild Shape). Design:
// docs/specs/rules-expansion.md, decision 7, and its build notes (#154).
//
// A form lays a stat block from the content packs over a creature. What the stat block replaces
// is the list below; everything else (Hit Points, Hit Point Dice, Intelligence, Wisdom and
// Charisma, class features, Proficiency Bonus, skill and save proficiencies) is kept. What was
// replaced is kept on the creature, `form: { block, name, fx, kept, absent }`, and put back when
// the form ends (durations.js ends the lasting effect that holds it). Pure: no state but the creature.
import { SKILLS } from './content/schema.js';

export const FORM_FIELDS = ['size', 'ac', 'speed', 'speeds', 'hover', 'senses', 'abil', 'attacks', 'actions', 'resist', 'vuln', 'immune', 'conditionImmune',
  'skillBonus', 'saveBonus', 'initBonus'];
// What a whole form (Polymorph: `whole: true`) replaces besides those: the creature's proficiencies and its Proficiency Bonus, so that a Beast's saves and skills are the stat block's and not the
// creature's own. Kept the same way, and put back with the rest.
export const WHOLE_FIELDS = ['skills', 'expertise', 'saveProf', 'tools', 'prof'];
const mod = (n) => Math.floor((n - 10) / 2);
const both = (a, b) => [...new Set([...(a ?? []), ...(b ?? [])])];

// Lay `tpl` (the engine's template of a pack monster, content/index.js MONSTERS) with its `actions`
// over creature `e`. Game statistics come from the stat block, but the creature keeps its own
// Intelligence, Wisdom and Charisma, and its own save and skill proficiencies with its Proficiency
// Bonus, using the stat block's modifier where that is higher (SRD Wild Shape). Resistances and
// Immunities are its own (from class features) together with the stat block's.
// `opts.whole` (Polymorph, SRD: "the target's game statistics are replaced by the stat block of the chosen Beast"): not Wild Shape's layer but the whole block. Intelligence, Wisdom and Charisma, the saves
// and skills, the Proficiency Bonus, Resistances, Immunities and Condition Immunities are the stat block's alone; Hit Points, Hit Point Dice, alignment, personality and creature type stay (they are not in
// FORM_FIELDS). `opts.size` is the size it takes where the stat block's own does not fit (the engine judges that); `form.whole` says it was a whole form. Wild Shape calls this with no `opts`: nothing of it changes.
export function takeForm(e, block, name, tpl, actions, fx, opts = {}) {
  const whole = opts.whole === true, kept = {}, absent = [];
  for (const k of whole ? [...FORM_FIELDS, ...WHOLE_FIELDS] : FORM_FIELDS) { if (e[k] === undefined) absent.push(k); else kept[k] = structuredClone(e[k]); }
  // `opts.lasting` (Animal Shapes, Shapechange): `form.whole` is 'lasting', not true: the form does not end when its Temporary Hit Points do (durations.js and `damage` end only a `true` one), and it still cannot speak or cast spells
  // (engine/casting.js, rolls.js read it as truthy) unless `opts.spells` (Shapechange: "if you have the Spellcasting feature, you retain it too") sets `form.spells`, which nothing reads yet (DEBT). `opts.keep`: 'mental' (the
  // creature's own Intelligence, Wisdom and Charisma) and 'proficiencies' (its skills, saves, tools and Proficiency Bonus, the stat block's number used where it is higher, as Wild Shape's layer does).
  e.form = { block, name, fx, kept, absent, ...(whole ? { whole: opts.lasting === true ? 'lasting' : true } : {}), ...(whole && opts.spells === true ? { spells: true } : {}) };
  if (whole) return wholeForm(e, tpl, actions, opts.size ?? tpl.size, opts.keep ?? [], kept);
  const abil = { ...e.abil, str: tpl.abil.str, dex: tpl.abil.dex, con: tpl.abil.con };
  const saveBonus = {};
  for (const a of Object.keys(abil)) saveBonus[a] = Math.max(mod(abil[a]) + ((e.saveProf ?? []).includes(a) ? e.prof : 0), tpl.saveBonus?.[a] ?? -Infinity);
  const skillBonus = {};
  for (const [k, n] of Object.entries(tpl.skillBonus ?? {})) {
    const own = mod(abil[SKILLS[k]]) + ((e.skills ?? []).includes(k) ? e.prof * ((e.expertise ?? []).includes(k) ? 2 : 1) : 0);
    if (n > own) skillBonus[k] = n;
  }
  Object.assign(e, {
    size: tpl.size, ac: tpl.ac, speed: tpl.speed, speeds: structuredClone(tpl.speeds ?? {}), senses: structuredClone(tpl.senses ?? {}), abil,
    attacks: [], actions: structuredClone(actions), resist: both(kept.resist, tpl.resist), vuln: [...(tpl.vuln ?? [])], immune: both(kept.immune, tpl.immune),
    skillBonus, saveBonus,
  });
  if (tpl.hover) e.hover = true; else delete e.hover;
  // The creature keeps its class features and feats (Nature's Ward), so its own Resistances and
  // Immunities stay and the Beast's are added. A character's own come only from its features
  // (derive.js); a quick-entry sheet's typed ones are kept too, as the engine cannot tell.
  const ci = both(kept.conditionImmune, tpl.conditionImmune);
  if (ci.length) e.conditionImmune = ci; else delete e.conditionImmune;
  if (tpl.initBonus !== undefined) e.initBonus = tpl.initBonus; else delete e.initBonus;
}

// Lay the whole stat block over `e` (`kept` and `form` are already set by takeForm).
function wholeForm(e, tpl, actions, size, keep = [], kept = {}) {
  const abil = { ...tpl.abil }, saveBonus = {}, mental = keep.includes('mental'), prof = keep.includes('proficiencies');
  if (mental) for (const a of ['int', 'wis', 'cha']) if (kept.abil?.[a] !== undefined) abil[a] = kept.abil[a];
  const pb = prof ? kept.prof ?? e.prof : tpl.prof ?? e.prof, saves = prof ? kept.saveProf ?? [] : [];
  for (const a of Object.keys(abil)) {
    const own = mod(abil[a]) + (saves.includes(a) ? pb : 0), block = tpl.saveBonus?.[a];
    saveBonus[a] = prof ? Math.max(own, block ?? -Infinity) : mental && ['int', 'wis', 'cha'].includes(a) ? own : block ?? own;
  }
  const skillBonus = structuredClone(tpl.skillBonus ?? {});
  if (prof) for (const [k, n] of Object.entries(tpl.skillBonus ?? {})) {
    const have = mod(abil[SKILLS[k]]) + ((kept.skills ?? []).includes(k) ? pb * ((kept.expertise ?? []).includes(k) ? 2 : 1) : 0);
    if (n <= have) delete skillBonus[k];
  }
  Object.assign(e, {
    size, ac: tpl.ac, speed: tpl.speed, speeds: structuredClone(tpl.speeds ?? {}), senses: structuredClone(tpl.senses ?? {}), abil,
    attacks: [], actions: structuredClone(actions), resist: [...(tpl.resist ?? [])], vuln: [...(tpl.vuln ?? [])], immune: [...(tpl.immune ?? [])],
    skillBonus, saveBonus, skills: prof ? structuredClone(kept.skills ?? []) : [], expertise: prof ? structuredClone(kept.expertise ?? []) : [], saveProf: prof ? structuredClone(kept.saveProf ?? []) : [], tools: prof ? structuredClone(kept.tools ?? []) : [], prof: pb,
  });
  if (tpl.hover) e.hover = true; else delete e.hover;
  if (tpl.conditionImmune?.length) e.conditionImmune = [...tpl.conditionImmune]; else delete e.conditionImmune;
  if (tpl.initBonus !== undefined) e.initBonus = tpl.initBonus; else delete e.initBonus;
}

// Put back what the form replaced.
export function leaveForm(e) {
  if (!e.form) return;
  const { kept, absent } = e.form;
  for (const [k, v] of Object.entries(kept)) e[k] = v;
  for (const k of absent) delete e[k];
  delete e.form;
}

// Is a saved form whole enough to be put back? (migrate.js)
export const validForm = (f) => !!f && typeof f === 'object' && typeof f.block === 'string' && typeof f.fx === 'string'
  && !!f.kept && typeof f.kept === 'object' && Array.isArray(f.absent) && Object.keys(f.kept).every((k) => FORM_FIELDS.includes(k) || (!!f.whole && WHOLE_FIELDS.includes(k))) && f.absent.every((k) => FORM_FIELDS.includes(k) || (!!f.whole && WHOLE_FIELDS.includes(k)))
  && (f.whole === undefined || f.whole === true || f.whole === 'lasting') && (f.spells === undefined || (f.spells === true && !!f.whole));
