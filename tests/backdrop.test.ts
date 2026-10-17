import { expect } from 'claude-code/testing'
import type { Ambient, Effect, Entry, Event, Lookup, Model } from '../hooks/activity'
import { BACKGROUND_STEP_MS, backgroundOf, createActivity, initial, transition } from '../hooks/activity'
import type { Animation } from '../hooks/sprite/types'
import { test } from './world'

// A background with several frames steps at a slow fixed interval while the sidekick rests, as part of ambient motion. The transition tells the shell when to start and stop
// the background's own timer and which frame of it each picture is drawn with; these tests read that, with made-up animations so nothing depends on the art.

const fake = (frames: number, msPerFrame: number): Animation => ({ needs: [], poses: [], frames, msPerFrame, once: false, hides: [], frame: () => ({}) })
const FAKE: Record<string, Animation> = {
  resting: fake(1, 200),
  working: fake(3, 100),
  searching: fake(2, 150),
  'ticket-done': fake(2, 50),
  'set-done': fake(4, 70),
}
const playsFor: Lookup = moment => FAKE[moment] ?? fake(1, 1)
const BLINK = fake(3, 90)
const ambient: Ambient = () => [BLINK]

const frames = (count: number) => () => count
const motion = (isOn: boolean): Event => ({ type: 'motion', isOn })
const cycle: Event = { type: 'cycle' }
const tick: Event = { type: 'tick' }
const queue = (entry: Entry): Event => ({ type: 'queue', entry })
const zap: Entry = { moment: 'ticket-done' }

/** Applies the events in order for a background of `count` frames (one is a still background), collecting every effect. */
const feed = (events: readonly Event[], count = 3, from: Model = initial(playsFor), ambientOf: Ambient = () => []): { model: Model; effects: Effect[] } => {
  let model = from
  const effects: Effect[] = []
  for (const event of events) {
    const result = transition(model, event, playsFor, ambientOf, frames(count))
    model = result.model
    effects.push(...result.effects)
  }

  return { model, effects }
}

const draws = (effects: readonly Effect[]): (number | undefined)[] => effects.flatMap(effect => (effect.do === 'draw' ? [effect.background] : []))
const resting = (count = 3): Model => feed([motion(true)], count).model

test('with motion on, a background of several frames starts its own timer at rest; the rest is not drawn again', async () => {
  const { model, effects } = feed([motion(true)])
  expect(effects).toEqual([{ do: 'cycle', ms: BACKGROUND_STEP_MS }])
  expect(model.isCycling).toBe(true)
  expect(model.cycle).toBe(0)
  expect(BACKGROUND_STEP_MS, 'a slow, fixed interval').toBeGreaterThanOrEqual(1000)
  // Asking again changes nothing.
  expect(transition(model, motion(true), playsFor, ambient, frames(3)).effects).toEqual([])
})

test('a still background, or none, or motion off: no timer is asked for and no picture carries a background frame', async () => {
  for (const count of [1, 0]) {
    const still = feed([motion(true), queue(zap), tick, tick, tick, motion(false)], count)
    expect(
      still.effects.filter(effect => effect.do === 'cycle' || effect.do === 'uncycle'),
      `${count} frames`,
    ).toEqual([])
    expect(draws(still.effects).every(background => background === undefined)).toBe(true)
  }
  const off = feed([queue(zap), tick, tick, tick, cycle])
  expect(off.effects.filter(effect => effect.do === 'cycle')).toEqual([])
  expect(off.model.isCycling).toBe(false)
  expect(backgroundOf(initial(playsFor), frames(3)), 'motion off: the first frame, which is the animation step 0').toBeUndefined()
})

test('each interval steps the background to its next frame, redraws the rest with it, and wraps around', async () => {
  const seen: (number | undefined)[] = []
  let model = resting()
  for (let i = 0; i < 7; i++) {
    const result = transition(model, cycle, playsFor, ambient, frames(3))
    model = result.model
    expect(result.effects, 'only the picture changes: no timer is touched').toEqual([
      { do: 'draw', shown: model.shown, background: backgroundOf(model, frames(3)) },
    ])
    seen.push(...draws(result.effects))
  }
  expect(seen).toEqual([1, 2, 0, 1, 2, 0, 1])
  // The rest it draws is the resting picture at frame 0, the same each time.
  expect(model.shown).toEqual({ moment: 'resting', animation: playsFor('resting'), frame: 0 })
})

test('the background steps without disturbing the ambient animations: the gap stays pending, and nothing is drawn but the background', async () => {
  const waiting = feed([motion(true)], 3, initial(playsFor), ambient)
  expect(waiting.effects).toEqual([{ do: 'wait' }, { do: 'cycle', ms: BACKGROUND_STEP_MS }])
  expect(waiting.model.phase).toEqual({ kind: 'between' })
  const stepped = transition(waiting.model, cycle, playsFor, ambient, frames(3))
  expect(stepped.model.phase, 'still waiting for the gap').toEqual({ kind: 'between' })
  expect(stepped.effects.map(effect => effect.do)).toEqual(['draw'])
  // The gap passes: the ambient animation plays with the background stepping with it, and its own timer stops.
  const playing = transition(stepped.model, { type: 'gap', roll: 0 }, playsFor, ambient, frames(3))
  expect(playing.effects).toEqual([
    { do: 'stop' },
    { do: 'draw', shown: { moment: 'resting', animation: BLINK, frame: 0 } },
    { do: 'every', ms: BLINK.msPerFrame },
    { do: 'uncycle' },
  ])
  // When it is over the rest comes back with the background where it was left, and the timer and the next gap start.
  let model = playing.model
  const back: Effect[] = []
  for (let i = 0; i < BLINK.frames; i++) {
    const result = transition(model, tick, playsFor, ambient, frames(3))
    model = result.model
    back.push(...result.effects)
  }
  expect(back.at(-1)).toEqual({ do: 'cycle', ms: BACKGROUND_STEP_MS })
  expect(back).toContainEqual({ do: 'wait' })
  expect(back.filter(effect => effect.do === 'draw').at(-1)).toEqual({
    do: 'draw',
    shown: { moment: 'resting', animation: playsFor('resting'), frame: 0 },
    background: 1,
  })
})

test('an animation that plays takes the background with it: its timer stops and its frames step with the animation, and it comes back at rest', async () => {
  const start = transition(resting(), queue(zap), playsFor, ambient, frames(3))
  expect(start.effects.map(effect => effect.do)).toEqual(['stop', 'start', 'draw', 'every', 'uncycle'])
  expect(draws(start.effects), 'the animation steps the background').toEqual([undefined])
  const after = feed([queue({ moment: 'ticket-done' }), tick, tick], 3, resting())
  expect(after.model.isCycling).toBe(true)
  expect(after.effects.at(-1)).toEqual({ do: 'cycle', ms: BACKGROUND_STEP_MS })
  // A turn writes: the animation loops, so the background steps with it; it rests again when the turn ends.
  const turn = feed([{ type: 'set', condition: 'turn', isOn: true }], 3, resting())
  expect(turn.model.isCycling).toBe(false)
  expect(turn.effects).toContainEqual({ do: 'uncycle' })
  expect(draws(turn.effects)).toEqual([undefined])
  const done = transition(turn.model, { type: 'set', condition: 'turn', isOn: false }, playsFor, ambient, frames(3))
  expect(done.model.isCycling).toBe(true)
  expect(done.effects).toContainEqual({ do: 'cycle', ms: BACKGROUND_STEP_MS })
})

test('a hold is part of the entry: the background steps with its animation to the end, and its own timer starts only at rest', async () => {
  const held: Entry = { moment: 'ticket-done', restSteps: 2 }
  let model = transition(resting(), queue(held), playsFor, ambient, frames(3)).model
  const effects: Effect[] = []
  for (const event of [tick, tick, tick]) {
    const result = transition(model, event, playsFor, ambient, frames(3))
    model = result.model
    effects.push(...result.effects)
    if (model.phase.kind === 'holding') expect(model.isCycling, 'holding').toBe(false)
  }
  expect(model.phase.kind).toBe('holding')
  expect(effects.some(effect => effect.do === 'cycle')).toBe(false)
  expect(draws(effects).every(background => background === undefined)).toBe(true)
  expect(transition(model, cycle, playsFor, ambient, frames(3)).effects, 'a step in the hold is ignored').toEqual([])
  const over = transition(model, tick, playsFor, ambient, frames(3))
  expect(over.model.phase.kind).toBe('between')
  expect(over.effects).toContainEqual({ do: 'cycle', ms: BACKGROUND_STEP_MS })
})

test('the background keeps its place through an animation', async () => {
  let model = resting()
  for (const event of [cycle, cycle]) model = transition(model, event, playsFor, ambient, frames(3)).model
  expect(model.cycle).toBe(2)
  const through = feed([queue(zap), tick, tick, tick], 3, model)
  expect(through.model.cycle).toBe(2)
  expect(draws(through.effects).at(-1)).toBe(2)
})

test('turning motion off stops the timer and draws the rest again from the first frame of the background', async () => {
  let model = resting()
  model = transition(model, cycle, playsFor, ambient, frames(3)).model
  const off = transition(model, motion(false), playsFor, ambient, frames(3))
  expect(off.effects).toEqual([{ do: 'uncycle' }, { do: 'draw', shown: model.shown }])
  expect(draws(off.effects)).toEqual([undefined])
  expect(off.model.cycle).toBe(0)
  expect(off.model.isCycling).toBe(false)
  // Off while the background has not left its first frame: nothing to draw again.
  expect(transition(resting(), motion(false), playsFor, ambient, frames(3)).effects).toEqual([{ do: 'uncycle' }])
  // Back on, it starts from the first frame.
  expect(transition(off.model, motion(true), playsFor, ambient, frames(3)).model.cycle).toBe(0)
})

test('a stray step after the timer is cancelled is ignored', async () => {
  const stopped = feed([motion(true), motion(false)])
  expect(transition(stopped.model, cycle, playsFor, ambient, frames(3)).effects).toEqual([])
  const playing = feed([motion(true), queue(zap)]).model
  expect(transition(playing, cycle, playsFor, ambient, frames(3)).effects).toEqual([])
})

test('the pane going behind another stops the timer and draws nothing; shown again, the timer starts afresh', async () => {
  const hidden = transition(resting(), { type: 'view', isShown: false }, playsFor, ambient, frames(3))
  expect(hidden.effects).toContainEqual({ do: 'uncycle' })
  expect(hidden.effects.some(effect => effect.do === 'draw')).toBe(false)
  expect(transition(hidden.model, cycle, playsFor, ambient, frames(3)).effects).toEqual([])
  const shown = transition(hidden.model, { type: 'view', isShown: true }, playsFor, ambient, frames(3))
  expect(shown.effects).toContainEqual({ do: 'cycle', ms: BACKGROUND_STEP_MS })
})

test('a new look is asked again: a background of several frames starts the timer, a still one stops it', async () => {
  let count = 1
  const asked = () => count
  const first = transition(initial(playsFor), motion(true), playsFor, ambient, asked)
  expect(first.effects.some(effect => effect.do === 'cycle')).toBe(false)
  count = 4
  const moving = transition(first.model, { type: 'look' }, playsFor, ambient, asked)
  expect(moving.effects).toContainEqual({ do: 'cycle', ms: BACKGROUND_STEP_MS })
  count = 1
  const still = transition(moving.model, { type: 'look' }, playsFor, ambient, asked)
  expect(still.effects).toContainEqual({ do: 'uncycle' })
  expect(backgroundOf(still.model, asked)).toBeUndefined()
})

test('the shell keeps the background on its own timer: the animation timer is left alone, and the pane is asked before a step', async () => {
  const everies: { ms: number; cancelled: boolean; fn: () => void }[] = []
  const afters: { ms: number; cancelled: boolean; fn: () => void }[] = []
  const timer = (list: typeof everies) => (ms: number, fn: () => void) => {
    const one = { ms, cancelled: false, fn }
    list.push(one)

    return {
      cancel: () => {
        one.cancelled = true
      },
    } as never
  }
  const painted: (number | undefined)[] = []
  const activity = createActivity(
    { every: timer(everies), after: timer(afters) },
    (_, background) => painted.push(background),
    playsFor,
    ambient,
    undefined,
    frames(3),
  )
  activity.setMotion(true)
  const live = () => everies.filter(one => !one.cancelled)
  expect(live().map(one => one.ms)).toEqual([BACKGROUND_STEP_MS])
  expect(
    afters.filter(one => !one.cancelled),
    'the gap is pending beside it',
  ).toHaveLength(1)
  live()[0]?.fn()
  live()[0]?.fn()
  expect(painted).toEqual([1, 2])
  expect(activity.background()).toBe(2)
  activity.repaint()
  expect(painted.at(-1), 'a repaint carries it').toBe(2)
  // An animation takes over: the background's timer is cancelled, the animation's runs.
  activity.queue(zap)
  expect(live().map(one => one.ms)).toEqual([FAKE['ticket-done']?.msPerFrame])
  expect(activity.background()).toBeUndefined()
})
