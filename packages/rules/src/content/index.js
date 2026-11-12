// Loads the content packs and builds lookups by id.
//
// Spells are played straight from their data by the effect runner (effects.js).
import { spellProfile } from '../effects.js';
import { TILES } from './terrain.js';
import { pack } from './srd52/pack.js';
import { spells as spellsStarter } from './srd52/spells.js';
import { spells0 } from './srd52/spells-0.js';
import { spells1 } from './srd52/spells-1.js';
import { monsters as monstersStarter } from './srd52/monsters.js';
import { monsters as monstersAC } from './srd52/monsters-a-c.js';
import { monsters as monstersPZ } from './srd52/monsters-p-z.js';
import { pregens } from './srd52/pregens.js';
import { conditions } from './srd52/conditions.js';
import { objects } from './srd52/objects.js';

// A new content file is added in two places: an import above, and its list here.
const spells = [...spellsStarter, ...spells0, ...spells1];
const monsters = [...monstersStarter, ...monstersAC, ...monstersPZ];

export { TILES };
export const PACKS = [{ pack, spells, monsters, pregens, conditions, objects }];
export { legacyMonster };                              // exported for tests
const byId = (list) => Object.fromEntries(list.map((e) => [e.id, e]));
export const CONTENT = { spells: byId(spells), monsters: byId(monsters), pregens: byId(pregens), conditions: byId(conditions), objects: byId(objects) };

// Spells: what the engine and the UI need to know about each, worked out from its data.
export const SPELLS = Object.fromEntries(spells.map((def) => [def.id, spellProfile(def)]));

// ---------- bridge to the engine's current shape, for monsters and pregens ----------
// Weapon attacks are still flat records. They move to effect steps when modifiers and
// equipment do (tasks R3 and R10); this bridge goes then.

const simpleDamage = (steps) => Array.isArray(steps) && steps[0]?.damage !== undefined;
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
    name: m.name, size: m.size, ac: m.ac, hp: m.hp, speed: m.speed.walk ?? 0, speeds: Object.fromEntries(Object.entries(m.speed).filter(([k]) => k !== 'walk')), ...(m.hover ? { hover: true } : {}), abil: { ...m.abilities }, prof: m.pb,
    ...(Object.keys(features).length ? { features } : {}),
    ...(m.vulnerable.length ? { vuln: [...m.vulnerable] } : {}),
    ...(m.immune.length ? { immune: [...m.immune] } : {}),
    ...(m.resist.length ? { resist: [...m.resist] } : {}),
    ...(m.skills ? { skillBonus: { ...m.skills } } : {}),
    attacks: m.actions.filter(playableAction).map(legacyAttack),
  };
}
const legacyPregen = ({ id, ...record }) => structuredClone(record);

const table = (list, make) => Object.fromEntries(list.map((e) => [e.id, make(e)]));
export const MONSTERS = table(monsters, legacyMonster);
export const PREGENS = table(pregens, legacyPregen);
