# Vendored third-party code

Everything under `vendor/` is somebody else's code, copied in unchanged except for the import lines listed below.
Nothing else in the repo may import it, except: for Three.js, the Three.js renderer (task R11) and the one-page load check
`packages/client/three-check.js`; for zip.js, only the module-zip wrapper `packages/client/modulezip.js` (which the
server, the assemble script and the tests use in its place). The default page load does not fetch any of it.
Why it is here and why it is allowed: `docs/DESIGN.md` (stack table) and, for Three.js, `docs/specs/renderer.md`,
Decision 8 and the R10 build note; for zip.js, `docs/specs/adventure-module.md`, Decision 1 (A0a's pick on #572, approved
by the owner on 20 November 2026).

## Three.js

- Project: https://github.com/mrdoob/three.js, licence MIT (`three/LICENSE`, upstream's file, copied unchanged).
- Release: **r187** (git tag `r187`, an annotated tag; tag object `456a78fd22f4ce11d929fd62c8579b83be06008a`).
- Commit the tag points to: **`7e89746a687bb88271253698fa108b1dd59825d0`** (committed 2026-10-30).
- Fetched: 2026-11-13, by a shallow `git clone --depth 1 --branch r187` of the upstream repository into a scratch
  directory outside the repo. No script from it was run; files were only copied out.
- Upstream ships **no minified file** in `build/` at r187 (it has `three.module.js`, `three.core.js`, `three.cjs`, the
  WebGPU and TSL builds). What is vendored is therefore the readable build. Minifying would need a tool this project does
  not have; see "Not done" below.
- Not vendored, on purpose: `three.webgpu*.js`, `three.tsl.js`, `three.cjs`, any other loader, any example.

### Files

Sizes in bytes; gzip is `gzip -9 -c file | wc -c`. "Upstream path" is relative to the root of the upstream repository.
Files are flat in `vendor/three/`.

| Vendored file | Upstream path | Raw | Gzip | Import lines rewritten |
|---|---|---:|---:|---|
| `three/three.module.js` | `build/three.module.js` | 658,900 | 129,337 | no (it already imports `./three.core.js`) |
| `three/three.core.js` | `build/three.core.js` | 1,474,799 | 289,875 | no |
| `three/GLTFLoader.js` | `examples/jsm/loaders/GLTFLoader.js` | 119,859 (upstream 119,861) | 26,168 | yes, 3 |
| `three/BufferGeometryUtils.js` | `examples/jsm/utils/BufferGeometryUtils.js` | 39,165 (upstream 39,153) | 9,078 | yes, 1 |
| `three/SkeletonUtils.js` | `examples/jsm/utils/SkeletonUtils.js` | 11,547 (upstream 11,535) | 3,225 | yes, 1 |
| `three/LICENSE` | `LICENSE` | 1,081 | 670 | no |
| **Scripts total (5 files)** | | **2,304,270** | **457,683** | |

`BufferGeometryUtils.js` and `SkeletonUtils.js` are what `GLTFLoader.js` imports (`toTrianglesDrawMode`, `clone`);
`SkeletonUtils.js` is also what clones an animated model so two goblins can share one loaded file.
`GLTFLoader.js` has no other import and no dynamic `import()`; `three.module.js` imports only `./three.core.js`.

### SHA-256

Files with no rewrite are byte-identical to upstream, so one hash serves for both.

| File | SHA-256 of upstream original | SHA-256 of vendored file |
|---|---|---|
| `three.module.js` | `104f56145899722094556490d787aae0617cc2fc3382f31df02d724ea1aee341` | same |
| `three.core.js` | `613e370f76638fdef83926642bf256dc9615684922de1ce1f63a8583e5d78578` | same |
| `GLTFLoader.js` | `532ac726e120039acbcd6cf54328c57acbf7b438176afaa6951257126d11bff1` | `7bbda9f3af9b5acbd89a33cfc0aeb020f34d2d31a72829c79c0b354f9502c8e5` |
| `BufferGeometryUtils.js` | `7bda2a8ba836b2bcf67cb938d4b9e1bb5d1b1bc616817103ed858c0b58296ce7` | `319782169ed48af21fcaa251d839ecb8e58f14174aacbf68b74a437f3d6a3a98` |
| `SkeletonUtils.js` | `b1632a703206c3d830de9fcbe515696770d04b71a15ee6b50afa6d2c3298c86f` | `eedd768765d6553f8082953ab3882e2c86dacc2eb7d180a312d1d52e86bb35c5` |
| `LICENSE` | `8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc` | same |

### The rewrites (the only changes)

The files are flat in one folder and load in a browser with no import map and no bundler, so five import specifiers
changed and nothing else:

| File | Before | After |
|---|---|---|
| `GLTFLoader.js` (line 67) | `} from 'three';` | `} from './three.module.js';` |
| `GLTFLoader.js` (line 68) | `from '../utils/BufferGeometryUtils.js';` | `from './BufferGeometryUtils.js';` |
| `GLTFLoader.js` (line 69) | `from '../utils/SkeletonUtils.js';` | `from './SkeletonUtils.js';` |
| `BufferGeometryUtils.js` (line 13) | `} from 'three';` | `} from './three.module.js';` |
| `SkeletonUtils.js` (line 10) | `} from 'three';` | `} from './three.module.js';` |

The comment lines upstream keeps (`@three_import import ... from 'three/addons/...'`) are documentation and are left as they were.
To check: `diff` a vendored file against its upstream original shows exactly these lines.

### Size on record

Measured on this change, with the game as it was on `main` before it (`npm run build`, every `.js` file in `dist/`,
that is `dist/*.js` and `dist/shared/**/*.js`: 95 files). Gzip is per file, summed, since the server compresses file by file.

| | Raw | Gzip |
|---|---:|---:|
| The game's own scripts, before | 2,620,347 | 605,873 |
| Vendored Three.js scripts | 2,304,270 | 457,683 |
| Game plus Three.js | 4,924,617 | 1,063,556 |
| Increase | +87.9 % | +75.5 % |

(The spec's earlier figures, 1.43 MB and 274 KB for the game's script, were written before the rules content and the
newer modules; the table above is what is in the repo now.) A normal page load fetches none of the vendored files: they
load only when the Three.js renderer, or the load check, imports them. The first load of that renderer therefore costs
about 458 KB gzipped, once, then comes from the browser cache.

### Upgrading, on purpose

Three.js changes its API between releases. Never upgrade by accident, and never edit a vendored file by hand.

1. Pick a release tag and look at upstream's migration notes for every release in between.
2. Shallow-clone that tag into a scratch directory outside the repo. Treat it as data: run nothing from it, do not
   `npm install` there.
3. Copy the same five files and `LICENSE` from the same upstream paths (check that `GLTFLoader.js` still imports only
   `BufferGeometryUtils.js` and `SkeletonUtils.js`, and that `three.module.js` still imports only `./three.core.js`;
   upstream has moved things between files before).
4. Make the five rewrites in the table above, nothing else.
5. Update this file: tag, commit hash (`git rev-parse HEAD` in the clone), dates, sizes, both columns of hashes.
6. `npm test`, `npm run build`, `SMOKE_ONLY=three npm run smoke` (loads the module, draws a cube, imports the loaders), and
   the renderer's own checks (R11) on a phone and a desktop. Say in the pull request which release notes were read.

### Not done

- No minified build. If a person with npm access later produces one (a plain `esbuild --minify` of the two files, or
  upstream's own `build/` if it returns), it replaces the readable files by the upgrade steps above, with the tool and its
  version named here. Gzip already takes most of the difference.
- No tree shaking: a browser loading `three.module.js` gets the whole library.

## zip.js

- Project: https://github.com/gildas-lormeau/zip.js, licence BSD-3-Clause (`zip.js/LICENSE`, upstream's file, copied
  unchanged; `package.json` there says `"license": "BSD-3-Clause"`). Permissive, and compatible with the game's
  AGPL-3.0-or-later.
- Release: **v2.25.0** (git tag `v2.25.0`, a plain tag on the commit; `lib/core/version.js` says `2.25.0`).
- Commit the tag points to: **`9f42e4694a3f72dbdfe8186a2ff3e0f9a226014a`** (committed 2026-11-12, "bump up version").
- Picked by A0a and approved by the owner on 20 November 2026, on #572, with web workers switched off in the wrapper.
- Fetched: 2026-11-20, by `GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 --branch v2.25.0` of the upstream repository into a
  new, empty scratch directory outside the repo; `git rev-parse HEAD` there gave the commit above. Nothing from it was
  run (no node, no npm, no script); files were only copied out, and the scratch directory was deleted.
- What is vendored: exactly the files `lib/zip-core.js` imports, followed transitively by reading their `import` lines
  (36 files; the same set A0a counted), plus `LICENSE`. Upstream's `lib/` layout is kept under `vendor/zip.js/`, so
  every relative import resolves as it did upstream.
- Not vendored, on purpose: the `dist/` bundles (UMD, or ES modules that need a worker file and `zip-module.wasm` at run
  time), the WebAssembly codec, the inline-worker builds, `zip-fs`, the mime-type table, every test and tool.

### Files

Sizes in bytes; gzip is `gzip -9 -c file | wc -c`. Every path is relative to `vendor/zip.js/` here and to `lib/` upstream
(except `LICENSE`, at the root of both). No file was changed, so the SHA-256 of the vendored file and of upstream's
original are the same; the test `packages/server/test/modulezip.test.js` checks every line of this table against the
files.

| File | Raw | Gzip | SHA-256 (vendored = upstream) |
|---|---:|---:|---|
| `core/codec-pool.js` | 7,069 | 2,283 | `b97a0d18853af8f586f3f2425acf832531509155b4ce1f6a6ec016bd657a405c` |
| `core/codec-registry.js` | 4,501 | 1,669 | `3f374fea48240a5e6a8cb08b6858be044a998e89acb35079916125d16414021a` |
| `core/codec-worker-web.js` | 13,446 | 3,707 | `9f473145ee0b67bab15c91c03fe64ffe767be1fe207680657048f0fefe27e9af` |
| `core/codec-worker.js` | 7,489 | 2,618 | `3a520e827b3eaaebe29eb15dfaf8e44ce39a73a8279b4f6a45b9d67b6aa97675` |
| `core/compression-methods.js` | 3,696 | 1,415 | `a30f323744473718b827fd9d10ec24d230b15e3e9d39382a9eeb79e77c0a4a02` |
| `core/configuration.js` | 6,443 | 2,095 | `d1704dae2f554e2a52ce5adeee1324413a0e60e16d216dc303ee3ac10e283062` |
| `core/constants.js` | 7,924 | 2,366 | `7fe0def8623c590228ca3b59ed0a8b39a177b87356b7ca3903e92e643a649331` |
| `core/io.js` | 29,501 | 7,483 | `74008936dca35a0d877f40692a12a24954b777869d54f8277b952a06f5ed7d73` |
| `core/options.js` | 8,013 | 2,666 | `d020fc5d19098425ffb7c90cc3de792926c12b734ee053bbba465b87f5663c10` |
| `core/streams/aes-crypto-stream.js` | 10,533 | 3,172 | `1eafe5973687f8056a4e79b6a32a104de390b7277854c0aad766d8a098b58e14` |
| `core/streams/codec-stream.js` | 5,832 | 2,192 | `ef1ec139cfa93e7df0bd2e23df50c846d37e247ba18e6d907df9813f721dd59a` |
| `core/streams/codecs/aes-hmac-sha1.js` | 21,940 | 4,362 | `e463a42076ab6ab9808f1826b8876560808ab0e3078204e749ca03802244ef82` |
| `core/streams/codecs/crc32.js` | 3,643 | 1,893 | `fa9df771f65cd371189a9d957f773d2c262340bbf24061e1d579390b9553b913` |
| `core/streams/common-crypto.js` | 2,212 | 1,142 | `82545ccead86ccb9f71ff6e11db1dcd251e4dba69f4f616fb1bb7b9578941f43` |
| `core/streams/crc32-stream.js` | 1,987 | 1,095 | `fad66e40ef3972154f4b11203169b0746dca093a8dffbc46ee228fad94ccf122` |
| `core/streams/zip-crypto-stream.js` | 5,250 | 1,916 | `645cd178171505b715edc5e5278e8933c4a0b4956d49ae141a4934d4a71c333d` |
| `core/streams/zip-entry-stream.js` | 16,503 | 4,261 | `0a3fe81f8d2c8b7f19d8bd64aa1b58e3150ce256f23b680da702adfb519ddd46` |
| `core/util/array.js` | 1,914 | 991 | `5427846b98ab92a2e6f4c938df986c60f406ce6719303e0601fc7962b6164d19` |
| `core/util/blob-temp-stream.js` | 3,605 | 1,556 | `ad71cd134883c852d2c4a624f67eced129bf2d19b5a889b8c9280c388f12dc1b` |
| `core/util/compatible-streams.js` | 3,089 | 1,428 | `130c3ad5bf40fe39b65816ccfd99f19343ae84557d5c109151a716e3b1d7982d` |
| `core/util/decode-cp437.js` | 2,767 | 1,456 | `60a71e3168fd291cc7ec04695ac834349f267933b300a89e86ef64605fe8faa1` |
| `core/util/decode-text.js` | 2,189 | 1,109 | `d876f1662515c71eef0c67db826989e4628ec3bf125f2dd5661ec9dbe061ff6b` |
| `core/util/default-mime-type.js` | 1,532 | 875 | `a58ad6269b2538726656acf47a09e1c30e2bda9142363b61daa5565bea1d72cf` |
| `core/util/encode-text.js` | 1,905 | 1,066 | `148916caf86339886f76f7585fb1fca5abafb6f684918962a3064fcda0a71f74` |
| `core/util/error.js` | 1,556 | 877 | `5c0f1555592f9ddb08fc2b15abe72bf517fcaaf1ce613a0c2bc86e1ff5196b16` |
| `core/util/opfs-temp-stream.js` | 4,381 | 1,820 | `a96014ae88db104f6bac6f9c06501bc5a1e8859c49d9f11a89a25a4031bd88d7` |
| `core/util/sync-access-handle-temp-stream.js` | 4,916 | 2,022 | `cc6c61937b6199c85a9ce9aa86e72d2f7929fb9c064983c9a94f04f39dc35f8f` |
| `core/util/warnings.js` | 1,764 | 969 | `0e7c4d72028dd318467a0bd0d3b375ca66f1f530ef4a8f1d1cf74c2beb19cbed` |
| `core/version.js` | 1,489 | 838 | `3862098b343b71f39d127f1a40433d4caa0d0e58ecc60320f8ae50266a9c9b58` |
| `core/zip-entry.js` | 8,588 | 2,232 | `6d535dabeb8883941103b49afafcbbdfcf2e7b5434d20807a632700b136abeac` |
| `core/zip-reader.js` | 83,531 | 17,377 | `0a42304528f3b28fc44bca05e9e77e18ba23a23d124f013eb59ce3c45374054b` |
| `core/zip-writer.js` | 102,366 | 21,418 | `6ba48ff3fe58d2d70193915306e7ab12997d0b1ff453bdced71c8d9106073494` |
| `zip-core-base.js` | 3,030 | 1,411 | `27c8a9bccb493b55bdd612961b5c35fd6e2e5fa2493202c05effff25e33ab790` |
| `zip-core-reader.js` | 3,027 | 1,347 | `e6b76ce71e336219e5606951a36d2f0479cbd5610f4de87c39d66ff2fe0197ef` |
| `zip-core-writer.js` | 2,659 | 1,201 | `a7a89e00eaff6ab7af423b1a0a66bf04ab980711de9c1b19a48a9d2b029df0c3` |
| `zip-core.js` | 1,534 | 866 | `0076666a6d675f1ac13b8b983a0b39a05823524a58492372535ba14cb9bd794d` |
| `LICENSE` | 1,501 | 812 | `1b7ebc8d7889ed25491484ab2b102370742ca6c0b26650a0c62cc2269b579b84` |

| | Raw | Gzip |
|---|---:|---:|
| **Scripts total (36 files)** | **391,824** | **107,194** |
| Of which the writer, `core/zip-writer.js` | 102,366 | 21,418 |
| Of which the reader, `core/zip-reader.js` | 83,531 | 17,377 |

### The rewrites

None. Every import in the 36 files is relative (`./core/...`, `../util/...`) and resolves inside `vendor/zip.js/`.
To check: `diff -r` of `vendor/zip.js/` against upstream's `lib/` (the 36 files) shows nothing.

### What is in the files that the game must keep switched off

Read from the code at this tag (`grep` for `import(`, `new Worker`, `fetch`, `XMLHttpRequest`, `WebAssembly`):

- **Web workers.** `core/codec-worker-web.js` can start a `Worker` from `workerURI`. The wrapper calls
  `configure({ useWebWorkers: false, ... })` once and passes `useWebWorkers: false` on every read and write. The test
  replaces `globalThis.Worker` with a recorder and checks that a read and a write construct none.
- **The one run-time `import()`.** `core/codec-registry.js` imports a codec's `codecURI`, and only for a codec somebody
  registered with `registerCodec`. The wrapper registers none, refuses every method but 0 and 8 before the library is
  loaded, and refuses to start a read if any codec is registered. The test registers a codec whose URI would leave a
  mark if imported, and checks that it never is.
- `core/zip-writer.js` has `await import("./zip-reader.js")`, a fixed path inside the vendored set (used when a zip is
  appended to; the wrapper never does).
- `core/io.js` has `HttpReader` (`fetch`, `XMLHttpRequest`); the OPFS temp streams use `navigator.storage`. The wrapper
  uses only `Uint8ArrayReader`, `Uint8ArrayWriter`, `TextReader` and a `WritableStream`; none of the others is reached.
- `zip-core-base.js` sets `baseURI` from `import.meta.url` at load; it is used only to resolve worker and codec URIs.

### What the API answers, and what the wrapper does instead

The wrapper (`packages/client/modulezip.js`) does every check of `docs/specs/adventure-module.md` Decision 5 pass 1 by
reading the zip's fixed-size records itself (the end record, the central directory, the local headers and data
descriptors), with no decompression, before the library is even loaded. Then the library lists the entries again; if
its list differs from the wrapper's in count, offset, name bytes, sizes, method or encryption, the file is refused.

| Check | By the library | By the wrapper |
|---|---|---|
| Lists the central directory before inflating (name, method, sizes, CRC, flags, attributes) | yes, `ZipReader.getEntries()` | reads the same records itself and compares |
| Inflates one entry at a time, as a stream | yes, `entry.getData(writable)` with the platform's `DecompressionStream('deflate-raw')` | counts every chunk it is given |
| Stops part-way when the output passes a limit | yes, when a `signal` aborts or the writable throws | aborts the moment the output passes the declared size, the entry's cap, 200 times its packed size, or the 95 MB total |
| Output larger than the declared size | yes (`Invalid uncompressed size`) | also counted |
| CRC-32 | yes, with `checkSignature: true` (`Invalid CRC32`) | turned on; a test for a stored and a deflated entry |
| Writes a zip | yes, `ZipWriter` | `writeModuleZip`: manifest first, fixed dates, no ZIP64, no data descriptors |
| File size cap, before reading | no | on the byte length (`Blob.size` before `arrayBuffer()`) |
| One end record, reaching the end; nothing after it; comment of 1 KB at most | no (it searches, and tolerates appended data) | yes |
| ZIP64 and multi-disk refused | no (it supports both) | yes, in the end record, the records and the extra fields |
| Entry cap (320) | no | from the end record, before a record is read |
| Names: charset, 100 bytes, no `..`, `.`, empty segment, `/`, `\`, drive letter or NUL | partly (`filenameValidation`, other rules) | yes, the spec's rules; refused names shown escaped |
| Duplicates, lower-cased | no | yes |
| Kind (symbolic link, device) from external attributes | no (it reports them) | yes |
| Encrypted entries refused | it refuses only without a password | refused outright (flag bits 0, 6, 13) |
| Methods 0 and 8 only | no (it also reads Deflate64 and registered codecs) | yes |
| Local header agrees with the central record; data descriptor agrees | partly (`checkLocalDirectory` in its default strictness) | yes, for every entry, before inflating any |
| No overlapping data; nothing into the central directory | optional (`checkOverlappingEntry`), per entry as it is read | yes, over all entries at once, before inflating any |
| Order (`module.json` first, `adventure.json` second); one top folder stripped; `__MACOSX/` and `.DS_Store` skipped | no | yes |
| Declared sizes against the caps, the ratio and the total, before inflating | no | yes |
| The time limit (5 s server, 20 s browser) | no | the clock between chunks and between entries, and a timer that aborts |
| Pictures: named by the manifest, bytes, PNG/JPEG/WebP by the bytes, SHA-256 | no | yes (SHA-256 through `crypto.subtle`, or a function the caller gives) |

### Size on record

Measured on this change with `npm run build`: every `.js` file in `dist/` outside `dist/vendor/` and `dist/models/`
(the game's own scripts and the rules as `dist/shared/`). Gzip is `gzip -9` per file, summed, since the server
compresses file by file.

| | Files | Raw | Gzip |
|---|---:|---:|---:|
| The game's own scripts, before (without `modulezip.js`) | 181 | 5,157,965 | 1,404,892 |
| The wrapper, `modulezip.js` | 1 | 31,299 | 9,535 |
| Vendored zip.js scripts | 36 | 391,824 | 107,194 |
| Wrapper plus zip.js, against the game before | | +8.2 % | +8.3 % |
| Vendored Three.js scripts, for comparison | 5 | 2,304,270 | 457,683 |

A normal page load fetches none of it: nothing on the page imports `modulezip.js`, and `modulezip.js` has no static
import; it loads `./vendor/zip.js/zip-core.js` with a dynamic `import()` on its first read or write. Opening a module
therefore costs about 117 KB gzipped, once, then comes from the browser cache. The server and the tests import the
wrapper from `packages/client/` by path.

### Upgrading, on purpose

Never upgrade by accident, and never edit a vendored file by hand.

1. Pick a release tag and read upstream's release notes for every release in between, and its security advisories.
2. Shallow-clone that tag into a new, empty scratch directory outside the repo
   (`GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 --branch <tag> https://github.com/gildas-lormeau/zip.js <dir>`). Treat it as
   data: run nothing from it, do not `npm install` there. Note `git rev-parse HEAD`.
3. Work out again which files `lib/zip-core.js` imports, by reading `import` lines (static and dynamic) from that file
   onwards; upstream adds and moves files between releases. Grep the set for `import(`, `new Worker`, `fetch`,
   `XMLHttpRequest`, `WebAssembly` and compare with "What is in the files" above.
4. Replace `vendor/zip.js/` with exactly that set, in upstream's `lib/` layout, and `LICENSE` (read it: it must still be
   BSD-3-Clause or another licence the spec allows).
5. Change `LIBRARY_VERSION` in `modulezip.js`, and check that the options it uses (`useWebWorkers`,
   `useCompressionStream`, `chunkSize`, `checkSignature`, `signal`, `getRegisteredCodecs`) still mean what they did.
6. Update this file: tag, commit, dates, the file table (sizes and hashes), the totals and the size on record.
7. Run `node --test packages/server/test/modulezip.test.js` (every hostile fixture, the hashes, workers off), `npm test`,
   `npm run build`, and the headless-browser read. Say in the pull request which release notes were read.
