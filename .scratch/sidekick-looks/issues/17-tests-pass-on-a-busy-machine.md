# 17: Tests pass on a busy machine

**What to build:** `claude plugin test .` fails now and then with `Error: timed out after 5000 ms`, a different set of tests each time, and passes on a rerun. Many whole-mod tests take 3–5 s on a quiet machine, so any extra load (another agent's test run, a VM) pushes some past the harness's 5 s limit. Seen on 2026-10-15/16 with load averages of 26–88: runs with 1, 2, 3, 6, 9, 17 and 18 timeouts across `activity`, `look`, `pane`, `pick`, `strike`, `summary`, `tickets` and `deep-search` tests, for example:

```
(fail) the sidekick looks around from the start of a search until it ends, and stands still after [5561.34ms]
  Error: timed out after 5000 ms
(fail) Claude reading or editing a ticket in a set picks it, but a Write of a new ticket picks none [5413ms]
```

A run under load can also show follow-on noise from a timed-out test, such as `a rejection nothing handled: no implementation for command.run` or `$.ui.log refused: no hooks module of that name is loaded`.

Find where the time goes and make the suite pass on a busy machine: first make the slow tests faster (fewer mod restarts, shared setup, less real waiting, mock clock where real time is spent); then, only if needed, raise the per-test limit through whatever the harness offers (look it up in the `plugin-authoring` skill and the mod API types; do not guess a flag). No test may lose what it asserts.

**Blocked by:** —

**Status:** done

- [x] The slowest tests are listed with their times before and after (see Result; the machine was never quiet, load average about 20 to 22 from an outside VM, so these are the best available "quiet" numbers)
- [x] No test takes more than half the per-test limit on a quiet machine (holds against the new 30 s limit only: slowest 2.5 s at load about 22; at load 60 to 70 a test took up to 19 s)
- [x] Ten back-to-back runs pass while a second `claude plugin test .` runs alongside
- [x] If the limit is raised, it is raised in one place, with a comment saying why
- [x] Every test asserts what it asserted before (titles and expectations unchanged unless a title was wrong)
- [x] `tests/sprite-golden.ts` is unchanged

## Result

The root cause is that the harness starts all 13 test files at once on a loaded 8-core machine; each test's own work is only about 0.1 to 0.7 s when run alone, so the fix is the raised limit (30 s, set once in `tests/world.ts`, used by every test file) plus the `framesOf` cache in `tests/activity.test.ts`, which is only a small gain.

Slowest tests, full suite, load average at the start of each run:

| Rank | Before, limit 5 s (load 24.4) | After, limit 30 s (load 22.5) |
|---|---|---|
| 1 | 2299 ms: a recipe that points outside the project is refused | 2506 ms: a reply that is not valid for a summary keeps the stored summary |
| 2 | 2053 ms: a rescan that finds nothing in a project that never had a recipe | 2450 ms: a subagent's turn makes no model call |
| 3 | 1954 ms: json files in sibling projects do not use up the cap | 2432 ms: a touch during the first turn counts before the picker would hide |
| 4 | 1849 ms: `/sidekick-pick` with a number or a name | 2378 ms: a ticket that finishes during a shrug is struck after it |
| 5 | 1833 ms: a background shows only where every layer above it is transparent | 2342 ms: tickets that finish together are struck together |

Whole run: before 215 pass in 20.9 s, after 215 pass in 32.2 s (the machine was busier for the second run, so the columns are not a like-for-like comparison).

Ten runs, each with a second `claude plugin test .` alongside (also 0 failures every time), on Claude Code 2.1.301:

| Run | Load at start | Result | Wall time |
|---|---|---|---|
| 1 | 21.8 | 215 pass, 0 fail | 39.9 s |
| 2 | 40.0 | 215 pass, 0 fail | 36.1 s |
| 3 | 46.5 | 215 pass, 0 fail | 32.7 s |
| 4 | 63.9 | 215 pass, 0 fail | 31.0 s |
| 5 | 66.4 | 215 pass, 0 fail | 28.6 s |
| 6 | 66.7 | 215 pass, 0 fail | 39.6 s |
| 7 | 71.4 | 215 pass, 0 fail | 29.8 s |
| 8 | 72.2 | 215 pass, 0 fail | 24.2 s |
| 9 | 73.5 | 215 pass, 0 fail | 28.7 s |
| 10 | 72.5 | 215 pass, 0 fail | 36.2 s |

The slowest single tests in those runs were 5394 ms, 5089 ms and 4274 ms, so at the old 5 s limit they would have timed out. Three more runs after the review fixes (all test files on the wrapper), loads 29.6, 45.2 and 64.3, also passed 215 of 215 in 37.8 s, 110.3 s and 69.4 s; the slowest test in them was 19.3 s, which is more than half of the 30 s limit but within it.
