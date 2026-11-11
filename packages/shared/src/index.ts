/**
 * Message shapes shared by the server and the client.
 *
 * Clients send intents; the server validates them against the rules and
 * broadcasts the resulting events. See docs/DESIGN.md.
 */

/** Something a player or the DM is asking to do. Not yet validated. */
export interface Intent {
  readonly type: string;
  /** Id of the creature or user the intent is made on behalf of. */
  readonly actor: string;
}

/** Something that happened, as decided by the server. */
export interface GameEvent {
  readonly type: string;
  /** Position in the session's event log, starting at 0. */
  readonly seq: number;
}

export const PROTOCOL_VERSION = 1;
