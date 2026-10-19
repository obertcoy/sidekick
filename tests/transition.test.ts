import { expect } from 'claude-code/testing'
import type { Ambient, Condition, Effect, Entry, Event, Lookup, Model, Phase, Shown } from '../hooks/activity'
import { CONDITIONS, createActivity, initial, PHASES, transition } from '../hooks/activity'
import type { Animation } from '../hooks/sprite/types'
import { HOME } from '../hooks/sprite/types'
import { test } from './world'

// The pure transition of the activity, with a made-up lookup so no test depends on the art.

const fake = (frames: number, msPerFrame: number): Animation => ({ needs: [], poses: [], frames, msPerFrame, once: false, hides: [], frame: () => ({}) })
const FAKE: Record<string, Animation> = {
  resting: fake(1, 200),
  working: fake(3, 100),
  searching: fake(2, 150),
  'ticket-done': fake(2, 50),
  'set-done': fake(4, 70),
}
const playsFor: Lookup = moment => FAKE[moment] ?? fake(1, 1)
const INITIAL = initial(playsFor)

const entry = (moment: Entry['moment'], restSteps?: number): Entry => ({ moment, ...(restSteps === undefined ? {} : { restSteps }) })
const zap = entry('ticket-done')

/** A draw effect for a moment at a frame, with the animation the fake lookup gives. */
const draw = (moment: Shown['moment'], frame: number): Effect => ({ do: 'draw', shown: { moment, animation: playsFor(moment), frame, place: HOME } })

/** Applies the events in order, collecting every effect. */
const feed = (
  events: readonly Event[],
  from: Model = INITIAL,
  lookup: Lookup = playsFor,
  ambient: Ambient = noAmbient,
): { model: Model; effects: Effect[] } => {
  let model = from
  const effects: Effect[] = []
  for (const event of events) {
    const result = transition(model, event, lookup, ambient)
    model = result.model
    effects.push(...result.effects)
  }

  return { model, effects }
}
const tick: Event = { type: 'tick' }
const on = (condition: Condition): Event => ({ type: 'set', condition, isOn: true })
const off = (condition: Condition): Event => ({ type: 'set', condition, isOn: false })
const queue = (e: Entry): Event => ({ type: 'queue', entry: e })

const noAmbient: Ambient = () => []
test('the phases are the seven kinds, and a model starts resting with nothing to do', async () => {
  expect(PHASES).toEqual(['resting', 'between', 'ambient', 'playing', 'holding', 'walking', 'away'])
  expect(INITIAL.isMotionOn).toBe(false)
  expect(CONDITIONS).toEqual(['turn', 'search'])
  expect(INITIAL.phase).toEqual({ kind: 'resting' })
  expect(INITIAL.shown).toEqual({ moment: 'resting', animation: playsFor('resting'), frame: 0, place: HOME })
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
  const longer: Lookup = moment => (moment === 'ticket-done' ? fake(5, 50) : playsFor(moment))
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
  const moving: Lookup = moment => (moment === 'ticket-done' ? fake(frames, 50) : playsFor(moment))
  const held = feed([queue(e), tick, tick], INITIAL, moving).model
  expect(held.phase.kind).toBe('holding')
  expect(held.shown).toEqual({ moment: 'resting', animation: playsFor('resting'), frame: 0, place: HOME })
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
  expect(result.model.shown).toEqual({ moment: 'working', animation: playsFor('working'), frame: 0, place: HOME })
  // The hold ends at the new rest, with no draw and a timer for the new moment.
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
  // The loop wraps around the frames of the moment.
  expect(feed([tick, tick, tick, tick], turn.model).model.shown.frame).toBe(1)
})

test('what is queued plays in order, each once, and the rest comes back after the last', async () => {
  const a = entry('ticket-done')
  const b = entry('set-done')
  const { effects, model } = feed([queue(a), queue(b), tick, tick, tick, tick, tick, tick])
  const kinds = effects.flatMap(effect => (effect.do === 'start' || effect.do === 'end' ? [`${effect.do}:${effect.entry.moment}`] : []))
  expect(kinds).toEqual(['start:ticket-done', 'end:ticket-done', 'start:set-done', 'end:set-done'])
  expect(model.phase).toEqual({ kind: 'resting' })
  expect(model.waiting).toEqual([])
})

test('a hook that queues from onEnd is handled after the effects now running, never inside them', async () => {
  const timers: { fn: () => void; isOn: boolean }[] = []
  const every = (_ms: number, fn: () => void) => {
    const timer = { fn, isOn: true }
    timers.push(timer)
    return {
      cancel: () => {
        timer.isOn = false
      },
    } as ReturnType<Parameters<typeof createActivity>[0]['every']>
  }
  const clock = { every, after: every }
  const log: string[] = []
  const first: Entry = {
    moment: 'ticket-done',
    onEnd: () => {
      log.push('end')
      activity.queue({ moment: 'set-done', onStart: () => log.push('start after') })
      log.push('end returned')
    },
  }
  const activity = createActivity(clock, ({ moment, frame }) => void log.push(`draw ${moment} ${frame}`), playsFor)
  activity.queue(first)
  timers
    .filter(timer => timer.isOn)
    .at(-1)
    ?.fn()
  timers
    .filter(timer => timer.isOn)
    .at(-1)
    ?.fn()
  // The queue from onEnd returned before the next entry started: no re-entry.
  expect(log.indexOf('end returned')).toBeLessThan(log.indexOf('start after'))
  expect(log.filter(line => line === 'start after')).toEqual(['start after'])
  expect(timers.filter(timer => timer.isOn).length).toBe(1)
})

test('a phase cannot be written down without what it needs', async () => {
  // @ts-expect-error a holding phase needs its entry, animation, step and steps
  const bad: Phase = { kind: 'holding' }
  expect(bad.kind).toBe('holding')
  // @ts-expect-error an ambient phase needs its animation, step and steps
  const alsoBad: Phase = { kind: 'ambient' }
  expect(alsoBad.kind).toBe('ambient')
})

// Ambient motion: with motion on, a rest with nothing going on waits a gap, plays one ambient animation, and waits again.
const BLINK = fake(3, 90)
const SPARK = fake(4, 80)
const both: Ambient = () => [BLINK, SPARK]
const motion = (isOn: boolean): Event => ({ type: 'motion', isOn })
const gap = (roll: number): Event => ({ type: 'gap', roll })
const look: Event = { type: 'look' }
const WAIT: Effect = { do: 'wait' }
const drawAmbient = (animation: Animation, frame: number): Effect => ({ do: 'draw', shown: { moment: 'resting', animation, frame, place: HOME } })

/** A model that rests with motion on, a gap pending. */
const waiting = (): Model => feed([motion(true)], INITIAL, playsFor, both).model

test('turning motion on at rest with ambient animations to play arms the gap; the rest is not drawn again', async () => {
  const { model, effects } = feed([motion(true)], INITIAL, playsFor, both)
  expect(model.phase).toEqual({ kind: 'between' })
  expect(model.isMotionOn).toBe(true)
  expect(effects).toEqual([WAIT])
  // The same setting again is the same model.
  expect(transition(model, motion(true), playsFor, both).model).toBe(model)
})

test('with no ambient animation to play, or with motion off, nothing waits: no timer is asked for', async () => {
  const empty = feed([motion(true)], INITIAL, playsFor, noAmbient)
  expect(empty.model.phase).toEqual({ kind: 'resting' })
  expect(empty.model.isMotionOn).toBe(true)
  expect(empty.effects).toEqual([])
  // Motion off: everything that ends in rest ends without a gap.
  const ended = feed([queue(zap), tick, tick], INITIAL, playsFor, both)
  expect(ended.model.phase).toEqual({ kind: 'resting' })
  expect(ended.effects).not.toContainEqual(WAIT)
  expect(feed([on('turn'), off('turn')], INITIAL, playsFor, both).effects).not.toContainEqual(WAIT)
})

test('a gap that passes plays one ambient animation: the roll picks it, its first frame is drawn, and its own timer runs', async () => {
  const first = transition(waiting(), gap(0), playsFor, both)
  expect(first.model.phase).toEqual({ kind: 'ambient', animation: BLINK, step: 0, steps: BLINK.frames })
  expect(first.effects).toEqual([{ do: 'stop' }, drawAmbient(BLINK, 0), { do: 'every', ms: 90 }])
  const last = transition(waiting(), gap(0.999), playsFor, both)
  expect(last.model.phase).toEqual({ kind: 'ambient', animation: SPARK, step: 0, steps: SPARK.frames })
  expect(last.effects).toEqual([{ do: 'stop' }, drawAmbient(SPARK, 0), { do: 'every', ms: 80 }])
  // Only what the character lists can play: the list is asked when the gap passes, not when it was armed.
  const swapped = transition(waiting(), gap(0), playsFor, () => [SPARK])
  expect(swapped.model.phase).toMatchObject({ kind: 'ambient', animation: SPARK })
})

test('an ambient animation plays each frame once, then the rest comes back and the next gap is armed', async () => {
  const played = feed([gap(0)], waiting(), playsFor, both)
  const frames = feed([tick, tick], played.model, playsFor, both)
  expect(frames.effects).toEqual([drawAmbient(BLINK, 1), drawAmbient(BLINK, 2)])
  const over = transition(frames.model, tick, playsFor, both)
  expect(over.effects).toEqual([{ do: 'stop' }, draw('resting', 0), WAIT])
  expect(over.model.phase).toEqual({ kind: 'between' })
  expect(over.model.shown).toEqual({ moment: 'resting', animation: playsFor('resting'), frame: 0, place: HOME })
})

test('a gap that finds nothing to play (the character changed) goes back to rest and stops waiting', async () => {
  const result = transition(waiting(), gap(0.5), playsFor, noAmbient)
  expect(result.model.phase).toEqual({ kind: 'resting' })
  expect(result.effects).toEqual([{ do: 'stop' }])
})

test('an animation for a moment that arrives during an ambient one starts at once, and nothing of the ambient one is left', async () => {
  const mid = feed([gap(0), tick], waiting(), playsFor, both).model
  const result = transition(mid, queue(zap), playsFor, both)
  expect(result.model.phase).toEqual({ kind: 'playing', entry: zap, animation: playsFor('ticket-done'), step: 0, steps: 2 })
  expect(result.effects).toEqual([{ do: 'stop' }, { do: 'start', entry: zap, steps: 2 }, draw('ticket-done', 0), { do: 'every', ms: 50 }])
  // A condition does the same: the turn writes at once.
  const turn = transition(mid, on('turn'), playsFor, both)
  expect(turn.model.phase).toEqual({ kind: 'resting' })
  expect(turn.effects).toEqual([{ do: 'stop' }, draw('working', 0), { do: 'every', ms: 100 }])
})

test('an animation for a moment that arrives while the gap is pending starts at once and cancels the gap; ambient motion comes back after the rest', async () => {
  const queued = transition(waiting(), queue(zap), playsFor, both)
  expect(queued.effects[0]).toEqual({ do: 'stop' })
  expect(queued.model.phase.kind).toBe('playing')
  const turn = transition(waiting(), on('turn'), playsFor, both)
  expect(turn.effects).toEqual([{ do: 'stop' }, draw('working', 0), { do: 'every', ms: 100 }])
  expect(turn.model.phase).toEqual({ kind: 'resting' })
  // After the entry the gap is armed again.
  const over = feed([tick, tick], queued.model, playsFor, both)
  expect(over.model.phase).toEqual({ kind: 'between' })
  expect(over.effects.at(-1)).toEqual(WAIT)
})

test('no gap is armed while a turn or a search goes on, or while an entry plays or holds', async () => {
  const busy = feed([on('search')], waiting(), playsFor, both)
  expect(busy.model.phase.kind).toBe('resting')
  expect(busy.effects).not.toContainEqual(WAIT)
  const playing = feed([queue(entry('ticket-done', 2))], waiting(), playsFor, both)
  expect(playing.effects).not.toContainEqual(WAIT)
  const holding = feed([tick, tick], playing.model, playsFor, both)
  expect(holding.model.phase.kind).toBe('holding')
  expect(holding.effects).not.toContainEqual(WAIT)
  // Motion turned on during an entry only records; the gap is armed when the rest comes back.
  const recorded = feed([queue(zap), motion(true)], INITIAL, playsFor, both)
  expect(recorded.model.isMotionOn).toBe(true)
  expect(recorded.effects).not.toContainEqual(WAIT)
  expect(feed([tick, tick], recorded.model, playsFor, both).model.phase.kind).toBe('between')
  // A turn that ends hands the rest back with the gap armed.
  expect(feed([off('search')], busy.model, playsFor, both).effects.at(-1)).toEqual(WAIT)
})

test('turning motion off stops the gap, and cuts an ambient animation short with the rest drawn', async () => {
  const off1 = transition(waiting(), motion(false), playsFor, both)
  expect(off1.model.phase).toEqual({ kind: 'resting' })
  expect(off1.effects).toEqual([{ do: 'stop' }])
  const mid = feed([gap(0), tick], waiting(), playsFor, both).model
  const off2 = transition(mid, motion(false), playsFor, both)
  expect(off2.model.phase).toEqual({ kind: 'resting' })
  expect(off2.effects).toEqual([{ do: 'stop' }, draw('resting', 0)])
  // Off while an entry plays: it plays on, and the rest after it has no gap.
  const playing = feed([queue(zap), motion(false), tick, tick], waiting(), playsFor, both)
  expect(playing.model.phase).toEqual({ kind: 'resting' })
  expect(playing.effects).not.toContainEqual(WAIT)
})

test('a new look re-asks what can play: it arms a gap that was not needed, drops one that is, and cuts short an ambient animation of the old character', async () => {
  const none = feed([motion(true)], INITIAL, playsFor, noAmbient).model
  const armed = transition(none, look, playsFor, both)
  expect(armed.model.phase).toEqual({ kind: 'between' })
  expect(armed.effects).toEqual([WAIT])
  const dropped = transition(waiting(), look, playsFor, noAmbient)
  expect(dropped.model.phase).toEqual({ kind: 'resting' })
  expect(dropped.effects).toEqual([{ do: 'stop' }])
  const mid = feed([gap(0), tick], waiting(), playsFor, both).model
  const cut = transition(mid, look, playsFor, both)
  expect(cut.model.phase).toEqual({ kind: 'between' })
  expect(cut.effects).toEqual([{ do: 'stop' }, draw('resting', 0), WAIT])
  // Nothing changes when the look changes with the gap already right, or while a turn writes.
  expect(transition(waiting(), look, playsFor, both).effects).toEqual([])
  expect(transition(feed([on('turn')], INITIAL, playsFor, both).model, look, playsFor, both).effects).toEqual([])
})

test('a gap that arrives in any phase but the pending one does nothing', async () => {
  const mid = feed([gap(0), tick], waiting(), playsFor, both).model
  for (const model of [INITIAL, feed([queue(zap)]).model, feed([queue(entry('ticket-done', 2)), tick, tick]).model, mid]) {
    expect(transition(model, gap(0.9), playsFor, both), model.phase.kind).toEqual({ model, effects: [] })
  }
})

// The pane is not the one shown: nothing is drawn and no timer runs, and what is kept waits.
const view = (isShown: boolean): Event => ({ type: 'view', isShown })
const KEPT: Entry = { moment: 'ticket-done', isKeptWhenHidden: true }
const DROPPED: Entry = { moment: 'searching' }

test('hiding the pane stops the timer and draws nothing, whatever the sidekick was doing', async () => {
  for (const model of [INITIAL, waiting(), feed([on('turn')]).model, feed([gap(0)], waiting(), playsFor, both).model]) {
    const hidden = transition(model, view(false), playsFor, both)
    expect(hidden.model.phase, model.phase.kind).toEqual({ kind: 'away' })
    expect(hidden.effects, model.phase.kind).toEqual([{ do: 'stop' }])
  }
})

test('hiding the pane ends an entry under way, once, and keeps no more of the queue than the kept entries', async () => {
  const playing = feed([queue(KEPT), queue(DROPPED), queue(KEPT)]).model
  const hidden = transition(playing, view(false), playsFor)
  expect(hidden.effects).toEqual([{ do: 'stop' }, { do: 'end', entry: KEPT }])
  expect(hidden.model.waiting).toEqual([KEPT])
})

test('while the pane is hidden nothing is drawn, no timer starts, ticks and gaps are ignored, and the conditions are followed', async () => {
  const away = transition(INITIAL, view(false), playsFor).model
  for (const event of [on('turn'), off('turn'), on('search'), tick, gap(0), { type: 'motion', isOn: true } as const, { type: 'look' } as const]) {
    expect(transition(away, event, playsFor, both).effects, JSON.stringify(event)).toEqual([])
  }
  expect(feed([on('turn')], away).model.conditions.turn).toBe(true)
  expect(feed([on('turn')], away).model.phase).toEqual({ kind: 'away' })
})

test('an entry that arrives while the pane is hidden waits when it is kept and is dropped when it is not', async () => {
  const away = transition(INITIAL, view(false), playsFor).model
  const { model, effects } = feed([queue(KEPT), queue(DROPPED), queue(entry('set-done'))], away)
  expect(effects).toEqual([])
  expect(model.waiting).toEqual([KEPT])
})

test('showing the pane begins what the conditions call for, or the rest; kept entries come first, in the order they arrived', async () => {
  const away = transition(INITIAL, view(false), playsFor).model
  const writing = feed([on('turn'), on('search')], away)
  const shown = transition(writing.model, view(true), playsFor)
  expect(shown.model.phase).toEqual({ kind: 'resting' })
  expect(shown.effects).toEqual([{ do: 'stop' }, draw('working', 0), { do: 'every', ms: 100 }])

  const ended = feed([on('turn'), off('turn')], away)
  expect(transition(ended.model, view(true), playsFor).effects, 'a turn that came and went plays nothing').toEqual([{ do: 'stop' }, draw('resting', 0)])

  const kept = feed([queue(KEPT), queue({ moment: 'set-done', isKeptWhenHidden: true })], away)
  const first = transition(kept.model, view(true), playsFor)
  expect(first.effects).toEqual([{ do: 'stop' }, { do: 'start', entry: KEPT, steps: 2 }, draw('ticket-done', 0), { do: 'every', ms: 50 }])
  expect(first.model.waiting.map(one => one.moment)).toEqual(['set-done'])
})

test('showing the pane at rest with motion on arms a fresh gap; showing it twice, or hiding it twice, changes nothing', async () => {
  const away = transition(waiting(), view(false), playsFor, both).model
  expect(transition(away, view(false), playsFor, both)).toEqual({ model: away, effects: [] })
  const shown = transition(away, view(true), playsFor, both)
  expect(shown.model.phase).toEqual({ kind: 'between' })
  expect(shown.effects).toEqual([{ do: 'stop' }, draw('resting', 0), WAIT])
  expect(transition(shown.model, view(true), playsFor, both)).toEqual({ model: shown.model, effects: [] })
})
