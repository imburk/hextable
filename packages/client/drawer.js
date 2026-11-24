// The menu (docs/specs/one-token-menu.md, Decisions 1, 3, 4c, 5, 6 and 11; stages M1 and M8 of its build plan). One token, `#btn-menu`, opens one
// menu. A tap on it fans the places out in an arc round it (M8): one symbol for each character this person plays, then Turns (Party while nobody fights),
// Dice, Log and chat (Handouts when there are any), Setup, and DM tools for the DM. A symbol opens its screen: below 900 px a sheet that rises from the
// bottom, from 900 px a column from the side with the map beside it. The same symbols run across the top of every screen (the strip), so there is no
// first-level list to go back to. Either way a tap on the die, a tap on the dimmed map, or Escape closes everything. It is a view over the page, not
// over the game: it reads the state it is given, to hide itself under a question and to say whose turn it is, and it changes nothing in it. The screens
// are the old drawer's panels, re-parented, with their ids; the strip's buttons are the old first level's rows, with theirs.
//
//   const D = initDrawer({ prefs, state, isDM, selected, change, token, charName, pickChar });
//   D.open('sheet'); D.open('settings'); D.open(); D.close(); D.toggle(); D.back();   D.sync(S);   (S is null before a table is joined)
//
// A place is a path: [] is the arc, ['turns'] a screen, ['more'] the list of every place (for a table with more places than the arc has slots).
// A page with sections (M10: Setup, Log and chat, DM tools; a panel marked `data-acc`) is one accordion (accordion.js): ['dm', 'creatures'] is
// DM tools with Creatures open, ['dm'] with none open, and ['dm', 'all'] every section of DM tools one under the other (M5's last row). One
// section is open at a time, the bars before it stay at the top and those after it at the bottom, and a page remembers which was open.
// Old names still open their screens (`open('character')` is `open('sheet')`; a leading 'table', the list that held Setup and DM tools, is
// dropped; 'handouts', a place until M10, is that section of Log and chat).
//
// Preferences it keeps (client only, through `prefs`): hextable.drawerSide ('left' | 'right': where a wide screen's column comes from),
// hextable.drawerPin (bool), hextable.menuMotion ('slide' | 'appear'), hextable.menuToken ('center' | 'left' | 'right': where the token sits; it sits there
// whatever is open), hextable.menuLabels ('3s' | 'always': the words under the symbols), hextable.seen.ring (the note about the health ring was read).
// Where the menu is open is in memory only, and a closed menu opens on its arc.
import { current } from './shared/engine.js';
import { symbol, placeSymbol } from './symbols.js';
import { arcLayout, arcShape } from './menuarc.js';
import { dwellTimer } from './scrolltip.js';
import { mountAccordion } from './accordion.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// A screen -> its panel, its button on the strip, and its heading (a character's page is headed by the character's name).
export const TABS = {
  sheet: { panel: 'sheet', button: 'tab-sheet', title: 'Character' },
  turns: { panel: 'tracker', button: 'tab-turns', title: 'Turns' },
  dice: { panel: 'dicepanel', button: 'tab-dice', title: 'Dice' },
  log: { panel: 'log', button: 'tab-log', title: 'Log and chat' },
  settings: { panel: 'settings', button: 'tab-settings', title: 'Setup' },
  dm: { panel: 'dm', button: 'tab-dm', title: 'DM tools' },
  about: { panel: 'about', button: 'tab-about', title: 'About' },
};
const MORE = 'more', MORE_TITLE = 'Every place';
const ALIAS = { character: 'sheet', party: 'turns', root: '', menu: '', table: '' };
const SIDES = ['left', 'right'], MOTIONS = ['slide', 'appear'], TOKENS = ['center', 'left', 'right'], LABELS = ['3s', 'always'];
const WIDE = '(min-width: 900px)';             // the pinned menu, and closeDM() in app.js, use this width
const COLUMNS = `${WIDE}, (orientation: landscape) and (max-height: 500px)`;      // the shape with a column: a wide screen, or a phone on its side
const FLICK = 0.5, SWIPE = 60;                 // px per ms, px: how far or fast a drag on the handle must go to close
const SLIDE_MS = 720;                          // the longest slide (Decision 6, round 2); a panel stays drawn this long after it leaves

export function initDrawer({ prefs, state, isDM, selected = () => null, change = () => {}, token: tokenOf = () => null, charName = () => null, pickChar = () => {} }) {
  const el = $('drawer'), scrim = $('drawer-scrim'), token = $('btn-menu'), title = $('drawer-title'), live = $('drawer-live');
  const rootList = $('menu-root'), moreLevel = $('menu-table'), moreList = $('more-list'), body = $('drawer-body'), arcEl = $('menu-arc'), arc = $('arc');
  const mqWide = matchMedia(WIDE), mqCols = matchMedia(COLUMNS);
  const savedSide = prefs.get('hextable.drawerSide');
  let side = SIDES.includes(savedSide) ? savedSide : 'left';
  let pin = prefs.get('hextable.drawerPin') === true;
  const savedMotion = prefs.get('hextable.menuMotion'), savedToken = prefs.get('hextable.menuToken'), savedLabels = prefs.get('hextable.menuLabels');
  let motion = MOTIONS.includes(savedMotion) ? savedMotion : 'slide';
  let tokenAt = TOKENS.includes(savedToken) ? savedToken : 'center';
  let labels = LABELS.includes(savedLabels) ? savedLabels : '3s';
  let path = [], isOpen = false, held = false, opener = null, hideTimer = null;
  let drawerUp = false;               // the sheet (or the column) is up: a screen is open, not only the arc
  let arcUp = false, labelsUp = false; // the arc is fanned out; its words have come up (3 s with no choice)
  let shownLeaf = null;               // the screen whose panel is drawn: it stays drawn while the sheet slides it away
  let shownKey = '';                  // that screen and the screen inside it, 'dm/creatures': what a kept scroll belongs to
  let wantScroll = null;              // a screen's kept scroll, put back again once the app has drawn the screen (an empty panel cannot be scrolled)
  let stripAt = '';                   // the place the strip last brought into view
  const scrolls = new Map();          // a screen's scroll, kept while another is shown (Decision 4a)
  let announced;                      // the turn last spoken, so a turn is spoken once; undefined until the first look at a table
  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  const still = () => reduced() || motion === 'appear';       // no movement at all (Decision 6)
  const wide = () => mqWide.matches;
  const columns = () => mqCols.matches;
  const pinned = () => pin && wide();
  const modal = () => !pinned();      // it covers the map unless it is pinned beside it
  // The arc's words come up after 3 s with no choice (the same wait as the scroll card's, scrolltip.js), or at once when the setting says Always.
  const dwell = dwellTimer({ hold: () => { labelsUp = true; arcEl.classList.add('labels'); } });

  // Waiting for you sits above the arc (it headed the first level's list; the arc is the first level now). The strip's buttons get their symbols.
  $('arc-above').prepend($('menu-waiting'));
  for (const b of rootList.querySelectorAll('.menu-row[data-go]')) {
    const k = placeSymbol(b.dataset.go), i = document.createElement('span');
    i.className = 'mr-sym'; i.setAttribute('aria-hidden', 'true'); i.dataset.sym = k ?? ''; i.innerHTML = symbol(k);
    b.prepend(i);
  }

  // ---- the tree ----
  const keyOf = (w) => { const k = String(w ?? '').toLowerCase(); return k in ALIAS ? ALIAS[k] : k; };
  // A name, a path array or 'a/b' as a path. An unknown name is the arc.
  // (An old name is read only until a place is named: what follows a place is one of its sections, and Setup has one called `menu`.)
  const pathOf = (which) => { const out = []; for (const w of (Array.isArray(which) ? which : String(which ?? '').split('/'))) { const k = out.length ? String(w ?? '').toLowerCase() : keyOf(w); if (k) out.push(...(!out.length && k === 'handouts' ? ['log', 'handouts'] : [k])); } return out; };
  const leafOf = (p) => (p[0] in TABS ? p[0] : null);
  const subOf = (p) => (leafOf(p) && p.length > 1 ? p[1] : null);
  // The pages with sections, each one accordion: { leaf: [section ids] }, made from the page as it is written. `mem` is the section a page had open
  // last ('' for none; not set until the page was looked at, when the panel's `data-acc-first` opens).
  const ACC = {}, mem = {};
  for (const [id, t] of Object.entries(TABS)) if ($(t.panel).hasAttribute('data-acc')) ACC[id] = mountAccordion($(t.panel), id);
  const panelOf = (leaf) => $(TABS[leaf].panel);
  const secEl = (leaf, sec) => panelOf(leaf).querySelector(`:scope > .acc-sec[data-sec="${CSS.escape(sec)}"]`);
  const allRow = (leaf) => panelOf(leaf).querySelector(':scope > .acc-all [data-sec="all"]');
  const secOk = (leaf, sec) => !!ACC[leaf] && (sec === 'all' ? !!allRow(leaf) : ACC[leaf].includes(sec) && !secEl(leaf, sec).hidden);
  // A page reached by its name alone opens on the section it had open last.
  const land = (p) => { if (p.length !== 1 || !ACC[p[0]]) return p; const sec = mem[p[0]] ?? panelOf(p[0]).dataset.accFirst ?? ''; return sec && secOk(p[0], sec) ? [p[0], sec] : p; };
  // What scrolls: the open section of a pinned page, otherwise the screen.
  const scroller = () => (shownLeaf && ACC[shownLeaf] ? panelOf(shownLeaf).querySelector(':scope > .acc-sec.open > .acc-body') : null) ?? body;
  // What can be reached now. Before a table is joined there is only Setup and About (and no token, so no arc).
  function reach() {
    const S = state();
    if (!S) return ['settings', 'about'];
    return ['sheet', 'turns', 'dice', 'log', 'settings', ...(isDM() ? ['dm'] : []), 'about', MORE];
  }
  // The longest part of a path that can be reached.
  function valid(p, ok) {
    if (!p.length || !ok.includes(p[0])) return [];
    if (p[0] === MORE) return [MORE];
    return p.length > 1 && secOk(p[0], p[1]) ? [p[0], p[1]] : [p[0]];
  }
  // Every screen says what it is (Decision 4c): a character's page is the character's name, Turns is Party while nobody fights.
  const nameOfPlace = (seg) => (seg === 'sheet' ? charName() || TABS.sheet.title : seg === 'turns' && !state()?.encounter ? 'Party' : seg in TABS ? TABS[seg].title : seg === MORE ? MORE_TITLE : '');

  // ---- painting ----
  const word = (b, text) => { const x = b.querySelector('.mr-sum'); if (x && x.dataset.text !== text) { x.dataset.text = text; x.firstChild?.nodeType === 3 ? (x.firstChild.textContent = text) : x.prepend(document.createTextNode(text)); } };
  function summaries(S) {
    if (!S) return;
    const e = selected();
    word($('tab-sheet'), e?.abil ? `${e.name} · ${e.hp} / ${e.maxHp} HP` : 'None selected');
    const enc = S.encounter, now = enc?.order[enc.turn], turns = $('tab-turns');
    turns.querySelector('.mr-name').textContent = enc ? 'Turns' : 'Party';
    const k = placeSymbol('turns', { fight: !!enc }), i = turns.querySelector('.mr-sym');
    if (i.dataset.sym !== k) { i.dataset.sym = k; i.innerHTML = symbol(k); }
    word(turns, !enc ? '' : now?.someone ? (S.settings?.unseenTurns === 'quiet' ? `Round ${enc.round}` : `Round ${enc.round} · Something moves unseen`) : `Round ${enc.round} · ${S.entities[now?.id]?.name ?? 'Someone'}'s turn`);
  }

  // The token's states (Decision 7; M6): the arc is the selected character's Hit Points (the good colour, the bad one at half or less), the ring is lit on a turn of the
  // viewer's and pulses once when it starts, a flat bar lies across the die when the character is down, and the token is grey when it is dead or the link is lost (then crossed too).
  let wasTurn = false;
  function paintToken(S) {
    const t = S ? tokenOf() : null, c = token.classList;
    c.toggle('has-hp', t?.hp != null); c.toggle('low', !!t?.low); c.toggle('down', !!t?.down); c.toggle('dead', !!t?.dead); c.toggle('offline', !!t?.offline); c.toggle('turn', !!t?.turn);
    token.style.setProperty('--hp', String(Math.round((t?.hp ?? 0) * 100)));
    if (t?.turn && !wasTurn && !still()) { c.remove('pulse'); void token.offsetWidth; c.add('pulse'); }
    if (!t?.turn) c.remove('pulse');
    wasTurn = !!t?.turn;
    // Its name stays "Menu"; what it shows is its description, read after the name ("Menu. Your turn. Wren, 6 of 8 Hit Points. 1 waiting for you.").
    const says = t?.says ?? '';
    if ($('token-says').textContent !== says) $('token-says').textContent = says;
  }

  function applyPanels() {
    const open = !el.hidden && !held;
    for (const [id, t] of Object.entries(TABS)) $(t.panel).hidden = !(open && id === shownLeaf);   // a hidden panel is not drawn: the app only renders what is shown
  }

  // The places, in order: a symbol for each character this person plays (the app's rows, `#party .pr`), then the strip's own buttons that can be reached.
  // Each is { key, el (its button on the strip), char, name, sum (a line about it), badge, current, mark (its symbol's HTML) }.
  function places() {
    const out = [], leaf = leafOf(path);
    for (const b of $('party').querySelectorAll('.pr[data-id]')) {
      out.push({ key: `c:${b.dataset.id}`, el: b, char: true, name: b.querySelector('strong')?.textContent ?? '', sum: [b.querySelector('small')?.textContent, b.querySelector('.pr-state')?.textContent].filter(Boolean).join(' \u00b7 '),
        badge: 0, current: leaf === 'sheet' && b.classList.contains('sel'), mark: b.querySelector('.pr-sig')?.outerHTML ?? '' });
    }
    for (const b of rootList.querySelectorAll('.menu-row[data-go]')) {
      if (b.hidden) continue;
      const k = b.dataset.go, n = b.querySelector('.mr-sum b:not([hidden])');
      out.push({ key: k, el: b, char: false, name: b.querySelector('.mr-name').textContent, sum: b.querySelector('.mr-sum')?.dataset.text ?? '', badge: Number(n?.textContent) || 0, current: leaf === k, mark: b.querySelector('.mr-sym').innerHTML });
    }
    return out;
  }
  const tile = (p, cls, extra = '') => `<button type="button" class="${cls}" data-place="${esc(p.key)}"${p.current ? ' aria-current="page"' : ''}${extra}>`;

  // The strip: the current place is marked and brought into view by the strip's own scroll (never `scrollIntoView`: it would scroll the sheet too, R20);
  // an end's arrow shows only when there is more that way.
  function stripEnds() {
    const more = rootList.scrollWidth - rootList.clientWidth > 4 && rootList.getClientRects().length > 0;
    $('strip-prev').hidden = !(more && rootList.scrollLeft > 4);
    $('strip-next').hidden = !(more && rootList.scrollLeft + rootList.clientWidth < rootList.scrollWidth - 4);
  }
  function paintStrip(list) {
    for (const b of rootList.querySelectorAll('.menu-row[aria-current="page"], .pr[aria-current="page"]')) if (!list.some((p) => p.current && p.el === b)) b.setAttribute('aria-current', 'false');      // a place that is hidden now too (About, before a table)
    for (const p of list) p.el.setAttribute('aria-current', p.current ? 'page' : 'false');
    const cur = list.find((p) => p.current), key = `${cur?.key ?? ''}`;
    if (cur && drawerUp && key !== stripAt && rootList.getClientRects().length) {
      const a = cur.el.getBoundingClientRect(), r = rootList.getBoundingClientRect(), edge = 40;      // room for an arrow at each end
      if (a.left < r.left + edge) rootList.scrollLeft -= r.left + edge - a.left;
      else if (a.right > r.right - edge) rootList.scrollLeft += a.right - (r.right - edge);
      stripAt = key;
    }
    if (!drawerUp) stripAt = '';
    stripEnds();
  }

  // The arc: the places as round buttons on rings round the die (menuarc.js works out where). The words are in each button from the start, for a screen
  // reader; on the screen they come up after 3 s. With more places than slots the last slot is More.
  function paintArc(list, on) {
    if (!on) { if (arcUp) { arcUp = false; labelsUp = false; dwell.reset(); arcEl.classList.remove('out', 'labels'); } arcEl.hidden = true; return; }
    const t = token.getBoundingClientRect(), cx = t.left + t.width / 2, cy = t.top + t.height / 2;
    const shape = arcShape({ w: innerWidth, h: innerHeight, x: cx });
    const lay = arcLayout(list.length, shape, innerWidth / 2 - 30);
    const items = lay.more ? [...list.slice(0, lay.slots.length - 1), { key: MORE, name: 'More', sum: 'Every place', badge: list.slice(lay.slots.length - 1).reduce((n, p) => n + p.badge, 0), mark: symbol('more') }] : list;
    const html = items.map((p, i) => `${tile(p, `arc-b${p.char ? ' char' : ''}`, ` style="--x:${lay.slots[i].x}px;--y:${lay.slots[i].y}px;--i:${i}"`)}<span class="ab-mark" aria-hidden="true">${p.mark}</span><span class="ab-label">${esc(p.name)}</span>${p.sum ? `<span class="sr-only">, ${esc(p.sum)}</span>` : ''}${p.badge ? `<b class="ab-badge">${p.badge}<span class="sr-only"> waiting</span></b>` : ''}</button>`).join('');
    if (arc.dataset.sig !== html) {
      const at = document.activeElement?.closest?.('#arc [data-place]')?.dataset.place;
      arc.dataset.sig = html; arc.innerHTML = html;
      if (at) arc.querySelector(`[data-place="${CSS.escape(at)}"]`)?.focus({ preventScroll: true });
    }
    arcEl.style.setProperty('--tx', `${cx}px`); arcEl.style.setProperty('--ty', `${cy}px`);
    arcEl.style.setProperty('--arc-top', `${Math.round(cy + Math.min(-40, ...lay.slots.map((x) => x.y)) - 26)}px`);
    arcEl.dataset.shape = shape;
    // The note about the health ring, the first time the arc opens on this device (Decision 1): one line and Got it.
    const tk = tokenOf(), e = selected(), note = $('ring-note');
    const say = tk?.hp != null && e && prefs.get('hextable.seen.ring') !== true ? `The ring round the die is ${charName() || e.name}'s health: ${e.hp} of ${e.maxHp} HP.` : '';
    note.hidden = !say; if ($('ring-note-text').textContent !== say) $('ring-note-text').textContent = say;
    arcEl.hidden = false;
    if (!arcUp) {
      arcUp = true; labelsUp = false;
      void arcEl.offsetWidth; arcEl.classList.add('out');           // the symbols grow out of the die from where it is
      dwell.reset(); dwell.hover();
    }
    arcEl.classList.toggle('labels', labels === 'always' || labelsUp);
  }
  // More: every place as a row with its name and a line about it.
  function paintMore(list, on) {
    const html = on ? list.map((p) => `<li>${tile(p, 'menu-row')}<span class="mr-sym" aria-hidden="true">${p.mark}</span><span class="mr-name">${esc(p.name)}</span><span class="mr-sum">${esc(p.sum)}${p.badge ? ` <b>${p.badge}</b>` : ''}</span><span class="mr-chev" aria-hidden="true">&rsaquo;</span></button></li>`).join('') : '';
    if (moreList.dataset.sig !== html) { moreList.dataset.sig = html; moreList.innerHTML = html; }
  }

  function paint() {
    const S = state(), ok = reach(), cols = columns();
    const was = shownKey ? scroller().scrollTop : 0;                 // read before anything is redrawn: a section that shuts forgets its scroll
    path = valid(path, ok);
    if (isOpen && !path.length && !S) path = ['settings'];           // no token before a table, so no arc: the menu is Setup and About
    const open = isOpen && !held, leaf = leafOf(path), sub = subOf(path), arcOn = open && !path.length, up = isOpen && path.length > 0;
    document.body.dataset.drawer = side;
    document.body.dataset.menuShape = cols ? 'columns' : 'sheet';
    document.body.dataset.menuMotion = still() ? 'appear' : 'slide';
    document.body.dataset.menuLabels = labels;
    document.body.dataset.token = tokenAt;
    document.body.classList.toggle('drawer-open', open);
    document.body.classList.toggle('menu-arc', arcOn);
    document.body.classList.toggle('drawer-pinned', open && up && pinned());
    document.body.classList.toggle('drawer-modal', open && (arcOn || modal()));
    document.body.classList.toggle('drawer-pretable', !S);
    el.dataset.path = path.join('/'); el.dataset.depth = String(sub ? 2 : path.length ? 1 : 0); el.dataset.leaf = leaf ?? '';
    // The sheet (or the column) is up while a screen is open; the arc alone leaves it down.
    if (up && !drawerUp) { drawerUp = true; show(); } else if (!up && drawerUp) { drawerUp = false; hide(); }

    // The strip's buttons: which can be reached. A page with sections has one open (its bars pinned above and below it), none (every bar with its tip), or all.
    for (const [id, t] of Object.entries(TABS)) {
      $(t.button).hidden = !ok.includes(id);
      if (id !== leaf || !ACC[id]) continue;
      const panel = $(t.panel), at = sub ?? '', all = at === 'all';
      if (!all) mem[id] = at;
      panel.dataset.sec = at; panel.classList.toggle('pin', !!at && !all);
      for (const x of panel.querySelectorAll(':scope > .acc-sec')) {
        const on = at === x.dataset.sec, b = x.querySelector(':scope > .acc-h > .acc-bar'), box = x.querySelector(':scope > .acc-body');
        x.classList.toggle('open', on);
        if (b.getAttribute('aria-expanded') !== String(on)) b.setAttribute('aria-expanded', String(on));
        if (box.hidden !== !(on || all)) box.hidden = !(on || all);
      }
      const rest = panel.querySelector(':scope > .acc-all'); if (rest) rest.hidden = !!at;
    }
    if ($('party').childElementCount) $('tab-sheet').hidden = true;      // the characters are places of their own (Decision 4b); the one Character place is for a table with none
    if (S) $('tab-about').hidden = true;                                 // at a table About is a button of Setup's Help and about (round 4)
    summaries(S);
    // The badge: the token carries one, the sum of what waits. The app counts it (the lines of "Waiting for you" and the cards of the DM's to-do tray)
    // and says so on that box; before it has, the two old badges are the sum.
    const counted = $('menu-waiting')?.dataset.count;
    const n = !S ? 0 : counted !== undefined ? Number(counted) || 0 : ['dm-badge', 'ho-badge'].reduce((sum, id) => sum + ($(id).hidden ? 0 : Number($(id).textContent) || 0), 0);
    $('menu-badge').hidden = !n; $('menu-badge').textContent = n;
    paintToken(S);

    // The levels: More's list or a screen. Switching places swaps the screen where it is (R20): nothing slides but the sheet itself.
    moreLevel.dataset.pos = path[0] === MORE ? 'here' : 'over'; body.dataset.pos = leaf ? 'here' : 'over';
    $('drawer-handle').hidden = cols;
    const list = places();
    paintStrip(list); paintArc(list, arcOn); paintMore(list, open && path[0] === MORE);

    // The heading is the screen's own name; a screen under another has a way back that names it ("‹ DM tools" over "Creatures").
    // A page with sections keeps its own name while one is open; only "all on one page" is a screen under it, with a way back.
    const here = path.length ? nameOfPlace(path[0]) : '';
    if (title.textContent !== here && here) title.textContent = here;
    const back = $('drawer-back'), up1 = sub === 'all' ? nameOfPlace(leaf) : '';
    back.hidden = sub !== 'all';
    if (back.dataset.to !== up1) { back.dataset.to = up1; back.textContent = up1 ? `\u2039 ${up1}` : '\u2039'; back.setAttribute('aria-label', up1 ? `Back to ${up1}` : 'Back'); }

    // The screen: its panel is drawn while it is in view, and a moment longer while the sheet slides it out. A screen that was left keeps
    // its scroll, and gets it back.
    const want = open && path.length ? leaf : el.hidden ? null : shownLeaf;
    const key = want ? `${want}/${want === leaf ? sub ?? '' : shownKey.split('/')[1] ?? ''}` : '';      // a screen inside a screen keeps a scroll of its own
    if (key !== shownKey) {
      if (shownKey) scrolls.set(shownKey, was);
      shownLeaf = want; shownKey = key;
      applyPanels();
      if (want) { wantScroll = scrolls.get(key) ?? 0; scroller().scrollTop = wantScroll; }
    } else applyPanels();

    // The map makes room for a pinned menu: the insets are what every fixed piece of the table reads.
    const w = open && up && pinned() ? el.offsetWidth || 360 : 0;
    document.body.style.setProperty('--inset-l', side === 'left' ? `${w}px` : '0px');
    document.body.style.setProperty('--inset-r', side === 'right' ? `${w}px` : '0px');
    // The token does not move for the menu (round 6, R25): the sheet and the column keep their bottom strip empty for it (drawer.css).
    token.setAttribute('aria-expanded', String(open));
    // A dialog while it covers the map; a complementary landmark when it sits beside it.
    if (modal()) { el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); } else { el.setAttribute('role', 'complementary'); el.removeAttribute('aria-modal'); }
    $('drawer-pin').setAttribute('aria-pressed', String(pin)); $('drawer-pin').classList.toggle('on', pin);
    scrim.hidden = !(open && (arcOn || modal()));              // the dimmed map is the clear zone: one tap on it closes everything and does nothing else
    el.classList.toggle('held', held);
    el.inert = !(open && up);
  }

  function show() {
    clearTimeout(hideTimer);
    el.hidden = false;
    void el.offsetWidth;                     // so the slide starts from where it was
    el.classList.add('open');
  }
  function hide() {
    el.classList.remove('open');
    clearTimeout(hideTimer);
    const done = () => { if (!drawerUp) { if (shownKey) scrolls.set(shownKey, scroller().scrollTop); el.hidden = true; shownLeaf = null; shownKey = ''; applyPanels(); } };      // a hidden box forgets its scroll: it is kept here
    if (still()) done(); else hideTimer = setTimeout(done, SLIDE_MS);
  }

  const rescroll = () => { if (wantScroll != null) { if (wantScroll && !scroller().scrollTop) scroller().scrollTop = wantScroll; wantScroll = null; } };
  // Where the focus goes when a place opens: a screen's heading; on the arc, its first symbol.
  const focusHere = () => (path.length ? title : arc.querySelector('.arc-b') ?? token).focus({ preventScroll: true });
  // Go to a place. `focus`: where the focus goes (the heading by default; null leaves it).
  function go(next, { focus = 'title' } = {}) {
    path = next;
    paint();
    if (focus === 'title') focusHere();
    change('tab'); rescroll();
  }
  // A place chosen from the arc or from More: a character is the app's to select and open; More is the list; anything else is its screen.
  function choose(key) {
    if (key === MORE) go([MORE]);
    else if (key.startsWith('c:')) pickChar(key.slice(2));
    else go(land(valid([key], reach())));
  }
  function open(which = null, from = null, quiet = false) {
    const wasOpen = isOpen;
    const want = which == null ? (wasOpen ? path : []) : land(pathOf(which));
    const changed = want.join('/') !== path.join('/');
    path = want;
    if (!wasOpen) {
      opener = from ?? (document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : token);
      isOpen = true;
      document.body.classList.toggle('drawer-over', !$('lobby').hidden || !$('splash').hidden || !state());     // above the lobby and the splash, which are the only things that can be under it
    }
    paint();
    change('open'); rescroll();
    if (!quiet && (!wasOpen || changed)) focusHere();
  }
  function close(returnFocus = true) {
    if (!isOpen) return;
    isOpen = false;
    paint();
    const to = opener && document.contains(opener) && !opener.hidden ? opener : token;
    opener = null;
    if (returnFocus) (to.offsetParent !== null || getComputedStyle(to).position === 'fixed' ? to : token).focus({ preventScroll: true });
    change('close');
  }
  const toggle = () => (isOpen ? close() : open(null, token));
  // One level back: an open section shuts (the focus stays on its bar, so a keyboard keeps its place); "all on one page" goes back to the bars; More to the arc.
  function back() {
    const inner = subOf(path);
    if (path[0] === MORE) { go([]); return true; }
    if (!inner) return false;
    const leaf = leafOf(path), row = inner === 'all' ? allRow(leaf) : secEl(leaf, inner)?.querySelector('.acc-bar');
    go(path.slice(0, -1), { focus: null });
    (row && !row.hidden && row.getClientRects().length && getComputedStyle(row).visibility !== 'hidden' ? row : title).focus({ preventScroll: true });
    return true;
  }

  // ---- a level that has more below its fold fades at the bottom ----
  const fade = (lv) => lv.classList.toggle('more', lv.getClientRects().length > 0 && lv.scrollTop + lv.clientHeight < lv.scrollHeight - 4);
  const fadeAll = () => { for (const lv of el.querySelectorAll('.menu-level')) fade(lv); };
  for (const lv of el.querySelectorAll('.menu-level')) lv.addEventListener('scroll', () => fade(lv), { passive: true });
  addEventListener('resize', fadeAll);
  new MutationObserver(() => requestAnimationFrame(fadeAll)).observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class'] });

  // ---- places, rows and the way back ----
  el.addEventListener('click', (ev) => {
    const row = ev.target.closest('.menu-row[data-go]');
    if (row && el.contains(row)) { go(land(valid([row.dataset.go], reach()))); return; }
    const bar = ev.target.closest('.acc-bar');                // a section's bar opens it; the open one shuts by a second tap
    if (bar && body.contains(bar) && leafOf(path) && ACC[leafOf(path)]) { const at0 = leafOf(path); go(subOf(path) === bar.dataset.sec ? [at0] : [at0, bar.dataset.sec], { focus: null }); bar.focus({ preventScroll: true }); return; }
    const place = ev.target.closest('[data-place]');
    if (place && el.contains(place)) { choose(place.dataset.place); return; }
    const sec = ev.target.closest('.sec-index .menu-row[data-sec]'), at = leafOf(path);
    if (sec && el.contains(sec) && at) { go([at, sec.dataset.sec]); return; }
    const jump = ev.target.closest('[data-menu-open]');     // a button of a screen that opens another place (Setup's rows to the Dice screen, DM tools, About)
    if (jump && el.contains(jump)) go(land(valid(pathOf(jump.dataset.menuOpen), reach())));
  });
  arcEl.addEventListener('click', (ev) => {
    const place = ev.target.closest('[data-place]');
    if (place) { choose(place.dataset.place); return; }
    const jump = ev.target.closest('[data-menu-open]');     // a line of Waiting for you
    if (jump) go(land(valid(pathOf(jump.dataset.menuOpen), reach())));
  });
  $('ring-ok').addEventListener('click', () => { prefs.set('hextable.seen.ring', true); paint(); focusHere(); });
  $('drawer-back').addEventListener('click', () => back());
  // The strip's arrows move it by about three symbols; the strip is the only thing that scrolls.
  const stripBy = (d) => rootList.scrollBy({ left: d * 156, behavior: still() ? 'auto' : 'smooth' });
  $('strip-prev').addEventListener('click', () => stripBy(-1)); $('strip-next').addEventListener('click', () => stripBy(1));
  rootList.addEventListener('scroll', stripEnds, { passive: true });
  addEventListener('resize', () => { if (isOpen) paint(); });

  // ---- buttons ----
  token.addEventListener('click', toggle);
  $('drawer-close').addEventListener('click', () => close());
  scrim.addEventListener('click', () => close());
  $('drawer-pin').addEventListener('click', () => setPin(!pin));

  // ---- keys: m toggles (not while typing); Escape closes an unpinned menu and always the arc. On the arc the arrow keys move round it in order and
  // Enter opens; on the strip Left and Right move along it; in a list Up and Down move between rows and Right or Enter opens one; Left or Backspace
  // goes back from a screen inside a screen. Tab stays inside while it covers the map ----
  const seen = (b) => !b.hidden && b.getClientRects().length > 0;
  addEventListener('keydown', (ev) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName) || ev.target.isContentEditable;
    const onArc = isOpen && !held && !path.length, box = onArc ? arcEl : el;
    if (ev.key === 'Escape' && isOpen && !held && (onArc || !pinned())) {
      if ($('rp') && !$('rp').hidden) return;
      ev.preventDefault(); ev.stopImmediatePropagation(); close(); return;
    }
    if (ev.key === 'Tab' && isOpen && !held && (onArc || modal()) && box.contains(ev.target)) {
      const f = [...box.querySelectorAll('button, input, select, textarea, a[href], summary, [tabindex="0"], h2[tabindex]')].filter((x) => !x.disabled && !x.hidden && x.tabIndex >= -1 && x.getClientRects().length && !x.closest('[hidden], [inert]') && getComputedStyle(x).visibility !== 'hidden' && !(x.tabIndex < 0 && x !== title));
      if (!f.length) return;
      const first = f[0], last = f.at(-1);
      if (ev.shiftKey && (ev.target === first || ev.target === title)) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && ev.target === last) { ev.preventDefault(); first.focus(); }
      return;
    }
    if (isOpen && !held && !typing && !ev.ctrlKey && !ev.metaKey && !ev.altKey && box.contains(ev.target)) {
      const eat = () => { ev.preventDefault(); ev.stopImmediatePropagation(); };
      const symb = ev.target.closest?.('#arc .arc-b, #menu-root .menu-row, #menu-root .pr');
      if (symb && /^(ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End)$/.test(ev.key) && (onArc || /^(ArrowLeft|ArrowRight|Home|End)$/.test(ev.key))) {      // round the arc, or along the strip
        const all = [...(onArc ? arc.querySelectorAll('.arc-b') : rootList.querySelectorAll('.menu-row, .pr'))].filter(seen);
        const i = all.indexOf(symb), d = /^(ArrowRight|ArrowDown)$/.test(ev.key) ? 1 : -1;
        const next = ev.key === 'Home' ? all[0] : ev.key === 'End' ? all.at(-1) : all[Math.max(0, Math.min(all.length - 1, i + d))];
        eat(); next?.focus({ preventScroll: true });
        if (!onArc && next) { const a = next.getBoundingClientRect(), r = rootList.getBoundingClientRect(); if (a.left < r.left + 40) rootList.scrollLeft -= r.left + 40 - a.left; else if (a.right > r.right - 40) rootList.scrollLeft += a.right - (r.right - 40); }
        return;
      }
      if (onArc && ev.key.toLowerCase() !== 'm') { if (/^(ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Backspace)$/.test(ev.key)) eat(); return; }      // behind the arc the arrow keys walk the party: not while it is up
      const row = ev.target.closest?.('#drawer-body .menu-row, #more-list .menu-row, #drawer-body .acc-bar');
      const mine = (row || symb || ev.target === title || !pinned());     // a pinned menu leaves the arrow keys to the map unless a row has the focus
      if (mine && ev.target === title && ev.key === 'ArrowUp') {      // from the heading, Up reaches the strip
        const cur = rootList.querySelector('[aria-current="page"]') ?? [...rootList.querySelectorAll('.menu-row, .pr')].find(seen);
        if (cur && seen(cur)) { eat(); cur.focus({ preventScroll: true }); return; }
      }
      if (mine && symb && ev.key === 'ArrowDown') { eat(); title.focus({ preventScroll: true }); return; }
      if (mine && row && /^(ArrowUp|ArrowDown|Home|End)$/.test(ev.key)) {
        const acc = row.closest('.tabpanel.acc');             // a page's bars, and the row under them, are one list for the arrow keys
        const rows = [...(acc ? acc.querySelectorAll(':scope > .acc-sec > .acc-h > .acc-bar, :scope > .acc-all .menu-row') : row.closest('ul').querySelectorAll('.menu-row'))].filter(seen);
        const i = rows.indexOf(row), next = ev.key === 'Home' ? rows[0] : ev.key === 'End' ? rows.at(-1) : rows[Math.max(0, Math.min(rows.length - 1, i + (ev.key === 'ArrowDown' ? 1 : -1)))];
        eat(); next?.focus({ preventScroll: true }); return;
      }
      if (mine && row && ev.key === 'ArrowRight') { eat(); if (row.getAttribute('aria-expanded') !== 'true') row.click(); return; }
      if (mine && (ev.key === 'ArrowLeft' || ev.key === 'Backspace') && back()) { eat(); return; }
      // With no level to go back to, the key must still not reach the game (ArrowLeft walks the party or turns the camera behind the menu).
      if (!pinned() && (ev.key === 'ArrowLeft' || ev.key === 'Backspace')) { eat(); return; }
    }
    if (!typing && !ev.ctrlKey && !ev.metaKey && !ev.altKey && ev.key.toLowerCase() === 'm' && $('lobby').hidden) { ev.preventDefault(); toggle(); }
  }, true);

  // ---- a drag on the handle (a sheet: down) or on the header (columns: toward the edge they came from) closes it; a tap on the handle does too ----
  let drag = null, dragged = false;
  const handle = $('drawer-handle'), head = $('drawer-head');
  function start(ev) {
    if (ev.target.closest('button:not(#drawer-handle)') || !isOpen) return;
    drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, t: performance.now(), d: 0, el: ev.currentTarget };
    try { ev.currentTarget.setPointerCapture?.(ev.pointerId); } catch { /* a pointer that is already gone */ }
  }
  function move(ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    const sheet = !columns();
    drag.d = sheet ? ev.clientY - drag.y : (ev.clientX - drag.x) * (side === 'right' ? 1 : -1);
    if (drag.d > 6) dragged = true;
    if (drag.d > 0) { el.style.transition = 'none'; el.style.transform = sheet ? `translateY(${drag.d}px)` : `translateX(${drag.d * (side === 'right' ? 1 : -1)}px)`; }
  }
  function end(ev) {
    if (!drag || ev.pointerId !== drag.id) return;
    const { d, t } = drag, ms = Math.max(1, performance.now() - t);
    drag = null; el.style.transition = ''; el.style.transform = '';
    if (d > SWIPE || (d > 20 && d / ms > FLICK)) { dragged = true; close(); }
    if (dragged) setTimeout(() => { dragged = false; }, 60);     // the click that follows a drag is not a tap
  }
  for (const h of [handle, head]) { h.addEventListener('pointerdown', start); h.addEventListener('pointermove', move); h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end); }
  handle.addEventListener('click', () => { if (!dragged) close(); });

  // ---- preferences ----
  function setSide(s) {
    if (!SIDES.includes(s)) return;
    side = s; prefs.set('hextable.drawerSide', s); paint(); change('side');
  }
  function setPin(on) {
    pin = !!on; prefs.set('hextable.drawerPin', pin); paint(); change('pin');
  }
  function setMotion(m) {
    if (!MOTIONS.includes(m)) return;
    motion = m; prefs.set('hextable.menuMotion', m); paint(); change('motion');
  }
  function setLabels(l) {
    if (!LABELS.includes(l)) return;
    labels = l; prefs.set('hextable.menuLabels', l); paint(); change('labels');
  }
  function setToken(t) {
    if (!TOKENS.includes(t)) return;
    tokenAt = t; prefs.set('hextable.menuToken', t); paint(); change('token');
  }
  mqCols.addEventListener?.('change', () => { paint(); change('size'); });
  mqWide.addEventListener?.('change', () => { paint(); change('size'); });
  try { matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => paint()); } catch { /* no media queries */ }

  // ---- the table's state: hide under a question, announce a turn, keep the place ----
  function sync(S) {
    held = !!(S && (S.prompt || S.pending));       // a reaction question is above the menu and is answered first
    paint();
    const enc = S?.encounter;
    if (!enc) { if (S) announced = null; return; }
    const now = enc.order[enc.turn], key = `${enc.id ?? ''}/${enc.round}/${enc.turn}`;
    if (key === announced) return;
    const first = announced === undefined;
    announced = key;
    if (first) return;                              // joining a table says nothing: the turn is not news
    const who = now?.someone ? 'Something moves unseen' : now ? `${S.entities[now.id]?.name ?? 'Someone'}'s turn` : '';
    if (who) { live.textContent = ''; setTimeout(() => { live.textContent = `Round ${enc.round}. ${who}.`; }, 30); }
  }
  // A table was left or replaced: what was said belongs to the old one.
  const reset = () => { announced = undefined; live.textContent = ''; for (const k of Object.keys(mem)) delete mem[k]; if (!isOpen) path = []; };
  paint();

  return {
    open, close, toggle, back, sync, reset, paint,
    get isOpen() { return isOpen && !held; },
    get tab() { return leafOf(path) ?? 'turns'; },
    get section() { return subOf(path); },
    get path() { return [...path]; },
    get side() { return side; }, setSide,
    get pinned() { return pin; }, setPin,
    get motion() { return motion; }, setMotion,
    get token() { return tokenAt; }, setToken,
    get labels() { return labels; }, setLabels,
    get arc() { return isOpen && !held && !path.length; },
    get wide() { return wide(); },
    get columns() { return columns(); },
    pinnedOpen: () => isOpen && pinned() && path.length > 0,      // a screen sits beside the map (the arc is never pinned)
    current: () => (state() ? current(state()) : null),
  };
}
