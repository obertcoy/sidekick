// What the sidekick is doing: the conditions that hold now (a turn runs, a search runs) and a queue of
// once-only animations. One small unit, one timer, no knowledge of the pane. register.tsx tells it what
// happens; it tells register.tsx what to draw.
//
// A pure `transition(model, event, playsFor)` is the only place anything changes: it returns the next model
// and the effects to run, as data. `createActivity` is the shell: it owns the one timer and runs the effects in order.
import type { Timer } from 'claude-code'

import type { State } from './sprite/registry'
import type { Animation } from './sprite/types'

export type { State }

/** The things that can be going on at the same time; each is either on or off. */
export const CONDITIONS = ['turn', 'search'] as const
export type Condition = (typeof CONDITIONS)[number]

/** Answers what plays for a state. Given, not imported, so the activity and the pane cannot disagree. Asked once when something starts; the answer is kept and never asked again for that run. */
export type Lookup = (state: State) => Animation

/** A picture to show: the animation resolved when it began, and the frame of it. `state` says what the sidekick is doing. */
export type Shown = { readonly state: State; readonly animation: Animation; readonly frame: number }

/** A once-only animation waiting its turn. */
export type Entry = {
  readonly state: State
  /** Keeps the entry going this many steps past the last frame of the animation that plays when it starts: the ticket strike has one step more than the zap has frames. The sidekick rests meanwhile. */
  readonly restSteps?: number
  /** Called when the entry starts to play, before its first frame is drawn, with the steps it will have in all (rest steps included). */
  readonly onStart?: (steps: number) => void
  /** Called at every tick after the first, with the step it is at; it includes the rest steps. */
  readonly onStep?: (step: number) => void
  /** Called when the entry is over, before what comes next is drawn. */
  readonly onEnd?: () => void
}

/** The part of the clock the activity needs; `$.clock` has it. */
export type Clock = { every: (ms: number, fn: () => void) => Timer }

export type Activity = {
  /** Turns a condition on or off. */
  set: (condition: Condition, isOn: boolean) => void
  /** Whether the condition holds now. */
  has: (condition: Condition) => boolean
  /** Adds a once-only animation behind those already waiting. It plays at once when none is playing. */
  queue: (entry: Entry) => void
  /** Draws what is shown now again, for a change that is not the activity's own (a new look). */
  repaint: () => void
  /** What is shown now: the state, the animation that was resolved for it and its frame. */
  shown: () => Shown
}

// The machine. `resting` loops what still goes on; `playing` runs an entry through its frames; `holding` is an
// entry whose animation is over but whose rest steps are not, the sidekick resting meanwhile.

export const PHASES = ['resting', 'playing', 'holding'] as const
export type PhaseKind = (typeof PHASES)[number]

/** An entry under way: the animation resolved when it began (never asked for again), the step it is at, and how many steps it has in all (rest steps included). */
type Run = { readonly entry: Entry; readonly animation: Animation; readonly step: number; readonly steps: number }

/** What each kind carries; a kind missing here does not compile. */
type Fields = { resting: Record<never, never>; playing: Run; holding: Run }
export type Phase = { [K in PhaseKind]: { readonly kind: K } & Fields[K] }[PhaseKind]

export type Model = {
  readonly conditions: Readonly<Record<Condition, boolean>>
  readonly waiting: readonly Entry[]
  readonly phase: Phase
  /** While holding this is always the resting state at frame 0, so leaving the hold for rest needs no draw. */
  readonly shown: Shown
}

export type Event =
  | { readonly type: 'set'; readonly condition: Condition; readonly isOn: boolean }
  | { readonly type: 'queue'; readonly entry: Entry }
  | { readonly type: 'tick' }

export type Effect =
  | { readonly do: 'draw'; readonly shown: Shown }
  | { readonly do: 'stop' }
  | { readonly do: 'every'; readonly ms: number }
  | { readonly do: 'start'; readonly entry: Entry; readonly steps: number }
  | { readonly do: 'step'; readonly entry: Entry; readonly step: number }
  | { readonly do: 'end'; readonly entry: Entry }

type Result = { readonly model: Model; readonly effects: readonly Effect[] }

/** The model before anything happened. The resting animation is not resolved until something asks; the first picture is drawn when it is. */
export const initial = (playsFor: Lookup): Model => ({
  conditions: Object.fromEntries(CONDITIONS.map(condition => [condition, false])) as Record<Condition, boolean>,
  waiting: [],
  phase: { kind: 'resting' },
  shown: { state: 'resting', animation: playsFor('resting'), frame: 0 },
})

const unreachable = (value: never): never => {
  throw new Error(`activity: unhandled ${JSON.stringify(value)}`)
}

const restingOf = (conditions: Model['conditions']): State => (conditions.turn ? 'working' : conditions.search ? 'searching' : 'resting')
const same = (model: Model): Result => ({ model, effects: [] })
const show = (model: Model, shown: Shown): Result => ({ model: { ...model, shown }, effects: [{ do: 'draw', shown }] })
/** Shows the resting animation for the conditions now, resolving it afresh. */
const showRest = (model: Model, playsFor: Lookup): Result => {
  const state = restingOf(model.conditions)

  return show(model, { state, animation: playsFor(state), frame: 0 })
}

/** Whether a phase already shows the resting frame, so that leaving it for rest needs no draw (the invariant of `Model.shown`). */
const showsRest = (phase: Phase): boolean => {
  switch (phase.kind) {
    case 'holding':
      return true
    case 'resting':
    case 'playing':
      return false
    default:
      return unreachable(phase)
  }
}

/** Starts what comes next: the head of the queue, or the loop for what still goes on. `isShown` says the resting frame is on the screen already. */
const begin = (m: Model, playsFor: Lookup, isShown: boolean): Result => {
  const [entry, ...waiting] = m.waiting
  if (entry === undefined) {
    const state = restingOf(m.conditions)
    const animation = isShown ? m.shown.animation : playsFor(state)
    const shown: Shown = { state, animation, frame: 0 }
    // A single frame does not move, so it needs no timer.
    const loop: Effect[] = animation.frames > 1 ? [{ do: 'every', ms: animation.msPerFrame }] : []

    return {
      model: { ...m, waiting, phase: { kind: 'resting' }, shown },
      effects: [{ do: 'stop' }, ...(isShown ? [] : [{ do: 'draw', shown } as const]), ...loop],
    }
  }
  const animation = playsFor(entry.state)
  const steps = animation.frames + (entry.restSteps ?? 0)
  const shown: Shown = { state: entry.state, animation, frame: 0 }

  return {
    model: { ...m, waiting, phase: { kind: 'playing', entry, animation, step: 0, steps }, shown },
    effects: [{ do: 'stop' }, { do: 'start', entry, steps }, { do: 'draw', shown }, { do: 'every', ms: animation.msPerFrame }],
  }
}

/** One tick of an entry: the next frame, the start of the rest steps, or the end. Only the animation kept at its start is used. */
const advance = (m: Model, p: Extract<Phase, { kind: 'playing' | 'holding' }>, playsFor: Lookup): Result => {
  const step = p.step + 1
  if (step >= p.steps) {
    const after = begin(m, playsFor, showsRest(p))

    return { model: after.model, effects: [{ do: 'stop' }, { do: 'end', entry: p.entry }, ...after.effects] }
  }
  const hook: Effect = { do: 'step', entry: p.entry, step }
  switch (p.kind) {
    case 'playing': {
      // The sidekick rests once the animation is over while the rest of the entry runs out; until then it shows the entry's frames.
      const phase: Phase = step < p.animation.frames ? { ...p, step } : { ...p, kind: 'holding', step }
      const drawn =
        phase.kind === 'playing' ? show({ ...m, phase }, { state: p.entry.state, animation: p.animation, frame: step }) : showRest({ ...m, phase }, playsFor)

      return { model: drawn.model, effects: [hook, ...drawn.effects] }
    }
    case 'holding':
      return { model: { ...m, phase: { ...p, step } }, effects: [hook] }
    default:
      return unreachable(p)
  }
}

/** The one place the model changes. Pure: it calls no clock, no draw and no hook. */
export const transition = (m: Model, e: Event, playsFor: Lookup): Result => {
  switch (e.type) {
    case 'set': {
      if (m.conditions[e.condition] === e.isOn) return same(m)
      const next = { ...m, conditions: { ...m.conditions, [e.condition]: e.isOn } }
      const rest = restingOf(next.conditions)
      // A change that leaves the resting animation as it is (a search ending while a turn writes) must not restart it.
      if (rest === m.shown.state) return same(next)
      switch (m.phase.kind) {
        case 'resting':
          return begin(next, playsFor, false)
        case 'playing':
          return same(next)
        case 'holding':
          return showRest(next, playsFor)
        default:
          return unreachable(m.phase)
      }
    }
    case 'queue': {
      const next = { ...m, waiting: [...m.waiting, e.entry] }
      switch (m.phase.kind) {
        case 'resting':
          return begin(next, playsFor, false)
        case 'playing':
        case 'holding':
          return same(next)
        default:
          return unreachable(m.phase)
      }
    }
    case 'tick': {
      const p = m.phase
      switch (p.kind) {
        case 'resting':
          return show(m, { ...m.shown, frame: (m.shown.frame + 1) % m.shown.animation.frames })
        case 'playing':
        case 'holding':
          return advance(m, p, playsFor)
        default:
          return unreachable(p)
      }
    }
    default:
      return unreachable(e)
  }
}

/** `draw` is called with every picture to show: when what is shown changes, and on `repaint`. */
export const createActivity = (clock: Clock, draw: (shown: Shown) => void, playsFor: Lookup): Activity => {
  let model = initial(playsFor)
  let timer: Timer | undefined
  const inbox: Event[] = []
  let isBusy = false

  const run = (effect: Effect): void => {
    switch (effect.do) {
      case 'draw':
        draw(effect.shown)

        return
      case 'stop':
        timer?.cancel()
        timer = undefined

        return
      case 'every':
        timer?.cancel()
        timer = clock.every(effect.ms, () => dispatch({ type: 'tick' }))

        return
      case 'start':
        effect.entry.onStart?.(effect.steps)

        return
      case 'step':
        effect.entry.onStep?.(effect.step)

        return
      case 'end':
        effect.entry.onEnd?.()

        return
      default:
        unreachable(effect)
    }
  }
  // One event at a time: a hook that calls set or queue is handled after the effects now running.
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
    } finally {
      isBusy = false
    }
  }

  return {
    set: (condition, isOn) => dispatch({ type: 'set', condition, isOn }),
    has: condition => model.conditions[condition],
    queue: entry => dispatch({ type: 'queue', entry }),
    repaint: () => draw(model.shown),
    shown: () => model.shown,
  }
}
