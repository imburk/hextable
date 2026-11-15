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

Always: the comment (at most 2,000 characters), the kind, the time, the build (the build
stamp's commit, time and change number, such as `c1d5069 2026-11-15T11:13:26Z #354`; `state-v<N>` if the stamp could not be
read), solo or table, the sender's role
(player or DM), renderer, theme, grid kind, viewport size, touch or mouse, the browser's user
agent, the page's language. Nothing about the table's identity is sent: not the code and not
a hash of it (a table code has too few possibilities for a hash to be one-way; reports are
grouped by the time and the build, and the owner can ask).

With "Include what just happened" (`context`):

- the last 30 log lines as this viewer was shown them (taken from what the log was handed to
  draw, never from the state), each cut to 300 characters, **with every name replaced**
  first (see "Names"). Only lines of the kinds the table under "Log lines" calls `engine`
  are kept; a kind that may hold typed text is not, and a kind not in the table is not;
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
nothing hidden from that player), **names of people or of their characters**, monikers, the table
code or any hash of it, other people's chat, private notes, handouts, pictures.

### Log lines

Every kind of line the log can draw, by the event's type, and what leaves. The same table is
`LINE_KINDS` in `packages/client/feedback.js`; a client test reads the describe functions of
`app.js`, `handouts.js` and `scenes.js` and fails until each type they draw is classified here
and there. `engine`: the game's own words, names scrubbed, kept. `fixed`: the label it carries
is typed text (a scene or NPC or chronicle title), so a fixed sentence is kept instead
("Taken back.", "Done again."). `typed`: may hold text a person typed (a title, a name of a
map, region, item or object, chat, a note, a free-text check): never kept. Toasts are not
recorded; the engine's refusal text for an action is kept as `refused: ...` after the same
scrubbing (engine words; a refusal that echoed typed text is a known gap).

| Class | Types |
|---|---|
| engine | `encounterStart` `encounterEnd` `turn` `joined` `attack` `damage` `heal` `cast` `act` `recharge` `save` `down` `died` `deathSave` `std` `cond` `condEnd` `manual` `effectStart` `effectEnd` `concentration` `stood` `time` `rest` `tempHp` `spawned` `summoned` `bonded` `unbonded` `companion` `companionOrder` `pocketed` `recalled` `reformed` `delivered` `reasserted` `mounted` `dismounted` `vanished` `fell` `size` `speed` `revealed` `concealed` `hid` `unhidden` `light` `follow` `formation` `marchingOrder` `rewound` `levelReady` `conclusionSkipped` `conclusionReady` `xp` `conclusionEdited` |
| fixed | `undone` `redone` |
| typed | `note` `chronicle` `claimed` `released` `map` `region` `check` `object` `noticed` `triggered` `gear` `item` `equip` `attuning` `attuned` `conclusion` `say` `privateNote` `handoutShown` `handout` `handoutHidden` `handoutRemoved` `sceneStart` `sceneEdit` `sceneEnd` `sceneNpc` `checkAsked` `commanded` `commandedTurn` |

### Names

A log line is the viewer's own log as drawn, so it holds names. Before a line, a refusal text or
a page error is kept, every name the client has in view is replaced, in one pass and by whole
names only (a name inside a longer word is left alone, regex characters in a name do no harm):
each player's moniker by "Player 1", "Player 2"; each party character's name by "Hero 1
(Fighter)"; a creature's name is kept only when it is exactly a content entry's own name,
with at most the number the game adds ("Goblin Warrior 2"; "Goblin Warrior Dmitri" is not), otherwise it becomes "a creature". A name the client has never seen (a creature that left
before this page loaded) cannot be replaced; such lines come only from history, which is not
recorded (see below). A DM's report can hold things players have not seen (a hidden creature,
say); the panel says so for the DM and the tick can be cleared.

## Where it goes

`POST /feedback` on the table server: JSON only (`application/json`), at most 24 KB (the body
is cut off while it is read, never buffered past that), checked field by field against an
allow-list (a field that is not named, of the wrong type or too long is refused with a short
reason and nothing is written), per-address limits of 5 a minute and 30 an hour (the server's
own address logic and `TRUST_PROXY`; `LIMIT_FEEDBACK_MINUTE` and `LIMIT_FEEDBACK_HOUR` change
them; an IPv6 address counts by its /64), then one JSON line appended to `feedback.jsonl` in
the data directory. A request the headers show to be junk (wrong type, too long) is refused
before the address's budget is spent. When the file passes 5 MB (`FEEDBACK_MAX_BYTES`) it is
renamed to the next free `feedback.N.jsonl`; there are five files in all (`FEEDBACK_FILES`).
When all are full new reports are refused (503, "Copy it and send it another way") and
nothing older is ever deleted, so a flood cannot erase a real report; the owner moves the
files away. The answer is `{ ref }`. The line holds the reference, the
time, the server's commit if its host gives one (`RAILWAY_GIT_COMMIT_SHA`, `SOURCE_COMMIT` or
`GIT_COMMIT`) and the report; not the sender's address.

CORS is open for this route only (`Access-Control-Allow-Origin: *`, no credentials, a
preflight answered), so a solo game served from another site can post to a table server. The
client posts to `./feedback`, or to the address in `<meta name="hextable-feedback-url">`, which
`scripts/build.mjs` writes when `HEXTABLE_FEEDBACK_URL` is set (the Pages workflow sets it to
the public table server; it works only once that server runs a build with this route).

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
whatever happens. The whole server files at most 20 issues an hour and 100 a day
(`LIMIT_FEEDBACK_FORWARD_HOUR`, `LIMIT_FEEDBACK_FORWARD_DAY`); a report over the cap is
stored and not forwarded. `FEEDBACK_GITHUB_API` (https, or http on this machine) is for tests.

## The build stamp

`/build.json` says which change a running game is: `{ commit, when, pr?, subject?, source }`.
`scripts/build.mjs` writes `dist/build.json` (from `GITHUB_SHA` and `git log -1`; source `pages`
under GitHub Actions, `local` otherwise). The table server answers `GET /build.json` itself
(`packages/server/src/build-info.js`): the commit and subject from Railway's
`RAILWAY_GIT_COMMIT_SHA` and `RAILWAY_GIT_COMMIT_MESSAGE` when they are set, else the image's
own file, with `source: "server"`, `from` (`railway` or `image`) and `started`. Only those two
variables are read. The game fetches it once (a failure is silent) and shows, in About and
small under "See what will be sent", a line such as "Build 15 Nov 2026, 11:13 (after change
#354, c1d5069)" in the viewer's local time; the report's `build` field is the same stamp.
On Railway `when` is the time the image was built (the Docker build has no `.git`).

## Review points

- Nothing hidden can leave through a report: the client builds it from what it displayed or
  sent, and the server's allow-list refuses anything else (`REPORT` in
  `packages/server/src/feedback.js`; the client test builds a report from a player's view and
  checks it).
- The endpoint cannot fill the disk (24 KB a request, 30 an hour an address, five files of 5 MB),
  inject into the issue tracker (fenced, as above), or act as a relay (it makes one fixed
  request to one configured repository).
- No new dependency; Node's `fetch` and the browser's `fetch`.
- What is sent is what was shown: the preview follows the page until Send, then the report
  is frozen, shown, and posted as that object (`sentAt` set once); the thank-you keeps it
  under "What was sent". Between the last look and the press, a line may have arrived.
- The answer to an action is matched to it by order: an update that arrives after an action
  with no refusal before it marks it `accepted`, so at a table another player's update can mark
  an action accepted a moment early. Good enough for reading a report; not a log.
- Names in log lines: the scrubber, above.

## What is not built

- A screen for the DM to read reports. They are read in `feedback.jsonl` on the server or as
  GitHub issues.
- Attachments and screenshots.
- Seeding the shown log from history on joining a table: lines a player was shown before
  the page loaded, or by a reconnect, are not in the report.
