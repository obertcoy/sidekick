import type { On } from 'claude-code'
import type { Engine, MockClock, Mounted as MountedPane } from 'claude-code/testing'
import { expect, mock } from 'claude-code/testing'
import { BACKGROUND_STEP_MS } from '../hooks/activity'
import { classic } from '../hooks/sprite/characters/classic'
import { backgroundFrames, composePixels, offStage, stageFor } from '../hooks/sprite/compose'
import { layersOf } from '../hooks/sprite/look-in-use'
import { ANIMATIONS, BACKGROUNDS } from '../hooks/sprite/registry'
import { strikeSteps } from '../hooks/strike'
import type { World } from './world'
import { addSet, answered, ON_TICKETS, PANE, QUIET, RECIPE, RUN, paneRender as render, test, ticket, world } from './world'

// The storm sky and the classic's animations in the whole mod (ticket 24): the sky moves at rest and holds still with motion off, the ticket strike keeps its beats with the storm,
// and the power-up plays when the last open ticket of a set is started, only with motion on and, when the pane is not shown, once it is.
const ROOT = '/work/shop'
const ISSUES = `${ROOT}/.scratch/checkout/issues`
const MOTION = { command: 'sidekick-motion', ...RUN } as const
const STEP = ANIMATIONS.thunder.msPerFrame

const STORM = BACKGROUNDS.storm
if (STORM === undefined) throw new Error('no storm')
const dressed = (character: 'classic' | 'foxkit', background: string | null = null) => layersOf({ character, outfit: {}, background })
const framesOf = (name: keyof typeof ANIMATIONS, character: 'classic' | 'foxkit' = 'classic', background: string | null = null): string[] =>
  Array.from({ length: ANIMATIONS[name].frames }, (_, step) => render(dressed(character, background), ANIMATIONS[name], step))
const restOf = (character: 'classic' | 'foxkit' = 'classic', background: string | null = null, frame = 0): string =>
  render(dressed(character, background), ANIMATIONS.idle, 0, frame)

// The storm itself, at the pure level.

test('the storm is a background of three layers that moves: forty-four pictures of the far layer, one of the stars and one of the hills', async () => {
  expect(STORM.name).toBe('storm')
  expect(backgroundFrames(STORM)).toBe(44)
  expect(STORM.far?.length).toBe(44)
  expect(STORM.sky?.length).toBe(1)
  expect(STORM.ground?.length).toBe(1)
  // Every letter it draws has a colour.
  for (const layer of [STORM.sky, STORM.far, STORM.ground]) {
    for (const grid of layer ?? []) {
      for (const letter of grid.join('')) expect(letter === '.' || STORM.palette[letter] !== undefined, `letter ${letter}`).toBe(true)
    }
  }
})

test('the storm is drawn for the classic: its sky is as tall as the classic stage has sky, and it draws nothing off the stage', async () => {
  const stage = stageFor(classic)
  expect(STORM.sky?.[0]?.length).toBe(stage.ground)
  expect(STORM.far?.[0]?.length).toBe(stage.ground)
  expect(STORM.sky?.[0]?.every(row => row.length === stage.width)).toBe(true)
  for (const name of ['idle', 'thunder', 'jump', 'powerUp'] as const) {
    for (let step = 0; step < ANIMATIONS[name].frames; step++) {
      expect(offStage(dressed('classic', 'storm'), ANIMATIONS[name], step), `${name} ${step}`).toEqual([])
    }
  }
})

test('the clouds sit across the top, dark, and a far-off strike lights them near it and draws a bolt behind them, the bolt faint in the glow after', async () => {
  const far = STORM.far ?? []
  const lettersOf = (frame: number): string => (far[frame] ?? []).join('')
  // Calm: dark clouds in the top rows only, no bolt.
  const calm = far[3] ?? []
  expect(calm.slice(8).every(row => /^\.+$/.test(row))).toBe(true)
  expect(calm[0]).toMatch(/c/)
  expect(lettersOf(3)).not.toMatch(/[deBbf]/)
  // The strike at step 1: a bright bolt and bright clouds; the step after, the glow.
  expect(lettersOf(1)).toMatch(/B/)
  expect(lettersOf(1)).toMatch(/e/)
  expect(lettersOf(2)).toMatch(/b/)
  expect(lettersOf(2)).not.toMatch(/B/)
  expect(lettersOf(2)).toMatch(/d/)
  // Sheet lightning (step 28) lights the clouds and draws no bolt.
  expect(lettersOf(28)).toMatch(/e/)
  expect(lettersOf(28)).not.toMatch(/[Bbf]/)
})

test('the hills stand in front of the far layer: a bolt is hidden where a hill covers it', async () => {
  const stage = stageFor(classic)
  const hill = STORM.palette.h
  // The picture at the strike at step 1, bolt and all.
  const pixels = composePixels(dressed('classic', 'storm'), ANIMATIONS.idle, 0, 1)
  // Over every column the hills cover the rows from the horizon up to their top, whatever the far layer draws there (the character stands over the ones in its frame).
  const ground = STORM.ground?.[0] ?? []
  let covered = 0
  ground.slice(0, -1).forEach((row, at) => {
    const y = stage.ground - (ground.length - 1) + at
    for (const [x, letter] of [...row].entries()) {
      const column = (x + stage.offset.x) % stage.width
      if (letter !== 'h' || (column >= stage.frame.left && column <= stage.frame.right)) continue
      expect(pixels[y]?.[column], `hill at ${column},${y}`).toBe(hill)
      covered++
    }
  })
  expect(covered).toBeGreaterThan(20)
})

// The storm at rest, in the whole mod.

type Mounted = MountedPane<'terminal', 'Pane'>

const TICKETS = {
  '01-cart.md': ticket('01: Cart', 'done'),
  '02-pay.md': ticket('02: Payment', 'in-progress'),
  '03-ship.md': ticket('03: Shipping', 'ready-for-agent'),
}

type Open = { clock: MockClock; w: World; ui: () => Mounted | undefined; hide: () => Promise<void>; reveal: () => Promise<Mounted> }

/** A session in a project that looks like `look`, the tickets found at once and the pane drawn; `saved` is what the store holds beyond that (motion is on unless it says otherwise). */
const start = async (
  $: Engine,
  on: On,
  look: Record<string, unknown>,
  tickets: Record<string, string> = TICKETS,
  saved: Record<string, unknown> = {},
): Promise<Open> => {
  const clock = mock.clock(on)
  mock.store(on, { ...ON_TICKETS, [`look:${ROOT}`]: look, ...saved })
  const w = world(on, ROOT)
  addSet(w, ROOT, 'checkout', tickets, 5)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: { ok: true } }))
  w.answer = prompt => (prompt.startsWith('Tickets:') ? answered('{"items":[]}') : answered(RECIPE))
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await clock.settle()
  let drawn: Mounted | undefined = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await clock.settle()
  w.painted.length = 0

  return {
    clock,
    w,
    ui: () => drawn,
    hide: async () => {
      w.isShown = false
      await drawn?.unmount()
      drawn = undefined
      await clock.advance(20_000)
    },
    reveal: async () => {
      w.isShown = true
      drawn = await $.ui.mount({ ...PANE, surface: 'terminal' })
      await clock.settle()

      return drawn
    },
  }
}

/** The tickets change on disk and the mod notices, as it does when a file tool touches one. */
const change = async ($: Engine, w: World, clock: MockClock, tickets: Record<string, string>, mtimeMs: number): Promise<void> => {
  addSet(w, ROOT, 'checkout', tickets, mtimeMs)
  await $.tool.call({ tool: 'Read', file_path: `${ISSUES}/${Object.keys(tickets).at(-1) ?? '03-ship.md'}` })
  await clock.settle()
}

test('on the storm the sky steps while the classic rests, one picture per interval, from the first; with motion off it holds still', async ($, on) => {
  const { clock, w } = await start($, on, { character: 'classic', background: 'storm' })
  await clock.advance(BACKGROUND_STEP_MS - 1)
  expect(w.painted, 'not before the interval').toEqual([])
  await clock.advance(1)
  expect(w.painted).toEqual([restOf('classic', 'storm', 1)])
  await clock.advance(BACKGROUND_STEP_MS)
  expect(w.painted.at(-1)).toBe(restOf('classic', 'storm', 2))
  // A far-off strike behind the sidekick shows in the picture (the one at step 5), and the calm before it does not.
  expect(restOf('classic', 'storm', 5), 'a far-off strike shows in the picture').not.toBe(restOf('classic', 'storm', 0))
  expect(restOf('classic', 'storm', 3)).toBe(restOf('classic', 'storm', 0))
  // Motion off: the first picture, and nothing moves however long it rests.
  await $.command.run({ ...MOTION, args: 'off' })
  expect(w.painted.at(-1)).toBe(restOf('classic', 'storm', 0))
  w.painted.length = 0
  await clock.advance(60 * BACKGROUND_STEP_MS)
  expect(w.painted).toEqual([])
})

test('with motion off from the start the storm sky stays on its first picture', async ($, on) => {
  const { clock, w } = await start($, on, { character: 'classic', background: 'storm' }, TICKETS, QUIET)
  await clock.advance(60 * BACKGROUND_STEP_MS)
  expect(w.painted).toEqual([])
})

// The ticket strike, with the storm.

test('a finished ticket is struck in step with the storm: the streak leaves at step 4, the bolt lands on the row at 8, the row flashes at 9, the strike-through burns, and it settles at the end', async ($, on) => {
  const { clock, w, ui } = await start($, on, { character: 'classic' }, TICKETS, QUIET)
  const find = async (text: RegExp) => (await ui()?.findAll({ type: 'Text' }))?.find(one => text.test(one.text))
  const flashing = async () => ((await ui()?.findAll({ type: 'Text' })) ?? []).filter(one => one.props.backgroundColor === 'warning')
  const piece = async (text: string) => (await ui()?.findAll({ type: 'Text' }))?.find(one => one.text === text)
  await change($, w, clock, { ...TICKETS, '02-pay.md': ticket('02: Payment', 'done') }, 9)
  // Charging: the row still shows what it was, and no bolt yet.
  await clock.advance(3 * STEP)
  expect(await find(/^↯━*─+$/)).toBeUndefined()
  expect(await find(/^◐ Payment$/)).toBeDefined()
  // The streak leaves the sidekick: the bolt takes the first cell of the bar.
  await clock.advance(STEP)
  expect(await find(/^↯━*─+$/)).toBeDefined()
  expect(await find(/^◐ Payment$/)).toBeDefined()
  // Until it lands, with the bolt cracking into the ground: the bolt sits on the row's glyph.
  await clock.advance(3 * STEP)
  expect(await find(/^◐ Payment$/)).toBeDefined()
  await clock.advance(STEP)
  expect(await find(/^↯━*─+$/)).toBeUndefined()
  expect(await piece('↯')).toBeDefined()
  expect(await find(/^↯ Payment$/)).toBeDefined()
  // The row flashes as done in the step after, then the strike-through burns across it.
  await clock.advance(STEP)
  expect(await flashing()).toHaveLength(1)
  await clock.advance(STEP)
  expect(await flashing()).toHaveLength(0)
  expect(await piece('Pa')).toMatchObject({ props: { strikethrough: true, dimColor: true } })
  await clock.advance(6 * STEP)
  expect(await piece('Payment')).toMatchObject({ props: { strikethrough: true } })
  // It stays struck while the check mark rises, and settles as the plain done row in the last two steps.
  await clock.advance((strikeSteps(ANIMATIONS.thunder) - 2 - 16) * STEP)
  expect(await find(/^✓ Payment$/)).toMatchObject({ props: { strikethrough: true, dimColor: true } })
  await clock.advance(STEP)
  expect(w.painted.at(-1)).toBe(restOf('classic'))
  expect(w.painted.slice(0, ANIMATIONS.thunder.frames), 'the classic plays the storm, not the zap').toEqual(framesOf('thunder'))
})

test("the foxkit never plays the classic's storm: a finished ticket is its zap", async ($, on) => {
  const { clock, w } = await start($, on, { character: 'foxkit' }, TICKETS, QUIET)
  await change($, w, clock, { ...TICKETS, '02-pay.md': ticket('02: Payment', 'done') }, 9)
  await clock.advance(strikeSteps(ANIMATIONS.zap) * ANIMATIONS.zap.msPerFrame)
  expect(w.painted.slice(0, ANIMATIONS.zap.frames)).toEqual(framesOf('zap', 'foxkit'))
  const own = new Set([...framesOf('zap', 'foxkit'), restOf('foxkit')])
  for (const cells of w.painted) expect(own.has(cells), 'a picture that is neither the foxkit zapping nor at rest').toBe(true)
})

// The set done, with the jump.

test('a set that becomes all done makes the classic jump after its storm', async ($, on) => {
  const almost = { ...TICKETS, '02-pay.md': ticket('02: Payment', 'done') }
  const { clock, w } = await start($, on, { character: 'classic' }, almost, QUIET)
  await change($, w, clock, { ...almost, '03-ship.md': ticket('03: Shipping', 'done') }, 9)
  await clock.advance(strikeSteps(ANIMATIONS.thunder) * STEP + ANIMATIONS.jump.frames * ANIMATIONS.jump.msPerFrame * 2)
  expect(w.painted).toEqual([...framesOf('thunder'), restOf('classic'), ...framesOf('jump'), restOf('classic')])
})

// The power-up, for the last ticket started.

const WAITING = { '01-cart.md': ticket('01: Cart', 'done'), '02-pay.md': ticket('02: Payment', 'ready-for-agent') }
const STARTED = { ...WAITING, '02-pay.md': ticket('02: Payment', 'in-progress') }

test('the power-up plays when the last open ticket of the set is started, once, and the classic rests after it', async ($, on) => {
  const { clock, w } = await start($, on, { character: 'classic' }, WAITING)
  await change($, w, clock, STARTED, 9)
  await clock.advance(ANIMATIONS.powerUp.frames * ANIMATIONS.powerUp.msPerFrame * 2)
  expect(w.painted).toEqual([...framesOf('powerUp'), restOf('classic')])
  // A later refresh of the same state starts nothing.
  w.painted.length = 0
  await change($, w, clock, STARTED, 12)
  await clock.advance(ANIMATIONS.powerUp.frames * ANIMATIONS.powerUp.msPerFrame * 2)
  expect(w.painted.filter(cells => framesOf('powerUp').includes(cells) && cells !== restOf('classic'))).toEqual([])
})

test('a ticket finishing as the last one starts is struck first, and the power-up follows it', async ($, on) => {
  const both = { '01-cart.md': ticket('01: Cart', 'in-progress'), '02-pay.md': ticket('02: Payment', 'ready-for-agent') }
  const { clock, w } = await start($, on, { character: 'classic' }, both)
  await change($, w, clock, { '01-cart.md': ticket('01: Cart', 'done'), '02-pay.md': ticket('02: Payment', 'in-progress') }, 9)
  await clock.advance(strikeSteps(ANIMATIONS.thunder) * STEP + ANIMATIONS.powerUp.frames * ANIMATIONS.powerUp.msPerFrame * 2)
  expect(w.painted).toEqual([...framesOf('thunder'), restOf('classic'), ...framesOf('powerUp'), restOf('classic')])
})

test('no power-up while another ticket is still open', async ($, on) => {
  const { clock, w } = await start($, on, { character: 'classic' }, { ...WAITING, '03-ship.md': ticket('03: Shipping', 'ready-for-agent') })
  await change($, w, clock, { ...STARTED, '03-ship.md': ticket('03: Shipping', 'ready-for-agent') }, 9)
  await clock.advance(ANIMATIONS.powerUp.frames * ANIMATIONS.powerUp.msPerFrame * 2)
  expect(w.painted).toEqual([])
})

test('with motion off the power-up does not play, however the ticket changes, and nothing waits for motion to come back', async ($, on) => {
  const { clock, w } = await start($, on, { character: 'classic' }, WAITING, QUIET)
  await change($, w, clock, STARTED, 9)
  await clock.advance(ANIMATIONS.powerUp.frames * ANIMATIONS.powerUp.msPerFrame * 2)
  expect(w.painted).toEqual([])
  await $.command.run({ ...MOTION, args: 'on' })
  await clock.advance(ANIMATIONS.powerUp.frames * ANIMATIONS.powerUp.msPerFrame * 2)
  expect(w.painted.filter(cells => framesOf('powerUp').includes(cells) && cells !== restOf('classic'))).toEqual([])
})

test('while the pane is not shown the power-up waits and plays once when it is next shown; with motion turned off meanwhile it is dropped', async ($, on) => {
  const first = await start($, on, { character: 'classic' }, WAITING)
  await first.hide()
  await change($, first.w, first.clock, STARTED, 9)
  await first.clock.advance(60_000)
  expect(first.w.painted, 'nothing is painted while the pane is not shown').toEqual([])
  await first.reveal()
  await first.clock.advance(ANIMATIONS.powerUp.frames * ANIMATIONS.powerUp.msPerFrame * 2)
  expect(first.w.painted).toEqual([...framesOf('powerUp'), restOf('classic')])
})

test('the power-up waiting for a pane that is not shown is dropped if motion is turned off before the pane is shown', async ($, on) => {
  const { clock, w, hide, reveal } = await start($, on, { character: 'classic' }, WAITING)
  await hide()
  await change($, w, clock, STARTED, 9)
  await $.command.run({ ...MOTION, args: 'off' })
  await reveal()
  await clock.advance(ANIMATIONS.powerUp.frames * ANIMATIONS.powerUp.msPerFrame * 2)
  expect(w.painted.filter(cells => framesOf('powerUp').includes(cells) && cells !== restOf('classic'))).toEqual([])
})

test('the foxkit has no power-up: for the last ticket started it plays the plain default for the moment, its nod', async ($, on) => {
  const { clock, w } = await start($, on, { character: 'foxkit' }, WAITING)
  await change($, w, clock, STARTED, 9)
  await clock.advance(ANIMATIONS.nod.frames * ANIMATIONS.nod.msPerFrame * 2)
  expect(w.painted).toEqual([...framesOf('nod', 'foxkit'), restOf('foxkit')])
})
