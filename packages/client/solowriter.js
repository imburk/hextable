// Never two writers to one solo save (issue #625). A window that plays a solo game CLAIMS it by name; a second window that asks for the
// same name is told it is taken. navigator.locks is used where the browser has it (the lock goes when the window closes, however it
// closes); else a BroadcastChannel asks "who has it?" and waits a moment for an answer; else nothing can be checked and the claim succeeds.
// Resolves to { ok: true, mode, release() } or { ok: false, mode }. No imports, so it can be tested alone.
const later = (ms) => new Promise((r) => setTimeout(r, ms));

// One try at a lock: { ok:true, ... } got it, null = somebody holds it, undefined = the lock service failed.
function tryLock(locks, key) {
  return new Promise((resolve) => {
    try {
      locks.request(key, { ifAvailable: true }, (lock) => {
        if (!lock) { resolve(null); return undefined; }
        return new Promise((done) => resolve({ ok: true, mode: 'locks', release: () => done() }));      // held until released or the window goes
      }).catch(() => resolve(undefined));
    } catch { resolve(undefined); }
  });
}

async function viaChannel(key, BC, wait) {
  if (typeof BC !== 'function') return { ok: true, mode: 'none', release() {} };       // nothing to check with: play on
  let ch;
  try { ch = new BC(key); } catch { return { ok: true, mode: 'none', release() {} }; }
  const taken = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), wait);
    ch.onmessage = (e) => { if (e.data === 'here') { clearTimeout(timer); resolve(true); } };
    ch.postMessage('who');
  });
  if (taken) { ch.close(); return { ok: false, mode: 'channel' }; }
  ch.onmessage = (e) => { if (e.data === 'who') ch.postMessage('here'); };
  return { ok: true, mode: 'channel', release() { try { ch.close(); } catch { /* already closed */ } } };
}

export async function claimWriter(name, { locks = globalThis.navigator?.locks, BC = globalThis.BroadcastChannel, wait = 250, retries = 1, retryMs = 350 } = {}) {
  const key = `hextable.writer.${name}`;
  if (locks && typeof locks.request === 'function') {
    for (let i = 0; i <= retries; i++) {
      const got = await tryLock(locks, key);
      if (got) return got;
      if (got === undefined) return viaChannel(key, BC, wait);                // the lock service failed: the channel instead
      if (i < retries) await later(retryMs);                                  // a reload may not have let go yet
    }
    return { ok: false, mode: 'locks' };
  }
  return viaChannel(key, BC, wait);
}
