// My characters (issue #308; docs/specs/portable-characters.md, Decision 1, option C): a list of characters kept in this browser,
// each one a character file the player can export and import, and the lobby's party step for a solo game. The first slice only:
// the file has no keys and no signed blocks, and nothing here decides a rule. A sheet is the `derive.js` sheet; `validate` says
// whether the engine would play it, and every file and every stored entry is checked with it before it is used (a file is never trusted).
// The top half of this module is pure (no page, no storage) so a test can run it; `initMyCharacters` is the part that draws.
import { validate, classesOf, levelOf } from './shared/derive.js';
import { PREGENS } from './shared/content/index.js';
import { pack } from './shared/content/srd52/pack.js';
import { openBuild } from './buildsheet.js';

// What a party and a character may be, in one place so it can change (the owner asked for "some limits").
export const LIMITS = { partyMin: 1, partyMax: 6, levelMin: 1, levelMax: 20, saved: 20, fileBytes: 96 * 1024, edits: 50 };
export const KEY = 'hextable.characters';          // the list, in localStorage
export const PARTY_KEY = 'hextable.party';          // the lobby's last party: { count, picks }
export const FORMAT = 'hextable-character';
export const FILE_EXT = '.hextable-character.json';
const TOP = ['format', 'v', 'cid', 'sheet', 'born', 'blocks', 'edits', 'keys', 'needs', 'parked'];
const HOW = ['built', 'imported-fgxml', 'typed', 'pregen', 'table'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CID = /^[A-Za-z0-9_-]{16,32}$/;
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

// A character's own id: 16 random bytes, base64url. It names the character, not a person.
export function newCid() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export const today = () => new Date().toISOString().slice(0, 10);

// Why a sheet cannot be played here ([] if it can): the engine's `validate` (which allows only SRD content and only the fields a sheet has),
// then the limits of this screen.
export function sheetProblems(sheet) {
  const bad = validate(sheet);
  if (bad.length) return bad;
  const n = levelOf(sheet);
  return n >= LIMITS.levelMin && n <= LIMITS.levelMax ? [] : [`A character here is level ${LIMITS.levelMin} to ${LIMITS.levelMax}.`];
}
export const classLine = (sheet) => classesOf(sheet).map((k) => `${k.c?.name ?? '?'} ${k.level}`).join(' / ');
export const levelLine = (f) => `${classLine(f.sheet)}${f.born.level === levelOf(f.sheet) ? `, created at level ${f.born.level}` : `, created at level ${f.born.level}, now ${levelOf(f.sheet)}`}`;

// A character file for a sheet. `how` is how it came to be; `level` is the level it was created at.
export function makeFile(sheet, { how = 'built', cid = newCid(), level = levelOf(sheet) } = {}) {
  return { format: FORMAT, v: 1, cid, sheet: structuredClone(sheet), born: { level, how, by: 'self' }, blocks: [], edits: [], keys: {}, needs: { packs: [{ id: pack.id, version: pack.version }], homebrew: [] }, parked: [] };
}
export const fileName = (f) => `${(f.sheet.name || 'character').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'character'}${FILE_EXT}`;
export const fileText = (f) => JSON.stringify(f, null, 1);

// Read the text of a file the player chose. Never throws. { ok, problems, notes, file }: `file` is rebuilt from the parts that were checked, so
// nothing else in the text is carried along. Signed blocks and keys are not read in this version (they are dropped and a note says so).
export function parseFile(text) {
  const bad = [], notes = [];
  if (typeof text !== 'string') return { ok: false, problems: ['That is not a text file.'], notes, file: null };
  if (new TextEncoder().encode(text).length > LIMITS.fileBytes) return { ok: false, problems: [`That file is over ${LIMITS.fileBytes / 1024} KB, more than a character file can be.`], notes, file: null };
  let o;
  try { o = JSON.parse(text); } catch { return { ok: false, problems: ['That is not a character file: it is not JSON.'], notes, file: null }; }
  if (!isObj(o)) return { ok: false, problems: ['That is not a character file: it should hold one record.'], notes, file: null };
  if (o.format !== FORMAT) return { ok: false, problems: [`That is not a Hextable character file (its format is not "${FORMAT}").`], notes, file: null };
  if (o.v !== 1) return { ok: false, problems: [`This version reads character files of version 1; this one says ${JSON.stringify(o.v)}.`], notes, file: null };
  for (const k of Object.keys(o)) if (!TOP.includes(k)) bad.push(`The file has a field it should not: "${k.slice(0, 30)}".`);
  if (typeof o.cid !== 'string' || !CID.test(o.cid)) bad.push('Its id (cid) is missing or is not 16 to 32 letters, digits, - or _.');
  if (!isObj(o.sheet)) bad.push('It has no sheet.');
  else for (const p of sheetProblems(o.sheet).slice(0, 4)) bad.push(`The sheet cannot be played: ${p}`);
  const b = o.born;
  if (!isObj(b) || !Number.isInteger(b.level) || b.level < LIMITS.levelMin || b.level > LIMITS.levelMax || !HOW.includes(b.how) || !['self', 'table'].includes(b.by)) bad.push('Its "born" record (the level it was created at, and how) is missing or wrong.');
  const edits = [];
  if (o.edits !== undefined) {
    if (!Array.isArray(o.edits) || o.edits.length > 200) bad.push('Its list of edits is not a list of 200 or fewer.');
    else for (const e of o.edits) {
      if (isObj(e) && typeof e.at === 'string' && DAY.test(e.at) && Array.isArray(e.fields) && e.fields.length <= 30 && e.fields.every((x) => typeof x === 'string' && /^[a-zA-Z]{1,24}$/.test(x))) edits.push({ at: e.at, fields: [...e.fields] });
      else { bad.push('An entry in its edits is not { at: a date, fields: [names] }.'); break; }
    }
  }
  if (bad.length) return { ok: false, problems: bad, notes, file: null };
  if ((o.blocks?.length ?? 0) || Object.keys(o.keys ?? {}).length) notes.push('Signed records in the file were not read: this version keeps the sheet and where it started only.');
  if (b.by === 'table') notes.push('The file says a table made this character. That is not checked here, so it counts as made by the player.');
  const file = makeFile(o.sheet, { how: b.how, cid: o.cid, level: b.level });
  file.edits = edits.slice(-LIMITS.edits);
  return { ok: true, problems: [], notes, file };
}

// The names of the sheet fields that differ between two sheets (the edit record names fields, never values).
export const changedFields = (a, z) => [...new Set([...Object.keys(a), ...Object.keys(z)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(z[k])).sort();

// ---------- the list: pure operations; each gives { ok, list } or { ok: false, error } and never changes the list it was given ----------
const full = () => `My characters holds ${LIMITS.saved}. Delete one first.`;
export function addFile(list, file) {
  if (list.some((f) => f.cid === file.cid)) return { ok: false, error: `${list.find((f) => f.cid === file.cid).sheet.name} is already in My characters (the same character id). Delete that one first to bring this one in, or duplicate it to keep both.` };
  if (list.length >= LIMITS.saved) return { ok: false, error: full() };
  return { ok: true, list: [...list, file] };
}
export const removeFile = (list, cid) => ({ ok: true, list: list.filter((f) => f.cid !== cid) });
export function renameFile(list, cid, name, day = today()) {
  const n = String(name ?? '').trim(), f = list.find((x) => x.cid === cid);
  if (!f) return { ok: false, error: 'That character is not in the list.' };
  const sheet = { ...f.sheet, name: n }, bad = sheetProblems(sheet);
  if (bad.length) return { ok: false, error: bad[0] };
  return n === f.sheet.name ? { ok: true, list } : { ok: true, list: list.map((x) => (x === f ? { ...f, sheet, edits: [...f.edits, { at: day, fields: ['name'] }].slice(-LIMITS.edits) } : x)) };
}
export function editFile(list, cid, sheet, day = today()) {
  const f = list.find((x) => x.cid === cid);
  if (!f) return { ok: false, error: 'That character is not in the list.' };
  const bad = sheetProblems(sheet);
  if (bad.length) return { ok: false, error: bad[0] };
  const fields = changedFields(f.sheet, sheet);
  return { ok: true, list: list.map((x) => (x === f ? { ...f, sheet: structuredClone(sheet), edits: fields.length ? [...f.edits, { at: day, fields }].slice(-LIMITS.edits) : f.edits } : x)) };
}
// A copy is a different character: a new id, a name that says so, nothing carried of the edits.
export function duplicateFile(list, cid, mk = newCid) {
  const f = list.find((x) => x.cid === cid);
  if (!f) return { ok: false, error: 'That character is not in the list.' };
  const name = `${f.sheet.name.slice(0, 33)} (copy)`.slice(0, 40);
  return addFile(list, { ...makeFile({ ...f.sheet, name }, { how: f.born.how, cid: mk(), level: f.born.level }) });
}

// ---------- storage: every access may be empty or throw ----------
export function loadList(storage = globalThis.localStorage) {
  let raw;
  try { raw = storage.getItem(KEY); } catch { return { list: [], error: 'This browser would not let the page read its saved characters. Nothing was lost; Export and Import still work.' }; }
  if (raw == null) return { list: [], error: '' };
  let v;
  try { v = JSON.parse(raw); } catch { return { list: [], error: 'The saved list could not be read, so it is shown empty. It is left as it was until you save something.' }; }
  if (!Array.isArray(v)) return { list: [], error: 'The saved list could not be read, so it is shown empty. It is left as it was until you save something.' };
  // Each entry is read as a file would be: one that does not pass is not shown (and so is dropped at the next save).
  const list = v.map((f) => parseFile(JSON.stringify(f))).filter((r) => r.ok).map((r) => r.file).filter((f, i, all) => all.findIndex((x) => x.cid === f.cid) === i).slice(0, LIMITS.saved);
  return { list, error: list.length < v.length ? `${v.length - list.length} saved character${v.length - list.length === 1 ? '' : 's'} could not be read and ${v.length - list.length === 1 ? 'is' : 'are'} not shown.` : '' };
}
export function saveList(list, storage = globalThis.localStorage) {
  try { storage.setItem(KEY, JSON.stringify(list)); return { ok: true }; } catch { return { ok: false, error: 'This browser would not keep the change (its storage is full or blocked). Export the character to keep it as a file.' }; }
}

// ---------- the party ----------
export const starters = () => Object.entries(PREGENS).map(([id, p]) => ({ id, name: p.name, cls: p.cls, level: p.level }));
export const STARTER_IDS = starters().map((s) => s.id);
// A slot's pick is 'starter:<id>' or 'mine:<cid>' or '' (nobody yet). Why a pick cannot be used ('' if it can); `others` are the other slots' picks.
export function pickProblem(pick, list, others = []) {
  if (!pick) return 'Choose a character.';
  if (others.includes(pick)) return 'Already chosen for another place in the party. Duplicate it in My characters to play two of it.';
  const [kind, id] = [pick.slice(0, pick.indexOf(':')), pick.slice(pick.indexOf(':') + 1)];
  if (kind === 'starter') return STARTER_IDS.includes(id) ? '' : 'That starter character is not in this version.';
  if (kind === 'mine') { const f = list.find((x) => x.cid === id); return f ? sheetProblems(f.sheet)[0] ?? '' : 'That character is not in My characters any more.'; }
  return 'Choose a character.';
}
// The party for newGame's `party` option, and what is wrong with the picks: { party, problems }. A party of 1 to partyMax.
export function buildParty(picks, list) {
  const problems = [];
  if (picks.length < LIMITS.partyMin || picks.length > LIMITS.partyMax) problems.push(`A party is ${LIMITS.partyMin} to ${LIMITS.partyMax} characters.`);
  const party = picks.map((p, i) => {
    const why = pickProblem(p, list, picks.filter((_, j) => j !== i));
    if (why) { problems.push(`Character ${i + 1}: ${why}`); return null; }
    return p.startsWith('starter:') ? { pregen: p.slice(8) } : { sheet: structuredClone(list.find((x) => x.cid === p.slice(5)).sheet) };
  });
  return { party: problems.length ? null : party, problems };
}
// The first pick for a place that has none: a starter nobody has, else a character of mine that can be used and is not in the party.
export function defaultPick(picks, list) {
  const free = [...STARTER_IDS.map((id) => `starter:${id}`), ...list.map((f) => `mine:${f.cid}`)];
  return free.find((p) => !picks.includes(p) && !pickProblem(p, list, picks)) ?? '';
}

// ---------- the screens ----------
const $ = (id) => document.getElementById(id);
function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k in e && k !== 'list') e[k] = v; else e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...kids.filter((x) => x != null));
  return e;
}
const readJson = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };

// `twoTap(button, armedText, note, go)` is the app's own (a second tap within three seconds). Returns { party(), refresh() }.
export function initMyCharacters({ twoTap, toast }) {
  let { list, error } = loadList();
  let slots = [], picks = [], msg = '';
  const remembered = readJson(PARTY_KEY);
  const count0 = Number.isInteger(remembered?.count) ? Math.min(LIMITS.partyMax, Math.max(LIMITS.partyMin, remembered.count)) : STARTER_IDS.length;
  picks = Array.isArray(remembered?.picks) ? remembered.picks.filter((p) => typeof p === 'string').slice(0, LIMITS.partyMax) : [];
  while (picks.length < LIMITS.partyMax) picks.push(defaultPick(picks.filter(Boolean), list));
  // A remembered pick that is gone or cannot be used gives its place to a starter or another character.
  picks = picks.map((p, i) => (pickProblem(p, list, picks.slice(0, i)) ? '' : p));
  picks = picks.map((p, i) => p || defaultPick(picks.slice(0, i).concat(picks.slice(i + 1)).filter(Boolean), list));
  let count = count0;
  const keepParty = () => { try { localStorage.setItem(PARTY_KEY, JSON.stringify({ count, picks })); } catch { /* storage unavailable */ } };
  const commit = (r) => { if (!r.ok) { msg = r.error; return false; } const s = saveList(r.list); if (!s.ok) { msg = s.error; return false; } list = r.list; error = ''; return true; };

  // ----- the lobby's party step -----
  const box = $('lobby-party');
  const countSel = $('lobby-party-count');
  countSel.replaceChildren(...Array.from({ length: LIMITS.partyMax - LIMITS.partyMin + 1 }, (_, i) => el('option', { value: String(i + LIMITS.partyMin), text: String(i + LIMITS.partyMin) })));
  const shown = () => picks.slice(0, count);
  const nameOf = (p) => (p.startsWith('starter:') ? starters().find((s) => s.id === p.slice(8))?.name : list.find((f) => f.cid === p.slice(5))?.sheet.name) ?? '';
  function drawParty() {
    countSel.value = String(count);
    const used = shown();
    $('lobby-slots').replaceChildren(...used.map((pick, i) => {
      const others = used.filter((_, j) => j !== i), why = pickProblem(pick, list, others);
      const opt = (value, text, off) => el('option', { value, text, disabled: off });
      const sel = el('select', { id: `lobby-slot-${i}`, 'aria-describedby': `lobby-slot-${i}-why` },
        ...(pick ? [] : [opt('', 'Choose…')]),
        el('optgroup', { label: 'Starter characters' }, ...starters().map((s) => { const v = `starter:${s.id}`; return opt(v, `${s.name}, ${s.cls} ${s.level}${others.includes(v) ? ' (already in the party)' : ''}`, others.includes(v)); })),
        ...(list.length ? [el('optgroup', { label: 'My characters' }, ...list.map((f) => { const v = `mine:${f.cid}`, bad = sheetProblems(f.sheet)[0]; return opt(v, `${f.sheet.name}, ${classLine(f.sheet)}${others.includes(v) ? ' (already in the party)' : bad ? ' (cannot be played)' : ''}`, others.includes(v) || !!bad); }))] : []),
        el('optgroup', { label: 'New' }, opt('__new', list.length >= LIMITS.saved ? `Create new… (My characters is full)` : 'Create new…', list.length >= LIMITS.saved)));
      sel.value = pick;
      sel.onchange = () => {
        if (sel.value === '__new') { sel.value = pick; return createNew(i); }
        picks[i] = sel.value; keepParty(); drawParty();
      };
      return el('div', { class: 'party-slot' }, el('label', { for: sel.id, text: `Character ${i + 1}` }), sel, el('p', { class: 'note party-why', id: `lobby-slot-${i}-why`, text: why, hidden: !why }));
    }));
    const { problems } = buildParty(used, list);
    $('lobby-party-sum').textContent = `Solo party (${count}): ${used.map(nameOf).filter(Boolean).join(', ') || 'nobody yet'}`;
    $('lobby-party-msg').textContent = problems.length ? problems[0] : '';
    $('lobby-party-msg').hidden = !problems.length;
    $('lobby-mychars').textContent = `My characters (${list.length})`;
    $('lobby-party-store').textContent = error; $('lobby-party-store').hidden = !error;
  }
  countSel.onchange = () => {
    count = +countSel.value;
    for (let i = 0; i < count; i++) if (!picks[i] || pickProblem(picks[i], list, picks.slice(0, count).filter((_, j) => j !== i))) picks[i] = defaultPick(picks.slice(0, count).filter((_, j) => j !== i), list);
    keepParty(); drawParty();
  };
  // "Create new…": the build screen, then back to the lobby with the new character saved and chosen for that place.
  function createNew(i) {
    openBuild({ mode: 'mine', onSave: (sheet) => {
      const r = addFile(list, makeFile(sheet, { how: 'built' }));
      if (!commit(r)) return msg;
      picks[i] = `mine:${list[list.length - 1].cid}`; keepParty(); drawParty(); drawManager();
      toast(`${sheet.name} is saved in My characters and chosen.`, true);
      return '';
    } });
  }

  // ----- the manager: the list on this device -----
  const panel = el('aside', { id: 'mychars', class: 'panel mc', hidden: true, 'aria-label': 'My characters' });
  document.body.append(panel);
  const fileInput = el('input', { type: 'file', id: 'mc-file', accept: `${FILE_EXT},.json,application/json`, hidden: true });
  let notes = [], renaming = null;
  const say = (m, ...more) => { msg = m; notes = more; drawManager(); };
  function download(f) {
    const url = URL.createObjectURL(new Blob([fileText(f)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: fileName(f) });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  fileInput.onchange = async () => {
    const f = fileInput.files?.[0]; fileInput.value = '';
    if (!f) return;
    if (f.size > LIMITS.fileBytes) return say(`${f.name} is over ${LIMITS.fileBytes / 1024} KB, more than a character file can be.`);
    let text; try { text = await f.text(); } catch { return say(`${f.name} could not be read.`); }
    const r = parseFile(text);
    if (!r.ok) return say(`${f.name} was not imported.`, ...r.problems);
    if (!commit(addFile(list, r.file))) return say(msg);
    say(`${r.file.sheet.name} was imported.`, ...r.notes); drawParty();
  };
  function drawManager() {
    const bad = (f) => sheetProblems(f.sheet)[0];
    const head = el('div', { class: 'qe-head' }, el('h2', { text: 'My characters' }), el('button', { type: 'button', class: 'close', id: 'mc-close', text: 'Close', onclick: () => { panel.hidden = true; $('lobby-mychars').focus?.({ preventScroll: true }); } }));
    const row = (f) => {
      const edit = f.sheet.classes ? 'Several classes: the build screen cannot open this one yet.' : '';
      const b = (id, text, on, off) => el('button', { type: 'button', id: `mc-${id}-${f.cid}`, class: 'quiet', text, onclick: on, disabled: !!off, title: off || undefined });
      const del = b('del', 'Delete', null);
      del.onclick = () => twoTap(del, 'Tap again to delete', '', () => { if (commit(removeFile(list, f.cid))) { msg = `${f.sheet.name} was deleted.`; notes = []; } drawParty(); drawManager(); });
      const title = renaming === f.cid
        ? el('form', { class: 'mc-rename', onsubmit: (ev) => { ev.preventDefault(); const r = renameFile(list, f.cid, ev.target.elements.name.value); renaming = null; if (commit(r)) { msg = ''; notes = []; } drawParty(); drawManager(); } },
          el('input', { type: 'text', name: 'name', value: f.sheet.name, maxLength: 40, 'aria-label': `New name for ${f.sheet.name}`, autocomplete: 'off' }), el('button', { type: 'submit', text: 'Save name' }), el('button', { type: 'button', class: 'quiet', text: 'Cancel', onclick: () => { renaming = null; drawManager(); } }))
        : el('strong', { text: f.sheet.name });
      return el('li', { class: 'mc-row', 'data-cid': f.cid }, title, el('small', { class: 'note', text: levelLine(f) }), bad(f) ? el('small', { class: 'note mc-bad', text: `Cannot be played: ${bad(f)}` }) : null,
        el('div', { class: 'row' },
          b('edit', 'Edit', () => openBuild({ mode: 'mine', sheet: f.sheet, onSave: (sheet) => { const r = editFile(list, f.cid, sheet); if (!commit(r)) return msg; msg = `${sheet.name} was saved.`; notes = []; drawParty(); drawManager(); return ''; } }), edit),
          b('rename', 'Rename', () => { renaming = f.cid; drawManager(); panel.querySelector('.mc-rename input')?.focus(); }),
          b('dup', 'Duplicate', () => { if (commit(duplicateFile(list, f.cid))) { msg = `A copy of ${f.sheet.name} was made.`; notes = []; } drawParty(); drawManager(); }, list.length >= LIMITS.saved ? full() : ''),
          b('export', 'Export', () => download(f)), del));
    };
    const add = el('button', { type: 'button', id: 'mc-new', text: 'New character', disabled: list.length >= LIMITS.saved, onclick: () => openBuild({ mode: 'mine', onSave: (sheet) => { const r = addFile(list, makeFile(sheet, { how: 'built' })); if (!commit(r)) return msg; msg = `${sheet.name} was saved.`; notes = []; drawParty(); drawManager(); return ''; } }) });
    const imp = el('button', { type: 'button', id: 'mc-import', text: 'Import a file', disabled: list.length >= LIMITS.saved, onclick: () => fileInput.click() });
    panel.replaceChildren(...[head,
      el('p', { class: 'note', text: `These characters are kept in this browser on this device (${list.length} of ${LIMITS.saved}). Clearing the browser's site data deletes them, so use Export to keep a file of each one you care about.` }),
      error ? el('p', { class: 'note mc-bad', id: 'mc-store', text: error }) : null,
      el('div', { class: 'row' }, add, imp, fileInput),
      el('div', { id: 'mc-msg', role: 'status', 'aria-live': 'polite' }, msg ? el('p', { text: msg }) : null, notes.length ? el('ul', {}, ...notes.map((n) => el('li', { text: n }))) : null),
      list.length ? el('ul', { class: 'mc-list', id: 'mc-list' }, ...list.map(row)) : el('p', { class: 'note', id: 'mc-empty', text: 'Nothing here yet. Make a character with New character, or import a character file.' })].filter(Boolean));
  }
  $('lobby-mychars').onclick = () => { msg = ''; notes = []; renaming = null; drawManager(); panel.hidden = false; panel.scrollTop = 0; $('mc-close').focus({ preventScroll: true }); };

  drawParty();
  return {
    // The party the lobby has chosen, for newGame: { party, problems }.
    party: () => buildParty(shown(), list),
    list: () => list,
    refresh: () => { drawParty(); },
  };
}
