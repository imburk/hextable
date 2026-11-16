// Homebrew packs on the page (docs/specs/homebrew.md, Decisions 3 to 7, rows H6 and B7; the messages are in packages/server/README.md).
// Two halves in one file.
//
// The store (every member): the table sends a list of packs (`packs`) and the data of a pack (`packData`). The page keeps the data by the hash it
// was given, asks for a hash it lacks and no other, checks the hash of what arrives, builds the entries once (`loadPack`) and keeps ONE overlay
// installed in the content lookups for as long as the table is open (`install` and `uninstall`, content/registry.js), so every place that reads
// `SPELLS` and `CONTENT` sees the table's homebrew. A pack that goes from the list, or a table that is left, is taken out. A player's data has no
// monsters (the server does not send one) and this page builds none: only the six lists a player is sent are read, whatever arrives.
//
// The manager (the DM): the list of the table's packs; a file chosen and read here, checked by `loadPack` and read back by `readEntry` BEFORE
// anything is sent; Add, Update and Remove through the table's `pack` message; the table's refusals in plain words; and Try it, the dry run of one
// spell. Everything shown from a file or from the table is put on the page as text (`textContent`), never as HTML.
//
//   const PK = initPacks({ transport: () => T, isDM, toast, changed });
//   PK.attach(T)      once for each transport the page starts; PK.clear() when the table is left; PK.waiting() for transport.holdUpdates
//   PK.reading(id)    opens the reading of a homebrew spell (any member); PK.isHomebrew(id), PK.packOf(id), PK.sync() after the DM tab opens
import { HOMEBREW_LIMITS } from './shared/content/schema.js';
import { loadPack, overlayOf, install, uninstall } from './shared/content/registry.js';
import { hashOf } from './shared/content/packs.js';
import { readEntry } from './shared/content/reader.js';
import { dryRun } from './shared/content/dryrun.js';

const $ = (id) => document.getElementById(id);
export const KINDS = ['spells', 'monsters', 'items', 'feats', 'weapons', 'armour', 'objects'];
export const PLAYER_KINDS = KINDS.filter((k) => k !== 'monsters');         // what a player is sent (Decision 5)
const KIND_NAME = { spells: ['spell', 'spells'], monsters: ['monster', 'monsters'], items: ['item', 'items'], feats: ['feat', 'feats'], weapons: ['weapon', 'weapons'], armour: ['piece of armour', 'pieces of armour'], objects: ['object', 'objects'] };
const TOO_BIG = 2 * HOMEBREW_LIMITS.packBytes;                              // the table reads a pack sent as text up to twice its limit (README: "Sizes")
const ASK_WAIT_MS = 4000;                                                    // how long an update waits for data that was asked for
const KEEP_DATA = 8;                                                         // pack data kept by hash beside the table's own list (older ones are let go)
const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const kb = (n) => (n < 1024 ? `${n} bytes` : `${Math.round(n / 102.4) / 10} KB`);
export const countWords = (doc) => KINDS.filter((k) => doc?.[k]?.length).map((k) => `${doc[k].length} ${KIND_NAME[k][doc[k].length === 1 ? 0 : 1]}`);

// The pack document a member's page loads from what the table sent. The DM's data is the whole document (format and all); a player's is
// `{ id, name, version, spells, items, ... }`: a document is made of the lists a player is sent and nothing else (a monster in it is left out).
export function documentOf(data, dm) {
  if (!plain(data)) return null;
  if (dm && data.format === 'hextable-pack') return data;
  const doc = { format: 'hextable-pack', v: 1, pack: { id: data.id, name: data.name, version: data.version, license: 'Shared at this table', attribution: 'Shared at this table' } };
  for (const k of PLAYER_KINDS) if (data[k] !== undefined) doc[k] = data[k];
  return doc;
}

// ---------- the store ----------
// `ask(id)` sends `{t:'packData', id}`; `changed()` is called when the installed overlay changed; `isDM()` says whose data this is.
export function createPackStore({ ask, changed = () => {}, isDM = () => false, now = () => Date.now() }) {
  let list = [];                           // the table's packs, as the last `packs` message said: [{ id, name, version, hash }]
  const data = new Map();                  // hash -> the data kept (a player's: the lists a player is sent only)
  const built = new Map();                 // hash -> { pack: loadPack's record, doc }
  const asked = new Map();                 // hash -> when it was asked for
  const trouble = new Map();               // hash -> why this page could not use the data
  let overlay = null, key = '', info = { dropped: [], changed: null };

  const forget = (hash) => { data.delete(hash); built.delete(hash); asked.delete(hash); trouble.delete(hash); };
  function sync() {
    // build what has data, ask for what has none
    for (const p of list) {
      if (built.has(p.hash) || trouble.has(p.hash)) continue;
      if (data.has(p.hash)) {
        const doc = documentOf(data.get(p.hash), isDM()), r = doc ? loadPack(doc) : { ok: false, problems: ['pack: is not a pack document'] };
        if (r.ok && (r.pack.id !== p.id || r.pack.version !== p.version)) trouble.set(p.hash, `The table's list and its data disagree about the pack "${p.id}".`);
        else if (r.ok) built.set(p.hash, { pack: r.pack, doc });
        else trouble.set(p.hash, r.problems[0] ?? 'The pack could not be loaded.');
      } else if (!asked.has(p.hash)) { asked.set(p.hash, now()); ask(p.id); }
    }
    // the overlay is what the list names and the page has, in the list's order
    const have = list.filter((p) => built.has(p.hash));
    const want = have.map((p) => p.hash).join(',');
    if (want === key) return;
    if (overlay) { try { uninstall(overlay); } catch (err) { console.warn(err); } overlay = null; }
    key = '';
    if (have.length) {
      try { const o = overlayOf(have.map((p) => built.get(p.hash).pack)); install(o); overlay = o; key = want; }
      catch (err) { for (const p of have) trouble.set(p.hash, String(err.problems?.[0] ?? err.message)); }
    } else key = want;
    changed();
  }
  return {
    // The table's list: it replaces what was known. Data for a pack that is no longer listed is let go.
    packs(msg) {
      list = (Array.isArray(msg.packs) ? msg.packs : []).filter((p) => plain(p) && typeof p.id === 'string' && typeof p.hash === 'string').map((p) => ({ id: p.id, name: String(p.name ?? p.id), version: p.version, hash: p.hash }));
      info = { dropped: Array.isArray(msg.dropped) ? msg.dropped.filter(plain).map((d) => ({ id: String(d.id), reason: String(d.reason) })) : [], changed: plain(msg.changed) ? msg.changed : null };
      const keep = new Set(list.map((p) => p.hash));
      for (const h of [...data.keys(), ...built.keys(), ...asked.keys(), ...trouble.keys()]) if (!keep.has(h)) forget(h);
      for (const [h] of [...data].slice(0, Math.max(0, data.size - KEEP_DATA))) if (!keep.has(h)) forget(h);
      for (const [h, at] of [...asked]) if (!data.has(h) && now() - at > 15000) asked.delete(h);   // a hash asked for and never answered is asked for again, slowly (the table limits it too)
      sync();
    },
    // A pack's data. Kept only if its hash is the hash it was sent under; a player keeps the lists a player is sent and nothing else.
    packData(msg) {
      if (!plain(msg) || typeof msg.hash !== 'string' || !plain(msg.data)) return false;
      let ok = false;
      try { ok = hashOf(msg.data) === msg.hash; } catch { /* not plain data */ }
      if (!ok) return false;
      const kept = isDM() ? msg.data : Object.fromEntries(['id', 'name', 'version', ...PLAYER_KINDS].filter((k) => msg.data[k] !== undefined).map((k) => [k, msg.data[k]]));
      data.set(msg.hash, kept); trouble.delete(msg.hash);
      sync();
      return true;
    },
    // Everything is let go: the table is left (or a new one is started).
    clear() {
      list = []; data.clear(); built.clear(); asked.clear(); trouble.clear(); info = { dropped: [], changed: null };
      if (overlay) { try { uninstall(overlay); } catch (err) { console.warn(err); } overlay = null; }
      key = '';
      changed();
    },
    // True while the data of a listed pack was asked for and has not come (and not for long): updates wait for it.
    waiting() { const t = now(); return list.some((p) => !built.has(p.hash) && !trouble.has(p.hash) && (!asked.has(p.hash) || t - asked.get(p.hash) < ASK_WAIT_MS)); },
    list: () => list.map((p) => ({ ...p, doc: built.get(p.hash)?.doc ?? null, trouble: trouble.get(p.hash) ?? null })),
    info: () => info,
    docOf: (id) => { const p = list.find((x) => x.id === id); return (p && built.get(p.hash)?.doc) ?? null; },
    // Which pack an entry id belongs to ("hb-<pack id>-..."), by the packs the page holds.
    entryOf(entryId) {
      for (const p of list) { const b = built.get(p.hash); if (!b || !b.pack.ids.includes(entryId)) continue; for (const k of KINDS) { const e = b.doc[k]?.find((x) => x.id === entryId); if (e) return { kind: k, entry: e, pack: p }; } }
      return null;
    },
    installed: () => overlay,
    // Runs `fn` with the overlay out of the lookups (a dry run builds its own; `using` refuses while one is installed), and puts it back.
    outside(fn) {
      const o = overlay;
      if (o) uninstall(o);
      try { return fn(); } finally { if (o) install(o); }
    },
    // What this page holds of the table's packs, for tests: the data kept (as it is kept), the ids built, the overlay installed.
    peek: () => ({ list, data: [...data.values()], built: [...built.values()].map((b) => b.pack.id), trouble: [...trouble.entries()], installed: !!overlay }),
  };
}

// ---------- the words ----------
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const button = (text, onclick, cls = '') => { const b = el('button', cls, text); b.type = 'button'; b.onclick = onclick; return b; };
const TIER_NAME = { auto: 'auto: the engine plays all of it', assist: 'assist: the engine plays part, the DM the rest', manual: 'manual: the DM plays it' };

// A reading (readEntry's answer) as nodes: every sentence is text.
export function readingNode(r) {
  const box = el('div', 'pm-reading');
  for (const line of r.lines ?? []) {
    const lead = /^ */.exec(line)[0].length;
    const p = el('p', 'pm-line', line.slice(lead));
    if (lead) p.style.paddingLeft = `${(lead / 2) * 0.9}em`;
    box.append(p);
  }
  if (r.doesNot?.length) { box.append(el('h5', '', 'What the engine does not do')); for (const l of r.doesNot) box.append(el('p', 'pm-line', l)); }
  if (r.problems?.length) { box.append(el('h5', '', 'What the reader could not read')); for (const l of r.problems) box.append(el('p', 'pm-line bad', l)); }
  if (r.text) box.append(el('p', 'pm-author', `The author's description: “${r.text}”`));
  return box;
}
const tierChip = (tier) => el('span', `pm-tier pm-${tier ?? 'none'}`, tier ?? 'not read');

// The table's refusal: its `error`, the linter's `problems`, and `blockers` (where the pack is in use), as a box of text.
export function refusalNode(e) {
  const box = el('div', 'pm-refusal'); box.setAttribute('role', 'alert');
  box.append(el('p', 'pm-error', String(e?.error ?? 'The table refused that.')));
  if (e?.problems?.length) { box.append(el('p', 'pm-sub', 'What the checker found:')); const ul = el('ul'); for (const x of e.problems) ul.append(el('li', '', String(x))); box.append(ul); }
  if (e?.blockers?.length) { box.append(el('p', 'pm-sub', 'It is still in use here:')); const ul = el('ul'); for (const x of e.blockers) ul.append(el('li', '', String(x))); box.append(ul); }
  return box;
}

// ---------- the page ----------
export function initPacks({ transport, isDM, toast, changed = () => {} }) {
  const T = () => transport();
  const store = createPackStore({ ask: (id) => T()?.packData?.(id), changed: () => { summary(); if (open) render(); changed(); }, isDM });
  let open = false, review = null, message = null, busy = false, armed = null, armTimer = null;
  const tries = new Map(), keep = new Set();                  // Try it's results by spell id; the readings left open
  let overlayEl = null, host = null;

  // ----- the DM's section in the drawer, and the sheet it opens -----
  function section() {
    if (host) return host;
    host = $('dm-packs'); if (!host) return null;
    host.append(el('h3', '', 'Homebrew packs'));
    host.append(el('p', 'note', 'Spells, items and more that this table adds to the rules, from a file. Players are sent the spells, items, feats, weapons, armour and objects, never a monster.'));
    host.append(Object.assign(el('p', 'note'), { id: 'pm-summary' }));
    const row = el('div', 'row'); row.append(Object.assign(button('Manage packs', () => show()), { id: 'pm-open' })); host.append(row);
    return host;
  }
  function summary() {
    const s = $('pm-summary'); if (!s) return;
    const l = store.list();
    const gone = store.info().dropped.length;
    s.textContent = (l.length ? `${l.length} of ${HOMEBREW_LIMITS.packs}: ${l.map((p) => `${p.name} (version ${p.version})`).join(', ')}.` : 'None on this table yet.') + (gone ? ` ${gone} could not be loaded.` : '');
  }
  function shell() {
    if (overlayEl) return overlayEl;
    overlayEl = el('div', 'pm'); overlayEl.id = 'pm'; overlayEl.hidden = true;
    overlayEl.setAttribute('role', 'dialog'); overlayEl.setAttribute('aria-modal', 'true'); overlayEl.setAttribute('aria-label', 'Homebrew packs');
    document.body.append(overlayEl);
    addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && open) hide(); });
    return overlayEl;
  }
  function show(mode = 'manage', id = null) {
    shell(); open = mode; review = mode === 'manage' ? review : null; overlayEl.hidden = false; overlayEl.dataset.mode = mode; shownId = id;
    render();
    overlayEl.querySelector('.pm-close')?.focus({ preventScroll: true });
  }
  let shownId = null;
  function hide() { open = false; if (overlayEl) overlayEl.hidden = true; }
  const frame = (title, ...kids) => {
    const head = el('header', 'pm-head'); head.append(el('h2', '', title), button('Close', hide, 'pm-close'));
    const body = el('div', 'pm-body'); body.append(...kids);
    return [head, body];
  };

  // ----- the reading of one spell (any member) -----
  function readingView() {
    const found = store.entryOf(shownId);
    const kids = [];
    if (!found) kids.push(el('p', 'note', 'This table no longer has that entry.'));
    else {
      const r = readEntry('spell', found.entry);
      const head = el('p', 'note'); head.append(`From the pack “${found.pack.name}”, version ${found.pack.version}. Not checked against any rulebook. Tier: `, tierChip(r.tier));
      kids.push(head, readingNode(r));
    }
    return frame(found ? `${found.entry.name}: its reading` : 'Reading', ...kids);
  }

  // ----- the manager -----
  function render() {
    if (!overlayEl || !open) return;
    const [head, body] = open === 'reading' ? readingView() : managerView();
    overlayEl.replaceChildren(head, body);
  }
  function managerView() {
    const kids = [];
    const st = store.info();
    for (const d of st.dropped) kids.push(refusalNode({ error: `The pack “${d.id}” could not be loaded when the table started, so the table plays without it: ${d.reason}` }));
    for (const p of store.list()) if (p.trouble) kids.push(refusalNode({ error: `This page could not use the pack “${p.name}”: ${p.trouble}` }));
    if (message) kids.push(message.ok ? Object.assign(el('p', 'pm-done', message.ok), { role: 'status' }) : refusalNode(message));
    // the list
    const list = el('section'); list.append(el('h3', '', `This table's packs (${store.list().length} of ${HOMEBREW_LIMITS.packs})`));
    if (!store.list().length) list.append(el('p', 'note', 'No packs yet. Choose a pack file below to read it and add it.'));
    for (const p of store.list()) list.append(packCard(p));
    kids.push(list);
    // add
    const add = el('section'); add.append(el('h3', '', 'Add a pack from a file'));
    add.append(el('p', 'note', 'The file is read here first and nothing is sent until you have looked at what it holds. A new version of a pack on the table is an update.'));
    const input = el('input'); input.type = 'file'; input.id = 'pm-file'; input.accept = '.json,application/json'; input.setAttribute('aria-label', 'Pack file');
    input.onchange = () => choose(input.files?.[0] ?? null);
    add.append(input);
    if (review) add.append(reviewNode());
    kids.push(add);
    return frame('Homebrew packs', ...kids);
  }
  const counts = (doc) => countWords(doc).join(', ') || 'nothing';

  function packCard(p) {
    const card = el('article', 'pm-pack'); card.dataset.pack = p.id;
    const head = el('div', 'pm-pack-head');
    const t = el('div'); t.append(el('strong', '', p.name), el('span', 'note', ` version ${p.version} · ${p.id}`));
    head.append(t);
    card.append(head);
    if (!p.doc) { card.append(el('p', 'note', p.trouble ? 'This page could not use it.' : 'Loading its data from the table…')); }
    else {
      card.append(el('p', 'note', `${counts(p.doc)}. Licence: ${p.doc.pack.license}.`));
      if (p.doc.spells?.length) card.append(spellList(p.doc, `${p.id}`));
    }
    const row = el('div', 'row');
    row.append(button('Update…', () => $('pm-file')?.click(), 'pm-update'));
    const rm = button(armed === p.id ? 'Tap again to remove' : 'Remove', () => remove(p), `pm-remove${armed === p.id ? ' sure' : ''}`);
    row.append(rm);
    card.append(row);
    return card;
  }
  async function remove(p) {
    if (armed !== p.id) { armed = p.id; clearTimeout(armTimer); armTimer = setTimeout(() => { armed = null; render(); }, 5000); message = null; return render(); }
    armed = null; clearTimeout(armTimer);
    await send({ op: 'remove', id: p.id }, `Removed “${p.name}” from the table.`);
  }
  // One spell: its name and tier, the reading, and Try it.
  function spellList(doc, scope) {
    const box = el('details', 'pm-entries'); box.dataset.key = `${scope}:spells`; box.open = keep.has(box.dataset.key);
    box.ontoggle = () => (box.open ? keep.add(box.dataset.key) : keep.delete(box.dataset.key));
    box.append(el('summary', '', `Spells (${doc.spells.length}): readings and Try it`));
    for (const e of doc.spells) box.append(spellNode(doc, e, scope));
    return box;
  }
  function spellNode(doc, e, scope) {
    const r = readEntry('spell', e), k = `${scope}:${e.id}`;
    const d = el('details', 'pm-entry'); d.dataset.key = k; d.dataset.entry = e.id; d.open = keep.has(k);
    d.ontoggle = () => (d.open ? keep.add(k) : keep.delete(k));
    const sum = el('summary'); sum.append(el('span', 'pm-name', r.title === '(unreadable entry)' ? String(e.name ?? e.id) : r.title), ' ', tierChip(r.tier)); d.append(sum);
    d.append(readingNode(r));
    const out = el('div', 'pm-try-out');
    const fill = () => { out.replaceChildren(); const t = tries.get(k); if (t) { out.append(el('pre', 'pm-try', t.text)); } };
    fill();
    d.append(Object.assign(button('Try it', () => tryIt(doc, e, k, out), 'pm-try-btn'), { title: 'Cast it in a throw-away game and say what happened' }), out);
    return d;
  }
  function tryIt(doc, entry, k, out) {
    out.replaceChildren(el('p', 'note', 'Trying it…'));
    setTimeout(() => {                                       // let the words show first: a dry run takes a moment
      let text;
      try {
        const r = store.outside(() => dryRun('spell', entry, { seed: 1, pack: doc }));
        text = r.ok ? r.summary.text : `The spell could not be tried: ${r.problems.join(' ')}`;
      } catch (err) { text = `The spell could not be tried: ${String(err?.message ?? err).slice(0, 200)}`; }
      tries.set(k, { text });
      out.replaceChildren(el('pre', 'pm-try', text));
    }, 30);
  }

  // ----- the file and its review -----
  async function choose(file) {
    review = null; message = null;
    if (!file) return render();
    if (file.size > TOO_BIG) { review = { name: file.name, size: file.size, refused: [`The file is ${kb(file.size)}. A pack is at most ${kb(HOMEBREW_LIMITS.packBytes)} of data, so a file over ${kb(TOO_BIG)} cannot be one. It was not read.`] }; return render(); }
    let text;
    try { text = await file.text(); } catch { review = { name: file.name, size: file.size, refused: ['The file could not be read.'] }; return render(); }
    let r;
    try { r = loadPack(text); } catch (err) { r = { ok: false, problems: [`pack: could not be checked (${String(err?.message ?? err).slice(0, 120)})`] }; }
    if (!r.ok) { review = { name: file.name, size: file.size, refused: r.problems }; return render(); }
    const doc = JSON.parse(text);                              // loadPack has parsed it and found it sound
    const entries = KINDS.flatMap((kind) => (doc[kind] ?? []).map((e) => ({ kind, entry: e, reading: kind === 'spells' ? readEntry('spell', e) : null })));
    const tiers = { auto: 0, assist: 0, manual: 0, unread: 0 };
    for (const x of entries) tiers[x.reading?.tier in tiers ? x.reading.tier : 'unread']++;
    review = { name: file.name, size: file.size, text, doc, pack: r.pack, entries, tiers, hash: hashOf(doc) };
    render();
  }
  // What the table would do with the file: add, update, or nothing.
  function plan() {
    const there = store.list().find((p) => p.id === review.pack.id);
    if (!there) return store.list().length >= HOMEBREW_LIMITS.packs ? { why: `This table already has ${HOMEBREW_LIMITS.packs} packs, the most it can hold. Remove one first.` } : { op: 'add', label: 'Add to this table' };
    if (there.hash === review.hash) return { why: 'The table already has exactly this pack.' };
    if (!(review.pack.version > there.version)) return { why: `The table has version ${there.version} of this pack. An update needs a higher version than that; this file is version ${review.pack.version}.` };
    const before = there.doc ? KINDS.flatMap((k) => (there.doc[k] ?? []).map((e) => e.id)) : [];
    const lost = before.filter((id) => !review.pack.ids.includes(id));
    if (lost.length) return { why: `This version leaves out ${lost.length} entr${lost.length === 1 ? 'y' : 'ies'} of version ${there.version} (${lost.slice(0, 3).join(', ')}${lost.length > 3 ? ', ...' : ''}). An update cannot drop entries: remove the pack and add it again.` };
    return { op: 'update', label: `Update from version ${there.version} to ${review.pack.version}` };
  }
  function reviewNode() {
    const box = el('div', 'pm-review'); box.id = 'pm-review';
    box.append(el('p', 'note', `${review.name} (${kb(review.size)})`));
    if (review.refused) {
      box.classList.add('refused');
      box.append(refusalNode({ error: 'The checker refused this file, so nothing was sent to the table.', problems: review.refused }));
      return box;
    }
    const { doc, pack, tiers } = review;
    const head = el('div', 'pm-review-head');
    head.append(el('strong', '', doc.pack.name), el('span', 'note', ` version ${pack.version} · ${pack.id}`));
    box.append(head);
    box.append(el('p', 'pm-counts', `Holds ${counts(doc)}.`));
    box.append(el('p', 'pm-counts', `Spells by tier: ${tiers.auto} auto, ${tiers.assist} assist, ${tiers.manual} manual.${tiers.unread ? ` ${tiers.unread} other ${tiers.unread === 1 ? 'entry is' : 'entries are'} not read by the reader yet: read the file yourself.` : ''}`));
    const lic = el('div', 'pm-licence'); lic.append(el('h4', '', 'Licence and attribution (the author’s words)'), el('p', '', `Licence: ${doc.pack.license}`), el('p', '', `Attribution: ${doc.pack.attribution}`));
    box.append(lic);
    if (doc.monsters?.length) box.append(el('p', 'note', `${doc.monsters.length} of its entries ${doc.monsters.length === 1 ? 'is a monster' : 'are monsters'}. Players are never sent a monster: only you and the table's engine hold them.`));
    box.append(el('p', 'note', 'Nothing here is checked against any rulebook. Each reading is made by the game from the data, not from the author’s description.'));
    // each entry
    const lists = el('div', 'pm-entries');
    for (const kind of KINDS) {
      const of = review.entries.filter((x) => x.kind === kind); if (!of.length) continue;
      lists.append(el('h4', '', `${KIND_NAME[kind][1][0].toUpperCase()}${KIND_NAME[kind][1].slice(1)} (${of.length})`));
      for (const x of of) lists.append(kind === 'spells' ? spellNode(doc, x.entry, `review:${pack.id}`) : otherNode(kind, x.entry));
    }
    box.append(lists);
    const p = plan();
    const row = el('div', 'row');
    if (p.op) { const b = button(p.label, () => submit(p), 'pm-go'); b.id = 'pm-go'; b.disabled = busy; row.append(b); }
    else box.append(el('p', 'pm-why', p.why));
    row.append(button('Cancel', () => { review = null; render(); }, 'pm-cancel'));
    box.append(row);
    return box;
  }
  function otherNode(kind, e) {
    const d = el('div', 'pm-entry pm-plain');
    const s = el('span', 'pm-name', String(e.name ?? e.id)); d.append(s, ' ', tierChip(null), el('span', 'note', kind === 'monsters' ? ' a monster: not read yet, never sent to players' : ' not read yet'));
    return d;
  }
  async function submit(p) {
    await send({ op: p.op, pack: review.text }, p.op === 'add' ? `Added “${review.doc.pack.name}” to the table.` : `Updated “${review.doc.pack.name}” to version ${review.pack.version}.`, true);
  }
  // One `pack` message, one answer in words. A refusal leaves the review where it is, so the file can be changed and tried again.
  async function send(msg, done, clearReview = false) {
    const tr = T();
    if (!tr?.packOp) { message = { error: 'This game has no table server to keep packs.' }; return render(); }
    busy = true; message = null; render();
    try { await tr.packOp({ t: 'pack', ...msg }); message = { ok: done }; if (clearReview) review = null; if (msg.op !== 'remove') toast?.(done, true); }
    catch (e) { message = plain(e) ? e : { error: String(e?.message ?? e) }; }
    busy = false; render();
  }

  // ----- what the page uses -----
  return {
    attach(t) {
      store.clear();
      t.on.packs = (m) => store.packs(m);
      t.on.packData = (m) => { if (store.packData(m)) t.flushUpdates?.(); };
      t.holdUpdates = () => store.waiting();
      const h = section(); if (h) h.hidden = !!t.solo;          // solo keeps no packs yet
      summary();
    },
    clear() { store.clear(); review = null; message = null; hide(); for (const k of [...tries.keys()]) tries.delete(k); keep.clear(); },
    // The packs list changed without data: let updates go once nothing is awaited.
    waiting: () => store.waiting(),
    open: () => show(),
    reading: (id) => show('reading', id),
    isHomebrew: (id) => /^hb-/.test(String(id)),
    packOf: (id) => store.entryOf(id)?.pack ?? null,
    sync() { section(); summary(); },
    peek: () => store.peek(),
    store,
  };
}
