import assert from "node:assert/strict";
import { test } from "node:test";
import { clientProtocolVersion } from "./index.ts";

test("client speaks the shared protocol version", () => {
  assert.equal(clientProtocolVersion, 1);
});
