import type { On } from 'claude-code'
import type { Engine, MockClock } from 'claude-code/testing'
import { expect, mock } from 'claude-code/testing'
import { render } from '../hooks/sprite/compose'
import { currentLook, layersOf } from '../hooks/sprite/look-in-use'
import { ANIMATIONS } from '../hooks/sprite/registry'
import { strikeSteps } from '../hooks/strike'
import type { Reply, World } from './world'
import { addSet, answered, counting, failed, PANE, RECIPE, REFRESH_MS, RUN, test, ticket, world } from './world'

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
const STRIKE_MS = strikeSteps(ANIMATIONS.zap) * ZAP_STEP

type Mounted = Awaited<ReturnType<Engine['ui']['mount']>>

/** The rows the strike has flashing now. The clock settles first so a repaint the last tick asked for is in. */
const flashingOf = async (ui: Pick<Mounted, 'findAll'>, clock: MockClock) => {
  await clock.settle()

  return (await ui.findAll({ type: 'Text' })).filter(one => one.props.backgroundColor === 'warning')
}
const NONE = '{"kind":"none"}'

const TICKETS = {
  '01-cart.md': ticket('01: Cart', 'done'),
  '02-pay.md': ticket('02: Payment', 'in-progress'),
  '03-ship.md': ticket('03: Shipping', 'ready-for-agent'),
}

// Drawing a frame costs real time, and `named` asks for every frame of every animation on each call, so a
// frame is drawn once per look and animation. The key is the look's names, which is all that picks the picture.
const drawn = new Map<string, string[]>()

/** Every frame of an animation as the renderer draws it for the look now. */
const framesOf = (mode: keyof typeof ANIMATIONS): string[] => {
  const look = currentLook()
  const key = `${mode}:${JSON.stringify(look)}`
  let frames = drawn.get(key)
  if (frames === undefined) {
    frames = Array.from({ length: ANIMATIONS[mode].frames }, (_, step) => render(layersOf(look), ANIMATIONS[mode], step))
    drawn.set(key, frames)
  }

  return [...frames]
}
const REST = (): string => framesOf('idle')[0] ?? ''

/** What each painted picture is, by name ("look3", "shrug7"), so that a failure reads as a sequence. Pictures that are the same frame have the same name. */
const named = (painted: readonly string[]): string[] => {
  const names = new Map<string, string>()
  for (const mode of Object.keys(ANIMATIONS) as (keyof typeof ANIMATIONS)[]) {
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
const open = async ($: Engine, on: On, tickets: Record<string, string> = TICKETS): Promise<Open> => {
  const timers = counting(on)
  const clock = mock.clock(timers.on)
  mock.store(on)
  const w = world(on, ROOT)
  addSet(w, ROOT, 'checkout', tickets, 5)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: { ok: true } }))
  let release: ((reply: Reply) => void) | undefined
  // Only the search is held; a turn's summary is answered at once, as it is not what these tests are about.
  w.answer = prompt => (prompt.startsWith('Current status') ? answered('{"change":false}') : new Promise<Reply>(resolve => (release = resolve)))
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
const settled = async ($: Engine, on: On, tickets: Record<string, string> = TICKETS): Promise<Open> => {
  const session = await open($, on, tickets)
  await session.answerSearch(answered(RECIPE))
  session.w.painted.length = 0

  return session
}

// A subagent's run raises no turn.start, so only the main turn is started here.
const startTurn = ($: Engine, id: string) => $.turn.start({ text: 'Build it.', turnId: id })

const endTurn = ($: Engine, id: string, agentId?: string) =>
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
  const flashing = () => flashingOf(ui, clock)
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
  const flashing = () => flashingOf(ui, clock)
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

// The cheer: once, when the last ticket of the active ticket set becomes done, after that ticket's zap and strike.
const CHEER_MS = ANIMATIONS.cheer.frames * ANIMATIONS.cheer.msPerFrame
const CHEER_STEP = ANIMATIONS.cheer.msPerFrame
/** Two of three tickets are done: finishing the last one finishes the set. */
const ALMOST = { ...TICKETS, '02-pay.md': ticket('02: Payment', 'done') }
const ALL = { ...ALMOST, '03-ship.md': ticket('03: Shipping', 'done') }
const isMoving = (name: string): boolean => name.startsWith('cheer') || name.startsWith('zap')

/** The tickets change on disk and the mod notices, as it does when a file tool touches one. */
const change = async ($: Engine, w: World, clock: MockClock, tickets: Record<string, string>, mtimeMs: number): Promise<void> => {
  addSet(w, ROOT, 'checkout', tickets, mtimeMs)
  await $.tool.call({ tool: 'Read', file_path: `${ISSUES}/${Object.keys(tickets).at(-1) ?? '03-ship.md'}` })
  await clock.settle()
}

const cheers = (painted: readonly string[]): number => named(painted).filter(name => name === 'cheer0').length

test('the cheer frames are told apart from every other animation, so a painted sequence reads as it was played', async () => {
  const others = new Set((['idle', 'shrug', 'look', 'write', 'zap'] as const).flatMap(mode => framesOf(mode)))
  const cheer = framesOf('cheer')
  expect(cheer.length).toBe(ANIMATIONS.cheer.frames)
  expect(cheer[0], 'it starts with a picture of its own').not.toBe(REST())
  for (const [step, cells] of cheer.entries()) {
    // The last frames may be the resting picture: the cheer ends where it began.
    if (cells !== REST()) expect(others.has(cells), `cheer ${step} is its own picture`).toBe(false)
  }
})

test('the last ticket of the set finishing gives the zap and its whole strike, and only then the cheer, and then the sidekick stands still', async ($, on) => {
  const { clock, w, running } = await settled($, on, ALMOST)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const flashing = () => flashingOf(ui, clock)
  const from = w.painted.length
  await change($, w, clock, ALL, 9)
  const zap = framesOf('zap')
  const cheer = framesOf('cheer')
  expect(named(w.painted.slice(from))).toEqual(named([zap[0] ?? '']))
  await clock.advance(4 * ZAP_STEP)
  expect(
    (await flashing()).map(one => one.text),
    'the strike lands on the row',
  ).toEqual(['✓ Shipping'])

  // One tick short of the end of the strike: the zap is over, the strike is not, and no cheer has begun.
  await clock.advance(STRIKE_MS - 4 * ZAP_STEP - 1)
  expect(cheers(w.painted.slice(from)), 'no cheer before the strike is done').toBe(0)
  expect(named(w.painted.slice(from)).slice(0, ANIMATIONS.zap.frames)).toEqual(named(zap))
  await clock.advance(1)
  expect(await flashing(), 'the strike has completed').toHaveLength(0)
  expect(w.painted.at(-1), 'the cheer begins when the strike ends').toBe(cheer[0])

  for (let step = 1; step < ANIMATIONS.cheer.frames; step++) {
    await clock.advance(CHEER_STEP)
    expect(w.painted.at(-1), `cheer step ${step}`).toBe(cheer[step])
  }
  await clock.advance(CHEER_STEP)
  expect(w.painted.at(-1), 'after the cheer the sidekick stands still').toBe(REST())
  expect(named(w.painted.slice(from))).toEqual(named([...zap, REST(), ...cheer, REST()]))
  expect(running(), 'the timer stops with the cheer').toBe(0)
  const painted = w.painted.length
  await clock.advance(10_000)
  expect(w.painted.length, 'nothing moves after the cheer').toBe(painted)
  await ui.unmount()
})

test('a ticket that finishes while others remain open gets the zap and no cheer', async ($, on) => {
  const { clock, w } = await settled($, on)
  const from = w.painted.length
  await change($, w, clock, ALMOST, 9)
  await clock.advance(STRIKE_MS + CHEER_MS * 2)
  expect(named(w.painted.slice(from))).toEqual(named([...framesOf('zap'), REST()]))
  expect(cheers(w.painted)).toBe(0)
})

test('reopening a ticket and finishing the set again cheers again, and the reopening itself paints nothing', async ($, on) => {
  const { clock, w } = await settled($, on, ALMOST)
  await change($, w, clock, ALL, 9)
  await clock.advance(STRIKE_MS + CHEER_MS)
  expect(cheers(w.painted), 'the first completion').toBe(1)

  const painted = w.painted.length
  await change($, w, clock, ALMOST, 12)
  await clock.advance(STRIKE_MS + CHEER_MS)
  expect(w.painted.length, 'reopening is no zap and no cheer').toBe(painted)

  await change($, w, clock, ALL, 15)
  await clock.advance(STRIKE_MS + CHEER_MS)
  expect(cheers(w.painted), 'the second completion').toBe(2)
  expect(w.painted.at(-1)).toBe(REST())
})

test('a turn that begins during the cheer does not cut it short, and the sidekick writes when it is over', async ($, on) => {
  const { clock, w } = await settled($, on, ALMOST)
  await change($, w, clock, ALL, 9)
  await clock.advance(STRIKE_MS + CHEER_STEP * 2)
  const cheer = framesOf('cheer')
  expect(w.painted.at(-1)).toBe(cheer[2])
  await startTurn($, 't1')
  expect(w.painted.at(-1), 'the turn did not interrupt').toBe(cheer[2])
  for (let step = 3; step < ANIMATIONS.cheer.frames; step++) {
    await clock.advance(CHEER_STEP)
    expect(w.painted.at(-1), `cheer step ${step}`).toBe(cheer[step])
  }
  await clock.advance(CHEER_STEP)
  expect(w.painted.at(-1)).toBe(framesOf('write')[0])
  await endTurn($, 't1')
  expect(w.painted.at(-1)).toBe(REST())
})

test('a set that is already all done when the session opens does not cheer, at the first refresh, at later ones, or at a later session start', async ($, on) => {
  const { clock, w, answerSearch } = await open($, on, ALL)
  await answerSearch(answered(RECIPE))
  await clock.advance(REFRESH_MS * 2)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await clock.settle()
  await clock.advance(REFRESH_MS * 2)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '3/3 done' }), 'the pane does show the finished set').toBeDefined()
  await ui.unmount()
  expect(named(w.painted).filter(isMoving)).toEqual([])
})

test('changing the active ticket set to one that is all done does not cheer', async ($, on) => {
  const { clock, w } = await settled($, on)
  addSet(w, ROOT, 'billing', { '01-plans.md': ticket('01: Plans', 'done'), '02-invoices.md': ticket('02: Invoices', 'done') }, 20)
  const from = w.painted.length
  const picked = await $.command.run({ command: 'sidekick-pick', args: 'billing', ...RUN })
  await clock.settle()
  expect(picked.text).toBe('Showing billing: 2/2 done.')
  await clock.advance(STRIKE_MS + CHEER_MS)
  expect(named(w.painted.slice(from)).filter(isMoving)).toEqual([])
})

test('a done ticket added to a set that was already all done does not cheer', async ($, on) => {
  const { clock, w } = await settled($, on, ALL)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '3/3 done' })).toBeDefined()
  await change($, w, clock, { ...ALL, '04-track.md': ticket('04: Tracking', 'done') }, 9)
  await clock.advance(STRIKE_MS + CHEER_MS)
  expect(await ui.find({ type: 'Text', text: '4/4 done' }), 'the pane has read the new ticket').toBeDefined()
  await ui.unmount()
  expect(cheers(w.painted)).toBe(0)
})

test('two tickets finishing in one refresh that complete the set give one zap striking both rows, then one cheer, then rest', async ($, on) => {
  const { clock, w } = await settled($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const from = w.painted.length
  await change($, w, clock, ALL, 9)
  await clock.advance(ZAP_STEP * 4)
  expect((await flashingOf(ui, clock)).map(one => one.text).sort(), 'one strike takes both rows').toEqual(['✓ Payment', '✓ Shipping'])
  await clock.advance(STRIKE_MS + CHEER_MS * 2)
  expect(named(w.painted.slice(from))).toEqual(named([...framesOf('zap'), REST(), ...framesOf('cheer'), REST()]))
  expect(await flashingOf(ui, clock)).toHaveLength(0)
  await ui.unmount()
})

test('the last ticket finishing while an earlier strike is on show is struck after it, and the cheer comes once after that', async ($, on) => {
  const { clock, w } = await settled($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const from = w.painted.length
  await change($, w, clock, ALMOST, 9)
  await clock.advance(ZAP_STEP * 3)
  await change($, w, clock, ALL, 12)
  expect(cheers(w.painted.slice(from)), 'the cheer waits for both strikes').toBe(0)
  await clock.advance(STRIKE_MS * 2 + CHEER_MS * 2)
  const zap = framesOf('zap')
  expect(named(w.painted.slice(from))).toEqual(named([...zap, REST(), ...zap, REST(), ...framesOf('cheer'), REST()]))
  expect(await flashingOf(ui, clock)).toHaveLength(0)
  await ui.unmount()
})

test('the last ticket finishing while an earlier strike still waits behind a shrug joins it, and the cheer comes once after the strike', async ($, on) => {
  const { clock, w } = await settled($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await failRescan($, w)
  const from = w.painted.length - 1
  await clock.advance(SHRUG_STEP)
  await change($, w, clock, ALMOST, 9)
  await change($, w, clock, ALL, 12)
  await clock.advance(SHRUG_MS + STRIKE_MS + CHEER_MS * 2)
  expect(named(w.painted.slice(from))).toEqual(named([...framesOf('shrug'), ...framesOf('zap'), REST(), ...framesOf('cheer'), REST()]))
  expect(await flashingOf(ui, clock)).toHaveLength(0)
  await ui.unmount()
})

test('a set whose tickets all go away does not cheer', async ($, on) => {
  const { clock, w } = await settled($, on, ALMOST)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '2/3 done' })).toBeDefined()
  await change($, w, clock, {}, 9)
  await clock.advance(STRIKE_MS + CHEER_MS)
  expect(await ui.find({ type: 'Text', text: '2/3 done' }), 'the pane has read the empty set').toBeUndefined()
  await ui.unmount()
  expect(named(w.painted).filter(isMoving)).toEqual([])
})
