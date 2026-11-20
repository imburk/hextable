# Spec: shops and loot packages

Status: draft by an agent, to be reviewed by the design owner. Issue #292 (the
owner's request of 14 November). Nothing here is built except P2 (the market
document; see "Build notes: P2"). No code is written by this spec. **Amended 15 November 2026** (#347) to the owner's answers to questions
2, 3, 5 and 10 (a roleplaying bonus on haggling, stores that buy magic items, split
payment, and shopping only inside a shop area); the other questions are confirmed
on their defaults; see "Questions for the owner". The "customs" request that came
with question 5 is in `portable-characters.md`.

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

From the owner's answers of 15 November: **players buy and sell only when they
are in a store**, which on a map means the character's pawn stands inside the
store's **shop area**; a store **buys magic items** by itself at 70 percent of their
value; the DM has a button for a further 5 percent off for **good roleplaying**; and
the vendor **takes split payments**, so several characters can each pay a share of
one purchase.

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
- **Grid-agnostic.** A shop is not on the grid. Where it is tied to a place, a store
  is tied to a **shop area** of the map (a named set of cells, by id) and a loot
  package to an object, which works on hex and square maps alike.
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
| **Where a creature stands** | `regionAt(map, level, hex)` (`space.js`) says which region a cell is in; `footprint(e)` the cells a creature fills, by size and grid. Regions are a partition of a level and reveal a place room by room (`maps-and-objects.md` Decision 7). | A named area that may lie inside a region and reveals nothing; a rule for "inside" for a creature that fills several cells. |
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
      buys: { equipment: 50, trade: 100, magic: 70 },                          // percent of value paid when the party sells; magic defaults to 70; null: that store does not buy it by itself, only by the DM's quote
      haggle: { step: 10, dc: 15, bonus: 5 },                                  // Decision 6; bonus: points for good roleplaying (default 5)
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
  at?: { area } | { object },                                                    // Decision 4: a store's shop area (an id on the map in play), a loot package's object
  lines: [ ... ],                                                                // its own: the template's specials plus what the DM added
  overrides: { [lineId]: { price?, qty?, gone?: true } },                        // changes to listed lines, for this shop only
  coins?: { gp, sp, ... },                                                       // a loot package's coins
  shown: 'none' | 'all' | [userIds],
  quotes: [ { id: 'q2', line? , item?, for, price, sell?: true, by: 'dm' | 'haggle', roleplay?: true } ],
  joint: [ { id: 'j1', line, qty, price, buyer, pledges: { [creature]: copper } } ],   // purchases several characters pay together (Decision 5)
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
  quotes: [ { id, line?, item?, for, price, sell? } ],                     // standing offers for party characters
  joint: [ { id, line, name, qty, price, buyer, pledges } ],               // purchases being paid together (Decision 5)
  area?: [ cells ],                                                        // a store's shop area, only the cells in tiles this player is sent
  here?: [ creatureIds ] }                                                 // party characters standing in the area now (a store with an area, a map in play)
```

| A player is sent | Never sent |
|---|---|
| shops shown to them, as above | a shop not shown to them: not its id, not that it exists |
| revealed specials with their price and how many are left | a hidden special: not its id, its name, its price, or how many hidden lines there are |
| quotes for party characters, and the purchases being paid together | `haggle` (step, DC, bonus), `roleplay`, `notes`, `from`, `waits`, `keeper`, `at` |
| the outline of a shown store's shop area, and which of the party stand in it | the area of a shop not shown to them (it is not drawn on their map and not sent), and cells of an area in tiles they are not sent |
| — | `state.markets`, ever, and the DM's notes in a pack |

- **Revealing.** `revealGoods { shop, line }` (DM) shows a hidden special. Players it
  is shown to get `goodsRevealed { shop, line, name, price, qty }` and the card turns
  up with a "New" mark. `revealGoods { shop, line, hide: true }` takes it back out of
  sight (a quote on it is withdrawn).
- **Refusals for players are the same as for a thing that does not exist**: a shop
  not shown, or a line hidden, gets "No such shop." or "No such item.", whatever the
  id. **The order of the checks matters for this** (Decision 4): whether the shop
  exists and is shown to this player comes before anything about where the character
  stands, so "Ilya is not at the Outfitter." is only ever said about a store the
  player was shown, and standing in the area of a store that was not shown gets
  "No such shop." and nothing more. Line ids are the author's words, not a counter, so their gaps say nothing.
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

**Choice.** Eleven actions, in a new handler module `engine/trade.js` (the domain split
of `CLAUDE.md`), helpers in `market.js`, and one form added to `give`. "Controller"
is the player who controls the character (`control` in `engine/shared.js`).

| Action | Shape | Who | What it does |
|---|---|---|---|
| `market` | `{ add: doc }` or `{ remove: id }` | DM | Decision 2 |
| `openShop` | `{ kind: 'store' \| 'loot', name, market?, template?, at?, keeper? }` | DM | makes a shop from a template (its lists, markup, buys, haggle, specials, art) or from nothing; starts unshown. `at` is `{ area }` for a store (the shop area, below) and `{ object }` for a loot package. Event `shopOpened { shop }` (DM only) |
| `shopEdit` | `{ shop, set?: { name, blurb, art, markup, buys, haggle, keeper, at, lists, notes }, add?: [line], remove?: [lineId], override?: { [lineId]: { price?, qty?, gone? } \| null }, coins? }` | DM | every change to one shop; `override: { id: null }` gives a line back to the list. Event `shopEdited { shop }` (DM only); a change to something a player can see also sends them `shopChanged { shop }` and the new shape comes with the view |
| `showShop` | `{ shop, to: 'none' \| 'all' \| [userIds] }` | DM | Decision 3. Event `shopShown { shop, name, to }`, to those now shown, never who else; `shopHidden { shop }` to those it is taken from |
| `revealGoods` | `{ shop, line, hide? }` | DM | Decision 3 |
| `closeShop` | `{ shop }` | DM | removes the shop and its quotes (undo brings it back). `shopClosed { shop }` to those it was shown to |
| `quote` | `{ shop, for, line \| item, price? , check?: { skill, dc? }, roleplay?, sell?, withdraw? }` | DM | an offer for one character: a price set by hand, or a haggle rolled (Decision 6); `roleplay` adds the bonus for good roleplaying to the quote; `sell` for an offer to buy what the character carries; `withdraw` removes it. Event `quoted` |
| `buy` | `{ actor, shop, line, qty?, pay?, split? }` or `{ actor, shop, joint, cancel? }` | controller, DM | Decision 5; `split` opens a purchase several characters pay together, `joint` settles or (with `cancel`) ends one |
| `chipIn` | `{ actor, shop, joint, share }` | controller, DM | a character's share of a joint purchase, in copper pieces' worth; `share: 0` takes it back. Decision 5. Event `pledged` |
| `sell` | `{ actor, shop, item, qty? }` | controller, DM | `item` is a sheet key (`i3`) or a name in `gear`. Decision 5 |
| `take` | `{ actor, shop, line, qty? }` or `{ actor, shop, coins }`; DM also `{ shop, split: [ids] }` | controller, DM | from a loot package. Decision 7 |
| `give` (extended) | `{ actor, coins: { gp: 35 }, take? }` | DM | hands coins over or takes them away, as it does items; event `coins { why: 'dm' }` |

Common checks, before anything changes:

- The shop exists and, for a player, is shown to them and of the right kind (`buy`,
  `sell` and `quote` need a store, `take` a loot package).
- The actor is up and not in a fight (in a fight: "Not in the middle of a fight."; the
  DM is not stopped). **Shopping stays refused in a fight even for a pawn inside the
  shop area** (the owner's answer). A creature that is down cannot shop; one that is
  Unconscious or Incapacitated cannot either.
- **Where** (the owner's answer to question 10: "players should only be able to buy
  and sell when in a store"). The checks run in this order, so a refusal never says
  more than the player was shown: (1) the shop exists and is shown to this player
  ("No such shop."); (2) the actor is up and not in a fight (the bullet above); (3) the place. The place rule is for
  `buy`, `sell`, `chipIn` and a settling `buy`, and for the **acting character, and
  every character paying a share**:
  - **No map in play** (a scene is open, or the table is on a navigation node of the
    atlas, `travel.md` Decision 1): only the `shown` rule applies. The DM opens the
    store with one tap, as before; this is the pedlar on the road.
  - **A map in play, a store with a shop area:** the character's pawn must be inside
    the area (below). The refusal says where: "Ilya is not at the Outfitter."
  - **A map in play, a store with no area, or an area that is not on this map** (the
    DM changed maps): players are refused, "The Outfitter has no place on this map."
    The DM's shop card shows the same sentence as a warning, with the button to draw
    the area. The store stays shown, and nothing is lost.
  - **The DM** is not stopped by the place rule, as it is not stopped in a fight.
  - **A loot package** keeps its object: with `at: { object }`, within 5 feet of it
    (the reach test objects use already, on hex or square maps); with no `at`, no
    place rule. Only stores have the shop-area rule: the owner's answer was about
    buying and selling.
  - **Inside** (design choice, lead's proposal): a pawn is inside an area when **any
    cell of its footprint** (`footprint(e)`, by its size on the map's grid) is a cell
    of the area, on the area's level. A Large pawn standing half in the doorway is
    in; so is a Medium one on the threshold cell. The rule is the generous one, so a
    big creature is never locked out of a shop it can see, and it is one test that
    both grids share. A creature that is down, Unconscious or Incapacitated is
    refused by the actor check above, not by the place.
- Numbers are whole and in range: `qty` 1 to 99 (a line's stock or 99, whichever is
  less), coins 0 to 10,000,000 of each kind.

**Reasons.** One module per domain, as the engine is laid out; one DM action per
thing the DM does, so each is one line in the history and in the log. `give` already
hands out items, so it hands out coins.

**The shop area** (design choice, lead's proposal; the owner chose the rule, not the
drawing). Not a region: regions partition a level and reveal it room by room, so a
stall in a street square cannot be one without splitting the street. A shop area is
a new, optional list on the map document, `areas: [ { id, name, level, hexes } ]`
(`hexes` is the key the map already uses for cells on both grids), which reveals
nothing, changes no light or sight, and may lie inside a region or across several. It
is like `entries` in `travel.md` Decision 3: optional, so an older build ignores it
and the map `format` stays 2; `lintMap` checks the ids are unique, the level exists
and every cell is a tile of it; `mapEdit` gains an `areas` change beside `regions`. A
store points at one by id (`at: { area }`). Several stores may share an area (three
stalls in one market square) and one store has one area. The DM draws it in the map
editor with a brush ("Shop area", a tinted outline with the area's name) or in play
with the same `mapEdit`, and picks it on the shop's card. On the map it is a tinted
outline with the store's name: the DM sees every area (dashed when its store is not
shown), a player only the areas of stores shown to them. A module's stores name a
map's area by id (`adventure-module.md` A10).

**Cost.** Eleven labels in `history.js` (`describeStep`), eleven handlers, and the
view; one optional field on the map document with its linter and editor change (P3a).

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

**Paying together** (the owner's answer to question 5: "it's common for a character
buying a magic item to need help from other players ... I'd prefer it if the vendor
takes split payments"). There is still no party purse: each character keeps their
own coins, and several of them can each pay a share of one purchase. How it is
offered and settled is not the owner's wording, so it is **(design choice, lead's
proposal)**:

1. **Opening.** A character who wants a line they cannot pay alone, or does not
   want to pay alone, taps **Buy with help** on its card: `buy { actor, shop, line,
   qty, split: true }`. The checks of Decision 4 run (the shop, the place, the line,
   the stock), the price is worked out once, as for any buy (a standing quote for
   this character counts), and a **joint purchase** is recorded on the shop:
   `{ id, line, qty, price, buyer, pledges: {} }`. No coin moves. The card shows to
   everyone the shop is shown to: "Ilya is buying the Wand of Magic Missiles for 400
   GP. Pledged: 0 of 400 GP."
2. **Pledging.** Any party character who may shop here (the checks of Decision 4, the
   place rule included) sends `chipIn { actor, shop, joint, share }`: a share in
   copper pieces' worth, at least 1 and at most what their purse is worth (the
   screen shows it in coins). Sending it again replaces it; `share: 0` takes it back.
   A player sends it only for a character they control, so nobody can pledge another
   player's coins (the DM can, as for any action). The **buyer's own share is what
   nobody else has pledged**: the buyer pays last, and the screen says how much that
   is as pledges come in.
3. **Settling.** The buyer (or the DM) taps **Pay**: `buy { actor, shop, joint }`.
   Everything is checked again, all or nothing: the line and the stock, the place for
   every payer, the pledges together no more than the price, and each payer's purse
   worth at least their share (the buyer's included). A refusal names the one who is
   short ("Tor has 3 GP; his share is 100 GP.") and changes nothing, and the pledges
   stay for the table to fix. When it passes, each payer's share is taken as a buy
   takes it (smallest coins up, change in the largest, `pay` not offered), the goods
   land with the **buyer**, stock goes down once, and the buyer's quote is used up.
   A pledge is a promise, not a held coin: nothing is set aside, so a character who
   spends the coins elsewhere before Pay simply fails the re-check.
4. **Ending.** A joint purchase ends when it is settled, when the buyer or the DM
   cancels it (`buy { joint, cancel: true }`), or by itself when its shop closes or
   is taken out of sight, when a fight starts, when the line is gone or has too
   little stock, or when the buyer is refused by the place rule (they walked out of
   the area). Pledges end with it. At most three are open at once in one shop
   **(design choice)**.
5. **Events.** `jointOpened { shop, id, line, name, qty, price, buyer }`, `pledged {
   shop, id, who, share }`, `jointEnded { shop, id, why }`, and, on settling, one
   `bought { shop, id, line, name, qty, price, payers: [ { id, paid, change } ] }`
   with a `coins { id, coins, why: 'buy' }` for each payer and the `gear` for the
   buyer. All of them go to the players the shop is shown to, as the other trade
   events do: it is the party's own money and everyone at the table sees the sheets.

A plain transfer of coins from one character to another outside a store is not part
of this spec; the DM's `give { coins }` moves coins as it moves items, and a later
`pass` for coins (the items' `pass`, `engine/characters.js`) is a small extension if
the table wants it.

**Selling.** `sell { actor, shop, item }`. The offer, in order: a standing `sell`
quote for that actor and item; otherwise, if the item matches a line of the shop
(same pack id, or same name for named goods), that line's list price times the
shop's `buys` percent for its kind; otherwise a weapon or armour of the pack at its
`cost` times `buys.equipment`. Defaults follow the SRD: equipment 50, trade goods and
valuables 100. **Magic items** (the owner's answer to question 3: "let's make it 70
percent of value") are bought **without a DM step** at `buys.magic` percent of the
item's **value**, which is 70 unless the store says otherwise. The **value** is the
list price of step 3 above (the rarity's value, halved for a consumable, a Spell
Scroll at double its scribing cost, plus the `cost` of its `base`), so a Wand of
Magic Missiles is bought at 280 GP and a Potion of Healing at 35 GP. The value is
never the shop's markup or a line's own price **(design choice: "value" is the SRD's
number, so a store that marks a wand up does not pay more for one)**. A store whose
`buys.magic` is `null` makes no automatic offer, and the DM still sets a price with
a `sell` quote, as for any item, whatever `buys.magic` says: the DM's price always
wins. An Artifact has no value and so no automatic offer. No offer: "The Outfitter
makes no offer for the Ring of Swimming. Ask the DM." A worn, wielded or attuned item is refused
("Take it off first"); an item being attuned to stops being attuned to. The coins are
paid in the largest kinds first. Events: `sold`, `coins { why: 'sell' }`,
`gear { why: 'sell', taken: true }`. What is sold is not added to the shop's stock
(question 7 says why).

**Reasons.** Coins as coins keep the SRD's five pieces honest and loot exact;
copper arithmetic avoids fractions; paying from small coins and changing into large
ones is what a purse does and needs no choices on a phone.

**Cost.** A new state field on creatures and a state version (22), the joint
purchases on a shop (inside the shops' own field, so no further version). Old
`"35 gp"` lines in `gear` stay names; they are not parsed (question 9).

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
- **The roleplaying bonus** (the owner's answer to question 2: "1 with a button for
  the DM to a roleplaying bonus, +5%"). Beside the roll the DM has a button, **Good
  roleplaying**, which is `quote { ..., roleplay: true }`. It takes a further **5
  percent of the list price** off the quote (or adds 5 to a sell offer): 15 percent
  off in all after a roll that met the DC, 25 after one that beat it by 10, 5 on
  its own. That is the reading the lead gave the owner (10 and 20 percent as
  drafted, plus a further 5), and he did not correct it. The rest is **(design
  choice, lead's proposal)**: the 5 is a store field, `haggle.bonus`, default 5; it
  is points of the list price, not of the price already reduced; it applies once to
  a quote (a second tap changes nothing); the DM may press it before or after the
  roll, or with no roll at all, and after a failed roll it does not lift the
  Influence wait, which a hand-set price already can; a price is never taken below
  1 CP. **A sell offer is never above the item's value** (or, for a line the store
  sells, never above the store's own price for it): with the haggle steps and the
  bonus a trade good that sells at 100 percent could otherwise be bought low and
  sold high in a loop, and an automatic offer for a magic item (70 percent, plus at
  most two steps and the bonus, 95) stays under its value.
- **Overrides.** `quote { shop, for, line, price }` sets the price outright, before or
  after a roll: the DM's word on a seller who will not budge, a friend's discount,
  or a price that rises because the threat went badly. `withdraw` removes a quote.
- **What a player sees.** The check's dice and total (as any check of their own), and
  the new price. Not the DC and not the word "success": the price is the answer, as a
  shopkeeper's reply would be. A price set by hand is shown as the price, without
  saying how it was reached, and the bonus for roleplaying is a part of the price,
  never named to players (the DM's chip shows it).
- **How long a quote lasts.** Until it is used by a purchase, withdrawn, the line is
  hidden, or the shop is closed. It is for one character: another party member pays
  the shop's price unless they haggle too.

Event: `quoted { shop, for, line | item, price, was, sell?, by: 'dm' | 'haggle',
check?: { skill, rolls, total } }`, with the DC, `steps` and `roleplay` only for the DM.

**Reasons.** The owner asked for a check that moves the price by a rule the DM may
override, with no hidden die. The Influence action gives the DC, the skills and the
retry rule from the SRD; only the size of a step is ours, and it is a store field.

**Cost.** One rule function in `market.js` and its table of cases in tests (the bonus
and the cap on a sell offer are cases of it).

### Decision 7: loot packages

**Question.** How is something found, taken and shared out?

**Choice.** A loot package is a shop of kind `loot`: lines with `qty` and no price,
and `coins`. It is opened from a template or from nothing (`openShop { kind: 'loot' }`),
shown as a store is, and may be tied to a place (`at: { object }`: the chest; a loot package has no shop area).

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
  (greyed with the engine's reason: "Ilya has 3 GP 2 SP", or "Ilya is not at the
  Outfitter." when the pawn is outside the shop area), **Buy with help** (Decision 5:
  it opens a joint purchase), **Ask to haggle** for a player. The DM sees **Haggle**
  instead (pick the character, the skill, the DC filled with the default; Roll, and
  the **Good roleplaying** button beside it), **Set price**, **Hide again** for a
  special, and **Give it away** (a quote of 0).
- **A joint purchase** shows as a strip above the cards while one is open: what is
  being bought, the price, each pledge ("Tor 100 GP"), what is still the buyer's
  ("Ilya pays 200 GP"), and for a character that may shop here a **Pledge** stepper
  (in coins, with the purse beside it) and, for the buyer, **Pay** and **Cancel**. Pay
  is greyed with the engine's sentence naming whoever is short.
- **On the map**, a store's shop area is a tinted outline with its name; the
  storefront's header says "You are in the Outfitter" or "Walk into the Outfitter's
  area to trade", from the `here` list, and a tap on the name pans to it.
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
**Where** (pick the shop area on the map in play, or Draw an area, which opens the
map editor's Shop area brush; a store with no area on a map shows the warning of
Decision 4), Close. A store's storefront, opened by the DM, has the same controls on its cards.

**The market editor, outside a game.** The build screen pattern of
`portable-characters.md` Decision 6: from the lobby, "My markets": new, open, export,
import. A pack is edited as lists (rows with name, item, price, picture), store
templates (with what each buys, magic items at 70 percent unless changed, and its
haggle step, DC and roleplaying bonus) and loot templates. The same card grid previews
a store as players will see it; where a store stands is not in the pack (a shop area
belongs to a map, Decision 4). "Start from the SRD prices" adds a list of the pack's priced items. The
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
    A joint purchase: "Ilya buys the Wand of Magic Missiles at the Outfitter for 400 GP:
    Ilya 200 GP, Tor 100 GP, Orla 100 GP." `pledged`: "Tor pledges 100 GP towards the
    Wand of Magic Missiles." `jointEnded`: "The joint purchase of the Wand of Magic
    Missiles was cancelled."
  - `sold`: "Tor sells a Shortbow to the Outfitter for 12 GP 5 SP."
  - `quoted` by a haggle: "Ilya haggles over the Wand of Magic Missiles (Persuasion 17): 360 GP."
  - `quoted` by hand: "The Outfitter will sell Ilya the Wand of Magic Missiles for 300 GP."
  - `goodsRevealed`: "Something new at the Outfitter: Wand of Magic Missiles, 400 GP."
  - `took`: "Ilya takes 30 GP from a strongbox." Split: "The DM shares out the strongbox: 30 GP each to Ilya, Tor, Orla and Brenna; 2 SP left."
  - `shopShown`: "The Outfitter is open." `shopClosed`: "The Outfitter has closed."
  - DM only (the DM-only chip): `shopOpened`, `shopEdited`, the haggle's DC and steps,
    the roleplaying bonus.
- **The timeline and the chronicle.** Trade events go to the timeline as all events
  do, so `recall` and a later AI DM read them. Nothing goes to the chronicle by
  itself; the DM writes one if the purchase is part of the story.

## What the engine, server and rules must add

| # | Addition | Kind | Who may send | DM sees | Players see | Version |
|---|---|---|---|---|---|---|
| X1 | `content/srd52/prices.js`: Coin Values, Magic Item Rarities and Values with the consumable and Spell Scroll rules, Spell Scroll Costs, and the selling rates; linted (`schema.js`) | content | — | — | — | no |
| X2 | `market.js`: the market document's format, `lintMarket`, `migrateMarket`; `listPrice(line, shop, market)`, `haggle(price, total, dc, step, bonus)`, `pay(purse, cp)`, `change(cp)` and `settle(joint, purses)` (a joint purchase's shares); `buys.magic` defaults to 70; pure | rules module | — | — | — | no |
| X3 | `e.coins`, `state.markets`, `state.shops`; migration 21 to 22 gives `markets: []`, `shops: []` | state | engine | all | `coins` on open creatures; `viewShops` per player | **21 to 22** |
| X4 | `engine/trade.js`: `market`, `openShop`, `shopEdit`, `showShop`, `revealGoods`, `closeShop`, `quote`, `buy` (with `split`, `joint`), `chipIn`, `sell`, `take`; the place rule and the shop area's test; `give { coins }` in `characters.js`; `askCheck { about }` in `scenes.js` | actions | as Decision 4 | everything | as Decision 3 | 22 |
| X5 | Events: `shopOpened`, `shopEdited` (DM only); `shopShown`, `shopHidden`, `shopChanged`, `shopClosed`, `goodsRevealed`, `quoted`, `bought`, `sold`, `took`, `jointOpened`, `pledged`, `jointEnded` (those the shop is shown to); `coins` (open creatures); `gear` with `why` `buy`, `sell`, `take` | events | engine | all | listed in `viewEvents`, shaped as Decision 3 | 22 |
| X6 | `view.js`: `viewShops` and the event rules; `history.js`: the eleven labels | view | — | — | — | no |
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
| P2 | **The market document.** X2. | engine lane | `packages/rules/src/market.js` (new), `tests/` | `lintMarket` refuses each case of Decision 2 with a sentence; prices parse; `pay` and `change` pass a table of cases; `haggle` passes the table of Decision 6, including the 5-point bonus and the cap on a sell offer; a magic item sells at 70 percent of its value by default (a Wand of Magic Missiles 280 GP) and at nothing automatic when `buys.magic` is null; `settle` splits a price exactly and refuses a share that is too big. No engine file changes. |
| P3 | **Purses and shops, engine.** X3 to X6. Needs P3a for the place rule. | engine lane | `engine/trade.js` (new), `engine.js` (spread the handlers), `engine/characters.js` (`give { coins }`, keep `coins` on remake), `engine/sheets.js` (only if remake needs it), `scenes.js` (`about`), `view.js`, `history.js`, `migrate.js`, `tests/` | Import, open three shops from one template, add a special to two; buy at list and at a haggled price; change is right; a refused buy changes nothing; a hidden line never reaches a player message; a guessed id gets "No such item."; undo restores coins, stock and dice; 21 to 22 migrates; a joint purchase of 400 GP pledged by three characters settles all or nothing, refuses naming whoever is short and changes nothing, and undo restores all three purses; a pawn outside the shop area is refused "Ilya is not at the Outfitter." for a shown store and "No such shop." for one not shown; a Large pawn with one cell in the area is inside; a fight refuses even a pawn inside; with a scene open only `shown` applies; a store with no area on a map refuses players. |
| P4 | **Server.** X7. | engine lane | `packages/server/src/tables.js`, `packages/server/README.md`, `packages/server/test/` | A 900 KB market from the DM is taken; from a player it is refused; a player's buy goes through `apply()` with their role. |
| P3a | **Shop areas on the map.** The optional `areas` list of the map document (Decision 4): `lintMap`, `mapEdit`, `inArea(map, area, e)` (any cell of the footprint), what players are sent of an area of a shown store only; format stays 2. Can run beside P2. | engine lane | `map.js`, `space.js`, `view.js` (the area's outline), `packages/rules/test/map.test.js`, `view.test.js` | An older build reads the map and ignores `areas`; a bad id, level or cell is refused with a sentence; a Large pawn is inside with one cell in the area on either grid; the area of a store not shown is in no player message, and neither are cells in tiles a player is not sent; every stock map still lints. |
| P5 | **The storefront.** | client agent | `packages/client/shop.js` (new), `shop.css` (new), `index.html`, `app.js` (`describe`, the drawer row, the toast), `logview.js` (`LOOT`), `scripts/smoke/shop.mjs` (new), `test/` | Decision 8's storefront and loot package for a player and the DM at both sizes; Buy, Buy with help (open, pledge from two other characters, pay), Sell, Take, Ask to haggle, Haggle with Good roleplaying, Set price; Buy greyed with "is not at the" outside the area; the log lines of Decision 9. |
| P6 | **The DM's shop controls.** | client agent | `packages/client/shops-dm.js` (new), `tablecontrols.js`, `shop.css`, `test/` | Import a market from a file, open, show, reveal, override, close, pick a shop's area; the port-city example takes under two minutes on a tablet. |
| P6a | **Shop areas in the map editor and on the map.** The Shop area brush (tinted outline, a name), the outline drawn on the map for the DM and, for a shown store, for players, through the renderer's overlay; the "You are in the Outfitter" header. Needs P3a and P5. | client agent | `packages/client/editor.js`, the renderers' shared overlay (`render-three.js` and, until R14 removes it, `render.js`), `shop.js`, `test/`, `scripts/smoke/shop.mjs` | At both sizes the DM paints an area, a player walks a pawn into it and Buy wakes, walks out and it greys with the engine's sentence; a store not shown draws no outline for the player. |
| P7 | **The market editor and My markets.** | client agent | `packages/client/markets.js` (new), the lobby in `index.html`, `transport.js` (the `hextable.markets` key only), `test/` | A pack made with no game, exported, imported into a game, and used; the linter's sentences shown while editing. |
| P8 | **Later.** Adventuring Gear as pack data (question 8); "Make a package of these" and coin loot lines on the rewards form; packages in piles after E17; coins in the send-off of `portable-characters.md` (question 6, confirmed 15 November), with the customs highlight there. | content agent; engine lane | each its own issue | — |

P1 and P2 can be built at once, and P3a beside them; P3 needs all three; P4 needs P3;
P5 needs P3 and P4; P6 needs P5; P6a needs P3a and P5; P7 needs P2 and P6's card
component.

## Build notes: P2 (the market document)

Built in `packages/rules/src/market.js` (pure, imports nothing, so it adds no import cycle) with `packages/rules/test/market.test.js`. No engine,
view, server or content file changed. What it does, and what it settled where this spec left a number or a shape open:

**What the content supplies is passed in, not read.** P1 (`content/srd52/prices.js`) is built beside it, so `market.js` reads no price table. The
functions that need prices take an `env`, which the engine (P3) builds from the pack and P1's data, and which the tests stub with the SRD numbers
quoted in this spec:

```
env.item(id)          -> { name, kind: 'weapon' | 'armour' | 'magic', cost?: '15 GP', rarity?, consumable?, scroll?, needs?: ['base' | 'type' | 'spell'] } | falsy
env.rarityValue(r)    -> the Magic Item Rarities and Values entry, in copper pieces; null for an Artifact
env.scrollCost(lvl)   -> the Spell Scroll Costs entry (the scribing cost), in copper pieces; the module doubles it
env.spellLevel(id)    -> a spell's level, or falsy for no such spell
```

`lintMarket(doc, env?)` checks the document alone without an `env`, and adds the checks against the table's content (item, base, spell, a price
for every priced line) with one. P3's `market { add }` passes the real one.

**Exports.** Money: `parsePrice`, `formatCp`, `formatCoins`, `cleanPurse`, `purseCp`, `change`, `pay`. Store settings: `buysOf` (equipment 50, trade
100, magic 70; `null` kept), `haggleOf` (step 10, dc 15, bonus 5), `haggleDc` (the store's DC or the keeper's Intelligence, whichever is higher).
Prices: `findLine`, `kindOf`, `unitValue` (the SRD value, Decision 5 steps 2 and 3), `basePrice`, `listPrice`, `sellOffer`. Negotiation and paying
together: `haggle`, `settle`. The document: `lintMarket`, `migrateMarket`, `MARKET_LIMITS`.

**Settled here (each is a reading of the spec; change it here and in the code together).**

- `lintMarket` returns a list of sentences, empty when the pack can be imported, as `lintMap` does; each begins with where it is
  (`stores/outfitter/special/wand: no such item "wand-of-magic-misiles"`, `lists/standard/lines/rope: ...`, `loot/strongbox/lines/dagger: ...`), and the
  list stops after 40 with one line saying there are more. `lists`, `stores` and `loot` may be left out of a document (they read as empty);
  `migrateMarket` fills them. A format version above 1 or a document that is not plain data is refused by the linter, not migrated.
- Stricter than the spec's prose, so that P3 has less to guess: a **list line has no `qty`** (stock is a special's or an override's), `hidden` is for
  specials only, `kind` is left out for a line with an `item` (it is derived), a **loot line needs a `qty` and has no `price`**, and a loot package
  also takes `blurb` and `art` (the storefront shows both for a shop of either kind). Line ids are unique across lists and specials of the whole
  pack; loot line ids are unique inside their package. Ranges the spec left open: `markup` 10 to 1000, `buys` 0 to 100 or `null`, `haggle.step` 0 to
  50, `dc` 1 to 40, `bonus` 0 to 25. The 128 KB limit counts the JSON without `assets`; the 1 MB limit counts the pictures decoded. A picture is
  `image/png`, `image/jpeg` or `image/webp` with base64 data; the bytes are not sniffed here (the server's asset rules do that on import, X7).
- A line's price: a stated price (a shop override first, then the line's `price`) is **final** and the markup does not touch it; otherwise the SRD
  value is marked up by `markup` percent, rounded up to a whole copper piece. An override's `price` may be a string like a cost or a whole number
  of copper pieces. A Spell Scroll is double its scribing cost and is not halved as a consumable; a consumable is halved rounding up.
- `sellOffer(thing, shop, market, env)` returns `{ cp, cap, basis }` or `null`. Magic: `buys.magic` percent of the SRD value, whatever the markup or
  a line's own price; `null` or an Artifact gives no offer. Otherwise a matching line (same pack id, or same name for named goods, and not `gone`)
  at its price before markup times `buys` for its kind (`weapon`, `armour`, `gear` use `equipment`; `trade` and `valuable` use `trade`); otherwise
  a weapon or armour of the pack at its cost times `buys.equipment`. Rounded **down**; an offer under 1 CP is no offer. `cap` is what a haggle may not
  lift it above: the value, or for a line the store's own price for it.
- `haggle(price, total, dc, step, bonus, { sell, cap })`: steps are 0, 1 or 2 as in the table of Decision 6; the points (`steps * step + bonus`) add up
  and are taken from the list price (up for a sell offer), rounded up to a copper piece, a buy never below 1 CP, a sell offer never above `cap` and
  never below the offer it started from. `total: null` is the bonus alone. `wait` is true for a rolled total below the DC and the bonus does not clear
  it. A buy that the points would take to nothing is held at 1 CP.
- `pay(purse, cp, named?)`: from the smallest coins up (CP, SP, EP, GP, PP), taking of each kind as many as the rest of the price needs, rounded up
  to a whole coin; the overpayment comes back as `change` in PP, GP, SP, CP (never EP). A purse always loses exactly the price. `named` pays with
  those coins, which must be held and cover the price. Nothing is changed in the purse given; the result carries the purse afterwards.
- `settle(joint, purses, names?)`: `joint.price` is the price of **one**, as in `buy`; the whole is `qty * price`. The buyer's share is the rest
  after the pledges, and **a pledge keyed by the buyer is refused** (Decision 5 says the buyer pays what nobody else has pledged; P3's `chipIn`
  should refuse the buyer too, with the same reason). Pledges may come to the whole price (the buyer then pays nothing) but not more. Every payer, the
  buyer last, pays as `pay` pays; the first one short is named (`Tor has 3 GP; the share is 100 GP.`). All or nothing: a refusal carries no purses.

**Not here, left to P3.** Checking that a `base` fits the magic item's own `base` rule (`{ weapon: 'any' | 'melee' | [ids] }`): the linter only checks that
it is a weapon or armour of the table, and `landItem` checks the rest when the item lands. The pack `hash`, the asset move, and the sniffing of picture
bytes are the import action's. Sharing coins out of a loot package (Decision 7) is `take`'s, not X2's. `CLAUDE.md`'s layout paragraph does not list
`market.js` yet; P3 adds it with `engine/trade.js`.

## Build notes: P3 (purses and shops, engine; #596)

Built in `packages/rules/src/engine/trade.js` (new; the eleven actions, the place rule `placeProblem`, the content lookups `marketEnv`, and
`settleShops`), with `give { coins }` in `engine/characters.js`, `coins` kept by `carryPlay` in `engine/sheets.js`, `askCheck { about }` in
`scenes.js`, `viewShops` and the trade events in `view.js`, the labels in `history.js`, and state version 28 in `migrate.js` (after #594's 27).
`view()` and the table server's per-player view (`packages/server/src/tables.js`, `stateFor`) both carry `shops`, so a networked player sees
the stores shown to them now, not at P4; P4 keeps `market` joining `MAP_ACTIONS` and the README. Tests: `packages/rules/test/shops.test.js`,
`packages/server/test/shops.test.js`.

**Settled here (each a reading of the spec; change it here and in the code together).**

- **The audience of an event.** Every trade event carries the shop's `shown` when it happened (`to`, and `except` for "everyone but"), and
  `viewEvents` passes it only to a player in it, live or from the record; the audience is never sent. `shopShown` goes to those newly shown,
  `shopHidden` to those it is taken from.
- **Pictures of a market (`assets`) are dropped on import**; `art` ids stay. Moving the bytes into the table's assets is the server's (P4, X7).
  `hash` is FNV-1a of what is kept.
- **A joint purchase's id is in `joint`, not `id`**, in `jointOpened`, `pledged`, `jointEnded` and a joint `bought`: `id` names creatures in the
  view's filter, and a `j1` there would be read as a creature the party does not know of.
- **Any fight ends open joint purchases** (`settleShops`, after every action), not only one its buyer is in, since players may not shop while
  any fight goes on. A purchase also ends when its buyer is down, its line is off the shelf or short, its buyer's player is no longer shown
  the store, or the buyer (a player's character, with a map in play) has left the shop area.
- **A magic item whose `base` names exactly one item** (a Sun Blade is a longsword) needs no `base` on a line, and its value does not add that
  item's cost (only a line's own `base` adds it). A table that wants the 15 GP gives the line its own `price`.
- **The haggle's roll** is the engine's `check` action (`features.js`; `abilityCheck` is not exported from `engine/rolls.js` as the spec
  supposed), run for the quoted character with no DC, so it is an ordinary open `check` event: players see the dice and total, never the DC.
  A quote keeps its `steps` and `roleplay`, so the bonus can be pressed before or after the roll and applies once; a failed roll sets the
  24-hour wait in world minutes (`waits`), which only a price set by hand gets round.
- **Selling** pays in the largest coins first (`change`), so 35 GP is 3 PP 5 GP. A name in `gear` that is a pack item's own name (a weapon,
  armour, or a magic item with no variant or base) sells as that item. A quote set for a name sells that name at that price.
- **Shop ids** count up in `state.shopSeq` (`s1, s2, ...`), so a closed shop's id is never used again.
- **Markets are held by reference** (review of #598, M3). Twenty packs at the 128 KB limit are 2.5 MB of JSON; copied before every action
  (apply()'s snapshot and the undo mark) they cost about 12 ms each, 25 ms an action, and the server's patch snapshot for the DM another 7.
  No action changes a market in place (`market` puts a new list in whole), so `freeze` in `engine.js` and `mark` in `history.js` hold the list
  by reference, and the table server keeps its JSON per list (`snapDM`). Measured after: an action and a mark cost what they cost without
  markets (under 0.5 ms each). `shops.test.js` holds the bound (under 3 ms more per action and per mark, markets deep-frozen). A future
  action that edits a market in place breaks this, and the frozen test catches it.
- **The fix round of the review of #598.** `take` reads a line's overrides as the view does (taken off: "No such item."; none left: "Sold
  out."; stock off the override; at none left the line and its override go). A `jointEnded` for `hidden` is told to players as `ended`. A
  pledge is taken back from anywhere (`share: 0`: no place, fight or up check); a joint purchase ends (`pledger`) when a pledger leaves the
  table or dies. A purse that is not a purse (a kind past 10,000,000, a coin not whole) is refused, not read as empty, and no buy, sell, take
  or settle may take a kind past the ceiling. A re-haggle that comes out worse than the standing quote leaves that quote. `revealGoods`
  refuses a special taken off the shelf; `shopEdit { set: { lists } }` refuses lists whose lines share an id with the shop's own.

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
8. **The place refusal says no more than the player was shown.** The shop's
   existence and being shown come first; only then "Ilya is not at the Outfitter."
   A test stands a pawn in the area of a store not shown to its player, sends `buy`,
   `sell` and `chipIn` with its id and with a guessed one, and asserts the answer is
   "No such shop." in every case and that no message names the store or its area.
9. **Areas are not leaked.** The outline and `here` go only to players the store is
   shown to, and only cells in tiles they are sent; the area of a store not shown, and
   an area of a store that has since been hidden again, are in no message or patch
   (the same canary test as a hidden line).
10. **Nobody pays with another player's coins.** `chipIn` and a settling `buy` are
    checked against `control`: a player's pledge for a character they do not control
    is refused; a forged `share` above the purse is refused at pledging and again at
    settling; settling is all or nothing and a refusal changes nothing.
11. **The roleplaying bonus and the DC are the DM's.** `roleplay` and `haggle.bonus`
    appear in no player message or player label.

## Risks

- **The purse is a new thing on every character.** Old games have none; a DM who
  wrote "35 gp" in gear converts it by hand (question 9).
- **Lists by reference.** A re-imported pack changes three shops at once; that is the
  point, and the DM's import screen says which shops a new version touches.
- **A store with no area refuses players on a map.** The owner's rule is strict, so a
  DM who opens a store while the party stands on a map must also give it an area, or
  take the party into a scene. The card says so in words and offers the brush; the
  pedlar on the road (no map in play) is unaffected.
- **"Inside" is a convention.** Any cell of the footprint counts (Decision 4); a table
  that wants "the centre cell" or "all of it" is a different test, one function.
- **Splitting is not escrow.** A pledge holds no coin; settling re-checks every purse.
  That is what keeps a player's coins theirs until the moment of paying, at the price
  of a refusal at the last tap if someone spent them meanwhile.
- **Haggling is a convention.** Some tables will want a different rule; the step and
  DC are per store, and Set price covers the rest.
- **Coins of five kinds on a phone.** The purse bar shows the coins and, on a tap,
  their worth in gold; paying needs no choice.

## Questions for the owner

All eleven were answered by the owner on 15 November 2026 (issue #193, the comment
"Q&A lead, 15 November, 08:00 ET"). Seven are confirmed on their defaults, four
changed the design. Where an answer left a number or a detail open, this spec says so
and marks the proposal "(design choice, lead's proposal)" for the owner to confirm.

1. **Coins as five kinds, or one total?** *Answered 15 November 2026: default
   confirmed, five kinds, as the SRD has them; pay from the smallest up, change in
   the largest down, never Electrum as change.* What changed: nothing.
2. **The haggle rule.** *Answered 15 November 2026: default confirmed, with an
   addition.* The owner: "1 with a button for the DM to a roleplaying bonus, +5%."
   Read, and told to him, as: one step (10 percent) off on meeting the DC, two steps
   on beating it by 10, as drafted, plus a DM button that grants a further 5 percent
   off for good roleplaying (he did not correct the reading). What changed: Decision 6
   gains the roleplaying bonus (`quote { roleplay }`, `haggle.bonus`); its size as a
   store field, how it stacks, and the cap on a sell offer are the lead's proposals;
   Decision 4's `quote`, the storefront's Haggle row, the log and the review points
   follow.
3. **Do stores buy magic items?** *Answered 15 November 2026: changed.* Stores buy
   them without a DM step at a fixed share of value. The owner: "let's make it 70% of
   value." What changed: `buys.magic` defaults to 70 (it was `null`, "only by the DM's
   quote"); the value is the SRD value of Decision 5 step 3, which the lead's proposal
   keeps free of the shop's markup; `null` still means "no automatic offer" and the
   DM can still set a price by a quote; Decision 5's Selling, the pack example and the
   linter's ranges follow.
4. **Does the DM approve each purchase of a special item?** *Answered 15 November
   2026: default confirmed, no.* Revealing it and setting its price is the approval.
   What changed: nothing.
5. **A party purse?** *Answered 15 November 2026: default confirmed (no purse), with
   a change: the vendor takes split payments.* The owner: "it's common for a character
   buying a magic item to need help from other players so there needs to be a transfer
   option somewhere in there ... I'd prefer it if the vendor takes split payments." What
   changed: Decision 5 gains "Paying together" (a joint purchase, `buy { split }`,
   `chipIn`, settled all or nothing); how it is offered and settled is the lead's
   proposal, and a plain transfer of coins outside a store is left out (the DM's
   `give { coins }` covers it). The same answer carried a **new request, "customs"**:
   "A DM needs to be able to screen money when importing a character ... We should add
   a highlight when bringing in characters for large amounts of cash and magical
   gear." That is `portable-characters.md` (Decision 5, the Customs row of "What is
   compared"), not this spec.
6. **Do coins leave with a portable character?** *Answered 15 November 2026: default
   confirmed, yes, as items do, under `takeaway` and the DM's send-off.* What changed:
   nothing here; `portable-characters.md` carries the amendment (the file's `coins`,
   the send-off's tick, the `left` block).
7. **Does what the party sells go on the shelf?** *Answered 15 November 2026: default
   confirmed, no.* It would put the party's items in front of the next buyer and make
   stock the DM must tend, which the owner wants to avoid; the DM can add it as a
   line. What changed: nothing.
8. **Enter the Adventuring Gear table as pack data** (rope, rations, torches and the
   rest, with their SRD prices and weights), so a standard store needs no typed
   prices? *Answered 15 November 2026: default confirmed, yes, as its own content job,
   checked against the SRD.* What changed: nothing (P8).
9. **Old "35 gp" lines in gear.** *Answered 15 November 2026: default confirmed, left
   as names; the Items tab offers the DM "Turn into coins" on a line that reads as
   coins.* What changed: nothing.
10. **Shopping in a fight.** *Answered 15 November 2026: default confirmed (refused
    for players; the DM can still edit), and a new rule.* The owner: "players should
    only be able to buy and sell when in a store." Asked what "in a store" requires, he
    chose: the character's **pawn must stand inside the shop area on the map**. A
    character elsewhere cannot buy or sell even when the store is shown; in a fight
    shopping stays refused even inside. What changed: Decision 4's "Where" check and
    its order, the shop area (a new optional list on the map document, the lead's
    proposal for how it is drawn), what players are sent of it (Decision 3), "inside"
    for a Large pawn (any cell of its footprint, the lead's proposal), the refusal
    texts, the storefront and the DM's controls, tasks P3a and P6a, and review points 8
    and 9. With no map in play only `shown` applies (question 11).
11. **Tie a store to a scene**, so that starting the scene shows it? *Answered 15
    November 2026: default confirmed, not now.* With no map on the table (a story
    scene, a pedlar on the road) the DM opens the store with one tap, as drafted; on a
    map the pawn rule of question 10 applies. What changed: Decision 4 says what "no
    map in play" means (a scene is open, or the table is on a navigation node), which
    is the lead's proposal.

## Adventure modules

A market pack can also reach a table inside an adventure module, through the same linter and import: see [adventure-module.md](adventure-module.md) (Decision 2 and "Where this spec changes or meets existing specs", item 3).

## Build notes: P1, the SRD's prices as data (#563)

What was built: `packages/rules/src/content/srd52/prices.js` (new), `content/index.js` (the file joins `PACKS[0]` as `prices` and `CONTENT.prices`, as `advancement` does), `content/schema.js` (`lintPrices`, called by `lintPack`) and `packages/rules/test/prices.test.js` (new; this spec's "tests/" is `packages/rules/test/`). Nothing else changed: no engine file, no state, no version.

**The shape.** One object, not a list, like `advancement`: `{ id, name, source, checked, text, coins, perPound, selling, rarities, consumableDivisor, scrollMultiple, addsBaseCost, scrolls }`.

| Field | Holds | Compared with the SRD, `srd52-flow.txt` (layout file `srd52.txt` in brackets) |
|---|---|---|
| `coins` | `{ id, name, cp }` for cp, sp, ep, gp, pp: 1, 10, 50, 100, 1000 copper pieces (the Coin Values table gives 1/100, 1/10, 1/2, 1, 10 GP) | lines 20245 to 20268 [5362 to 5370]; the text above it, 20236 to 20241, says the Gold Piece is the main coin and 100 CP make 1 GP |
| `perPound` | 50 | 20242 to 20243 [5359 to 5360]: a coin weighs about a third of an ounce, so fifty weigh a pound |
| `selling` | `{ equipment: 50, trade: 100, valuable: 100 }`, percent of cost | Selling Equipment, 20290 to 20294 [5396 to 5400]: equipment fetches half its cost; trade goods and valuables keep their full value |
| `rarities` | common 100, uncommon 400, rare 4,000, very-rare 40,000, legendary 200,000 GP; artifact `gp: null` (priceless) | Magic Item Rarities and Values, 36413 to 36438 [13164 to 13168]; the sentence that Artifacts are priceless, 36391 to 36392 |
| `consumableDivisor` | 2 | the footnote, 36445 [13169]: "Halve the value for a consumable item other than a Spell Scroll" |
| `scrollMultiple` | 2 | 36446 to 36447 [13170 to 13171]: the value of a Spell Scroll is double what it costs to scribe |
| `addsBaseCost` | true | 36404 to 36411 [13149 to 13160]: a magic item that incorporates an item with a purchase cost adds that cost; the example, +1 Armor (Plate Armor), is 4,000 + 1,500 = 5,500 GP |
| `scrolls` | levels 0 to 9: 15, 25, 100, 150, 1,000, 1,500, 10,000, 12,500, 15,000, 50,000 GP | Spell Scroll Costs, 23344 to 23436 [6256 to 6269]; the flow file interleaves this table with the Raw Materials text, so its rows were read in the layout file |

`checked: true` was set after reading each of those lines against the file and again against the test, which holds the numbers a second time, typed from the SRD and not copied from the data.

**What is not in it, and why.**

- **The 70 percent for magic items is the owner's answer (question 3), not the SRD's**, so it is not in `prices.js` (and `selling` has no `magic` key; the linter refuses one). It is a store default: P2's `buys.magic`. The SRD's own rates are the two in `selling`. The spec's X1 row says "the selling rates"; this is the reading that keeps the SRD's data free of the table's numbers.
- **`selling` keys follow the line kinds of Decision 1**, not the SRD's words: `equipment` covers kinds `gear`, `weapon` and `armour`; `trade` and `valuable` are the SRD's "trade goods and valuables", given separately because a line has one kind. P2 maps a line's kind to the key.
- **No price for a magic item whose rarity "varies".** Two items of the pack have it: the Spell Scroll (priced by its spell's level through `scrolls`) and the Feather Token (the SRD prints "Rarity Varies", line 38809 and following, and no value). A market line for a Feather Token needs its own `price`, as Decision 2 already says of a line with no list price. The test pins the Feather Token as the only item left without a value.
- **The Time column of Spell Scroll Costs is not entered** (it is about scribing, not buying); nor are the crafting rules (Raw Materials and Time, "half its purchase cost", the Magic Item Crafting Time and Cost table, 36605 and following): they are not prices a store charges. The Adventuring Gear table is P8, as question 8 settled.
- **The availability words** ("Common magic items can often be bought in a town or city", 36396 to 36399) are advice to the DM, not data; a seller who "might ask for a service rather than coin" (36403) stays the DM's, as Decision 5 says.

**What the data gives P2** (`listPrice`): a magic item's value is `rarities[rarity].gp`, divided by `consumableDivisor` when one of its uses has `consumed: true` and it is not the Spell Scroll; the Spell Scroll's is `scrolls[level].gp * scrollMultiple`; either plus the `cost` of its `base` weapon or armour when `addsBaseCost`. The test carries a small helper with exactly that, so the three worked figures are checked against the data (Potion of Healing 50 GP, Wand of Magic Missiles 400 GP, +1 Armor (Plate Armor) 5,500 GP), and more: Weapon, +1 (Longsword) 415 GP, a Potion of Healing (Greater) 200 GP, a level 3 Spell Scroll 300 GP. The Potion of Healing's 50 GP also agrees with the Adventuring Gear table's own "Potion of Healing (50 GP)" (22486). The helper stays in the test: the rule's home is `market.js`, which is P2's.

**The linter.** `lintPrices` (exported from `schema.js`, called from `lintPack` when the pack has `prices`; problems read `prices: ...`) refuses: a key it does not know, a function, a missing `checked`, coins not cp, sp, ep, gp, pp in that order, a copper value that is not a whole number or does not rise, a Copper Piece that is not 1 or a Gold Piece that is not 100, `selling` keys other than the three, a percent outside 1 to 100, rarities not in the order of `RARITIES` (without "varies"), a value that is not a whole number or does not rise, an Artifact with a price, a priced rarity with none, a divisor below 2, a scroll table that is not levels 0 to 9 in order, rising. It checks the shape and the SRD's structure, not the SRD's numbers: those are the test's. A homebrew pack cannot carry `prices` (the closed key list of `strict` mode refuses it, `"prices" cannot be homebrew`; tested): the prices are the SRD's, and a table's own prices live in a market pack.

**Tests.** `prices.test.js`, 13 tests: the pack carries and lints the table; each table against the SRD's numbers; the three worked prices and more; every item of the pack has a value except the Feather Token; every weapon and armour `cost` string reads in the coins of the table; fifteen-odd broken tables each refused with its sentence; a homebrew pack with `prices` is refused. No existing test was changed.
