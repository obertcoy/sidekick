import { expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { On } from 'claude-code'

import { render } from '../hooks/sprite/compose'
import { ANIMATIONS, currentLook, layersOf } from '../hooks/sprite/registry'
import { PANE, RECIPE, RUN, addSet, answered, counting, failed, ticket, world } from './world'
import type { Reply, World } from './world'

// What the sidekick does while a search runs, when one fails, and how that mixes with turns and
// zaps. Each test drives the mod as the engine does and reads the cells the mod painted.
const ROOT = '/work/shop'
const ISSUES = `${ROOT}/.scratch/checkout/issues`
const SHRUG_MS = ANIMATIONS.shrug.frames * ANIMATIONS.shrug.msPerFrame
const LOOK_MS = ANIMATIONS.look.msPerFrame
const WRITE_MS = ANIMATIONS.write.msPerFrame
const SHRUG_STEP = ANIMATIONS.shrug.msPerFrame
const ZAP_STEP = ANIMATIONS.zap.msPerFrame
// The strike runs one step longer than the zap has frames; the sidekick rests for that last step.
const STRIKE_MS = 13 * ZAP_STEP
const NONE = '{"kind":"none"}'

const TICKETS = {
  '01-cart.md': ticket('01: Cart', 'done'),
  '02-pay.md': ticket('02: Payment', 'in-progress'),
  '03-ship.md': ticket('03: Shipping', 'ready-for-agent'),
}

/** Every frame of an animation as the renderer draws it for the look now. */
const framesOf = (mode: keyof typeof ANIMATIONS): string[] =>
  Array.from({ length: ANIMATIONS[mode].frames }, (_, step) => render(layersOf(currentLook()), ANIMATIONS[mode], step))
const REST = (): string => framesOf('idle')[0] ?? ''

/** What each painted picture is, by name ("look3", "shrug7"), so that a failure reads as a sequence. Pictures that are the same frame have the same name. */
const named = (painted: readonly string[]): string[] => {
  const names = new Map<string, string>()
  for (const mode of ['idle', 'shrug', 'look', 'write', 'zap'] as const) {
    framesOf(mode).forEach((cells, step) => {
      if (!names.has(cells)) names.set(cells, `${mode}${step}`)
    })
  }

  return painted.map(cells => names.get(cells) ?? 'unknown')
}

type Open = {
  clock: MockClock
  w: World
  /** How many timers of the sidekick's are in flight now; the pane's own refresh is not counted. */
  running: () => number
  /** Answers the search that is held, with `reply`. */
  answerSearch: (reply: Reply) => Promise<void>
}

/** A session whose first search is held until the test answers it; the sidekick is looking. */
const open = async ($: Engine, on: On): Promise<Open> => {
  const timers = counting(on)
  const clock = mock.clock(timers.on)
  mock.store(on)
  const w = world(on, ROOT)
  addSet(w, ROOT, 'checkout', TICKETS, 5)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: { ok: true } }))
  let release: ((reply: Reply) => void) | undefined
  // Only the search is held; a turn's summary is answered at once, as it is not what these tests are about.
  w.answer = prompt =>
    prompt.startsWith('Current status') ? answered('{"change":false}') : new Promise<Reply>(resolve => (release = resolve))
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const answerSearch = async (reply: Reply): Promise<void> => {
    if (release === undefined) throw new Error('no search is held')
    release(reply)
    release = undefined
    await clock.settle()
  }

  return { clock, w, running: timers.running, answerSearch }
}

/** A session that has found its tickets and stands still. */
const settled = async ($: Engine, on: On): Promise<Open> => {
  const session = await open($, on)
  await session.answerSearch(answered(RECIPE))
  session.w.painted.length = 0

  return session
}

// A subagent's run raises no turn.start, so only the main turn is started here.
const startTurn = ($: Engine, id: string) => $.turn.start({ text: 'Build it.', turnId: id })

const endTurn = (
  $: Engine,
  id: string,
  agentId?: string,
) =>
  $.turn.complete({
    answer: 'Done.',
    durationMs: 1,
    isAborted: false,
    turnId: id,
    reason: 'answer',
    ...(agentId === undefined ? {} : { agentId }),
  })

/** A ticket finishes on disk and the mod notices, as it does when a file tool touches one. */
const finish = async ($: Engine, w: World, clock: MockClock): Promise<void> => {
  addSet(w, ROOT, 'checkout', { ...TICKETS, '02-pay.md': ticket('02: Payment', 'done') }, 9)
  await $.tool.call({ tool: 'Read', file_path: `${ISSUES}/02-pay.md` })
  await clock.settle()
}

/** A rescan whose search the model cannot answer: the sidekick shrugs. */
const failRescan = async ($: Engine, w: World): Promise<void> => {
  w.answer = () => failed
  await $.command.run({ command: 'sidekick-rescan', args: 'tickets are in docs/tasks', ...RUN })
}

test('the sidekick looks around from the start of a search until it ends, and stands still after', async ($, on) => {
  const { clock, w, answerSearch } = await open($, on)
  const look = framesOf('look')
  expect(w.painted).toEqual([look[0]])
  // The loop runs for as long as the search does, past one round of its frames.
  for (let step = 1; step <= ANIMATIONS.look.frames + 2; step++) {
    await clock.advance(LOOK_MS)
    expect(w.painted.at(-1), `look step ${step}`).toBe(look[step % ANIMATIONS.look.frames])
  }
  expect(new Set(w.painted).size, 'the look moves').toBeGreaterThan(1)
  for (const painted of w.painted) expect(look, 'only looking is painted while the search runs').toContain(painted)

  await answerSearch(answered(RECIPE))
  expect(w.painted.at(-1)).toBe(REST())
  const painted = w.painted.length
  await clock.advance(10_000)
  expect(w.painted.length, 'nothing moves once the search is over').toBe(painted)
})

test('a rescan makes the sidekick look from the command until the reply', async ($, on) => {
  const { clock, w } = await settled($, on)
  let release: ((reply: Reply) => void) | undefined
  w.answer = () => new Promise<Reply>(resolve => (release = resolve))
  const running = $.command.run({ command: 'sidekick-rescan', args: 'tickets are in docs/tasks', ...RUN })
  await clock.settle()
  const look = framesOf('look')
  expect(w.painted).toEqual([look[0]])
  await clock.advance(LOOK_MS * 2)
  expect(w.painted.at(-1)).toBe(look[2])

  release?.(answered(RECIPE))
  await running
  await clock.settle()
  // It found tickets, so there is no shrug: the sidekick goes from looking to rest.
  expect(w.painted.at(-1)).toBe(REST())
  const painted = w.painted.length
  await clock.advance(10_000)
  expect(w.painted.length).toBe(painted)
})

for (const [name, reply] of [
  ['gets no answer', failed],
  ['finds no tickets', answered(NONE)],
] as const) {
  test(`a search that ${name} ends with one shrug, from its first frame to the last, and then rest`, async ($, on) => {
    const { clock, w, running, answerSearch } = await open($, on)
    const from = w.painted.length
    await answerSearch(reply)
    const shrug = framesOf('shrug')
    expect(w.painted.slice(from)).toEqual([shrug[0]])
    for (let step = 1; step < ANIMATIONS.shrug.frames; step++) {
      await clock.advance(SHRUG_STEP)
      expect(w.painted.at(-1), `shrug step ${step}`).toBe(shrug[step])
    }
    await clock.advance(SHRUG_STEP)
    expect(w.painted.slice(from)).toEqual([...shrug, REST()])
    expect(running(), 'the timer stops with the shrug').toBe(0)
    // Well short of the pane's next refresh, which asks again after a call that got no answer.
    await clock.advance(10_000)
    expect(named(w.painted.slice(from)), 'one shrug only').toEqual(named([...shrug, REST()]))
  })
}

test('a search that finds tickets does not shrug: the sidekick goes from looking straight to rest', async ($, on) => {
  const { clock, w, answerSearch } = await open($, on)
  const from = w.painted.length
  await answerSearch(answered(RECIPE))
  expect(w.painted.slice(from)).toEqual([REST()])
  await clock.advance(SHRUG_MS * 2)
  expect(w.painted.slice(from)).toEqual([REST()])
})

test('a search that already reads tickets and fails to add a place still shrugs: a failed call is a failed search', async ($, on) => {
  const { clock, w } = await settled($, on)
  await failRescan($, w)
  const shrug = framesOf('shrug')
  // The look that the rescan began with, then the shrug, then rest.
  expect(w.painted.slice(-1)).toEqual([shrug[0]])
  await clock.advance(SHRUG_MS)
  expect(w.painted.slice(-(shrug.length + 1))).toEqual([...shrug, REST()])
})

test('a turn and a search together write; when the search ends first it keeps writing, and when the turn ends it stands still', async ($, on) => {
  const { clock, w, answerSearch } = await open($, on)
  const write = framesOf('write')
  await startTurn($, 't1')
  expect(w.painted.at(-1)).toBe(write[0])
  await clock.advance(WRITE_MS)
  expect(w.painted.at(-1)).toBe(write[1])

  // The search ends: nothing is repainted and the writing carries on from where it was.
  const painted = w.painted.length
  await answerSearch(answered(RECIPE))
  expect(w.painted.length).toBe(painted)
  await clock.advance(WRITE_MS)
  expect(w.painted.at(-1)).toBe(write[2])

  await endTurn($, 't1')
  expect(w.painted.at(-1)).toBe(REST())
  const after = w.painted.length
  await clock.advance(10_000)
  expect(w.painted.length).toBe(after)
})

test('a turn and a search together write; when the turn ends first it looks, and when the search ends it stands still', async ($, on) => {
  const { clock, w, answerSearch } = await open($, on)
  const write = framesOf('write')
  const look = framesOf('look')
  await startTurn($, 't1')
  await clock.advance(WRITE_MS * 2)
  expect(w.painted.at(-1)).toBe(write[2])

  await endTurn($, 't1')
  expect(w.painted.at(-1)).toBe(look[0])
  await clock.advance(LOOK_MS)
  expect(w.painted.at(-1)).toBe(look[1])

  await answerSearch(answered(RECIPE))
  expect(w.painted.at(-1)).toBe(REST())
  const painted = w.painted.length
  await clock.advance(10_000)
  expect(w.painted.length).toBe(painted)
})

test('a turn that begins during a shrug does not cut it short; the writing starts when the shrug has played out', async ($, on) => {
  const { clock, w, answerSearch } = await open($, on)
  const from = w.painted.length
  await answerSearch(failed)
  const shrug = framesOf('shrug')
  await clock.advance(SHRUG_STEP * 2)
  await startTurn($, 't1')
  expect(w.painted.at(-1), 'the turn did not interrupt').toBe(shrug[2])
  for (let step = 3; step < ANIMATIONS.shrug.frames; step++) {
    await clock.advance(SHRUG_STEP)
    expect(w.painted.at(-1), `shrug step ${step}`).toBe(shrug[step])
  }
  await clock.advance(SHRUG_STEP)
  expect(w.painted.slice(from)).toEqual([...shrug, framesOf('write')[0]])
})

test('a turn that begins and ends during a shrug leaves the shrug whole and rest after it', async ($, on) => {
  // Tickets are already known, so the refresh after the turn does not search again.
  const { clock, w } = await settled($, on)
  await failRescan($, w)
  const from = w.painted.length - 1
  await clock.advance(SHRUG_STEP)
  await startTurn($, 't1')
  await clock.advance(SHRUG_STEP)
  await endTurn($, 't1')
  await clock.advance(SHRUG_MS)
  expect(named(w.painted.slice(from))).toEqual(named([...framesOf('shrug'), REST()]))
})

test('a ticket that finishes during a shrug is struck after it: the shrug plays whole, then the zap, then rest', async ($, on) => {
  const { clock, w } = await settled($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const flashing = async () => (await ui.findAll({ type: 'Text' })).filter(one => one.props.backgroundColor === 'warning')
  await failRescan($, w)
  const from = w.painted.length - 1
  await clock.advance(SHRUG_STEP * 2)
  await finish($, w, clock)
  expect(await flashing(), 'the strike waits for the shrug').toHaveLength(0)
  await clock.advance(SHRUG_MS - SHRUG_STEP * 2)
  // The shrug is over: the zap begins, and the strike with it.
  const shrug = framesOf('shrug')
  const zap = framesOf('zap')
  expect(named(w.painted.slice(from))).toEqual(named([...shrug, zap[0] ?? '']))
  await clock.advance(4 * ZAP_STEP)
  expect((await flashing()).map(one => one.text)).toEqual(['✓ Payment'])
  await clock.advance(STRIKE_MS)
  expect(named(w.painted.slice(from))).toEqual(named([...shrug, ...zap, REST()]))
  expect(await flashing()).toHaveLength(0)
  await ui.unmount()
})

test('a shrug that arrives during a zap plays after it, in the order the two arrived', async ($, on) => {
  const { clock, w, running } = await settled($, on)
  const from = w.painted.length
  await finish($, w, clock)
  await clock.advance(ZAP_STEP * 3)
  await failRescan($, w)
  const zap = framesOf('zap')
  const shrug = framesOf('shrug')
  // The zap is not cut short by the search that began, nor by the shrug it queued.
  expect(named(w.painted.slice(from, from + 4))).toEqual(named(zap.slice(0, 4)))
  await clock.advance(STRIKE_MS - ZAP_STEP * 3)
  expect(named(w.painted.slice(from))).toEqual(named([...zap, REST(), shrug[0] ?? '']))
  await clock.advance(SHRUG_MS)
  expect(named(w.painted.slice(from))).toEqual(named([...zap, REST(), ...shrug, REST()]))
  expect(running()).toBe(0)
})

test('a subagent turn that completes during the main turn does not stop the writing', async ($, on) => {
  const { clock, w } = await settled($, on)
  const write = framesOf('write')
  await startTurn($, 't1')
  expect(w.painted.at(-1)).toBe(write[0])
  await clock.advance(WRITE_MS)
  expect(w.painted.at(-1)).toBe(write[1])
  const painted = w.painted.length
  await endTurn($, 'sub2', 'a1b2c3')
  expect(w.painted.length, 'the subagent ending paints nothing').toBe(painted)
  await clock.advance(WRITE_MS)
  expect(w.painted.at(-1), 'the writing goes on').toBe(write[2])

  await endTurn($, 't1')
  expect(w.painted.at(-1)).toBe(REST())
})

test('a new session does not start with a turn that never completed: the sidekick stands still', async ($, on) => {
  const { clock, w } = await settled($, on)
  await startTurn($, 't1')
  await clock.advance(WRITE_MS)
  expect(named(w.painted.slice(-1))).toEqual(['write1'])
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(w.painted.at(-1)).toBe(REST())
  const painted = w.painted.length
  await clock.advance(5_000)
  expect(w.painted.length, 'nothing is writing').toBe(painted)
})

test('tickets that finish while a strike is still waiting join it, and are struck together after the shrug', async ($, on) => {
  const { clock, w } = await settled($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const flashing = async () => (await ui.findAll({ type: 'Text' })).filter(one => one.props.backgroundColor === 'warning')
  await failRescan($, w)
  await clock.advance(SHRUG_STEP)
  await finish($, w, clock)
  // A second ticket finishes while the first one's strike has not begun.
  addSet(w, ROOT, 'checkout', { ...TICKETS, '02-pay.md': ticket('02: Payment', 'done'), '03-ship.md': ticket('03: Shipping', 'done') }, 12)
  await $.tool.call({ tool: 'Read', file_path: `${ISSUES}/03-ship.md` })
  await clock.settle()
  expect(await flashing()).toHaveLength(0)
  await clock.advance(SHRUG_MS - SHRUG_STEP + 4 * ZAP_STEP)
  expect((await flashing()).map(one => one.text).sort()).toEqual(['✓ Payment', '✓ Shipping'])
  await clock.advance(STRIKE_MS)
  expect(await flashing()).toHaveLength(0)
  await ui.unmount()
})

test('a timer runs only while the sidekick is moving, and never more than one', async ($, on) => {
  const { clock, w, running, answerSearch } = await open($, on)
  expect(running(), 'looking').toBe(1)
  await startTurn($, 't1')
  expect(running(), 'writing while a search runs').toBe(1)
  await answerSearch(answered(RECIPE))
  expect(running(), 'still writing').toBe(1)
  await endTurn($, 't1')
  expect(running(), 'standing still').toBe(0)
  await clock.advance(30_000)
  expect(running(), 'standing still for a long while').toBe(0)

  await finish($, w, clock)
  expect(running(), 'zapping and striking').toBe(1)
  await clock.advance(STRIKE_MS - 1)
  expect(running(), 'the strike outlasts the zap on the same timer').toBe(1)
  await clock.advance(1)
  expect(running(), 'struck').toBe(0)

  await failRescan($, w)
  expect(running(), 'shrugging').toBe(1)
  await clock.advance(SHRUG_MS)
  expect(running(), 'done shrugging').toBe(0)
})
