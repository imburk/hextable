// The drawer (docs/specs/table-ui.md, Decision 2): one slide-out menu that holds every panel the table has. It is a
// view over the page, not over the game: it reads the state it is given, to hide itself under a question and to say whose
// turn it is, and it changes nothing in it. The panels inside are the old ones, re-parented, with their ids.
//
//   const D = initDrawer({ prefs, state, isDM, change });
//   D.open('sheet'); D.close(); D.toggle();   D.sync(S);   (S is null before a table is joined)
//
// Preferences it keeps (client only, through `prefs`): hextable.drawerSide ('right' | 'left'), hextable.drawerPin (bool).
// The open tab is in memory only.
import { current } from './shared/engine.js';

const $ = (id) => document.getElementById(id);
// Tab id -> { panel element id, button element id }. The Handouts button keeps the id handouts.js looks for.
export const TABS = {
  turns: { panel: 'tracker', button: 'tab-turns', title: 'Turns' },
  sheet: { panel: 'sheet', button: 'tab-sheet', title: 'Sheet' },
  log: { panel: 'log', button: 'tab-log', title: 'Log' },
  handouts: { panel: 'handouts', button: 'btn-handouts', title: 'Handouts' },
  dm: { panel: 'dm', button: 'tab-dm', title: 'DM' },
  settings: { panel: 'settings', button: 'tab-settings', title: 'Settings' },
  about: { panel: 'about', button: 'tab-about', title: 'About' },
};
const PRETABLE = ['settings', 'about'];        // before a table is joined only these have anything to show
const WIDE = '(min-width: 900px)';             // closeDM() in app.js and the spec use the same width
const SIDES = ['right', 'left'];
const FLICK = 0.5, SWIPE = 60;                 // px per ms, px: how far or fast a drag on the header must go to close

export function initDrawer({ prefs, state, isDM, change = () => {} }) {
  const el = $('drawer'), scrim = $('drawer-scrim'), burger = $('btn-menu'), title = $('drawer-title'), live = $('drawer-live');
  const mq = matchMedia(WIDE);
  const savedSide = prefs.get('hextable.drawerSide');
  let side = SIDES.includes(savedSide) ? savedSide : 'right';
  let pin = prefs.get('hextable.drawerPin') === true;
  let isOpen = false, tab = 'turns', held = false, opener = null, hideTimer = null;
  let announced;                      // the turn last spoken, so a turn is spoken once; undefined until the first look at a table
  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  const wide = () => mq.matches;
  const pinned = () => pin && wide();
  const modal = () => !pinned();      // it covers the map unless it is pinned beside it

  const available = () => {
    const S = state();
    if (!S) return PRETABLE;
    return Object.keys(TABS).filter((t) => (t === 'dm' ? isDM() : t === 'handouts' ? !isDM() && !!S.handouts?.length : true));
  };

  function paint() {
    const S = state(), open = isOpen && !held;
    const ok = available();
    if (isOpen && !ok.includes(tab)) tab = ok[0];
    document.body.dataset.drawer = side;
    document.body.classList.toggle('drawer-open', open);
    document.body.classList.toggle('drawer-pinned', open && pinned());
    document.body.classList.toggle('drawer-modal', open && modal());
    document.body.classList.toggle('drawer-pretable', !S);
    // The map makes room for a pinned drawer: the insets are what every fixed piece of the table reads.
    const w = open && pinned() ? el.offsetWidth || 360 : 0;
    document.body.style.setProperty('--inset-l', side === 'left' ? `${w}px` : '0px');
    document.body.style.setProperty('--inset-r', side === 'right' ? `${w}px` : '0px');
    burger.setAttribute('aria-expanded', String(isOpen && !held));
    for (const [id, t] of Object.entries(TABS)) {
      const b = $(t.button), on = id === tab;
      if (id !== 'handouts') b.hidden = !ok.includes(id);
      else b.hidden = !ok.includes('handouts');
      b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
      $(t.panel).hidden = !(open && on);      // a hidden panel is not drawn: the app only renders what is shown
    }
    $('tab-turns').firstChild.textContent = S?.encounter ? 'Turns' : 'Party';
    title.textContent = tab === 'turns' && !S?.encounter ? 'Party' : TABS[tab].title;
    // A dialog while it covers the map; a complementary landmark when it sits beside it.
    if (modal()) { el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); } else { el.setAttribute('role', 'complementary'); el.removeAttribute('aria-modal'); }
    $('drawer-pin').setAttribute('aria-pressed', String(pin)); $('drawer-pin').classList.toggle('on', pin);
    scrim.hidden = !(open && modal() && !wide());       // a wide, unpinned drawer has no scrim: a click on the map closes it
    el.classList.toggle('held', held);
    // The burger carries one badge: the DM's waiting players and the player's unseen handouts.
    const n = ['dm-badge', 'ho-badge'].reduce((sum, id) => sum + ($(id).hidden ? 0 : Number($(id).textContent) || 0), 0);
    $('menu-badge').hidden = !n; $('menu-badge').textContent = n;
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
    const done = () => { if (!isOpen) el.hidden = true; };
    if (reduced()) done(); else hideTimer = setTimeout(done, 220);
  }

  function open(which = tab, from = null, quiet = false) {
    const wasOpen = isOpen;
    if (!(which in TABS) || !available().includes(which)) which = available()[0];
    const changed = which !== tab;
    tab = which;
    if (!wasOpen) {
      opener = from ?? (document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : burger);
      isOpen = true;
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
    const to = opener && document.contains(opener) && !opener.hidden ? opener : burger;
    opener = null;
    if (returnFocus) (to.offsetParent !== null ? to : burger).focus({ preventScroll: true });
    change('close');
  }
  const toggle = () => (isOpen ? close() : open(tab, burger));

  // ---- tabs: a tablist with arrow keys ----
  $('drawer-tabs').addEventListener('click', (ev) => { const b = ev.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; paint(); title.focus({ preventScroll: true }); b.focus({ preventScroll: true }); change('tab'); } });
  $('drawer-tabs').addEventListener('keydown', (ev) => {
    const keys = { ArrowRight: 1, ArrowLeft: -1, Home: 'first', End: 'last' };
    if (!(ev.key in keys)) return;
    const ids = available(), now = ids.indexOf(tab), k = keys[ev.key];
    const next = k === 'first' ? ids[0] : k === 'last' ? ids.at(-1) : ids[(now + k + ids.length) % ids.length];
    ev.preventDefault();
    tab = next; paint(); $(TABS[next].button).focus(); change('tab');
  });

  // ---- buttons ----
  burger.addEventListener('click', toggle);
  $('drawer-close').addEventListener('click', () => close());
  scrim.addEventListener('click', () => close());
  $('drawer-pin').addEventListener('click', () => setPin(!pin));
  // A click on the map closes an unpinned drawer on a wide screen (there is no scrim to catch it). The click still reaches the map.
  document.addEventListener('pointerdown', (ev) => { if (isOpen && !held && wide() && !pinned() && ev.target === $('gl')) close(false); }, true);

  // ---- keys: m toggles (not while typing), Escape closes an unpinned drawer, Tab stays inside while it covers the map ----
  addEventListener('keydown', (ev) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName) || ev.target.isContentEditable;
    if (ev.key === 'Escape' && isOpen && !held && !pinned()) {
      if ($('rp') && !$('rp').hidden) return;
      ev.preventDefault(); ev.stopImmediatePropagation(); close(); return;
    }
    if (ev.key === 'Tab' && isOpen && !held && modal() && el.contains(ev.target)) {
      const f = [...el.querySelectorAll('button, input, select, textarea, a[href], summary, [tabindex="0"], h2[tabindex]')].filter((x) => !x.disabled && !x.hidden && x.tabIndex >= -1 && x.getClientRects().length && !x.closest('[hidden]') && !(x.tabIndex < 0 && x !== title));
      if (!f.length) return;
      const first = f[0], last = f.at(-1);
      if (ev.shiftKey && (ev.target === first || ev.target === title)) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && ev.target === last) { ev.preventDefault(); first.focus(); }
      return;
    }
    if (!typing && !ev.ctrlKey && !ev.metaKey && !ev.altKey && ev.key.toLowerCase() === 'm' && $('lobby').hidden) { ev.preventDefault(); toggle(); }
  }, true);

  // ---- a swipe away from the open side, begun on the header, closes it ----
  const head = $('drawer-head');
  let drag = null;
  const away = () => (side === 'right' ? 1 : -1);
  head.addEventListener('pointerdown', (ev) => { if (ev.target.closest('button') || !isOpen) return; drag = { id: ev.pointerId, x: ev.clientX, t: performance.now(), dx: 0 }; try { head.setPointerCapture?.(ev.pointerId); } catch { /* a pointer that is already gone */ } });
  head.addEventListener('pointermove', (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    drag.dx = (ev.clientX - drag.x) * away();
    if (drag.dx > 0) { el.style.transition = 'none'; el.style.transform = `translateX(${drag.dx * away()}px)`; }
  });
  const end = (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    const { dx, t } = drag, ms = Math.max(1, performance.now() - t);
    drag = null; el.style.transition = ''; el.style.transform = '';
    if (dx > SWIPE || (dx > 20 && dx / ms > FLICK)) close();
  };
  head.addEventListener('pointerup', end); head.addEventListener('pointercancel', end);

  // ---- preferences ----
  function setSide(s) {
    if (!SIDES.includes(s)) return;
    side = s; prefs.set('hextable.drawerSide', s); paint(); change('side');
  }
  function setPin(on) {
    pin = !!on; prefs.set('hextable.drawerPin', pin); paint(); change('pin');
  }
  mq.addEventListener?.('change', () => { paint(); change('size'); });

  // ---- the table's state: hide under a question, announce a turn, keep the tabs ----
  function sync(S) {
    held = !!(S && (S.prompt || S.pending));       // a reaction question is above the drawer and is answered first
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
  const reset = () => { announced = undefined; live.textContent = ''; if (!isOpen) tab = 'turns'; };
  paint();

  return {
    open, close, toggle, sync, reset, paint,
    get isOpen() { return isOpen && !held; },
    get tab() { return tab; },
    get side() { return side; }, setSide,
    get pinned() { return pin; }, setPin,
    get wide() { return wide(); },
    pinnedOpen: () => isOpen && pinned(),
    current: () => (state() ? current(state()) : null),
  };
}
