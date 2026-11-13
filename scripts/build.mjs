// Assembles the static site in dist/: the client files, with the rules engine
// copied in as ./shared so the browser can import it with relative paths.
import { cpSync, existsSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
cpSync("packages/client", "dist", { recursive: true });
cpSync("packages/rules/src", "dist/shared", { recursive: true });
// packages/client/vendor/ (pinned third-party code, see its README) arrives in dist/vendor/ with the rest of the client.
// Nothing imports it by default; only the Three.js renderer and the load check do. Fail the build if it did not arrive.
for (const f of ["three.module.js", "three.core.js", "GLTFLoader.js", "BufferGeometryUtils.js", "SkeletonUtils.js", "LICENSE"])
  if (!existsSync(`dist/vendor/three/${f}`)) throw new Error(`dist/vendor/three/${f} is missing: the vendored Three.js did not build in`);
console.log("Built dist/");
