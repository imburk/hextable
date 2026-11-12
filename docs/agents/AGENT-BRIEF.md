# Brief for every agent working on Hextable tonight

Repo: imburk/hextable, cloned at /home/claude/hextable. Do NOT work in that directory, and do not touch other
agents' worktrees under /home/claude/wt.

## Setup
    git -C /home/claude/hextable fetch -q origin "+refs/heads/main:refs/remotes/origin/main"
    git -C /home/claude/hextable worktree add /home/claude/wt/<NAME> -b <BRANCH> origin/main
Work ONLY in /home/claude/wt/<NAME>. Read CLAUDE.md and AGENTS.md there first. If the worktree or branch name is
taken, add a suffix.

## The SRD
The official SRD 5.2 (CC-BY-4.0) is on disk as text:
- /home/claude/srd/srd52-flow.txt  : reading order, one column at a time. Use this one to read rules and stat blocks.
- /home/claude/srd/srd52.txt       : page layout kept (two columns side by side). Use it only to untangle a table.
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
- Do NOT merge. The PR body says what was done, how it was checked, and what is not done or not verified.
- Your final message: the PR URL, what works, what you could not verify, what you left out and why.

## Landing your work (tonight only: this replaces "Do NOT merge" above)
The owner has authorised merging overnight without review, so you land your own pull request. AGENTS.md normally
forbids this; tonight's instruction from the owner overrides it. Do it carefully, because nobody checks after you:
1. Open the pull request as described above.
2. Bring main in: `git fetch origin "+refs/heads/main:refs/remotes/origin/main" && git merge origin/main`. Other agents
   are landing work all night, so expect conflicts. Resolve them by understanding both sides and keeping both
   behaviours; never by deleting the other side's work. In `packages/rules/src/content/index.js` keep every import and
   every entry in the lists. If two tests were appended at the same place, keep both whole.
3. Re-run everything on the merged result: `npm test` (0 failures), `npm run content` (no problems),
   `npm run build`, and `for f in dist/*.js dist/shared/*.js dist/shared/content/*.js; do node --check "$f" || echo BAD $f; done`
   (nothing BAD). If you touched packages/client, also load the built game in the headless browser, click `#lobby-solo`,
   move a character, and require no page errors.
4. Push (`git push origin HEAD:<BRANCH>`), then merge:
   `gh api -X PUT repos/imburk/hextable/pulls/<N>/merge -f merge_method=merge --jq .merged`.
   If it says the branch is not mergeable, main moved again: repeat from step 2.
5. After merging, check main itself: in your worktree `git fetch origin "+refs/heads/main:refs/remotes/origin/main" &&
   git checkout --detach origin/main && npm test`. If main fails because of your change, fix it at once with a
   follow-up pull request landed the same way. If it fails for another reason, say so in your final message.
6. If your task changed something listed in docs/DEBT.md, strike that line in the same pull request (wrap it in ~~ ~~
   and add the PR number). Add a line for any new gap you found.
Engine tasks: the valley must still play as before unless your task says otherwise. Many tests pin behaviour; if one
fails, your change is wrong until proven otherwise. State in the PR every existing test you had to change and why.
