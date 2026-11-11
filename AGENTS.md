# Working on Hextable as a coding agent

This file is for any AI coding agent (Claude, Gemini, Grok or another).
Project rules live in [CLAUDE.md](CLAUDE.md); read it first, whichever agent
you are. Architecture is in [docs/DESIGN.md](docs/DESIGN.md) and agreed
designs are in [docs/specs](docs/specs).

## How work is handed out

1. Work comes from GitHub issues. Take one issue. Do only what it asks.
2. Each issue lists the files it may touch. If the task seems to need a file
   outside that list, stop and say so in the issue instead of editing it.
3. One branch and one pull request per issue. Name the branch after the issue,
   for example `12-rate-limiting`.
4. Before opening the pull request, run `npm test` and `npm run build`. Both
   must pass. New behaviour needs a new test.
5. In the pull request, say what you changed, how you checked it, and what
   you did not check. Do not merge your own pull request.

## Hard limits

- **No new dependencies, no bundler, no framework.** The project runs on
  Node's standard library and plain browser JavaScript on purpose.
- **Do not edit `packages/rules/src/engine.js` or `packages/server/src/tables.js`
  unless the issue names them.** Most parallel work collides there, and
  mistakes there are rule or security bugs.
- **Only SRD 5.2.1 content.** Nothing from other D&D books, and no invented
  stats presented as SRD.
- **Never trust the client.** Anything a browser sends is checked on the
  server through `apply()`.
- **Phones count.** Any UI change is checked at a phone-sized screen with
  touch, as well as on desktop.
- **No secrets in the repo.** There are none today; keep it that way.

## Running it

```
npm test     # rules and server tests, Node 22+
npm start    # build, then serve at http://localhost:8080 with multiplayer
```

Open two browser windows on that address to try a DM and a player together.
