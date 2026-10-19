// What the sidekick is doing: the conditions that hold now (a turn runs, a search runs), a queue of
// once-only animations, and, while it rests with nothing going on, its ambient motion; and where it stands on the stage and which way it faces, and its walks from place to place. One small unit,
// one timer, and no knowledge of the pane beyond whether it is the one shown. register.tsx tells it what happens; it tells register.tsx what to draw.
//
// A pure `transition(model, event, playsFor, ambientOf, backdrop)` is the only place anything changes: it returns the next model
// and the effects to run, as data. `createActivity` is the shell: it owns the timer of what plays (one at a time) and, apart from it, the timer of a background that moves at rest,
// and runs the effects in order, and it is the one place that draws a random number (the length of the gap between ambient animations, and which one plays).
import type { Timer } from 'claude-code'

import type { Moment } from './sprite/registry'
import type { Animation, Place } from './sprite/types'
import { HOME } from './sprite/types'

export type { Moment }

/** The things that can be going on at the same time; each is either on or off. */
export const CONDITIONS = ['turn', 'search'] as const
export type Condition = (typeof CONDITIONS)[number]

/** Answers what plays for a moment. Given, not imported, so the activity and the pane cannot disagree. Asked once when something starts; the answer is kept and never asked again for that run. */
export type Lookup = (moment: Moment) => Animation

/** Answers which ambient animations the character in use plays on its own; empty for a character with none. Given, like `Lookup`, and asked again whenever the answer matters. */
export type Ambient = () => readonly Animation[]
const noAmbient: Ambient = () => []

/** Answers how many frames the background drawn now has in all (see `backgroundFrames`); one for a still background or none. Given, like `Lookup`, and asked again whenever the answer matters. */
export type Backdrop = () => number
const noBackdrop: Backdrop = () => 1

/**
 * Answers where the character in use may stand and how it walks: `min` and `max` are how far left and right of home it may stand, in pixels, and `walk` is the animation it walks with,
 * undefined for a character with no walk cycle (it then appears at its place, as with motion off). Given, like `Lookup`, and asked again whenever the answer matters.
 */
export type Room = () => { readonly min: number; readonly max: number; readonly walk: Animation | undefined }
const noRoom: Room = () => ({ min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY, walk: undefined })

/** How long a background with several frames shows each of them while the sidekick rests, in milliseconds. */
export const BACKGROUND_STEP_MS = 2_000

/** How long the sidekick rests, in milliseconds, between one ambient animation and the next: a whole number from `min` to `max`, both included. */
export const AMBIENT_GAP_MS = { min: 5_000, max: 15_000 } as const
const gapMs = (): number => AMBIENT_GAP_MS.min + Math.floor(Math.random() * (AMBIENT_GAP_MS.max - AMBIENT_GAP_MS.min + 1))

/** A picture to show: the animation resolved when it began, the frame of it, and where the sidekick stands. `moment` says what the sidekick is doing; while it walks, it is the moment it rests in. */
export type Shown = { readonly moment: Moment; readonly animation: Animation; readonly frame: number; readonly place: Place }

/** A once-only animation waiting its turn. */
export type Entry = {
  readonly moment: Moment
  /** Keeps the entry going this many steps past the last frame of the animation that plays when it starts: the ticket strike has one step more than the animation for the ticket-done moment has frames. The sidekick rests meanwhile. */
  readonly restSteps?: number
  /** Called when the entry starts to play, before its first frame is drawn, with the steps it will have in all (rest steps included) and the animation resolved for it, which it keeps in step with. */
  readonly onStart?: (steps: number, animation: Animation) => void
  /** Called at every tick after the first, with the step it is at; it includes the rest steps. */
  readonly onStep?: (step: number) => void
  /** Called when the entry is over, before what comes next is drawn. */
  readonly onEnd?: () => void
  /** The entry is kept when it arrives while the pane is not shown, and plays once when the pane is next shown. An entry without it is dropped then: its moment has passed. */
  readonly isKeptWhenHidden?: boolean
  /** The entry plays only with motion on: it is dropped when it arrives with motion off, and one still waiting when motion is turned off is dropped. One under way plays out. */
  readonly needsMotion?: boolean
}

/** The part of the clock the activity needs; `$.clock` has it. */
export type Clock = { every: (ms: number, fn: () => void) => Timer; after: (ms: number, fn: () => void) => Timer }

export type Activity = {
  /** The background frame the rest shows now: its own, while the background moves by itself at rest; undefined when it steps with the animation (or does not move). */
  background: () => number | undefined
  /** Turns a condition on or off. */
  set: (condition: Condition, isOn: boolean) => void
  /** Turns ambient motion on or off. It starts off; with it off no timer runs at rest. */
  setMotion: (isOn: boolean) => void
  /** Tells the activity whether the pane is the one shown. It starts shown. Hidden, nothing is drawn and no timer runs; shown again, it does what the conditions call for. */
  setShown: (isShown: boolean) => void
  /** Whether the condition holds now. */
  has: (condition: Condition) => boolean
  /** Adds a once-only animation behind those already waiting. It plays at once when none is playing. */
  queue: (entry: Entry) => void
  /** Tells the activity the look changed without drawing: it asks again what the character plays on its own, and drops an ambient animation of the old character. */
  lookChanged: () => void
  /** Draws what is shown now again, for a change that is not the activity's own (a new look), and asks again what ambient motion the character has. */
  repaint: () => void
  /** What is shown now: the moment, the animation that was resolved for it and its frame. */
  shown: () => Shown
}

// The machine. `resting` loops what still goes on; `between` is a rest with nothing going on and a gap pending, until the next ambient
// animation; `ambient` plays that animation; `playing` runs an entry through its frames; `holding` is an entry whose animation is over
// but whose rest steps are not, the sidekick resting meanwhile. An entry or a condition that arrives in `between` or `ambient` takes over at once.
// `walking` is the sidekick on its way to a place, a pixel a step, before an entry that starts there or after one that ends there.
// `away` is every phase while the pane is not the one shown: nothing is drawn and no timer runs. The conditions still follow what happens, entries
// that are kept wait, and when the pane is shown the machine begins afresh from them.

export const PHASES = ['resting', 'between', 'ambient', 'playing', 'holding', 'walking', 'away'] as const
export type PhaseKind = (typeof PHASES)[number]

/** An animation under way: the one resolved when it began (never asked for again), the step it is at, and how many steps it has in all. */
type Play = { readonly animation: Animation; readonly step: number; readonly steps: number }

/** An entry under way: its animation, and how many steps it has in all (rest steps included). */
type Run = Play & { readonly entry: Entry }

/** A walk under way: the walk cycle resolved when it began, the step it is at, the x it is walking to (within the room, in pixels right of home), and the entry that starts when it gets there, with the animation resolved for it, when there is one. */
type Walk = { readonly animation: Animation; readonly step: number; readonly to: number; readonly run?: Next }

/** An entry about to start and the animation resolved for it (never asked for again). */
type Next = { readonly entry: Entry; readonly animation: Animation }

/** What each kind carries; a kind missing here does not compile. */
type Fields = {
  resting: Record<never, never>
  between: Record<never, never>
  ambient: Play
  playing: Run
  holding: Run
  walking: Walk
  away: Record<never, never>
}
export type Phase = { [K in PhaseKind]: { readonly kind: K } & Fields[K] }[PhaseKind]

export type Model = {
  readonly conditions: Readonly<Record<Condition, boolean>>
  /** Whether ambient motion is on. The model starts with it off; register.tsx turns it on from the saved setting. */
  readonly isMotionOn: boolean
  readonly waiting: readonly Entry[]
  readonly phase: Phase
  /** While holding or between this is always the resting moment at frame 0, so leaving it for rest needs no draw. */
  readonly shown: Shown
  /** The frame of a moving background that the rest shows; it keeps its place while something else plays, and goes back to 0 when motion is turned off. */
  readonly cycle: number
  /** Whether the background's own timer is running: motion is on, the background has several frames, and the sidekick rests with a still picture. */
  readonly isCycling: boolean
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
  /** The pane is now the one shown, or no longer. */
  | { readonly type: 'view'; readonly isShown: boolean }
  /** The background's interval has passed: it steps to its next frame. */
  | { readonly type: 'cycle' }

export type Effect =
  /** `background` is the frame of the background to draw when it has one of its own; without it the background steps with the animation. */
  | { readonly do: 'draw'; readonly shown: Shown; readonly background?: number }
  | { readonly do: 'stop' }
  /** Start the background's timer, beside the one for what plays (replacing its own): a `cycle` event every `ms`. */
  | { readonly do: 'cycle'; readonly ms: number }
  /** Cancel the background's timer. */
  | { readonly do: 'uncycle' }
  | { readonly do: 'every'; readonly ms: number }
  /** Cancel the timer there is, and start the one gap: a random wait within `AMBIENT_GAP_MS`, chosen by the shell. */
  | { readonly do: 'wait' }
  | { readonly do: 'start'; readonly entry: Entry; readonly steps: number; readonly animation: Animation }
  | { readonly do: 'step'; readonly entry: Entry; readonly step: number }
  | { readonly do: 'end'; readonly entry: Entry }

type Result = { readonly model: Model; readonly effects: readonly Effect[] }

/** The model before anything happened. The resting animation is not resolved until something asks; the first picture is drawn when it is. */
export const initial = (playsFor: Lookup): Model => ({
  conditions: Object.fromEntries(CONDITIONS.map(condition => [condition, false])) as Record<Condition, boolean>,
  isMotionOn: false,
  waiting: [],
  phase: { kind: 'resting' },
  shown: { moment: 'resting', animation: playsFor('resting'), frame: 0, place: HOME },
  cycle: 0,
  isCycling: false,
})

const unreachable = (value: never): never => {
  throw new Error(`activity: unhandled ${JSON.stringify(value)}`)
}

const restingOf = (conditions: Model['conditions']): Moment => (conditions.turn ? 'working' : conditions.search ? 'searching' : 'resting')
const same = (model: Model): Result => ({ model, effects: [] })
const show = (model: Model, shown: Shown): Result => ({ model: { ...model, shown }, effects: [{ do: 'draw', shown }] })
/** Shows the resting animation for the conditions now, resolving it afresh. */
const showRest = (model: Model, playsFor: Lookup): Result => {
  const moment = restingOf(model.conditions)

  return show(model, { moment, animation: playsFor(moment), frame: 0, place: model.shown.place })
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
    case 'walking':
    case 'away':
      return false
    default:
      return unreachable(phase)
  }
}

/** The sidekick at `x`, facing the way it goes there (the way it faced, when it is there already). */
const standAt = (shown: Shown, x: number): Shown => ({
  ...shown,
  place: { x, facing: x === shown.place.x ? shown.place.facing : x < shown.place.x ? 'left' : 'right' },
})

/** `x` held within what the stage allows the character in use. */
const within = (room: Room, x: number): number => Math.min(Math.max(x, room().min), room().max)

/**
 * The pane goes behind another: whatever runs stops, an entry under way is over (it began while the pane was shown, so it does not play again),
 * and of those waiting only the ones that are kept stay. Nothing is drawn; the next picture is the one drawn when the pane is shown.
 * Nobody sees a walk then, so the sidekick is already where it was going: at the end place of the entry that ends, or where the walk was heading (an entry not yet started stays waiting, if kept).
 */
const goAway = (m: Model, room: Room): Result => {
  const isKept = (entry: Entry): boolean => entry.isKeptWhenHidden === true
  const waiting = m.waiting.filter(isKept)
  const away: Model = { ...m, waiting, phase: { kind: 'away' } }
  switch (m.phase.kind) {
    case 'playing':
    case 'holding': {
      const end = m.phase.animation.endAt
      const shown = end === undefined ? m.shown : standAt(m.shown, within(room, end))

      return { model: { ...away, shown }, effects: [{ do: 'stop' }, { do: 'end', entry: m.phase.entry }] }
    }
    case 'walking': {
      const entry = m.phase.run?.entry
      const kept = entry !== undefined && isKept(entry) ? [entry] : []

      return { model: { ...away, waiting: [...kept, ...waiting], shown: standAt(m.shown, within(room, m.phase.to)) }, effects: [{ do: 'stop' }] }
    }
    case 'resting':
    case 'between':
    case 'ambient':
    case 'away':
      return { model: away, effects: [{ do: 'stop' }] }
    default:
      return unreachable(m.phase)
  }
}

/**
 * Whether the sidekick waits for its next ambient animation when it rests with `animation`: motion is on, nothing is going on,
 * the rest does not move (the one timer is the gap's), and the character has something to play.
 */
const waitsAt = (m: Model, animation: Animation, ambientOf: Ambient): boolean =>
  m.isMotionOn && restingOf(m.conditions) === 'resting' && animation.frames <= 1 && ambientOf().length > 0

/**
 * Sends the sidekick to `to` (pixels right of home; within the room) before the entry starts, or before what comes next when there is none; undefined when there is nowhere to go (no place asked for, or it stands there).
 * It walks, a pixel a step, when motion is on and the character has a walk cycle; otherwise it appears there, and what comes next starts at once.
 */
const travel = (m: Model, to: number | undefined, run: Next | undefined, playsFor: Lookup, ambientOf: Ambient, room: Room): Result | undefined => {
  if (to === undefined) return undefined
  const x = within(room, to)
  if (x === m.shown.place.x) return undefined
  const { walk } = room()
  if (!m.isMotionOn || walk === undefined) return arrive({ ...m, shown: standAt(m.shown, x) }, run, playsFor, ambientOf, room)
  // It turns on the spot to face the way it goes, then walks.
  const { facing } = standAt(m.shown, x).place
  const shown: Shown = { moment: restingOf(m.conditions), animation: walk, frame: 0, place: { x: m.shown.place.x, facing } }

  return {
    model: { ...m, phase: { kind: 'walking', animation: walk, step: 0, to: x, ...(run === undefined ? {} : { run }) }, shown },
    effects: [{ do: 'stop' }, { do: 'draw', shown }, { do: 'every', ms: walk.msPerFrame }],
  }
}

/** The sidekick is where it was going: the entry that waited for it starts, or what comes next does. */
const arrive = (m: Model, run: Next | undefined, playsFor: Lookup, ambientOf: Ambient, room: Room): Result =>
  run === undefined ? begin(m, playsFor, ambientOf, false, room) : startEntry(m, run.entry, run.animation)

/** Starts an entry, now that the sidekick stands where it starts. */
const startEntry = (m: Model, entry: Entry, animation: Animation): Result => {
  const steps = animation.frames + (entry.restSteps ?? 0)
  const shown: Shown = { moment: entry.moment, animation, frame: 0, place: m.shown.place }

  return {
    model: { ...m, phase: { kind: 'playing', entry, animation, step: 0, steps }, shown },
    effects: [{ do: 'stop' }, { do: 'start', entry, steps, animation }, { do: 'draw', shown }, { do: 'every', ms: animation.msPerFrame }],
  }
}

/** Starts what comes next: the head of the queue (after a walk to where it starts, if it names a place), or the loop for what still goes on (and the gap, when ambient motion is due). `isShown` says the resting frame is on the screen already. */
const begin = (m: Model, playsFor: Lookup, ambientOf: Ambient, isShown: boolean, room: Room): Result => {
  const [entry, ...waiting] = m.waiting
  if (entry === undefined) {
    const moment = restingOf(m.conditions)
    const animation = isShown ? m.shown.animation : playsFor(moment)
    const shown: Shown = { moment, animation, frame: 0, place: m.shown.place }
    // A single frame does not move, so it needs no timer.
    const loop: Effect[] = animation.frames > 1 ? [{ do: 'every', ms: animation.msPerFrame }] : []
    const isWaiting = waitsAt(m, animation, ambientOf)

    return {
      model: { ...m, waiting, phase: { kind: isWaiting ? 'between' : 'resting' }, shown },
      effects: [{ do: 'stop' }, ...(isShown ? [] : [{ do: 'draw', shown } as const]), ...loop, ...(isWaiting ? [{ do: 'wait' } as const] : [])],
    }
  }
  const next = { ...m, waiting }
  const animation = playsFor(entry.moment)

  return travel(next, animation.startAt, { entry, animation }, playsFor, ambientOf, room) ?? startEntry(next, entry, animation)
}

/** One tick of an entry: the next frame, the start of the rest steps, or the end (and a walk to the place its animation ends at, if it names one). Only the animation kept at its start is used. */
const advance = (m: Model, p: Extract<Phase, { kind: 'playing' | 'holding' }>, playsFor: Lookup, ambientOf: Ambient, room: Room): Result => {
  const step = p.step + 1
  if (step >= p.steps) {
    const after = travel(m, p.animation.endAt, undefined, playsFor, ambientOf, room) ?? begin(m, playsFor, ambientOf, showsRest(p), room)

    return { model: after.model, effects: [{ do: 'stop' }, { do: 'end', entry: p.entry }, ...after.effects] }
  }
  const hook: Effect = { do: 'step', entry: p.entry, step }
  switch (p.kind) {
    case 'playing': {
      // The sidekick rests once the animation is over while the rest of the entry runs out; until then it shows the entry's frames.
      const drawn =
        step < p.animation.frames
          ? show({ ...m, phase: { ...p, step } }, { moment: p.entry.moment, animation: p.animation, frame: step, place: m.shown.place })
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
  const shown: Shown = { moment: 'resting', animation, frame: 0, place: m.shown.place }

  return {
    model: { ...m, phase: { kind: 'ambient', animation, step: 0, steps: animation.frames }, shown },
    effects: [{ do: 'stop' }, { do: 'draw', shown }, { do: 'every', ms: animation.msPerFrame }],
  }
}

/** One tick of an ambient animation: the next frame, or the end, when the rest comes back and the next gap starts. */
const advanceAmbient = (m: Model, p: Extract<Phase, { kind: 'ambient' }>, playsFor: Lookup, ambientOf: Ambient, room: Room): Result => {
  const step = p.step + 1
  if (step >= p.steps) return begin(m, playsFor, ambientOf, false, room)

  return show({ ...m, phase: { ...p, step } }, { moment: 'resting', animation: p.animation, frame: step, place: m.shown.place })
}

/** One tick of a walk: a pixel nearer its place, and the next step of the walk cycle; the tick that gets there starts what waited for it (the walk is not drawn that last time). */
const advanceWalk = (m: Model, p: Extract<Phase, { kind: 'walking' }>, playsFor: Lookup, ambientOf: Ambient, room: Room): Result => {
  // The room is asked again: a look that changed it keeps the sidekick on the stage it has now.
  const to = within(room, p.to)
  const x = m.shown.place.x + Math.sign(to - m.shown.place.x)
  if (x === to) return arrive({ ...m, shown: standAt(m.shown, x) }, p.run, playsFor, ambientOf, room)
  const step = p.step + 1
  const shown: Shown = { ...m.shown, frame: step % p.animation.frames, place: { ...m.shown.place, x } }

  return show({ ...m, phase: { ...p, step } }, shown)
}

/**
 * The rest with nothing to wait for becomes a rest with a gap pending, or the other way round, when motion or the character's list changed.
 * An ambient animation under way is cut short (the rest is drawn) when `cutsAmbient` says it can no longer play on; an entry is never touched. A walk goes on unless the character no longer has the walk cycle it began with: it ends where it was going, and what waited starts.
 */
const reconsider = (m: Model, playsFor: Lookup, ambientOf: Ambient, cutsAmbient: boolean, room: Room): Result => {
  switch (m.phase.kind) {
    case 'resting':
      return waitsAt(m, m.shown.animation, ambientOf) ? { model: { ...m, phase: { kind: 'between' } }, effects: [{ do: 'wait' }] } : same(m)
    case 'between':
      return waitsAt(m, m.shown.animation, ambientOf) ? same(m) : { model: { ...m, phase: { kind: 'resting' } }, effects: [{ do: 'stop' }] }
    case 'ambient':
      return cutsAmbient ? begin(m, playsFor, ambientOf, false, room) : same(m)
    case 'walking':
      return room().walk === m.phase.animation
        ? same(m)
        : arrive({ ...m, shown: standAt(m.shown, within(room, m.phase.to)) }, m.phase.run, playsFor, ambientOf, room)
    case 'playing':
    case 'holding':
    case 'away':
      return same(m)
    default:
      return unreachable(m.phase)
  }
}

/** Whether a phase shows a picture that stays as it is until something happens, as against an entry or an ambient animation (a hold included: the whole entry steps the background with its animation). */
const isStill = (phase: Phase): boolean => phase.kind === 'resting' || phase.kind === 'between'

/**
 * Whether the background moves by itself: motion is on, it has several frames, and the sidekick rests with a picture that does not move.
 * While an animation plays, or the pane is hidden, it does not: it steps with the animation, as it always did. A walk is not an animation of that kind: the background keeps its own pace under it.
 */
const cyclesAt = (m: Model, backdrop: Backdrop): boolean =>
  m.isMotionOn && backdrop() > 1 && ((isStill(m.phase) && m.shown.animation.frames <= 1) || m.phase.kind === 'walking')

/** The frame of its own that the background shows now, or undefined when it steps with the animation. */
export const backgroundOf = (m: Model, backdrop: Backdrop): number | undefined => (cyclesAt(m, backdrop) ? m.cycle % backdrop() : undefined)

/**
 * Adds to a result what the background at rest needs, the same for every event: the frame of its own on each picture drawn while it moves by itself,
 * its timer when it starts to move and when it stops, and the first frame again when motion is turned off.
 */
const withBackdrop = (result: Result, backdrop: Backdrop): Result => {
  const was = result.model
  const cycles = cyclesAt(was, backdrop)
  const cycle = was.isMotionOn ? was.cycle : 0
  // A model that needs no change is handed back as it is.
  const model: Model = cycles === was.isCycling && cycle === was.cycle ? was : { ...was, isCycling: cycles, cycle }
  const background = backgroundOf(model, backdrop)
  const effects: Effect[] = result.effects.map(effect => (effect.do === 'draw' && background !== undefined ? { ...effect, background } : effect))
  if (cycles && !was.isCycling) effects.push({ do: 'cycle', ms: BACKGROUND_STEP_MS })
  if (!cycles && was.isCycling) {
    effects.push({ do: 'uncycle' })
    // Motion turned off while the rest showed a later frame of the background: the rest is drawn again, from its first.
    if (!was.isMotionOn && was.cycle !== 0 && isStill(was.phase)) effects.push({ do: 'draw', shown: was.shown })
  }

  return { model, effects }
}

/** The one place the model changes. Pure: it calls no clock, no draw, no hook and no random number. */
export const transition = (
  m: Model,
  e: Event,
  playsFor: Lookup,
  ambientOf: Ambient = noAmbient,
  backdrop: Backdrop = noBackdrop,
  room: Room = noRoom,
): Result => withBackdrop(reduce(m, e, playsFor, ambientOf, backdrop, room), backdrop)

const reduce = (m: Model, e: Event, playsFor: Lookup, ambientOf: Ambient, backdrop: Backdrop, room: Room): Result => {
  switch (e.type) {
    case 'set': {
      if (m.conditions[e.condition] === e.isOn) return same(m)
      const next = { ...m, conditions: { ...m.conditions, [e.condition]: e.isOn } }
      const rest = restingOf(next.conditions)
      // A change that leaves the resting animation as it is (a search ending while a turn writes) must not restart it.
      if (rest === m.shown.moment) return same(next)
      switch (m.phase.kind) {
        case 'resting':
        case 'between':
        case 'ambient':
          return begin(next, playsFor, ambientOf, false, room)
        case 'playing':
        case 'walking':
          return same(next)
        case 'holding':
          return showRest(next, playsFor)
        case 'away':
          return same(next)
        default:
          return unreachable(m.phase)
      }
    }
    case 'queue': {
      // An entry that needs motion is not for a sidekick that holds still.
      if (e.entry.needsMotion === true && !m.isMotionOn) return same(m)
      const next = { ...m, waiting: [...m.waiting, e.entry] }
      switch (m.phase.kind) {
        case 'away':
          return e.entry.isKeptWhenHidden === true ? same(next) : same(m)
        case 'resting':
        case 'between':
        case 'ambient':
          return begin(next, playsFor, ambientOf, false, room)
        case 'playing':
        case 'holding':
        case 'walking':
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
        case 'away':
          // The gap is the only timer, and it is not a tick. Away there is no timer; a tick on its way when the pane went behind another is ignored.
          return same(m)
        case 'ambient':
          return advanceAmbient(m, p, playsFor, ambientOf, room)
        case 'playing':
        case 'holding':
          return advance(m, p, playsFor, ambientOf, room)
        case 'walking':
          return advanceWalk(m, p, playsFor, ambientOf, room)
        default:
          return unreachable(p)
      }
    }
    case 'motion': {
      if (m.isMotionOn === e.isOn) return same(m)

      const next = { ...m, isMotionOn: e.isOn, waiting: e.isOn ? m.waiting : m.waiting.filter(entry => entry.needsMotion !== true) }
      // A walk does not go on without motion: the sidekick appears where it was going, and what waited for it starts.
      if (m.phase.kind === 'walking' && !e.isOn)
        return arrive({ ...next, shown: standAt(m.shown, within(room, m.phase.to)) }, m.phase.run, playsFor, ambientOf, room)

      // An ambient animation under way is cut short by turning motion off; it is not by turning it on.
      return reconsider(next, playsFor, ambientOf, !e.isOn, room)
    }
    case 'gap': {
      switch (m.phase.kind) {
        case 'between':
          return startAmbient(m, e.roll, ambientOf)
        case 'resting':
        case 'ambient':
        case 'playing':
        case 'holding':
        case 'walking':
        case 'away':
          return same(m)
        default:
          return unreachable(m.phase)
      }
    }
    case 'cycle':
      // A step that arrives when the background no longer moves by itself (its timer was cancelled on the way) is ignored.
      return m.isCycling ? show({ ...m, cycle: (m.cycle + 1) % backdrop() }, m.shown) : same(m)
    case 'look':
      // The old character's ambient animation may need anchors the new one lacks, so it does not play on.
      return reconsider(m, playsFor, ambientOf, true, room)
    case 'view': {
      if (e.isShown === (m.phase.kind !== 'away')) return same(m)
      // Shown again, it does what the conditions call for now (or rests), after the animations that were kept; its ambient wait starts afresh.
      return e.isShown ? begin({ ...m, phase: { kind: 'resting' } }, playsFor, ambientOf, false, room) : goAway(m, room)
    }
    default:
      return unreachable(e)
  }
}

/**
 * `draw` is called with every picture to show, and the frame of the background when it moves by itself at rest (otherwise the background steps with the animation):
 * when what is shown changes, when the background steps, and on `repaint`, never while the pane is not shown.
 * `isShownNow`, when given, is asked each time the timer fires, before the sidekick acts on it, so a pane that went behind another is found out at once
 * and shows nothing more; without it the pane is taken to be shown until `setShown` says otherwise.
 * The timer is the walk's while the sidekick walks (one pixel a tick), and the sidekick's place is part of every picture (`Shown.place`).
 */
export const createActivity = (
  clock: Clock,
  draw: (shown: Shown, background?: number) => void,
  playsFor: Lookup,
  ambientOf: Ambient = noAmbient,
  isShownNow?: () => Promise<boolean>,
  backdrop: Backdrop = noBackdrop,
  room: Room = noRoom,
): Activity => {
  let model = initial(playsFor)
  let timer: Timer | undefined
  let cycleTimer: Timer | undefined
  const inbox: Event[] = []
  let isBusy = false

  const run = (effect: Effect): void => {
    switch (effect.do) {
      case 'draw':
        draw(effect.shown, effect.background)

        return
      case 'stop':
        timer?.cancel()
        timer = undefined

        return
      case 'cycle':
        cycleTimer?.cancel()
        cycleTimer = clock.every(effect.ms, () => fire({ type: 'cycle' }, () => cycleTimer))

        return
      case 'uncycle':
        cycleTimer?.cancel()
        cycleTimer = undefined

        return
      case 'every':
        timer?.cancel()
        timer = clock.every(effect.ms, () => fire({ type: 'tick' }, () => timer))

        return
      case 'wait':
        timer?.cancel()
        timer = clock.after(gapMs(), () => fire({ type: 'gap', roll: Math.random() }, () => timer))

        return
      case 'start':
        effect.entry.onStart?.(effect.steps, effect.animation)

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
  // What a timer fires: the event, once the pane is known to be shown. If it is not, the pane goes away instead and the event is not acted on.
  // `current` is the timer's own slot: one that was replaced while the answer was awaited fired for something that is over.
  const fire = (event: Event, current: () => Timer | undefined): void => {
    if (isShownNow === undefined) {
      dispatch(event)

      return
    }
    const fired = current()
    void isShownNow().then(isShown => {
      dispatch({ type: 'view', isShown })
      if (current() === fired) dispatch(event)
    })
  }
  // One event at a time: a hook that calls set or queue is handled after the effects now running.
  const dispatch = (event: Event): void => {
    inbox.push(event)
    if (isBusy) return
    isBusy = true
    try {
      for (let next = inbox.shift(); next !== undefined; next = inbox.shift()) {
        const result = transition(model, next, playsFor, ambientOf, backdrop, room)
        model = result.model
        result.effects.forEach(run)
      }
    } finally {
      isBusy = false
    }
  }

  return {
    background: () => backgroundOf(model, backdrop),
    set: (condition, isOn) => dispatch({ type: 'set', condition, isOn }),
    setMotion: isOn => dispatch({ type: 'motion', isOn }),
    setShown: isShown => dispatch({ type: 'view', isShown }),
    has: condition => model.conditions[condition],
    queue: entry => dispatch({ type: 'queue', entry }),
    lookChanged: () => dispatch({ type: 'look' }),
    repaint: () => {
      dispatch({ type: 'look' })
      if (model.phase.kind !== 'away') draw(model.shown, backgroundOf(model, backdrop))
    },
    shown: () => model.shown,
  }
}
