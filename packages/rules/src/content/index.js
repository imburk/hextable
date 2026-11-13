// Loads the content packs and builds lookups by id.
//
// Spells are played straight from their data by the effect runner (effects.js).
import { spellProfile } from '../effects.js';
import { TILES } from './terrain.js';
import { pack } from './srd52/pack.js';
import { spells as spellsStarter } from './srd52/spells.js';
import { spells0 } from './srd52/spells-0.js';
import { spells1 } from './srd52/spells-1.js';
import { spells4 } from './srd52/spells-4.js';
import { spells5 } from './srd52/spells-5.js';
import { spells6 } from './srd52/spells-6.js';
import { spells7 } from './srd52/spells-7.js';
import { spells8 } from './srd52/spells-8.js';
import { spells9 } from './srd52/spells-9.js';
import { spells2 } from './srd52/spells-2.js';
import { spells3 } from './srd52/spells-3.js';
import { monsters as monstersStarter } from './srd52/monsters.js';
import { monsters as monstersAC } from './srd52/monsters-a-c.js';
import { monsters as monstersPZ } from './srd52/monsters-p-z.js';
import { monsters as monstersDG } from './srd52/monsters-d-g.js';
import { monsters as monstersHO } from './srd52/monsters-h-o.js';
import { pregens } from './srd52/pregens.js';
import { conditions } from './srd52/conditions.js';
import { objects } from './srd52/objects.js';
import { weapons, armour } from './srd52/equipment.js';
import { barbarian } from './srd52/classes/barbarian.js';
import { bard } from './srd52/classes/bard.js';
import { cleric } from './srd52/classes/cleric.js';
import { druid } from './srd52/classes/druid.js';
import { fighter } from './srd52/classes/fighter.js';
import { monk } from './srd52/classes/monk.js';
import { paladin } from './srd52/classes/paladin.js';
import { ranger } from './srd52/classes/ranger.js';
import { rogue } from './srd52/classes/rogue.js';
import { sorcerer } from './srd52/classes/sorcerer.js';
import { warlock } from './srd52/classes/warlock.js';
import { wizard } from './srd52/classes/wizard.js';
import { multiclassSpellcaster } from './srd52/multiclass.js';

// A new content file is added in two places: an import above, and its list here.
const spells = [...spellsStarter, ...spells0, ...spells1, ...spells4, ...spells5, ...spells6, ...spells7, ...spells8, ...spells9, ...spells2, ...spells3];
const monsters = [...monstersStarter, ...monstersAC, ...monstersPZ, ...monstersDG, ...monstersHO];
// The twelve classes, one file each (srd52/classes/).
const classes = [barbarian, bard, cleric, druid, fighter, monk, paladin, ranger, rogue, sorcerer, warlock, wizard];

export { TILES };
export const PACKS = [{ pack, spells, monsters, pregens, conditions, objects, classes, weapons, armour, multiclass: multiclassSpellcaster }];
export { legacyMonster };                              // exported for tests
const byId = (list) => Object.fromEntries(list.map((e) => [e.id, e]));
export const CONTENT = { spells: byId(spells), monsters: byId(monsters), pregens: byId(pregens), conditions: byId(conditions), objects: byId(objects),
  classes: byId(classes), weapons: byId(weapons), armour: byId(armour), multiclass: multiclassSpellcaster };

// Spells: what the engine and the UI need to know about each, worked out from its data.
export const SPELLS = Object.fromEntries(spells.map((def) => [def.id, spellProfile(def)]));

// ---------- bridge to the engine's current shape, for monsters and pregens ----------
// A monster plays from its actions, as data: each one's effect steps run through the effect
// runner like a spell's (engine action `act`). MONSTER_ACTIONS holds them, minus their text;
// makeEntity gives a creature made from a pack monster its own copy.
//
// The flat `attacks` list below is kept as a summary of the simple weapon attacks, for old
// saved games whose creatures have no template, and for screens that list attacks. The engine
// does not use it for a creature that has actions. Characters' attacks are flat records until
// equipment is built (R10).

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
const playableAction = (a) => !a.multiattack && a.effects.length === 1 && a.effects[0].attack && a.effects[0].kind === 'weapon' && simpleDamage(a.effects[0].onHit) && !!a.target.creature;
function legacyMonster(m) {
  const features = {};
  for (const t of m.traits) if (LEGACY_FEATURES[t.id]) features[LEGACY_FEATURES[t.id]] = true;
  return {
    name: m.name, size: m.size, ac: m.ac, hp: m.hp, speed: m.speed.walk ?? 0, speeds: Object.fromEntries(Object.entries(m.speed).filter(([k]) => k !== 'walk')), ...(m.hover ? { hover: true } : {}), ...(m.senses ? { senses: { ...m.senses } } : {}), ...(m.saves ? { saveBonus: { ...m.saves } } : {}), ...(m.initiative !== undefined ? { initBonus: m.initiative } : {}), abil: { ...m.abilities }, prof: m.pb,
    ...(Object.keys(features).length ? { features } : {}),
    ...(m.vulnerable.length ? { vuln: [...m.vulnerable] } : {}),
    ...(m.immune.length ? { immune: [...m.immune] } : {}),
    ...(m.resist.length ? { resist: [...m.resist] } : {}),
    ...(m.conditionImmune ? { conditionImmune: [...m.conditionImmune] } : {}),
    ...(m.skills ? { skillBonus: { ...m.skills } } : {}),
    attacks: m.actions.filter(playableAction).map(legacyAttack),
  };
}
const legacyPregen = ({ id, ...record }) => structuredClone(record);
// What a creature carries of each action: everything but the text, which stays in the pack.
const runtimeAction = ({ text, ...a }) => structuredClone(a);

const table = (list, make) => Object.fromEntries(list.map((e) => [e.id, make(e)]));
export const MONSTERS = table(monsters, legacyMonster);
export const PREGENS = table(pregens, legacyPregen);
export const MONSTER_ACTIONS = table(monsters, (m) => m.actions.map(runtimeAction));
