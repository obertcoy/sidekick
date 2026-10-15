# Plan: poses for the sidekick sprite engine

Status: plan only, nothing implemented. Builds on the uncommitted work in the tree (cheer, strike, activity).

## Why

The animations look thin because the engine can only do two things to a frame: shift the head region down (`bob`) and paint dots on top (`dots`). The body is one static grid, so there is no blink, no raised arm, no squash, no tail or ear motion. Zap fakes its raised arm with three dots painted over the body (`hooks/sprite/animations/zap.ts:28`). Idle is a single still frame.

The fix is to let an animation ask for a **pose**: a named change to the body that each character draws for itself. Animations still read only anchors and pose names, never pixels, so they stay shared across characters.

## Findings that shape the plan

1. **A looping idle contradicts the product.** `PRODUCT.md:38` says the sidekick has small ambient motion a few seconds apart, with an off switch, and otherwise stands still. Ticket 09 (`issues/09-ambient-motion-with-an-off-switch.md`) plans blink and other once-only ambient animations 5–15 s apart. Tests enforce that nothing runs at rest (`tests/activity.test.ts:379-381`, `:143-145`, `:166-167`, `:186`; `hooks/activity.ts:117`). So `idle` stays one still frame; the blink is a pose plus a once-only `blink` animation that ticket 09 schedules. A breathing idle is left as an optional step that needs a product decision.
2. **Per-frame durations would break the strike.** The strike is paced in steps (`hooks/strike.ts:11`, `strikeSteps = frames + 1`); its beats `LEAVES=2, LANDS=3, HITS=4, BURNS=5` (`strike.ts:18-22`) are zap step numbers, and many tests compute durations as `frames * msPerFrame` (`activity.test.ts:16-22, 397-398`, `look.test.ts:21`, `strike.test.ts:10-14`). So a hold is a frame repeated over several fixed ticks, built with a helper; `frames` keeps meaning "number of ticks" and `register.tsx`, `activity.ts`, `strike.ts` do not change.
3. **Zap can move to a pose with no visual change.** A patch holding exactly the fake arm's three pixels renders identically (no worn accessory overlaps them, and zap already hides `held`). The engine therefore lands with `GOLDEN` untouched, and the arm is redrawn later as a separate, deliberate change.

## Design

### Poses are patches, not full grids

On an 18×16 stage a pose changes a handful of pixels. A patch shows only those pixels, carries base-body edits into every pose for free, and can be validated tightly.

- A patch is rows laid over the body starting at `at`.
- `' '` keeps the body's pixel, `'.'` clears it to transparent, any other letter must be in the character's legend.
- Pose names are a fixed shared vocabulary. Start with `blink` and `armUp`; add `squash`, `stretch`, `tailUp`, `earsBack` only together with the animation that first uses them.

### Strict at load, like anchors

An animation declares the poses it uses. The registry refuses a character that lacks one. Strict over fallback because zap's raised paw is load-bearing (the bolt strikes it): silently drawing the base body would hide a broken look. It also matches `requireAnchors`. A character with genuinely nothing to change gives an explicit empty patch.

### Types (`hooks/sprite/types.ts`)

```ts
/** Body changes an animation can ask for by name; each character draws its own. Grows only with an animation that uses a new one. */
export const POSES = ['blink', 'armUp'] as const
export type PoseName = (typeof POSES)[number]

/** Letters laid over the body from `at`, row by row: ' ' keeps the body's pixel, '.' clears it, any other letter is from the legend. */
export type Patch = { readonly at: Point; readonly rows: readonly string[] }

// Character gains:
  /** The poses this character draws, as patches over `body`. Which ones it must have is checked against what it plays, in the registry. */
  readonly poses?: Readonly<Partial<Record<PoseName, Patch>>>

/** What one frame does: the head bob (in pixels, down), the poses laid over the body in order, and the props and effects drawn on top. */
export type FramePlan = { readonly bob?: number; readonly poses?: readonly PoseName[]; readonly dots?: readonly Dot[] }

// Animation gains:
  /** The poses the frames use. A character that plays this animation and lacks one is refused at load (the registry checks). */
  readonly poses: readonly PoseName[]
```

- `FramePlan.poses` is a list so a blink can sit on top of another pose.
- `defineAnimation` (`compose.ts:20-25`) gains a second generic `P extends PoseName`, so `frame` can only return declared poses, as `Needed<N>` already does for anchors.

### Holds without changing timing

```ts
/** Spreads keyframes over ticks: key k shows for holds[k] ticks. The animation's `frames` is the sum; `keyAt` is the key shown at a step. A hold that is not a positive whole number throws at load. */
export const timeline = (holds: readonly number[]): { readonly frames: number; readonly keyAt: (step: number) => number }
```

Usage: `const T = timeline([1, 1, 4, 1]); frames: T.frames, frame: step => KEYS[T.keyAt(step)]`.

### Rejected for now

- **Upward bob:** a negative `bob` tears a gap under `headRegion` (e.g. foxkit row 8).
- **Per-region offsets for ears and tail:** one-pixel region shifts tear on this grid; hand-drawn `tailUp` / `earsBack` patches look better.
- **Optional later:** `rise?: number` on `FramePlan`, lifting the whole figure (body, accessories, dots) for a real hop in cheer. Both characters have empty top rows to rise into.

### Renderer (`hooks/sprite/compose.ts`)

- New export `posed(character, poses): readonly string[]`: copies `body` padded to the stage and applies each patch in order (later wins). `composePixels` (:125-170) reads this grid in `colorAt` (:139-143) instead of `character.body`. Bob, accessories and dots are unchanged. 288 px per frame, so no memo.
- **Anchors do not move with poses (v1).** They stay facts of the base body, so `requireAnchors`, the `bobs`/`headRegion` checks and the "reads only declared anchors" test (`sprite.test.ts:447`) keep working. Zap already has a separate `reach` anchor for the raised paw. If a pose ever needs to move a slot, add `Patch.anchors?: Partial<Anchors>` then.
- **Accessories draw over posed pixels.** Glasses hide a blink, which is correct. An animation whose pose overlaps a slot lists that slot in `hides`, as zap does with `held`.
- **Bob caveat:** a patch inside `headRegion` bobs with the head (foxkit `reach` at (13,7) is inside it). Zap has no bob; document it on the pose.
- **Validation in `defineCharacter` (:37-97):** each pose key is in `POSES`, `at` is on the stage, rows fit (`at.x + len ≤ 18`, `at.y + rows ≤ 16`), every letter is `' '`, `'.'` or in the legend with a palette colour. Messages follow the existing style:
  - `sprite: character "x" has the pose "nod", which is not one of: blink, armUp`
  - `sprite: character "x" has the pose "armUp" off the stage`
  - `sprite: character "x" uses "q" in the pose "blink", which its legend does not name`

### Registry (`hooks/sprite/registry.ts:46-59`)

`requirePoses(character, played)` throws `sprite: character "x" has no pose "armUp", which the animation "zap" needs`, run in the same load loop as `requireAnchors`.

### Playback and timing

- `register.tsx`, `activity.ts`, `strike.ts`: no code change.
- Add one sentence at `strike.ts:16` saying its beats are zap tick numbers, so retiming zap with `timeline` means moving the beats. When ticket 11 lands, the beats should come from the animation (e.g. `Animation.marks`).
- Do not dedupe identical frames in `register.tsx`; tests compare painted sequences that already contain repeats (shrug frames 6–7 equal rest; `activity.test.ts:185`).

## Pixel rows

### armUp, step A: identical to today's fake arm

```ts
// foxkit: (13,6) o, (13,7) y, (12,8) o
armUp: { at: { x: 12, y: 6 }, rows: [' o', ' y', 'o'] }
// classic: (10,8) k, (10,9) y, (9,10) k
armUp: { at: { x: 9, y: 8 }, rows: [' k', ' y', 'k'] }
```

Zap: add `poses: ['armUp']`, delete the `arm` helper, frames 2–3 return `poses: ['armUp']`, frame 4 returns `poses: ['armUp']` plus the dot `[reach.x, reach.y, 'spark']` (the glowing paw). Zap still needs `reach`.

### armUp, step B: a fuller arm (deliberate visual change)

```ts
// foxkit
armUp: { at: { x: 11, y: 6 }, rows: [
  ' ooo',   // (12-14,6) top of the paw
  'oyyo',   // (11,7) o, (12,7) y, (13,7) y = reach, (14,7) o
  'yoo',    // (11,8) y the arm leaving the body, (12-13,8) underside
] }
// classic: no outline style, so a yellow arm rising at x 10 from the elbow at (9,10)
armUp: { at: { x: 9, y: 7 }, rows: [' y', ' y', ' y', 'y'] }
```

### blink

```ts
// foxkit: 2-px eyes at (5,4-5) and (9,4-5); top goes to base, bottom to the lid line
blink: { at: { x: 5, y: 4 }, rows: ['y   y', 'o   o'] }
// classic: 1-px eyes at (4,8) and (7,8); eye and outline are nearly the same colour, so the lid uses shade
blink: { at: { x: 4, y: 8 }, rows: ['n  n'] }
```

New `hooks/sprite/animations/blink.ts`:

```ts
defineAnimation({ needs: [], poses: ['blink'], frames: 3, msPerFrame: 90, once: true, hides: [],
  frame: step => (step === 1 ? { poses: ['blink'] } : {}) })
```

Added to `ANIMATIONS` but not mapped to a state; ticket 09 schedules it. Since the load loop (:57-59) only checks animations in `STATES`, cover blink with a test, or have ticket 09 check each character's ambient list. Ticket 09's "blink uses a new eye anchor" should become "blink uses the `blink` pose".

### Optional: breathing idle (only if the product decision changes)

```ts
// foxkit: belly side moves out 1 px, rows 9-11
inhale: { at: { x: 11, y: 9 }, rows: ['so', 'so', 'so'] }
// classic
inhale: { at: { x: 9, y: 11 }, rows: ['y', 'y'] }
```

`idle` would be `timeline([16, 1, 6, 8, 6])` over rest / blink / rest / inhale / rest at ~125 ms per tick. Cost: a timer runs forever at rest; it contradicts `PRODUCT.md:38` and ticket 09; these tests must be rewritten: `activity.test.ts:143-145, 166-167, 186, 189, 197-199, 319, 379-381`, plus `look.test.ts` idle assertions that read `painted.at(-1)` after time has passed.

## Tests

`tests/sprite.test.ts`:

- `posed()` keeps, clears and sets pixels; patches apply in order, later wins.
- Each `defineCharacter` pose error: unknown name, off stage, letter not in legend, letter with no colour.
- `requirePoses` refuses, naming pose and animation (mirror `:429-440`).
- Every shipped character has every pose the shipped animations use, including `blink`.
- An animation uses only the poses it declares: every frame's `poses` ⊆ `animation.poses`.
- `timeline`: `frames` is the sum of holds; `keyAt` at boundaries and wrap; non-positive or fractional holds throw.
- `blink`: frame 1 differs from rest only at the eye pixels; frames 0 and 2 equal rest; on foxkit with glasses frame 1 equals rest.
- Change `:383-409`: the `without` frame carries the plan's poses (`frame: () => ({ bob: plan.bob ?? 0, poses: plan.poses })`) once cheer, look or shrug use poses.
- Golden: after step A, `:27-39` passes unchanged. After step B, keep `sprite-golden.ts` as is (its header forbids regenerating it); render zap with `{ ...foxkit, poses: { ...foxkit.poses, armUp: OLD_ARM } }` and require equality with `GOLDEN.zap[step]`, proving the redrawn patch is the only change. Add a test that zap frames 2–4 with the new arm differ from golden.
- `:41-62` still holds (zap differs from rest every frame).

`activity.test.ts`, `strike.test.ts`, `look.test.ts`, `transition.test.ts`: no change unless the looping idle is chosen.

## Implementation order

Each step lands green on its own.

| # | Step | Files | Visual change | Risk |
|---|---|---|---|---|
| 1 | Pose types and validation; every animation gets `poses: []` | `types.ts`, `compose.ts`, all `animations/*.ts`, `sprite.test.ts` | No | Low |
| 2 | Renderer reads `posed()` | `compose.ts`, `sprite.test.ts` | No | Low; golden proves it |
| 3 | `requirePoses` in the registry | `registry.ts`, `sprite.test.ts` | No | Low |
| 4 | Zap arm becomes `armUp`, identical pixels | `foxkit.ts`, `classic.ts`, `zap.ts`, `sprite.test.ts` | No | Frame-4 spark left out; golden catches it |
| 5 | `timeline` helper | `compose.ts`, `sprite.test.ts` | No | None |
| 6 | `blink` pose and animation | `blink.ts`, both characters, `registry.ts`, `sprite.test.ts`, ticket 09 wording | New animation | Classic's 1-px blink may read weakly; check in the running app |
| 7 | Fuller `armUp` art | both characters, `sprite.test.ts` | **Yes** | Art judgement; the only intended golden-visible change |
| 8 | Optional: `rise` + `squash`/`stretch` for cheer; `tailUp`/`earsBack` for ticket 09 | `types.ts`, `compose.ts`, characters, animations | Yes | Medium |
| 9 | Optional, needs a product decision: looping breathing idle | `idle.ts`, characters, activity/look tests | Yes | Contradicts `PRODUCT.md:38` |

Cross-cutting risk: retiming zap with holds moves the strike beats. Keep zap at 12 ticks until ticket 11 moves the beats into the animation.

## Open decisions

- Breathing idle (step 9): keep the product rule, or change it?
- Commit the current uncommitted work (cheer, strike, activity) before step 1, so the engine change reviews on its own.
