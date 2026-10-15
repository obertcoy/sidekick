# Small state machines in TypeScript: guidance for `hooks/activity.ts` (08b part 8)

Researched 2026-10-15 against the working-tree `activity.ts` (the version with `CONDITIONS`, `holdSteps` and the injected `playsFor: Lookup`). Scope: 08b part 8 now, with 09 (ambient) and 13 (paused) as the next phases to plan for.

---

## 1. Best practice, briefly

**Model the phase as a discriminated union, not as flags.**
- When each member of a union has a common literal property (`kind`), TypeScript narrows on it. Data that only makes sense in one case (`radius` for a circle) becomes *required* in that case, not optional everywhere. — https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions
- "Make illegal states unrepresentable": replace optional fields with a union of the legal cases, so the type cannot hold the invalid mix. — https://fsharpforfunandprofit.com/posts/designing-with-types-making-illegal-states-unrepresentable/
- Several boolean flags let you store combinations that should never happen. One `status` value allows only one finite state at a time. — https://kentcdodds.com/blog/stop-using-isloading-booleans
- Here that means `playing: Entry | undefined` + `isHolding: boolean` today allows `isHolding && playing === undefined`. A union `{kind:'holding', entry, step, steps}` cannot express it.

**Get exhaustiveness from the compiler.**
- Put a `never` assignment in the `default` of a `switch` over the discriminant. Adding a member then fails to compile at every switch that does not handle it. — https://www.typescriptlang.org/docs/handbook/2/narrowing.html#exhaustiveness-checking
- `satisfies` checks a value against a type without widening it. That keeps `as const` literal types, and lets a `Record<Kind, …>` table be checked for missing kinds. — https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html
- An `as const` object or list plus a derived union is the documented alternative to `enum`, and it stays closer to plain JavaScript. — https://www.typescriptlang.org/docs/handbook/enums.html (section "Objects vs Enums")

**Keep the transition pure and return effects as data.**
- Reducers "must be pure… They should not send requests, schedule timeouts, or perform any side effects". A pure reducer "can be exported and tested separately in isolation". — https://react.dev/learn/extracting-state-logic-into-a-reducer
- Elm's `update : Msg -> Model -> (Model, Cmd Msg)` returns the next model *and* a description of the effects. The runtime carries out the effects. — https://guide.elm-lang.org/effects/http.html
- XState has pure `transition(machine, state, event)` / `initialTransition(machine)` functions that compute the next state and its actions without running anything. Transitions are deterministic: the same state and event always give the same next state. — https://stately.ai/docs/transitions
- Process one event at a time. SCXML does not handle the next event until the current step's executable content has finished ("no events are processed until all the executable content has completed"; macrosteps over an event queue). — https://www.w3.org/TR/scxml/#SelectingTransitions

**Take a few ideas from statecharts, not the machinery.**
- Harel's statecharts add hierarchy, orthogonality (concurrency) and broadcast to flat state machines, to avoid state explosion. — Harel 1987, *Statecharts: a visual formalism for complex systems*, https://doi.org/10.1016/0167-6423(87)90035-9
- Parallel regions model independent variables independently, so the chart grows roughly linearly. Hierarchy models variables that only matter in some states. — https://statecharts.dev/state-machine-state-explosion.html , https://stately.ai/docs/parallel-states
- A parent (compound) state's transitions apply whichever child is active. — https://stately.ai/docs/parent-states
- History states remember which child was active when the parent was exited. — https://stately.ai/docs/history-states
- Entry and exit actions run on any transition that enters or exits a state. — https://stately.ai/docs/actions

**Tie timers to state lifetime so they cannot leak.**
- XState: "Delayed transition timers are canceled when the state is exited." — https://stately.ai/docs/delayed-transitions
- Invoked actors (long-running effects) "start when the state is entered, and stop when the state is exited". — https://stately.ai/docs/invoke
- For this module: the timer belongs to the phase. Every transition that leaves a phase emits `stop` first.

**Know the costs.**
- statecharts.dev lists the drawbacks: more lines of code on small machines, a learning curve, and a style that feels foreign to many programmers. — https://statecharts.dev/drawback-lines-of-code.html , https://statecharts.dev/
- Kent C. Dodds' own small `transition(state, event)` machine is about 30 lines, and he says not to use it in production. The idea transfers; the library does not have to. — https://kentcdodds.com/blog/implementing-a-simple-state-machine-library-in-javascript

---

## 2. Recommended design for part 8

### 2.1 Shape: functional core, thin shell, both in `activity.ts`

```
register.tsx ──set/queue──▶ shell (createActivity) ──event──▶ transition(model, event, playsFor)
                              ▲      │                                 │
                              │      └── runs effects in order ◀───────┘  { model, effects[] }
                       clock tick     draw · stop · every · start/step/end hooks
```

- **`Model`** holds everything that changes: `conditions`, `waiting`, `phase`, `shown`. It is immutable and holds no timers.
- **`transition`** is the one place where the model changes. It is pure: no clock, no `draw`, no hook calls.
- **`Effect`** is a small union of what the shell must do. The shell owns the one `Timer` slot and the hook calls.
- **Queries** (`has`, `shown`, `repaint`) read `model` and are *not* events.
- The public `Activity` interface and the `createActivity(clock, draw, playsFor)` signature stay as they are. `transition`, `Model`, `Phase` and `INITIAL` may be exported for unit tests only. `register.tsx` never imports them.

### 2.2 Phase union from an `as const` list

```ts
/** What the activity is doing with its one timer. */
export const PHASES = ['resting', 'playing', 'holding'] as const
export type PhaseKind = (typeof PHASES)[number]

/** An entry under way: the step it is at, and how many steps it has in all (hold included). */
type Run = { readonly entry: Entry; readonly step: number; readonly steps: number }

/** The fields each kind carries. A kind missing here fails to compile below. */
type Fields = { resting: Record<never, never>; playing: Run; holding: Run }
export type Phase = { [K in PhaseKind]: { readonly kind: K } & Fields[K] }[PhaseKind]
//   = { kind: 'resting' } | { kind: 'playing' } & Run | { kind: 'holding' } & Run

const unreachable = (value: never): never => {
  throw new Error(`unhandled ${JSON.stringify(value)}`)
}
```

- `holding` with no entry, or `playing` with no step count, cannot be written down.
- The phase does **not** store the resting state. That state is always derived from `conditions` (`restingOf`), so there is nothing to keep in sync.
- Invariant to document and test: **while `holding`, `shown` is always `(restingOf(conditions), 0)`**. Entering holding draws that frame, and a `set` during holding redraws it. So leaving holding for rest never needs a draw. This replaces today's `isShown` check with a rule that depends only on the phase.

### 2.3 Events and effects

```ts
export type Event =
  | { readonly type: 'set'; readonly condition: Condition; readonly isOn: boolean }
  | { readonly type: 'queue'; readonly entry: Entry }
  | { readonly type: 'tick' }

export type Effect =
  | { readonly do: 'draw'; readonly state: State; readonly frame: number }
  | { readonly do: 'stop' }                       // cancel the timer there is
  | { readonly do: 'every'; readonly ms: number } // cancel the timer there is, start this one
  | { readonly do: 'start'; readonly entry: Entry }
  | { readonly do: 'step'; readonly entry: Entry; readonly step: number }
  | { readonly do: 'end'; readonly entry: Entry }

export type Model = {
  readonly conditions: Readonly<Record<Condition, boolean>>
  readonly waiting: readonly Entry[]
  readonly phase: Phase
  readonly shown: { readonly state: State; readonly frame: number }
}
type Result = { readonly model: Model; readonly effects: readonly Effect[] }

export const INITIAL: Model = {
  conditions: Object.fromEntries(CONDITIONS.map(c => [c, false])) as Record<Condition, boolean>,
  waiting: [],
  phase: { kind: 'resting' },
  shown: { state: 'resting', frame: 0 },
}
```

- The hooks are effects (`start`/`step`/`end`) carrying the entry, not closures. A test can then assert `[stop, end(zap), draw(resting,0), …]` by value.
- `every` *replaces* the timer slot. With one slot it is impossible to have two timers running.

### 2.4 Transition skeleton

```ts
const restingOf = (c: Model['conditions']): State => (c.turn ? 'working' : c.search ? 'searching' : 'resting')
const same = (model: Model): Result => ({ model, effects: [] })
const show = (model: Model, state: State, frame: number): Result =>
  ({ model: { ...model, shown: { state, frame } }, effects: [{ do: 'draw', state, frame }] })

/** What comes next: the head of the queue, or the loop for what still goes on. `from` is the phase being left. */
const begin = (m: Model, playsFor: Lookup, from: PhaseKind): Result => {
  const [entry, ...waiting] = m.waiting
  if (entry === undefined) {
    const state = restingOf(m.conditions)
    const { frames, msPerFrame } = playsFor(state)
    return {
      model: { ...m, waiting, phase: { kind: 'resting' }, shown: { state, frame: 0 } },
      effects: [
        { do: 'stop' },
        // Holding already shows the resting frame 0 (see invariant); drawing it again would be a repaint.
        ...(from === 'holding' ? [] : [{ do: 'draw', state, frame: 0 } as const]),
        // A single frame does not move, so it needs no timer.
        ...(frames > 1 ? [{ do: 'every', ms: msPerFrame } as const] : []),
      ],
    }
  }
  const { frames, msPerFrame } = playsFor(entry.state)
  const steps = Math.max(frames, entry.holdSteps ?? 0)
  return {
    model: { ...m, waiting, phase: { kind: 'playing', entry, step: 0, steps }, shown: { state: entry.state, frame: 0 } },
    effects: [{ do: 'stop' }, { do: 'start', entry }, { do: 'draw', state: entry.state, frame: 0 }, { do: 'every', ms: msPerFrame }],
  }
}

export const transition = (m: Model, e: Event, playsFor: Lookup): Result => {
  switch (e.type) {
    case 'set': {
      if (m.conditions[e.condition] === e.isOn) return same(m)
      const next = { ...m, conditions: { ...m.conditions, [e.condition]: e.isOn } }
      const rest = restingOf(next.conditions)
      // A change that leaves the resting animation as it is must not restart it.
      if (rest === m.shown.state) return same(next)
      switch (m.phase.kind) {
        case 'resting': return begin(next, playsFor, 'resting')
        case 'playing': return same(next)
        case 'holding': return show(next, rest, 0)
        default: return unreachable(m.phase)
      }
    }
    case 'queue': {
      const next = { ...m, waiting: [...m.waiting, e.entry] }
      switch (m.phase.kind) {
        case 'resting': return begin(next, playsFor, 'resting')
        case 'playing':
        case 'holding': return same(next) // never cut short
        default: return unreachable(m.phase)
      }
    }
    case 'tick': {
      const p = m.phase
      switch (p.kind) {
        case 'resting': {
          const { state, frame } = m.shown
          return show(m, state, (frame + 1) % playsFor(state).frames)
        }
        case 'playing':
        case 'holding': return advance(m, p, playsFor)
        default: return unreachable(p)
      }
    }
    default: return unreachable(e)
  }
}

const advance = (m: Model, p: Extract<Phase, { kind: 'playing' | 'holding' }>, playsFor: Lookup): Result => {
  const step = p.step + 1
  if (step >= p.steps) {
    const after = begin(m, playsFor, p.kind)
    return { model: after.model, effects: [{ do: 'stop' }, { do: 'end', entry: p.entry }, ...after.effects] }
  }
  const hook: Effect = { do: 'step', entry: p.entry, step }
  if (step < playsFor(p.entry.state).frames) {
    const drawn = show({ ...m, phase: { ...p, step } }, p.entry.state, step)
    return { model: drawn.model, effects: [hook, ...drawn.effects] }
  }
  switch (p.kind) {
    case 'playing': { // the animation is over but the entry is not: rest while the hold runs out
      const drawn = show({ ...m, phase: { ...p, kind: 'holding', step } }, restingOf(m.conditions), 0)
      return { model: drawn.model, effects: [hook, ...drawn.effects] }
    }
    case 'holding': return { model: { ...m, phase: { ...p, step } }, effects: [hook] }
    default: return unreachable(p)
  }
}
```

Behaviour check against today's code:
- **Effect order** matches today: `stop → onEnd → stop → onStart → draw → every`, and `onStep` before the frame is drawn.
- **`steps = max(frames, holdSteps ?? 0)`** is unchanged.
- **`set` with an unchanged resting state** is still a no-op in every phase.
- **No initial draw:** `INITIAL` is resting with no effects, as today.

### 2.5 Shell

```ts
export const createActivity = (clock: Clock, draw: (state: State, frame: number) => void, playsFor: Lookup): Activity => {
  let model = INITIAL
  let timer: Timer | undefined
  const inbox: Event[] = []
  let isBusy = false

  const run = (effect: Effect): void => {
    switch (effect.do) {
      case 'draw': return draw(effect.state, effect.frame)
      case 'stop': timer?.cancel(); timer = undefined; return
      case 'every': timer?.cancel(); timer = clock.every(effect.ms, () => dispatch({ type: 'tick' })); return
      case 'start': return effect.entry.onStart?.()
      case 'step': return effect.entry.onStep?.(effect.step)
      case 'end': return effect.entry.onEnd?.()
      default: return unreachable(effect)
    }
  }
  // One event at a time: a hook that calls set/queue is handled after the current effects (run to completion).
  const dispatch = (event: Event): void => {
    inbox.push(event)
    if (isBusy) return
    isBusy = true
    try {
      for (let next = inbox.shift(); next !== undefined; next = inbox.shift()) {
        const result = transition(model, next, playsFor)
        model = result.model
        result.effects.forEach(run)
      }
    } finally { isBusy = false }
  }

  return {
    set: (condition, isOn) => dispatch({ type: 'set', condition, isOn }),
    has: condition => model.conditions[condition],
    queue: entry => dispatch({ type: 'queue', entry }),
    repaint: () => draw(model.shown.state, model.shown.frame),
    shown: () => model.shown,
  }
}
```

- **Run to completion fixes a latent re-entrancy hazard.** Today `onEnd` runs while `playing` is already `undefined`. If it called `queue`, `begin()` would run twice. No hook in `register.tsx` does this today: they only set `scene.strike` and `invalidate`. The inbox guard costs about 5 lines.
- **Stale ticks:** `MockClock` and `$.clock` cancel synchronously, so a cancelled timer cannot fire. Do not add a generation counter unless a real stale tick appears.

### 2.6 Exhaustiveness points

Adding a kind to `PHASES` makes the compiler fail in:
- `Fields[K]` (no fields declared for the new kind)
- `set`'s phase switch
- `queue`'s phase switch
- `tick`'s phase switch
- the switch in `advance` (only if the kind is a `Run` kind)

**Rule:** never test the phase with `if (phase.kind === 'x')` or `!==` outside a narrowed helper. Use a `switch` with `unreachable`, or the new kind slips through silently. Adding an `Effect` fails in `run`. Adding an `Event` fails in `transition`.

*Alternative:* a handler table `const ON = { resting: {...}, playing: {...}, holding: {...} } satisfies { [K in PhaseKind]: Handlers<K> }` gives the same compile-time coverage in two dimensions. It costs a mapped type and splits each event across three objects. For 3–5 kinds × 3–6 events, the event-outer switch is shorter, and it matches the ticket's wording ("each switch over the phase is exhaustive"). Move to a table only if most cells differ per phase.

### 2.7 How 09 (ambient) slots in (sketch, not to implement now)

- **Phase:** add `'ambient'` with `Fields.ambient = { readonly name: AmbientName; readonly step: number }`. The compiler then points at `set` / `queue` / `tick`.
- **Model:** `motion: boolean`, plus whatever lists the current character's ambient names (or let the shell supply the pick).
- **Events:** `{ type: 'motion'; isOn }`, and `{ type: 'due'; pick: AmbientName }`. The shell chooses the random animation when the wait fires and puts it in the event, so `transition` stays deterministic. The ticket also says no random source is injected.
- **Effect:** `{ do: 'wait'; minMs: 5000; maxMs: 15000 }`. The shell picks the delay. It implements a one-shot with `clock.every` and cancels on the first fire; `Clock` only has `every`.
- **Entry rule:** `begin` emits `wait` when it goes to resting with rest state `resting`, a still idle frame (`frames === 1`), and `motion` on. Otherwise it emits no wait, so with motion off no timer is pending at rest.
- **Preemption:** ambient is the one phase that *is* cut short. In `ambient`, `queue` → `begin(next, …, 'ambient')`. A `set` that changes the rest state → `begin` as well. Ambient ends → `begin` (which re-arms `wait`).
- **Drawing:** ambient frames are not a `State`, so the `draw` *parameter* of `createActivity` may have to widen. That is a constructor change, not a public-interface change.
- **Watch ticket 10:** a multi-frame background at rest wants a frame loop *and* an ambient wait at the same time. That would be the first need for two timer slots (or one tick that counts down the wait). Do not build for it before 10.

### 2.8 How 13 (paused) slots in (sketch)

- **Statechart view:** "shown" is a parent of the whole phase region, and `conditions` is a parallel region that keeps tracking while hidden. In code you do not need nested states. Add one kind with **flat encoding**: `Fields.paused = { readonly interrupted?: Run }`.
- **Events:** `{ type: 'hide' }` and `{ type: 'show' }`. On `hide` from any phase: `[stop]` → `paused`. No `draw` and no timer while paused.
  - `set` updates conditions only.
  - `queue` appends only.
  - `tick` cannot arrive, and `unreachable` is wrong here, so return `same`.
- **`show`:** `begin(m, playsFor, 'paused')`. This plays the queue head, or rests for the *current* conditions. So "a lasting state is not replayed" falls out for free: only `waiting` survives, and a turn that started and ended while hidden left no trace. `begin` from `'paused'` must draw, which the `from` parameter already allows. Ambient's `wait` restarts from scratch because `begin` emits a fresh one.
- **Open decision for 13:** what happens to an entry that is *mid-play* when the pane hides? The ticket does not say. Options:
  - (a) Keep `interrupted` and resume at its step on show. This is shallow history; `onStart` is not called twice.
  - (b) Finish it at once: emit `end`, which clears the strike.
  - (c) Put it back at the head of `waiting`. This calls `onStart` twice, so the strike restarts.
  - (a) is the most faithful to "plays once" and costs the one optional field.
- `has` / `shown` / `repaint` do not change. `repaint` while hidden would still draw, so decide in 13 whether the shell drops `draw` while paused.

---

## 3. What not to do here

- **No mini-library** (`createMachine(config)`, an interpreter over a config object, typed `context`/`guards`/`actions` maps). It doubles the line count of a ~150-line module and hides the 9–15 real cells behind indirection. statecharts.dev itself names the extra lines on small machines as a drawback.
- **No real hierarchy or parallel-region machinery.** Use the *ideas*: conditions as an independent record, paused as "a phase that wraps the others", timers owned by the phase. Do not add the structures (`'shown.playing.holding'` paths, region arrays, history pseudo-states).
- **No TS `enum`, no class-per-state (GoF State pattern), no event bus/emitter.**
- **No closures, timers or `Timer` handles in `Model`.** Keep the model as plain data, so tests can compare it by value.
- **No randomness or `Date.now()` inside `transition`.** Pass picks and delays in through events or let the shell resolve them (09).
- **Do not make `has` / `shown` / `repaint` into events.** They are queries.
- **Do not store derived data.** The resting state is `restingOf(conditions)`, and `isShown` disappears thanks to the holding invariant.
- **Do not scatter `if (phase.kind === …)`** outside switches. It defeats the compile-time coverage the ticket asks for.
- **Do not pre-build `ambient` / `paused`** or a second timer slot in part 8. The ticket is a behaviour-preserving refactor. Add each kind when its ticket lands, and let the compiler list the touch points.
- **Do not export the phase to `register.tsx`.** The public interface stays `set / has / queue / repaint / shown`.
- **Budget:** if the result goes much past ~200 lines, fold the effects back. Option A below is the fallback.
- **Fallback (Option A):** keep today's closures, replace `playing`/`isHolding` with one `let phase: Phase`, and route every change through one `go(next: Phase)` that does stop/enter. This meets ticket 08b's checklist with the smallest diff, but it gives up the pure-function tests.

---

## 4. Testing guidance

### Unit tests on the pure `transition`
- Use a fake `Lookup`: e.g. `resting` 1 frame, `working` 3 frames, `ticket-done` 2 frames. Tests then do not depend on the art.
- Assert `{ phase.kind, shown, effects }` by value. No mock clock.
- **Cells worth a test:**
  - `resting + queue` → `playing`, with effects `[stop, start, draw(e,0), every]`.
  - `playing + queue` → same phase, `waiting` grows, no effects (never cut short).
  - `playing + tick` at `step === frames` with `holdSteps > frames` → `holding`, effects `[step, draw(rest,0)]`.
  - `holding + tick` at last step → `[stop, end, stop, every?]` with **no draw** (holding invariant).
  - `holding + set` that changes the rest state → `[draw(newRest,0)]` and no timer effect.
  - `playing + set` → no effects, and conditions update.
  - `resting + set` with the rest state unchanged (search ends while a turn runs) → no effects.
  - `set` to the value it already has → identical model.
  - `steps = max(frames, holdSteps)` for `holdSteps` undefined, smaller and larger.
  - Single-frame rest → no `every`.
- **Invariant sweep (no dependencies):** apply a few hundred events from a seeded LCG through `transition`. After each, check:
  - while `holding`, `shown` is `(restingOf(conditions), 0)`
  - every `every` is preceded by `stop` in the same effect list, or is the only timer effect
  - `start` and `end` alternate per entry, and every queued entry eventually gets exactly one `start` and one `end`
  - Later: no `every`/`draw` while `paused` (13), and no `wait` when `motion` is off (09).
- **Compile-time:** `tsc` failing on a missing case *is* the exhaustiveness test. Optionally add a `// @ts-expect-error` fixture that shows a `holding` without `entry` is rejected.

### Keep as whole-mod tests (existing `tests/activity.test.ts`, `look.test.ts`, `sprite.test.ts`)
- **Frame sequences and timing** on the mock clock (`named(painted)` sequences such as `zap0 zap1 idle0`). These prove the shell and `register.tsx` together.
- **The strike staying in step with the zap** (`onStep` → row flash). This is the real reason the hooks exist.
- **Number of pending timers** (`running()`), and the golden frames.
- **Everything from 09 and 13:**
  - ambient gap bounds by advancing the clock ("nothing painted in the first 5 s, one ambient by 15 s + its length")
  - motion command persistence
  - hide/show with queued zaps, shrugs and cheers in order
- These tests must pass **unchanged in meaning** after part 8 (ticket acceptance). Run them before adding any pure test. The pure tests add precision for the tricky cells; they do not replace the whole-mod tests.

---

## Sources

- TypeScript Handbook, Narrowing (discriminated unions, exhaustiveness): https://www.typescriptlang.org/docs/handbook/2/narrowing.html
- TypeScript 4.9 release notes (`satisfies`): https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html
- TypeScript Handbook, Enums ("Objects vs Enums"): https://www.typescriptlang.org/docs/handbook/enums.html
- Scott Wlaschin, Making illegal states unrepresentable: https://fsharpforfunandprofit.com/posts/designing-with-types-making-illegal-states-unrepresentable/
- Kent C. Dodds, Stop using isLoading booleans: https://kentcdodds.com/blog/stop-using-isloading-booleans
- Kent C. Dodds, Implementing a simple state machine library: https://kentcdodds.com/blog/implementing-a-simple-state-machine-library-in-javascript
- React docs, Extracting state logic into a reducer: https://react.dev/learn/extracting-state-logic-into-a-reducer
- Elm guide, HTTP (`update` returns `(Model, Cmd Msg)`): https://guide.elm-lang.org/effects/http.html
- Stately/XState docs: transitions https://stately.ai/docs/transitions · actions https://stately.ai/docs/actions · delayed transitions https://stately.ai/docs/delayed-transitions · invoke https://stately.ai/docs/invoke · parallel states https://stately.ai/docs/parallel-states · parent states https://stately.ai/docs/parent-states · history https://stately.ai/docs/history-states
- statecharts.dev: state explosion https://statecharts.dev/state-machine-state-explosion.html · drawbacks https://statecharts.dev/drawback-lines-of-code.html
- W3C SCXML (event processing, macrosteps): https://www.w3.org/TR/scxml/#SelectingTransitions
- D. Harel, Statecharts: a visual formalism for complex systems (1987): https://doi.org/10.1016/0167-6423(87)90035-9
