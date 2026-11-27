// The d20 confirms (#750, docs/specs/one-token-menu.md "Amendment: the d20 confirms"): the words and the double-tap rule, apart from the page so they can be tested.

// A double-tap is two taps on the same creature, at most DOUBLE_MS apart and at most DOUBLE_PX apart on the screen. A drag or a pinch is never a tap (the renderer's own rule),
// so neither can be half of a pair. 350 ms is the usual limit of a double-tap on a phone and 24 px a finger's wobble; the map's tap itself needs less than 8 px of movement.
export const DOUBLE_MS = 350, DOUBLE_PX = 24;

// `last`: { id, at (ms), xy ([x, y] on the map or null) } of the previous tap on a creature; `tap`: the same for this one.
export function isPair(last, tap) {
  if (!last || last.id !== tap.id || tap.at - last.at > DOUBLE_MS || tap.at < last.at) return false;
  return !last.xy || !tap.xy || Math.hypot(tap.xy[0] - last.xy[0], tap.xy[1] - last.xy[1]) <= DOUBLE_PX;
}

// The note at the top: how many targets are chosen of the most allowed; none chosen says what to do; a refusal's reason follows, the choices staying.
export function targetNote(most, n, refusal = '') {
  if (!most) return '';
  const why = refusal ? ` ${refusal}` : '';
  return n ? `${n} of ${most} target${most === 1 ? '' : 's'}${refusal ? '.' : ''}${why}` : `No target yet: tap one, then the die.${why}`;
}

// The die's spoken name while an action waits.
export const dieName = (what) => (what ? `Confirm ${what}` : 'Menu');

// ---------- the choices an armed action waits for, on the character's sheet (#750 part 2) ----------
// Each option is { value, label, sub, on, why }: `why` is set when it cannot be used now and says so in words (the option is greyed), `on` marks the one the die will confirm with.
// `slots`: the creature's slots by level; `lowest`: the spell's own level; `menu`: the rows of upcast.js `slotMenu` (the levels that may pay, each { level, left, adds });
// `chosen`: the level chosen. Every level the caster has slots for is listed; one with none left is greyed.
export function slotOptions(slots, lowest, menu, chosen) {
  const by = new Map((menu?.levels ?? []).map((r) => [r.level, r]));
  return Object.keys(slots ?? {}).map(Number).filter((l) => l >= lowest).sort((a, b) => a - b).map((l) => {
    const r = by.get(l);
    return r ? { value: String(l), label: `Level ${l}`, sub: `${r.left} left${r.adds ? ` · ${r.adds}` : ''}`, on: l === chosen, why: '' }
      : { value: String(l), label: `Level ${l}`, sub: '', on: false, why: `No level ${l} spell slot left.` };
  });
}
// A list of plain choices (a skill, a damage type): all of them can be used. `nameOf(v)` is the words for a value.
export const pickOptions = (list, chosen, nameOf) => list.map((v) => ({ value: v, label: nameOf(v), sub: '', on: v === chosen, why: '' }));
// The weapons a spell may change, from imbue.js `weaponsFor` ([record, why-not]): a weapon it cannot be put on is greyed with the reason in words.
export const weaponOptions = (pairs, chosen) => pairs.map(([a, why]) => ({ value: a.id, label: a.name, sub: '', on: !why && a.id === chosen, why: why ? `${a.name} cannot be used: ${why}.` : '' }));
// Whether any option can be used (a block with none says so rather than waiting for ever).
export const usable = (options) => options.filter((o) => !o.why);
