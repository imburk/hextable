// Assembles the static site in dist/: the client files, with the rules engine
// copied in as ./shared so the browser can import it with relative paths.
import { cpSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
cpSync("packages/client", "dist", { recursive: true });
cpSync("packages/rules/src", "dist/shared", { recursive: true });
console.log("Built dist/");
