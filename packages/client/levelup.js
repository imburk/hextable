// When a character has the experience for the next level, and who may take it (issue #672, docs/specs/player-screen.md Decision 8).
// The engine's `levelUp` is the DM's alone (engine/characters.js); this only says it where the player is looking (the rewards card and
// the sheet) and, when it cannot be tapped, says why in words on the page: a title shows nothing on a phone.
import { levelForXp } from './shared/rewards.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// The experience is there for a level more than the character has.
export const levelReady = (e) => e?.kind === 'pc' && typeof e.xp === 'number' && levelForXp(e.xp) > (e.level ?? 1);
// The level its experience reaches, never past 20.
export const levelNext = (e) => Math.min(20, (e.level ?? 1) + 1);

// Why this character cannot be levelled up by this person now, in words; '' when it can. `dm` is the DM, or solo.
export function levelUpWhy(S, e, { dm = false } = {}) {
  if (!e || e.kind !== 'pc') return 'Only a character levels up.';
  if (!dm) return 'Only the DM levels a character up at this table. Ask your DM.';
  if ((e.level ?? 1) >= 20) return `${e.name} is level 20, the highest there is.`;
  if (!e.sheet) return `${e.name} was typed in by hand and has no build sheet. Use Edit sheet to correct them, or add them again with Build from class.`;
  if ((S?.encounter?.order ?? []).some((o) => o.id === e.id)) return `${e.name} can't level up in the middle of a fight. It waits until the fight is over.`;
  return '';
}

// The line and the button. `tag` is a prefix for the ids of the reason, so two on one page do not share one.
export function levelUpHtml(S, e, { dm = false, tag = 'lu' } = {}) {
  if (!levelReady(e)) return '';
  const why = levelUpWhy(S, e, { dm }), id = `${tag}-why-${e.id}`;
  return `<div class="lu" data-lu="${esc(e.id)}"><p class="lu-line">${esc(e.name)} can reach level ${levelNext(e)}.</p>`
    + `<button type="button" class="lu-go" data-levelup="${esc(e.id)}"${why ? ` disabled aria-describedby="${esc(id)}"` : ''}>Level up ${esc(e.name)}</button>`
    + (why ? `<p class="lu-why" id="${esc(id)}">${esc(why)}</p>` : '') + '</div>';
}

// The same, smaller, for the character card at the bottom of the screen (actionpanel.js): one short line and a button of 44 px, or the
// reason in words. Nothing in a fight (the card is crowded then, and the sheet says it waits).
export function levelUpChip(S, e, { dm = false } = {}) {
  if (!levelReady(e) || (S?.encounter?.order ?? []).some((o) => o.id === e.id)) return '';
  const why = levelUpWhy(S, e, { dm }), id = `chip-why-${e.id}`;
  return `<div class="lu lu-chip"><span class="lu-line">Level ${levelNext(e)} is ready</span>`
    + `<button type="button" class="lu-go" data-levelup="${esc(e.id)}" aria-label="Level up ${esc(e.name)}"${why ? ` disabled aria-describedby="${esc(id)}"` : ''}>Level up</button>`
    + (why ? `<span class="lu-why" id="${esc(id)}">${esc(why)}</span>` : '') + '</div>';
}
