# How the Hextable lead and the service lead work together

Status: draft, 14 November 2026, issue #254. Applies from the day the owner creates the service's
repository. Copy this file there unchanged; this copy in `imburk/hextable` is the one that is edited.

**Summary**

1. Two leads, each a separate AI conversation, run two projects: Hextable (the game) and the
   official service. They cannot see each other's chats. **GitHub is the only channel.**
2. The interface has **one home**: `docs/service/INTERFACE.md` in `imburk/hextable`. Every change
   is a pull request, and the **other** lead must review it before it is merged.
3. Requests across the line are issues labelled **`interface`**, opened in the repository of the
   side being asked, with a fixed template.
4. Every comment says who wrote it on its first line, because both leads may post from the same
   GitHub account.
5. Each lead checks for the other's requests at the start of every session and in every hourly
   check, with the queries below.
6. A disagreement goes to the owner after two rounds, as one question with a default on the
   asking project's decisions issue. Until he answers, the agreed version stands.
7. A job that needs both sides: the contract first, then each side against a fake of the other,
   then the real thing, then a joint check, then the status moves to `built`.
8. Neither lead edits, pushes to, merges in or assigns agents in the other's repository, except
   for pull requests that touch only the interface file.
9. The first agenda is five points: I1 keys, I3 sign-in, I5 the table server's credential, I6 the
   fingerprint check, I15 anonymous statistics.
10. Anything only the owner can do (keys, credentials, the name, the law) is asked of him, never
    done for him.

## Who is who

| | Hextable lead | Service lead |
|---|---|---|
| Repository | `imburk/hextable` (public) | the service's repository (name: FOUNDING Q12; working name `imburk/hextable-service`) |
| Private notes | `imburk/hextable-ops` | its own private ops repository (FOUNDING section 8) |
| Decisions issue | #193 "Owner decisions" | its own pinned "Owner decisions" issue |
| Owns | the game, the table server, the character file, `lineage.js`, the interface file's home | the service, monikers, records, figures, the lobby, statistics |
| Merges | everything in `imburk/hextable`, including interface pull requests | everything in the service's repository |

The owner, Isaac, decides between them. Both leads report to him in their own decisions issues.

## Signing every comment

Both leads may act through the owner's GitHub account, so GitHub's author line does not tell them
apart. The first line of every issue, comment and pull request body written by a lead is one of:

```
**Hextable lead:**
**Service lead:**
```

An agent working for a lead writes `**Agent for the Hextable lead (issue #N):**` or the same for
the service lead. A review that GitHub cannot record as an approval (an account cannot approve its
own pull request) is a comment whose first two lines are the signature and one of:

```
Interface review: agreed
Interface review: changes wanted
Interface review: question
```

## The interface file

- **One home:** `docs/service/INTERFACE.md` in `imburk/hextable`, with its example messages in
  `docs/service/examples/` once the first point is agreed. The service repository keeps only a
  one-line `docs/INTERFACE.md` that links to it. **Recommendation:** the home is the game's
  repository because it exists now, it is public, and the game's table server must document the
  protocol it speaks anyway. Alternative: the service's repository, once it exists; then this file
  and the review rule move with it, and the game keeps the pointer.
- **Every change is a pull request** that touches only `docs/service/INTERFACE.md` and
  `docs/service/examples/`, titled `Interface: <points>: <what changes>`, labelled `interface`.
- **Who may open it:** either lead (or an agent for either). The service lead may open pull
  requests in `imburk/hextable` for these files only.
- **Who must review:** the lead who did **not** open it, with an `Interface review: agreed`
  comment. No interface pull request is merged without that comment from the other side.
- **Who merges:** the Hextable lead, as for everything in `imburk/hextable`, after the review. If
  the Hextable lead opened it, it waits for the service lead's review.
- **Status of a point:**
  - `proposed` → `agreed`: in a pull request reviewed as above. The pull request adds or updates
    the point's examples.
  - `agreed` → `built`: in a pull request that links the merged pull request on each side and the
    joint check (below). Reviewed the same way.
  - A built point that must change goes back to `proposed` with a new version number, while the
    built one stays in force.
- **The change list** at the end of the interface file gets one line per merged change.

## Asking the other side for something

Open an issue **in the other side's repository**, labelled `interface` (create the label in both
repositories on the first day), titled `Interface request: <point or new>: <one line>`. The body:

```
**Hextable lead:**            (or **Service lead:**)

What is asked: one or two sentences.
Why: the job or phase that needs it, with a link.
By when: the date or the job it blocks; "no hurry" is allowed.
Points: I-numbers touched, or "new point".
Proposed fields: the request and the answer, field by field, with limits.
If the other side is absent or refuses: what our side does.
Meanwhile: what our side will do until this is agreed (usually: build against a fake, behind a switch).
Decision needed from the owner: none, or the question with a default.
```

The asked lead answers on the issue: accepted (and opens or reviews the interface pull request),
changes wanted (with fields), or refused (with a reason and an alternative). Answers are expected
in the asked lead's next session; if that is not possible, the lead says when.

The asking lead closes the issue when the interface pull request is merged, or when it withdraws
the request. The asked lead never closes it.

## How each lead learns that the other has asked

Neither lead gets notifications. Each looks, **at the start of every session and in every hourly
check**, and writes the time it last looked in its own hand-over note.

The Hextable lead:

```
gh api 'repos/imburk/hextable/issues?labels=interface&state=open&sort=updated'
gh api 'repos/imburk/hextable/issues/comments?since=<last look, ISO time>' --jq '.[] | select(.body | startswith("**Service lead"))'
gh api 'repos/imburk/<service repo>/issues?labels=interface&state=all&since=<last look>'
gh api 'repos/imburk/<service repo>/issues/<decisions issue>/comments?since=<last look>'
```

The service lead:

```
gh api 'repos/imburk/<service repo>/issues?labels=interface&state=open&sort=updated'
gh api 'repos/imburk/<service repo>/issues/comments?since=<last look>' --jq '.[] | select(.body | startswith("**Hextable lead"))'
gh api 'repos/imburk/hextable/issues?labels=interface&state=all&since=<last look>'
gh api 'repos/imburk/hextable/issues/193/comments?since=<last look>'
gh api 'repos/imburk/hextable/commits?path=docs/service&since=<last look>'
```

(The issues list includes pull requests, so open interface pull requests are found by the same
query.) What a lead finds goes in its hand-over note's "In flight" list until it is answered.

## When the leads disagree

1. Each states its position on the request issue or the pull request, once, with reasons.
2. One more round each. If they still disagree, **the lead that asked** posts the question on its
   own project's decisions issue (#193 for the Hextable lead), marked `[interface]`, in this form:

   ```
   [interface] I<n>: <the question in one line>
   Hextable lead: <position, three lines at most>
   Service lead: <position, three lines at most>
   Default until answered: the agreed version stands; the proposal waits; both sides build against
   the agreed version (or, for a new point, against a fake behind a switch).
   ```

   and links it from the request issue. The other lead adds nothing there but a correction of its
   own position, if needed.
3. The owner answers there. The lead that asked strikes the line and carries the answer into the
   interface pull request.

Things that are not the leads' to settle go straight to the owner, in the same form: anything in
FOUNDING section 12, anything that changes a decision of his, the law, money, the name, keys.

## A job that needs both sides

Done in this order, each step a pull request on one side only:

| Step | Who | What | Done when |
|---|---|---|---|
| 1. Contract | the lead that needs it, reviewed by the other | The point to `agreed`, with examples: a valid request and answer, each refusal, the absent case | Merged in `imburk/hextable` |
| 2. Fake of the other side | each side, in parallel | Game: a fake service in `packages/server/test/` that answers from the examples. Service: a fake table server that sends the examples, and tests that its answers match them | Both merged, tests green |
| 3. The real thing | the service first, then the game | The service deploys it behind `features` (I1); the game builds its side behind the same feature name, off when the service does not list it | Both merged; the game still plays with the service absent |
| 4. Joint check | the Hextable lead's agent | A table server pointed at the service's staging address runs the examples for real, and the absent case with the service stopped | The output is linked on the status pull request |
| 5. Status | either lead, reviewed by the other | The point to `built` | Merged |

The service deploys before the game uses a point, so neither side ever waits on the other's
deploy. A point is not switched on in production until step 4 has passed.

## What each lead must not do in the other's repository

- Push to any branch, merge, revert, or close an issue or pull request it did not open.
- Edit any file other than `docs/service/INTERFACE.md` and `docs/service/examples/` (and that only
  through a pull request), or edit the other's comments.
- Give work to agents in the other's repository, or start agents with the other's brief.
- Change labels other than adding `interface`, settings, deployments, secrets or workflows.
- Read, edit or write the other's private ops repository. What the other needs to know goes in an
  issue.
- Post secrets anywhere: private keys, credentials, recovery codes, tokens. Public keys may be
  posted; the owner registers the table server's credential himself.
- Decide for the owner: keys, credentials, the root key ceremony, the name, the licence and the law
  are his.

## The first agenda

The five points to settle first, in order, because phase 0 and phase 1 need them and every later
point builds on them:

| # | Point | What must be settled | Asked of |
|---|---|---|---|
| 1 | **I1** keys and status | The key list's shape; where the root public key lives in the game (a data file in `packages/rules/src`); how long the game caches it; the wording when nothing can be checked | Service defines; game reviews |
| 2 | **I5** the table server's credential | The signing of requests (headers, what is signed, clock skew, nonces); where the key lives on the table server; how the owner registers it | Service defines; game reviews |
| 3 | **I3** signing in to a table | The nonce message, the assertion, the return to the game on a phone (redirect, not a pop-up), the page's `connect-src`; what the table shows of a moniker | Both: service the assertion, game the messages |
| 4 | **I15** anonymous statistics | The exact report; the buckets; whose switch decides (FOUNDING Q16); the screen that shows the report before it is sent; the minimum cell size for publishing | Both: jointly owned |
| 5 | **I6** the fingerprint check | The chain summary sent (hashes only), the verdicts, the holder check, and that the hashes are those of `lineage.js` (portable-characters P1), whose test vectors both sides use | Service the verdicts; game the hashes |

Before the first item, the Hextable lead posts one `interface` issue in the service's repository
pointing at this agenda, and the service lead answers it with the order it will take them in.
