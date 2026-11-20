// The start flow's two plain needs (issue #556): every page says where it is, and what was filled in is kept as a draft.
// Pure: no page, no global storage unless it is the default argument, so a test can run it. The pages that use it are the lobby (app.js),
// My characters (mycharacters.js) and the build screen when it opens for My characters (buildsheet.js).
//
// Where you are: a trail of names, from the task ("New solo game") to the page ("New character"), shown as "New solo game › Characters › New character".
// The draft: one record per browser under DRAFT_KEY, { v, front, build }. `front` is what the front page holds (name, code, map; the grid and the party keep themselves); `build` is
// one record per character being built ('new' for a new one, the character's id for an edit), each with the sheet's choices as the build screen
// holds them. Storage may be missing, full or throw: nothing here ever throws, and a draft that cannot be read is treated as none.

export const DRAFT_KEY = 'hextable.draft';
export const DRAFT_V = 1;
export const SEP = ' › ';
export const LIMITS = { builds: 6, nameLen: 24, codeLen: 6, bytes: 64 * 1024 };

export const titleOf = (trail) => trail.filter(Boolean).join(SEP);
// The trail one step up, for a Back button's label ("Back to Characters").
export const upOf = (trail) => trail.slice(0, -1);
export const backLabel = (trail) => (trail.length > 1 ? `Back to ${trail[trail.length - 2]}` : 'Back');

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const empty = () => ({ v: DRAFT_V, front: {}, build: {} });

export function loadDraft(storage = globalThis.localStorage) {
  let raw;
  try { raw = storage.getItem(DRAFT_KEY); } catch { return empty(); }
  if (raw == null) return empty();
  let o;
  try { o = JSON.parse(raw); } catch { return empty(); }
  if (!isObj(o) || o.v !== DRAFT_V) return empty();
  const front = {};
  if (isObj(o.front)) {
    if (typeof o.front.name === 'string') front.name = o.front.name.slice(0, LIMITS.nameLen);
    if (typeof o.front.code === 'string') front.code = o.front.code.slice(0, LIMITS.codeLen);
    if (typeof o.front.map === 'string') front.map = o.front.map.slice(0, 60);
  }
  const build = {};
  if (isObj(o.build)) for (const [k, v] of Object.entries(o.build).slice(0, LIMITS.builds)) if (isObj(v) && isObj(v.b) && Number.isFinite(v.at)) build[k] = { at: v.at, b: v.b };
  return { v: DRAFT_V, front, build };
}

// Writes the draft; { ok } says whether the browser kept it. An empty draft removes the key.
export function saveDraft(d, storage = globalThis.localStorage) {
  const none = !Object.keys(d.front).length && !Object.keys(d.build).length;
  try {
    if (none) { storage.removeItem(DRAFT_KEY); return { ok: true }; }
    const text = JSON.stringify(d);
    if (text.length > LIMITS.bytes) return { ok: false };
    storage.setItem(DRAFT_KEY, text); return { ok: true };
  } catch { return { ok: false }; }
}

// The front page's fields: keeps those with something in them, drops the rest.
export function keepFront(d, f) {
  const front = {};
  if (f.name?.trim()) front.name = f.name.slice(0, LIMITS.nameLen);
  if (f.code?.trim()) front.code = f.code.slice(0, LIMITS.codeLen);
  if (f.map) front.map = f.map;
  return { ...d, front };
}
// One character's build draft. `key` is 'new' or a character id; `b` is the build screen's choices (JSON-able); `at` is a time in ms.
export function keepBuild(d, key, b, at = Date.now()) {
  const build = { ...d.build, [key]: { at, b } };
  const keys = Object.keys(build).sort((x, z) => build[z].at - build[x].at).slice(0, LIMITS.builds);
  return { ...d, build: Object.fromEntries(keys.map((k) => [k, build[k]])) };
}
export function dropBuild(d, key) { const build = { ...d.build }; delete build[key]; return { ...d, build }; }
export const hasDraft = (d) => !!Object.keys(d.front).length || !!Object.keys(d.build).length;
// "Saved a minute ago" / "Saved at 14:32", in plain words, for the note on a restored draft.
export function whenLine(at, now = Date.now()) {
  const m = Math.round((now - at) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} hour${h === 1 ? '' : 's'} ago` : `${Math.round(h / 24)} day${Math.round(h / 24) === 1 ? '' : 's'} ago`;
}

// ---------- the page: a bar with a Back button and a title, built by the page that has one ----------
// `make(tag, props, ...kids)` is the page's own element maker (each module has one). Returns { bar, title, back }; `back` is a 44 px button
// whose words are "← Back" or "← Back to <the page above>". Call `show(trail)` to change what it says.
export function startBar(make, { backId, titleId, onBack }) {
  const back = make('button', { type: 'button', class: 'sf-back', id: backId, onclick: onBack });
  const title = make('h2', { class: 'sf-title', id: titleId });
  const bar = make('div', { class: 'sf-bar' }, back, title);
  const show = (trail) => {
    back.textContent = `← ${backLabel(trail)}`;
    back.setAttribute('aria-label', backLabel(trail));
    title.textContent = titleOf(trail);
  };
  return { bar, back, title, show };
}
