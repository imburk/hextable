// Table files (handout pictures, level backgrounds) as the browser sees them. Both stores have
// the same shape, so the UI does not know whether a file lives on the table server or in this tab:
//
//   store.upload(file)  -> Promise<record>     record: { id, kind, mime, bytes, name, when }
//   store.url(id)       -> Promise<string>     a blob: URL to put in an <img>
//   store.remove(id)    -> Promise<void>
//   store.list()        -> Promise<{ assets: [record], usage: { files, bytes }, limits: { file, table, files } }>
//
// Online, files are fetched with the session token in a header, never in a URL, and shown from a
// blob: URL (an <img> cannot send a header). Solo, they are kept in IndexedDB with smaller limits.
export const TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const SOLO_LIMITS = { file: 2 * 1024 * 1024, table: 20 * 1024 * 1024, files: 50 };

// What the bytes are (the server checks the same way; this is only to answer sooner).
export function sniff(b) {
  if (b.length < 16) return null;
  const s = (i, j) => String.fromCharCode(...b.subarray(i, j));
  if (b[0] === 0x89 && s(1, 4) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a && s(12, 16) === 'IHDR') return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff && b[3] >= 0xc0) return 'image/jpeg';
  if (s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP' && /^VP8[ LX]$/.test(s(12, 16))) return 'image/webp';
  return null;
}
const mb = (n) => `${Math.round((n / 1048576) * 10) / 10} MB`;
async function check(file, limit) {
  if (!file || !file.size) throw new Error('Pick a picture first.');
  if (file.size > limit) throw new Error(`A picture can be at most ${mb(limit)}.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniff(bytes);
  if (!mime) throw new Error('That file is not a PNG, JPEG or WebP picture.');
  return { bytes, mime };
}

function cached() {
  const urls = new Map();            // id -> Promise<blob URL>
  return {
    get(id, load) {
      if (!urls.has(id)) urls.set(id, load().catch((err) => { urls.delete(id); throw err; }));
      return urls.get(id);
    },
    drop(id) { const p = urls.get(id); urls.delete(id); p?.then((u) => URL.revokeObjectURL(u), () => {}); },
  };
}

// Online. `session()` gives { code, token } once seated.
export function serverAssets(session) {
  const cache = cached();
  const call = async (method, path, init = {}) => {
    const s = session();
    if (!s) throw new Error('Not at a table.');
    const res = await fetch(`./assets/${s.code}${path}`, { method, ...init, headers: { 'x-hextable-token': s.token, ...(init.headers ?? {}) }, cache: 'no-store' });
    if (!res.ok) {
      let msg = res.status === 404 ? 'That file is not available.' : `The table refused (${res.status}).`;
      try { msg = (await res.json()).error ?? msg; } catch { /* not JSON */ }
      throw new Error(msg);
    }
    return res;
  };
  return {
    async upload(file) {
      const { bytes, mime } = await check(file, 5 * 1024 * 1024);
      const res = await call('POST', '', { body: bytes, headers: { 'content-type': mime, 'x-asset-name': encodeURIComponent(String(file.name ?? '').slice(0, 80)) } });
      return (await res.json()).asset;
    },
    url: (id) => cache.get(id, async () => URL.createObjectURL(await (await call('GET', `/${encodeURIComponent(id)}`)).blob())),
    async remove(id) { await call('DELETE', `/${encodeURIComponent(id)}`); cache.drop(id); },
    async list() { return (await call('GET', '')).json(); },
    forget: (id) => cache.drop(id),
  };
}

// Solo: IndexedDB, one record per file with its bytes as a Blob.
export function localAssets() {
  const cache = cached();
  let dbp = null;
  const db = () => (dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('hextable-assets', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbp = null; reject(new Error('This browser will not keep files.')); };
  }));
  const run = async (mode, fn) => {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('files', mode), out = fn(tx.objectStore('files'));
      tx.oncomplete = () => resolve(out.result);
      tx.onerror = tx.onabort = () => reject(new Error(tx.error?.name === 'QuotaExceededError' ? 'This browser has no room left for files.' : 'Could not save the file.'));
    });
  };
  const all = () => run('readonly', (st) => st.getAll());
  const record = ({ blob, ...r }) => r;
  return {
    async upload(file) {
      const { bytes, mime } = await check(file, SOLO_LIMITS.file);
      const have = await all();
      if (have.length >= SOLO_LIMITS.files) throw new Error(`Solo play keeps at most ${SOLO_LIMITS.files} files. Remove some first.`);
      if (have.reduce((n, r) => n + r.bytes, 0) + bytes.length > SOLO_LIMITS.table) throw new Error(`Solo play keeps at most ${mb(SOLO_LIMITS.table)} of files. Remove some first.`);
      const id = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const r = { id, kind: 'image', mime, bytes: bytes.length, name: String(file.name ?? 'image').replace(/[\u0000-\u001f]/g, '').slice(0, 80), when: new Date().toISOString() };
      await run('readwrite', (st) => st.put({ ...r, blob: new Blob([bytes], { type: mime }) }));
      return r;
    },
    url: (id) => cache.get(id, async () => {
      const r = await run('readonly', (st) => st.get(String(id)));
      if (!r) throw new Error('That file is not available.');
      return URL.createObjectURL(r.blob);
    }),
    async remove(id) { await run('readwrite', (st) => st.delete(String(id))); cache.drop(id); },
    async list() {
      const have = (await all()).map(record);
      return { assets: have, usage: { files: have.length, bytes: have.reduce((n, r) => n + r.bytes, 0) }, limits: SOLO_LIMITS };
    },
    forget: (id) => cache.drop(id),
  };
}
