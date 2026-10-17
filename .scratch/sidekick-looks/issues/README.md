# sidekick-looks tickets: order and status

Work the tickets top to bottom. Each ticket file holds its own `Blocked by`, `Status` and acceptance checkboxes; this list is the agreed order. Spec: `../spec.md`. Pose plan: `../pose-engine-plan.md`. State machine research: `../research/state-machine.md`.

| Order | Ticket | Blocked by | Status |
|---|---|---|---|
| 1 | 01 The look is resolved, not a constant | — | done |
| 2 | 02 Pick a global look with a command | 01 | done |
| 3 | 03 A project has its own parts | 02 | done |
| 4 | 04 A look that cannot be drawn does not break the pane | 02 | done |
| 5 | 05 Face and neck slots | 02 | done |
| 6 | 06 Held slot, hidden while the paws are busy | 05 | done |
| 7 | 07 The sidekick looks around during a search and shrugs when it fails | 01 | done |
| 8 | 08 The sidekick cheers when the set is done | 07 | done |
| 9 | 08b Refactor: parts declare what they need, activity is a state machine | 08 | done |
| 9a | 15 Lint and format with Biome (do first; the owner asked for it before other work) | — | done |
| 10 | 14 The type check is clean (independent; can also run alongside 08c) | — | done |
| 10b | 16 CI checks lint, types and tests | 14, 15 | in progress (owner: red-run proof, branch protection) |
| 11 | 08c Zap raises its arm with a pose | 08b | done |
| 12 | 08d The sidekick can blink | 08c | done (by-eye check of the classic blink pending) |
| 13 | 09 Ambient motion with an off switch | 07, 08d | done |
| 14 | 10 A multi-frame background cycles at rest | 09 | folded into 21 |
| 15 | 11 A character replaces a state animation | 07 | done |
| 16 | 13 Animations wait until the pane is shown | 09 | done |
| 17 | 18 Moments and movesets, with plain defaults | 13 | done |
| 18 | 19 The stage fits the character, and a camera follows it | 18 | done (owner review of golden frames pending) |
| 19 | 20 The body moves and can change colour | 19 | ready |
| 20 | 21 Layers and an effects library (absorbs 10) | 20 | ready |
| 21 | 22 The sidekick has a place and can walk | 21 | ready |
| 22 | 23 The classic animations move onto the new engine | 22 | ready (golden re-record needs the owner) |
| 23 | 24 The classic gets the storm, the jump and the power-up | 23 | ready |
| 24 | 12 README and vocabulary match the new system | 06, 11, 13, 24 | ready (last) |
| — | 08e A fuller raised arm | 08c | optional, needs the owner's decision |
| — | 17 Tests pass on a busy machine (independent; can run alongside any ticket) | — | done |

## Checks

Run from the repo root before a commit. The tests and Biome must pass. The type check must show zero errors.

```
npx -y @biomejs/biome@2.5.15 ci .
claude plugin test .
npx -y -p typescript@5.9.3 tsc --noEmit -p .
```

CI (`.github/workflows/check.yml`) runs the first two. Types are checked locally only: the mod API types in `.claude-plugin/types` are written by a logged-in Claude Code session and are gitignored, so a fresh clone cannot type-check.

Enable the pre-commit hook once per clone (Biome on staged files, then the type check):

```
git config core.hooksPath .githooks
```

## Decisions on record

- A failed search shrugs every time, including the 20 s refresh retries (ticket 07).
- Closed sets are `as const` lists with derived types, not TypeScript `enum` (08b).
- The activity is a hand-written state machine (pure transition plus a thin shell), not XState (08b).
- No breathing idle loop: at rest the sidekick stands still apart from ambient motion (`PRODUCT.md`).
- Poses are added only together with the animation that first uses them; the `timeline` helper waits for the first animation that holds a frame.

- Ticket 13: while the pane is hidden, the ticket-done zap (with its strike) and the set-done cheer wait and play when the pane is next shown; ambient motion and the shrug are dropped (owner, 2026-10-16 and 2026-10-17).
- The engine is rebuilt for richer motion (tickets 18–24), after the owner chose variant C of the motion prototype (`../../sidekick/prototypes.html#motion`, 2026-10-17): character size is dynamic, the stage fits the character, and on a narrow pane the camera centres on the character.
- Animations are separate from when they play: moments (detectable events), a library of animations, and a moveset per character, with a plain default for every moment so a character never plays one that does not suit it (18).

## Open decisions

- Where the power-up plays. Placeholder: the classic plays it for "last ticket started" (24).
- `tests/sprite-golden.ts` is re-recorded in 19 and 23, only with the owner's approval of the new frames.
