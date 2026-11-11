import assert from "node:assert/strict";
import { test } from "node:test";
import { PROTOCOL_VERSION } from "./index.ts";

test("protocol version is a positive integer", () => {
  assert.ok(Number.isInteger(PROTOCOL_VERSION) && PROTOCOL_VERSION > 0);
});
