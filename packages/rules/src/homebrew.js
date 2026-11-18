// Which creatures carry a homebrew monster's block (#457; docs/specs/homebrew.md, the build notes on #457). Pure, and it imports nothing, so
// any module of the rules may use it. Homebrew is told by the id, which the strict linter makes begin `hb-` for every entry of a pack.
export const hbId = (id) => typeof id === 'string' && id.startsWith('hb-');
// Does this creature carry a homebrew monster's block: made from one (`tpl`) or in the form of one (`form.block`)?
export const homebrewBlock = (e) => !!e && (hbId(e.tpl) || hbId(typeof e.form === 'string' ? e.form : e.form?.block));
// The field a `save` event gets for the creature whose Difficulty Class it is, when that creature carries a homebrew block: `src`. The DC is a
// number of the block, so view.js tells it to the player who runs that creature and to no other. Nothing for any other creature, a trap or
// the DM: an event is then as it always was.
export const srcOf = (s, id) => (typeof id === 'string' && homebrewBlock(s.entities[id]) ? { src: id } : {});
