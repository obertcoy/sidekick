// What the sidekick is doing: the conditions that hold now (a turn runs, a search runs), a queue of
// once-only animations, and, while it rests with nothing going on, its ambient motion. One small unit,
// one timer, no knowledge of the pane. register.tsx tells it what happens; it tells register.tsx what to draw.
//
// A pure `transition(model, event, playsFor, ambientOf)` is the only place anything changes: it returns the next model
// and the effects to run, as data. `createActivity` is the shell: it owns the one timer and runs the effects in order,
// and it is the one place that draws a random number (the length of the gap between ambient animations, and which one plays).
import type { Timer } from 'claude-code'

import type { State } from './sprite/registry'
import type { Animation } from './sprite/types'

export type { State }

/** The things that can be going on at the same time; each is either on or off. */
export const CONDITIONS = ['turn', 'search'] as const
export type Condition = (typeof CONDITIONS)[number]

/** Answers what plays for a state. Given, not imported, so the activity and the pane cannot disagree. Asked once when something starts; the answer is kept and never asked again for that run. */
export type Lookup = (state: State) => Animation

/** Answers which ambient animations the character in use plays on its own; empty for a character with none. Given, like `Lookup`, and asked again whenever the answer matters. */
export type Ambient = () => readonly Animation[]
const noAmbient: Ambient = () => []

/** How long the sidekick rests, in milliseconds, between one ambient animation and the next: a whole number from `min` to `max`, both included. */
export const AMBIENT_GAP_MS = { min: 5_000, max: 15_000 } as const
const gapMs = (): number => AMBIENT_GAP_MS.min + Math.floor(Math.random() * (AMBIENT_GAP_MS.max - AMBIENT_GAP_MS.min + 1))

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
export type Clock = { every: (ms: number, fn: () => void) => Timer; after: (ms: number, fn: () => void) => Timer }

export type Activity = {
  /** Turns a condition on or off. */
  set: (condition: Condition, isOn: boolean) => void
  /** Turns ambient motion on or off. It starts off; with it off no timer runs at rest. */
  setMotion: (isOn: boolean) => void
  /** Whether the condition holds now. */
  has: (condition: Condition) => boolean
  /** Adds a once-only animation behind those already waiting. It plays at once when none is playing. */
  queue: (entry: Entry) => void
  /** Tells the activity the look changed without drawing: it asks again what the character plays on its own, and drops an ambient animation of the old character. */
  lookChanged: () => void
  /** Draws what is shown now again, for a change that is not the activity's own (a new look), and asks again what ambient motion the character has. */
  repaint: () => void
  /** What is shown now: the state, the animation that was resolved for it and its frame. */
  shown: () => Shown
}

// The machine. `resting` loops what still goes on; `between` is a rest with nothing going on and a gap pending, until the next ambient
// animation; `ambient` plays that animation; `playing` runs an entry through its frames; `holding` is an entry whose animation is over
// but whose rest steps are not, the sidekick resting meanwhile. An entry or a condition that arrives in `between` or `ambient` takes over at once.

export const PHASES = ['resting', 'between', 'ambient', 'playing', 'holding'] as const
export type PhaseKind = (typeof PHASES)[number]

/** An animation under way: the one resolved when it began (never asked for again), the step it is at, and how many steps it has in all. */
type Play = { readonly animation: Animation; readonly step: number; readonly steps: number }

/** An entry under way: its animation, and how many steps it has in all (rest steps included). */
type Run = Play & { readonly entry: Entry }

/** What each kind carries; a kind missing here does not compile. */
type Fields = { resting: Record<never, never>; between: Record<never, never>; ambient: Play; playing: Run; holding: Run }
export type Phase = { [K in PhaseKind]: { readonly kind: K } & Fields[K] }[PhaseKind]

export type Model = {
  readonly conditions: Readonly<Record<Condition, boolean>>
  /** Whether ambient motion is on. The model starts with it off; register.tsx turns it on from the saved setting. */
  readonly isMotionOn: boolean
  readonly waiting: readonly Entry[]
  readonly phase: Phase
  /** While holding or between this is always the resting state at frame 0, so leaving it for rest needs no draw. */
  readonly shown: Shown
}

export type Event =
  | { readonly type: 'set'; readonly condition: Condition; readonly isOn: boolean }
  | { readonly type: 'queue'; readonly entry: Entry }
  | { readonly type: 'tick' }
  /** Ambient motion is turned on or off. */
  | { readonly type: 'motion'; readonly isOn: boolean }
  /** The gap between ambient animations has passed. `roll` is a random number from 0 up to, not including, 1; it picks the animation. */
  | { readonly type: 'gap'; readonly roll: number }
  /** The look changed, so what the character plays on its own may have too. */
  | { readonly type: 'look' }

export type Effect =
  | { readonly do: 'draw'; readonly shown: Shown }
  | { readonly do: 'stop' }
  | { readonly do: 'every'; readonly ms: number }
  /** Cancel the timer there is, and start the one gap: a random wait within `AMBIENT_GAP_MS`, chosen by the shell. */
  | { readonly do: 'wait' }
  | { readonly do: 'start'; readonly entry: Entry; readonly steps: number }
  | { readonly do: 'step'; readonly entry: Entry; readonly step: number }
  | { readonly do: 'end'; readonly entry: Entry }

type Result = { readonly model: Model; readonly effects: readonly Effect[] }

/** The model before anything happened. The resting animation is not resolved until something asks; the first picture is drawn when it is. */
export const initial = (playsFor: Lookup): Model => ({
  conditions: Object.fromEntries(CONDITIONS.map(condition => [condition, false])) as Record<Condition, boolean>,
  isMotionOn: false,
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
    case 'between':
      return true
    case 'resting':
    case 'ambient':
    case 'playing':
      return false
    default:
      return unreachable(phase)
  }
}

/**
 * Whether the sidekick waits for its next ambient animation when it rests with `animation`: motion is on, nothing is going on,
 * the rest does not move (the one timer is the gap's), and the character has something to play.
 */
const waitsAt = (m: Model, animation: Animation, ambientOf: Ambient): boolean =>
  m.isMotionOn && restingOf(m.conditions) === 'resting' && animation.frames <= 1 && ambientOf().length > 0

/** Starts what comes next: the head of the queue, or the loop for what still goes on (and the gap, when ambient motion is due). `isShown` says the resting frame is on the screen already. */
const begin = (m: Model, playsFor: Lookup, ambientOf: Ambient, isShown: boolean): Result => {
  const [entry, ...waiting] = m.waiting
  if (entry === undefined) {
    const state = restingOf(m.conditions)
    const animation = isShown ? m.shown.animation : playsFor(state)
    const shown: Shown = { state, animation, frame: 0 }
    // A single frame does not move, so it needs no timer.
    const loop: Effect[] = animation.frames > 1 ? [{ do: 'every', ms: animation.msPerFrame }] : []
    const isWaiting = waitsAt(m, animation, ambientOf)

    return {
      model: { ...m, waiting, phase: { kind: isWaiting ? 'between' : 'resting' }, shown },
      effects: [{ do: 'stop' }, ...(isShown ? [] : [{ do: 'draw', shown } as const]), ...loop, ...(isWaiting ? [{ do: 'wait' } as const] : [])],
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
const advance = (m: Model, p: Extract<Phase, { kind: 'playing' | 'holding' }>, playsFor: Lookup, ambientOf: Ambient): Result => {
  const step = p.step + 1
  if (step >= p.steps) {
    const after = begin(m, playsFor, ambientOf, showsRest(p))

    return { model: after.model, effects: [{ do: 'stop' }, { do: 'end', entry: p.entry }, ...after.effects] }
  }
  const hook: Effect = { do: 'step', entry: p.entry, step }
  switch (p.kind) {
    case 'playing': {
      // The sidekick rests once the animation is over while the rest of the entry runs out; until then it shows the entry's frames.
      const drawn =
        step < p.animation.frames
          ? show({ ...m, phase: { ...p, step } }, { state: p.entry.state, animation: p.animation, frame: step })
          : showRest({ ...m, phase: { ...p, kind: 'holding', step } }, playsFor)

      return { model: drawn.model, effects: [hook, ...drawn.effects] }
    }
    case 'holding':
      return { model: { ...m, phase: { ...p, step } }, effects: [hook] }
    default:
      return unreachable(p)
  }
}

/** The gap has passed: the animation the roll picks from what the character plays now, or back to a rest with nothing to wait for. */
const startAmbient = (m: Model, roll: number, ambientOf: Ambient): Result => {
  const choices = ambientOf()
  const animation = choices[Math.min(choices.length - 1, Math.floor(roll * choices.length))]
  if (animation === undefined) return { model: { ...m, phase: { kind: 'resting' } }, effects: [{ do: 'stop' }] }
  const shown: Shown = { state: 'resting', animation, frame: 0 }

  return {
    model: { ...m, phase: { kind: 'ambient', animation, step: 0, steps: animation.frames }, shown },
    effects: [{ do: 'stop' }, { do: 'draw', shown }, { do: 'every', ms: animation.msPerFrame }],
  }
}

/** One tick of an ambient animation: the next frame, or the end, when the rest comes back and the next gap starts. */
const advanceAmbient = (m: Model, p: Extract<Phase, { kind: 'ambient' }>, playsFor: Lookup, ambientOf: Ambient): Result => {
  const step = p.step + 1
  if (step >= p.steps) return begin(m, playsFor, ambientOf, false)

  return show({ ...m, phase: { ...p, step } }, { state: 'resting', animation: p.animation, frame: step })
}

/**
 * The rest with nothing to wait for becomes a rest with a gap pending, or the other way round, when motion or the character's list changed.
 * An ambient animation under way is cut short (the rest is drawn) when `cutsAmbient` says it can no longer play on; an entry is never touched.
 */
const reconsider = (m: Model, playsFor: Lookup, ambientOf: Ambient, cutsAmbient: boolean): Result => {
  switch (m.phase.kind) {
    case 'resting':
      return waitsAt(m, m.shown.animation, ambientOf) ? { model: { ...m, phase: { kind: 'between' } }, effects: [{ do: 'wait' }] } : same(m)
    case 'between':
      return waitsAt(m, m.shown.animation, ambientOf) ? same(m) : { model: { ...m, phase: { kind: 'resting' } }, effects: [{ do: 'stop' }] }
    case 'ambient':
      return cutsAmbient ? begin(m, playsFor, ambientOf, false) : same(m)
    case 'playing':
    case 'holding':
      return same(m)
    default:
      return unreachable(m.phase)
  }
}

/** The one place the model changes. Pure: it calls no clock, no draw, no hook and no random number. */
export const transition = (m: Model, e: Event, playsFor: Lookup, ambientOf: Ambient = noAmbient): Result => {
  switch (e.type) {
    case 'set': {
      if (m.conditions[e.condition] === e.isOn) return same(m)
      const next = { ...m, conditions: { ...m.conditions, [e.condition]: e.isOn } }
      const rest = restingOf(next.conditions)
      // A change that leaves the resting animation as it is (a search ending while a turn writes) must not restart it.
      if (rest === m.shown.state) return same(next)
      switch (m.phase.kind) {
        case 'resting':
        case 'between':
        case 'ambient':
          return begin(next, playsFor, ambientOf, false)
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
        case 'between':
        case 'ambient':
          return begin(next, playsFor, ambientOf, false)
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
        case 'between':
          // The gap is the only timer, and it is not a tick.
          return same(m)
        case 'ambient':
          return advanceAmbient(m, p, playsFor, ambientOf)
        case 'playing':
        case 'holding':
          return advance(m, p, playsFor, ambientOf)
        default:
          return unreachable(p)
      }
    }
    case 'motion': {
      if (m.isMotionOn === e.isOn) return same(m)

      // An ambient animation under way is cut short by turning motion off; it is not by turning it on.
      return reconsider({ ...m, isMotionOn: e.isOn }, playsFor, ambientOf, !e.isOn)
    }
    case 'gap': {
      switch (m.phase.kind) {
        case 'between':
          return startAmbient(m, e.roll, ambientOf)
        case 'resting':
        case 'ambient':
        case 'playing':
        case 'holding':
          return same(m)
        default:
          return unreachable(m.phase)
      }
    }
    case 'look':
      // The old character's ambient animation may need anchors the new one lacks, so it does not play on.
      return reconsider(m, playsFor, ambientOf, true)
    default:
      return unreachable(e)
  }
}

/** `draw` is called with every picture to show: when what is shown changes, and on `repaint`. */
export const createActivity = (clock: Clock, draw: (shown: Shown) => void, playsFor: Lookup, ambientOf: Ambient = noAmbient): Activity => {
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
      case 'wait':
        timer?.cancel()
        timer = clock.after(gapMs(), () => dispatch({ type: 'gap', roll: Math.random() }))

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
        const result = transition(model, next, playsFor, ambientOf)
        model = result.model
        result.effects.forEach(run)
      }
    } finally {
      isBusy = false
    }
  }

  return {
    set: (condition, isOn) => dispatch({ type: 'set', condition, isOn }),
    setMotion: isOn => dispatch({ type: 'motion', isOn }),
    has: condition => model.conditions[condition],
    queue: entry => dispatch({ type: 'queue', entry }),
    lookChanged: () => dispatch({ type: 'look' }),
    repaint: () => {
      dispatch({ type: 'look' })
      draw(model.shown)
    },
    shown: () => model.shown,
  }
}
