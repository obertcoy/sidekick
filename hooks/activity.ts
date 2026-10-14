// What the sidekick is doing: the conditions that hold now (a turn runs, a search runs) and a queue of
// once-only animations. One small unit, one timer, no knowledge of the pane. register.tsx tells it what
// happens; it tells register.tsx what to draw.
import type { Timer } from 'claude-code'

import { ANIMATIONS, STATES } from './sprite/registry'

/** What the sidekick can be shown doing; the registry maps each state to the animation that plays for it. */
export type State = keyof typeof STATES

/** The things that can be going on at the same time; each is either on or off. */
export type Condition = 'turn' | 'search'

/** A once-only animation waiting its turn. */
export type Entry = {
  readonly state: State
  /** Keeps the entry going this long from its start, if that is longer than the animation: the ticket strike has more steps than the zap has frames. The sidekick rests meanwhile. */
  readonly holdMs?: number
  /** Called when the entry starts to play, before its first frame is drawn. */
  readonly onStart?: () => void
  /** Called at every tick after the first, with the step it is at; it includes the hold. */
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
  /** The state being shown and the frame of its animation. */
  shown: () => { readonly state: State; readonly frame: number }
}

/** `draw` is called with every picture to show: when the state or frame changes, and on `repaint`. */
export const createActivity = (clock: Clock, draw: (state: State, frame: number) => void): Activity => {
  const conditions: Record<Condition, boolean> = { turn: false, search: false }
  const waiting: Entry[] = []
  let playing: Entry | undefined
  let isHolding = false
  let state: State = 'resting'
  let frame = 0
  let timer: Timer | undefined

  const resting = (): State => (conditions.turn ? 'working' : conditions.search ? 'searching' : 'resting')
  const stop = (): void => {
    timer?.cancel()
    timer = undefined
  }
  const show = (next: State, at: number): void => {
    state = next
    frame = at
    draw(state, frame)
  }
  const animation = (of: State) => ANIMATIONS[STATES[of]]

  // Starts what comes next: the head of the queue, or the loop for what still goes on.
  const begin = (): void => {
    stop()
    isHolding = false
    playing = waiting.shift()
    if (playing === undefined) {
      show(resting(), 0)
      // A single frame does not move, so it needs no timer.
      if (animation(state).frames > 1) {
        timer = clock.every(animation(state).msPerFrame, () => show(state, (frame + 1) % animation(state).frames))
      }

      return
    }
    const entry = playing
    const { frames, msPerFrame } = animation(entry.state)
    const steps = Math.max(frames, Math.ceil((entry.holdMs ?? 0) / msPerFrame))
    entry.onStart?.()
    show(entry.state, 0)
    let step = 0
    timer = clock.every(msPerFrame, () => {
      step += 1
      if (step >= steps) {
        stop()
        playing = undefined
        entry.onEnd?.()
        begin()

        return
      }
      entry.onStep?.(step)
      if (step < frames) show(entry.state, step)
      else if (!isHolding) {
        // The animation is over but the entry is not: the sidekick rests while the rest of the hold runs out.
        isHolding = true
        show(resting(), 0)
      }
    })
  }

  return {
    set: (condition, isOn) => {
      if (conditions[condition] === isOn) return
      conditions[condition] = isOn
      if (playing === undefined) begin()
      else if (isHolding) show(resting(), 0)
    },
    has: condition => conditions[condition],
    queue: entry => {
      waiting.push(entry)
      if (playing === undefined) begin()
    },
    repaint: () => draw(state, frame),
    shown: () => ({ state, frame }),
  }
}
