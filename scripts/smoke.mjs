// Browser smoke test: `npm run smoke`. Not part of `npm test`.
//
// Builds the game, starts the table server on a free port, and drives the real page in headless
// Chromium: solo play at desktop size and at phone size with touch, multiplayer with two browser contexts,
// scenes, armed features, dice, reactions, the reaction question, import, the timeline, beats, table controls,
// class features, the renderer interface, Three.js, the drawer, defeat, rewards and the stock maps.
//
// Every step has an expected effect on `window.hextable.state`. The run fails (exit 1) on any page
// error, console error or step that does not do what it should, and says which step. Playwright is
// not a dependency: it is looked up in the global node_modules, and if it is not there the run is
// skipped with exit 0 (CI has no browser).
//
// This file is only the runner. Each pass is one file under scripts/smoke/, shared helpers are in
// scripts/smoke/lib.mjs. SMOKE_ONLY=<name> runs one registry entry alone; an unknown name exits 1 and lists the names.
//
// To add a pass:
//   1. Create scripts/smoke/<name>.mjs. It imports what it needs from ./lib.mjs and does
//      `export default async function (browser, url) { ... }`, calling scenario(label, fn) for each run it makes
//      (see scripts/smoke/maps.mjs for a small one). A helper only your pass uses stays in your file.
//   2. Add one line to REGISTRY below: `name: ['<file>', ...]`. Order is the order of a full run.
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { ARGS, startServer, stopServer, failures } from './smoke/lib.mjs';

// SMOKE_ONLY name -> the pass files (in scripts/smoke/) it runs, in order.
const REGISTRY = {
  base: ['solo', 'multiplayer'],
  armed: ['armed'],
  dice: ['dice'],
  reactions: ['reactions'],
  scenes: ['scenes'],
  prompt: ['prompt'],
  import: ['import'],
  timeline: ['timeline'],
  beats: ['beats'],
  controls: ['controls'],
  classes: ['classes'],
  interface: ['interface'],
  three: ['three'],
  drawer: ['drawer'],
  defeat: ['defeat'],
  rewards: ['rewards'],
  log: ['log'],
  'three-parity': ['three-parity'],
  maps: ['maps'],
  pinch: ['pinch'],
  newgame: ['newgame'],
  actionpanel: ['actionpanel'],
  paneltabs: ['paneltabs'],
  items: ['items'],
  link: ['link'],
  square: ['square'],
  formation: ['formation'],
};

const only = process.env.SMOKE_ONLY;
if (only && !Object.hasOwn(REGISTRY, only)) {
  console.log(`smoke: unknown SMOKE_ONLY name "${only}". Valid names: ${Object.keys(REGISTRY).join(', ')}`);
  process.exit(1);
}

let chromium;
try {
  const req = createRequire(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() + '/');
  ({ chromium } = req('playwright'));
} catch {
  console.log('smoke: skipped: playwright not found (install it globally to run the browser smoke test)');
  process.exit(0);
}

let browser = null;
try {
  console.log('smoke: building and starting the table server');
  const url = await startServer();
  browser = await chromium.launch({ args: ARGS });
  // Every page plays at pace `instant` (docs/specs/renderer.md, decision 3), so the passes that are not about pacing need not wait for
  // beats. A pass about pacing asks for another pace: browser.newContext(opts, { pace: 'wait' }).
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (opts, { pace = 'instant' } = {}) => {
    const c = await newContext(opts);
    await c.addInitScript((p) => { try { localStorage.setItem('hextable.pace', JSON.stringify(p)); } catch { /* storage unavailable */ } }, pace);
    return c;
  };
  for (const [name, files] of Object.entries(REGISTRY)) {
    if (only && only !== name) continue;
    for (const file of files) await (await import(`./smoke/${file}.mjs`)).default(browser, url);
  }
} catch (err) {
  failures.push(`smoke could not run: ${err.message}`);
} finally {
  await browser?.close().catch(() => {});
  stopServer();
}
if (failures.length) { console.log(`\nsmoke: FAILED\n${failures.map((f) => '  ' + f).join('\n')}`); process.exit(1); }
console.log('\nsmoke: all steps passed');
