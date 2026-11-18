// Refresh from sheet (issue #486, part 4; the engine's `refresh`, docs/specs/grapple-shove.md): what the DM is told when a character is made again from
// its own saved sheet. The client sends { type: 'refresh', actor? } and says what the engine did; it never works out whether a sheet can be refreshed.
// The engine's refusal reaches the DM as a toast (app.js, T.on.error); `why` below is its answer on a copy, shown under the button.

// The toast for the events of one refresh. `edited` is a remade creature; `manual` with `partial` is a party member skipped (the DM alone is sent it).
// `names` maps an id to a name. Returns '' when the events hold nothing of a refresh.
export function refreshReport(events, names, { party = false } = {}) {
  const done = events.filter((e) => e.type === 'edited').map((e) => names(e.id));
  const skipped = events.filter((e) => e.type === 'manual' && e.partial && /^Not refreshed from its sheet/.test(String(e.text ?? ''))).map((e) => e.name ?? names(e.actor));
  if (!done.length && !skipped.length) return '';
  const list = (xs) => xs.join(', ');
  if (!party) return done.length ? `${list(done)} was made again from the sheet.` : '';
  const a = done.length ? `Made again from their sheets: ${list(done)}.` : 'Nobody was made again.';
  return skipped.length ? `${a} Not refreshed: ${list(skipped)}. The log says why.` : a;
}

// The note under the sheet's button: the engine's own refusal if it would refuse now, else what the button does.
export const refreshNote = (why) => why || 'Makes this character again from its saved sheet, so it picks up what the content has gained since. Hit points, slots and conditions stay.';
