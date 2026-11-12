// Shared by the tests that run the real server as a child process. Every server listens on port 0, so
// the system hands out a free port and parallel test runs cannot collide; the port is read back from
// the start-up line. Every server gets a data folder of its own, and `stopAll` stops each server and
// waits for it to exit before removing its folder (a server still saving on its way out would race the removal).
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER = fileURLToPath(new URL("../src/index.js", import.meta.url));
const running = [];

// Start a server with these extra environment settings (and optionally an existing data folder).
// Resolves to { port, data, child, stderr(), stop() } once it is listening.
export async function startServer({ env = {}, data, stderr = "inherit" } = {}) {
  const own = data === undefined;
  data ??= mkdtempSync(join(tmpdir(), "hextable-t-"));
  const child = spawn(process.execPath, [SERVER], { env: { ...process.env, ...env, PORT: "0", DATA_DIR: data }, stdio: ["ignore", "pipe", stderr === "pipe" ? "pipe" : "inherit"] });
  let err = "";
  child.stderr?.on("data", (d) => (err += d));
  const exited = new Promise((r) => child.once("exit", r));
  const entry = { child, data, own, exited };
  running.push(entry);
  const port = await new Promise((resolve, reject) => {
    let out = "";
    child.stdout.on("data", (d) => { out += d; const m = /http:\/\/localhost:(\d+)/.exec(out); if (m) resolve(Number(m[1])); });
    child.once("exit", (code) => reject(new Error(`server exited early with code ${code}`)));
  });
  // SIGTERM makes the server save what is waiting; wait for it to finish.
  const stop = async () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM"); await exited; };
  return { port, data, child, stderr: () => err, stop };
}

// Call from an `after` hook: stop every server, wait for all of them, and only then remove the folders
// (two servers may have shared one).
export async function stopAll() {
  const all = running.splice(0);
  for (const { child } of all) if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  await Promise.all(all.map((e) => e.exited));
  for (const { data, own } of all) if (own) rmSync(data, { recursive: true, force: true, maxRetries: 5 });
}

// A promise that rejects rather than waiting for ever.
export const within = (promise, ms = 10_000, what = "event") =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out waiting for ${what}`)), ms).unref())]);
