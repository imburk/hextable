# Vendored third-party code

Everything under `vendor/` is somebody else's code, copied in unchanged except for the import lines listed below.
Nothing else in the repo may import it, except the Three.js renderer (task R11) and the one-page load check
`packages/client/three-check.js`. The default page load does not fetch any of it.
Why it is here and why it is allowed: `docs/DESIGN.md` (decisions table) and `docs/specs/renderer.md`, Decision 8 and the
R10 build note.

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
