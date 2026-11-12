// Handouts and notes to one player: things the DM shares that are not on the map.
// Design: docs/specs/maps-and-objects.md, "Sharing things that are not on the map".
//
//   state.handouts: [{ id, title, text?, asset?, shown: [userIds] | 'all' }]
//
// The engine knows user ids only as strings it is given. Whether an id belongs to someone at the
// table is the server's business (it checks a note's recipient before the action reaches here).
// What a player is sent of all this is decided in view.js.
import { ASSET_ID } from './map.js';

export const HANDOUT_LIMITS = { handouts: 200, title: 80, text: 2000, note: 1000, shownTo: 50 };
const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;

const cleanText = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max + 1);
const nextId = (list) => {
  let n = 0;
  for (const h of list) { const m = /^h(\d+)$/.exec(h.id); if (m) n = Math.max(n, +m[1]); }
  return `h${n + 1}`;
};

// The action handlers, given the engine's way of refusing. Each validates everything before it
// changes anything, so a refused action leaves the state as it was.
export function handoutActions(fail) {
  const dmOnly = (ctx) => ctx.role === 'dm' || fail('Only the DM can do that with handouts.');
  const find = (s, id) => (s.handouts ?? []).find((h) => h.id === id) || fail('No such handout.');
  const users = (to) => {
    if (to === 'all') return 'all';
    (Array.isArray(to) && to.length > 0 && to.length <= HANDOUT_LIMITS.shownTo && to.every((u) => typeof u === 'string' && USER_ID.test(u)))
      || fail("Say who to show it to: everyone, or a list of players.");
    return [...new Set(to)];
  };
  return {
    // Make a handout or change one. { type: 'handout', handout: { id?, title, text?, asset? } }
    // `asset: null` or `text: ''` takes that part away.
    handout(s, a, ctx, ev) {
      dmOnly(ctx);
      const h = a.handout;
      (h && typeof h === 'object' && !Array.isArray(h)) || fail('A handout needs a record.');
      const list = s.handouts ?? [];
      const had = h.id === undefined ? null : find(s, h.id);
      const title = h.title === undefined && had ? had.title : cleanText(h.title, HANDOUT_LIMITS.title);
      title || fail('Give the handout a title.');
      title.length <= HANDOUT_LIMITS.title || fail(`A title can be at most ${HANDOUT_LIMITS.title} characters.`);
      const text = h.text === undefined ? had?.text : cleanText(h.text, HANDOUT_LIMITS.text) || undefined;
      (text ?? '').length <= HANDOUT_LIMITS.text || fail(`A handout's text can be at most ${HANDOUT_LIMITS.text} characters.`);
      const asset = h.asset === undefined ? had?.asset : h.asset === null ? undefined : h.asset;
      (asset === undefined || (typeof asset === 'string' && ASSET_ID.test(asset))) || fail("That isn't a file of this table.");
      (text || asset) || fail('A handout needs a picture or some text.');
      had || list.length < HANDOUT_LIMITS.handouts || fail(`A table can have at most ${HANDOUT_LIMITS.handouts} handouts.`);
      const rec = { id: had?.id ?? nextId(list), title, ...(text && { text }), ...(asset && { asset }), shown: had ? had.shown : [] };
      s.handouts = list;
      if (had) list[list.indexOf(had)] = rec; else list.push(rec);
      ev.push({ type: 'handout', handout: rec.id, title, ...(had ? { edited: true } : {}) });
    },
    // Show a handout to everyone or to chosen players, on top of whoever has it already.
    // { type: 'showHandout', handout, to: 'all' | [userIds] }
    showHandout(s, a, ctx, ev) {
      dmOnly(ctx);
      const h = find(s, a.handout), to = users(a.to);
      h.shown = to === 'all' || h.shown === 'all' ? 'all' : [...new Set([...h.shown, ...to])];
      ev.push({ type: 'handoutShown', handout: h.id, title: h.title, to: to === 'all' ? 'all' : [...to] });
    },
    // Take a handout back from everyone, or from the players named. { type: 'hideHandout', handout, from? }
    // Taking it from some players of a handout shown to everyone is refused: 'all' includes people
    // who have not joined yet, so there is no list to take them out of.
    hideHandout(s, a, ctx, ev) {
      dmOnly(ctx);
      const h = find(s, a.handout);
      if (a.from === undefined) h.shown = [];
      else {
        const from = users(a.from);
        if (from === 'all') h.shown = [];
        else {
          h.shown !== 'all' || fail('That handout is shown to everyone. Hide it from everyone, then show it to the players who should keep it.');
          h.shown = h.shown.filter((u) => !from.includes(u));
        }
      }
      ev.push({ type: 'handoutHidden', handout: h.id, title: h.title });
    },
    removeHandout(s, a, ctx, ev) {
      dmOnly(ctx);
      const h = find(s, a.handout);
      s.handouts = s.handouts.filter((x) => x !== h);
      ev.push({ type: 'handoutRemoved', handout: h.id, title: h.title });
    },
    // A note from the DM to one player, or from a player to the DM. { type: 'note', to: userId | 'dm', text }
    // It is an event like any other and goes on the timeline; view.js sends it only to the two people
    // it is between (the DM sees every event).
    note(s, a, ctx, ev) {
      const text = cleanText(a.text, HANDOUT_LIMITS.note);
      text || fail('Write something first.');
      text.length <= HANDOUT_LIMITS.note || fail(`A note can be at most ${HANDOUT_LIMITS.note} characters.`);
      let from, to;
      if (ctx.role === 'dm') {
        (typeof a.to === 'string' && USER_ID.test(a.to) && a.to !== 'dm') || fail('Pick a player to send it to.');
        from = 'dm'; to = a.to;
      } else {
        a.to === 'dm' || fail('A player can send a note to the DM only.');
        (typeof ctx.userId === 'string' && ctx.userId) || fail('Join the table first.');
        from = ctx.userId; to = 'dm';
      }
      ev.push({ type: 'privateNote', from, to, text });
    },
  };
}

// The asset ids a state refers to: in handouts and as level backgrounds. Run on a player's view,
// this is exactly the files that player may fetch.
export function assetRefs(state) {
  const out = new Set();
  for (const h of state?.handouts ?? []) if (typeof h.asset === 'string') out.add(h.asset);
  for (const l of state?.map?.levels ?? []) if (typeof l.image?.asset === 'string') out.add(l.image.asset);
  return out;
}

// Whether a player (by user id) has been shown a handout.
export const shownTo = (h, userId) => h.shown === 'all' || (typeof userId === 'string' && Array.isArray(h.shown) && h.shown.includes(userId));
