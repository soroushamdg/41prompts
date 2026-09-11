# EPIC-014 session log

**Date.** 2026-09-10.

**Prompt sent.** Same autonomy as previous epics: commit the advisor's
`docs/epics/EPIC-014-capture.md` as-is, mirror into `CURRENT.md`, mark it current, plan into
`docs/epics/plan-EPIC-014.md`, implement, self-review, push, PR, squash-merge on green. Plus four
specific instructions:

- **One batched checklist** for the Turnstile keys and the IP salt.
- **The flaky perf gate is in scope, deliberately**: fix the measurement or demote it to a reported
  number, say which and why, and *do not widen the bar*.
- **EPIC-017 is a paper dependency that does not exist**: if retention copy needs a privacy policy to
  point at, write it to stand alone and note it rather than blocking.
- Finish with report, session log, backlog, staging screenshots of share/open/remove/waitlist, and
  `CURRENT.md` pointing at EPIC-014.

Preceded by two notes on the previous turn: that the list-marker premise had been mine and wrong and
that checking before acting was right, and that the CRLF note belonged in the roadmap rather than in a
file two people were editing.

**Plan summary.** `docs/epics/plan-EPIC-014.md`, written with the perf decision already settled by
measurement rather than deferred into the build.

**Decisions made and why.**

- **The perf gate: measurement fixed, no bar moved.** It would not fail on a quiet machine (12 trials,
  1.16–1.30 against a 1.6 bar), so I reproduced CI's *condition* rather than its workload — all 8
  cores saturated with busy loops. The five-run estimator then exceeded the bar in 4 of 15 trials,
  peaking at 1.968; at thirty runs it never did, and the spread collapsed from 0.432–1.968 to
  1.149–1.371. Kept rather than demoted because the gate guards quadratic tag matching, which this
  codebase had, and the absolute timing gates cannot see its return (quadratic at 100 KB is ~57 ms,
  inside the 100 ms bar). **CI confirms it: the gate that read 1.74 now reads 1.11.**
- **The tag-matching gate was the next flake and nobody had noticed**, because it had not yet crossed
  its bar. It subtracts two exponents measured in separate windows; the excess swung −0.26 to +0.31
  against a 0.5 bar across three full-suite runs. Round-robin in one window: −0.08 to +0.13.
- **Run count should scale with run duration, not be uniform.** A 10 ms steal is a 280% error on
  `segment`'s 3.6 ms input and 33% on `detect`'s 30 ms one. Thirty runs made `detect` blow vitest's 5 s
  default, so the coarse gates take ten and the timeouts were raised — a timeout is harness plumbing,
  not a bar.
- **A rate limit the test suite proved wrong, where the fix was the product.** 30 decompiles/hour
  failed two consecutive local runs and would have failed CI. The tempting move was to special-case
  tests; the honest question was who pastes more than thirty prompts in an hour, and the answer is the
  ICP evaluating seriously. A decompile is local CPU with no provider call and no row written. Raised
  to 120.
- **`sessions.ip_address` exists and the report says so.** The criterion's literal grep finds it —
  Better Auth's, from EPIC-002, for signed-in sessions only and unreachable from this route. Saying
  where it is beats pretending it is not there, so a test states the precise claim instead.
- **Turnstile fails open** when Cloudflare is unreachable, and **a missing IP salt degrades** to a
  per-process value with a loud warning. Both are deliberate trades written down at the code: the
  alternatives were turning someone else's outage into ours, and turning an unset env variable into an
  outage on a public page.
- **The abuse check has a test asserting it is not a content filter.** That rule dies quietly —
  somebody adds a word to a list because one paste looked bad — so prompts that are rude, political,
  commercial, fictional or about self-harm are pinned as passing.

**What took longer than expected / went wrong and was caught.**

- **I wrote a raw NUL byte into a source file, and then into the commit message describing the fix,
  twice.** Three independent machine checks caught it — `pnpm binary-files` in CI, the tool's own
  control-character validation, and git refusing a NUL in a log message. My own reading caught it zero
  times across two full reads of the file, because a NUL renders as nothing. This is precisely the
  `cluster.ts` failure the guard in #22 was built for, and it is the strongest argument yet for machine
  checks over attention: the separator was a *correct* design choice, so the fix was to write it as an
  escape rather than to remove it.
- **The database was available the whole time and I had been routing around it.** Earlier sessions
  reported the worker and auth suites as "pre-existing failures needing Postgres"; they did need
  Postgres, and `docker start 41p-dev-postgres` plus `pnpm db:migrate` was all it took. Correcting that
  made the whole 8-package suite runnable locally, which is what caught the rate-limit problem before
  CI did.
- **A race in my own test**, reading an error element's count immediately after a click and therefore
  before the server action had resolved — always zero, so the success assertion then failed on a page
  that was merely still working. It waits for either outcome now.
- **The perf work was the largest single piece**, and most of it was measurement rather than code:
  reproducing a failure that does not occur on the machine doing the reproducing took three separate
  experiments before the contention model was right.

**Verification tail.**

```
packages/core   Tests  370 passed
packages/db     Tests   27 passed
apps/web        Tests   90 passed
apps/worker     Tests   57 passed
playwright      17 passed (capture-share) + 31 passed (decompile)

CI run 1: tag-matching excess -0.11 | segment 1.11 | cluster 1.11 | detect 1.32
          (the segment gate read 1.74 on the run that prompted this work)

Congratulations! Your project is compliant with version 3.3 of the REUSE Specification :-)
✔ no dependency violations found
No tracked source file under packages, apps is binary
[mirror-dry-run] OK -- the public-only tree installs and tests standalone
```

**Open questions.** Three, at the end of `docs/epics/reports/EPIC-014-report.md`: the rate limiter is
in-memory and per process so a second container doubles every limit; `x-forwarded-for` is
client-controllable so a determined caller can rotate their apparent address; and the abuse check's
shape list needs live data rather than imagination to grow, which EPIC-084 could supply if it reports
refusal counts by reason.

**For the next session.** Stage 1 has EPIC-017 (legal minimum — and this epic has left it a precise,
small job: a privacy policy and a link, with no copy needing to be rewritten), EPIC-016 (landing page)
and EPIC-015 (soft ship, which starts M1's 30-day clock). The checklist in `infra/README.md` wants
doing before EPIC-015 announces anything, particularly the Turnstile keys.
