// The ids a player is given for shops, and the number of a fight (issue #630; docs/specs/shops.md, Decision 3; docs/DEBT.md, T11).
//
// A shop's own id is `s<n>`, from one counter shared with every shop the DM ever opened. A player who was shown only some of them
// must not learn from a gap in the numbers how many others there are, so a player is never sent that id. As places are `pl1`, `pl2`
// ... in the order the party was told of them (known.js), a shop is `sh1`, `sh2` ... in the order it was first shown to anyone,
// whoever it was shown to: `s.shopAlias`, a list of the shops' own ids that only grows (a closed shop keeps its number, so a number
// once given never comes to mean another shop). The DM is sent and sends the shops' own ids; a player's action is turned back in
// `translateShops` (engine.js, dispatch), before anything else is looked at, and a player's `sh7` that was never given, a guessed
// `s1` and a shop not shown to them are all refused in the one sentence of `NO_SUCH_SHOP`.
//
// The numbers are given by `learnShops`, run after every action (engine.js), so every way a shop comes to be shown is covered and
// the events of the action that showed it are viewed (view.js) after the number exists. A state with no shop shown has no list.
// Pure: nothing here reads a clock or a die.

export const SHOP_PREFIX = 'sh';
export const NO_SUCH_SHOP = 'No such shop.';
// A fight is numbered by its own counter, `s.fightSeq` (absent: none yet), and not from `s.seq`, which counts every creature and
// lasting effect made, hidden ones too; so the number says how many fights there have been and nothing else.
export const nextFight = (s) => (s.fightSeq = (Number.isSafeInteger(s.fightSeq) && s.fightSeq >= 0 ? s.fightSeq : 0) + 1);

const own = (o, k) => !!o && typeof o === 'object' && typeof k === 'string' && Object.hasOwn(o, k);
const listOf = (s) => (Array.isArray(s?.shopAlias) ? s.shopAlias : []);

// Run after every action. Adds, in order, each shop that is shown to someone and has no number yet; never takes one away.
export function learnShops(s) {
  if (!Array.isArray(s.shops)) return;
  for (const shop of s.shops) {
    if (!shop || typeof shop.id !== 'string' || !(shop.shown === 'all' || (Array.isArray(shop.shown) && shop.shown.length))) continue;
    if (!Array.isArray(s.shopAlias)) s.shopAlias = [];
    if (!s.shopAlias.includes(shop.id)) s.shopAlias.push(shop.id);
  }
}

// The id a player is given for a shop, or null if it was never shown to anyone.
export const playerShop = (s, id) => { const i = listOf(s).indexOf(id); return i < 0 ? null : `${SHOP_PREFIX}${i + 1}`; };
// The shop's own id for the one a player names, or null: for a number never given, a guessed one, and the shop's own id.
export function realShop(s, text) {
  if (typeof text !== 'string' || !text.startsWith(SHOP_PREFIX)) return null;
  const digits = text.slice(SHOP_PREFIX.length);
  if (!/^[1-9][0-9]{0,4}$/.test(digits)) return null;
  const id = listOf(s)[Number(digits) - 1];
  return typeof id === 'string' ? id : null;
}

// The actions whose `shop` names a shop, and `askCheck`, whose `about.shop` does.
const SHOP_ACTIONS = ['shopEdit', 'showShop', 'revealGoods', 'closeShop', 'quote', 'buy', 'chipIn', 'sell', 'take'];
// A player's action with the shop ids they were given turned into the shops' own. `bad` (the engine's `fail`) is called with
// `NO_SUCH_SHOP` for an id that is nothing to them, whichever kind. A copy: the action given is not changed.
export function translateShops(s, action, bad) {
  const t = action?.type;
  if (SHOP_ACTIONS.includes(t)) {
    const id = realShop(s, action.shop);
    if (id === null) bad(NO_SUCH_SHOP);
    return { ...action, shop: id };
  }
  if (t === 'askCheck' && action.about !== undefined) {
    const ab = action.about, id = own(ab, 'shop') && !Array.isArray(ab) ? realShop(s, ab.shop) : null;
    if (id === null) bad(NO_SUCH_SHOP);
    return { ...action, about: { ...ab, shop: id } };
  }
  return action;
}
