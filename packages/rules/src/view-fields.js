// What a player is sent of a creature of the party, and of the table's settings: every field of each is named here and
// classified, in one place (review R5, imburk/hextable#617; docs/specs/hidden-information.md, section 2). view.js builds
// the records a player is sent from these tables, field by field, so a field that is not in them is not sent: a field
// added to a creature or a setting stays private until someone lists it and says what it is. `test/view-fields.test.js`
// fails when a creature or a setting has a field that no table classifies, so it cannot be forgotten.
//
// Three classes:
//   'sent'      sent as it is. It holds numbers, flags, rules ids and text of the creature's own; never another
//               creature's id or name.
//   'scrubbed'  sent, but it can name other creatures (a condition's source, who it follows, what it rides): view.js
//               takes out or renames the ones the party does not know of (`scrub`, and the cases named beside the field).
//   'withheld'  not sent: the DM's bookkeeping, or what only its controller and the DM are sent by another way.
//
// Known gap: `name` and `tpl` of a creature made from a homebrew monster or form can still reach players (DEBT T45). `forViewer` (view.js)
// handles records the viewer does not control; this table does not fix it, and a change that does belongs with T45.
//
// Pure data and two small functions; it imports nothing.

// ---------- a creature of the party ----------
export const PARTY_FIELDS = {
  // Who it is and where it stands.
  id: 'sent', name: 'sent', kind: 'sent', side: 'sent', tpl: 'sent', owner: 'sent', ownerName: 'sent', pos: 'sent', look: 'sent', size: 'sent', type: 'sent',
  level: 'sent', cls: 'sent', classes: 'sent', xp: 'sent', sheet: 'sent', coins: 'sent',
  // Its numbers: defences, speeds, senses, abilities, proficiencies.
  ac: 'sent', acBase: 'sent', acNow: 'sent', acWhy: 'sent', hp: 'sent', maxHp: 'sent', tempHp: 'sent', tempFx: 'sent', speed: 'sent', speeds: 'sent', hover: 'sent', senses: 'sent', prof: 'sent', abil: 'sent', initBonus: 'sent',
  saveProf: 'sent', saveBonus: 'sent', skills: 'sent', expertise: 'sent', skillBonus: 'sent', tools: 'sent', resist: 'sent', vuln: 'sent', immune: 'sent', conditionImmune: 'sent',
  armour: 'sent', shield: 'sent', untrained: 'sent', critOn: 'sent', bonusActs: 'sent',
  // What it can do and what it has left.
  features: 'sent', feats: 'sent', attacks: 'sent', actions: 'sent', spells: 'sent', spellAbil: 'sent', castAbil: 'sent', pact: 'sent', slots: 'sent', slotsMax: 'sent',
  uses: 'sent', charges: 'sent', spent: 'sent', loaded: 'sent', hitDie: 'sent', hitDice: 'sent', hd: 'sent', hdBy: 'sent', gear: 'sent',
  // Where it is in play: its health, its turn, what it carries and whether it is set aside.
  death: 'sent', dead: 'sent', reactionUsed: 'sent', light: 'sent', away: 'sent', vanished: 'sent', remains: 'sent', hidden: 'sent', hiding: 'sent', march: 'sent',
  // These can name another creature.
  cond: 'scrubbed',            // a condition's `source`, a grapple's `holds[].by` (renamed 'someone'; its escape numbers only where the grappler is the party's: holdsShown)
  bond: 'scrubbed',            // `to`: the master; a companion's orders
  form: 'scrubbed',            // a Wild Shape form and what the creature kept of itself
  follow: 'scrubbed',          // sent only while the one it follows is a creature the party knows of
  formation: 'scrubbed',       // `slots` by creature id: only the party's own places are sent
  riding: 'scrubbed',          // sent only where both it and its mount are known to the party
  rider: 'scrubbed',           // likewise
  pocket: 'scrubbed',          // a familiar in its master's pocket dimension: a creature record of its own, cut by this same table
  // Not sent.
  speedSet: 'withheld',        // the DM's bookkeeping of `setSpeed`: the speeds themselves are sent
  hitChoices: 'withheld',      // standing instructions for choices after a hit: its controller's and the DM's, sent with the reactions (`viewReactions`)
  reactions: 'withheld',       // standing instructions are their controller's and the DM's (`viewReactions`)
  stealthNoted: 'withheld',    // the DM told once of armour that hinders Stealth: bookkeeping that no player reads
  usesAway: 'withheld',        // uses spent of a subclass whose pack is not loaded: bookkeeping until the pack is
};

// ---------- the table's settings ----------
// Every setting is a rule of the table that the players play by, and the client shows or reads each one, so each is sent. A new setting is
// not sent until it is listed here.
export const SETTING_FIELDS = {
  sight: 'sent', diagonals: 'sent', squareRange: 'sent', areaFill: 'sent', squareCover: 'sent', autoEngage: 'sent', passiveFind: 'sent', vertical: 'sent', climbing: 'sent',
  cover: 'sent', creatureCover: 'sent', engageRange: 'sent', unseenTurns: 'sent', diceThrow: 'sent', pace: 'sent', conclusion: 'sent', xpShare: 'sent', watching: 'sent',
  strikeFirst: 'sent', away: 'sent', breaks: 'sent', scoreReroll: 'sent', scoreRerollBelow: 'sent', scoreRerollResult: 'sent', hpMethod: 'sent', hpRollLow: 'sent',
  characters: 'sent', level: 'sent',     // that a table takes characters people bring, and the adventure's levels, are no secret (portable-characters.md, Decision 5)
};

// ---------- what the state holds beside the creatures and the settings ----------
// A field of the state that only the DM is sent. `playerView` (view.js) is built from named parts, so a field not named there is not sent anyway; this
// says so in one place, and `test/portable-admit.test.js` fails if it is sent.
export const STATE_FIELDS = {
  offers: 'withheld',          // characters players have offered and the DM has not answered (engine/characters.js, offer): a sheet is the player's and the DM's until it is admitted
};

// The fields of `rec` that `table` sends, in the record's own order, each copied. A field the table does not list, or lists as 'withheld',
// is left out. Returns the copy and leaves `rec` as it was.
export function sentFields(rec, table) {
  const out = {};
  for (const k of Object.keys(rec)) if (Object.hasOwn(table, k) && table[k] !== 'withheld') out[k] = structuredClone(rec[k]);
  return out;
}

// A creature of the party as a player is sent it, before the cases view.js settles (what it follows, rides, holds). A familiar in its
// master's pocket dimension is a record too, and goes through the same table.
export function partyFields(rec) {
  const out = sentFields(rec, PARTY_FIELDS);
  if (out.pocket && typeof out.pocket === 'object' && !Array.isArray(out.pocket)) {
    for (const [id, c] of Object.entries(rec.pocket)) out.pocket[id] = c && typeof c === 'object' && !Array.isArray(c) ? partyFields(c) : out.pocket[id];
  }
  return out;
}
