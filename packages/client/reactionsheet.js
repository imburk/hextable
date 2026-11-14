// The Reactions section of the character sheet: which reactions a creature has, whether its Reaction
// is spent, and the standing instruction for each (rules reactions.js). Shown to the creature's
// controller and the DM only. It decides no rule: the list and the allowed values come from
// `reactionsOf`, and a change is sent as { type: 'reactions', actor, set: { id: when } }.
import { reactionsOf, instruction, WHEN, canReact } from './shared/reactions.js';
import { inFight } from './shared/engine.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const TRIGGER = { leave: 'when a creature leaves its reach', hit: 'when it is hit by an attack', targeted: 'when a spell targets it', cast: 'when a creature it can see casts a spell', damaged: 'when a creature damages it' };
const COST = { attack: 'Costs only the Reaction.', spell: 'Spends a spell slot.', feature: '', trait: '' };

// What was set for this creature: the DM is sent it on the creature, a player in `S.reactions`.
const setFor = (S, e) => e.reactions ?? S.reactions?.[e.id] ?? {};

// Same shape as the reaction list, with each one's current instruction. Empty if there is nothing to show.
export function reactionRows(S, e) {
  const set = setFor(S, e), at = { ...e, reactions: set };
  return reactionsOf(e).map((r) => ({ ...r, now: instruction(at, r) }));
}

// What a `free` instruction waits for (#230): not a trigger of a Reaction, a moment of the fight.
const FREE_ON = { initiative: 'when you roll Initiative', reroll: 'when you fail a saving throw' };

// `panel`: drawn in the action panel (ids are prefixed, so the sheet's own copy keeps its ids, and it has no heading or long note).
// The `free` instructions (Persistent Rage, Uncanny Metabolism, Indomitable, Disciplined Survivor) are not Reactions: they are listed apart, under their own heading,
// and say that they do nothing until set to Always.
export function reactionsHtml(S, e, { panel = false } = {}) {
  const rows = reactionRows(S, e);
  if (!rows.length) return '';
  const fight = !!S.encounter && inFight(S, e.id), pre = panel ? 'ap-' : '';
  const real = rows.filter((r) => r.kind !== 'free'), free = rows.filter((r) => r.kind === 'free');
  const status = fight && real.length ? `<p class="note rx-status" data-rx-status="${e.reactionUsed ? 'spent' : 'ready'}">Reaction this round: <b>${e.reactionUsed ? 'spent' : canReact(e) ? 'ready' : 'not available'}</b></p>` : '';
  const row = (r) => `<div class="rx${r.kind === 'free' ? ' rx-free' : ''}" data-rx="${esc(r.id)}">
      <label for="${pre}rx-${esc(r.id)}"><b>${esc(r.name)}</b><small>${esc((r.kind === 'free' ? [FREE_ON[r.on] ?? '', r.now === 'always' ? 'Spends a use when it applies.' : 'Does nothing until set to Always.'] : [TRIGGER[r.on] ?? '', COST[r.kind]]).filter(Boolean).join(' · '))}</small></label>
      <select id="${pre}rx-${esc(r.id)}" data-rx-set="${esc(r.id)}">${r.options.map((o) => `<option value="${o}"${o === r.now ? ' selected' : ''}>${esc(WHEN[o] ?? o)}${o === r.dflt ? ' (default)' : ''}</option>`).join('')}</select>
    </div>`;
  const apart = free.length ? `<section class="rx-group" data-rx-group="free"><h4 class="rx-head">Chosen in advance, not Reactions</h4>
      <p class="note">These cost no Reaction and nothing else sets them off: each does nothing until you set it to Always, and then spends a use or Focus Point when its moment comes.</p>${free.map(row).join('')}</section>` : '';
  const body = real.map(row).join('');
  if (panel) return `<section id="ap-rx">${status}${body}${apart}</section>`;
  return `<section id="sheet-reactions"><h3>Reactions</h3>${status}${body}${apart}<p class="note">Standing instructions: the engine follows them when the moment comes, even on someone else's turn. Only you and the DM see them.</p></section>`;
}

export function bindReactions(root, e, act) {
  for (const sel of root.querySelectorAll('[data-rx-set]')) sel.onchange = () => act({ type: 'reactions', actor: e.id, set: { [sel.dataset.rxSet]: sel.value } });
}
