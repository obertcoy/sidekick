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

**Status:** ready-for-agent

- [x] The slowest tests are listed with their times before and after (quiet machine)
- [x] No test takes more than half the per-test limit on a quiet machine
- [x] Ten back-to-back runs pass while a second `claude plugin test .` runs alongside
- [x] If the limit is raised, it is raised in one place, with a comment saying why
- [x] Every test asserts what it asserted before (titles and expectations unchanged unless a title was wrong)
- [x] `tests/sprite-golden.ts` is unchanged
