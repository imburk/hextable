import assert from "node:assert/strict";
import { test } from "node:test";
import { describeServer } from "./index.ts";

test("server can reach the rules and shared packages", () => {
  assert.match(describeServer(1), /^hextable server, protocol v1, test roll \d+$/);
  assert.equal(describeServer(1), describeServer(1));
});
