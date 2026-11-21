# Spec: the DM's to-do tray

Status: built (#675). Playability review of 21 November 2026, PB-1 and PB-9.

## The problem

What the engine cannot apply it hands to the DM in a `manual` event. Until now that was one line in the Log tab, closed during play: no badge, no tool, and the caster thought the spell worked.

## What is built

- **State.** `state.todo = { n, cards }` (`rules/src/todo.js`). `record()` in `engine.js` adds a card for every `manual` event it writes. A card is `{ n, t, kind: 'manual', actor, name, text, ids, count?, partial? }`: who, what it is called, the engine's words, the creatures the words name. The same note made again while its card is open adds to `count`. At most 150 cards are kept. It is one top-level key that `playerView` does not list, so **no player is sent it**; it lives in the saved game, so a reload and a second tab find the cards as they were.
- **Which notes make a card.** Every `manual` event, but an assist spell's own description (casting.js, `standing: 'assist'`, said on every cast) makes none: where the engine applied the effect it is no job for the DM, and the notes for what it left out speak for themselves. Of a manual spell (`standing: 'manual'`) it is the only word, so it does. A card repeated while open counts, takes a new number and the clock now, and so comes up as new. Text is cut to 500 characters. `tidy` (end of `record`) takes a dead or removed creature's "You run" card with it.
- **Done.** `{ type: 'todoDone', n }` or `{ type: 'todoDone', all: true }`, DM only, an ordinary undoable action with no event: Undo brings the card back. A card already done is refused.
- **Set AC.** `{ type: 'setAc', actor, ac }`, DM only, 0 to 40: the creature's base Armor Class (lasting effects still add). The engine had no action for it. A built character's `acBase` moves by the same amount, so Mage Armor still gives its better base. In a form (Wild Shape) it is the form's number that is set; the character's own comes back when the form ends. A character made again from its sheet (refresh, level up) has the sheet's number back. A foe's change is told to no player (no event); a party member's is a note.
- **"You run" cards (PB-9).** When a monster whose block has a trait named Spellcasting (also Innate or Psionic) or Legendary Actions or Legendary Resistance, with text and nothing the engine reads (no modifiers, effects or reaction), is added (`spawn`) or begins its turn (`beginTurn`), `{ kind: 'run', actor, name, runs: [{ name, text }], why }` is made. A creature has one open card. It is said when the creature is added and once more at its first turn (`state.todo.ran`), never every round. When DEBT M5 and M6 give those traits fields the cards stop by themselves. Stage H10 of `dm-helper.md` takes this card in.
- **Client.** `client/todo.js` draws the cards into `#todo-mount`, the first section of the DM tab. Each names its creatures (up to four) with HP, AC and conditions and five tools: Place (selects the creature and asks for a tap on the map), Damage (with a type), Heal, Condition (add or remove), AC (set, -1, +1). Buttons are 44 px or more. The badge of the menu button counts open cards (`#dm-badge`, summed by the drawer as before). A new card, after the first look at the table, says so once in a toast.
- **The caster.** `view.js` `viewWaiting` gives a player `waiting: [{ id, name }]`: for each open card marked `waits` (the engine applied none of the spell: a whole-effect note, a manual spell's standing note, Mage Armor on a creature the engine cannot work out) whose actor is a creature of theirs and whose name is a spell, feature or attack that creature has. Never the DM's words, no card number (the count of cards is the DM's), and nothing for a note about something else (a trap, a failed refresh). `client/todo.js` shows "Ria's Mage Armor: waiting for the DM" above the dock. `packages/server/src/tables.js` sends and diffs it with the other per-player fields.

## Moving into the one-token menu

`one-token-menu.md` M6 says the badge shows only when something waits and that opening the menu lists what waits. The tray is that list: `initTodo` takes its mount point, so M6 moves `#todo-mount` under the token's "Waiting for you" and adds the tray's count to the token's badge sum. No other code changes. The "waiting for the DM" line moves to the token's status line.

## Not built

- Cards do not yet pick the target of a note when the engine's words name no creature but the actor (Mage Armor names its caster only): the DM taps the creature in the party bar and uses its tools there.
- Old saved games have no cards for notes made before this.
