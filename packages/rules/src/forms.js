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
const mod = (n) => Math.floor((n - 10) / 2);
const both = (a, b) => [...new Set([...(a ?? []), ...(b ?? [])])];

// Lay `tpl` (the engine's template of a pack monster, content/index.js MONSTERS) with its `actions`
// over creature `e`. Game statistics come from the stat block, but the creature keeps its own
// Intelligence, Wisdom and Charisma, and its own save and skill proficiencies with its Proficiency
// Bonus, using the stat block's modifier where that is higher (SRD Wild Shape). Resistances and
// Immunities are its own (from class features) together with the stat block's.
export function takeForm(e, block, name, tpl, actions, fx) {
  const kept = {}, absent = [];
  for (const k of FORM_FIELDS) { if (e[k] === undefined) absent.push(k); else kept[k] = structuredClone(e[k]); }
  e.form = { block, name, fx, kept, absent };
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
  && !!f.kept && typeof f.kept === 'object' && Array.isArray(f.absent) && Object.keys(f.kept).every((k) => FORM_FIELDS.includes(k)) && f.absent.every((k) => FORM_FIELDS.includes(k));
