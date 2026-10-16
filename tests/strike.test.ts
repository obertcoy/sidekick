import type { On } from 'claude-code'
import type { Engine, MockClock, Mounted as MountedPane } from 'claude-code/testing'
import { expect, mock } from 'claude-code/testing'
import type { World } from './world'
import { addSet, answered, PANE, RECIPE, RUN, test, ticket, world } from './world'

// When a ticket finishes, the critter zaps and a bolt strikes the ticket's row: the row charges,
// the bolt runs down from the critter, the row flashes, the strike-through burns across it, and
// the row settles as done. One step every 110 ms, 13 steps in all.
const ROOT = '/work/shop'
const ISSUES = `${ROOT}/.scratch/checkout/issues`
const STEP = 110
const WHOLE = 13 * STEP

type Mounted = MountedPane<'terminal' | 'desktop', 'Pane'>

const rowOf = (ui: Mounted, title: string) => ui.find({ type: 'Text', text: new RegExp(`^\\S ${title}$`) })

// Text queries match within a text; a piece of a row is found by its whole text.
const piece = async (ui: Mounted, text: string) => (await ui.findAll({ type: 'Text' })).find(one => one.text === text)

const flashing = async (ui: Mounted) => (await ui.findAll({ type: 'Text' })).filter(one => one.props.backgroundColor === 'warning')

const bolts = async (ui: Mounted) => (await ui.findAll({ type: 'Text' })).filter(one => one.text.includes('↯'))

/** A project with `tickets`, read once; `blits` counts the critter's repaints. */
const start = async (
  $: Engine,
  on: On,
  tickets: Record<string, string>,
  bodyRows = 30,
): Promise<{ w: World; clock: MockClock; ui: Mounted; blits: string[] }> => {
  const clock = mock.clock(on)
  mock.store(on)
  const w = world(on, ROOT)
  addSet(w, ROOT, 'checkout', tickets, 5)
  w.answer = () => answered(RECIPE)
  on('tool.call', () => ({ result: { ok: true } }))
  await $.command.run({ command: 'sidekick-rescan', args: '', ...RUN })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, scroll: { offset: 0, bodyRows } }, surface: 'terminal' })

  return { w, clock, ui, blits: w.blits }
}

/** The tickets change on disk and the mod notices, as it does when a file tool touches one. */
const change = async ($: Engine, w: World, clock: MockClock, tickets: Record<string, string>, mtimeMs: number) => {
  addSet(w, ROOT, 'checkout', tickets, mtimeMs)
  await $.tool.call({ tool: 'Read', file_path: `${ISSUES}/${Object.keys(tickets)[0]}` })
  await clock.settle()
}

const BEFORE = {
  '01-cart.md': ticket('01: Cart', 'done'),
  '02-pay.md': ticket('02: Payment', 'in-progress'),
  '03-ship.md': ticket('03: Shipping', 'ready-for-agent'),
}

test('a finished ticket is struck: charge, bolt from the critter, flash, burning strike-through, then plain done', async ($, on) => {
  const { w, clock, ui, blits } = await start($, on, BEFORE)
  expect(await rowOf(ui, 'Payment')).toMatchObject({ text: '◐ Payment' })

  await change($, w, clock, { ...BEFORE, '02-pay.md': ticket('02: Payment', 'done') }, 9)
  expect(blits.length).toBeGreaterThan(0)
  // Charge: the row still shows what it was while the critter gathers the spark.
  expect((await rowOf(ui, 'Payment'))?.text).toBe('◐ Payment')
  expect(await bolts(ui)).toHaveLength(0)

  // The bolt leaves the critter: it takes the first cell of the bar under it.
  await clock.advance(2 * STEP)
  expect(await ui.find({ type: 'Text', text: /^↯━*─+$/ })).toBeDefined()
  expect((await rowOf(ui, 'Payment'))?.text).toBe('◐ Payment')

  // It lands: the blank line above the list carries it down, and it sits on the row's glyph.
  await clock.advance(STEP)
  expect(await ui.find({ type: 'Text', text: /^↯━*─+$/ })).toBeUndefined()
  expect(await piece(ui, '↯')).toBeDefined()
  expect((await rowOf(ui, 'Payment'))?.text).toBe('↯ Payment')

  // The flash: the row as done, in the theme's warning colour, the ✓ carrying the state.
  await clock.advance(STEP)
  const flash = await flashing(ui)
  expect(flash).toHaveLength(1)
  expect(flash[0]).toMatchObject({ text: '✓ Payment', props: { color: 'inverseText', bold: true } })
  expect(await bolts(ui)).toHaveLength(0)
  // A surface with no critter strikes the row the same way, with no bolt to run down from it.
  const desk = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await flashing(desk)).map(one => one.text)).toEqual(['✓ Payment'])
  await desk.unmount()

  // The burn runs left to right: struck so far, one bright cell at the front, the rest as it was.
  await clock.advance(STEP)
  expect(await flashing(ui)).toHaveLength(0)
  expect(await piece(ui, 'Pa')).toMatchObject({ props: { strikethrough: true, dimColor: true } })
  expect(await piece(ui, 'y')).toMatchObject({ props: { color: 'warning' } })
  await clock.advance(2 * STEP)
  expect(await piece(ui, 'Paym')).toMatchObject({ props: { strikethrough: true } })
  await clock.advance(3 * STEP)
  expect(await piece(ui, 'Payment')).toMatchObject({ props: { strikethrough: true } })

  // Settled: the normal done row, and nothing moves after.
  await clock.advance(2 * STEP)
  const done = await rowOf(ui, 'Payment')
  expect(done).toMatchObject({ text: '✓ Payment', props: { strikethrough: true, dimColor: true } })
  const drawn = JSON.stringify(await ui.drawn())
  const painted = blits.length
  await clock.advance(5000)
  expect(JSON.stringify(await ui.drawn())).toBe(drawn)
  expect(blits.length).toBe(painted)
  expect(await ui.find({ type: 'Text', text: /^━+─+$/ })).toBeDefined()
  await ui.unmount()
})

test('nothing animates when no ticket finishes', async ($, on) => {
  const { w, clock, ui, blits } = await start($, on, BEFORE)
  const before = blits.length
  await change($, w, clock, { ...BEFORE, '03-ship.md': ticket('03: Shipping', 'in-progress') }, 9)
  expect((await rowOf(ui, 'Shipping'))?.text).toBe('◐ Shipping')
  for (let at = 0; at < WHOLE + 2 * STEP; at += STEP) {
    expect(await bolts(ui)).toHaveLength(0)
    expect(await flashing(ui)).toHaveLength(0)
    expect((await rowOf(ui, 'Payment'))?.props.strikethrough).toBeFalsy()
    await clock.advance(STEP)
  }
  expect(blits.length).toBe(before)
  await ui.unmount()
})

test('tickets that finish together are struck together, and one that finishes mid-strike is struck after', async ($, on) => {
  const many = {
    ...BEFORE,
    '04-mail.md': ticket('04: Mail', 'ready-for-agent'),
  }
  const { w, clock, ui } = await start($, on, many)
  await change($, w, clock, { ...many, '02-pay.md': ticket('02: Payment', 'done'), '03-ship.md': ticket('03: Shipping', 'done') }, 9)
  await clock.advance(4 * STEP)
  expect((await flashing(ui)).map(one => one.text)).toEqual(['✓ Payment', '✓ Shipping'])

  // Mail finishes while that strike is on show: it waits its turn.
  await change(
    $,
    w,
    clock,
    { ...many, '02-pay.md': ticket('02: Payment', 'done'), '03-ship.md': ticket('03: Shipping', 'done'), '04-mail.md': ticket('04: Mail', 'done') },
    12,
  )
  expect((await rowOf(ui, 'Mail'))?.props.strikethrough).toBe(true)
  expect((await rowOf(ui, 'Mail'))?.props.backgroundColor).toBeUndefined()
  await clock.advance(WHOLE - 4 * STEP)
  // The first strike is over; Mail's begins, charging from its open glyph.
  expect((await rowOf(ui, 'Payment'))?.props.strikethrough).toBe(true)
  expect((await rowOf(ui, 'Mail'))?.text).toBe('○ Mail')
  await clock.advance(4 * STEP)
  expect((await flashing(ui)).map(one => one.text)).toEqual(['✓ Mail'])

  await clock.advance(WHOLE)
  for (const title of ['Cart', 'Payment', 'Shipping', 'Mail']) {
    expect(await rowOf(ui, title)).toMatchObject({ text: `✓ ${title}`, props: { strikethrough: true, dimColor: true } })
  }
  expect(await bolts(ui)).toHaveLength(0)
  expect(await flashing(ui)).toHaveLength(0)
  await ui.unmount()
})

test('a finished ticket scrolled out of view is brought into the window for its strike', async ($, on) => {
  const titles = ['Cart', 'Payment', 'Shipping', 'Mail', 'Refunds', 'Reports', 'Exports', 'Search']
  const files = (doneAt: number[]) =>
    Object.fromEntries(
      titles.map((title, at) => [`0${at + 1}-${title.toLowerCase()}.md`, ticket(`0${at + 1}: ${title}`, doneAt.includes(at) ? 'done' : 'ready-for-agent')]),
    )
  // bodyRows 19 leaves room for three rows, kept around the next ticket (Payment).
  const { w, clock, ui } = await start($, on, files([0]), 19)
  expect(await rowOf(ui, 'Search')).toBeUndefined()

  await change($, w, clock, files([0, 7]), 9)
  expect((await rowOf(ui, 'Search'))?.text).toBe('○ Search')
  expect(await rowOf(ui, 'Payment')).toBeUndefined()
  await clock.advance(4 * STEP)
  expect((await flashing(ui)).map(one => one.text)).toEqual(['✓ Search'])

  // Once it is struck the window goes back to the next ticket.
  await clock.advance(WHOLE)
  expect(await rowOf(ui, 'Search')).toBeUndefined()
  expect(await rowOf(ui, 'Payment')).toMatchObject({ text: '○ Payment', props: { bold: true } })
  await ui.unmount()
})
