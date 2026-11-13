// The Reactions section of the character sheet: which reactions a creature has, whether its Reaction
// is spent, and the standing instruction for each (rules reactions.js). Shown to the creature's
// controller and the DM only. It decides no rule: the list and the allowed values come from
// `reactionsOf`, and a change is sent as { type: 'reactions', actor, set: { id: when } }.
import { reactionsOf, instruction, WHEN, canReact } from './shared/reactions.js';
import { inFight } from './shared/engine.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const TRIGGER = { leave: 'when a creature leaves its reach', hit: 'when it is hit by an attack' };
const COST = { attack: 'Costs only the Reaction.', spell: 'Spends a spell slot.', feature: '' };

// What was set for this creature: the DM is sent it on the creature, a player in `S.reactions`.
const setFor = (S, e) => e.reactions ?? S.reactions?.[e.id] ?? {};

// Same shape as the reaction list, with each one's current instruction. Empty if there is nothing to show.
export function reactionRows(S, e) {
  const set = setFor(S, e), at = { ...e, reactions: set };
  return reactionsOf(e).map((r) => ({ ...r, now: instruction(at, r) }));
}

export function reactionsHtml(S, e) {
  const rows = reactionRows(S, e);
  if (!rows.length) return '';
  const fight = !!S.encounter && inFight(S, e.id);
  const status = fight ? `<p class="note rx-status" data-rx-status="${e.reactionUsed ? 'spent' : 'ready'}">Reaction this round: <b>${e.reactionUsed ? 'spent' : canReact(e) ? 'ready' : 'not available'}</b></p>` : '';
  const body = rows.map((r) => `<div class="rx" data-rx="${esc(r.id)}">
      <label for="rx-${esc(r.id)}"><b>${esc(r.name)}</b><small>${esc([TRIGGER[r.on] ?? '', COST[r.kind]].filter(Boolean).join(' · '))}</small></label>
      <select id="rx-${esc(r.id)}" data-rx-set="${esc(r.id)}">${r.options.map((o) => `<option value="${o}"${o === r.now ? ' selected' : ''}>${esc(WHEN[o] ?? o)}${o === r.dflt ? ' (default)' : ''}</option>`).join('')}</select>
    </div>`).join('');
  return `<section id="sheet-reactions"><h3>Reactions</h3>${status}${body}<p class="note">Standing instructions: the engine follows them when the moment comes, even on someone else's turn. Only you and the DM see them.</p></section>`;
}

export function bindReactions(root, e, act) {
  for (const sel of root.querySelectorAll('[data-rx-set]')) sel.onchange = () => act({ type: 'reactions', actor: e.id, set: { [sel.dataset.rxSet]: sel.value } });
}
