// The three tiny pictures of the worked example (docs/specs/adventure-module.md), by their bytes: just enough header for
// the asset stores' type test. The fixture adventure-flooded-mill.json lists their sizes and fingerprints; the tests check them.
const bytes = (...a) => Uint8Array.from(a.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : x)));
const pad = (n) => new Array(n).fill(7);
export const PICTURES = {
  "a-gate": { mime: "image/webp", file: "pictures/gate.webp", bytes: bytes("RIFF", [24, 0, 0, 0], "WEBP", "VP8 ", pad(20)) },
  "a-oswin": { mime: "image/jpeg", file: "pictures/oswin.webp".replace("webp", "jpg"), bytes: bytes([0xff, 0xd8, 0xff, 0xe0], pad(30)) },
  "a-ledger": { mime: "image/png", file: "pictures/ledger.png", bytes: bytes([0x89], "PNG", [13, 10, 26, 10, 0, 0, 0, 13], "IHDR", pad(17)) },
};
export const b64 = (u8) => Buffer.from(u8).toString("base64");
