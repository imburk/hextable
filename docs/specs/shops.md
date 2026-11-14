# Spec: shops and loot packages

Status: draft by an agent, to be reviewed by the design owner. Issue #292 (the
owner's request of 14 November). Nothing here is built. No code is written by
this spec.

The owner asked for a storefront that shows its goods as pictures, not as a list
of names; for the DM to make either a **loot package** (found, taken, shared out)
or a **store** (bought from); for the DM to decide, per store and at any moment,
whether players can see it; for shops to be **prepared outside the adventure and
imported**, so that one standard store made once can be used several times (three
stores in a port city, all selling the standard goods, two of them with something
special on top); for **roleplay first**: the party walks into the store in the
story, a purchase is played out, the DM calls for a Persuasion check or another
that fits and the **negotiated price** is what is paid, and the DM **reveals** a
special item (a Wand of Magic Missiles at a price) when it suits the story; and
for **ordinary goods to need no tending**: once a standard store is open, the
party buys rope and rations at list price, without limit, without the DM.

This spec says what the documents are and where they live, what a player may know
of a store, the actions and who may send each, money and change, negotiation, how
a bought item reaches a sheet, undo, the log, the screens, and a staged build
plan. It ends with the questions for the owner. Style follows `table-ui.md`.

## Rules that bind this design

- **Everything goes through `apply()`.** Opening a store, showing it, revealing an
  item, a quote, a haggle, a purchase, a sale and taking from a loot package are
  actions. Nothing a client computes is trusted: a price, a quote, the change and
  the coins taken are worked out by the engine.
- **The rules package is pure.** A haggle is an ability check rolled with the
  game's seeded dice (`abilityCheck` in `engine/rolls.js`), so undo and replay give
  the same roll. No `Math.random`, no clock.
- **A rejected action changes nothing.** A purchase checks the shop, the line, the
  stock, the price and the purse before a coin moves.
- **The engine never pretends.** What it cannot apply (a seller who wants a
  service instead of coin, the SRD's own words) is the DM's, said in a `manual` or
  left to the DM's price override.
- **Content is data, and the repo is SRD-only.** A market pack is the DM's own
  file and never enters the repo. Its lines name SRD items by id (weapons, armour,
  magic items of the pack) or the table's homebrew items (`homebrew.md`), or are
  plain named goods with a price the DM wrote. The repo ships the SRD's prices as
  pack data and no market pack. No store or setting from any published book is
  named anywhere.
- **Players are sent only what their characters could know** (`hidden-information.md`).
  A store not shown to a player does not exist for them; a special item not yet
  revealed does not exist for anyone but the DM; a guessed id gets the same answer
  as one that does not exist.
- **Two actions must not share a name** (`CLAUDE.md`). The issue's `reveal` is
  already the DM's action for hidden creatures (`engine/dm.js`), so revealing an
  item is `revealGoods`.
- **Grid-agnostic.** A shop is not on the grid. Where it is tied to a place, it is
  tied to a region or an object by id, which works on hex and square maps alike.
- **Phones are first-class.** The storefront and the DM's shop controls work at
  390 x 844 with touch.

## Where we are

What exists today, with the file and function so a builder can check.

| Feature | Exists today | Does not exist |
|---|---|---|
| **Coins** | Nothing. `table-ui.md` Decision 4: "Coins are loot lines ('35 gp'). There is no currency in the engine." A conclusion's loot line `35 gp` lands in `gear` as a string (`rewards.js`, `publish`). | A purse, a coin value, paying, change. |
| **Prices** | `content/srd52/equipment.js`: every weapon and armour has `cost` ("15 GP", "1,500 GP") and `weight`, checked against the SRD tables. `magic-items.js`: every item has `rarity`, and consumables have a use with `consumed: true`. | The Coin Values table, the Magic Item Rarities and Values table, Spell Scroll costs, and the Adventuring Gear table (rope, rations, torches are not in the pack at all). |
| **Gear on a creature** | `e.gear`: up to 60 names of up to 60 letters (`validate` in `derive.js`). A built character's magic items are `sheet.items: [{ id, item, base?, type?, spell?, equipped?, attuned?, charges? }]`, keys `i1, i2...`. `sheet.armour` and `sheet.weapons` are what is worn and wielded, not what is owned. | Quantities (a convention: "Arrow x20" is one string). |
| **Handing over** | `give { actor, item, take?, base?, damageType?, spell? }` (`engine/characters.js`), DM only: a pack magic item to a built sheet through `landItem` (`engine/sheets.js`), anything else by name into `gear`; event `gear { why: 'dm' }`. Conclusion loot lands the same way (`why: 'loot'`). | `pass`, `drop`, `pickUp`, the `pile` object (E17, T6g: not built). |
| **Checks** | `check { actor, skill, dc? }` (`engine/features.js`): the engine rolls with the character's numbers; with a DC (DM only) the event is `secret`. `askCheck { actor, skill }` (`scenes.js`): a player asks, the DM answers with `check`. | A check whose result changes a price. |
| **Who sees what** | `view.js`: allow lists; handouts are the one per-player part (`viewHandouts`, `shown: 'all' \| [userIds]`). Events not listed are dropped for players. | Shops in a view. |
| **Documents imported** | Maps (`map.js`): a document with its own format, linter and migration, copied into the game by `loadMap` (DM, up to 1 MB: `MAP_ACTIONS` in `tables.js`). Homebrew packs (`homebrew.md`): linted on the server, kept beside the state. Character files (`portable-characters.md`): kept on the device, exported and imported. | A market document. |
| **Weight** | `weight` on weapons and armour. | Encumbrance (`rules-expansion.md` R12, DEBT C4). So this spec carries weights in the data and enforces none. |
| **Undo** | `history.js`: every action except `claim` and `release` is a DM-undoable step, down to the dice. | — |
| **Log** | `logview.js` kinds `combat`, `explore`, `loot`, `talk`, `dm`; the chip "Loot and trades"; `LOOT` is `gear`, `conclusion`, `conclusionSkipped`, `levelReady`. | Trade lines. |
| **State version** | 21 (`migrate.js`). | — |

What the SRD gives, read from `reference/srd52/srd52-flow.txt`:

- **Coin Values** (Equipment, "Coins"): Copper Piece 1/100 GP, Silver 1/10, Electrum
  1/2, Gold 1, Platinum 10. Fifty coins weigh a pound.
- **Selling Equipment**: equipment fetches half its cost; trade goods and valuables
  (gems, art objects) keep their full value. Magic items have values in "Magic Items".
- **Magic Item Rarities and Values**: Common 100 GP, Uncommon 400 GP, Rare 4,000 GP,
  Very Rare 40,000 GP, Legendary 200,000 GP, Artifact priceless. Halve the value for a
  consumable item other than a Spell Scroll; a Spell Scroll is worth double its
  scribing cost (Spell Scroll Costs: cantrip 15 GP, level 1 25 GP, 2 100, 3 150,
  4 1,000, 5 1,500, 6 10,000, 7 12,500, 8 15,000, 9 50,000). A magic item built on
  an item with a cost (a weapon, a suit of armour) adds that cost: the SRD's own
  example is +1 Armor (Plate Armor), 4,000 + 1,500 = 5,500 GP. A seller might ask
  for a service rather than coin.
- **Where to buy**: Common items can often be bought in a town or city; Uncommon
  and Rare usually only in cities; rarer ones only in wondrous places.
- **The Influence action** (Rules Glossary): the DM decides whether the creature is
  willing, unwilling or hesitant; only *hesitant* takes a check; the Influence
  Checks table suggests Deception, Intimidation, Performance or Persuasion (Animal
  Handling for a Beast); the default DC is 15 or the creature's Intelligence score,
  whichever is higher; on a failure the character waits 24 hours (or as long as the
  DM says) before urging it the same way again.

The SRD gives **no haggling rule**: by how much a successful check moves a price is
a table convention, set per store (Decision 6).

## The nine decisions

### Decision 1: two documents, a market pack and the shops in a game

**Question.** What is made once and reused, what belongs to one game, and how are
they told apart?

**Options.**

- A. **One shape.** A store is made in the game and copied by hand for the next
  store. No reuse across adventures; three port-city stores are three copies to keep
  in step.
- B. **A market pack holds finished stores**, imported whole. Reuse, but the two
  stores with "something special on top" are two more stores in the pack, and a
  change to the standard goods is made three times.
- C. **A market pack holds lists, store templates and loot templates; a game holds
  shops made from them.** A shop refers to its pack's lists by id and keeps only
  what is its own: its special lines, its price changes, its stock, who sees it.

**Choice: C.** Two documents.

**The market pack** is the DM's file, made once, used in any game:

```js
{
  format: 'hextable-market', v: 1,
  id: 'port-goods', name: 'Port city goods', version: 3,     // id fixed for the life of the pack; version rises on each export
  lists: [
    { id: 'standard', name: 'Standard goods', lines: [
      { id: 'longsword', item: 'longsword' },                                  // price from the pack: 15 GP
      { id: 'chain-mail', item: 'chain-mail' },                                // 75 GP
      { id: 'potion-of-healing', item: 'potion-of-healing' },                  // 50 GP: Common, consumable
      { id: 'rope', name: 'Rope', price: '1 GP', kind: 'gear', art: 'icon:rope' },
      { id: 'rations', name: 'Rations', price: '5 SP', kind: 'gear' },
    ] },
  ],
  stores: [
    { id: 'outfitter', name: 'Outfitter', blurb: 'Rope, steel and lamp oil, sold by the quay.',
      lists: ['standard'], markup: 100,                                        // percent of the list price
      buys: { equipment: 50, trade: 100, magic: null },                        // percent paid when the party sells; null: only by the DM's quote
      haggle: { step: 10, dc: 15 },                                            // Decision 6
      special: [ { id: 'wand-of-magic-missiles', item: 'wand-of-magic-missiles', qty: 1, hidden: true } ],
      art: 'a7Qm2xR4' },
  ],
  loot: [
    { id: 'strongbox', name: 'A strongbox', lines: [ { id: 'dagger', item: 'dagger', qty: 2 } ], coins: { gp: 120, sp: 40 } },
  ],
  assets: { 'a7Qm2xR4': { type: 'image/webp', data: '<base64>' } },             // optional art, the asset rules of maps-and-objects.md
  notes: 'Prices for the harbour district.'                                      // the DM's own, never sent to players
}
```

**A line** is one kind of thing for sale or found:

```
id      kebab, unique in the whole pack (lists and specials together), so a store can mix lists without clashes
item    a pack id: a weapon, armour or magic item of the SRD pack or of the table's homebrew; or absent
base, type, spell   what a magic item needs (Weapon, +1 of what; a Spell Scroll of which spell), as `give` takes them
name    shown name; required when there is no `item`; otherwise the pack's name
price   "15 GP", "5 SP", "1,500 GP": the same form as `cost` in equipment.js; absent means the list price (Decision 5)
qty     how many there are; absent means without limit. Standard lines have none; specials and loot do
kind    gear | trade | valuable | magic | weapon | armour: what the selling rule applies (Decision 5); derived for a pack item
art     an asset id, or icon:<name> from the client's built-in set; absent means the icon for its kind
hidden  a special that starts unrevealed (Decision 3)
note    one line shown on the card (up to 120 letters)
```

**The shops in a game** live in the state, beside the market packs imported into it:

```js
state.markets = [ { id, name, version, hash, lists, stores, loot } ]            // the imported packs, assets moved to the table's assets; DM only
state.shops = [ {
  id: 's3', kind: 'store' | 'loot', name, blurb?, art?,
  from: { market: 'port-goods', template: 'outfitter' } | null,                  // null: made from nothing in the game
  lists: ['standard'],                                                           // read live from its market: a newer pack version updates every shop using it
  markup, buys, haggle, keeper?,                                                 // keeper: a creature id whose Intelligence sets the haggle DC floor
  at?: { region } | { object },                                                  // Decision 4
  lines: [ ... ],                                                                // its own: the template's specials plus what the DM added
  overrides: { [lineId]: { price?, qty?, gone?: true } },                        // changes to listed lines, for this shop only
  coins?: { gp, sp, ... },                                                       // a loot package's coins
  shown: 'none' | 'all' | [userIds],
  quotes: [ { id: 'q2', line? , item?, for, price, sell?: true, by: 'dm' | 'haggle' } ],
  waits: { '<creature>:<line>': t },                                             // Influence's 24 hours, world time
  notes? } ]
```

So the port city is: import "Port city goods" once; open the Outfitter template three
times with three names; add a line to two of them. A later version of the pack's
standard list reaches all three.

**Reasons.** The owner's example is exactly lists plus additions. Lists by reference
keep the state small and the standard goods in one place. A shop's own lines and
overrides are what make it that shop.

**Cost.** A shop refers to a pack by id, so a pack in use cannot be removed (the same
rule as a homebrew pack in use, `homebrew.md` Decision 3); the engine lists the shops
that block it. A line id clash between a shop's own line and a newer list is refused
at re-import with the shop named.

### Decision 2: where the documents live

**Question.** Where is a market pack kept, how does it reach a game, and what keeps
it out of the repo?

**Choice.** The pattern of character files (`portable-characters.md` Decision 1) and
of maps:

- **On the DM's device.** A file named `*.hextable-market.json`, at most 128 KB of
  lines plus at most 1 MB of art, and a device list ("My markets", at most 20, in
  `localStorage` under `hextable.markets`) with Export and Import. It is made in the
  market editor (Decision 8), with or without a game.
- **Into a game.** The DM's action `market { add: doc }` (the server lets the DM send
  it up to 1 MB, as `loadMap`: it joins `MAP_ACTIONS` in `tables.js`). The engine
  lints it (`lintMarket`, pure, in a new `market.js`), checks every `item` against
  the content the table has (SRD and its homebrew packs), moves its `assets` into
  the table's assets (the M9 rules: DM only, the image types and sizes already
  allowed), and keeps the rest in `state.markets`. A pack with the same id and a
  higher version replaces the old one; the same version is refused ("Already
  imported."); a lower one is refused. `market { remove: id }` removes one no shop
  uses.
- **Never in the repo.** The repo ships no market pack, no example store and no
  names. It ships the SRD's prices as pack data (Decision 5), so a DM's lines may
  leave `price` out for SRD items. The market editor's "Start from the SRD prices"
  builds a list from the pack's weapons and armour (and the Adventuring Gear table
  once it is entered: question 8).
- **What the linter checks.** Format and version; the key list of every object
  (strict: no unknown field, no function, no `__proto__`, `constructor` or
  `prototype`); ids kebab and unique; at most 20 lists, 300 lines a list, 30 store
  templates, 30 loot templates, 40 specials a store, 100 lines a loot package; names
  60 letters, blurbs and notes 300, control characters refused; prices that parse,
  at most 10,000,000 GP; `qty` a whole number 1 to 9,999; a magic item that needs a
  `base` or `spell` has it; an Artifact has a `price` ("An Artifact is priceless:
  give it a price or leave it out"); a store's `lists` name lists of the pack. The
  refusal names the first problems in the linter's style:
  `stores/outfitter/special/wand: no such item "wand-of-magic-misiles"`.

**Reasons.** The owner prefers prep outside the adventure. A file on the device is
private, needs no account, and moves between games and servers as character files do.

**Cost.** A lost file is lost prep; the game keeps its imported copy, and the DM can
export it back out of the game (`market { export }` is not needed: the DM's view
holds `state.markets`, and the editor saves it to the device list).

### Decision 3: what players see of a store, and when

**Question.** How is a store shown and hidden, and what may a player know of it and
of items not yet revealed?

**Choice.** A shop is shown as a handout is shown: `shown` is `'none'`, `'all'` or a
list of user ids, and only the DM changes it (`showShop`). A new shop starts at
`'none'`. The view (`view.js`, a new `viewShops(state, viewer)` beside
`viewHandouts`) sends each player the shops shown to them, shaped:

```js
{ id, kind, name, blurb, art,
  lines: [ { id, name, item?, base?, kind, art, note?, price, qty? } ],   // listed lines not gone, and own lines not hidden; price after markup and overrides
  coins?,                                                                  // a loot package's
  buys,                                                                    // what it pays when the party sells, as a shopkeeper would say
  quotes: [ { id, line?, item?, for, price, sell? } ] }                    // standing offers for party characters
```

| A player is sent | Never sent |
|---|---|
| shops shown to them, as above | a shop not shown to them: not its id, not that it exists |
| revealed specials with their price and how many are left | a hidden special: not its id, its name, its price, or how many hidden lines there are |
| quotes for party characters | `haggle` (step, DC), `notes`, `from`, `waits`, `keeper`, `at` |
| — | `state.markets`, ever, and the DM's notes in a pack |

- **Revealing.** `revealGoods { shop, line }` (DM) shows a hidden special. Players it
  is shown to get `goodsRevealed { shop, line, name, price, qty }` and the card turns
  up with a "New" mark. `revealGoods { shop, line, hide: true }` takes it back out of
  sight (a quote on it is withdrawn).
- **Refusals for players are the same as for a thing that does not exist**: a shop
  not shown, or a line hidden, gets "No such shop." or "No such item.", whatever the
  id. Line ids are the author's words, not a counter, so their gaps say nothing.
  Shop ids are a counter (`s1, s2...`), as handout ids are: a player can tell that
  shops exist that they were not shown, not what they are (DEBT T11 has the same
  for creatures).
- **Players at one table share a view** of the party (every party sheet is open), so
  purchases by any party member are seen by every player the shop is shown to.
  A player the shop is not shown to sees the party member's `gear` and `coins`
  events without the shop's name (`why: 'buy'`), because the sheet changed in plain
  sight.

**Reasons.** It is the handout rule, already built and tested, and the allow-list
rule of `hidden-information.md`: a new field is private until listed.

**Cost.** `viewShops` and its tests: a hidden line's name never reaches a player
message until `goodsRevealed`; a guessed shop or line id gets the same refusal as a
missing one.

### Decision 4: the actions

**Question.** What can be done, and by whom?

**Choice.** Ten actions, in a new handler module `engine/trade.js` (the domain split
of `CLAUDE.md`), helpers in `market.js`, and one form added to `give`. "Controller"
is the player who controls the character (`control` in `engine/shared.js`).

| Action | Shape | Who | What it does |
|---|---|---|---|
| `market` | `{ add: doc }` or `{ remove: id }` | DM | Decision 2 |
| `openShop` | `{ kind: 'store' \| 'loot', name, market?, template?, at?, keeper? }` | DM | makes a shop from a template (its lists, markup, buys, haggle, specials, art) or from nothing; starts unshown. Event `shopOpened { shop }` (DM only) |
| `shopEdit` | `{ shop, set?: { name, blurb, art, markup, buys, haggle, keeper, at, lists, notes }, add?: [line], remove?: [lineId], override?: { [lineId]: { price?, qty?, gone? } \| null }, coins? }` | DM | every change to one shop; `override: { id: null }` gives a line back to the list. Event `shopEdited { shop }` (DM only); a change to something a player can see also sends them `shopChanged { shop }` and the new shape comes with the view |
| `showShop` | `{ shop, to: 'none' \| 'all' \| [userIds] }` | DM | Decision 3. Event `shopShown { shop, name, to }`, to those now shown, never who else; `shopHidden { shop }` to those it is taken from |
| `revealGoods` | `{ shop, line, hide? }` | DM | Decision 3 |
| `closeShop` | `{ shop }` | DM | removes the shop and its quotes (undo brings it back). `shopClosed { shop }` to those it was shown to |
| `quote` | `{ shop, for, line \| item, price? , check?: { skill, dc? }, sell?, withdraw? }` | DM | an offer for one character: a price set by hand, or a haggle rolled (Decision 6); `sell` for an offer to buy what the character carries; `withdraw` removes it. Event `quoted` |
| `buy` | `{ actor, shop, line, qty? }` | controller, DM | Decision 5 |
| `sell` | `{ actor, shop, item, qty? }` | controller, DM | `item` is a sheet key (`i3`) or a name in `gear`. Decision 5 |
| `take` | `{ actor, shop, line, qty? }` or `{ actor, shop, coins }`; DM also `{ shop, split: [ids] }` | controller, DM | from a loot package. Decision 7 |
| `give` (extended) | `{ actor, coins: { gp: 35 }, take? }` | DM | hands coins over or takes them away, as it does items; event `coins { why: 'dm' }` |

Common checks, before anything changes:

- The shop exists and, for a player, is shown to them and of the right kind (`buy`,
  `sell` and `quote` need a store, `take` a loot package).
- The actor is up and not in a fight (in a fight: "Not in the middle of a fight."; the
  DM is not stopped). A creature that is down cannot shop; one that is Unconscious or
  Incapacitated cannot either.
- **Where.** A shop with no `at` needs nothing: the party is in the store in the
  story. With `at: { region }`, the actor stands in that region; with
  `at: { object }`, within 5 feet of it (the reach test objects use already, on hex or
  square maps). The refusal says where: "Ilya is not at the Outfitter."
- Numbers are whole and in range: `qty` 1 to 99 (a line's stock or 99, whichever is
  less), coins 0 to 10,000,000 of each kind.

**Reasons.** One module per domain, as the engine is laid out; one DM action per
thing the DM does, so each is one line in the history and in the log. `give` already
hands out items, so it hands out coins.

**Cost.** Ten labels in `history.js` (`describeStep`), ten handlers, and the view.

### Decision 5: money, prices, paying and change

**Question.** How is money held, what does a thing cost, and how is it paid?

**The purse.** `e.coins = { cp, sp, ep, gp, pp }` on any creature, only the kinds it
has (absent means none). It is beside the sheet, as `xp` is: kept by `setSheet`,
`levelUp` and remaking a creature, sent with the creature's record (players see the
party's purses, as they see the party's sheets), and absent from the public record of
a Seen creature. Coins are kept as the coins they are: the SRD has five, and a table
that finds 40 silver pieces has 40 silver pieces. The engine counts value in copper
pieces (1 SP = 10 CP, 1 EP = 50, 1 GP = 100, 1 PP = 1,000, from Coin Values), so all
arithmetic is whole numbers. Weight is not enforced (no encumbrance); fifty coins a
pound is in the data for when R12 comes.

**The list price** of a line, in order:

1. The line's `price`, if it has one (the shop's override first).
2. A weapon or armour of the pack: its `cost`.
3. A magic item of the pack: its rarity's value from Magic Item Rarities and Values,
   halved if it is consumable (a use with `consumed: true`) and not a Spell Scroll;
   a Spell Scroll: double the scribing cost of its spell's level; plus the `cost` of
   its `base` weapon or armour. So a Potion of Healing is 50 GP (the same as the
   Adventuring Gear table's price for it), a Wand of Magic Missiles 400 GP, a
   Weapon, +1 (Longsword) 415 GP.
4. Otherwise the line has no price, and the linter refused it.

Then the shop's `markup` applies to lines without their own `price` (100 is list,
120 is a fifth more), rounded up to a whole copper piece. A line's own price is final.
A standing quote for the actor and that line replaces the price.

**Buying.** `buy { actor, shop, line, qty }`:

1. Checks (Decision 4), then: the line is in the shop and visible; `qty` is no more
   than what is left; the price is worked out; the actor's purse is worth at least
   `qty` times the price ("Ilya has 3 GP 2 SP; the rope costs 4 GP.").
2. **Coins taken.** The engine pays from the smallest coins up, taking of each kind
   only what is still needed, until the price is met. **Change** is given in the
   largest coins first (PP, GP, SP, CP; never EP, which the SRD lists but shops are
   not obliged to hold). A shop never runs out of change. The player may also name
   the coins: `pay: { gp: 5 }`, which must cover the price, and change follows.
3. **The goods land** by the path `give` uses: a magic item of the pack on a built
   character's sheet through `landItem` (carried, not worn, a new key); anything
   else, and anything for a character typed in by hand, by name in `gear` ("Rope";
   with `qty` above 1, "Rope x3", the convention of loot lines). A weapon or armour
   bought is carried, not wielded or worn: wearing it is a sheet change, as today.
   Attunement is the existing `attune` action at a Short Rest. If the sheet cannot
   take it (60 items, a variant missing) the purchase is refused, with the reason.
4. Stock goes down for a line with `qty`; a line at 0 shows "Sold out" and stays.
   A quote for that actor and line is used up.
5. Events: `bought { shop, id, line, name, qty, price, paid, change }`, `coins
   { id, coins, why: 'buy' }`, and `gear { id, item, key?, pack?, why: 'buy' }` for
   each thing landed.

**Selling.** `sell { actor, shop, item }`. The offer, in order: a standing `sell`
quote for that actor and item; otherwise, if the item matches a line of the shop
(same pack id, or same name for named goods), that line's list price times the
shop's `buys` percent for its kind; otherwise a weapon or armour of the pack at its
`cost` times `buys.equipment`. Defaults follow the SRD: equipment 50, trade goods and
valuables 100. **Magic items** are bought only at a quote unless the shop's
`buys.magic` is a number (question 3). No offer: "The Outfitter makes no offer for
the Ring of Swimming. Ask the DM." A worn, wielded or attuned item is refused
("Take it off first"); an item being attuned to stops being attuned to. The coins are
paid in the largest kinds first. Events: `sold`, `coins { why: 'sell' }`,
`gear { why: 'sell', taken: true }`. What is sold is not added to the shop's stock
(question 7 says why).

**Reasons.** Coins as coins keep the SRD's five pieces honest and loot exact;
copper arithmetic avoids fractions; paying from small coins and changing into large
ones is what a purse does and needs no choices on a phone.

**Cost.** A new state field on creatures and a state version (22). Old `"35 gp"` lines
in `gear` stay names; they are not parsed (question 9).

### Decision 6: negotiation

**Question.** How does a check change a price, and what can the DM override?

**Choice.** The DM calls for the check; the engine rolls it in the open; a fixed rule
turns the result into a price; the DM can then set any price by hand. Nothing is
rolled out of sight.

- **Who starts it.** The DM, with `quote { shop, for, line, check: { skill, dc? } }`.
  A player who wants to haggle taps "Ask to haggle" on a card, which sends the existing
  `askCheck { actor, skill: 'persuasion' }` with `about: { shop, line }` (one optional
  field added to `askCheck`); the DM's screen shows the request on that card.
- **The roll.** `abilityCheck` with the character's real numbers, the game's dice, and
  the modifiers that apply (`modifiers.js`). The skill is the DM's choice, the SRD's
  Influence Checks table offered first: Persuasion, Deception, Intimidation,
  Performance.
- **The DC.** The DM's, or by default the Influence action's: 15, or the `keeper`'s
  Intelligence score if that is higher. The store's `haggle.dc` replaces 15 for that
  store.
- **The rule** (a table convention; the SRD has none), with the store's `haggle.step`
  (default 10 percent):

  | Result | Price |
  |---|---|
  | total at or above the DC | list price less one step |
  | total at or above the DC + 10 | less two steps |
  | below the DC | unchanged, and the Influence action's wait: this character cannot haggle over this line again for 24 hours of world time (`waits`), unless the DM sets a price by hand |

  The new price is rounded up to a whole copper piece and never goes below 1 CP.
  Haggling over a `sell` offer works the same way upwards (plus one step, two steps).
- **Overrides.** `quote { shop, for, line, price }` sets the price outright, before or
  after a roll: the DM's word on a seller who will not budge, a friend's discount,
  or a price that rises because the threat went badly. `withdraw` removes a quote.
- **What a player sees.** The check's dice and total (as any check of their own), and
  the new price. Not the DC and not the word "success": the price is the answer, as a
  shopkeeper's reply would be. A price set by hand is shown as the price, without
  saying how it was reached.
- **How long a quote lasts.** Until it is used by a purchase, withdrawn, the line is
  hidden, or the shop is closed. It is for one character: another party member pays
  the shop's price unless they haggle too.

Event: `quoted { shop, for, line | item, price, was, sell?, by: 'dm' | 'haggle',
check?: { skill, rolls, total } }`, with the DC and `steps` only for the DM.

**Reasons.** The owner asked for a check that moves the price by a rule the DM may
override, with no hidden die. The Influence action gives the DC, the skills and the
retry rule from the SRD; only the size of a step is ours, and it is a store field.

**Cost.** One rule function in `market.js` and its table of cases in tests.

### Decision 7: loot packages

**Question.** How is something found, taken and shared out?

**Choice.** A loot package is a shop of kind `loot`: lines with `qty` and no price,
and `coins`. It is opened from a template or from nothing (`openShop { kind: 'loot' }`),
shown as a store is, and may be tied to a place (`at: { object }`: the chest).

- `take { actor, shop, line, qty }`: a party character takes things. They land as a
  purchase does (Decision 5, step 3); the line's `qty` goes down; at 0 the line goes.
- `take { actor, shop, coins: { gp: 30 } }`: takes those coins, if the package holds
  them.
- `take { shop, split: [ids] }`, DM only: shares the coins out evenly among the named
  characters, kind by kind (120 GP among 4 is 30 each), and what does not divide stays
  in the package, said on the card ("2 SP left over"). Items are not split: they are
  taken.
- An empty package (no lines, no coins) says "Empty" and stays until the DM closes it.
- Events: `took { shop, id, line?, name?, qty?, coins? }`, `coins { why: 'take' }`,
  `gear { why: 'take' }`.

**Where it meets the rest.** The rewards card's loot lines (`table-ui.md` Decision 4)
stay as they are. A later stage adds "Make a package of these" to the DM's rewards
form, and coins as a loot line (`{ coins }`), so a fight's spoils can be found rather
than handed out. After E17 (`pile`), a package tied to a pile is what the pile holds.

**Reasons.** Found and bought are one screen with two verbs. Taking is the players'
own act, played out, and the DM need not assign each line.

**Cost.** None beyond the shop machinery.

### Decision 8: the screens

**The storefront** (players and the DM). A new client module `shop.js` and
`shop.css`. It opens over the map like the rewards card, from a "Shops" row in the
drawer that lists the shops shown to you, and from a toast when one is shown
("The Outfitter is open. Look"). The map stays behind it; a fight closes it.

```
  ┌───────────────────────────────────────────────┐
  │ Outfitter                               [ x ] │
  │ Rope, steel and lamp oil, sold by the quay.   │
  │ Ilya ▾   12 GP 4 SP 7 CP          Buy | Sell  │
  ├───────────────────────────────────────────────┤
  │ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐   │
  │ │  [art] │ │  [art] │ │  [art] │ │  [art] │   │
  │ │Longswd │ │ Rope   │ │Potion  │ │Wand of │   │
  │ │ 15 GP  │ │  1 GP  │ │ 50 GP  │ │Magic M.│   │
  │ │        │ │        │ │        │ │360 GP  │   │
  │ │        │ │        │ │ 6 left │ │ NEW  1 │   │
  │ └────────┘ └────────┘ └────────┘ └────────┘   │
  └───────────────────────────────────────────────┘
```

- **Cards.** An art slot (the line's picture, or the icon for its kind: blade, armour,
  potion, scroll, wand, ring, rope, sack, coins, gem), the name, the price (a quote
  shows the shop's price struck through beside it), how many are left for a limited
  line, "New" on a just-revealed one, "Sold out" greyed. Sorted: revealed specials
  first, then by kind, then by name. A search box and kind chips once a shop holds
  more than twelve cards.
- **A tap on a card** opens its detail: the picture large, the pack's short text for
  an SRD item (the `text` the pack already holds, which is our own words), weight,
  Attunement if it needs it, and the actions: a count stepper and **Buy for 4 GP**
  (greyed with the engine's reason: "Ilya has 3 GP 2 SP"), **Ask to haggle** for a
  player. The DM sees **Haggle** instead (pick the character, the skill, the DC
  filled with the default; Roll), **Set price**, **Hide again** for a special, and
  **Give it away** (a quote of 0).
- **Sell** lists what the chosen character carries, each with the shop's offer or
  "Ask the DM"; a tap sells, after one confirmation that names the coins.
- **A loot package** is the same grid with **Take** in place of Buy, the coins as one
  card ("120 GP, 40 SP") with Take some and, for the DM, Share out evenly.
- **Phone (390 x 844).** Two columns of cards, at least 44 by 44 pixels to tap;
  the purse bar sticks to the top; the detail is a bottom sheet over the grid; the
  stepper's buttons are thumb-sized; Escape, the close button and a swipe down close
  the sheet, then the store. Desktop: four to six columns.

**The DM's shop controls, in a game.** The DM tab gets a "Shops" section: the
imported markets (Import from file or from My markets, Remove), the shops with their
state (Shown to nobody / everyone / 2 players), and per shop: Show to (none, all,
pick players), Edit (name, blurb, art, markup, buys, haggle, keeper, where), the
specials with a Reveal or Hide switch each, Add a line (from the pack's items with a
search, or a named line with a price), Override a listed line's price or stock,
Close. A store's storefront, opened by the DM, has the same controls on its cards.

**The market editor, outside a game.** The build screen pattern of
`portable-characters.md` Decision 6: from the lobby, "My markets": new, open, export,
import. A pack is edited as lists (rows with name, item, price, picture), store
templates and loot templates. The same card grid previews a store as players will
see it. "Start from the SRD prices" adds a list of the pack's priced items. The
editor lints with `lintMarket` as you type and shows its sentences.

### Decision 9: what is written down

- **Undo.** Every action of this spec is an ordinary step in `history.js`: the DM's
  Undo takes back a purchase whole (the coins, the change, the item, the stock, the
  quote) and a haggle with its roll; Redo rolls the same dice again. Players have no
  undo, as today; a player who tapped Buy by mistake asks the DM, or sells it back.
  Labels: "Ilya bought Rope x3", "The DM showed the Outfitter", and so on, through
  `describeStep`, naming only what that viewer may know.
- **The log** (T7c). Every trade event is of kind `loot` ("Loot and trades"), added to
  `LOOT` in `logview.js`, and `describe` in `app.js` writes:
  - `bought`: "Ilya buys Rope x3 at the Outfitter for 3 GP (paid 5 GP, 2 GP back)."
  - `sold`: "Tor sells a Shortbow to the Outfitter for 12 GP 5 SP."
  - `quoted` by a haggle: "Ilya haggles over the Wand of Magic Missiles (Persuasion 17): 360 GP."
  - `quoted` by hand: "The Outfitter will sell Ilya the Wand of Magic Missiles for 300 GP."
  - `goodsRevealed`: "Something new at the Outfitter: Wand of Magic Missiles, 400 GP."
  - `took`: "Ilya takes 30 GP from a strongbox." Split: "The DM shares out the strongbox: 30 GP each to Ilya, Tor, Orla and Brenna; 2 SP left."
  - `shopShown`: "The Outfitter is open." `shopClosed`: "The Outfitter has closed."
  - DM only (the DM-only chip): `shopOpened`, `shopEdited`, the haggle's DC and steps.
- **The timeline and the chronicle.** Trade events go to the timeline as all events
  do, so `recall` and a later AI DM read them. Nothing goes to the chronicle by
  itself; the DM writes one if the purchase is part of the story.

## What the engine, server and rules must add

| # | Addition | Kind | Who may send | DM sees | Players see | Version |
|---|---|---|---|---|---|---|
| X1 | `content/srd52/prices.js`: Coin Values, Magic Item Rarities and Values with the consumable and Spell Scroll rules, Spell Scroll Costs, and the selling rates; linted (`schema.js`) | content | — | — | — | no |
| X2 | `market.js`: the market document's format, `lintMarket`, `migrateMarket`; `listPrice(line, shop, market)`, `haggle(price, total, dc, step)`, `pay(purse, cp)` and `change(cp)`; pure | rules module | — | — | — | no |
| X3 | `e.coins`, `state.markets`, `state.shops`; migration 21 to 22 gives `markets: []`, `shops: []` | state | engine | all | `coins` on open creatures; `viewShops` per player | **21 to 22** |
| X4 | `engine/trade.js`: `market`, `openShop`, `shopEdit`, `showShop`, `revealGoods`, `closeShop`, `quote`, `buy`, `sell`, `take`; `give { coins }` in `characters.js`; `askCheck { about }` in `scenes.js` | actions | as Decision 4 | everything | as Decision 3 | 22 |
| X5 | Events: `shopOpened`, `shopEdited` (DM only); `shopShown`, `shopHidden`, `shopChanged`, `shopClosed`, `goodsRevealed`, `quoted`, `bought`, `sold`, `took` (those the shop is shown to); `coins` (open creatures); `gear` with `why` `buy`, `sell`, `take` | events | engine | all | listed in `viewEvents`, shaped as Decision 3 | 22 |
| X6 | `view.js`: `viewShops` and the event rules; `history.js`: the ten labels | view | — | — | — | no |
| X7 | `tables.js`: `market` joins `MAP_ACTIONS` (1 MB for the DM); `packages/server/README.md` lists the actions | server | DM | — | — | no |

Nothing here lets a client say a price, a quote, the coins taken or the change: the
client sends `buy { line, qty }` and reads the result.

## Tasks

Ordered so each stage is useful alone. "Engine lane" is the strongest model, since
these change `engine/`, `view.js`, `schema.js` or the server. Each is one pull
request with `npm test` and `npm run build`; client ones are checked at 1280 x 800
and at 390 x 844 with touch.

| # | Task | Who | Touches | Done when |
|---|---|---|---|---|
| P1 | **SRD prices as data.** X1. | engine lane (schema) | `content/srd52/prices.js` (new), `content/index.js`, `content/schema.js`, `tests/` | Every number compared with `reference/srd52`; `checked: true`; a test that the Potion of Healing comes to 50 GP, the Wand of Magic Missiles 400 GP and +1 Armor (Plate Armor) 5,500 GP. |
| P2 | **The market document.** X2. | engine lane | `packages/rules/src/market.js` (new), `tests/` | `lintMarket` refuses each case of Decision 2 with a sentence; prices parse; `pay` and `change` pass a table of cases; `haggle` passes the table of Decision 6. No engine file changes. |
| P3 | **Purses and shops, engine.** X3 to X6. | engine lane | `engine/trade.js` (new), `engine.js` (spread the handlers), `engine/characters.js` (`give { coins }`, keep `coins` on remake), `engine/sheets.js` (only if remake needs it), `scenes.js` (`about`), `view.js`, `history.js`, `migrate.js`, `tests/` | Import, open three shops from one template, add a special to two; buy at list and at a haggled price; change is right; a refused buy changes nothing; a hidden line never reaches a player message; a guessed id gets "No such item."; undo restores coins, stock and dice; 21 to 22 migrates. |
| P4 | **Server.** X7. | engine lane | `packages/server/src/tables.js`, `packages/server/README.md`, `packages/server/test/` | A 900 KB market from the DM is taken; from a player it is refused; a player's buy goes through `apply()` with their role. |
| P5 | **The storefront.** | client agent | `packages/client/shop.js` (new), `shop.css` (new), `index.html`, `app.js` (`describe`, the drawer row, the toast), `logview.js` (`LOOT`), `scripts/smoke/shop.mjs` (new), `test/` | Decision 8's storefront and loot package for a player and the DM at both sizes; Buy, Sell, Take, Ask to haggle, Haggle, Set price; the log lines of Decision 9. |
| P6 | **The DM's shop controls.** | client agent | `packages/client/shops-dm.js` (new), `tablecontrols.js`, `shop.css`, `test/` | Import a market from a file, open, show, reveal, override, close; the port-city example takes under two minutes on a tablet. |
| P7 | **The market editor and My markets.** | client agent | `packages/client/markets.js` (new), the lobby in `index.html`, `transport.js` (the `hextable.markets` key only), `test/` | A pack made with no game, exported, imported into a game, and used; the linter's sentences shown while editing. |
| P8 | **Later.** Adventuring Gear as pack data (question 8); "Make a package of these" and coin loot lines on the rewards form; packages in piles after E17; coins in the send-off of `portable-characters.md` (question 6). | content agent; engine lane | each its own issue | — |

P1 and P2 can be built at once; P3 needs both; P4 needs P3; P5 needs P3 and P4; P6
needs P5; P7 needs P2 and P6's card component.

## Security and hidden-information review points

1. **No price from a client.** `buy`, `sell` and `take` carry ids and counts only; a
   player's `quote` or `shopEdit` is refused. A test sends a forged `price` and a
   forged `paid` and asserts they are ignored or refused.
2. **Hidden means absent.** With a hidden special, no player message contains its id,
   name or price until `goodsRevealed`; the same for a shop not shown.
3. **Same refusal.** A guessed shop id and a guessed line id get exactly the answer a
   missing one gets.
4. **The DM's knobs stay private.** `haggle`, `notes`, `waits`, `keeper`, `from`, the
   DC and the steps never reach a player.
5. **Numbers in range.** Every count and coin is a whole number with a ceiling, so no
   sum overflows a safe integer (10,000,000 GP is 10^9 CP).
6. **Pack text is plain text.** Every string from a market pack is shown with `esc`;
   none is rendered as HTML or a link. Art goes through the asset rules of M9.
7. **Undo is the DM's.** A player cannot undo a purchase.

## Risks

- **The purse is a new thing on every character.** Old games have none; a DM who
  wrote "35 gp" in gear converts it by hand (question 9).
- **Lists by reference.** A re-imported pack changes three shops at once; that is the
  point, and the DM's import screen says which shops a new version touches.
- **Haggling is a convention.** Some tables will want a different rule; the step and
  DC are per store, and Set price covers the rest.
- **Coins of five kinds on a phone.** The purse bar shows the coins and, on a tap,
  their worth in gold; paying needs no choice.

## Questions for the owner

1. **Coins as five kinds, or one total?** *Default: five kinds, as the SRD has them;
   pay from the smallest up, change in the largest down, never Electrum as change.*
2. **The haggle rule.** *Default: one step (10 percent) off on meeting the DC, two
   steps on beating it by 10; no change on a failure, and the Influence action's
   24-hour wait before the same character haggles over the same item again; the DM
   can always set a price by hand. The step and the DC are per store.*
3. **Do stores buy magic items?** The SRD gives values, not a buying rule. *Default:
   only at a price the DM quotes; a store may set `buys.magic` to a percent.*
4. **Does the DM approve each purchase of a special item?** *Default: no. Revealing it
   and setting its price is the approval; the player buys when they are ready.*
5. **A party purse?** *Default: no. Each character has their own coins; a loot
   package's Share out evenly does the splitting.*
6. **Do coins leave with a portable character?** *Default: yes, as items do, under the
   `takeaway` setting and the DM's send-off; an amendment to `portable-characters.md`.*
7. **Does what the party sells go on the shelf?** *Default: no. It would put the
   party's items in front of the next buyer and make stock the DM must tend, which the
   owner wants to avoid. The DM can add it as a line.*
8. **Enter the Adventuring Gear table as pack data** (rope, rations, torches and the
   rest, with their SRD prices and weights), so a standard store needs no typed
   prices? *Default: yes, as its own content job, checked against the SRD.*
9. **Old "35 gp" lines in gear.** *Default: left as names; the Items tab offers the DM
   "Turn into coins" on a line that reads as coins.*
10. **Shopping in a fight.** *Default: refused for players; the DM can still edit.*
11. **Tie a store to a scene**, so that starting the scene shows it? *Default: not
    now; the DM shows it with one tap.*
