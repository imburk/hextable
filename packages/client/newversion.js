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
const field = (stamp, k) => (typeof stamp?.[k] === 'string' && stamp[k].trim() ? stamp[k].trim() : null);

// 'same' | 'different' | 'unknown', for the stamp the page was loaded with and the one the server answers now. Commits are compared when both
// stamps have one; otherwise the build time (a server told its commit by its host, and a page built where there was no git, still agree on `when`).
export function compareBuilds(loaded, now) {
  if (buildId(loaded) === null || buildId(now) === null) return 'unknown';
  const [a, b] = field(loaded, 'commit') && field(now, 'commit') ? [field(loaded, 'commit'), field(now, 'commit')] : [field(loaded, 'when'), field(now, 'when')];
  if (a === null || b === null) return 'unknown';
  return a === b ? 'same' : 'different';
}

// The stamp in the page's <meta name="hextable-build" content="<commit>|<when>"> (scripts/build.mjs), or null if it is missing or not that shape.
export function stampOfMeta(content) {
  const m = /^([0-9a-f]{7}|)\|(\S{1,40})$/i.exec(String(content ?? '').trim());
  return m ? { ...(m[1] && { commit: m[1] }), when: m[2] } : null;
}

// The build this page is: the one stamped into it when it has one; else (run from source) the first good answer of the server, as `first`.
export const chooseLoaded = (metaContent, first) => stampOfMeta(metaContent) ?? (buildId(first) !== null ? first : null);

// Should the banner show? `dismissed` is the id the player said "Later" to: it stays away until the server's build is yet another.
export const shouldOffer = (loaded, now, dismissed = null) => compareBuilds(loaded, now) === 'different' && buildId(now) !== dismissed;

// The banner and its triggers. fetchBuild() resolves to a stamp or rejects; `doc` and `reload` are injectable. Returns
// { check, onReconnect, solo } : `check()` asks now; `onReconnect()` is for a table's transport when its socket opens again;
// `solo(isSolo)` starts the solo trigger (a check when the tab comes back into view, while `isSolo()`; a table has the reconnect instead).
export function mountNewVersion({ fetchBuild, doc = document, reload = () => location.reload() }) {
  let loaded = chooseLoaded(doc.querySelector?.('meta[name="hextable-build"]')?.getAttribute('content'), null), dismissed = null, shownFor = null, busy = false, el = null;
  const show = (id) => {
    if (!el) {
      el = doc.createElement('div'); el.id = 'new-version'; el.setAttribute('role', 'status');
      const text = doc.createElement('span'); text.textContent = 'A new version is ready';
      const go = doc.createElement('button'); go.type = 'button'; go.id = 'new-version-reload'; go.textContent = 'Reload'; go.onclick = () => reload();
      const later = doc.createElement('button'); later.type = 'button'; later.id = 'new-version-later'; later.className = 'quiet'; later.textContent = 'Later'; later.setAttribute('aria-label', 'Dismiss the new version notice');
      later.onclick = () => { dismissed = shownFor; el.hidden = true; };
      el.append(text, go, later); doc.body.append(el);
    }
    shownFor = id; el.hidden = false;
  };
  async function check() {
    if (busy) return; busy = true;
    try {
      const now = await fetchBuild();
      if (loaded === null) { loaded = chooseLoaded(null, now); return; }        // run from source, no stamp in the page: the first answer is the build this page is
      if (shouldOffer(loaded, now, dismissed)) show(buildId(now));
    } catch { /* offline or no build.json: say nothing */ } finally { busy = false; }
  }
  return {
    check, onReconnect: check,
    solo(isSolo = () => true) { doc.addEventListener('visibilitychange', () => { if (!doc.hidden && isSolo()) check(); }); },
  };
}
