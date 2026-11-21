# Spec: prompts, starting with the DM's call for a roll

Status: draft (#676). Only the engine part of "Call for a roll" is built: the `save` action and the DM's `adv` option. The client screen for it is a later job, and the rest of the prompts system (a choice after a roll: Cutting Words, Stroke of Luck; docs/DEBT.md C7 and T6) is not written yet.

## Call for a roll

The DM asks for a roll the way a table does: "everyone, a Dexterity save, DC 15". Today the engine has the pieces (`check`, the saves inside spells and actions) but no way for the DM to say it. This section is what the DM sends and what each player sees. The client sends the actions and draws the events; nothing here changes a rule.

### What the DM sends

A saving throw, DM only, through `apply()` like everything else:

```
{ type: 'save', who: id | [id, ...], ability, dc, secret?: bool, adv?: 'advantage' | 'disadvantage',
  damage?: { dice, type, half?: bool }, condition?: id }
```

- `who`: one creature or up to 40 different ones, of any side, hidden or not. A dead creature, or any id that is nothing, refuses the whole call before anyone rolls.
- Each creature rolls its own save with everything that bears on it: its ability modifier, Proficiency, Aura of Protection, conditions, magic items, Bless and Bane, the rules' automatic failures (Paralyzed, Stunned and Unconscious on Strength and Dexterity saves). A single-use modifier is spent. Dice come from the game's seed, so a replay gives the same rolls.
- `adv` is one more source of Advantage or Disadvantage, for every creature called. It combines with the others by the SRD's rule: any Advantage and any Disadvantage cancel to a plain roll, however many of each.
- `damage` is rolled once for everyone (as one area spell's damage is). A creature that fails takes all of it; one that succeeds takes half, rounded down, only if `half`. It goes through the engine's usual damage path, so Resistance, Immunity, Vulnerability, Temporary Hit Points, a Concentration check and death saves all follow as for any damage.
- `condition` goes on a creature that fails, unless it is immune (the DM is told with a `note`) or has it already. It lasts until the DM takes it off (`condition` with `on: false`); the engine says so with a `manual` event.
- `secret` keeps the DC and the outcome from the players (below).

`adv` is also accepted, from the DM only, on `check`, `attack` and `act`: one source of Advantage or Disadvantage on the attack rolls that creature makes in that action, or on the check. A player who sends it is refused and nothing changes. A familiar's attack refuses it. If the action makes no attack roll to use it (the attack only starts a fight, or is a Shove or a Grapple), the engine says so to the DM with a `manual` event, and does not drop it quietly.

Refusals, all before anything changes: not the DM; an ability that is not one of the six; a DC that is not a whole number from 1 to 40; dice that are not like `2d6` or `8d6+4`; a damage type or condition not in the game; `adv` that is not `'advantage'` or `'disadvantage'`.

### What comes back

One `save` event per creature, in the order named, then the `damage`, `cond`, `note` and `concentration` events it caused. A called save's `save` event is the engine's usual one (`id`, `abil`, `dc`, `roll`, `total`, `success`, `dice`, `bonus`, `mode` and `why` with Advantage or Disadvantage) with `called: true`, and `secret: true` if asked.

### What each player sees

| | The creature is theirs | Any other creature they can see |
|---|---|---|
| not secret | the whole event: the roll, the bonus, why it had Advantage, the DC, the outcome | `id`, `abil`, `dc`, `success`, `called`; never the roll, the bonus or what modified it |
| secret | the roll and its dice and bonus; no `dc`, no `success` | nothing |
| a creature they cannot see | nothing | nothing |

The damage, the conditions and the notes that follow are told as they always are: what a player could see happen. `secret` hides the DC and the dice, not what visibly happens to a creature in view. The DM sees everything. Because the called save is an ordinary `save` event, it is also what the timeline and a player's view are built from; no new event type is told to anyone.

### For the client job

- A "Call for a roll" dialog for the DM: pick creatures (tap tokens, or "all party"), the ability, the DC, a Secret toggle, Advantage or Disadvantage, and optionally damage (dice, type, half on a success) and a condition. It sends one `save`.
- A roll shown to the player as the engine's usual save line, with "DC hidden" for a secret one. A player's `check` for a skill the DM asked for (`askCheck`, scenes.js) is a separate, older action.
- The `adv` toggle on the DM's check and attack controls, which are the DM's own: it never shows on a player's screen.
- Phone-sized screens and touch are part of that job.

### Not covered

A player-initiated request for a save, a roll the player throws themselves (`diceThrow: 'throw'`, docs/specs/dice.md), a duration on a called condition, repeated saves to end it, and an area picked from the map (a spell does that). The DM names the creatures.
