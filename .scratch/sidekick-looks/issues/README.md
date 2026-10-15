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
| 11 | 08c Zap raises its arm with a pose | 08b | ready |
| 12 | 08d The sidekick can blink | 08c | ready |
| 13 | 09 Ambient motion with an off switch | 07, 08d | ready |
| 14 | 10 A multi-frame background cycles at rest | 09 | ready |
| 15 | 11 A character replaces a state animation | 07 | ready |
| 16 | 13 Animations wait until the pane is shown | 09 | ready |
| 17 | 12 README and vocabulary match the new system | 06, 10, 11, 13 | ready (last) |
| — | 08e A fuller raised arm | 08c | optional, needs the owner's decision |

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

## Open decisions

- Ticket 13: a once-only animation that arrives while the pane is hidden plays when the pane is next shown (the ticket says so); not yet confirmed by the owner.
