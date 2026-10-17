import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, mock } from 'claude-code/testing'
import type { World } from './world'
import { addSet, answered, ON_TICKETS, PANE, RECIPE, RUN, SURFACES, setButtons, test, ticket, world } from './world'

const ROOT = '/work/shop'
const SEARCH = { '01-index.md': ticket('01: Index', 'done'), '02-query.md': ticket('02: Query', 'open') }
const BILLING = { '01-plans.md': ticket('01: Plans', 'open'), '02-invoices.md': ticket('02: Invoices', 'open') }
const NAMES = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta']

const setup = async ($: Engine, on: On, names: string[]): Promise<World> => {
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('tool.call', () => ({ result: { ok: true } }))
  const w = world(on, ROOT)
  names.forEach((name, at) => {
    addSet(w, ROOT, name, name === 'search' ? SEARCH : BILLING, 10 + at)
  })
  w.answer = () => answered(RECIPE)
  await $.command.run({ command: 'sidekick-rescan', args: '', ...RUN })

  return w
}

// The dialog's answer, set before the first call: what the person picked, typed under Other, or undefined for dismissed.
type Dialog = { reply: string | undefined; asked: { options: string[] }[] }
const dialog = (on: On): Dialog => {
  const d: Dialog = { reply: undefined, asked: [] }
  on('tool.call', { tool: 'AskUserQuestion' }, (_, e) => {
    d.asked.push({ options: e.questions[0]?.options.map(option => option.label) ?? [] })
    if (d.reply === undefined) throw new Error('dismissed')

    return { result: { questions: e.questions, answers: { [e.questions[0]?.question ?? '']: d.reply } } }
  })

  return d
}

const START = { cwd: ROOT, surface: 'terminal', isInteractive: true } as const
const END = { turnId: 't1', answer: 'Done.', durationMs: 1, isAborted: false, reason: 'answer' } as const

type Pane = { buttons: number; has: (text: string | RegExp) => Promise<boolean> }
const look = async ($: Engine): Promise<Pane> => {
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const buttons = (await setButtons(ui)).length
  const found = new Map<string | RegExp, boolean>()
  for (const text of PROBES) found.set(text, (await ui.find({ type: 'Text', text })) !== undefined)
  await ui.unmount()

  return { buttons, has: async text => found.get(text) ?? false }
}
const SEARCH_SRC = '.scratch/search/issues'
const BILLING_SRC = '.scratch/billing/issues'
const PROBES: (string | RegExp)[] = [
  SEARCH_SRC,
  BILLING_SRC,
  '.scratch/new-feature/issues',
  'Pick a ticket set:',
  '2 sets · /sidekick-pick',
  '2 ticket sets · /sidekick-pick',
  /\d+\/\d+ done/,
]

// A new session in a project with two sets: nothing is active, so the pane offers the picker alone.
const fresh = async ($: Engine, on: On, names = ['search', 'billing']): Promise<{ w: World; clock: ReturnType<typeof mock.clock> }> => {
  const clock = mock.clock(on)
  mock.store(on, ON_TICKETS)
  const w = await setup($, on, names)
  w.sessionId = 's-new'
  await $.session.start(START)
  await clock.settle()

  return { w, clock }
}

const expectPicker = async ($: Engine): Promise<void> => {
  const pane = await look($)
  expect(pane.buttons).toBe(2)
  expect(await pane.has('Pick a ticket set:')).toBe(true)
  expect(await pane.has(/\d+\/\d+ done/)).toBe(false)
  expect(await pane.has(SEARCH_SRC)).toBe(false)
  expect(await pane.has(BILLING_SRC)).toBe(false)
}

const expectActive = async ($: Engine, source: string): Promise<void> => {
  const pane = await look($)
  expect(pane.buttons).toBe(0)
  expect(await pane.has(source)).toBe(true)
  expect(await pane.has('2 sets · /sidekick-pick')).toBe(true)
}

test('with two sets in a new session the pane shows only the picker, rows numbered, newest first', async ($, on) => {
  await fresh($, on)
  await expectPicker($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Button', text: /1: billing 0\/2/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', text: /2: search 1\/2/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', text: /›/ })).toBeUndefined()
  await ui.unmount()
})

test('a button press picks the set and closes the picker, and the timed refresh never reopens it', async ($, on) => {
  const { clock } = await fresh($, on)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'set-2' })
    await ui.unmount()
    break
  }
  await clock.settle()
  await expectActive($, SEARCH_SRC)
  await clock.advance(20_000)
  await expectActive($, SEARCH_SRC)
})

test('/sidekick-pick with a number or a name picks directly, and reports a bad or ambiguous one', async ($, on) => {
  const { clock } = await fresh($, on)

  expect((await $.command.run({ command: 'sidekick-pick', args: '2', ...RUN })).text).toBe('Showing search: 1/2 done.')
  await clock.settle()
  await expectActive($, SEARCH_SRC)
  expect((await $.command.run({ command: 'sidekick-pick', args: 'bill', ...RUN })).text).toBe('Showing billing: 0/2 done.')
  expect((await $.command.run({ command: 'sidekick-pick', args: '7', ...RUN })).text).toMatch(/No ticket set matches "7"/)
  expect((await $.command.run({ command: 'sidekick-pick', args: 'scratch', ...RUN })).text).toMatch(/More than one/)
})

test('Claude reading or editing a ticket in a set picks it, but a Write of a new ticket picks none', async ($, on) => {
  const { w, clock } = await fresh($, on)
  addSet(w, ROOT, 'billing', { ...BILLING, '03-new.md': ticket('03: New', 'open') }, 20)
  await $.tool.call({ tool: 'Write', file_path: `${ROOT}/.scratch/billing/issues/03-new.md`, content: 'x' })
  await clock.settle()
  await expectPicker($)

  await $.tool.call({ tool: 'Read', file_path: `${ROOT}/.scratch/billing/issues/01-plans.md` })
  await clock.settle()
  await expectActive($, BILLING_SRC)
  await $.tool.call({ tool: 'Edit', file_path: `${ROOT}/.scratch/search/issues/01-index.md`, old_string: 'a', new_string: 'b' })
  await clock.settle()
  await expectActive($, SEARCH_SRC)
})

for (const text of ['continue search please', 'work on SEARCH']) {
  test(`the first prompt "${text}" names exactly one set and picks it`, async ($, on) => {
    const { clock } = await fresh($, on)
    await $.turn.start({ text, turnId: 't1' })
    await clock.settle()
    await expectActive($, SEARCH_SRC)
  })
}

test('a prompt with a hyphenated set name picks it from spaced words', async ($, on) => {
  const { clock } = await fresh($, on, ['search', 'new-feature'])
  await $.turn.start({ text: 'work on new feature', turnId: 't1' })
  await clock.settle()
  const pane = await look($)
  expect(pane.buttons).toBe(0)
  expect(await pane.has('.scratch/new-feature/issues')).toBe(true)
})

test('a prompt that names two sets, or none, picks none; the turn ending then leaves only the hint', async ($, on) => {
  const { clock } = await fresh($, on)
  await $.turn.start({ text: 'compare search with billing', turnId: 't1' })
  await clock.settle()
  await expectPicker($)
  // A touch during the turn still counts; here there is none, so the turn ends with no pick.
  await $.turn.complete(END)
  await clock.settle()
  const pane = await look($)
  expect(pane.buttons).toBe(0)
  expect(await pane.has('2 ticket sets · /sidekick-pick')).toBe(true)
  expect(await pane.has(/\d+\/\d+ done/)).toBe(false)
  expect(await pane.has(SEARCH_SRC)).toBe(false)
  expect(await pane.has(BILLING_SRC)).toBe(false)
  // A pick or a touch later still sets the active set.
  await $.tool.call({ tool: 'Read', file_path: `${ROOT}/.scratch/billing/issues/01-plans.md` })
  await clock.settle()
  await expectActive($, BILLING_SRC)
})

test('a touch during the first turn counts before the picker would hide', async ($, on) => {
  const { clock } = await fresh($, on)
  await $.turn.start({ text: 'Go.', turnId: 't1' })
  await $.tool.call({ tool: 'Read', file_path: `${ROOT}/.scratch/search/issues/02-query.md` })
  await clock.settle()
  await $.turn.complete(END)
  await clock.settle()
  await expectActive($, SEARCH_SRC)
})

test('a subagent turn ending does not hide the picker', async ($, on) => {
  const { clock } = await fresh($, on)
  await $.turn.complete({ ...END, agentId: 'sub-1' } as never)
  await clock.settle()
  await expectPicker($)
})

test('each session keeps its own active set, and a resume brings its set back with no picker', async ($, on) => {
  const { w, clock } = await fresh($, on)
  w.sessionId = 's-a'
  await $.session.start(START)
  await clock.settle()
  await $.command.run({ command: 'sidekick-pick', args: 'search', ...RUN })
  await clock.settle()
  await expectActive($, SEARCH_SRC)

  // Another session in the same project starts with nothing active.
  w.sessionId = 's-b'
  await $.session.start(START)
  await clock.settle()
  await expectPicker($)
  await $.command.run({ command: 'sidekick-pick', args: 'billing', ...RUN })
  await clock.settle()
  await expectActive($, BILLING_SRC)

  // Resuming the first one: its own set, no picker.
  w.sessionId = 's-a'
  await $.session.start(START)
  await clock.settle()
  await expectActive($, SEARCH_SRC)
  w.sessionId = 's-b'
  await $.session.start(START)
  await clock.settle()
  await expectActive($, BILLING_SRC)
})

test('a resume with no stored set is treated as a new session', async ($, on) => {
  const { w, clock } = await fresh($, on)
  w.sessionId = 's-never-picked'
  await $.session.start(START)
  await clock.settle()
  await expectPicker($)
})

test('/clear starts a new session: its active set is gone and the picker shows again', async ($, on) => {
  const { w, clock } = await fresh($, on)
  await $.command.run({ command: 'sidekick-pick', args: 'search', ...RUN })
  await clock.settle()
  await expectActive($, SEARCH_SRC)

  await $.session.end({ reason: 'clear', sessionId: w.sessionId, resume: { id: w.sessionId } } as never)
  w.sessionId = 's-cleared'
  await clock.settle()
  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()
  await expectPicker($)
})

test('/clear that reports the old session id still starts with nothing active', async ($, on) => {
  const { w, clock } = await fresh($, on)
  await $.command.run({ command: 'sidekick-pick', args: 'search', ...RUN })
  await clock.settle()
  await $.session.end({ reason: 'clear', sessionId: w.sessionId, resume: { id: w.sessionId } } as never)
  await clock.settle()
  await expectPicker($)
})

test('a rescan with two sets mid-session reopens the picker, keeps the current set and its progress, and the next turn closes it', async ($, on) => {
  const { clock } = await fresh($, on)
  await $.command.run({ command: 'sidekick-pick', args: 'search', ...RUN })
  await clock.settle()
  await $.turn.start({ text: 'Go.', turnId: 't1' })
  await $.turn.complete(END)
  await clock.settle()
  await expectActive($, SEARCH_SRC)

  await $.command.run({ command: 'sidekick-rescan', args: '', ...RUN })
  await clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await setButtons(ui)).length).toBe(2)
  expect(await ui.find({ type: 'Button', text: /› 2: search/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: SEARCH_SRC })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '1/2 done' })).toBeDefined()
  await ui.unmount()

  await $.turn.start({ text: 'Go.', turnId: 't2' })
  await $.turn.complete(END)
  await clock.settle()
  await expectActive($, SEARCH_SRC)
})

test('a single set shows no list', async ($, on) => {
  mock.clock(on)
  mock.store(on, ON_TICKETS)
  await setup($, on, ['search'])
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await setButtons(ui)).toHaveLength(0)
  expect(await ui.find({ type: 'Text', text: /sets · / })).toBeUndefined()
  await ui.unmount()
})

test('with 9 sets the pane still draws one button per set and no Select', async ($, on) => {
  mock.clock(on)
  mock.store(on, ON_TICKETS)
  await setup($, on, [...NAMES, 'eta', 'theta', 'iota'])
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await setButtons(ui)).length).toBe(9)
  expect(await ui.find({ type: 'Select' })).toBeUndefined()
  await ui.unmount()
})

test('/sidekick-pick with a number or a name picks directly, and reports a bad or ambiguous one', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on, ON_TICKETS)
  await setup($, on, ['search', 'billing'])

  expect((await $.command.run({ command: 'sidekick-pick', args: '2', ...RUN })).text).toBe('Showing search: 1/2 done.')
  await clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '.scratch/search/issues' })).toBeDefined()
  await ui.unmount()
  expect((await $.command.run({ command: 'sidekick-pick', args: 'bill', ...RUN })).text).toBe('Showing billing: 0/2 done.')
  expect((await $.command.run({ command: 'sidekick-pick', args: '7', ...RUN })).text).toMatch(/No ticket set matches "7"/)
  expect((await $.command.run({ command: 'sidekick-pick', args: 'scratch', ...RUN })).text).toMatch(/More than one/)
})

test('/sidekick-pick with one set only says so', async ($, on) => {
  mock.clock(on)
  mock.store(on, ON_TICKETS)
  await setup($, on, ['search'])
  expect((await $.command.run({ command: 'sidekick-pick', args: '', ...RUN })).text).toBe('Only one ticket set here: search.')
})

test('/sidekick-pick with no sets only says so', async ($, on) => {
  mock.clock(on)
  mock.store(on, ON_TICKETS)
  world(on, ROOT)
  expect((await $.command.run({ command: 'sidekick-pick', args: '', ...RUN })).text).toMatch(/No ticket sets found/)
})

test('/sidekick-pick without args asks when there are 4 sets or fewer, and takes a typed name', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on, ON_TICKETS)
  const d = dialog(on)
  await setup($, on, NAMES.slice(0, 4))
  d.reply = 'alpha'
  const picked = await $.command.run({ command: 'sidekick-pick', args: '', ...RUN })
  await clock.settle()
  expect(d.asked[0]?.options).toEqual(['delta', 'gamma', 'beta', 'alpha'])
  expect(picked.text).toBe('Showing alpha: 0/2 done.')
})

test('/sidekick-pick takes a choice from the dialog, and a dismissed dialog changes nothing', async ($, on) => {
  mock.clock(on)
  mock.store(on, ON_TICKETS)
  const d = dialog(on)
  await setup($, on, ['search', 'billing'])
  d.reply = 'search'
  expect((await $.command.run({ command: 'sidekick-pick', args: '', ...RUN })).text).toBe('Showing search: 1/2 done.')
  expect(d.asked[0]?.options).toEqual(['billing', 'search'])
  d.reply = undefined
  expect((await $.command.run({ command: 'sidekick-pick', args: '', ...RUN })).text).toBe('Pick cancelled.')
})

test('a pick holds until Claude touches a file in another set', async ($, on) => {
  const { clock } = await fresh($, on)
  await $.command.run({ command: 'sidekick-pick', args: 'search', ...RUN })
  await clock.advance(20_000)
  await expectActive($, SEARCH_SRC)
  await $.tool.call({ tool: 'Read', file_path: `${ROOT}/.scratch/billing/issues/01-plans.md` })
  await clock.settle()
  await expectActive($, BILLING_SRC)
})

const MANY = ['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10']

test('/sidekick-pick without args and more than 4 sets opens the pane picker with the keys, and asks nothing', async ($, on) => {
  mock.clock(on)
  mock.store(on, ON_TICKETS)
  const d = dialog(on)
  const w = await setup($, on, NAMES)
  w.sessionId = 's-new'
  w.opened.length = 0
  const ran = await $.command.run({ command: 'sidekick-pick', args: '', ...RUN })
  expect(ran.text).toBe('Pick a ticket set in the pane (6 sets).')
  expect(d.asked).toHaveLength(0)
  expect(w.opened).toEqual([{ id: 'sidekick', focus: true }])
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Pick a ticket set:' })).toBeDefined()
  await ui.unmount()
})

test('with 4 sets or fewer the command still asks in a dialog and opens no pane', async ($, on) => {
  mock.clock(on)
  mock.store(on, ON_TICKETS)
  const d = dialog(on)
  const w = await setup($, on, NAMES.slice(0, 4))
  w.opened.length = 0
  d.reply = 'beta'
  await $.command.run({ command: 'sidekick-pick', args: '', ...RUN })
  expect(d.asked).toHaveLength(1)
  expect(w.opened).toEqual([])
})

test('the picker the command opened closes when the next main-agent turn ends', async ($, on) => {
  const { clock } = await fresh($, on, NAMES)
  await $.turn.complete(END)
  await clock.settle()
  expect((await look($)).buttons).toBe(0)
  await $.command.run({ command: 'sidekick-pick', args: '', ...RUN })
  await clock.settle()
  expect((await look($)).buttons).toBe(6)
  await $.turn.complete(END)
  await clock.settle()
  const pane = await look($)
  expect(pane.buttons).toBe(0)
  expect(await pane.has('Pick a ticket set:')).toBe(false)
})

test('with 10 sets the pane draws a Select of all of them and picking one makes it active', async ($, on) => {
  const { clock } = await fresh($, on, MANY)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await setButtons(ui)).toHaveLength(0)
  expect(await ui.find({ type: 'Text', text: 'Pick a ticket set:' })).toBeDefined()
  expect(await ui.find({ type: 'Select' })).toBeDefined()
  await ui.select({ key: 'set-select', value: '.scratch/s03/issues' })
  await ui.unmount()
  await clock.settle()
  const shown = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await shown.find({ type: 'Text', text: '.scratch/s03/issues' })).toBeDefined()
  expect(await shown.find({ type: 'Select' })).toBeUndefined()
  expect(await shown.find({ type: 'Text', text: 'Pick a ticket set:' })).toBeUndefined()
  await shown.unmount()
})

test('/sidekick-pick 10 picks the tenth set of ten', async ($, on) => {
  const { clock } = await fresh($, on, MANY)
  // Newest first: s10 is the 1st and s01 the 10th.
  const ran = await $.command.run({ command: 'sidekick-pick', args: '10', ...RUN })
  await clock.settle()
  expect(ran.text).toBe('Showing s01: 0/2 done.')
  const shown = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await shown.find({ type: 'Text', text: '.scratch/s01/issues' })).toBeDefined()
  await shown.unmount()
})
