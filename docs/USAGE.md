# Usage log

What Claude work on Hextable costs, so jobs can be sized against the owner's
limits. Claude cannot see usage: the owner pastes the usage page and the lead
records it here. The lead adds a row to "Jobs" when a job finishes and a row
to "Readings" whenever the owner gives one. Newest rows last.

Accounts: **Ultra** (lead, merges; named "Max" in older notes), **Pro**
(reviews and small jobs, tight budget), **Gemini** (second opinion, by issue).

## Readings (from the owner's usage page)

| When (Eastern) | Account | Weekly limit used | Fable share used | 5-hour session | Resets |
|---|---|---|---|---|---|
| Thu 12 Nov 2026, 1:26 PM | Pro | 54% | 45% of the 50% allowed | 62% (resets 3:50 PM) | Weekly: Wed 12:00 AM |

## What a job costs (measured 12 November, Pro account)

| Job | Model | Agent tokens | Time | Weekly limit (Pro) |
|---|---|---|---|---|
| Spell re-tier, 4 levels | Haiku | 140k | 4 min | under 1 point |
| Review of one PR | Sonnet | 113k | 2.5 min | about 1 point |
| One screen, with browser check | Sonnet | 190k | 14 min | 1 to 1.5 points |
| Engine job | Opus | 150k to 245k | 12 to 26 min | 1.5 to 3 points |

A point is one percent of the Pro weekly limit, the lead's turns included.
Agent work did not draw on the Fable meter; only the lead's own turns did.

## Jobs

Tokens and time are what the agent reported when it finished; "?" means not
yet known or not reported.

| Date | Account | Job | Issue / PR | Model | Agent tokens | Time | Outcome |
|---|---|---|---|---|---|---|---|
| 13 Nov | Ultra | Housekeeping: state version in tests, linter check | #131 / #133 | Haiku | 131k | 4.5 min | merged |
| 13 Nov | Ultra | Independent security read (report only) | #132 | Opus | 207k | 10 min | posted: 0 Critical, 1 High, 3 Medium, 6 Low; fixes queued as #136 |
| 13 Nov | Ultra | Reactions control on the sheet | #130 / #137 | Sonnet | 113k | 13 min | merged |
| 13 Nov | Ultra | Reactions, part 2 | #135 / #144 | Opus | 306k | 38 min | merged (state 15) |
| 13 Nov | Ultra | Fantasy Grounds character importer and party report | #142 / #145 | Sonnet | 298k | 20 min | merged |
| 13 Nov | Ultra | Stock maps | #141 / #147 | Sonnet | 256k | 54 min | merged |
| 13 Nov | Ultra | Server hardening (uploads, #7) | #143 / #148 | Opus | 169k | 58 min | merged |
| 13 Nov | Ultra | Renderer R2, floors module | #140 / #149 | Sonnet | 214k | 62 min | merged |
| 13 Nov | Ultra | Engine security fixes | #136 / #151 | Opus | 290k | 87 min | merged (state 16) |
| 13 Nov | Ultra | Reaction prompt screen, Fantasy Grounds import button | #146 / #152 | Sonnet | 219k | 71 min | merged |
| 13 Nov | Ultra | Cut-away walls, caves (R2 rest, R7) | #150 | Sonnet | ? | ? | running |
| 13 Nov | Ultra | Event timeline and pace (R3) | #153 | Sonnet | ? | ? | running |
| 13 Nov | Ultra | Class features 7 to 15, party's classes | #154 | Opus | ? | ? | running |

Times on the night of 13 November are long because up to six agents shared one machine; the same
jobs run alone took a quarter of the time on 12 November.
