# Handoff: sidekick-looks, continue from tickets 10 and 13

Written 2026-10-16. Supersedes the temp-folder handoffs. Order, status and decisions live in `issues/README.md`; read it first.

## Done since 2026-10-15 (all pushed, `main` at 40530d2 or later)

- **08c** poses (`armUp`), with a runtime guard that a frame only asks for declared poses.
- **11** a character may replace a state animation (`Character.animations`). Owner decisions: a "ticket done" replacement needs at least `BURNS + 2` (7) frames so the flash and strike-through show; box 8 is covered at the pure level (the harness cannot load a test-only character into the running mod).
- **08d** blink pose and once-only `blink` animation. Owner decision: an explicit `AMBIENT = ['blink'] as const` list in `hooks/sprite/registry.ts`; `requirePlayed` checks a character against its state animations (via the lookup) plus the ambient ones only, so a character that replaces `zap` is not checked against `zap`.
- **17** tests pass on a busy machine: every test file imports `test` from `tests/world.ts`, which sets a 30 s limit (harness default 5 s). Root cause: the harness starts every test file at once; per-test work is 0.1–0.7 s alone.
- `biome.json` ignores `.claude/worktrees` (`!!`), so agent worktrees do not break `biome ci .`.

- **09** ambient motion: four ambient animations (blink, tailFlick, earFlick, cheekSpark; new poses `tailUp`, `earsUp`), scheduled by the activity state machine (phases `between` and `ambient`, a 5–15 s gap drawn in the shell), each character lists its own (`Character.ambient`), `/sidekick-motion [off|on]` with the global store key `motion` (on by default). The command name and key were the builder's choice by analogy with the look command; the owner has not confirmed them.

## Next

- **10** (multi-frame background) and **13** (pane shown) are both unblocked by 09 and can run in parallel; 13 needs the open decision below first. Then **12** last.
- Known pre-existing issue (no ticket yet): after a look change the resting picture keeps the old character until the next state.

## Open decisions (ask the owner)

- **Ticket 13 (rewrite pending):** owner said animations play only while the pane is shown (shown is enough; keyboard focus not needed). While hidden: ambient and the shrug are dropped; the **ticket-done zap with its strike waits** and plays when the pane is shown. Still open: does the **set-done cheer** wait too, or is it dropped? Then rewrite ticket 13's boxes 3–6 accordingly.
- **By-eye check (08d box 6):** the classic's blink, tail flick and ear flick are one pixel each and may read weakly. 09 now plays them on its own; check them in the running app (`run` skill). Owner has not confirmed when.
- **08e / 08f / 08g** optional tickets: not decided.

## How the owner wants it run

- Sonnet builds (`general-purpose`, `model: sonnet`, background); `code-reviewer-haiku` reviews. Run independent tickets in parallel; give the second one `isolation: worktree` and cherry-pick it after.
- Main session verifies: tests 2–3 runs, `npx -y -p typescript@5.9.3 tsc --noEmit -p .` = 0 errors, `npx -y @biomejs/biome@2.5.15 ci .`, `git diff --quiet -- tests/sprite-golden.ts`, no strays. One commit per ticket; ask before pushing.
- Show research or design choices to the owner before acting on them.
- Implementer brief must repeat: Edit/Write only (no heredocs, `sed -i`, perl, python), never edit `tests/sprite-golden.ts`, no `--no-verify`, `as const` lists not `enum`, explicit state machine, red-first tests, no fake events, bobbed frames + all four accessories, test-only characters are pure-level only.
- Load is often high on the original machine (a VM); timeouts there are load, not bugs.
