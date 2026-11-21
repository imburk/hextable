// "A new version is ready" (#646). The page notes which build it was loaded as, and asks the server again at the moments below; if the
// build is another, a small banner offers to reload. It never reloads by itself (a table may be in the middle of a turn).
// The comparison (`compareBuilds`) has no DOM and is tested in Node; `mountNewVersion` is the banner and the triggers.
//
// A build's id is the commit in build.json ({ commit, when, ... }); a build with no commit is told by its `when`. A stamp with neither,
// or a failed fetch, is "unknown", and unknown never shows a banner: a bad answer must not nag.

// The id of a build stamp, or null.
export function buildId(stamp) {
  if (!stamp || typeof stamp !== 'object') return null;
  for (const k of ['commit', 'when']) if (typeof stamp[k] === 'string' && stamp[k].trim()) return `${k}:${stamp[k].trim()}`;
  return null;
}

// 'same' | 'different' | 'unknown', for the stamp the page was loaded with and the one the server answers now.
export function compareBuilds(loaded, now) {
  const a = buildId(loaded), b = buildId(now);
  if (a === null || b === null) return 'unknown';
  return a === b ? 'same' : 'different';
}

// Should the banner show? `dismissed` is the id the player said "Later" to: it stays away until the server's build is yet another.
export const shouldOffer = (loaded, now, dismissed = null) => compareBuilds(loaded, now) === 'different' && buildId(now) !== dismissed;

// The banner and its triggers. fetchBuild() resolves to a stamp or rejects; `doc` and `reload` are injectable. Returns
// { check, onReconnect, solo } : `check()` asks now; `onReconnect()` is for a table's transport when its socket opens again;
// `solo(isSolo)` starts the solo trigger (a check when the tab comes back into view, while `isSolo()`; a table has the reconnect instead).
export function mountNewVersion({ fetchBuild, doc = document, reload = () => location.reload() }) {
  let loaded = null, dismissed = null, busy = false, el = null;
  const show = (id) => {
    if (!el) {
      el = doc.createElement('div'); el.id = 'new-version'; el.setAttribute('role', 'status');
      const text = doc.createElement('span'); text.textContent = 'A new version is ready';
      const go = doc.createElement('button'); go.type = 'button'; go.id = 'new-version-reload'; go.textContent = 'Reload'; go.onclick = () => reload();
      const later = doc.createElement('button'); later.type = 'button'; later.id = 'new-version-later'; later.className = 'quiet'; later.textContent = 'Later'; later.setAttribute('aria-label', 'Dismiss the new version notice');
      later.onclick = () => { dismissed = el.dataset.build; el.hidden = true; };
      el.append(text, go, later); doc.body.append(el);
    }
    el.dataset.build = id; el.hidden = false;
  };
  async function check() {
    if (busy) return; busy = true;
    try {
      const now = await fetchBuild();
      if (loaded === null) { if (buildId(now) !== null) loaded = now; return; }        // the first answer is the build this page is
      if (shouldOffer(loaded, now, dismissed)) show(buildId(now));
    } catch { /* offline or no build.json: say nothing */ } finally { busy = false; }
  }
  return {
    check, onReconnect: check,
    solo(isSolo = () => true) { doc.addEventListener('visibilitychange', () => { if (!doc.hidden && isSolo()) check(); }); },
  };
}
