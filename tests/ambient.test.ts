import type { On } from 'claude-code'
import type { Engine, MockClock } from 'claude-code/testing'
import { expect, mock } from 'claude-code/testing'
import { AMBIENT_GAP_MS } from '../hooks/activity'
import { render } from '../hooks/sprite/compose'
import { layersOf } from '../hooks/sprite/look-in-use'
import { ANIMATIONS, ambientAnimationsOf, CHARACTERS } from '../hooks/sprite/registry'
import { strikeSteps } from '../hooks/strike'
import type { Reply, World } from './world'
import { addSet, answered, counting, failed, RECIPE, RUN, test, ticket, world } from './world'

// Ambient motion, whole-mod: the mock clock moves on, the store holds the setting, and what the mod paints is read back.
const ROOT = '/work/shop'
const OTHER = '/work/blog'
const ISSUES = `${ROOT}/.scratch/checkout/issues`
const MOTION = { command: 'sidekick-motion', ...RUN } as const
const LOOK = { command: 'sidekick-look', ...RUN } as const
const TICKETS = {
  '01-cart.md': ticket('01: Cart', 'done'),
  '02-pay.md': ticket('02: Payment', 'in-progress'),
  '03-ship.md': ticket('03: Shipping', 'ready-for-agent'),
}
/** How long a stretch of mock time the sidekick may be left alone, with room for the longest ambient animation to play out. */
const LONGEST_MS = Math.max(...Object.values(CHARACTERS).flatMap(character => ambientAnimationsOf(character).map(one => one.frames * one.msPerFrame)))
const STRIKE_MS = strikeSteps(ANIMATIONS.zap) * ANIMATIONS.zap.msPerFrame
const SHRUG_MS = ANIMATIONS.shrug.frames * ANIMATIONS.shrug.msPerFrame

// The mod runs in an environment of its own, so the look it holds is not readable from here: each test names the character it expects to see.
/** Every frame of a shared animation as the renderer draws the bare `character` (the default look is the bare foxkit). */
const framesOf = (name: keyof typeof ANIMATIONS, character = 'foxkit'): string[] =>
  Array.from({ length: ANIMATIONS[name].frames }, (_, step) => render(layersOf({ character, outfit: {}, background: null }), ANIMATIONS[name], step))
const REST = (character = 'foxkit'): string => framesOf('idle', character)[0] ?? ''
/** Every picture the character can paint while it only rests and plays its ambient animations. */
const ambientCells = (character = 'foxkit'): Set<string> => {
  const names = (CHARACTERS[character]?.ambient ?? []) as (keyof typeof ANIMATIONS)[]

  return new Set([REST(character), ...names.flatMap(one => framesOf(one, character))])
}

/** A store the test can reach into: `data` is what the mod saved, and `failsSet` makes a write fail. */
const openStore = (on: On, data: Record<string, unknown> = {}) => {
  const store = { data: new Map<string, unknown>(Object.entries(data)), failsSet: false }
  on('store.get', (_, e) => ({ value: store.data.get(e.key) }))
  on('store.set', (_, e) => {
    if (store.failsSet) throw new Error('disk full')
    store.data.set(e.key, e.value)

    return { value: undefined }
  })

  return store
}

type Open = {
  clock: MockClock
  w: World
  store: ReturnType<typeof openStore>
  /** How many timers of the sidekick's are in flight now; the pane's own refresh is not counted. */
  running: () => number
  /** How many of them are the one-time waits between ambient animations. */
  gaps: () => number
  /** The length of every such wait the mod started. */
  gapLengths: number[]
  /** Answers the search that is held, with `reply`. */
  answerSearch: (reply: Reply) => Promise<void>
  /** Holds the next search until `answerSearch`. */
  hold: () => void
}

/** A session whose tickets are found at once, so the sidekick rests from the start; `saved` is what the store holds. */
const start = async ($: Engine, on: On, saved: Record<string, unknown> = {}, tickets: Record<string, string> = TICKETS): Promise<Open> => {
  const timers = counting(on)
  const clock = mock.clock(timers.on)
  const store = openStore(on, saved)
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
  w.painted.length = 0
  const answerSearch = async (reply: Reply): Promise<void> => {
    if (release === undefined) throw new Error('no search is held')
    release(reply)
    release = undefined
    isHeld = false
    await clock.settle()
  }
  // Later searches are held until the test answers them.
  const hold = (): void => {
    isHeld = true
  }

  return { clock, w, store, running: timers.running, gaps: timers.gaps, gapLengths: timers.gapLengths, answerSearch, hold }
}

const startTurn = ($: Engine, id: string) => $.turn.start({ text: 'Build it.', turnId: id })
const endTurn = ($: Engine, id: string) =>
  $.turn.complete({
    answer: 'Done.',
    durationMs: 1,
    isAborted: false,
    turnId: id,
    reason: 'answer',
    toolUses: [],
    usage: { input_tokens: 0, output_tokens: 0 },
  } as never)

/** A ticket finishes on disk and the mod notices, as it does when a file tool touches one. */
const finish = async ($: Engine, w: World, clock: MockClock, tickets: Record<string, string>, mtimeMs: number): Promise<void> => {
  addSet(w, ROOT, 'checkout', tickets, mtimeMs)
  await $.tool.call({ tool: 'Read', file_path: `${ISSUES}/${Object.keys(tickets).at(-1) ?? '03-ship.md'}` })
  await clock.settle()
}

/** Moves the clock on in small steps until something is painted, and returns how long that took; undefined when `limit` passes first. */
const untilPainted = async (clock: MockClock, w: World, limit: number, step = 50): Promise<number | undefined> => {
  const from = w.painted.length
  for (let waited = 0; waited < limit; waited += step) {
    await clock.advance(step)
    if (w.painted.length > from) return waited + step
  }

  return undefined
}

test('a developer who never ran the command: nothing is painted in the first 5 seconds of rest, and an ambient animation has played by 15 seconds plus its length', async ($, on) => {
  const { clock, w, gaps } = await start($, on)
  expect(gaps(), 'one gap is pending at rest').toBe(1)
  await clock.advance(AMBIENT_GAP_MS.min - 1)
  expect(w.painted, 'nothing is painted before the earliest gap ends').toEqual([])
  await clock.advance(AMBIENT_GAP_MS.max + LONGEST_MS - (AMBIENT_GAP_MS.min - 1))
  expect(w.painted.length, 'an ambient animation has painted').toBeGreaterThan(0)
  expect(
    w.painted.some(cells => cells !== REST()),
    'it leaves rest',
  ).toBe(true)
  for (const cells of w.painted) expect(ambientCells().has(cells), 'only rest and ambient frames are painted').toBe(true)
  expect(w.painted.at(-1), 'the animation ends at rest').toBe(REST())
})

test('the gap between ambient animations is a whole number of milliseconds from 5 to 15 seconds, drawn afresh each time', async ($, on) => {
  const { clock, w, gapLengths } = await start($, on)
  // Sixty rounds, each longer than the longest gap and animation together.
  await clock.advance(60 * (AMBIENT_GAP_MS.max + LONGEST_MS))
  expect(gapLengths.length, 'a gap was started for every round').toBeGreaterThanOrEqual(60)
  for (const length of gapLengths) {
    expect(Number.isInteger(length), `${length} is whole`).toBe(true)
    expect(length, `${length} is at least the lower bound`).toBeGreaterThanOrEqual(AMBIENT_GAP_MS.min)
    expect(length, `${length} is at most the upper bound`).toBeLessThanOrEqual(AMBIENT_GAP_MS.max)
  }
  expect(new Set(gapLengths).size, 'the gap is not one fixed length').toBeGreaterThan(1)
  expect(w.painted.length, 'the sidekick moved in between').toBeGreaterThan(0)
})

test('the time between the starts of two ambient animations is at least the shortest gap and at most the longest gap plus the longest animation, give or take one 50 ms step', async ($, on) => {
  const { clock, w } = await start($, on)
  const STEP = 50
  const starts: number[] = []
  let now = 0
  // An animation starts with the first picture after a stretch of stillness longer than any animation.
  while (starts.length < 12 && now < 12 * (AMBIENT_GAP_MS.max + LONGEST_MS) + AMBIENT_GAP_MS.max) {
    const waited = await untilPainted(clock, w, AMBIENT_GAP_MS.max + LONGEST_MS + STEP, STEP)
    if (waited === undefined) break
    now += waited
    starts.push(now)
    // Let the animation play out.
    await clock.advance(LONGEST_MS + STEP)
    now += LONGEST_MS + STEP
  }
  expect(starts.length, 'the animations were seen').toBeGreaterThanOrEqual(12)
  // The first starts within the gap bounds, to the resolution of the steps.
  expect(starts[0], 'the first start is not before the earliest gap').toBeGreaterThanOrEqual(AMBIENT_GAP_MS.min)
  expect(starts[0], 'the first start is not after the latest gap').toBeLessThanOrEqual(AMBIENT_GAP_MS.max + STEP)
  // Start to start is the animation that ran plus the gap that followed it. Each start is seen up to one step late, so the interval is out by at most one step either way.
  for (const [index, at] of starts.slice(1).entries()) {
    const interval = at - (starts[index] ?? 0)
    expect(interval, `interval ${index + 1}`).toBeGreaterThanOrEqual(AMBIENT_GAP_MS.min - STEP)
    expect(interval, `interval ${index + 1}`).toBeLessThanOrEqual(AMBIENT_GAP_MS.max + LONGEST_MS + STEP)
  }
})

for (const [name, character] of Object.entries(CHARACTERS)) {
  test(`the ${name} plays only the ambient animations it lists, and every one of them in the end`, async ($, on) => {
    const { clock, w } = await start($, on)
    const reply = await $.command.run({ ...LOOK, args: `character=${name}` })
    expect(reply.text).toContain(`character=${name}`)
    w.painted.length = 0
    // About three hundred rounds: every listed animation comes up with certainty for practical purposes.
    await clock.advance(300 * (AMBIENT_GAP_MS.max + LONGEST_MS))
    const allowed = ambientCells(name)
    for (const cells of w.painted) expect(allowed.has(cells), 'a picture that is neither rest nor in the list').toBe(true)
    const seen = new Set(w.painted)
    for (const listed of character.ambient ?? []) {
      const frames = framesOf(listed as keyof typeof ANIMATIONS, name).filter(cells => cells !== REST(name))
      expect(
        frames.some(cells => seen.has(cells)),
        `${name} plays ${listed}`,
      ).toBe(true)
    }
  })
}

test('a look changed while the gap is pending is the one whose animations play', async ($, on) => {
  const { clock, w } = await start($, on)
  const foxkitOnly = new Set(
    (CHARACTERS.foxkit?.ambient ?? []).flatMap(listed => framesOf(listed as keyof typeof ANIMATIONS)).filter(cells => cells !== REST()),
  )
  await $.command.run({ ...LOOK, args: 'character=classic' })
  w.painted.length = 0
  await clock.advance(100 * (AMBIENT_GAP_MS.max + LONGEST_MS))
  expect(w.painted.length).toBeGreaterThan(0)
  for (const cells of w.painted) expect(foxkitOnly.has(cells), 'no picture of the foxkit after the change').toBe(false)
})

test("a session that moves to a project with another look drops the old character's running ambient animation at once, and plays the new character's afterwards", async ($, on) => {
  const known = { places: [{ kind: 'files', glob: '.scratch/*/issues/*.md', statusLabel: 'Status', doneValues: ['done'], activeValues: ['in-progress'] }] }
  const { clock, w, gaps } = await start($, on, { [`look:${ROOT}`]: { character: 'classic' }, [`recipe:${OTHER}`]: known })
  // This project shows the classic: it plays the classic's ambient animations.
  expect(await untilPainted(clock, w, AMBIENT_GAP_MS.max + 100), 'an ambient animation started').toBeDefined()
  for (const cells of w.painted) expect(ambientCells('classic').has(cells), 'the classic is drawn here').toBe(true)
  // The session moves to a project with no look of its own, and the pane refreshes. No search runs there: its recipe is known.
  addSet(w, OTHER, 'checkout', TICKETS, 5)
  w.root = OTHER
  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()
  expect(w.painted.at(-1), 'the animation is dropped and the foxkit rests').toBe(REST('foxkit'))
  const painted = w.painted.length
  await clock.advance(LONGEST_MS)
  expect(w.painted.length, 'the old animation does not go on').toBe(painted)
  expect(gaps(), 'a gap is pending again').toBe(1)
  await clock.advance(100 * (AMBIENT_GAP_MS.max + LONGEST_MS))
  for (const cells of w.painted.slice(painted)) expect(ambientCells('foxkit').has(cells), 'the foxkit is drawn after the move').toBe(true)
  expect(w.painted.length, 'the foxkit plays its own').toBeGreaterThan(painted)
})

test('no ambient animation plays, and no gap is pending, while a turn runs', async ($, on) => {
  const { clock, w, gaps, running } = await start($, on)
  await startTurn($, 't1')
  expect(gaps(), 'the turn takes the gap away').toBe(0)
  expect(running(), 'only the writing loop runs').toBe(1)
  await clock.advance(10 * (AMBIENT_GAP_MS.max + LONGEST_MS))
  const writing = new Set(framesOf('write'))
  for (const cells of w.painted) expect(writing.has(cells), 'only writing is painted during the turn').toBe(true)
  await endTurn($, 't1')
  expect(w.painted.at(-1), 'the sidekick rests when the turn ends').toBe(REST())
  expect(gaps(), 'the gap is pending again at rest').toBe(1)
  expect(running()).toBe(1)
})

test('no ambient animation plays, and no gap is pending, while a search runs', async ($, on) => {
  const { clock, w, gaps, running, answerSearch, hold } = await start($, on)
  hold()
  const rescan = $.command.run({ command: 'sidekick-rescan', args: 'tickets are in docs/tasks', ...RUN })
  await clock.settle()
  expect(gaps(), 'the search takes the gap away').toBe(0)
  await clock.advance(10 * (AMBIENT_GAP_MS.max + LONGEST_MS))
  const looking = new Set(framesOf('look'))
  for (const cells of w.painted) expect(looking.has(cells), 'only looking is painted during the search').toBe(true)
  expect(running()).toBe(1)
  await answerSearch(answered(RECIPE))
  await rescan
  await clock.settle()
  expect(w.painted.at(-1), 'the sidekick rests when the search ends').toBe(REST())
  expect(gaps(), 'the gap is pending again at rest').toBe(1)
})

test('no ambient animation plays, and no gap is pending, while a once-only animation plays: a shrug, then a zap with its strike', async ($, on) => {
  const { clock, w, gaps } = await start($, on)
  // Close to the earliest end of the gap, so a gap that was left running would end inside the shrug.
  await clock.advance(AMBIENT_GAP_MS.min - 100)
  w.answer = () => failed
  const from = w.painted.length
  await $.command.run({ command: 'sidekick-rescan', args: 'tickets are in docs/tasks', ...RUN })
  await clock.settle()
  expect(gaps(), 'the shrug takes the gap away').toBe(0)
  await clock.advance(SHRUG_MS / 2)
  expect(gaps(), 'still shrugging').toBe(0)
  await clock.advance(SHRUG_MS)
  // The rescan looks first, fails, and shrugs.
  const shrug = new Set([...framesOf('look'), ...framesOf('shrug'), REST()])
  for (const cells of w.painted.slice(from)) expect(shrug.has(cells), 'only looking and the shrug are painted').toBe(true)
  expect(gaps(), 'the gap is back at rest').toBe(1)

  w.painted.length = 0
  await finish($, w, clock, { ...TICKETS, '02-pay.md': ticket('02: Payment', 'done') }, 9)
  expect(gaps(), 'the zap takes the gap away').toBe(0)
  await clock.advance(STRIKE_MS - 1)
  expect(gaps(), 'the strike is still on').toBe(0)
  const zapping = new Set([...framesOf('zap'), REST()])
  for (const cells of w.painted) expect(zapping.has(cells), 'only the zap is painted').toBe(true)
  await clock.advance(1)
  expect(gaps(), 'the gap is back after the strike').toBe(1)
})

test('an animation for a moment that arrives during an ambient animation starts at once, and the ambient one does not go on', async ($, on) => {
  const { clock, w, gaps } = await start($, on)
  const waited = await untilPainted(clock, w, AMBIENT_GAP_MS.max + 100)
  expect(waited, 'an ambient animation started').toBeDefined()
  // It has played for less than one step, and every ambient animation is longer than that.
  expect(gaps(), 'the animation runs on its own timer, with no gap pending').toBe(0)
  w.painted.length = 0
  await startTurn($, 't1')
  expect(w.painted, 'the first picture of the turn is painted at once').toEqual([framesOf('write')[0]])
  await clock.advance(5 * ANIMATIONS.write.msPerFrame)
  const writing = new Set(framesOf('write'))
  for (const cells of w.painted) expect(writing.has(cells), 'nothing of the ambient animation is painted after it').toBe(true)
  await endTurn($, 't1')

  // The same for a once-only animation: a zap that arrives in the middle of an ambient animation.
  expect(await untilPainted(clock, w, AMBIENT_GAP_MS.max + 100), 'another ambient animation started').toBeDefined()
  w.painted.length = 0
  await finish($, w, clock, { ...TICKETS, '02-pay.md': ticket('02: Payment', 'done') }, 9)
  expect(w.painted[0], 'the zap starts at once').toBe(framesOf('zap')[0])
  await clock.advance(STRIKE_MS)
  const zapping = new Set([...framesOf('zap'), REST()])
  for (const cells of w.painted) expect(zapping.has(cells), 'only the zap is painted after it arrives').toBe(true)
})

// The motion command.

test('the motion command is registered at session start', async ($, on) => {
  const { w } = await start($, on)
  expect(w.registered).toContain('sidekick-motion')
})

test('with no argument the command reports on for a developer who never ran it, and says how to change it', async ($, on) => {
  await start($, on)
  const reply = await $.command.run({ ...MOTION, args: '' })
  expect(reply.text).toContain('Ambient motion is on.')
  expect(reply.text).toContain('/sidekick-motion off')
})

test('off stops the ambient animations and leaves no timer pending at rest; on brings them back', async ($, on) => {
  const { clock, w, gaps, running, store } = await start($, on)
  expect(gaps()).toBe(1)
  const off = await $.command.run({ ...MOTION, args: 'off' })
  expect(off.text).toBe('Ambient motion is off.')
  expect(store.data.get('motion')).toBe(false)
  expect(gaps(), 'the gap is cancelled').toBe(0)
  expect(running(), 'no timer at rest').toBe(0)
  await clock.advance(30 * (AMBIENT_GAP_MS.max + LONGEST_MS))
  expect(w.painted, 'nothing moves on its own').toEqual([])
  expect(running(), 'still no timer').toBe(0)
  expect((await $.command.run({ ...MOTION, args: '' })).text).toContain('Ambient motion is off.')

  const on_ = await $.command.run({ ...MOTION, args: ' ON ' })
  expect(on_.text).toBe('Ambient motion is on.')
  expect(store.data.get('motion')).toBe(true)
  expect(gaps(), 'the gap is armed again').toBe(1)
  await clock.advance(AMBIENT_GAP_MS.max + LONGEST_MS)
  expect(w.painted.length, 'ambient animations are back').toBeGreaterThan(0)
  expect((await $.command.run({ ...MOTION, args: '' })).text).toContain('Ambient motion is on.')
})

test('off during an ambient animation cuts it short and draws the rest', async ($, on) => {
  const { clock, w, gaps } = await start($, on)
  expect(await untilPainted(clock, w, AMBIENT_GAP_MS.max + 100), 'an ambient animation started').toBeDefined()
  await $.command.run({ ...MOTION, args: 'off' })
  expect(w.painted.at(-1), 'the rest is drawn').toBe(REST())
  const painted = w.painted.length
  await clock.advance(AMBIENT_GAP_MS.max + LONGEST_MS)
  expect(w.painted.length, 'the animation does not go on').toBe(painted)
  expect(gaps()).toBe(0)
})

test('anything but off and on is refused and changes nothing', async ($, on) => {
  const { gaps, store } = await start($, on)
  const reply = await $.command.run({ ...MOTION, args: 'sometimes' })
  expect(reply.text).toContain('"sometimes"')
  expect(reply.text).toContain('Nothing was changed.')
  expect(store.data.has('motion')).toBe(false)
  expect(gaps()).toBe(1)
})

test('a setting that cannot be saved is reported, and the old one stays', async ($, on) => {
  const { gaps, store } = await start($, on)
  store.failsSet = true
  const reply = await $.command.run({ ...MOTION, args: 'off' })
  expect(reply.text).toBe('Could not save the setting. Nothing was changed.')
  expect(gaps(), 'motion is still on').toBe(1)
  store.failsSet = false
  expect((await $.command.run({ ...MOTION, args: '' })).text).toContain('Ambient motion is on.')
})

test('the setting survives a fresh session start, and applies in every project', async ($, on) => {
  const { clock, w, gaps, store } = await start($, on)
  await $.command.run({ ...MOTION, args: 'off' })
  // The setting is one global key, not one per project.
  expect([...store.data.keys()].filter(key => key.startsWith('motion'))).toEqual(['motion'])

  // Another project, in the same session.
  w.root = OTHER
  expect((await $.command.run({ ...MOTION, args: '' })).text, 'another project').toContain('Ambient motion is off.')
  // A fresh session start, in that other project, finds it off and arms no gap.
  await $.session.start({ cwd: OTHER, surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(gaps(), 'no gap after a fresh session start').toBe(0)
  expect((await $.command.run({ ...MOTION, args: '' })).text).toContain('Ambient motion is off.')
  w.painted.length = 0
  await clock.advance(10 * (AMBIENT_GAP_MS.max + LONGEST_MS))
  expect(
    w.painted.filter(cells => ambientCells().has(cells) && cells !== REST()),
    'nothing ambient is painted',
  ).toEqual([])

  // Turned on again, it is on after another fresh start.
  await $.command.run({ ...MOTION, args: 'on' })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect((await $.command.run({ ...MOTION, args: '' })).text).toContain('Ambient motion is on.')
  expect(gaps()).toBe(1)
})

test('a store that cannot be read at session start leaves ambient motion on', async ($, on) => {
  const timers = counting(on)
  mock.clock(timers.on)
  on('store.get', () => {
    throw new Error('store down')
  })
  on('store.set', () => ({ value: undefined }))
  const w = world(on, ROOT)
  addSet(w, ROOT, 'checkout', TICKETS, 5)
  w.answer = () => answered(RECIPE)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  expect((await $.command.run({ ...MOTION, args: '' })).text).toContain('Ambient motion is on.')
  expect(timers.gaps()).toBe(1)
})

test('with motion off writing, looking, shrugging, zapping and cheering still play, and a timer runs only while one of them does', async ($, on) => {
  const almost = { ...TICKETS, '02-pay.md': ticket('02: Payment', 'done') }
  const all = { ...almost, '03-ship.md': ticket('03: Shipping', 'done') }
  const { clock, w, running, gaps, answerSearch, hold } = await start($, on, { motion: false }, almost)
  expect(running(), 'still at rest').toBe(0)
  const rest = REST()
  const played = (): Set<string> => new Set(w.painted)
  const expectPlays = (name: keyof typeof ANIMATIONS, label: string): void => {
    expect(
      framesOf(name).some(cells => cells !== rest && played().has(cells)),
      `${label} plays`,
    ).toBe(true)
  }

  await startTurn($, 't1')
  await clock.advance(ANIMATIONS.write.frames * ANIMATIONS.write.msPerFrame)
  expectPlays('write', 'writing')
  await endTurn($, 't1')
  expect(running(), 'at rest after the turn').toBe(0)

  w.painted.length = 0
  hold()
  const rescan = $.command.run({ command: 'sidekick-rescan', args: 'tickets are in docs/tasks', ...RUN })
  await clock.settle()
  await clock.advance(ANIMATIONS.look.frames * ANIMATIONS.look.msPerFrame)
  expectPlays('look', 'looking')
  await answerSearch(failed)
  await rescan
  await clock.advance(SHRUG_MS)
  expectPlays('shrug', 'shrugging')
  expect(running(), 'at rest after the shrug').toBe(0)

  w.painted.length = 0
  await finish($, w, clock, all, 9)
  await clock.advance(STRIKE_MS + ANIMATIONS.cheer.frames * ANIMATIONS.cheer.msPerFrame)
  expectPlays('zap', 'zapping')
  expectPlays('cheer', 'cheering')
  expect(running(), 'at rest after the cheer').toBe(0)
  expect(gaps(), 'no gap, ever').toBe(0)
  expect(w.painted.at(-1)).toBe(rest)
  const painted = w.painted.length
  await clock.advance(30 * (AMBIENT_GAP_MS.max + LONGEST_MS))
  expect(w.painted.length, 'still unless something happens').toBe(painted)
})
