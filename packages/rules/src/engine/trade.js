// Purses and shops (docs/specs/shops.md, Decisions 3 to 7; task P3). The actions `market`, `openShop`, `shopEdit`, `showShop`,
// `revealGoods`, `closeShop`, `quote`, `buy` (with `split` and `joint`), `chipIn`, `sell` and `take`; the place rule; what a
// market's content lookups are (`marketEnv`); and `settleShops`, which apply() runs after every action to end the joint purchases
// that can no longer be paid. The money arithmetic is market.js's (pure); this module is the engine's half: who may, where, and
// what changes.
//
//   state.markets: [ { id, name, version, hash, lists, stores, loot, notes? } ]      the imported market packs; the DM's alone
//   state.shops:   [ { id, kind, name, blurb?, art?, from, lists, markup, buys, haggle, keeper?, at?, lines, overrides, coins?,
//                      shown, quotes, joint, waits, notes?, seq } ]                       (Decision 1; `seq` counts joint purchases)
//   e.coins:       { cp?, sp?, ep?, gp?, pp? }                                          a creature's purse, only the kinds it holds
//
// Every trade event that players may hear carries its audience (`to`: 'none' | 'all' | [userIds], and `except`: [userIds]), the
// shop's `shown` when it happened; view.js passes it only to a player in it and never sends the audience itself, live or from the
// record. A joint purchase's id is in `joint`, never `id`, which names creatures.
import { CONTENT } from '../content/index.js';
import { itemName } from '../derive.js';
import { shownTo } from '../handouts.js';
import { inArea } from '../space.js';
import { buysOf, change, cleanPurse, COINS, findLine, formatCoins, formatCp, haggle, haggleDc, haggleOf, lintMarket, listPrice,
  migrateMarket, parsePrice, pay, purseCp, sellOffer, settle } from '../market.js';
import { able, control, ent, fail, ownerOf, up } from './shared.js';
import { nearObject } from './world.js';
import { landItem, resheet } from './sheets.js';
import { handlers as featureHandlers } from './features.js';

export const TRADE_LIMITS = { shops: 100, markets: 20, joint: 3, qty: 99, coins: 10_000_000, quotes: 200, name: 60, text: 300, lines: 40, lootLines: 100 };
const DAY = 24 * 60;                                                       // the Influence action's wait, in minutes of world time
const isRec = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const whole = (n, lo, hi) => Number.isSafeInteger(n) && n >= lo && n <= hi;
const own = (o, k) => isRec(o) && Object.prototype.hasOwnProperty.call(o, k);
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const cleanText = (v, max) => (typeof v === 'string' && !CONTROL.test(v) ? v.trim() : null) ?? fail('That is not plain text.');
const textOk = (v, max, what) => { const t = cleanText(v, max); (t.length && t.length <= max) || fail(`${what} is 1 to ${max} letters.`); return t; };

// ---- what the content says of an item, for market.js ----------------------------------------------------------------------------

// A magic item's `base` is chosen per item unless it names exactly one (a Sun Blade is a longsword): only then is it needed on a line.
const oneBase = (b) => { const w = b?.weapon ?? b?.armour; return Array.isArray(w) && w.length === 1; };
// The lookups market.js takes (its header): the table's weapons, armour and magic items (the SRD's and, inside `using`, the homebrew
// packs'), the SRD's prices (P1) and the spells' levels.
export function marketEnv() {
  const P = CONTENT.prices;
  return {
    item(id) {
      if (typeof id !== 'string') return null;
      if (own(CONTENT.weapons, id)) return { name: CONTENT.weapons[id].name, kind: 'weapon', cost: CONTENT.weapons[id].cost };
      if (own(CONTENT.armour, id)) return { name: CONTENT.armour[id].name, kind: 'armour', cost: CONTENT.armour[id].cost };
      if (!own(CONTENT.items, id)) return null;
      const d = CONTENT.items[id], scroll = d.category === 'scroll' && d.variant === 'spell', needs = [];
      if (d.base && !oneBase(d.base)) needs.push('base');
      if (d.variant === 'damageType') needs.push('type');
      if (d.variant === 'spell') needs.push('spell');
      return { name: d.name, kind: 'magic', rarity: d.rarity, ...((d.activate ?? []).some((u) => u?.consumed) ? { consumable: true } : {}), ...(scroll ? { scroll: true } : {}), ...(needs.length ? { needs } : {}) };
    },
    rarityValue: (r) => { const x = (P?.rarities ?? []).find((y) => y.id === r); return x && Number.isFinite(x.gp) ? x.gp * 100 : null; },
    scrollCost: (lvl) => { const x = (P?.scrolls ?? []).find((y) => y.level === lvl); return x ? x.gp * 100 : null; },
    spellLevel: (id) => (typeof id === 'string' && own(CONTENT.spells, id) ? CONTENT.spells[id].level : null),
  };
}

// ---- finding things -------------------------------------------------------------------------------------------------------------

const shopsOf = (s) => (Array.isArray(s.shops) ? s.shops : []);
const marketsOf = (s) => (Array.isArray(s.markets) ? s.markets : []);
export const marketOfShop = (s, shop) => (shop?.from?.market ? marketsOf(s).find((m) => m.id === shop.from.market) ?? null : null);
const dm = (ctx) => ctx?.role === 'dm';
const dmOnly = (ctx, what = 'do that with shops') => dm(ctx) || fail(`Only the DM can ${what}.`);
// A shop as this sender may know it: to a player, one not shown to them does not exist, whatever the id (Decision 3).
export function shopFor(s, id, ctx, kind) {
  const shop = typeof id === 'string' ? shopsOf(s).find((x) => x.id === id) : null;
  (shop && (dm(ctx) || shownTo(shop, ctx?.userId))) || fail('No such shop.');
  if (kind && shop.kind !== kind) fail(kind === 'store' ? `${The(shop.name)} is not a store.` : `${The(shop.name)} is not something to take from.`);
  return shop;
}
// "the Outfitter", but a name that has its own article or is someone's ("Mira's Stall") as it is.
const bare = (n) => /^(the|a|an) /i.test(n) || /\S's\b/.test(n);
export const the = (n) => (bare(n) ? n : `the ${n}`);
export const The = (n) => { const t = the(n); return t.charAt(0).toUpperCase() + t.slice(1); };

// How many are left of a line: its override's `qty`, else its own; undefined is without limit.
const leftOf = (shop, line) => (shop.overrides?.[line.id]?.qty !== undefined ? shop.overrides[line.id].qty : line.qty);
// Is the line on the shelf: not taken off (`gone`) and, for a special, revealed.
const onShelf = (shop, line) => !!line && !shop.overrides?.[line.id]?.gone && line.hidden !== true;
// A line by id as this sender may know it. A hidden special and a line taken off are "No such item." to a player, as an id that is
// nothing is; the DM is told why.
export function lineFor(s, shop, id, ctx) {
  const line = typeof id === 'string' ? findLine(shop, marketOfShop(s, shop), id) : null;
  if (line && onShelf(shop, line)) return line;
  if (!dm(ctx) || !line) fail('No such item.');
  fail(line.hidden === true ? `${lineName(line)} is hidden: reveal it first.` : `${lineName(line)} is taken off the shelf here.`);
}
// What a line is called: its own name, else its item's as the sheet would name it.
export function lineName(line) {
  if (typeof line?.name === 'string') return line.name;
  const id = line?.item;
  if (own(CONTENT.items, id)) return itemName(CONTENT.items[id], line);
  if (own(CONTENT.weapons, id)) return CONTENT.weapons[id].name;
  if (own(CONTENT.armour, id)) return CONTENT.armour[id].name;
  return String(id ?? 'something');
}
const withQty = (name, qty) => (qty > 1 ? `${name} x${qty}` : name);
// The price of one of a line for this creature: a standing quote of theirs, else the shop's. Null: no price at all.
function unitPrice(s, shop, line, who) {
  const q = (shop.quotes ?? []).find((x) => !x.sell && x.line === line.id && x.for === who);
  return q ? q.price : listPrice(line, shop, marketOfShop(s, shop), marketEnv());
}
// The audience of a shop's events: who it is shown to now.
const heard = (shop) => ({ to: shop.shown === 'all' ? 'all' : Array.isArray(shop.shown) ? [...shop.shown] : 'none' });

// ---- who may shop, and where (Decision 4) ----------------------------------------------------------------------------------------

// The actor: theirs to play, up, able to act and (for a player) not in a fight. Checked after the shop, before the place.
function shopper(s, e, ctx) {
  control(s, e, ctx);
  up(e) || fail(`${e.name} is down.`);
  able(e);
  dm(ctx) || !s.encounter || fail('Not in the middle of a fight.');
}
// Is there a map in play: not when a scene is open or the table is on a navigation or scene node of the atlas (a holding map).
const mapInPlay = (s) => !!s.map && !s.map.holding && !s.scene?.open;
// The place rule for one character, as a sentence, or null when they may trade here. The DM is never stopped by it.
export function placeProblem(s, shop, e) {
  if (!mapInPlay(s)) return null;
  if (shop.kind === 'store') {
    const id = shop.at?.area, area = typeof id === 'string' ? (s.map.areas ?? []).find((x) => x?.id === id) : null;
    if (!area) return `${The(shop.name)} has no place on this map.`;
    return inArea(s.map, area, e) ? null : `${e.name} is not at ${the(shop.name)}.`;
  }
  if (typeof shop.at?.object !== 'string') return null;                     // a loot package with no object: no place rule
  const o = (s.map.objects ?? []).find((x) => x.id === shop.at.object);
  return o && nearObject(s, e, o) ? null : `${e.name} is not near ${the(shop.name)}.`;
}
const where = (s, shop, e, ctx) => { if (!dm(ctx)) { const why = placeProblem(s, shop, e); if (why) fail(why); } };

// ---- money ----------------------------------------------------------------------------------------------------------------------

// A creature's purse, or a refusal when what it holds is not a purse (a kind past the ceiling, a coin that is not a whole number): such a
// purse is the DM's to set again with `give`, never read as empty.
const purseOf = (e) => {
  const p = e.coins === undefined ? {} : cleanPurse(e.coins);
  (p && COINS.every((k) => (p[k] ?? 0) <= TRADE_LIMITS.coins)) || fail(`${e.name}'s purse can't be read; the DM sets it again.`);
  return p;
};
// A purse after a trade, refused if a kind would go past the ceiling (Decision 4: 0 to 10,000,000 of each kind).
const capped = (e, p) => { COINS.every((k) => (p[k] ?? 0) <= TRADE_LIMITS.coins) || fail(`${e.name}'s purse would hold more than ${TRADE_LIMITS.coins.toLocaleString('en')} coins of a kind.`); return p; };
const setPurse = (e, p) => { if (Object.keys(p).length) e.coins = p; else delete e.coins; };
const addCoins = (p, add) => { const out = { ...p }; for (const k of Object.keys(add)) out[k] = (out[k] ?? 0) + add[k]; return out; };
const coinsArg = (v) => {
  const p = cleanPurse(v);
  (p && isRec(v) && Object.keys(p).length && COINS.every((k) => (p[k] ?? 0) <= TRADE_LIMITS.coins)) || fail(`Name the coins: up to ${TRADE_LIMITS.coins.toLocaleString('en')} of each of cp, sp, ep, gp and pp.`);
  return p;
};
const qtyArg = (q, most = TRADE_LIMITS.qty) => {
  const n = q === undefined ? 1 : q;
  whole(n, 1, TRADE_LIMITS.qty) || fail(`How many: a whole number from 1 to ${TRADE_LIMITS.qty}.`);
  n <= most || fail(most === 0 ? 'Sold out.' : `Only ${most} left.`);
  return n;
};

// ---- landing goods on a character (Decision 5, step 3) ---------------------------------------------------------------------------

// Lands `qty` of a line on a creature, as `give` does: a magic item of the pack on a built character's sheet (carried, a new key each),
// anything else by name in `gear` ("Rope x3"). Throws, having changed nothing, when the sheet cannot take it. Returns the gear events.
function land(s, e, line, qty, why) {
  const out = [];
  if (own(CONTENT.items, line.item) && e.sheet) {
    const spec = { item: line.item, ...(line.base !== undefined ? { base: line.base } : {}), ...(line.type !== undefined ? { type: line.type } : {}), ...(line.spell !== undefined ? { spell: line.spell } : {}) };
    const evs = [];
    const made = landItem(s, e, Array.from({ length: qty }, () => ({ ...spec })), evs);
    out.push(...evs);
    for (const x of made) out.push({ type: 'gear', id: e.id, item: itemName(CONTENT.items[line.item], x), key: x.id, pack: line.item, why });
    return out;
  }
  const name = withQty(lineName(line), qty);
  name.length <= 80 || fail('That name is too long to carry.');
  (Array.isArray(e.gear) ? e.gear.length : 0) < 60 || fail(`${e.name} carries 60 things by name already.`);
  e.gear = [...(e.gear ?? []), name];
  out.push({ type: 'gear', id: e.id, item: name, ...(line.item ? { pack: line.item } : {}), why, ...(own(CONTENT.items, line.item) ? { nameOnly: true } : {}) });
  return out;
}
// One fewer (or `qty` fewer) of a limited line on the shelf.
function stockDown(shop, line, qty) {
  if (shop.overrides?.[line.id]?.qty !== undefined) shop.overrides[line.id].qty -= qty;
  else if (line.qty !== undefined) {
    const mine = (shop.lines ?? []).find((l) => l.id === line.id);
    if (mine) mine.qty -= qty; else { shop.overrides ??= {}; shop.overrides[line.id] = { ...(shop.overrides[line.id] ?? {}), qty: line.qty - qty }; }
  }
}
const quoteGone = (shop, who, key, sell) => { shop.quotes = (shop.quotes ?? []).filter((q) => !(q.for === who && !!q.sell === !!sell && (sell ? q.item === key : q.line === key))); };

// ---- joint purchases ------------------------------------------------------------------------------------------------------------

function endJoint(shop, j, why, ev) {
  shop.joint = (shop.joint ?? []).filter((x) => x !== j);
  ev.push({ type: 'jointEnded', shop: shop.id, joint: j.id, why, ...heard(shop) });
}
// Run by apply() after every action that went through (engine.js): a joint purchase ends by itself when a fight is going on, when its
// line is off the shelf or short of stock, when the buyer's player is no longer shown the store, or when the buyer (a player's
// character) has walked out of the shop area. Ends nothing in a table with no shops. Pure on the state; never throws a refusal.
export function settleShops(s, ev) {
  for (const shop of shopsOf(s)) {
    for (const j of [...(shop.joint ?? [])]) {
      const b = s.entities[j.buyer], owner = b ? ownerOf(s, b) : null;
      const line = findLine(shop, marketOfShop(s, shop), j.line), left = line ? leftOf(shop, line) : 0;
      const gone = Object.keys(j.pledges ?? {}).some((id) => !s.entities[id] || s.entities[id].dead);
      const why = s.encounter ? 'fight' : !b || !up(b) ? 'buyer' : gone ? 'pledger' : !onShelf(shop, line) || (left !== undefined && left < j.qty) ? 'stock'
        : owner && !shownTo(shop, owner) ? 'hidden' : owner && placeProblem(s, shop, b) ? 'left' : null;
      if (why) endJoint(shop, j, why, ev);
    }
  }
}

// ---- the actions ----------------------------------------------------------------------------------------------------------------

// A market document as the state keeps it: its lists, store and loot templates and notes; never its pictures (`assets`), whose bytes are
// the table server's to keep (task P4, X7); `art` ids stay. `hash` is FNV-1a of what is kept, so the DM can tell two copies apart.
function hashOf(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
// The lines of a shop checked as market.js checks a store's specials (or a loot package's lines), through a document of one store.
function lintLines(lines, kind) {
  const doc = { format: 'hextable-market', v: 1, id: 'shop', name: 'Shop', version: 1, lists: [], stores: [], loot: [] };
  if (kind === 'store') doc.stores = [{ id: 'shop', name: 'Shop', lists: [], special: lines }];
  else doc.loot = [{ id: 'shop', name: 'Shop', lines }];
  const bad = lintMarket(doc, marketEnv());
  return bad.map((x) => x.replace(/^(stores|loot)\/shop\/(special|lines)\//, ''));
}
// The DM's fields of a store or package, checked. Returns the cleaned value.
const STORE_SET = ['name', 'blurb', 'art', 'markup', 'buys', 'haggle', 'keeper', 'at', 'lists', 'notes'];
const LOOT_SET = ['name', 'blurb', 'art', 'at', 'notes'];
function checkSet(s, shop, key, v) {
  switch (key) {
    case 'name': return textOk(v, TRADE_LIMITS.name, 'A name');
    case 'blurb': case 'notes': return v === null ? null : textOk(v, TRADE_LIMITS.text, key === 'blurb' ? 'A blurb' : 'Notes');
    case 'art': (v === null || (typeof v === 'string' && /^(icon:[a-z0-9]+(-[a-z0-9]+)*|[A-Za-z0-9_-]{8,64})$/.test(v))) || fail('Art is a file of this table or icon:<name>.'); return v;
    case 'markup': whole(v, 10, 1000) || fail('A markup is a whole percent from 10 to 1000.'); return v;
    case 'buys': {
      isRec(v) && Object.keys(v).every((k) => ['equipment', 'trade', 'magic'].includes(k) && (v[k] === null || whole(v[k], 0, 100))) || fail('What a store buys at is a percent from 0 to 100 (or null) for equipment, trade and magic.');
      return { ...v };
    }
    case 'haggle': {
      const ok = isRec(v) && Object.keys(v).every((k) => ({ step: [0, 50], dc: [1, 40], bonus: [0, 25] })[k] && whole(v[k], ...({ step: [0, 50], dc: [1, 40], bonus: [0, 25] })[k]));
      ok || fail('Haggling takes a step (0 to 50 percent), a DC (1 to 40) and a bonus for good roleplaying (0 to 25).');
      return { ...v };
    }
    case 'keeper': if (v === null) return null; ent(s, v); return v;
    case 'at': {
      if (v === null) return null;
      if (shop.kind === 'store') { (isRec(v) && Object.keys(v).length === 1 && typeof v.area === 'string' && v.area.length <= 80) || fail('A store stands in a shop area: { area }.'); return { area: v.area }; }
      (isRec(v) && Object.keys(v).length === 1 && typeof v.object === 'string' && v.object.length <= 80) || fail('A loot package lies at an object: { object }.');
      return { object: v.object };
    }
    case 'lists': {
      const m = marketOfShop(s, shop);
      (Array.isArray(v) && v.length <= 20 && v.every((id) => typeof id === 'string' && m?.lists?.some((l) => l.id === id))) || fail(m ? `Lists are lists of ${m.name}.` : 'This shop was made from no market, so it has no lists to name.');
      return [...new Set(v)];
    }
    default: return fail(`A shop has no "${key}" to set.`);
  }
}
// Line ids a shop can see: its own and its lists'.
const lineIds = (s, shop) => new Set([...(shop.lines ?? []).map((l) => l.id), ...(shop.lists ?? []).flatMap((lid) => (marketOfShop(s, shop)?.lists ?? []).find((x) => x.id === lid)?.lines?.map((l) => l.id) ?? [])]);

// A quote's price after its points (the haggle's steps and the roleplaying bonus), from the list price or the store's own offer.
// The same sums as market.js's `haggle` (its points taken off, or added to a sell offer and held under its cap), for points that may be
// a roll's steps and the bonus together.
function pointsPrice(was, points, sell, cap) {
  if (!sell) return Math.max(1, Math.ceil((was * Math.max(0, 100 - points)) / 100));
  const p = Math.ceil((was * (100 + points)) / 100);
  return Number.isSafeInteger(cap) ? Math.max(was, Math.min(p, cap)) : p;
}
// What a character carries that may be sold: a magic item on its sheet by key, else a name in `gear`.
function carried(e, item) {
  (typeof item === 'string' && item.trim() && item.length <= 80) || fail('Name the item.');
  const x = e.sheet && Array.isArray(e.sheet.items) ? e.sheet.items.find((y) => y?.id === item) : null;
  if (x) return { key: x.id, x, name: itemName(CONTENT.items[x.item], x), thing: { item: x.item, base: x.base, spell: x.spell } };
  const g = (e.gear ?? []).find((n) => String(n).toLowerCase() === item.trim().toLowerCase());
  g !== undefined || fail(`${e.name} has no ${item.trim()}.`);
  // A name that is a pack item's own (a weapon, armour, or a magic item with no variant: "Potion of Healing" typed in or bought by a
  // character with no sheet) is sold as that item, so it fetches what the item fetches.
  const pack = [...Object.values(CONTENT.weapons), ...Object.values(CONTENT.armour), ...Object.values(CONTENT.items).filter((d) => !d.variant && !d.base)].find((d) => d.name.toLowerCase() === String(g).toLowerCase());
  return { key: String(g), name: String(g), thing: pack ? { item: pack.id } : { name: String(g) } };
}

export const handlers = {
  // { type: 'market', add: doc } or { type: 'market', remove: id }. The DM imports a market pack (Decision 2) or removes one no shop uses.
  market(s, a, ctx, ev) {
    dmOnly(ctx, 'import a market');
    if (a.remove !== undefined) {
      const m = marketsOf(s).find((x) => x.id === a.remove) || fail('No such market.');
      const using = shopsOf(s).filter((x) => x.from?.market === m.id);
      using.length === 0 || fail(`${m.name} is used by ${using.map((x) => x.name).join(', ')}: close ${using.length === 1 ? 'it' : 'them'} first.`);
      s.markets = marketsOf(s).filter((x) => x !== m);
      ev.push({ type: 'market', market: m.id, name: m.name, removed: true });
      return;
    }
    isRec(a.add) || fail('Send a market document.');
    let doc;
    try { doc = migrateMarket(structuredClone(a.add)); } catch { fail('That is not a market document.'); }
    const bad = lintMarket(doc, marketEnv());
    bad.length === 0 || fail(`That market can't be imported. ${bad[0]}`);
    const had = marketsOf(s).find((x) => x.id === doc.id);
    if (had) {
      doc.version !== had.version || fail('Already imported.');
      doc.version > had.version || fail(`Version ${had.version} of ${had.name} is imported already; this is version ${doc.version}.`);
      // A shop's own line may not share an id with a line of the newer lists it reads.
      for (const shop of shopsOf(s).filter((x) => x.from?.market === doc.id)) {
        const listed = new Set((shop.lists ?? []).flatMap((lid) => doc.lists.find((l) => l.id === lid)?.lines?.map((l) => l.id) ?? []));
        const clash = (shop.lines ?? []).find((l) => listed.has(l.id));
        !clash || fail(`${shop.name} has its own line "${clash.id}", which version ${doc.version} has in a list too.`);
        const gone = (shop.lists ?? []).find((lid) => !doc.lists.some((l) => l.id === lid));
        !gone || fail(`${shop.name} reads the list "${gone}", which version ${doc.version} no longer has.`);
      }
    } else marketsOf(s).length < TRADE_LIMITS.markets || fail(`A table holds ${TRADE_LIMITS.markets} markets at most.`);
    const { assets, format, v, ...rest } = doc;
    void assets; void format; void v;
    const kept = { ...structuredClone(rest), hash: '' };
    kept.hash = hashOf(JSON.stringify(rest));
    s.markets = had ? marketsOf(s).map((x) => (x === had ? kept : x)) : [...marketsOf(s), kept];
    ev.push({ type: 'market', market: kept.id, name: kept.name, version: kept.version, ...(had ? { replaced: had.version } : {}) });
  },
  // { type: 'openShop', kind: 'store' | 'loot', name?, market?, template?, at?, keeper? }: a shop made from a template of an imported market,
  // or from nothing; it starts shown to nobody. `name` defaults to the template's.
  openShop(s, a, ctx, ev) {
    dmOnly(ctx, 'open a shop');
    ['store', 'loot'].includes(a.kind) || fail('A shop is a store or a loot package.');
    shopsOf(s).length < TRADE_LIMITS.shops || fail(`A table holds ${TRADE_LIMITS.shops} shops at most.`);
    let m = null, t = null;
    if (a.market !== undefined) {
      m = marketsOf(s).find((x) => x.id === a.market) || fail('No such market.');
      if (a.template !== undefined) t = (a.kind === 'store' ? m.stores : m.loot).find((x) => x.id === a.template) || fail(`${m.name} has no ${a.kind === 'store' ? 'store' : 'loot'} template "${String(a.template).slice(0, 60)}".`);
    } else a.template === undefined || fail('Name the market the template is in.');
    const shop = { id: '', kind: a.kind, name: '' };
    shop.name = a.name !== undefined ? checkSet(s, shop, 'name', a.name) : t ? t.name : fail('Give the shop a name.');
    if (t?.blurb) shop.blurb = t.blurb;
    if (t?.art) shop.art = t.art;
    shop.from = m ? { market: m.id, template: t?.id ?? null } : null;
    if (a.kind === 'store') {
      Object.assign(shop, { lists: [...(t?.lists ?? [])], markup: t?.markup ?? 100, buys: buysOf(t?.buys), haggle: haggleOf(t?.haggle) });
      shop.lines = structuredClone(t?.special ?? []);
    } else {
      shop.lists = [];
      shop.lines = structuredClone(t?.lines ?? []);
      shop.coins = cleanPurse(t?.coins) ?? {};
    }
    if (a.at !== undefined) shop.at = checkSet(s, shop, 'at', a.at);
    if (a.keeper !== undefined) shop.keeper = checkSet(s, shop, 'keeper', a.keeper);
    s.shopSeq = (Number.isSafeInteger(s.shopSeq) ? s.shopSeq : shopsOf(s).length) + 1;
    shop.id = `s${s.shopSeq}`;
    Object.assign(shop, { overrides: {}, shown: 'none', quotes: [], joint: [], waits: {}, seq: 0 });
    s.shops = [...shopsOf(s), shop];
    ev.push({ type: 'shopOpened', shop: shop.id, name: shop.name, kind: shop.kind });
  },
  // { type: 'shopEdit', shop, set?, add?, remove?, override?, coins? }: every change the DM makes to one shop (Decision 4). All checked first.
  shopEdit(s, a, ctx, ev) {
    dmOnly(ctx, 'change a shop');
    const shop = shopFor(s, a.shop, ctx), next = structuredClone(shop);
    let seen = false;
    if (a.set !== undefined) {
      isRec(a.set) || fail('Say what to set.');
      for (const [k, v] of Object.entries(a.set)) {
        (shop.kind === 'store' ? STORE_SET : LOOT_SET).includes(k) || fail(`A ${shop.kind === 'store' ? 'store' : 'loot package'} has no "${k}" to set.`);
        const val = checkSet(s, shop, k, v);
        if (val === null) delete next[k]; else next[k] = val;
        if (!['keeper', 'notes', 'haggle'].includes(k)) seen = true;
      }
    }
    if (a.set?.lists !== undefined) {
      const m = marketOfShop(s, shop), listed = new Set(next.lists.flatMap((lid) => m?.lists?.find((l) => l.id === lid)?.lines?.map((l) => l.id) ?? []));
      const clash = next.lines.find((l) => listed.has(l.id));
      !clash || fail(`${shop.name} has a line "${clash.id}" already.`);
    }
    if (a.remove !== undefined) {
      (Array.isArray(a.remove) && a.remove.every((id) => typeof id === 'string')) || fail('Name the lines to remove.');
      for (const id of a.remove) next.lines.some((l) => l.id === id) || fail(`${shop.name} has no line of its own "${id.slice(0, 60)}".`);
      next.lines = next.lines.filter((l) => !a.remove.includes(l.id));
      for (const id of a.remove) delete next.overrides[id];
      next.quotes = next.quotes.filter((q) => !a.remove.includes(q.line));
      seen = true;
    }
    if (a.add !== undefined) {
      (Array.isArray(a.add) && a.add.length) || fail('Send the lines to add.');
      const taken = lineIds(s, next);
      for (const l of a.add) (isRec(l) && typeof l.id === 'string' && !taken.has(l.id)) || fail(isRec(l) && typeof l.id === 'string' ? `${shop.name} has a line "${l.id.slice(0, 60)}" already.` : 'A line needs an id.');
      next.lines = [...next.lines, ...structuredClone(a.add)];
      const bad = lintLines(next.lines, shop.kind);
      bad.length === 0 || fail(`That line can't be added. ${bad[0]}`);
      next.lines.length <= (shop.kind === 'store' ? TRADE_LIMITS.lines : TRADE_LIMITS.lootLines) || fail(`A shop has at most ${shop.kind === 'store' ? TRADE_LIMITS.lines : TRADE_LIMITS.lootLines} lines of its own.`);
      seen = true;
    }
    if (a.override !== undefined) {
      isRec(a.override) || fail('Say which lines to change.');
      const ids = lineIds(s, next);
      for (const [id, o] of Object.entries(a.override)) {
        ids.has(id) || fail(`${shop.name} has no line "${id.slice(0, 60)}".`);
        if (o === null) { delete next.overrides[id]; continue; }
        (isRec(o) && Object.keys(o).every((k) => ['price', 'qty', 'gone'].includes(k))) || fail('A change to a line is its price, how many there are, or that it is gone.');
        (o.price === undefined || (typeof o.price === 'string' ? parsePrice(o.price) !== null && parsePrice(o.price) <= TRADE_LIMITS.coins * 100 : whole(o.price, 1, TRADE_LIMITS.coins * 100))) || fail('A price reads like "15 GP", or is a whole number of copper pieces.');
        (o.qty === undefined || whole(o.qty, 0, 9999)) || fail('How many: a whole number from 0 to 9999.');
        (o.gone === undefined || o.gone === true) || fail('A line is gone, or the change says nothing of it.');
        next.overrides[id] = { ...o };
      }
      seen = true;
    }
    if (a.coins !== undefined) {
      shop.kind === 'loot' || fail('Only a loot package holds coins.');
      const p = a.coins === null ? {} : cleanPurse(a.coins);
      (p && COINS.every((k) => (p[k] ?? 0) <= TRADE_LIMITS.coins)) || fail('Coins are whole numbers of cp, sp, ep, gp and pp.');
      next.coins = p;
      seen = true;
    }
    (a.set ?? a.add ?? a.remove ?? a.override ?? a.coins) !== undefined || fail('Say what to change.');
    Object.assign(shop, next);
    for (const k of Object.keys(shop)) if (!own(next, k)) delete shop[k];
    ev.push({ type: 'shopEdited', shop: shop.id, name: shop.name });
    if (seen) ev.push({ type: 'shopChanged', shop: shop.id, ...heard(shop) });
  },
  // { type: 'showShop', shop, to: 'none' | 'all' | [userIds] } (Decision 3): who sees it, as a handout is shown.
  showShop(s, a, ctx, ev) {
    dmOnly(ctx, 'show a shop');
    const shop = shopFor(s, a.shop, ctx);
    const to = a.to === 'none' || a.to === 'all' ? a.to
      : Array.isArray(a.to) && a.to.length <= 50 && a.to.every((u) => typeof u === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(u)) ? (a.to.length ? [...new Set(a.to)] : 'none')
        : fail('Say who to show it to: nobody, everyone, or a list of players.');
    const was = shop.shown;
    const list = (x) => (Array.isArray(x) ? x : []);
    shop.shown = to;
    // Those now shown who were not, and those it is taken from (with 'all', as everyone but some).
    let gain = null, lose = null;
    if (to === 'all') gain = was === 'all' ? null : { to: 'all', except: list(was) };
    else if (Array.isArray(to)) gain = was === 'all' ? null : (() => { const n = to.filter((u) => !list(was).includes(u)); return n.length ? { to: n } : null; })();
    if (was === 'all') lose = to === 'all' ? null : { to: 'all', except: list(to) };
    else { const n = list(was).filter((u) => !list(to).includes(u)); lose = n.length ? { to: n } : null; }
    if (gain) ev.push({ type: 'shopShown', shop: shop.id, name: shop.name, ...gain });
    if (lose) ev.push({ type: 'shopHidden', shop: shop.id, ...lose });
    if (!gain && !lose) ev.push({ type: 'shopEdited', shop: shop.id, name: shop.name });
  },
  // { type: 'revealGoods', shop, line, hide? }: a special shown on the shelf, or taken back out of sight (its quotes withdrawn).
  revealGoods(s, a, ctx, ev) {
    dmOnly(ctx, 'reveal goods');
    const shop = shopFor(s, a.shop, ctx);
    const line = (shop.lines ?? []).find((l) => l.id === a.line) || fail('No such item.');
    if (a.hide === true) {
      line.hidden !== true || fail(`${lineName(line)} is hidden already.`);
      line.hidden = true;
      shop.quotes = (shop.quotes ?? []).filter((q) => q.line !== line.id);
      ev.push({ type: 'shopChanged', shop: shop.id, ...heard(shop) });
      return;
    }
    line.hidden === true || fail(`${lineName(line)} is on the shelf already.`);
    !shop.overrides?.[line.id]?.gone || fail(`${lineName(line)} is taken off the shelf here: give it back (override null) first.`);
    delete line.hidden;
    const left = leftOf(shop, line);
    ev.push({ type: 'goodsRevealed', shop: shop.id, line: line.id, name: lineName(line), price: listPrice(line, shop, marketOfShop(s, shop), marketEnv()), ...(left !== undefined ? { qty: left } : {}), ...heard(shop) });
  },
  // { type: 'closeShop', shop }: the shop goes, with its quotes and joint purchases (undo brings it back).
  closeShop(s, a, ctx, ev) {
    dmOnly(ctx, 'close a shop');
    const shop = shopFor(s, a.shop, ctx);
    for (const j of [...(shop.joint ?? [])]) endJoint(shop, j, 'closed', ev);
    s.shops = shopsOf(s).filter((x) => x !== shop);
    ev.push({ type: 'shopClosed', shop: shop.id, name: shop.name, ...heard(shop) });
  },
  // { type: 'quote', shop, for, line | item, price?, check?: { skill, dc? }, roleplay?, sell?, withdraw? } (Decision 6): an offer to one
  // character, set by hand or haggled with a check the engine rolls in the open; `roleplay` adds the store's bonus once.
  quote(s, a, ctx, ev) {
    dmOnly(ctx, 'quote a price');
    const shop = shopFor(s, a.shop, ctx, 'store'), e = ent(s, a.for), sell = a.sell === true;
    (a.sell === undefined || typeof a.sell === 'boolean') || fail('`sell` is true or false.');
    const market = marketOfShop(s, shop), env = marketEnv();
    let key, name, base, cap = null;
    if (sell) {
      const c = carried(e, a.item);
      key = c.key; name = c.name;
      const offer = sellOffer(c.thing, shop, market, env);
      base = offer?.cp ?? null; cap = offer?.cap ?? null;
    } else {
      a.item === undefined || fail('A quote to sell names a line of the shop; `item` is for an offer to buy (sell: true).');
      const line = lineFor(s, shop, a.line, ctx);
      key = line.id; name = lineName(line);
      base = listPrice(line, shop, market, env);
    }
    const had = (shop.quotes ?? []).find((q) => q.for === e.id && !!q.sell === sell && (sell ? q.item === key : q.line === key));
    const ref = sell ? { item: key } : { line: key };
    if (a.withdraw === true) {
      had || fail(`There is no offer to ${e.name} for ${name}.`);
      quoteGone(shop, e.id, key, sell);
      ev.push({ type: 'quoted', shop: shop.id, for: e.id, ...ref, name, price: null, was: had.price, ...(sell ? { sell } : {}), by: 'dm', withdrawn: true, ...heard(shop) });
      return;
    }
    const h = haggleOf(shop.haggle);
    let kept = false, price, by, check = null, steps = had?.steps ?? 0, roleplay = had?.roleplay === true, dc = null;
    if (a.price !== undefined) {
      (a.check === undefined && a.roleplay === undefined) || fail('A price set by hand is the price: no check, no bonus with it.');
      price = typeof a.price === 'string' ? parsePrice(a.price) : whole(a.price, 0, TRADE_LIMITS.coins * 100) ? a.price : null;
      (price !== null && price <= TRADE_LIMITS.coins * 100) || fail('A price reads like "15 GP", or is a whole number of copper pieces.');
      by = 'dm'; steps = 0; roleplay = false;
      had || (shop.quotes ?? []).length < TRADE_LIMITS.quotes || fail('This shop holds as many offers as it can.');
    } else {
      (a.check !== undefined || a.roleplay === true) || fail('Set a price, call for a check, or give the bonus for good roleplaying.');
      base !== null || fail(sell ? `${The(shop.name)} makes no offer of its own for ${name}: set a price.` : `${name} has no price here: set one.`);
      if (had?.by === 'dm' && a.check === undefined) fail('That price was set by hand; set it again, or call for a check.');
      if (a.roleplay !== undefined) { typeof a.roleplay === 'boolean' || fail('`roleplay` is true or false.'); }
      if (a.roleplay === true && roleplay && a.check === undefined) fail('The bonus for good roleplaying is in this price already.');
      had || (shop.quotes ?? []).length < TRADE_LIMITS.quotes || fail('This shop holds as many offers as it can.');
      if (a.check !== undefined) {
        isRec(a.check) || fail('A check names its skill.');
        const wkey = `${e.id}:${key}${sell ? ':sell' : ''}`, until = shop.waits?.[wkey];
        !(Number.isFinite(until) && until > s.clock) || fail(`${e.name} cannot haggle over ${name} again until a day has passed; set a price by hand instead.`);
        const keeperInt = typeof shop.keeper === 'string' ? s.entities[shop.keeper]?.abil?.int : undefined;
        dc = a.check.dc === undefined ? haggleDc(shop, keeperInt) : whole(a.check.dc, 1, 40) ? a.check.dc : fail('A DC is a whole number from 1 to 40.');
        const mark = ev.length;
        featureHandlers.check(s, { type: 'check', actor: e.id, skill: a.check.skill }, { role: 'dm' }, ev);
        const c = ev.slice(mark).find((x) => x.type === 'check');
        const r = haggle(base, c.total, dc, h.step, 0, sell ? { sell: true, cap } : {});
        steps = r.steps;
        check = { skill: a.check.skill, rolls: c.rolls ?? [c.roll], total: c.total };
        if (r.wait) { shop.waits = { ...(shop.waits ?? {}), [wkey]: s.clock + DAY }; }
      }
      if (a.roleplay === true) roleplay = true;
      const points = steps * h.step + (roleplay ? h.bonus : 0);
      price = pointsPrice(base, points, sell, cap);
      by = 'haggle';
      // A roll that goes worse than the offer already standing (a failed re-haggle) does not take that offer away: the earlier quote
      // stays as it was, and is what the event says.
      if (check && had && (sell ? price < had.price : price > had.price)) { kept = true; ({ price, by } = had); steps = had.steps ?? 0; roleplay = had.roleplay === true; }
    }
    if (!kept) shop.quotes = (shop.quotes ?? []).filter((q) => q !== had);
    if (kept) { /* the standing quote stays */ } else if (by === 'dm' || steps || roleplay) {
      shop.quotes.push({ id: `q${(shop.seq = (shop.seq ?? 0) + 1)}`, ...ref, for: e.id, price, ...(sell ? { sell: true } : {}), by, ...(steps ? { steps } : {}), ...(roleplay ? { roleplay: true } : {}) });
    }
    ev.push({ type: 'quoted', shop: shop.id, for: e.id, ...ref, name, price, was: base, ...(sell ? { sell } : {}), by, ...(check ? { check } : {}),
      ...(dc !== null ? { dc } : {}), steps, ...(roleplay ? { roleplay: true } : {}), ...heard(shop) });
  },
  // { type: 'buy', actor, shop, line, qty?, pay?, split? } or { type: 'buy', actor, shop, joint, cancel? } (Decision 5).
  buy(s, a, ctx, ev) {
    const shop = shopFor(s, a.shop, ctx, 'store'), e = ent(s, a.actor);
    shopper(s, e, ctx);
    if (a.joint !== undefined) return settleJoint(s, shop, e, a, ctx, ev);
    where(s, shop, e, ctx);
    const line = lineFor(s, shop, a.line, ctx);
    const left = leftOf(shop, line), qty = qtyArg(a.qty, left ?? TRADE_LIMITS.qty);
    const unit = unitPrice(s, shop, line, e.id);
    unit !== null || fail(`${lineName(line)} has no price here; ask the DM.`);
    const name = lineName(line);
    if (a.split !== undefined) {
      a.split === true || fail('`split` is true: a purchase several pay together.');
      a.pay === undefined || fail('A purchase paid together is paid in shares, not with named coins.');
      (shop.joint ?? []).length < TRADE_LIMITS.joint || fail(`${The(shop.name)} has ${TRADE_LIMITS.joint} purchases being paid together already.`);
      const j = { id: `j${(shop.seq = (shop.seq ?? 0) + 1)}`, line: line.id, qty, price: unit, buyer: e.id, pledges: {} };
      shop.joint = [...(shop.joint ?? []), j];
      ev.push({ type: 'jointOpened', shop: shop.id, joint: j.id, line: line.id, name, qty, price: unit, buyer: e.id, ...heard(shop) });
      return;
    }
    const total = qty * unit, purse = purseOf(e);
    const r = pay(purse, total, a.pay);
    if (!r.ok) fail(r.have !== undefined && a.pay === undefined ? `${e.name} has ${formatCoins(purse)}; ${withQty(name, qty)} costs ${formatCp(total)}.` : r.error);
    capped(e, r.purse);
    const gear = land(s, e, line, qty, 'buy');               // the one step that may refuse: before any coin moves
    const me = s.entities[e.id];                             // a sheet remade is a new record
    setPurse(me, r.purse);
    stockDown(shop, line, qty);
    quoteGone(shop, me.id, line.id, false);
    ev.push({ type: 'bought', shop: shop.id, id: me.id, line: line.id, name, qty, price: total, paid: r.taken, change: r.change, ...heard(shop) });
    ev.push({ type: 'coins', id: me.id, coins: { ...(me.coins ?? {}) }, why: 'buy' }, ...gear);
  },
  // { type: 'chipIn', actor, shop, joint, share }: a character's share of a joint purchase in copper pieces' worth; 0 takes it back.
  // Taking a pledge back (`share: 0`) may be done from anywhere, down or in a fight: it only takes away a promise.
  chipIn(s, a, ctx, ev) {
    const shop = shopFor(s, a.shop, ctx, 'store'), e = ent(s, a.actor);
    if (a.share === 0) control(s, e, ctx);
    else { shopper(s, e, ctx); where(s, shop, e, ctx); }
    const j = (shop.joint ?? []).find((x) => x.id === a.joint) || fail('No such purchase.');
    e.id !== j.buyer || fail(`${e.name} is the buyer and pays what the others have not pledged.`);
    const total = j.qty * j.price;
    whole(a.share, 0, total) || fail(`A share is a whole number of copper pieces from 0 to ${total}.`);
    if (a.share > 0) {
      a.share <= purseCp(purseOf(e)) || fail(`${e.name} has ${formatCoins(purseOf(e))}; the share is ${formatCp(a.share)}.`);
      const others = Object.entries(j.pledges).filter(([k]) => k !== e.id).reduce((n, [, v]) => n + v, 0);
      others + a.share <= total || fail(`The pledges would come to ${formatCp(others + a.share)}; the price is ${formatCp(total)}.`);
      j.pledges = { ...Object.fromEntries(Object.entries(j.pledges).filter(([k]) => k !== e.id)), [e.id]: a.share };
    } else {
      own(j.pledges, e.id) || fail(`${e.name} has pledged nothing towards ${lineName(findLine(shop, marketOfShop(s, shop), j.line) ?? {})}.`);
      j.pledges = Object.fromEntries(Object.entries(j.pledges).filter(([k]) => k !== e.id));
    }
    ev.push({ type: 'pledged', shop: shop.id, joint: j.id, who: e.id, share: a.share, ...heard(shop) });
  },
  // { type: 'sell', actor, shop, item, qty? }: `item` is a key on the sheet ("i3") or a name in `gear` (Decision 5, Selling).
  sell(s, a, ctx, ev) {
    const shop = shopFor(s, a.shop, ctx, 'store'), e = ent(s, a.actor);
    shopper(s, e, ctx);
    where(s, shop, e, ctx);
    const c = carried(e, a.item);
    const qty = c.x ? qtyArg(a.qty, 1) : qtyArg(a.qty, (e.gear ?? []).filter((n) => String(n).toLowerCase() === c.key.toLowerCase()).length);
    if (c.x) (c.x.equipped !== true && c.x.attuned !== true) || fail(`Take ${c.name} off first.`);
    const q = (shop.quotes ?? []).find((x) => x.sell && x.for === e.id && x.item === c.key);
    const unit = q ? q.price : sellOffer(c.thing, shop, marketOfShop(s, shop), marketEnv())?.cp ?? null;
    unit !== null || fail(`${The(shop.name)} makes no offer for ${c.name}. Ask the DM.`);
    const total = unit * qty, after = capped(e, addCoins(purseOf(e), change(total)));
    let me = e;
    if (c.x) {
      const sheet = structuredClone(e.sheet);
      sheet.items = sheet.items.filter((x) => x.id !== c.key);
      if (sheet.attuning?.item === c.key) delete sheet.attuning;
      if (!sheet.items.length) delete sheet.items;
      resheet(s, e, sheet, ev);
      me = s.entities[e.id];
    } else {
      for (let n = 0; n < qty; n++) me.gear.splice(me.gear.findIndex((g) => String(g).toLowerCase() === c.key.toLowerCase()), 1);
    }
    setPurse(me, after);
    quoteGone(shop, me.id, c.key, true);
    ev.push({ type: 'sold', shop: shop.id, id: me.id, item: c.key, name: c.name, qty, price: total, ...heard(shop) });
    ev.push({ type: 'coins', id: me.id, coins: { ...(me.coins ?? {}) }, why: 'sell' });
    ev.push({ type: 'gear', id: me.id, item: c.name, ...(c.x ? { key: c.key, pack: c.x.item } : {}), why: 'sell', taken: true });
  },
  // { type: 'take', actor, shop, line, qty? } or { type: 'take', actor, shop, coins }; the DM also { type: 'take', shop, split: [ids] } (Decision 7).
  take(s, a, ctx, ev) {
    if (a.split !== undefined) {
      dmOnly(ctx, 'share out a package');
      const shop = shopFor(s, a.shop, ctx, 'loot');
      (Array.isArray(a.split) && a.split.length >= 1 && a.split.length <= 12 && new Set(a.split).size === a.split.length) || fail('Name the characters to share it among.');
      const who = a.split.map((id) => ent(s, id));
      const p = cleanPurse(shop.coins) ?? {};
      Object.keys(p).length || fail(`${The(shop.name)} holds no coins.`);
      const each = {}, left = {};
      for (const k of COINS) if (p[k]) { const n = Math.floor(p[k] / who.length); if (n) each[k] = n; if (p[k] - n * who.length) left[k] = p[k] - n * who.length; }
      Object.keys(each).length || fail(`There are too few coins in ${the(shop.name)} to share among ${who.length}.`);
      const after = who.map((x) => capped(x, addCoins(purseOf(x), each)));
      shop.coins = left;
      ev.push({ type: 'took', shop: shop.id, split: who.map((x) => x.id), each, left, ...heard(shop) });
      who.forEach((x, i) => setPurse(x, after[i]));
      for (const x of who) { ev.push({ type: 'coins', id: x.id, coins: { ...(x.coins ?? {}) }, why: 'take' }); }
      return;
    }
    const shop = shopFor(s, a.shop, ctx, 'loot'), e = ent(s, a.actor);
    shopper(s, e, ctx);
    where(s, shop, e, ctx);
    if (a.coins !== undefined) {
      a.line === undefined || fail('Take coins or a line, one at a time.');
      const want = coinsArg(a.coins), p = cleanPurse(shop.coins) ?? {};
      for (const k of Object.keys(want)) want[k] <= (p[k] ?? 0) || fail(`${The(shop.name)} holds no ${want[k]} ${k.toUpperCase()}.`);
      const mine = capped(e, addCoins(purseOf(e), want));
      for (const k of Object.keys(want)) { p[k] -= want[k]; if (!p[k]) delete p[k]; }
      shop.coins = p;
      setPurse(e, mine);
      ev.push({ type: 'took', shop: shop.id, id: e.id, coins: want, ...heard(shop) });
      ev.push({ type: 'coins', id: e.id, coins: { ...(e.coins ?? {}) }, why: 'take' });
      return;
    }
    // A line on the shelf as `viewShops` shows it (not taken off, not hidden; how many by its override first), and its stock taken down as a
    // store's is (`stockDown`). At none left the line goes, with its override.
    const line = (shop.lines ?? []).find((l) => l.id === a.line);
    (line && onShelf(shop, line)) || fail('No such item.');
    const qty = qtyArg(a.qty, leftOf(shop, line) ?? 1);
    const gear = land(s, e, line, qty, 'take');
    if (leftOf(shop, line) === undefined) line.qty = 1;
    stockDown(shop, line, qty);
    if (leftOf(shop, line) <= 0) { shop.lines = shop.lines.filter((l) => l !== line); if (shop.overrides) delete shop.overrides[line.id]; }
    ev.push({ type: 'took', shop: shop.id, id: e.id, line: line.id, name: lineName(line), qty, ...heard(shop) }, ...gear);
  },
};

// Pays (or cancels) a joint purchase: `buy { actor, shop, joint, cancel? }`. Settling is all or nothing (Decision 5, Paying together).
function settleJoint(s, shop, e, a, ctx, ev) {
  const j = (shop.joint ?? []).find((x) => x.id === a.joint) || fail('No such purchase.');
  const buyer = s.entities[j.buyer];
  e.id === j.buyer || fail(`Only ${buyer?.name ?? 'the buyer'} can ${a.cancel === true ? 'call it off' : 'pay'}.`);
  if (a.cancel === true) { endJoint(shop, j, 'cancelled', ev); return; }
  a.cancel === undefined || fail('`cancel` is true, or left out.');
  const line = findLine(shop, marketOfShop(s, shop), j.line);
  (line && onShelf(shop, line)) || fail('No such item.');
  const left = leftOf(shop, line);
  left === undefined || left >= j.qty || fail(left === 0 ? 'Sold out.' : `Only ${left} left.`);
  const payers = [...Object.keys(j.pledges), j.buyer].map((id) => s.entities[id] || fail('No such creature.'));
  if (!dm(ctx)) for (const p of payers) { up(p) || fail(`${p.name} is down.`); where(s, shop, p, ctx); }
  const purses = Object.fromEntries(payers.map((p) => [p.id, purseOf(p)])), names = Object.fromEntries(payers.map((p) => [p.id, p.name]));
  const r = settle(j, purses, names);
  if (!r.ok) fail(r.error.replace('; the share is', `; ${r.who === j.buyer ? 'their' : 'the'} share is`));
  for (const p of r.payers) capped(s.entities[p.id], p.purse);
  const gear = land(s, buyer, line, j.qty, 'buy');
  for (const p of r.payers) setPurse(s.entities[p.id], p.purse);
  stockDown(shop, line, j.qty);
  quoteGone(shop, j.buyer, line.id, false);
  shop.joint = (shop.joint ?? []).filter((x) => x !== j);
  const name = lineName(line);
  ev.push({ type: 'bought', shop: shop.id, id: j.buyer, line: line.id, name, qty: j.qty, price: r.total, joint: j.id, payers: r.payers.map((p) => ({ id: p.id, paid: p.share, change: p.change })), ...heard(shop) });
  ev.push({ type: 'jointEnded', shop: shop.id, joint: j.id, why: 'paid', ...heard(shop) });
  for (const p of r.payers) ev.push({ type: 'coins', id: p.id, coins: { ...(s.entities[p.id].coins ?? {}) }, why: 'buy' });
  ev.push(...gear);
}
