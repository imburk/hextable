# Spec: the feedback button

Status: built in #353 (a first version for the owner's play tester). The owner asked on
15 November 2026 for "a persistent chat icon in a corner of the screen so it can provide
you with some recent history as well if relevant", and left what to send to the lead, whose
decisions are below.

## What the player sees

A small chat icon, fixed at the left edge under the turn order and the hint line (in the
lobby, the bottom-left corner), on every view: lobby, table and solo. It is clear of the
action panel (bottom), the camera buttons (right), the drawer, the dice tray and the
tracker, at 390x844 and 1280x800, and it is hidden while a reaction question is up (and
while a modal drawer is open on the left). It can be reached by keyboard and has a visible
focus ring.

It opens a panel: a text box (Ctrl+Enter or Cmd+Enter sends; Enter is a new line), a kind
(Bug, Idea, Question), a tick "Include what just happened" (on by default), a disclosure
"See what will be sent" that shows the exact report, Send, and Copy. After sending there is a
thank-you with a short reference (`FB-XXXXXX`). The draft survives closing the panel (and a
reload, on this device) and is cleared when it is sent. With no server to send to, or no
network, the panel says so and offers Copy (the clipboard from the click; failing that the
text is selected for the player to copy by hand).

## What is sent

Always: the comment (at most 2,000 characters), the kind, the time, the build (`state-v<N>`:
the saved-game version, until the build stamps a commit), solo or table, the sender's role
(player or DM), renderer, theme, grid kind, viewport size, touch or mouse, the browser's user
agent, the page's language. At a table, `table`: a 12-hex-digit one-way hash of the table code
(SHA-256 of a fixed text and the code; a plain hash where the browser has no `crypto.subtle`).

With "Include what just happened" (`context`):

- the last 30 log lines exactly as this viewer was shown them (taken from what the log was
  handed to draw, never from the state), each cut to 300 characters; lines of talk (chat,
  notes, handouts) are never kept;
- the last 15 actions this client sent, as a type and a few short ids and numbers (never
  text a player typed, names or documents), each with the answer: `accepted`, `refused: <the
  engine's words>` or `sent` (no answer yet);
- whether a fight is on, the round, and whose turn the viewer sees (`mine`, `other`,
  `unseen`);
- the viewer's own selected character's class, level and conditions (no name);
- the map's id;
- page errors since load (message and file:line, ten at most).

If the report is over 24 KB the oldest log lines and actions are dropped until it fits.

## What is never sent

The dice seed, the game state, anything the viewer was not shown (so a player's report can hold
nothing hidden from that player), character or player names given as fields, monikers, the table
code, other people's chat, private notes, handouts, pictures. Note: a log line is the
viewer's own log as drawn, so it carries the names of creatures as the game shows them
("Brenna attacks the Goblin Warrior"). The preview shows them before anything is sent.

## Where it goes

`POST /feedback` on the table server: JSON only (`application/json`), at most 24 KB (the body
is cut off while it is read, never buffered past that), checked field by field against an
allow-list (a field that is not named, of the wrong type or too long is refused with a short
reason and nothing is written), per-address limits of 5 a minute and 30 an hour (the server's
own address logic and `TRUST_PROXY`; `LIMIT_FEEDBACK_MINUTE` and `LIMIT_FEEDBACK_HOUR` change
them), then one JSON line appended to `feedback.jsonl` in the data directory. When that passes
5 MB (`FEEDBACK_MAX_BYTES`) it is renamed to `feedback.1.jsonl`, replacing the older one, so
the disk holds two files at most. The answer is `{ ref }`. The line holds the reference, the
time, the server's commit if its host gives one (`RAILWAY_GIT_COMMIT_SHA`, `SOURCE_COMMIT` or
`GIT_COMMIT`) and the report; not the sender's address.

CORS is open for this route only (`Access-Control-Allow-Origin: *`, no credentials, a
preflight answered), so a solo game served from another site can post to a table server. The
client posts to `./feedback`, or to the address in `<meta name="hextable-feedback-url">` when a
build puts one in the page. Nothing sets that tag today (see "What is not built").

### Filing on GitHub (optional)

With `FEEDBACK_GITHUB_REPO` (`owner/name`) and `FEEDBACK_GITHUB_TOKEN` (a token that may create
issues in that repo) both set, the server also files the report as an issue labelled
`feedback`, after the player has their answer. The title is the kind and the first 60
characters of the comment with markup characters turned to spaces. In the body every word the
player wrote, and the whole context, is inside a fenced block whose fence is one backtick
longer than the longest run in the text, so it cannot make a mention, a link, a reference or
HTML, or close the block; the only markup outside the blocks is the server's own. The
request has a timeout (10 s; `FEEDBACK_GITHUB_TIMEOUT_MS`), at most four are in flight, a
failure is logged without the token and never reaches the player, and the local line is kept
whatever happens. `FEEDBACK_GITHUB_API` (https, or http on this machine) is for tests.

## Review points

- Nothing hidden can leave through a report: the client builds it from what it displayed or
  sent, and the server's allow-list refuses anything else (`REPORT` in
  `packages/server/src/feedback.js`; the client test builds a report from a player's view and
  checks it).
- The endpoint cannot fill the disk (24 KB a request, 30 an hour an address, two files of 5 MB),
  inject into the issue tracker (fenced, as above), or act as a relay (it makes one fixed
  request to one configured repository).
- No new dependency; Node's `fetch` and the browser's `fetch`.
- The answer to an action is matched to it by order: an update that arrives after an action
  with no refusal before it marks it `accepted`, so at a table another player's update can mark
  an action accepted a moment early. Good enough for reading a report; not a log.
- Names in log lines, above.

## What is not built

- A screen for the DM to read reports. They are read in `feedback.jsonl` on the server or as
  GitHub issues.
- Attachments and screenshots.
- A commit stamp in the build (`build.mjs` is not part of this job): the report says
  `state-v<N>`, and the server's own commit is added to the stored line.
- A configured server address for the solo game on GitHub Pages (below).
- Seeding the shown log from history on joining a table: lines a player was shown before
  the page loaded, or by a reconnect, are not in the report.
