import type { On } from 'claude-code'
import type { Engine, MockClock } from 'claude-code/testing'
import { expect, mock } from 'claude-code/testing'
import { AMBIENT_GAP_MS, BACKGROUND_STEP_MS } from '../hooks/activity'
import { backgroundFrames } from '../hooks/sprite/compose'
import { layersOf } from '../hooks/sprite/look-in-use'
import { ANIMATIONS, ambientAnimationsOf, BACKGROUNDS, CHARACTERS } from '../hooks/sprite/registry'
import { addSet, answered, counting, RECIPE, RUN, paneRender as render, test, ticket, world } from './world'

// A background with several frames steps at a slow fixed interval while the sidekick rests, as part of ambient motion. The mock clock moves on and what the mod paints is read back.
const ROOT = '/work/shop'
const LOOK = { command: 'sidekick-look', ...RUN } as const
const MOTION = { command: 'sidekick-motion', ...RUN } as const
const TICKETS = {
  '01-cart.md': ticket('01: Cart', 'done'),
  '02-pay.md': ticket('02: Payment', 'in-progress'),
  '03-ship.md': ticket('03: Shipping', 'ready-for-agent'),
}
const TWINKLE = BACKGROUNDS.twinkle
if (TWINKLE === undefined) throw new Error('no twinkle')
const COUNT = backgroundFrames(TWINKLE)
const LONGEST_MS = Math.max(...Object.values(CHARACTERS).flatMap(character => ambientAnimationsOf(character).map(one => one.frames * one.msPerFrame)))

const dressed = (background: string | null) => layersOf({ character: 'foxkit', outfit: {}, background })
/** The sidekick at rest on twinkle, with the background at its frame `k`. */
const rest = (k: number): string => render(dressed('twinkle'), ANIMATIONS.idle, 0, k)

/** A session whose tickets are found at once, so the sidekick rests from the start; the store holds nothing (motion is on) unless given. */
const start = async ($: Engine, on: On, background: string | null = 'twinkle', saved: Record<string, unknown> = {}) => {
  const timers = counting(on)
  const clock = mock.clock(timers.on)
  mock.store(on, saved)
  const w = world(on, ROOT)
  addSet(w, ROOT, 'checkout', TICKETS, 5)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  w.answer = prompt => (prompt.startsWith('Tickets:') ? answered('{"items":[]}') : answered(RECIPE))
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await clock.settle()
  if (background !== null) await $.command.run({ ...LOOK, args: `background=${background}` })
  await clock.settle()
  w.painted.length = 0

  return { clock, w, running: timers.running, gaps: timers.gaps, gapLengths: timers.gapLengths }
}

/** Moves the clock on by `ms` and lets what it woke finish. */
const wait = async (clock: MockClock, ms: number): Promise<void> => {
  await clock.advance(ms)
  await clock.settle()
}

// A gap between ambient animations is never shorter than `AMBIENT_GAP_MS.min`, so in the first seconds of rest only the background moves.
const SAFE_MS = AMBIENT_GAP_MS.min - 1

test('twinkle is a background with several frames, and the sidekick steps through them at rest: one frame per interval, in order, wrapping around', async ($, on) => {
  expect(COUNT).toBe(2)
  expect(COUNT * BACKGROUND_STEP_MS, 'a whole round fits before the first ambient animation can start').toBeLessThanOrEqual(SAFE_MS)
  const { clock, w } = await start($, on)
  await wait(clock, BACKGROUND_STEP_MS - 1)
  expect(w.painted, 'not before the interval').toEqual([])
  await wait(clock, 1)
  expect(w.painted).toEqual([rest(1)])
  await wait(clock, BACKGROUND_STEP_MS)
  expect(w.painted, 'one repaint per interval, and it wraps around').toEqual([rest(1), rest(0)])
  expect(rest(1), 'the frames differ in what the camera sees').not.toBe(rest(0))
})

test('a background with one frame starts no timer at rest and repaints nothing: only the gap between ambient animations is pending', async ($, on) => {
  const { clock, w, running, gaps } = await start($, on, 'dusk')
  expect(running() - gaps(), 'no timer but the gap').toBe(0)
  expect(gaps()).toBe(1)
  await wait(clock, SAFE_MS)
  expect(w.painted, 'nothing is painted before the earliest gap ends').toEqual([])
})

test('with no background there is no timer at rest either', async ($, on) => {
  const { running, gaps } = await start($, on, null)
  expect(running() - gaps()).toBe(0)
  expect(gaps()).toBe(1)
})

test('with motion off the background holds its first frame at rest and no timer is pending; on brings the stepping back', async ($, on) => {
  const { clock, w, running } = await start($, on)
  await wait(clock, BACKGROUND_STEP_MS)
  expect(w.painted.at(-1)).toBe(rest(1))
  expect((await $.command.run({ ...MOTION, args: 'off' })).text).toBe('Ambient motion is off.')
  expect(w.painted.at(-1), 'the first frame is shown again').toBe(rest(0))
  expect(running(), 'no timer at rest').toBe(0)
  w.painted.length = 0
  await wait(clock, 30 * BACKGROUND_STEP_MS)
  expect(w.painted, 'nothing moves').toEqual([])
  expect(running()).toBe(0)

  await $.command.run({ ...MOTION, args: 'on' })
  expect(running(), 'the timer is back').toBeGreaterThan(0)
  await wait(clock, BACKGROUND_STEP_MS)
  expect(w.painted.at(-1), 'from the first frame').toBe(rest(1))
})

test('motion off from the start: the first frame stays, and the session starts no timer', async ($, on) => {
  const { clock, w, running } = await start($, on, 'twinkle', { motion: false })
  expect(running()).toBe(0)
  await wait(clock, 30 * BACKGROUND_STEP_MS)
  expect(running()).toBe(0)
  expect(w.painted).toEqual([])
})

test('during an animation the background steps with the animation, as it always did, and at rest again it carries on from where it was', async ($, on) => {
  const { clock, w, running, gaps } = await start($, on)
  await wait(clock, BACKGROUND_STEP_MS)
  expect(w.painted.at(-1)).toBe(rest(1))
  w.painted.length = 0
  await $.turn.start({ text: 'Build it.', turnId: 't1' })
  // The turn writes: frame k of the animation with frame k of the background.
  const write = ANIMATIONS.write
  expect(w.painted.at(-1)).toBe(render(dressed('twinkle'), write, 0, 0))
  await wait(clock, write.msPerFrame)
  expect(w.painted.at(-1)).toBe(render(dressed('twinkle'), write, 1, 1))
  expect(running() - gaps(), 'only the animation has a timer').toBe(1)
  // The turn ends: the sidekick rests with the background where it was left, and the stepping goes on.
  await $.turn.complete({
    answer: 'Done.',
    durationMs: 1,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    toolUses: [],
    usage: { input_tokens: 0, output_tokens: 0 },
  } as never)
  await clock.settle()
  expect(w.painted.at(-1)).toBe(rest(1))
  w.painted.length = 0
  await wait(clock, BACKGROUND_STEP_MS)
  expect(w.painted.at(-1)).toBe(rest(0))
})

test('the stepping and the ambient animations do not disturb each other: every gap is still 5 to 15 seconds, and only rest and ambient pictures are painted', async ($, on) => {
  const { clock, w, gapLengths } = await start($, on)
  const ambient = new Set(
    (CHARACTERS.foxkit?.ambient ?? []).flatMap(name => {
      const animation = ANIMATIONS[name as keyof typeof ANIMATIONS]

      return Array.from({ length: animation.frames }, (_, step) => render(dressed('twinkle'), animation, step, step))
    }),
  )
  const resting = new Set(Array.from({ length: COUNT }, (_, k) => rest(k)))
  await wait(clock, 20 * (AMBIENT_GAP_MS.max + LONGEST_MS))
  expect(gapLengths.length, 'ambient animations kept coming').toBeGreaterThanOrEqual(20)
  for (const length of gapLengths) {
    expect(length).toBeGreaterThanOrEqual(AMBIENT_GAP_MS.min)
    expect(length).toBeLessThanOrEqual(AMBIENT_GAP_MS.max)
  }
  for (const cells of w.painted) expect(ambient.has(cells) || resting.has(cells), 'a picture that is neither').toBe(true)
  expect(w.painted.filter(cells => ambient.has(cells) && !resting.has(cells)).length, 'ambient frames were painted').toBeGreaterThan(0)
  // The background went on stepping between them.
  expect(new Set(w.painted.filter(cells => resting.has(cells))).size).toBe(COUNT)
})

test('a look chosen later changes whether the background steps: a still one stops the timer, a moving one starts it', async ($, on) => {
  const { running, gaps } = await start($, on, 'dusk')
  expect(running() - gaps()).toBe(0)
  await $.command.run({ ...LOOK, args: 'background=twinkle' })
  expect(running() - gaps(), 'twinkle steps').toBe(1)
  await $.command.run({ ...LOOK, args: 'background=dusk' })
  expect(running() - gaps(), 'dusk is still').toBe(0)
  await $.command.run({ ...LOOK, args: 'background=twinkle' })
  await $.command.run({ ...LOOK, args: 'background=none' })
  expect(running() - gaps(), 'no background at all').toBe(0)
})
