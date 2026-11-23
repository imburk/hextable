// Error reports from the page (issue #689): when the page raises an error or an unhandled promise rejection, a small scrubbed report goes to the
// table server so a crash in a browser is not lost. It is built from what the page already knows and nothing else: the error's message and
// stack with every name this client has in view replaced (the scrubber of feedback.js), the build, the screen size, the mode (solo or table) and
// the types of the last five actions this client sent. Never a table code, a name, a note, a chat line or an action's arguments.
//
// It must never get in the way of play: at most 5 reports a minute leave this page, the same error is sent once, nothing waits for an answer, and
// every failure (a closed socket, no server, a throw in here) is swallowed.
//
//   createErrorReporter({ scrub, facts, send, now }) -> { report(kind, message, stack, where) -> the report that was sent, or null }
//     facts() -> { build, mode: 'solo'|'table', screen: { w, h }, actions: [type, ...] }
//     send(report) -> sends it (the socket, or a POST)
export const PER_MINUTE = 5, MESSAGE_MAX = 300, STACK_MAX = 1500, WHERE_MAX = 200;
const WORD = /^[\w.:-]{1,40}$/;
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').slice(0, n);
// A stack with addresses cut to the file's name and no query: where the script came from is not needed and can carry a table's address.
const shortStack = (stack) => String(stack ?? '').replace(/(?:https?|file|blob):\/\/[^\s)]*?\/([^\s/)?#:]+)(?:\?[^\s):]*)?/g, '$1');

export function createErrorReporter({ scrub = (t) => t, facts, send, now = Date.now } = {}) {
  const sentAt = [], seen = new Set();
  return {
    report(kind, message, stack = '', where = '') {
      try {
        const t = now();
        while (sentAt.length && t - sentAt[0] >= 60_000) sentAt.shift();
        if (sentAt.length >= PER_MINUTE) return null;
        const msg = clean(scrub(message), MESSAGE_MAX);
        const key = `${kind}|${msg}|${clean(where, WHERE_MAX)}`;
        if (seen.has(key)) return null;
        if (seen.size > 50) seen.clear();
        seen.add(key);
        const f = facts();
        const r = {
          v: 1, kind: kind === 'rejection' ? 'rejection' : 'error', message: msg,
          ...(stack ? { stack: clean(scrub(shortStack(stack)), STACK_MAX).replace(/\r/g, '') } : {}),
          ...(where ? { where: clean(where, WHERE_MAX) } : {}),
          build: clean(f.build ?? '', 40), mode: f.mode === 'table' ? 'table' : 'solo',
          screen: { w: Math.max(0, Math.min(20000, Math.round(f.screen?.w) || 0)), h: Math.max(0, Math.min(20000, Math.round(f.screen?.h) || 0)) },
          actions: (f.actions ?? []).slice(-5).map((a) => (WORD.test(String(a)) ? String(a) : 'other')),
        };
        sentAt.push(t);
        send(r);
        return r;
      } catch { return null; }
    },
  };
}
