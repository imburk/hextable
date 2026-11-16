// Summon blocks (docs/specs/companions.md, Decision 5): stat blocks whose numbers depend on the casting
// that makes the creature (Giant Insect: "AC 11 + the spell's level"). A block in the pack's `summons` list
// has the monster format, except that wherever a number or a choice of the casting is needed it may hold a
// summon amount:
//
//   { slot: k, base: n, above: L, round? }   n + k x (spell level - L); `round: 'down'` for a fraction
//   { caster: 'attack' | 'dc' | 'pb' | 'mod' }  the master's spell attack bonus, spell save DC, Proficiency
//                                            Bonus or spellcasting ability modifier
//   { by: 'variant' | 'type', <choice>: x }  x for the variant or creature type chosen
//   only: { variant?: [...], type?: [...], slot? }   on a trait, an action or a speed ({ value, only }):
//                                            kept only for those choices, or from that spell level on
//   plus: amount                             on a damage step: added to its dice ("1d6 + 3 plus the spell's level")
//
// bake() turns a block into a plain monster-shaped template: every amount replaced by its number, every
// `only` resolved, `cr: null`, `xp: 0`. The rest of the engine never sees an amount; the baked template
// passes the monster linter (content/schema.js, lintBaked). Pure, and it imports nothing, so the linter may
// use it.

const SLOT_KEYS = ['slot', 'base', 'above', 'round'];
export const CASTER_AMOUNTS = ['attack', 'dc', 'pb', 'mod'];
export const BY = ['variant', 'type'];

// A homebrew monster cannot be chosen as a form yet (#402; owner's ruling pending, #193): a player's stat block of one is
// never sent. Homebrew is told by the entry's `source` ("homebrew:<pack id>", which the strict linter requires). Every
// place where an action's own field or a spell's filter picks a creature by id to summon or to become asks this.
export const isHomebrew = (m) => !!m && typeof m.source === 'string' && m.source.startsWith('homebrew:');
export const HOMEBREW_FORM = 'A homebrew creature cannot be chosen as a form yet.';

const plain = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
// Is this value a summon amount?
export const isSlotAmount = (x) => plain(x) && typeof x.slot === 'number' && Object.keys(x).every((k) => SLOT_KEYS.includes(k));
export const isCasterAmount = (x) => plain(x) && Object.keys(x).length === 1 && 'caster' in x;
export const isByAmount = (x) => plain(x) && BY.includes(x.by);
export const isAmount = (x) => isSlotAmount(x) || isCasterAmount(x) || isByAmount(x);

// "1d6+3" plus a whole number: "1d6+3+4" is "1d6+7". Null if it is not dice of that shape.
function addTo(dice, n) {
  const m = /^(?:(\d+d\d+))?([+-]\d+)?$/.exec(String(dice));
  if (!m || !Number.isInteger(n)) return null;
  const bonus = (m[2] ? +m[2] : 0) + n;
  return `${m[1] ?? ''}${bonus ? (bonus > 0 && m[1] ? `+${bonus}` : `${bonus}`) : ''}` || '0';
}

// The value of one amount for this casting. Throws (an Error, not a refusal: content the linter would catch)
// if the amount cannot be worked out.
export function amount(x, o) {
  if (isSlotAmount(x)) {
    const v = (x.base ?? 0) + x.slot * (o.slot - (x.above ?? 0));
    if (x.round === 'down') return Math.floor(v);
    if (x.round === 'up') return Math.ceil(v);
    if (!Number.isInteger(v)) throw new Error('a summon amount that is not a whole number needs `round`');
    return v;
  }
  if (isCasterAmount(x)) {
    const v = o.caster?.[x.caster];
    if (!Number.isInteger(v)) throw new Error(`no caster ${x.caster} for a summon amount`);
    return v;
  }
  if (isByAmount(x)) {
    const pick = x.by === 'variant' ? o.variant : x.by === 'type' ? o.type : undefined;
    if (pick === undefined || !Object.hasOwn(x, pick) || pick === 'by') throw new Error(`a summon amount by ${x.by} has nothing for "${pick}"`);
    return bakeValue(x[pick], o);
  }
  throw new Error('not a summon amount');
}

// Does an `only` hold for this casting?
export function holdsFor(only, o) {
  if (only === undefined) return true;
  if (only.variant !== undefined && !only.variant.includes(o.variant)) return false;
  if (only.type !== undefined && !only.type.includes(o.type)) return false;
  if (only.slot !== undefined && o.slot < only.slot) return false;
  return true;
}

function bakeValue(v, o) {
  if (Array.isArray(v)) {
    const out = [];
    for (const x of v) {
      if (plain(x) && !isAmount(x) && x.only !== undefined && !holdsFor(x.only, o)) continue;
      out.push(bakeValue(x, o));
    }
    return out;
  }
  if (!plain(v)) return v;
  if (isAmount(v)) return amount(v, o);
  const out = {};
  for (const [k, x] of Object.entries(v)) {
    if (k === 'only') continue;
    if (k === 'plus') continue;
    // A speed (or any field) given as { value, only }: kept only where its `only` holds.
    if (plain(x) && 'value' in x && 'only' in x && Object.keys(x).length === 2) { if (holdsFor(x.only, o)) out[k] = bakeValue(x.value, o); continue; }
    out[k] = bakeValue(x, o);
  }
  // A damage step's `plus`: added to its dice.
  if ('damage' in v && v.plus !== undefined) {
    const sum = addTo(out.damage, amount(v.plus, o));
    if (sum === null) throw new Error(`cannot add to the dice "${out.damage}"`);
    out.damage = sum;
  }
  return out;
}

// The template a summon block makes for this casting: { slot, caster: { attack, dc, pb, mod }, variant?, type? }.
// `type` replaces the block's creature type when the block is cast with a choice of types.
export function bake(block, o) {
  const { variants: _v, types: _t, level: _l, ...rest } = block;
  const t = bakeValue(rest, o);
  if (o.type !== undefined) t.type = o.type;
  t.cr = null;
  t.xp = 0;
  return t;
}

// Every casting a block can be baked for, for the linter and the tests: each spell level from the block's
// own up to 9, by each variant and type it offers.
export function castings(block) {
  const out = [];
  for (let slot = block.level ?? 1; slot <= 9; slot++)
    for (const variant of block.variants ?? [undefined])
      for (const type of block.types ?? [undefined]) out.push({ slot, ...(variant !== undefined ? { variant } : {}), ...(type !== undefined ? { type } : {}) });
  return out;
}
