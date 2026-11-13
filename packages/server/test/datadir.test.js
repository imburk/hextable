// The server must refuse to start when it cannot save: a table that is not saved is lost at the next restart.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER = fileURLToPath(new URL("../src/index.js", import.meta.url));

function tryStart(data) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SERVER], { env: { ...process.env, PORT: "0", DATA_DIR: data }, stdio: ["ignore", "pipe", "pipe"] });
    let err = "", out = "";
    child.stderr.on("data", (d) => (err += d));
    child.stdout.on("data", (d) => { out += d; if (/http:\/\/localhost:\d+/.test(out)) { child.kill("SIGTERM"); } });
    child.once("exit", (code) => resolve({ code, err, started: /http:\/\/localhost:\d+/.test(out) }));
  });
}

test("a data folder that cannot be created stops the server with a clear message", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hextable-dd-"));
  try {
    writeFileSync(join(dir, "afile"), "");
    const r = await tryStart(join(dir, "afile", "data"));     // below a plain file: cannot be made, even for root
    assert.equal(r.started, false);
    assert.equal(r.code, 1);
    assert.match(r.err, /DATA_DIR .* is not writable.*refusing to start/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a read-only data folder stops the server with a clear message", { skip: process.getuid?.() === 0 && "root can write anywhere" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "hextable-dd-"));
  try {
    chmodSync(dir, 0o555);
    const r = await tryStart(dir);
    assert.equal(r.started, false);
    assert.equal(r.code, 1);
    assert.match(r.err, /is not writable \(EACCES\)/);
  } finally { chmodSync(dir, 0o755); rmSync(dir, { recursive: true, force: true }); }
});

test("a writable data folder starts and leaves no probe file behind", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hextable-dd-"));
  try {
    const r = await tryStart(dir);
    assert.equal(r.started, true);
    const { readdirSync } = await import("node:fs");
    assert.equal(readdirSync(dir).includes(".write-test"), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
