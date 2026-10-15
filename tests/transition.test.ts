import { expect, test } from 'claude-code/testing'

import { CONDITIONS, PHASES, createActivity, initial, transition } from '../hooks/activity'
import type { Condition, Effect, Entry, Event, Lookup, Model, Phase, Shown } from '../hooks/activity'
import type { Animation } from '../hooks/sprite/types'

// The pure transition of the activity, with a made-up lookup so no test depends on the art.

const fake = (frames: number, msPerFrame: number): Animation => ({ needs: [], frames, msPerFrame, once: false, hides: [], frame: () => ({}) })
const FAKE: Record<string, Animation> = {
  resting: fake(1, 200),
  working: fake(3, 100),
  searching: fake(2, 150),
  'ticket-done': fake(2, 50),
  'set-done': fake(4, 70),
}
const playsFor: Lookup = state => FAKE[state] ?? fake(1, 1)
const INITIAL = initial(playsFor)

const entry = (state: Entry['state'], restSteps?: number): Entry => ({ state, ...(restSteps === undefined ? {} : { restSteps }) })
const zap = entry('ticket-done')

/** A draw effect for a state at a frame, with the animation the fake lookup gives. */
const draw = (state: Shown['state'], frame: number): Effect => ({ do: 'draw', shown: { state, animation: playsFor(state), frame } })

/** Applies the events in order, collecting every effect. */
const feed = (events: readonly Event[], from: Model = INITIAL, lookup: Lookup = playsFor): { model: Model; effects: Effect[] } => {
  let model = from
  const effects: Effect[] = []
  for (const event of events) {
    const result = transition(model, event, lookup)
    model = result.model
    effects.push(...result.effects)
  }

  return { model, effects }
}
const tick: Event = { type: 'tick' }
const on = (condition: Condition): Event => ({ type: 'set', condition, isOn: true })
const off = (condition: Condition): Event => ({ type: 'set', condition, isOn: false })
const queue = (e: Entry): Event => ({ type: 'queue', entry: e })

test('the phases are the three kinds, and a model starts resting with nothing to do', async () => {
  expect(PHASES).toEqual(['resting', 'playing', 'holding'])
  expect(CONDITIONS).toEqual(['turn', 'search'])
  expect(INITIAL.phase).toEqual({ kind: 'resting' })
  expect(INITIAL.shown).toEqual({ state: 'resting', animation: playsFor('resting'), frame: 0 })
})

test('queueing at rest starts the entry: stop, start, draw its first frame, then its timer', async () => {
  const { model, effects } = feed([queue(zap)])
  expect(model.phase).toEqual({ kind: 'playing', entry: zap, animation: playsFor('ticket-done'), step: 0, steps: 2 })
  expect(effects).toEqual([{ do: 'stop' }, { do: 'start', entry: zap, steps: 2 }, draw('ticket-done', 0), { do: 'every', ms: 50 }])
})

test('queueing while an entry plays or holds waits behind it and does nothing else', async () => {
  const playing = feed([queue(zap)]).model
  const second = entry('set-done')
  const queued = transition(playing, queue(second), playsFor)
  expect(queued.effects).toEqual([])
  expect(queued.model.phase).toBe(playing.phase)
  expect(queued.model.waiting).toEqual([second])
  const holding = feed([queue(entry('ticket-done', 2)), tick, tick], INITIAL).model
  expect(holding.phase.kind).toBe('holding')
  expect(transition(holding, queue(second), playsFor).effects).toEqual([])
})

test('the steps are the frames of the animation that plays when the entry starts, plus its rest steps', async () => {
  const stepsOf = (e: Entry, lookup: Lookup = playsFor): number => {
    const { phase } = feed([queue(e)], INITIAL, lookup).model
    return phase.kind === 'playing' ? phase.steps : -1
  }
  expect(stepsOf(entry('ticket-done'))).toBe(2)
  expect(stepsOf(entry('ticket-done', 1))).toBe(3)
  expect(stepsOf(entry('set-done', 3))).toBe(7)
  // Another animation answered by the lookup is followed: the count is not fixed when the entry is made.
  const longer: Lookup = state => (state === 'ticket-done' ? fake(5, 50) : playsFor(state))
  expect(stepsOf(entry('ticket-done', 1), longer)).toBe(6)
})

test('an entry whose animation is over rests while its rest steps run out, then ends with no repeated draw', async () => {
  const e = entry('ticket-done', 2)
  const afterFirst = feed([queue(e), tick])
  expect(afterFirst.effects.slice(4)).toEqual([{ do: 'step', entry: e, step: 1 }, draw('ticket-done', 1)])
  const held = transition(afterFirst.model, tick, playsFor)
  expect(held.effects).toEqual([{ do: 'step', entry: e, step: 2 }, draw('resting', 0)])
  expect(held.model.phase).toEqual({ kind: 'holding', entry: e, animation: playsFor('ticket-done'), step: 2, steps: 4 })
  const stillHeld = transition(held.model, tick, playsFor)
  expect(stillHeld.effects).toEqual([{ do: 'step', entry: e, step: 3 }])
  const over = transition(stillHeld.model, tick, playsFor)
  // Holding already shows the resting frame, so leaving it draws nothing; a single-frame rest needs no timer.
  expect(over.effects).toEqual([{ do: 'stop' }, { do: 'end', entry: e }, { do: 'stop' }])
  expect(over.model.phase).toEqual({ kind: 'resting' })
})

test('a run keeps the animation it began with: holding never draws a frame of the entry, whatever the lookup says later', async () => {
  const e = entry('ticket-done', 3)
  let frames = 2
  const moving: Lookup = state => (state === 'ticket-done' ? fake(frames, 50) : playsFor(state))
  const held = feed([queue(e), tick, tick], INITIAL, moving).model
  expect(held.phase.kind).toBe('holding')
  expect(held.shown).toEqual({ state: 'resting', animation: playsFor('resting'), frame: 0 })
  // The lookup now answers a longer animation, as when the character changes under a running entry.
  frames = 4
  const next = transition(held, tick, moving)
  expect(next.effects).toEqual([{ do: 'step', entry: e, step: 3 }])
  expect(next.model.shown).toBe(held.shown)
  expect(next.model.phase.kind).toBe('holding')
})

test('a condition that changes the resting animation during the hold redraws the rest, and the hold goes on', async () => {
  const held = feed([queue(entry('ticket-done', 3)), tick, tick]).model
  expect(held.phase.kind).toBe('holding')
  const result = transition(held, on('turn'), playsFor)
  expect(result.effects).toEqual([draw('working', 0)])
  expect(result.model.phase).toBe(held.phase)
  expect(result.model.shown).toEqual({ state: 'working', animation: playsFor('working'), frame: 0 })
  // The hold ends at the new rest, with no draw and a timer for the new state.
  const over = feed([tick, tick, tick], result.model)
  expect(over.effects.filter(effect => effect.do === 'draw')).toEqual([])
  expect(over.effects.at(-1)).toEqual({ do: 'every', ms: 100 })
})

test('a condition set during an animation only records; a set that leaves the resting animation as it is does nothing', async () => {
  const playing = feed([queue(zap)]).model
  const result = transition(playing, on('turn'), playsFor)
  expect(result.effects).toEqual([])
  expect(result.model.conditions.turn).toBe(true)
  expect(result.model.phase).toBe(playing.phase)
  // A search ending while a turn runs leaves 'working' as the rest.
  const working = feed([on('turn'), on('search')]).model
  expect(transition(working, off('search'), playsFor).effects).toEqual([])
  // Setting a condition to the value it has is the same model.
  expect(transition(working, on('turn'), playsFor).model).toBe(working)
})

test('at rest a condition restarts the rest loop, and a single-frame rest has no timer', async () => {
  const finished = feed([queue(zap), tick, tick]).effects
  expect(finished.at(-1)).toEqual(draw('resting', 0))
  expect(finished.filter(effect => effect.do === 'every')).toEqual([{ do: 'every', ms: 50 }])
  const turn = feed([on('turn')])
  expect(turn.effects).toEqual([{ do: 'stop' }, draw('working', 0), { do: 'every', ms: 100 }])
  const ended = feed([off('turn')], turn.model)
  expect(ended.effects).toEqual([{ do: 'stop' }, draw('resting', 0)])
  // The loop wraps around the frames of the state.
  expect(feed([tick, tick, tick, tick], turn.model).model.shown.frame).toBe(1)
})

test('what is queued plays in order, each once, and the rest comes back after the last', async () => {
  const a = entry('ticket-done')
  const b = entry('set-done')
  const { effects, model } = feed([queue(a), queue(b), tick, tick, tick, tick, tick, tick])
  const kinds = effects.flatMap(effect => (effect.do === 'start' || effect.do === 'end' ? [`${effect.do}:${effect.entry.state}`] : []))
  expect(kinds).toEqual(['start:ticket-done', 'end:ticket-done', 'start:set-done', 'end:set-done'])
  expect(model.phase).toEqual({ kind: 'resting' })
  expect(model.waiting).toEqual([])
})

test('a hook that queues from onEnd is handled after the effects now running, never inside them', async () => {
  const timers: { fn: () => void; isOn: boolean }[] = []
  const clock = {
    every: (_ms: number, fn: () => void) => {
      const timer = { fn, isOn: true }
      timers.push(timer)
      return { cancel: () => { timer.isOn = false } } as ReturnType<Parameters<typeof createActivity>[0]['every']>
    },
  }
  const log: string[] = []
  const first: Entry = {
    state: 'ticket-done',
    onEnd: () => {
      log.push('end')
      activity.queue({ state: 'set-done', onStart: () => log.push('start after') })
      log.push('end returned')
    },
  }
  const activity = createActivity(clock, ({ state, frame }) => void log.push(`draw ${state} ${frame}`), playsFor)
  activity.queue(first)
  timers.filter(timer => timer.isOn).at(-1)?.fn()
  timers.filter(timer => timer.isOn).at(-1)?.fn()
  // The queue from onEnd returned before the next entry started: no re-entry.
  expect(log.indexOf('end returned')).toBeLessThan(log.indexOf('start after'))
  expect(log.filter(line => line === 'start after')).toEqual(['start after'])
  expect(timers.filter(timer => timer.isOn).length).toBe(1)
})

test('a phase cannot be written down without what it needs', async () => {
  // @ts-expect-error a holding phase needs its entry, animation, step and steps
  const bad: Phase = { kind: 'holding' }
  expect(bad.kind).toBe('holding')
})
