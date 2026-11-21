// One seat per window (issue #625). A table session belongs to the browser WINDOW that joined (sessionStorage), so two windows of one
// browser can sit at one table as two different people; a reload keeps the window's seat. What the device used last is kept in
// localStorage as a SUGGESTION only: a new window with no seat of its own is offered "Rejoin" or "Join as someone else".
// This file has no imports so it can be tested alone.
export const SESSION_KEY = 'hextable.session';
export const LAST_KEY = 'hextable.lastSession';        // the suggestion; never read as this window's own seat

const json = (s, k) => { try { const v = JSON.parse(s.getItem(k)); return v && typeof v === 'object' && typeof v.code === 'string' && typeof v.token === 'string' ? v : null; } catch { return null; } };
const put = (s, k, v) => { try { s.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const drop = (s, k) => { try { s.removeItem(k); } catch { /* storage unavailable */ } };

// The storage that belongs to this window, or null where the browser has none (then the seat lasts until the page is closed or reloaded).
export function windowStorage(g = globalThis) {
  try { const s = g.sessionStorage; if (!s) return null; s.setItem('hextable.probe', '1'); s.removeItem('hextable.probe'); return s; } catch { return null; }
}
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) }; };

// `own`: this window's storage; `shared`: the browser's. Either may be missing (a private mode that refuses storage).
export function sessionKeeper({ own = windowStorage(), shared = globalThis.localStorage } = {}) {
  const mine = own ?? memory(), all = shared ?? memory();
  const same = (a, b) => !!a && !!b && a.code === b.code && a.token === b.token;
  const keeper = {
    // This window's own seat: { code, token, name? } or null.
    mine: () => json(mine, SESSION_KEY),
    // What the device used last, for a window that has no seat of its own. An older build kept it under SESSION_KEY in localStorage.
    suggestion: () => json(all, LAST_KEY) ?? json(all, SESSION_KEY),
    remember(s) { const v = { code: s.code, token: s.token, ...(s.name && { name: s.name }) }; put(mine, SESSION_KEY, v); put(all, LAST_KEY, v); drop(all, SESSION_KEY); },
    // This window gives its seat up. The suggestion goes only if it is the same seat (another window's seat is not this one's to forget).
    forget() { const was = keeper.mine(); drop(mine, SESSION_KEY); if (same(was, keeper.suggestion())) { drop(all, LAST_KEY); drop(all, SESSION_KEY); } },
    forgetSuggestion() { drop(all, LAST_KEY); drop(all, SESSION_KEY); },
  };
  return keeper;
}
