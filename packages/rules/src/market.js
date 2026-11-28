// The market document and the money arithmetic of shops (docs/specs/shops.md: Decisions 1, 2, 5 and 6; task P2).
// Pure and importing nothing, so any module of the rules may use it and it adds no import cycle. Nothing here keeps state:
// every function takes what it needs and returns a new value, so the engine's `buy`, `sell` and `quote` (P3) are thin over it.
//
// What the content supplies is passed in as `env`, so this module reads no pack and tests can stub it:
//   env.item(id)          -> { name, kind: 'weapon' | 'armour' | 'magic', cost?: '15 GP', rarity?, consumable?: true, scroll?: true,
//                              needs?: ['base' | 'type' | 'spell'] }, or a falsy value for an id the table does not have
//   env.rarityValue(r)    -> the Magic Item Rarities and Values entry for a rarity, in copper pieces; null for an Artifact
//   env.scrollCost(level) -> the Spell Scroll Costs entry for a spell level (0 for a cantrip), in copper pieces (the scribing cost)
//   env.spellLevel(id)    -> a spell's level, or a falsy value for a spell the table does not have
// `lintMarket` runs its structural checks with no `env` and adds the checks against the table's content when it has one.

export const MARKET_FORMAT = 'hextable-market';
export const MARKET_V = 1;
export const MARKET_LIMITS = {
  lists: 20, lines: 300, stores: 30, loot: 30, specials: 40, lootLines: 100,
  name: 60, text: 300, note: 120, qty: 9999, maxGp: 10_000_000, lineBytes: 128 * 1024, artBytes: 1024 * 1024, problems: 40,
};
export const COINS = ['cp', 'sp', 'ep', 'gp', 'pp'];                                  // smallest to largest
export const COIN_CP = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };                   // Coin Values, in copper pieces
export const LINE_KINDS = ['gear', 'trade', 'valuable', 'magic', 'weapon', 'armour'];
export const ASSET_TYPES = ['image/png', 'image/jpeg', 'image/webp'];                   // the image types the table server allows
const MAX_CP = MARKET_LIMITS.maxGp * COIN_CP.gp;
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ASSET_ID = /^[A-Za-z0-9_-]{8,64}$/;                                             // as map.js; kept here so this module imports nothing
const ICON = /^icon:[a-z0-9]+(-[a-z0-9]+)*$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isRec = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const whole = (n, lo, hi) => Number.isSafeInteger(n) && n >= lo && n <= hi;

// ---- Coins and prices -------------------------------------------------------------------------------------------------------------

const group = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// "15 GP", "5 SP", "1,500 GP" (the form of `cost` in equipment.js) as whole copper pieces, or null for anything else.
export function parsePrice(s) {
  if (typeof s !== 'string') return null;
  const m = /^\s*(\d{1,3}(?:,\d{3})+|\d{1,12})\s*(CP|SP|EP|GP|PP)\s*$/i.exec(s);
  if (!m) return null;
  return Number(m[1].replace(/,/g, '')) * COIN_CP[m[2].toLowerCase()];
}
// Copper pieces as the shopkeeper would say them: 1247 is "12 GP 4 SP 7 CP"; 0 is "0 CP". Gold is the largest kind named.
export function formatCp(cp) {
  if (!whole(cp, 0, Number.MAX_SAFE_INTEGER)) return '?';
  const gp = Math.floor(cp / 100), sp = Math.floor((cp % 100) / 10), c = cp % 10;
  const out = [gp && `${group(gp)} GP`, sp && `${sp} SP`, c && `${c} CP`].filter(Boolean);
  return out.length ? out.join(' ') : '0 CP';
}
// A purse as the coins it holds, largest first ("3 GP 2 SP"), or "no coins".
export function formatCoins(purse) {
  const out = [];
  for (const k of [...COINS].reverse()) if (purse?.[k] > 0) out.push(`${group(purse[k])} ${k.toUpperCase()}`);
  return out.length ? out.join(' ') : 'no coins';
}
// A purse is { cp, sp, ep, gp, pp }, only the kinds held, each a whole number of coins. Returns a clean copy (zeros dropped), or null.
export function cleanPurse(p) {
  if (p === undefined || p === null) return {};
  if (!isRec(p)) return null;
  const out = {};
  for (const k of Object.keys(p)) {
    if (!COINS.includes(k) || !whole(p[k], 0, MAX_CP)) return null;
    if (p[k] > 0) out[k] = p[k];
  }
  return out;
}
export const purseCp = (purse) => COINS.reduce((s, k) => s + (purse?.[k] ?? 0) * COIN_CP[k], 0);

// Change in the largest coins first: platinum, gold, silver, copper. Never electrum (shops are not obliged to hold it). `{}` for 0, null for a bad amount.
export function change(cp) {
  if (!whole(cp, 0, Number.MAX_SAFE_INTEGER)) return null;
  const out = {};
  let rest = cp;
  for (const k of ['pp', 'gp', 'sp', 'cp']) {
    const n = Math.floor(rest / COIN_CP[k]);
    if (n > 0) { out[k] = n; rest -= n * COIN_CP[k]; }
  }
  return out;
}

// Pays `cp` out of a purse. By default from the smallest coins up, taking of each kind only what is still needed (so a kind is taken
// as far as the price needs, rounded up to a whole coin); the overpayment comes back as change in the largest coins. `named` ({ gp: 5 })
// pays with exactly those coins, which the purse must hold and which must cover the price. The purse given is not changed.
// Returns { ok: true, taken, change, paid, changeCp, purse } (paid is the value of the coins taken; purse is the purse afterwards),
// or { ok: false, error, have?, need? } and nothing has moved.
export function pay(purse, cp, named) {
  const have = cleanPurse(purse);
  if (!have) return { ok: false, error: 'The purse is not a purse.' };
  if (!whole(cp, 0, MAX_CP)) return { ok: false, error: 'The price is not a whole number of copper pieces.' };
  let taken = {};
  if (named !== undefined) {
    const n = cleanPurse(named);
    if (!n) return { ok: false, error: 'The coins offered are not coins.' };
    for (const k of Object.keys(n)) if (n[k] > (have[k] ?? 0)) return { ok: false, error: `The purse has no ${group(n[k])} ${k.toUpperCase()} to pay with.` };
    if (purseCp(n) < cp) return { ok: false, error: `${formatCoins(n)} does not cover ${formatCp(cp)}.`, have: purseCp(n), need: cp };
    taken = n;
  } else {
    const total = purseCp(have);
    if (total < cp) return { ok: false, error: `The purse holds ${formatCoins(have)}; ${formatCp(cp)} is needed.`, have: total, need: cp };
    let rest = cp;
    for (const k of COINS) {
      if (rest <= 0) break;
      const n = Math.min(have[k] ?? 0, Math.ceil(rest / COIN_CP[k]));
      if (n > 0) { taken[k] = n; rest -= n * COIN_CP[k]; }
    }
  }
  const paid = purseCp(taken), changeCp = paid - cp, back = change(changeCp);
  const after = { ...have };
  for (const k of Object.keys(taken)) after[k] -= taken[k];
  for (const k of Object.keys(back)) after[k] = (after[k] ?? 0) + back[k];
  for (const k of Object.keys(after)) if (after[k] === 0) delete after[k];
  return { ok: true, taken, change: back, paid, changeCp, purse: after };
}

// ---- Store settings with their defaults ------------------------------------------------------------------------------------------

// What a store pays when the party sells, as a percent of value: equipment 50, trade goods and valuables 100, magic items 70
// (the owner's answer, 15 November). `null` is kept: that store makes no offer of its own for that kind.
export function buysOf(buys) {
  const b = isRec(buys) ? buys : {};
  const pick = (k, d) => (b[k] === undefined ? d : b[k]);
  return { equipment: pick('equipment', 50), trade: pick('trade', 100), magic: pick('magic', 70) };
}
// The haggle settings of a store: the step in percent, the DC that replaces 15, the roleplaying bonus in points.
export function haggleOf(h) {
  const x = isRec(h) ? h : {};
  return { step: x.step ?? 10, dc: x.dc ?? 15, bonus: x.bonus ?? 5 };
}
// The default DC of a haggle: the Influence action's, 15 (or the store's own) or the keeper's Intelligence score, whichever is higher.
export const haggleDc = (shop, keeperInt) => Math.max(haggleOf(shop?.haggle).dc, Number.isInteger(keeperInt) ? keeperInt : 0);

// ---- Lines and list prices (Decision 5) ---------------------------------------------------------------------------------------

// A line by id: the shop's own lines first, then the lines of the lists it names in its market.
export function findLine(shop, market, id) {
  const own_ = (shop?.lines ?? []).find((l) => l?.id === id);
  if (own_) return own_;
  for (const lid of shop?.lists ?? []) {
    const l = (market?.lists ?? []).find((x) => x?.id === lid)?.lines?.find((x) => x?.id === id);
    if (l) return l;
  }
  return null;
}
const resolve = (shop, market, line) => (typeof line === 'string' ? findLine(shop, market, line) : line);

// What kind of goods a line is: its own `kind`, else what its pack item is, else plain gear.
export const kindOf = (line, env) => line?.kind ?? env?.item?.(line?.item)?.kind ?? 'gear';

// The SRD's value of a line's item, in copper pieces (steps 2 and 3 of the list price): a weapon or armour at its cost; a magic item at its
// rarity's value, halved (rounded up) for a consumable that is not a Spell Scroll; a Spell Scroll at double the scribing cost of its spell's
// level; plus the cost of its `base`. Null when the line has no item, the pack has no price for it, or it is an Artifact.
export function unitValue(line, env) {
  const it = line?.item ? env?.item?.(line.item) : null;
  if (!it) return null;
  if (it.kind === 'weapon' || it.kind === 'armour') return parsePrice(it.cost);
  if (it.kind !== 'magic' || it.noSale) return null;
  let v;
  if (it.scroll) {
    const lvl = env.spellLevel?.(line.spell);
    if (!Number.isInteger(lvl)) return null;
    const c = env.scrollCost?.(lvl);
    v = Number.isInteger(c) ? c * 2 : null;
  } else {
    v = env.rarityValue?.(it.rarity);
    if (Number.isInteger(v) && it.consumable) v = Math.ceil(v / 2);
  }
  if (!Number.isInteger(v)) return null;
  if (line.base) {
    const b = parsePrice(env.item?.(line.base)?.cost);
    if (b === null) return null;
    v += b;
  }
  return v;
}
// A price a shop or a line states, as copper pieces: a string like a cost, or a whole number of copper pieces.
const stated = (p) => (typeof p === 'string' ? parsePrice(p) : whole(p, 1, MAX_CP) ? p : null);

// The price before the shop's markup: the shop's override, else the line's own `price`, else the value. `own` says the price is a stated one,
// which the markup does not touch. Null when there is none.
export function basePrice(line, shop, market, env) {
  const l = resolve(shop, market, line);
  if (!l) return null;
  const ov = stated(shop?.overrides?.[l.id]?.price) ?? stated(l.price);
  if (ov !== null) return { cp: ov, own: true };
  const v = unitValue(l, env);
  return v === null ? null : { cp: v, own: false };
}
// The price a shop asks for one of a line, in copper pieces, rounded up: a stated price is final; a value is marked up by the shop's `markup`
// (percent, 100 is list). Null when there is no price. A standing quote is the engine's to apply over this.
export function listPrice(line, shop, market, env) {
  const b = basePrice(line, shop, market, env);
  if (!b) return null;
  if (b.own) return b.cp;
  const markup = shop?.markup ?? 100;
  return Math.max(1, Math.ceil((b.cp * markup) / 100));
}

// ---- Selling to a store (Decision 5) ------------------------------------------------------------------------------------------

const bucket = (kind) => (kind === 'magic' ? 'magic' : kind === 'trade' || kind === 'valuable' ? 'trade' : 'equipment');
const sameGoods = (l, thing) => (l.item ? l.item === thing.item : !thing.item && typeof thing.name === 'string' && typeof l.name === 'string' && l.name.toLowerCase() === thing.name.toLowerCase());

// What a store offers by itself for something the party carries: `thing` is { item?, name?, base?, spell?, kind? }.
// Magic items: `buys.magic` percent of the SRD value (never the shop's markup or a line's own price; no offer when `buys.magic` is null or
// the item has no value, as an Artifact). Otherwise a line of the shop for the same goods: its price before markup times `buys` for its kind;
// otherwise a weapon or armour of the pack at its cost times `buys.equipment`. Rounded down to a whole copper piece.
// Returns { cp, cap, basis: 'magic' | 'line' | 'equipment' } or null for no offer. `cap` is what a haggle may not lift the offer above:
// the item's value, or for a line the store's own price for it. The DM's price (a quote) always wins and is not this function's business.
export function sellOffer(thing, shop, market, env) {
  if (!isRec(thing)) return null;
  const buys = buysOf(shop?.buys), it = thing.item ? env?.item?.(thing.item) : null;
  const kind = it?.kind ?? thing.kind ?? 'gear';
  const out = (pct, v, cap, basis) => {
    if (pct === null || pct === undefined || v === null || v === undefined) return null;
    const cp = Math.floor((v * pct) / 100);
    return cp >= 1 ? { cp, cap: Math.max(cap ?? v, cp), basis } : null;
  };
  if (kind === 'magic') {
    const v = unitValue({ item: thing.item, base: thing.base, spell: thing.spell }, env);
    return out(buys.magic, v, v, 'magic');
  }
  const lines = [...(shop?.lines ?? []), ...(shop?.lists ?? []).flatMap((lid) => (market?.lists ?? []).find((x) => x?.id === lid)?.lines ?? [])];
  const line = lines.find((l) => l && !shop?.overrides?.[l.id]?.gone && sameGoods(l, thing));
  if (line) {
    const b = basePrice(line, shop, market, env);
    return b && out(buys[bucket(kindOf(line, env))], b.cp, listPrice(line, shop, market, env), 'line');
  }
  if (it && (it.kind === 'weapon' || it.kind === 'armour')) {
    const v = parsePrice(it.cost);
    return out(buys.equipment, v, v, 'equipment');
  }
  return null;
}

// ---- Haggling (Decision 6) ----------------------------------------------------------------------------------------------------

// A haggle turns a check into a price. `price` is the list price (a sell offer, for a haggle over what the party sells); `total` is the
// check's total, or null for no roll (the roleplaying bonus alone); `dc`; `step` is the store's step in percent; `bonus` is the points
// for good roleplaying (0 when not pressed). One step off for a total at or above the DC, two at or above the DC + 10, none below.
// Steps and bonus are percent points of the list price and add together: the price is `price` times (100 - steps*step - bonus) percent,
// rounded up to a whole copper piece, never below 1 CP. For a sell offer (`opts.sell`) the same points go up: (100 + points) percent, rounded
// up, and never above `opts.cap` (the item's value or the store's own price: no buying low and selling high in a loop).
// A total below the DC sets `wait`: the Influence action's wait, which the bonus does not lift. Returns { price, was, steps, points, wait }.
export function haggle(price, total, dc, step, bonus = 0, opts = {}) {
  if (!whole(price, 1, MAX_CP) || !(total === null || total === undefined || Number.isSafeInteger(total)) || !whole(dc, 1, 100) || !whole(step, 0, 100) || !whole(bonus, 0, 100)) return null;
  const rolled = total !== null && total !== undefined;
  const steps = !rolled ? 0 : total >= dc + 10 ? 2 : total >= dc ? 1 : 0;
  const points = steps * step + bonus;
  let p;
  if (opts.sell) {
    p = Math.ceil((price * (100 + points)) / 100);
    if (Number.isSafeInteger(opts.cap)) p = Math.max(price, Math.min(p, opts.cap));
  } else {
    p = Math.max(1, Math.ceil((price * Math.max(0, 100 - points)) / 100));
  }
  return { price: p, was: price, steps, points, wait: rolled && total < dc };
}

// ---- Paying together (Decision 5) ---------------------------------------------------------------------------------------------

// Settles a joint purchase all or nothing. `joint` is { qty, price, buyer, pledges: { [creature]: copper } } (price is for one; the whole
// is qty times price); `purses` is { [creature]: purse } for the buyer and every pledger; `names` is an optional { [creature]: name } for
// the sentences. The buyer's share is what nobody else has pledged, so a buyer does not pledge. Every payer pays as `pay` pays.
// Returns { ok: true, total, shares: { id: cp }, payers: [ { id, share, taken, change, paid, purse } ] }, or { ok: false, error, who? }.
// Nothing given is changed; on a refusal nothing has moved.
export function settle(joint, purses, names = {}) {
  const say = (e, who) => ({ ok: false, error: e, ...(who && { who }) });
  const nm = (id) => (typeof names?.[id] === 'string' ? names[id] : id);
  if (!isRec(joint) || !whole(joint.qty, 1, 99) || !whole(joint.price, 0, MAX_CP) || typeof joint.buyer !== 'string' || !joint.buyer) return say('That is not a joint purchase.');
  const pledges = joint.pledges ?? {};
  if (!isRec(pledges) || !isRec(purses)) return say('That is not a joint purchase.');
  const total = joint.qty * joint.price;
  if (!whole(total, 0, MAX_CP)) return say('The price is out of range.');
  if (own(pledges, joint.buyer)) return say(`${nm(joint.buyer)} is the buyer and pays what the others have not pledged.`, joint.buyer);
  let pledged = 0;
  for (const id of Object.keys(pledges)) {
    const s = pledges[id];
    if (!whole(s, 1, total)) return say(`${nm(id)}'s share is not a whole number of copper pieces between 1 and the price.`, id);
    pledged += s;
  }
  if (pledged > total) return say(`The pledges come to ${formatCp(pledged)}; the price is ${formatCp(total)}.`);
  const shares = { ...pledges, [joint.buyer]: total - pledged };
  const payers = [...Object.keys(pledges), joint.buyer];                            // the buyer last: the others in the order they pledged
  const done = [];
  for (const id of payers) {
    const r = pay(own(purses, id) ? purses[id] : undefined, shares[id]);
    if (!r.ok) return say(r.have === undefined ? r.error : `${nm(id)} has ${formatCoins(cleanPurse(purses[id]) ?? {})}; the share is ${formatCp(shares[id])}.`, id);
    done.push({ id, share: shares[id], taken: r.taken, change: r.change, paid: r.paid, purse: r.purse });
  }
  return { ok: true, total, shares, payers: done };
}

// ---- The document: migration and linter (Decision 2) ---------------------------------------------------------------------------

// Brings a market document up to date; safe to run on any document, any number of times. A document of a newer format than this build
// reads, or one that is not a record, is left as it is for the linter to refuse. Format 1 has only its arrays to fill.
export function migrateMarket(doc) {
  if (!isRec(doc)) return doc;
  if (typeof doc.v === 'number' && doc.v > MARKET_V) return doc;
  const out = { ...doc };
  for (const k of ['lists', 'stores', 'loot']) if (out[k] === undefined) out[k] = [];
  return out;
}

const LINE_KEYS = ['id', 'item', 'base', 'type', 'spell', 'name', 'price', 'qty', 'kind', 'art', 'hidden', 'note'];
const DOC_KEYS = ['format', 'v', 'id', 'name', 'version', 'lists', 'stores', 'loot', 'assets', 'notes'];
const LIST_KEYS = ['id', 'name', 'lines'];
const STORE_KEYS = ['id', 'name', 'blurb', 'lists', 'markup', 'buys', 'haggle', 'special', 'art'];
const LOOT_KEYS = ['id', 'name', 'blurb', 'art', 'lines', 'coins'];
const BUYS_KEYS = ['equipment', 'trade', 'magic'];
const HAGGLE_KEYS = ['step', 'dc', 'bonus'];
const BAD_KEYS = ['__proto__', 'constructor', 'prototype'];

// What is wrong with a market document, as a list of sentences (empty: it can be imported). Each begins with where it is, in the form
// `stores/outfitter/special/wand: no such item "wand-of-magic-misiles"`. Without `env` only the document itself is checked; with it, every
// item, spell and base is checked against the table's content, and a line with no price of its own must have one in the pack.
export function lintMarket(doc, env) {
  const bad = [];
  const say = (where, msg) => { if (bad.length < MARKET_LIMITS.problems) bad.push(where ? `${where}: ${msg}` : msg); else if (bad.length === MARKET_LIMITS.problems) bad.push('There are more problems than these.'); };
  if (!isRec(doc)) return ['It is not a market document.'];
  if (doc.format !== MARKET_FORMAT) return [`Its format is ${JSON.stringify(doc.format)}; this game reads "${MARKET_FORMAT}".`];
  if (typeof doc.v === 'number' && doc.v > MARKET_V) return [`It is version ${doc.v} of the format; this game reads version ${MARKET_V}.`];
  if (doc.v !== MARKET_V) return [`Its format version is ${JSON.stringify(doc.v)}; this game reads ${MARKET_V}.`];
  let bytes = 0;
  try { bytes = new TextEncoder().encode(JSON.stringify({ ...doc, assets: undefined })).length; } catch { return ['It is not plain data.']; }
  if (bytes > MARKET_LIMITS.lineBytes) say('', `Its lists and stores take ${Math.ceil(bytes / 1024)} KB; the most is ${MARKET_LIMITS.lineBytes / 1024} KB without pictures.`);

  // ---- helpers over one value
  const keys = (o, allowed, where) => {
    for (const k of Object.keys(o)) {
      if (BAD_KEYS.includes(k)) say(where, `"${k}" is not allowed.`);
      else if (!allowed.includes(k)) say(where, `"${k}" is not something this has; it has ${allowed.join(', ')}.`);
    }
  };
  const text = (v, where, what, max, need = true) => {
    if (v === undefined) { if (need) say(where, `${what} is missing.`); return false; }
    if (typeof v !== 'string' || (need && !v.trim())) { say(where, `${what} must be text${need ? ' that is not empty' : ''}.`); return false; }
    if (v.length > max) { say(where, `${what} is longer than ${max} letters.`); return false; }
    if (CONTROL.test(v)) { say(where, `${what} has a control character.`); return false; }
    return true;
  };
  const id = (v, where, what = 'id') => {
    if (typeof v !== 'string' || !ID.test(v) || v.length > MARKET_LIMITS.name) { say(where, `${what} must be lower-case words joined by hyphens, up to ${MARKET_LIMITS.name} letters.`); return false; }
    return true;
  };
  const arr = (v, where, what, max) => {
    if (!Array.isArray(v)) { say(where, `${what} must be a list.`); return false; }
    if (v.length > max) { say(where, `${what} has more than ${max}.`); return false; }
    return true;
  };

  // ---- assets
  const assets = new Set();
  if (doc.assets !== undefined) {
    if (!isRec(doc.assets)) say('assets', 'must be a record of pictures.');
    else {
      let art = 0;
      for (const [aid, a] of Object.entries(doc.assets)) {
        const w = `assets/${aid.slice(0, 20)}`;
        if (!ASSET_ID.test(aid)) { say(w, 'is not a picture id (8 to 64 letters, digits, - or _).'); continue; }
        if (!isRec(a)) { say(w, 'is not a record of type and data.'); continue; }
        assets.add(aid);
        keys(a, ['type', 'data'], w);
        if (!ASSET_TYPES.includes(a.type)) say(w, `has type ${JSON.stringify(a.type)}; a picture is ${ASSET_TYPES.join(', ')}.`);
        if (typeof a.data !== 'string' || !a.data.length || !BASE64.test(a.data) || a.data.length % 4 !== 0) { say(w, 'has data that is not base64.'); continue; }
        art += Math.floor((a.data.length * 3) / 4) - (a.data.endsWith('==') ? 2 : a.data.endsWith('=') ? 1 : 0);
      }
      if (art > MARKET_LIMITS.artBytes) say('assets', `The pictures take ${Math.ceil(art / 1024)} KB; the most is ${MARKET_LIMITS.artBytes / 1024} KB.`);
    }
  }
  const artOf = (v, where) => {
    if (v === undefined) return;
    if (typeof v !== 'string') return say(where, 'art must be a picture id or icon:<name>.');
    if (ICON.test(v) && v.length <= 40) return;
    if (!ASSET_ID.test(v)) return say(where, `art ${JSON.stringify(v.slice(0, 40))} is neither a picture id nor icon:<name>.`);
    if (!assets.has(v)) say(where, `art "${v}" is not among the document's pictures.`);
  };

  // ---- header
  keys(doc, DOC_KEYS, '');
  id(doc.id, 'id', 'The pack id');
  text(doc.name, 'name', 'The name', MARKET_LIMITS.name);
  if (!whole(doc.version, 1, 999999)) say('version', 'must be a whole number from 1; it rises on each export.');
  if (doc.notes !== undefined) text(doc.notes, 'notes', 'The notes', MARKET_LIMITS.text, false);

  // ---- lines
  const packIds = new Set();                                                            // line ids, lists and specials together
  const line = (l, where, kind, seen, idx) => {
    if (!isRec(l)) return say(`${where}/#${idx}`, 'is not a line.');
    const at = typeof l.id === 'string' && ID.test(l.id) ? `${where}/${l.id}` : `${where}/#${idx}`;
    keys(l, LINE_KEYS, at);
    if (id(l.id, at)) {
      if (seen.has(l.id)) say(at, kind === 'loot' ? 'id is used twice in this package.' : 'id is used twice in the pack (lists and specials share one set of ids).');
      seen.add(l.id);
    }
    const unpriced = kind === 'loot';
    let flawed = false;                                                                 // a problem with the item itself: its price is not worth checking
    const flaw = (msg) => { flawed = true; say(at, msg); };
    if (l.item === undefined && l.name === undefined) say(at, 'needs an item or a name.');
    if (l.name !== undefined) text(l.name, at, 'name', MARKET_LIMITS.name);
    let it = null;
    if (l.item !== undefined) {
      if (id(l.item, at, 'item')) {
        it = env?.item ? env.item(l.item) : undefined;
        if (it === null || it === false || (env?.item && it === undefined)) say(at, `no such item ${JSON.stringify(l.item)}`);
      }
    } else {
      for (const k of ['base', 'type', 'spell']) if (l[k] !== undefined) say(at, `${k} goes with an item.`);
      if (l.kind !== undefined && !LINE_KINDS.includes(l.kind)) say(at, `kind ${JSON.stringify(l.kind)} is not one of ${LINE_KINDS.join(', ')}.`);
    }
    if (l.item !== undefined && l.kind !== undefined) say(at, 'kind is worked out for a pack item; leave it out.');
    for (const k of ['base', 'type', 'spell']) if (l[k] !== undefined && l.item !== undefined) id(l[k], at, k);
    if (it && typeof it === 'object') {
      if (it.noSale) flaw(`${it.name ?? l.item} was made by a spell and has no price: it is not for sale.`);
      const needs = it.needs ?? [];
      for (const k of ['base', 'spell']) {
        if (needs.includes(k) && l[k] === undefined) flaw(`${it.name ?? l.item} needs a ${k}.`);
        if (!needs.includes(k) && l[k] !== undefined) flaw(`${it.name ?? l.item} does not take a ${k}.`);
      }
      if (l.type !== undefined && !needs.includes('type')) flaw(`${it.name ?? l.item} does not take a type.`);
      if (typeof l.base === 'string' && needs.includes('base') && !['weapon', 'armour'].includes(env.item(l.base)?.kind)) flaw(`base ${JSON.stringify(l.base)} is not a weapon or armour of the table.`);
      if (typeof l.spell === 'string' && needs.includes('spell') && env.spellLevel && !Number.isInteger(env.spellLevel(l.spell))) flaw(`no such spell ${JSON.stringify(l.spell)}`);
    }
    if (l.price !== undefined) {
      const cp = parsePrice(l.price);
      if (unpriced) say(at, 'a loot line has no price: it is found, not bought.');
      else if (cp === null) say(at, `price ${JSON.stringify(typeof l.price === 'string' ? l.price.slice(0, 30) : l.price)} is not a price like "15 GP", "5 SP" or "1,500 GP".`);
      else if (cp < 1 || cp > MAX_CP) say(at, `price is out of range: 1 CP to ${group(MARKET_LIMITS.maxGp)} GP.`);
    } else if (!unpriced) {
      if (l.item === undefined) { if (l.name !== undefined) say(at, 'a named line needs a price.'); }
      else if (it && typeof it === 'object' && !flawed) {
        if (it.rarity === 'artifact') say(at, 'An Artifact is priceless: give it a price or leave it out.');
        else if (unitValue(l, env) === null) say(at, `the table has no price for ${it.name ?? l.item}: give it a price.`);
      }
    }
    if (l.qty !== undefined) {
      if (kind === 'list') say(at, 'a list line has no qty: stock belongs to a store\'s special or to a loot package.');
      else if (!whole(l.qty, 1, MARKET_LIMITS.qty)) say(at, `qty must be a whole number from 1 to ${MARKET_LIMITS.qty}.`);
    } else if (kind === 'loot') say(at, 'a loot line needs a qty.');
    if (l.hidden !== undefined && (kind !== 'special' || l.hidden !== true)) say(at, kind === 'special' ? 'hidden is true or left out.' : 'only a special can be hidden.');
    artOf(l.art, at);
    if (l.note !== undefined) text(l.note, at, 'note', MARKET_LIMITS.note);
  };

  // ---- lists, stores, loot
  const listIds = new Set(), storeIds = new Set(), lootIds = new Set();
  if (doc.lists !== undefined && arr(doc.lists, 'lists', 'lists', MARKET_LIMITS.lists)) {
    doc.lists.forEach((l, i) => {
      if (!isRec(l)) return say(`lists/#${i}`, 'is not a list.');
      const at = typeof l.id === 'string' && ID.test(l.id) ? `lists/${l.id}` : `lists/#${i}`;
      keys(l, LIST_KEYS, at);
      if (id(l.id, at)) { if (listIds.has(l.id)) say(at, 'id is used twice.'); listIds.add(l.id); }
      text(l.name, at, 'name', MARKET_LIMITS.name);
      if (arr(l.lines, `${at}/lines`, 'lines', MARKET_LIMITS.lines)) l.lines.forEach((x, j) => line(x, `${at}/lines`, 'list', packIds, j));
    });
  }
  if (doc.stores !== undefined && arr(doc.stores, 'stores', 'stores', MARKET_LIMITS.stores)) {
    doc.stores.forEach((s, i) => {
      if (!isRec(s)) return say(`stores/#${i}`, 'is not a store.');
      const at = typeof s.id === 'string' && ID.test(s.id) ? `stores/${s.id}` : `stores/#${i}`;
      keys(s, STORE_KEYS, at);
      if (id(s.id, at)) { if (storeIds.has(s.id)) say(at, 'id is used twice.'); storeIds.add(s.id); }
      text(s.name, at, 'name', MARKET_LIMITS.name);
      if (s.blurb !== undefined) text(s.blurb, at, 'blurb', MARKET_LIMITS.text, false);
      artOf(s.art, at);
      if (s.lists !== undefined && arr(s.lists, `${at}/lists`, 'lists', MARKET_LIMITS.lists)) {
        const used = new Set();
        for (const lid of s.lists) {
          if (typeof lid !== 'string' || !listIds.has(lid)) say(`${at}/lists`, `names no list of the pack: ${JSON.stringify(typeof lid === 'string' ? lid.slice(0, 40) : lid)}.`);
          else if (used.has(lid)) say(`${at}/lists`, `names "${lid}" twice.`);
          used.add(lid);
        }
      }
      if (s.markup !== undefined && !whole(s.markup, 10, 1000)) say(`${at}/markup`, 'is a percent of the list price, a whole number from 10 to 1000.');
      if (s.buys !== undefined) {
        if (!isRec(s.buys)) say(`${at}/buys`, 'must be a record of equipment, trade and magic.');
        else { keys(s.buys, BUYS_KEYS, `${at}/buys`); for (const k of BUYS_KEYS) if (s.buys[k] !== undefined && s.buys[k] !== null && !whole(s.buys[k], 0, 100)) say(`${at}/buys`, `${k} is a percent of value from 0 to 100, or null for no offer of its own.`); }
      }
      if (s.haggle !== undefined) {
        if (!isRec(s.haggle)) say(`${at}/haggle`, 'must be a record of step, dc and bonus.');
        else {
          keys(s.haggle, HAGGLE_KEYS, `${at}/haggle`);
          const rng = { step: [0, 50], dc: [1, 40], bonus: [0, 25] };
          for (const k of HAGGLE_KEYS) if (s.haggle[k] !== undefined && !whole(s.haggle[k], ...rng[k])) say(`${at}/haggle`, `${k} must be a whole number from ${rng[k][0]} to ${rng[k][1]}.`);
        }
      }
      if (s.special !== undefined && arr(s.special, `${at}/special`, 'special lines', MARKET_LIMITS.specials)) s.special.forEach((x, j) => line(x, `${at}/special`, 'special', packIds, j));
    });
  }
  if (doc.loot !== undefined && arr(doc.loot, 'loot', 'loot packages', MARKET_LIMITS.loot)) {
    doc.loot.forEach((p, i) => {
      if (!isRec(p)) return say(`loot/#${i}`, 'is not a loot package.');
      const at = typeof p.id === 'string' && ID.test(p.id) ? `loot/${p.id}` : `loot/#${i}`;
      keys(p, LOOT_KEYS, at);
      if (id(p.id, at)) { if (lootIds.has(p.id)) say(at, 'id is used twice.'); lootIds.add(p.id); }
      text(p.name, at, 'name', MARKET_LIMITS.name);
      if (p.blurb !== undefined) text(p.blurb, at, 'blurb', MARKET_LIMITS.text, false);
      artOf(p.art, at);
      if (p.coins !== undefined) {
        if (!isRec(p.coins)) say(`${at}/coins`, 'must be a record of coins.');
        else for (const k of Object.keys(p.coins)) {
          if (!COINS.includes(k)) say(`${at}/coins`, `"${k}" is not a coin; the coins are ${COINS.join(', ')}.`);
          else if (!whole(p.coins[k], 0, MARKET_LIMITS.maxGp)) say(`${at}/coins`, `${k} must be a whole number from 0 to ${group(MARKET_LIMITS.maxGp)}.`);
        }
      }
      const seen = new Set();
      if (p.lines !== undefined && arr(p.lines, `${at}/lines`, 'lines', MARKET_LIMITS.lootLines)) p.lines.forEach((x, j) => line(x, `${at}/lines`, 'loot', seen, j));
    });
  }
  return bad;
}
