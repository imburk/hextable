import { createRng, rollDie } from "@hextable/rules";
import { PROTOCOL_VERSION } from "@hextable/shared";

/**
 * Placeholder until milestone 4 (sessions, join by link, intents and events).
 * It exists now so the package wiring between server, rules and shared is
 * exercised by the build and the tests.
 */
export function describeServer(seed: number): string {
  const roll = rollDie(createRng(seed), 20);
  return `hextable server, protocol v${PROTOCOL_VERSION}, test roll ${roll}`;
}
