// Rewards at the end of a fight: Experience Points and loot (docs/specs/table-ui.md, Decision 4).
//
// A fight that is won (or that the DM ends) leaves a conclusion in `state.conclusion`: the foes that
// took part with each one's XP from the pack, the party's characters who took part, bonus lines,
// each character's share and the loot lines the DM enters. Under the table setting `conclusion` the
// DM reviews it first ('dm', the default), it is published at once ('auto'), or none is made ('off').
// Until it is published players are told only that one is waiting (view.js). Publishing adds each
// share to the character's `xp`, puts each assigned loot line in its `gear`, and writes the record.
// Levelling up stays the DM's `levelUp` action: the engine only says who has reached the XP for it.
//
// The SRD gives each monster's XP and the XP for each level (content/srd52/advancement.js); it does not
// say how a group divides it or what a monster carries. Dividing it equally among the characters who
// took part and are alive is a table convention (setting `xpShare`: 'split', or 'full' for each the
// whole amount); loot is what the DM enters, never rolled.
import { CONTENT } from './content/index.js';
import { unknown } from './vision.js';
import { itemName } from './derive.js';

export const REWARD_LIMITS = { loot: 40, bonus: 20, name: 60, reason: 80, xp: 1000000, qty: 9999 };

const up = (e) => !e.dead && e.hp > 0;
const isInt = (n) => Number.isInteger(n);
const text = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '');

// The XP a character needs for each level, and the level a total reaches.
export const xpFor = (level) => CONTENT.advancement.levels[Math.max(1, Math.min(20, level | 0)) - 1].xp;
export const levelForXp = (xp) => CONTENT.advancement.levels.filter((r) => r.xp <= xp).at(-1)?.level ?? 1;

// Each character's share, from the foes that count and the bonus lines. A share the DM set by hand
// (`xp.fixed`) is kept as set. Characters who are dead (or gone) start at 0.
function share(s, c) {
  const base = c.foes.filter((f) => f.counts).reduce((n, f) => n + f.xp, 0);
  const total = base + c.xp.bonus.reduce((n, b) => n + b.amount, 0);
  const alive = c.party.filter((id) => s.entities[id] && !s.entities[id].dead);
  const each = (s.settings.xpShare ?? 'split') === 'full' ? total : alive.length ? Math.floor(total / alive.length) : 0;
  c.xp.base = base;
  for (const id of c.party) if (!c.xp.fixed.includes(id)) c.xp.per[id] = alive.includes(id) ? Math.max(0, each) : 0;
}

// At the end of a fight (engine/resolve.js, endEncounter), before the fight is cleared. `who` is the fight's
// creatures; `enc` the fight.
export function concludeFight(s, ev, result, enc, who, land = null) {
  if (result !== 'victory' && result !== 'ended') return;
  const mode = s.settings.conclusion ?? 'dm';
  if (mode === 'off') return;
  const party = who.filter((e) => e.side === 'party' && e.kind === 'pc').map((e) => e.id);
  const foes = who.filter((e) => e.side === 'foe').map((e) => ({ id: e.id, name: e.name, tpl: e.tpl ?? null, xp: CONTENT.monsters[e.tpl]?.xp ?? 0, counts: !up(e) && !e.bond }));     // a companion gives no XP of its own unless the DM ticks it (companions.md, question 6)
  const c = { id: enc.id, fight: enc.id, result, rounds: enc.round, where: enc.where ?? null, foes, party,
    xp: { base: 0, bonus: [], per: {}, fixed: [] }, loot: [], next: 1, published: false };
  share(s, c);
  s.conclusion = c;
  ev.push({ type: 'conclusionReady', fight: c.fight });
  if (mode === 'auto') publish(s, ev, land);
}

// Publish: shares into `xp`, assigned loot into `gear`, the record into the timeline.
// A loot line that names a magic item of the pack (`item`) lands on a built character's sheet as that item, through
// `land` (engine/sheets.js, landItem); a character typed in by hand, or a sheet that cannot take it, gets its name in `gear`.
function publish(s, ev, land = null) {
  const c = s.conclusion;
  // Who the party knew of, now: the published record names only those (view.js shapes it per viewer).
  for (const f of c.foes) f.seen = !!s.entities[f.id] && !unknown(s, s.entities[f.id]);
  for (const id of c.party) {
    const e = s.entities[id], n = c.xp.per[id] ?? 0;
    if (!e || e.kind !== 'pc') continue;
    const was = e.xp ?? xpFor(e.level), total = was + n;
    e.xp = total;
    if (n) ev.push({ type: 'xp', id, amount: n, total });
    const reach = levelForXp(total);
    if (reach > (e.level ?? 1) && reach > levelForXp(was)) ev.push({ type: 'levelReady', id, level: reach });
  }
  for (const l of c.loot) {
    const e = l.to && s.entities[l.to];
    if (!e) continue;
    if (l.item && land && e.sheet && l.qty <= 20) {
      const spec = { item: l.item, ...(l.base !== undefined ? { base: l.base } : {}), ...(l.type !== undefined ? { type: l.type } : {}), ...(l.spell !== undefined ? { spell: l.spell } : {}) };
      const got = land(s, e, Array.from({ length: l.qty }, () => ({ ...spec })), ev);
      if (got) { for (const x of got) ev.push({ type: 'gear', id: e.id, item: l.name, key: x.id, pack: l.item, why: 'loot' }); continue; }
    }
    const item = l.qty > 1 ? `${l.name} x${l.qty}` : l.name;
    e.gear.push(item);
    ev.push({ type: 'gear', id: e.id, item, why: 'loot' });
  }
  c.published = true;
  ev.push({ type: 'conclusion', ...record(c) });
  const beaten = c.foes.filter((f) => f.counts && f.seen).map((f) => f.name);
  const words = { victory: 'won', ended: 'ended' }[c.result] ?? c.result;
  const per = [...new Set(c.party.map((id) => c.xp.per[id] ?? 0))];
  ev.push({ type: 'chronicle', title: `A fight${c.where ? ` at ${c.where}` : ''}: ${words}`,
    text: [`${c.rounds} round${c.rounds === 1 ? '' : 's'}.`, beaten.length ? `Beaten: ${beaten.join(', ')}.` : '',
      per.length === 1 ? `${per[0]} XP each.` : `XP: ${c.party.map((id) => `${s.entities[id]?.name ?? 'someone'} ${c.xp.per[id] ?? 0}`).join(', ')}.`,
      c.loot.length ? `Found: ${c.loot.map((l) => (l.qty > 1 ? `${l.name} x${l.qty}` : l.name)).join(', ')}.` : ''].filter(Boolean).join(' '),
    tags: ['fight'], public: true, fight: c.fight });
}

// The record as it is kept and sent to the DM; view.js shapes it for players.
const record = (c) => structuredClone({ fight: c.fight, result: c.result, rounds: c.rounds, where: c.where, foes: c.foes, party: c.party, xp: c.xp, loot: c.loot });

// The DM's action. { type: 'conclusion', edit: { foes?, bonus?, per?, loot? } } | { publish: true } | { skip: true }
export function rewardActions(fail, land = null) {
  return {
    conclusion(s, a, ctx, ev) {
      ctx.role === 'dm' || fail('Only the DM can settle the rewards.');
      const c = s.conclusion;
      (c && !c.published) || fail('There are no rewards waiting to be settled.');
      const forms = ['edit', 'publish', 'skip'].filter((k) => a[k] !== undefined);
      forms.length === 1 || fail('Edit, publish or skip the rewards: one of them.');
      if (a.skip !== undefined) {
        a.skip === true || fail('Skip is true.');
        s.conclusion = null;
        ev.push({ type: 'conclusionSkipped', fight: c.fight });
        return;
      }
      if (a.publish !== undefined) {
        a.publish === true || fail('Publish is true.');
        publish(s, ev, land);
        return;
      }
      // Every change is checked on a copy first, so a refused edit changes nothing.
      const e = a.edit, next = structuredClone(c);
      (e && typeof e === 'object' && !Array.isArray(e)) || fail('Say what to change.');
      for (const k of Object.keys(e)) ['foes', 'bonus', 'per', 'loot'].includes(k) || fail(`Rewards have no "${k}" to change.`);
      if (e.foes !== undefined) {
        (e.foes && typeof e.foes === 'object' && !Array.isArray(e.foes)) || fail('Foes are { id: true or false }.');
        for (const [id, on] of Object.entries(e.foes)) {
          const f = next.foes.find((x) => x.id === id) || fail('That creature was not in the fight.');
          typeof on === 'boolean' || fail('A foe counts or it does not: true or false.');
          f.counts = on;
        }
      }
      if (e.bonus !== undefined) {
        (Array.isArray(e.bonus) && e.bonus.length <= REWARD_LIMITS.bonus) || fail(`Bonus XP is a list of at most ${REWARD_LIMITS.bonus} lines.`);
        next.xp.bonus = e.bonus.map((b) => {
          (b && typeof b === 'object' && isInt(b.amount) && b.amount >= 0 && b.amount <= REWARD_LIMITS.xp) || fail('Bonus XP is a whole number, 0 or more.');
          const reason = text(b.reason);
          (reason && reason.length <= REWARD_LIMITS.reason) || fail(`Give each bonus a reason of at most ${REWARD_LIMITS.reason} characters.`);
          return { id: `b${next.next++}`, amount: b.amount, reason };
        });
      }
      if (e.per !== undefined) {
        (e.per && typeof e.per === 'object' && !Array.isArray(e.per)) || fail('Shares are { character id: XP }.');
        for (const [id, n] of Object.entries(e.per)) {
          next.party.includes(id) || fail('That character was not in the fight.');
          if (n === null) { next.xp.fixed = next.xp.fixed.filter((x) => x !== id); continue; }      // back to the engine's figure
          (isInt(n) && n >= 0 && n <= REWARD_LIMITS.xp) || fail('A share is a whole number of XP, 0 or more.');
          next.xp.per[id] = n;
          if (!next.xp.fixed.includes(id)) next.xp.fixed.push(id);
        }
      }
      if (e.loot !== undefined) {
        const l = e.loot;
        (l && typeof l === 'object' && !Array.isArray(l)) || fail('Loot is { add, remove, assign }.');
        for (const k of Object.keys(l)) ['add', 'remove', 'assign'].includes(k) || fail(`Loot has no "${k}".`);
        const holder = (to) => {
          if (to === null || to === undefined) return null;
          (typeof to === 'string' && next.party.includes(to) && s.entities[to]) || fail('Loot goes to a character who was in the fight, or to nobody.');
          return to;
        };
        if (l.remove !== undefined) {
          (Array.isArray(l.remove) && l.remove.every((id) => next.loot.some((x) => x.id === id))) || fail('No such loot line.');
          next.loot = next.loot.filter((x) => !l.remove.includes(x.id));
        }
        if (l.add !== undefined) {
          Array.isArray(l.add) || fail('Loot to add is a list.');
          for (const x of l.add) {
            (x && typeof x === 'object') || fail('A loot line has a name.');
            // `item`: a magic item of the pack (and its base, type or spell), so the line lands as that item; its name is the item's unless given.
            const def = x.item === undefined ? null : (typeof x.item === 'string' && Object.hasOwn(CONTENT.items, x.item) ? CONTENT.items[x.item] : fail(`"${String(x.item)}" is not a magic item of the pack.`));
            for (const k of ['base', 'type', 'spell']) (x[k] === undefined || (def && typeof x[k] === 'string' && x[k].length <= 40)) || fail(`A loot line's ${k} goes with a magic item.`);
            const name = x.name === undefined && def ? itemName(def, x) : text(x.name), from = x.from === undefined ? undefined : text(x.from);
            (name && name.length <= REWARD_LIMITS.name) || fail(`Name each item in at most ${REWARD_LIMITS.name} characters.`);
            const qty = x.qty ?? 1;
            (isInt(qty) && qty >= 1 && qty <= REWARD_LIMITS.qty) || fail('A quantity is a whole number, 1 or more.');
            (from === undefined || from.length <= REWARD_LIMITS.name) || fail(`Say where it came from in at most ${REWARD_LIMITS.name} characters.`);
            next.loot.push({ id: `l${next.next++}`, name, qty, ...(from ? { from } : {}), to: holder(x.to), ...(def ? { item: x.item, ...Object.fromEntries(['base', 'type', 'spell'].filter((k) => x[k] !== undefined).map((k) => [k, x[k]])) } : {}) });
          }
        }
        if (l.assign !== undefined) {
          (l.assign && typeof l.assign === 'object' && !Array.isArray(l.assign)) || fail('Assign is { loot id: character id or null }.');
          for (const [id, to] of Object.entries(l.assign)) (next.loot.find((x) => x.id === id) || fail('No such loot line.')).to = holder(to);
        }
        next.loot.length <= REWARD_LIMITS.loot || fail(`At most ${REWARD_LIMITS.loot} loot lines.`);
      }
      share(s, next);
      s.conclusion = next;
      ev.push({ type: 'conclusionEdited', fight: next.fight });
    },
  };
}

// What a player is sent of a conclusion: that one is waiting, or the published record with only the
// foes the party knew of, the shares, the bonus lines and the loot. Never the base figure, a foe's XP
// or a foe they did not know of. `name` gives the name players know a creature by.
export function playerConclusion(c, name = (f) => f.name) {
  if (!c) return null;
  if (!c.published) return { id: c.id, fight: c.fight, pending: true };
  return {
    id: c.id, fight: c.fight, result: c.result, rounds: c.rounds, where: c.where, published: true,
    foes: c.foes.filter((f) => f.seen).map((f) => ({ id: f.id, name: name(f), counts: f.counts })),
    party: [...c.party],
    xp: { bonus: c.xp.bonus.map((b) => ({ amount: b.amount, reason: b.reason })), per: { ...c.xp.per } },
    loot: c.loot.map((l) => ({ id: l.id, name: l.name, qty: l.qty, ...(l.from ? { from: l.from } : {}), to: l.to, ...(l.item ? { item: l.item } : {}) })),
  };
}
