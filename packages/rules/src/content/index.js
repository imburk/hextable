// Loads the content packs and builds lookups by id.
//
// The engine does not read the new format yet (that is task R2 of the rules expansion spec).
// Until it does, the tables at the bottom translate each entry into the flat shape the engine
// plays with today. They are a bridge, deleted when R2 lands.
import { TILES } from './terrain.js';
import { pack } from './srd52/pack.js';
import { spells as spellsStarter } from './srd52/spells.js';
import { monsters as monstersStarter } from './srd52/monsters.js';
import { pregens } from './srd52/pregens.js';

// A new content file is added in two places: an import above, and its list here.
const spells = [...spellsStarter];
const monsters = [...monstersStarter];

export { TILES };
export const PACKS = [{ pack, spells, monsters, pregens }];
export { playable, legacySpell, legacyMonster };       // exported for tests
const byId = (list) => Object.fromEntries(list.map((e) => [e.id, e]));
export const CONTENT = { spells: byId(spells), monsters: byId(monsters), pregens: byId(pregens) };

// ---------- bridge to the engine's current shape ----------

const feet = (range) => (range === 'self' ? 0 : range === 'touch' ? 5 : range);

function legacySpell(s) {
  const step = s.effects[0];
  const base = { name: s.name, level: s.level, time: s.time, range: feet(s.range), ...(s.target.area ? { area: { ...s.target.area } } : {}) };
  if (step.attack) return { ...base, kind: 'attack', damage: step.onHit[0].damage, dtype: step.onHit[0].type };
  if (step.save) return { ...base, kind: 'save', save: step.save, damage: step.onFail[0].damage, dtype: step.onFail[0].type, half: !!step.half };
  if (step.heal) return { ...base, kind: 'heal', heal: step.heal };
  if (step.damage) return { ...base, kind: 'auto', damage: step.damage, dtype: step.type, ...(step.times > 1 ? { darts: step.times } : {}) };
  return null;
}

// Can today's engine play this step list at all? Entries it cannot play are still in CONTENT
// (and in the coverage report); they are left out of the tables below until R2.
const simpleDamage = (steps) => Array.isArray(steps) && steps[0]?.damage !== undefined;
function playable(s) {
  const step = s.effects[0];
  if (s.effects.length !== 1 || !['action', 'bonus'].includes(s.time) || s.concentration) return false;
  if (s.target.area && s.target.area.shape !== 'cone') return false;
  if (step.attack) return step.kind === 'spell' && simpleDamage(step.onHit) && step.onHit.length === 1 && !step.onMiss;
  if (step.save) return simpleDamage(step.onFail) && step.onFail.length === 1 && !step.onSuccess;
  return step.heal !== undefined || step.damage !== undefined;
}

const LEGACY_FEATURES = { 'nimble-escape': 'nimbleEscape', 'pack-tactics': 'packTactics' };
function legacyAttack(a) {
  const step = a.effects[0], [main, ...rest] = step.onHit;
  const extra = rest.find((x) => x.damage && x.when?.includes('attack.advantage'));
  const where = a.target.creature;
  return {
    id: a.id, name: a.name, type: step.attack, bonus: step.bonus, damage: main.damage, dtype: main.type,
    ...(where.reach ? { reach: where.reach } : { range: [...where.range] }),
    ...(extra ? { bonusOnAdv: extra.damage } : {}),
    ...(rest.some((x) => x.condition === 'prone') ? { onHit: 'prone' } : {}),
  };
}
const playableAction = (a) => a.effects.length === 1 && a.effects[0].attack && a.effects[0].kind === 'weapon' && simpleDamage(a.effects[0].onHit) && !!a.target.creature;
function legacyMonster(m) {
  const features = {};
  for (const t of m.traits) if (LEGACY_FEATURES[t.id]) features[LEGACY_FEATURES[t.id]] = true;
  return {
    name: m.name, ac: m.ac, hp: m.hp, speed: m.speed.walk, abil: { ...m.abilities }, prof: m.pb,
    ...(Object.keys(features).length ? { features } : {}),
    ...(m.vulnerable.length ? { vuln: [...m.vulnerable] } : {}),
    ...(m.immune.length ? { immune: [...m.immune] } : {}),
    ...(m.resist.length ? { resist: [...m.resist] } : {}),
    attacks: m.actions.filter(playableAction).map(legacyAttack),
  };
}
const legacyPregen = ({ id, ...record }) => structuredClone(record);

const table = (list, make) => Object.fromEntries(list.map((e) => [e.id, make(e)]));
export const SPELLS = table(spells.filter(playable), legacySpell);
export const MONSTERS = table(monsters, legacyMonster);
export const PREGENS = table(pregens, legacyPregen);
