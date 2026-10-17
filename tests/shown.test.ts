import type { On } from 'claude-code'
import type { Engine, MockClock, Mounted as MountedPane } from 'claude-code/testing'
import { expect, mock } from 'claude-code/testing'
import { AMBIENT_GAP_MS } from '../hooks/activity'
import { render } from '../hooks/sprite/compose'
import { layersOf } from '../hooks/sprite/look-in-use'
import { ANIMATIONS, ambientAnimationsOf, CHARACTERS } from '../hooks/sprite/registry'
import { strikeSteps } from '../hooks/strike'
import type { Reply, World } from './world'
import { addSet, answered, counting, failed, ON_TICKETS, PANE, QUIET, RECIPE, RUN, test, ticket, world } from './world'

// The sidekick animates only while its pane is the one shown. Whole-mod: the world answers `$.ui.panes()` with `w.isShown`, a pane the
// host stops drawing is unmounted and one it draws again is mounted anew, and the mock clock moves on.
const ROOT = '/work/shop'
const ISSUES = `${ROOT}/.scratch/checkout/issues`
const TICKETS = {
  '01-cart.md': ticket('01: Cart', 'done'),
  '02-pay.md': ticket('02: Payment', 'in-progress'),
  '03-ship.md': ticket('03: Shipping', 'ready-for-agent'),
}
const ALMOST = { ...TICKETS, '02-pay.md': ticket('02: Payment', 'done') }
const ALL = { ...ALMOST, '03-ship.md': ticket('03: Shipping', 'done') }
const ZAP_STEP = ANIMATIONS.zap.msPerFrame
const STRIKE_MS = strikeSteps(ANIMATIONS.zap) * ZAP_STEP
const CHEER_MS = ANIMATIONS.cheer.frames * ANIMATIONS.cheer.msPerFrame
const WRITE_STEP = ANIMATIONS.write.msPerFrame
const LOOK_STEP = ANIMATIONS.look.msPerFrame
/** How long the clock may be left to run so that a timer the sidekick still has pending fires and finds the pane hidden. */
const SETTLE_MS = AMBIENT_GAP_MS.max + 1
const LONGEST_MS = Math.max(...Object.values(CHARACTERS).flatMap(character => ambientAnimationsOf(character).map(one => one.frames * one.msPerFrame)))

// The bare foxkit, which is the default look.
const framesOf = (name: keyof typeof ANIMATIONS): string[] =>
  Array.from({ length: ANIMATIONS[name].frames }, (_, step) => render(layersOf({ character: 'foxkit', outfit: {}, background: null }), ANIMATIONS[name], step))
const REST = framesOf('idle')[0] ?? ''

/** What each painted picture is ("zap3", "cheer0"), so that a failure reads as a sequence. */
const named = (painted: readonly string[]): string[] => {
  const names = new Map<string, string>()
  for (const mode of Object.keys(ANIMATIONS) as (keyof typeof ANIMATIONS)[]) {
    framesOf(mode).forEach((cells, step) => {
      if (!names.has(cells)) names.set(cells, `${mode}${step}`)
    })
  }

  return painted.map(cells => names.get(cells) ?? 'unknown')
}
const SEQUENCE = (...parts: (string[] | string)[]): string[] => named(parts.flat())

type Mounted = MountedPane<'terminal', 'Pane'>

type Open = {
  clock: MockClock
  w: World
  /** How many timers of the sidekick's are in flight now; the pane's own refresh is not counted. */
  running: () => number
  /** How many of them are the one-time waits between ambient animations. */
  gaps: () => number
  /** The pane as the host draws it now; undefined while the host draws none. */
  ui: () => Mounted | undefined
  /** The pane goes behind another: the host stops drawing it, and the sidekick finds out when a timer of its fires or the pane next draws. */
  hide: () => Promise<void>
  /** The pane is the shown one again: the host draws it. */
  reveal: () => Promise<Mounted>
  /** Holds the next search until `answerSearch`. */
  hold: () => void
  answerSearch: (reply: Reply) => Promise<void>
}

/** A session whose tickets are found at once and whose pane is drawn; `isMotionOn` lets the ambient animations play. */
const start = async ($: Engine, on: On, tickets: Record<string, string> = TICKETS, isMotionOn = false): Promise<Open> => {
  const timers = counting(on)
  const clock = mock.clock(timers.on)
  mock.store(on, isMotionOn ? ON_TICKETS : { ...QUIET, ...ON_TICKETS })
  const w = world(on, ROOT)
  addSet(w, ROOT, 'checkout', tickets, 5)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: { ok: true } }))
  let release: ((reply: Reply) => void) | undefined
  let isHeld = false
  w.answer = prompt =>
    prompt.startsWith('Tickets:') ? answered('{"items":[]}') : isHeld ? new Promise<Reply>(resolve => (release = resolve)) : answered(RECIPE)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await clock.settle()
  let drawn: Mounted | undefined = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await clock.settle()
  w.painted.length = 0

  return {
    clock,
    w,
    running: timers.running,
    gaps: timers.gaps,
    ui: () => drawn,
    hide: async () => {
      w.isShown = false
      await drawn?.unmount()
      drawn = undefined
      // A timer that was pending when the pane went behind another fires once more and finds it so.
      await clock.advance(SETTLE_MS)
    },
    reveal: async () => {
      w.isShown = true
      drawn = await $.ui.mount({ ...PANE, surface: 'terminal' })
      await clock.settle()

      return drawn
    },
    hold: () => {
      isHeld = true
    },
    answerSearch: async reply => {
      if (release === undefined) throw new Error('no search is held')
      release(reply)
      release = undefined
      isHeld = false
      await clock.settle()
    },
  }
}

const startTurn = ($: Engine, id: string) => $.turn.start({ text: 'Build it.', turnId: id })
const endTurn = ($: Engine, id: string) =>
  $.turn.complete({
    answer: 'Done.',
    durationMs: 1,
    isAborted: false,
    turnId: id,
    reason: 'answer',
  })

/** The tickets change on disk and the mod notices, as it does when a file tool touches one. */
const change = async ($: Engine, w: World, clock: MockClock, tickets: Record<string, string>, mtimeMs: number): Promise<void> => {
  addSet(w, ROOT, 'checkout', tickets, mtimeMs)
  await $.tool.call({ tool: 'Read', file_path: `${ISSUES}/${Object.keys(tickets).at(-1) ?? '03-ship.md'}` })
  await clock.settle()
}

/** A rescan whose search the model cannot answer: the sidekick would shrug. */
const failRescan = async ($: Engine, w: World): Promise<void> => {
  w.answer = () => failed
  await $.command.run({ command: 'sidekick-rescan', args: 'tickets are in docs/tasks', ...RUN })
}

/** The rows the strike has flashing now. */
const flashingOf = async (ui: Mounted | undefined, clock: MockClock): Promise<string[]> => {
  await clock.settle()

  return ((await ui?.findAll({ type: 'Text' })) ?? []).filter(one => one.props.backgroundColor === 'warning').map(one => one.text)
}

for (const hasKeyboard of [false, true]) {
  test(`while the pane is the shown one, a turn is written and a ticket zapped with its strike ${hasKeyboard ? 'with' : 'without'} the keyboard`, async ($, on) => {
    const { clock, w, ui } = await start($, on)
    w.hasKeyboard = hasKeyboard
    await startTurn($, 't1')
    expect(named(w.painted)).toEqual(SEQUENCE(framesOf('write')[0] ?? ''))
    await clock.advance(WRITE_STEP * 2)
    expect(w.painted.at(-1)).toBe(framesOf('write')[2])
    await endTurn($, 't1')
    expect(w.painted.at(-1)).toBe(REST)

    const from = w.painted.length
    await change($, w, clock, ALMOST, 9)
    await clock.advance(ZAP_STEP * 4)
    expect(await flashingOf(ui(), clock)).toEqual(['✓ Payment'])
    await clock.advance(STRIKE_MS)
    expect(named(w.painted.slice(from))).toEqual(SEQUENCE(framesOf('zap'), REST))
  })
}

test('while the pane is not shown, no frame is painted and no timer is pending at rest with ambient motion on', async ($, on) => {
  const { clock, w, running, gaps, hide } = await start($, on, TICKETS, true)
  expect(gaps(), 'a gap is pending while it is shown').toBe(1)
  await hide()
  expect(w.painted, 'the gap that found the pane hidden painted nothing').toEqual([])
  expect(running(), 'no timer is pending').toBe(0)
  expect(gaps(), 'no ambient gap is pending').toBe(0)
  await clock.advance(20 * (AMBIENT_GAP_MS.max + LONGEST_MS))
  expect(w.painted, 'no frame is painted').toEqual([])
  expect(running()).toBe(0)
})

test('while the pane is not shown, a writing turn paints no more frames and leaves no timer pending', async ($, on) => {
  const { clock, w, running, hide } = await start($, on)
  await startTurn($, 't1')
  await clock.advance(WRITE_STEP * 3)
  expect(running(), 'writing').toBe(1)
  await hide()
  const painted = w.painted.length
  expect(running(), 'no timer is pending').toBe(0)
  await clock.advance(60_000)
  expect(w.painted.length, 'no frame is painted').toBe(painted)
  expect(running()).toBe(0)
})

test('a turn still running when the pane is shown again writes from then on, and rests when it ends', async ($, on) => {
  const { clock, w, running, hide, reveal } = await start($, on)
  await startTurn($, 't1')
  await hide()
  w.painted.length = 0
  await reveal()
  const write = framesOf('write')
  expect(named(w.painted), 'it starts at the first frame of writing').toEqual(SEQUENCE(write[0] ?? ''))
  expect(running()).toBe(1)
  await clock.advance(WRITE_STEP * 2)
  expect(w.painted.at(-1), 'and goes on').toBe(write[2])
  await endTurn($, 't1')
  expect(w.painted.at(-1)).toBe(REST)
  expect(running()).toBe(0)
})

test('a turn that started and ended while the pane was not shown plays nothing when it is shown', async ($, on) => {
  const { clock, w, running, hide, reveal } = await start($, on)
  await hide()
  await startTurn($, 't1')
  await clock.advance(WRITE_STEP * 5)
  await endTurn($, 't1')
  expect(w.painted, 'nothing is painted while it is behind').toEqual([])
  await reveal()
  await clock.advance(60_000)
  expect(named(w.painted), 'only the resting picture, once').toEqual(SEQUENCE(REST))
  expect(running()).toBe(0)
})

test('a search still running when the pane is shown again looks from then on', async ($, on) => {
  const { clock, w, running, hide, reveal, hold, answerSearch } = await start($, on)
  await hide()
  hold()
  const rescan = $.command.run({ command: 'sidekick-rescan', args: 'tickets are in docs/tasks', ...RUN })
  await clock.settle()
  expect(w.painted, 'nothing is painted while it is behind').toEqual([])
  expect(running()).toBe(0)
  await reveal()
  const look = framesOf('look')
  expect(named(w.painted)).toEqual(SEQUENCE(look[0] ?? ''))
  await clock.advance(LOOK_STEP * 2)
  expect(w.painted.at(-1)).toBe(look[2])
  await answerSearch(answered(RECIPE))
  await rescan
  expect(w.painted.at(-1)).toBe(REST)
})

test('a search that started and ended while the pane was not shown plays nothing when it is shown', async ($, on) => {
  const { clock, w, hide, reveal, hold, answerSearch } = await start($, on)
  await hide()
  hold()
  const rescan = $.command.run({ command: 'sidekick-rescan', args: 'tickets are in docs/tasks', ...RUN })
  await clock.settle()
  await clock.advance(LOOK_STEP * 5)
  await answerSearch(answered(RECIPE))
  await rescan
  expect(w.painted).toEqual([])
  await reveal()
  await clock.advance(60_000)
  expect(named(w.painted)).toEqual(SEQUENCE(REST))
})

test('a ticket that becomes done while the pane is not shown zaps once, with its strike, when the pane is next shown', async ($, on) => {
  const { clock, w, running, hide, reveal } = await start($, on)
  await hide()
  await change($, w, clock, ALMOST, 9)
  await clock.advance(60_000)
  expect(w.painted, 'nothing is painted while it is behind').toEqual([])
  expect(running()).toBe(0)

  const ui = await reveal()
  expect(named(w.painted), 'the zap begins at once').toEqual(SEQUENCE(framesOf('zap')[0] ?? ''))
  await clock.advance(ZAP_STEP * 4)
  expect(await flashingOf(ui, clock), 'the strike lands on the row, in step with the zap').toEqual(['✓ Payment'])
  await clock.advance(STRIKE_MS)
  expect(await flashingOf(ui, clock)).toEqual([])
  await clock.advance(60_000)
  expect(named(w.painted), 'once').toEqual(SEQUENCE(framesOf('zap'), REST))
})

test('a search that fails while the pane is not shown plays no shrug, then or when the pane is next shown', async ($, on) => {
  const { clock, w, hide, reveal } = await start($, on)
  await hide()
  await failRescan($, w)
  await clock.advance(60_000)
  expect(w.painted, 'no shrug while it is behind').toEqual([])
  await reveal()
  await clock.advance(60_000)
  expect(named(w.painted), 'no shrug on show').toEqual(SEQUENCE(REST))
})

test('a ticket set that becomes all done while the pane is not shown cheers once when the pane is next shown, after its zap', async ($, on) => {
  const { clock, w, hide, reveal } = await start($, on, ALMOST)
  await hide()
  await change($, w, clock, ALL, 9)
  await clock.advance(60_000)
  expect(w.painted).toEqual([])
  const ui = await reveal()
  await clock.advance(ZAP_STEP * 4)
  expect(await flashingOf(ui, clock)).toEqual(['✓ Shipping'])
  await clock.advance(STRIKE_MS + CHEER_MS * 2)
  expect(named(w.painted)).toEqual(SEQUENCE(framesOf('zap'), REST, framesOf('cheer'), REST))
})

test('several once-only animations kept while the pane is not shown play in the order they arrived, each once, and the shrug among them is dropped', async ($, on) => {
  const { clock, w, running, hide, reveal } = await start($, on)
  await hide()
  await change($, w, clock, ALMOST, 9)
  await failRescan($, w)
  await change($, w, clock, ALL, 12)
  expect(w.painted).toEqual([])
  const ui = await reveal()
  await clock.advance(ZAP_STEP * 4)
  expect(await flashingOf(ui, clock), 'one strike takes both rows').toEqual(['✓ Payment', '✓ Shipping'])
  await clock.advance(STRIKE_MS + CHEER_MS * 2)
  await clock.advance(60_000)
  expect(named(w.painted)).toEqual(SEQUENCE(framesOf('zap'), REST, framesOf('cheer'), REST))
  expect(running()).toBe(0)
})

test('a zap that was under way when the pane went behind another is not played again on show', async ($, on) => {
  const { clock, w, running, hide, reveal } = await start($, on)
  await change($, w, clock, ALMOST, 9)
  await clock.advance(ZAP_STEP * 2)
  await hide()
  expect(running(), 'the zap stopped').toBe(0)
  w.painted.length = 0
  const ui = await reveal()
  await clock.advance(60_000)
  expect(named(w.painted), 'only the resting picture').toEqual(SEQUENCE(REST))
  expect(await flashingOf(ui, clock), 'no strike is left on the rows').toEqual([])
})

test('no ambient animation plays in the first 5 seconds after the pane is shown, and one does afterwards', async ($, on) => {
  const { clock, w, gaps, hide, reveal } = await start($, on, TICKETS, true)
  await clock.advance(AMBIENT_GAP_MS.min * 2)
  await hide()
  await clock.advance(10 * AMBIENT_GAP_MS.max)
  w.painted.length = 0
  await reveal()
  expect(gaps(), 'its wait starts afresh').toBe(1)
  await clock.advance(AMBIENT_GAP_MS.min - 1)
  expect(named(w.painted), 'nothing but the resting picture before 5 seconds').toEqual(SEQUENCE(REST))
  await clock.advance(AMBIENT_GAP_MS.max + LONGEST_MS)
  expect(w.painted.length, 'an ambient animation has played').toBeGreaterThan(1)
})
