# Brief for every agent working on Hextable

Repo: imburk/hextable, cloned at /home/claude/hextable. Do NOT work in that directory, and do not touch other
agents' worktrees under /home/claude/wt.

## Setup
    git -C /home/claude/hextable fetch -q origin "+refs/heads/main:refs/remotes/origin/main"
    git -C /home/claude/hextable worktree add /home/claude/wt/<NAME> -b <BRANCH> origin/main
Work ONLY in /home/claude/wt/<NAME>. Read CLAUDE.md and AGENTS.md there first. If the worktree or branch name is
taken, add a suffix.

## The SRD
The official SRD 5.2 (CC-BY-4.0) is in the repo as text (paths from the root of your worktree):
- reference/srd52/srd52-flow.txt  : reading order, one column at a time. Use this one to read rules and stat blocks.
- reference/srd52/srd52.txt       : page layout kept (two columns side by side). Use it only to untangle a table.
Search them with grep -n and read around the hits. This is the ONLY source for rules content: do not use the web or
memory for numbers. Set `checked: true` on an entry only after comparing every field with this text. Never invent a
number. `text` fields are short descriptions in your own words, not copies of SRD paragraphs. Only SRD content goes in
the repo. The pack's `source` strings say "SRD 5.2.1"; keep whatever string the neighbouring entries use.

## Rules of the repo that matter most
- The content vocabulary is closed (packages/rules/src/content/schema.js). Unless your task says otherwise, do not edit
  schema.js, engine.js, view.js or any other engine file. What the vocabulary cannot say becomes a `manual` step with
  text for the DM, and the entry's tier is set honestly (auto / assist / manual).
- No new dependencies, no bundler, plain ES modules. Network installs do not work.
- Do not weaken or delete existing tests.

## Checking your work
- `npm test` must pass. `npm run content` must report no problems. `npm run build` must succeed, and every file in dist
  must pass `node --check`.
- UI work: start your own server on the port your task names (`PORT=<port> node packages/server/src/index.js &`), check
  in a headless browser at 1280x800 and 390x844 (global playwright via
  `createRequire(execSync('npm root -g').toString().trim() + '/')`; chromium args
  ["--use-gl=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"]; click `#lobby-solo`;
  `window.hextable` exposes `act`, `state`, `R`), look at screenshots, and require no page errors.
  Stop ONLY your own server: `kill <its pid>`. Never use pkill: other agents have servers running.

## Delivering
- Commit with `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`.
- Push with `git push origin HEAD:<BRANCH>` and open the pull request with
  `gh api repos/imburk/hextable/pulls -f title=... -f head=<BRANCH> -f base=main -f body=...` (`gh pr create` does not work).
- Do NOT merge. The lead conversation merges after its own check. The PR body says what was done, how it was
  checked, and what is not done or not verified.
- Your final message: the PR URL, what works, what you could not verify, what you left out and why.

## Before you open the pull request
1. Bring main in: `git fetch --depth=80 origin main && git merge FETCH_HEAD`. Resolve conflicts by understanding both
   sides and keeping both behaviours; never by deleting the other side's work. In
   `packages/rules/src/content/index.js` keep every import and every entry in the lists. If two tests were appended at
   the same place, keep both whole.
2. Re-run everything on the merged result: `npm test` (0 failures), `npm run content` (no problems),
   `npm run build`, and `for f in dist/*.js dist/shared/*.js dist/shared/content/*.js; do node --check "$f" || echo BAD $f; done`
   (nothing BAD). If you touched packages/client, also run the smoke passes that cover your change, one at a time
   (`SMOKE_ONLY=<name> npm run smoke`; the names are the registry at the top of `scripts/smoke.mjs`, one file per pass in
   `scripts/smoke/`; an unknown name exits 1).
3. If your task changed something listed in docs/DEBT.md, strike that line in the same pull request (wrap it in ~~ ~~
   and add the PR number). Add a line for any new gap you found.
4. If your task changes the state shape, bump the state version with a migration and say so in the PR.
Engine tasks: the valley must still play as before unless your task says otherwise. Many tests pin behaviour; if one
fails, your change is wrong until proven otherwise. State in the PR every existing test you had to change and why.
