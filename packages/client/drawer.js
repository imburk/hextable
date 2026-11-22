// The menu (docs/specs/one-token-menu.md, Decisions 1, 3, 5, 6 and 11; stage M1 of its build plan). One token, `#btn-menu`, opens one
// menu: a first level that lists Character, Turns, Dice, Log and chat (Handouts when there are any) and Table; Table lists Setup, DM tools
// and About, and holds leaving the game. Below 900 px the menu is a sheet that rises from the bottom and pushes one level at a time; from
// 900 px it is columns from the side with the map beside them. Either way one tap on the dimmed map closes every level. It is a view over
// the page, not over the game: it reads the state it is given, to hide itself under a question and to say whose turn it is, and it
// changes nothing in it. The screens are the old drawer's panels, re-parented, with their ids.
//
//   const D = initDrawer({ prefs, state, isDM, selected, change });
//   D.open('sheet'); D.open(['table', 'settings']); D.open(); D.close(); D.toggle(); D.back();   D.sync(S);   (S is null before a table is joined)
//
// A place is a path: [] is the first level, ['turns'] a screen of it, ['table'] the Table list, ['table', 'settings'] a screen under it.
// The old tab names still open their screens (`open('dm')` is ['table', 'dm']; `open('character')` is `open('sheet')`).
//
// Preferences it keeps (client only, through `prefs`): hextable.drawerSide ('left' | 'right': where a wide screen's columns come from),
// hextable.drawerPin (bool), hextable.menuMotion ('slide' | 'appear'), hextable.menuToken ('center' | 'left' | 'right': where the token sits; it sits there whatever is open).
// Where the menu is open is in memory only, and a closed menu opens on its first level.
import { current } from './shared/engine.js';

const $ = (id) => document.getElementById(id);
// A screen (leaf of the tree) -> its panel, its row's button, its heading, and the list it is in (none: the first level).
export const TABS = {
  sheet: { panel: 'sheet', button: 'tab-sheet', title: 'Character', parent: null },
  turns: { panel: 'tracker', button: 'tab-turns', title: 'Turns', parent: null },
  dice: { panel: 'dicepanel', button: 'tab-dice', title: 'Dice', parent: null },
  log: { panel: 'log', button: 'tab-log', title: 'Log and chat', parent: null },
  handouts: { panel: 'handouts', button: 'btn-handouts', title: 'Handouts', parent: null },
  settings: { panel: 'settings', button: 'tab-settings', title: 'Setup', parent: 'table' },
  dm: { panel: 'dm', button: 'tab-dm', title: 'DM tools', parent: 'table' },
  about: { panel: 'about', button: 'tab-about', title: 'About', parent: 'table' },
};
// A list that is itself a level (it holds screens, not content).
const LISTS = { table: { button: 'tab-table', title: 'Table' } };
const ALIAS = { character: 'sheet', party: 'turns', root: '', menu: '' };
const ROOT_TITLE = 'Menu';
const SIDES = ['left', 'right'], MOTIONS = ['slide', 'appear'], TOKENS = ['center', 'left', 'right'];
const WIDE = '(min-width: 900px)';             // the pinned menu, and closeDM() in app.js, use this width
const COLUMNS = `${WIDE}, (orientation: landscape) and (max-height: 500px)`;      // the shape with columns: a wide screen, or a phone on its side
const FLICK = 0.5, SWIPE = 60;                 // px per ms, px: how far or fast a drag on the handle must go to close
const SLIDE_MS = 720;                          // the longest slide (Decision 6, round 2); a panel stays drawn this long after it leaves

export function initDrawer({ prefs, state, isDM, selected = () => null, change = () => {} }) {
  const el = $('drawer'), scrim = $('drawer-scrim'), token = $('btn-menu'), title = $('drawer-title'), live = $('drawer-live');
  const rootList = $('menu-root'), tableList = $('menu-table'), body = $('drawer-body');
  const mqWide = matchMedia(WIDE), mqCols = matchMedia(COLUMNS);
  const savedSide = prefs.get('hextable.drawerSide');
  let side = SIDES.includes(savedSide) ? savedSide : 'left';
  let pin = prefs.get('hextable.drawerPin') === true;
  const savedMotion = prefs.get('hextable.menuMotion'), savedToken = prefs.get('hextable.menuToken');
  let motion = MOTIONS.includes(savedMotion) ? savedMotion : 'slide';
  let tokenAt = TOKENS.includes(savedToken) ? savedToken : 'center';
  let path = [], isOpen = false, held = false, opener = null, hideTimer = null, lingerTimer = null;
  let settling = false;               // the menu is still sliding open: its columns come with it
  let shownLeaf = null;               // the screen whose panel is drawn: it stays drawn while the sheet slides it away
  const scrolls = new Map();          // a screen's scroll, kept while another is shown (Decision 4a)
  let announced;                      // the turn last spoken, so a turn is spoken once; undefined until the first look at a table
  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  const still = () => reduced() || motion === 'appear';       // no movement at all (Decision 6)
  const wide = () => mqWide.matches;
  const columns = () => mqCols.matches;
  const pinned = () => pin && wide();
  const modal = () => !pinned();      // it covers the map unless it is pinned beside it

  // ---- the tree ----
  const keyOf = (w) => { const k = String(w ?? '').toLowerCase(); return k in ALIAS ? ALIAS[k] : k; };
  // A name, a path array or 'a/b' as a path. An unknown name is the first level.
  function pathOf(which) {
    const segs = (Array.isArray(which) ? which : String(which ?? '').split('/')).map(keyOf).filter(Boolean);
    if (segs.length === 1 && segs[0] in TABS && TABS[segs[0]].parent) return [TABS[segs[0]].parent, segs[0]];
    return segs;
  }
  const leafOf = (p) => (p.length && p.at(-1) in TABS ? p.at(-1) : null);
  // What can be reached now. Before a table is joined only the Table list has anything to show.
  function reach() {
    const S = state();
    if (!S) return { root: ['table'], table: ['settings', 'about'] };
    return {
      root: ['sheet', 'turns', 'dice', 'log', ...(!isDM() && S.handouts?.length ? ['handouts'] : []), 'table'],
      table: ['settings', ...(isDM() ? ['dm'] : []), 'about'],
    };
  }
  // The longest part of a path that can be reached.
  function valid(p, ok) {
    if (!p.length) return [];
    if (!ok.root.includes(p[0])) return [];
    if (p[0] === 'table') { if (p.length === 1) return ['table']; return ok.table.includes(p[1]) ? ['table', p[1]] : ['table']; }
    return p[0] in TABS && !TABS[p[0]].parent ? [p[0]] : [];
  }
  const nameOfPlace = (seg) => (seg in TABS ? (seg === 'turns' && !state()?.encounter ? 'Party' : TABS[seg].title) : LISTS[seg]?.title ?? ROOT_TITLE);

  // ---- painting ----
  const word = (b, text) => { const s = b.querySelector('.mr-sum'); if (s && s.dataset.text !== text) { s.dataset.text = text; s.firstChild?.nodeType === 3 ? (s.firstChild.textContent = text) : s.prepend(document.createTextNode(text)); } };
  function summaries(S) {
    if (!S) return;
    const e = selected();
    word($('tab-sheet'), e?.abil ? `${e.name} · ${e.hp} / ${e.maxHp} HP` : 'None selected');
    const enc = S.encounter, now = enc?.order[enc.turn];
    $('tab-turns').querySelector('.mr-name').textContent = enc ? 'Turns' : 'Party';
    word($('tab-turns'), !enc ? '' : now?.someone ? (S.settings?.unseenTurns === 'quiet' ? `Round ${enc.round}` : `Round ${enc.round} · Something moves unseen`) : `Round ${enc.round} · ${S.entities[now?.id]?.name ?? 'Someone'}'s turn`);
  }

  function applyPanels() {
    const open = !el.hidden && !held;
    for (const [id, t] of Object.entries(TABS)) $(t.panel).hidden = !(open && id === shownLeaf);   // a hidden panel is not drawn: the app only renders what is shown
  }

  function paint() {
    const S = state(), open = isOpen && !held, ok = reach(), cols = columns();
    path = valid(path, ok);
    const leaf = leafOf(path), cur = path.length;
    document.body.dataset.drawer = side;
    document.body.dataset.menuShape = cols ? 'columns' : 'sheet';
    document.body.dataset.menuMotion = still() ? 'appear' : 'slide';
    document.body.dataset.token = tokenAt;
    document.body.classList.toggle('drawer-open', open);
    document.body.classList.toggle('drawer-pinned', open && pinned());
    document.body.classList.toggle('drawer-modal', open && modal());
    document.body.classList.toggle('drawer-pretable', !S);
    el.dataset.path = path.join('/'); el.dataset.depth = String(cur);

    // The rows: which can be reached, and the one the path goes through.
    for (const [id, t] of Object.entries(TABS)) {
      const b = $(t.button);
      b.hidden = !(t.parent ? ok.table : ok.root).includes(id);
      b.setAttribute('aria-current', String(t.parent ? path[0] === t.parent && path[1] === id : path[0] === id));
    }
    if ($('party').childElementCount) $('tab-sheet').hidden = true;      // the characters are rows of their own on the first level (Decision 4b); the one Character row is for a table with none
    $('tab-table').setAttribute('aria-current', path[0] === 'table' ? 'true' : 'false');
    summaries(S);
    // The badges: the token carries one, the sum of what waits (the DM's waiting players, a player's unseen handouts).
    const n = ['dm-badge', 'ho-badge'].reduce((sum, id) => sum + ($(id).hidden ? 0 : Number($(id).textContent) || 0), 0);
    $('menu-badge').hidden = !n; $('menu-badge').textContent = n;
    $('table-badge').hidden = $('dm-badge').hidden; $('table-badge').textContent = $('dm-badge').textContent;

    // The levels. A level is `here` (the one in view), `under` (one the path went through) or `over` (not reached). A sheet shows `here`;
    // columns show every level the path goes through.
    const levels = [[rootList, 0, true], [tableList, 1, path[0] === 'table'], [body, cur, !!leaf]];
    for (const [lv, idx, active] of levels) {
      if (active && lv.dataset.active === 'false' && cols && !still() && !settling) {      // a real next step: its column slides out from under the one before
        lv.dataset.new = 'true'; setTimeout(() => { delete lv.dataset.new; }, SLIDE_MS + 50);
      }
      const pos = !active ? 'over' : idx < cur ? 'under' : idx === cur ? 'here' : 'over';
      lv.dataset.pos = pos; lv.dataset.active = String(active);
      lv.inert = !cols && pos !== 'here';
    }
    el.dataset.cols = String(levels.filter((l) => l[2]).length);
    $('drawer-handle').hidden = cols;

    // The way back: the places the path went through, then the heading of the one in view. The heading element stays, for focus.
    const li = (seg, p) => { const x = document.createElement('li'), b = document.createElement('button'); b.type = 'button'; b.dataset.path = p.join('/'); b.textContent = seg ? nameOfPlace(seg) : ROOT_TITLE; x.append(b); return x; };
    const here = $('crumb-here');
    for (const old of [...$('crumb-list').children]) if (old !== here) old.remove();
    if (cur) here.before(li('', []), ...path.slice(0, -1).map((seg, i) => li(seg, path.slice(0, i + 1))));
    title.textContent = cur ? nameOfPlace(path.at(-1)) : ROOT_TITLE;
    $('drawer-back').hidden = !cur;
    $('drawer-back').setAttribute('aria-label', cur ? `Back to ${cur > 1 ? nameOfPlace(path[cur - 2]) : ROOT_TITLE}` : 'Back');

    // The screen: its panel is drawn while it is in view, and a moment longer while the sheet slides it out. A screen that was left keeps
    // its scroll, and gets it back.
    clearTimeout(lingerTimer);
    let want = open ? leaf : el.hidden ? null : shownLeaf;
    if (open && !leaf && shownLeaf && !cols && !still()) {
      want = shownLeaf;
      lingerTimer = setTimeout(() => { if (!leafOf(path)) { shownLeaf = null; applyPanels(); } }, SLIDE_MS);
    }
    if (want !== shownLeaf) {
      if (shownLeaf) scrolls.set(shownLeaf, body.scrollTop);
      shownLeaf = want;
      applyPanels();
      if (want) body.scrollTop = scrolls.get(want) ?? 0;
    } else applyPanels();

    // The map makes room for a pinned menu: the insets are what every fixed piece of the table reads.
    const w = open && pinned() ? el.offsetWidth || 360 : 0;
    document.body.style.setProperty('--inset-l', side === 'left' ? `${w}px` : '0px');
    document.body.style.setProperty('--inset-r', side === 'right' ? `${w}px` : '0px');
    // The token does not move for the menu (round 6, R25): the sheet and the columns keep their bottom strip empty for it (drawer.css).
    token.setAttribute('aria-expanded', String(open));
    // A dialog while it covers the map; a complementary landmark when it sits beside it.
    if (modal()) { el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); } else { el.setAttribute('role', 'complementary'); el.removeAttribute('aria-modal'); }
    $('drawer-pin').setAttribute('aria-pressed', String(pin)); $('drawer-pin').classList.toggle('on', pin);
    scrim.hidden = !(open && modal());              // the dimmed map is the clear zone: one tap on it closes every level and does nothing else
    el.classList.toggle('held', held);
    el.inert = !open;
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
    const done = () => { if (!isOpen) { el.hidden = true; applyPanels(); } };
    if (still()) done(); else hideTimer = setTimeout(done, SLIDE_MS);
  }

  // Go to a place. `focus`: where the focus goes (the heading by default; null leaves it).
  function go(next, { focus = 'title' } = {}) {
    path = next;
    paint();
    if (focus === 'title') title.focus({ preventScroll: true });
    change('tab');
  }
  function open(which = null, from = null, quiet = false) {
    const wasOpen = isOpen;
    const want = which == null ? (wasOpen ? path : []) : pathOf(which);
    const changed = want.join('/') !== path.join('/');
    path = want;
    if (!wasOpen) {
      opener = from ?? (document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : token);
      isOpen = true; settling = true; setTimeout(() => { settling = false; }, SLIDE_MS);
      document.body.classList.toggle('drawer-over', !$('lobby').hidden || !$('splash').hidden || !state());     // above the lobby and the splash, which are the only things that can be under it
      show();
    }
    paint();
    change('open');
    if (!quiet && (!wasOpen || changed)) title.focus({ preventScroll: true });
  }
  function close(returnFocus = true) {
    if (!isOpen) return;
    isOpen = false;
    paint(); hide();
    const to = opener && document.contains(opener) && !opener.hidden ? opener : token;
    opener = null;
    if (returnFocus) (to.offsetParent !== null || getComputedStyle(to).position === 'fixed' ? to : token).focus({ preventScroll: true });
    change('close');
  }
  const toggle = () => (isOpen ? close() : open(null, token));
  // One level back, to where the row that was chosen is, so a keyboard keeps its place.
  function back() {
    if (!path.length) return false;
    const left = path.at(-1), row = $(left in TABS ? TABS[left].button : LISTS[left]?.button);
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

  // ---- rows and the way back ----
  el.addEventListener('click', (ev) => {
    const row = ev.target.closest('.menu-row[data-go]');
    if (row && el.contains(row)) { const k = row.dataset.go; go(row.closest('#menu-table') ? ['table', k] : [k]); return; }
    const crumb = ev.target.closest('#crumb-list [data-path]');
    if (crumb) go(crumb.dataset.path ? crumb.dataset.path.split('/') : []);
  });
  $('drawer-back').addEventListener('click', () => back());

  // ---- buttons ----
  token.addEventListener('click', toggle);
  $('drawer-close').addEventListener('click', () => close());
  scrim.addEventListener('click', () => close());
  $('drawer-pin').addEventListener('click', () => setPin(!pin));

  // ---- keys: m toggles (not while typing); Escape closes every level of an unpinned menu; Up and Down move between rows, Right or Enter
  // opens one, Left or Backspace goes back a level; Tab stays inside while it covers the map ----
  addEventListener('keydown', (ev) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName) || ev.target.isContentEditable;
    if (ev.key === 'Escape' && isOpen && !held && !pinned()) {
      if ($('rp') && !$('rp').hidden) return;
      ev.preventDefault(); ev.stopImmediatePropagation(); close(); return;
    }
    if (ev.key === 'Tab' && isOpen && !held && modal() && el.contains(ev.target)) {
      const f = [...el.querySelectorAll('button, input, select, textarea, a[href], summary, [tabindex="0"], h2[tabindex]')].filter((x) => !x.disabled && !x.hidden && x.tabIndex >= -1 && x.getClientRects().length && !x.closest('[hidden], [inert]') && getComputedStyle(x).visibility !== 'hidden' && !(x.tabIndex < 0 && x !== title));
      if (!f.length) return;
      const first = f[0], last = f.at(-1);
      if (ev.shiftKey && (ev.target === first || ev.target === title)) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && ev.target === last) { ev.preventDefault(); first.focus(); }
      return;
    }
    if (isOpen && !held && !typing && !ev.ctrlKey && !ev.metaKey && !ev.altKey && el.contains(ev.target)) {
      const row = ev.target.closest?.('.menu-row');
      const mine = (row || ev.target === title || !pinned());     // a pinned menu leaves the arrow keys to the map unless a row has the focus
      if (mine && !row && ev.target === title && path.length === 0 && /^(ArrowDown|Home)$/.test(ev.key)) {      // the heading at the root: Down or Home reaches the first row
        const first = [...rootList.querySelectorAll('.menu-row')].find((b) => !b.hidden && b.getClientRects().length);
        if (first) { ev.preventDefault(); ev.stopImmediatePropagation(); first.focus({ preventScroll: true }); return; }
      }
      if (mine && row && /^(ArrowUp|ArrowDown|Home|End)$/.test(ev.key)) {
        const rows = [...row.closest('ul').querySelectorAll('.menu-row')].filter((b) => !b.hidden);
        const i = rows.indexOf(row), next = ev.key === 'Home' ? rows[0] : ev.key === 'End' ? rows.at(-1) : rows[Math.max(0, Math.min(rows.length - 1, i + (ev.key === 'ArrowDown' ? 1 : -1)))];
        ev.preventDefault(); ev.stopImmediatePropagation(); next?.focus({ preventScroll: true }); return;
      }
      if (mine && row && ev.key === 'ArrowRight') { ev.preventDefault(); ev.stopImmediatePropagation(); row.click(); return; }
      if (mine && (ev.key === 'ArrowLeft' || ev.key === 'Backspace') && path.length) { ev.preventDefault(); ev.stopImmediatePropagation(); back(); return; }
      // At the root there is no back, but the key must not reach the game (ArrowLeft walks the party or turns the camera behind the menu).
      if (!pinned() && !path.length && (ev.key === 'ArrowLeft' || ev.key === 'Backspace')) { ev.preventDefault(); ev.stopImmediatePropagation(); return; }
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
  const reset = () => { announced = undefined; live.textContent = ''; if (!isOpen) path = []; };
  paint();

  return {
    open, close, toggle, back, sync, reset, paint,
    get isOpen() { return isOpen && !held; },
    get tab() { return leafOf(path) ?? 'turns'; },
    get path() { return [...path]; },
    get side() { return side; }, setSide,
    get pinned() { return pin; }, setPin,
    get motion() { return motion; }, setMotion,
    get token() { return tokenAt; }, setToken,
    get wide() { return wide(); },
    get columns() { return columns(); },
    pinnedOpen: () => isOpen && pinned(),
    current: () => (state() ? current(state()) : null),
  };
}
