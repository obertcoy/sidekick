import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { PANE, RECIPE, RUN, SURFACES, addSet, answered, ticket, world } from './world'
import type { World } from './world'

const ROOT = '/work/shop'
const SEARCH = { '01-index.md': ticket('01: Index', 'done'), '02-query.md': ticket('02: Query', 'open') }
const BILLING = { '01-plans.md': ticket('01: Plans', 'open'), '02-invoices.md': ticket('02: Invoices', 'open') }
const NAMES = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta']

const setup = async ($: Engine, on: On, names: string[]): Promise<World> => {
  const w = world(on, ROOT)
  names.forEach((name, at) => addSet(w, ROOT, name, name === 'search' ? SEARCH : BILLING, 10 + at))
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

test('with two sets the pane lists them with the current one marked, and a press switches the set', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  await setup($, on, ['search', 'billing'])
  // billing is newer, so it is set 2 in the file order but first in the list.
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Button', text: /billing 0\/2/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /search 1\/2/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /› billing/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /› search/ })).toBeUndefined()
    await ui.press({ key: 'set-2' })
    await clock.settle()
    expect(await ui.find({ type: 'Text', text: '.scratch/search/issues' })).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /› search/ })).toBeDefined()
    await ui.press({ key: 'set-1' })
    await clock.settle()
    expect(await ui.find({ type: 'Text', text: '.scratch/billing/issues' })).toBeDefined()
    await ui.unmount()
  }
})

test('a single set shows no list', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  await setup($, on, ['search'])
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await ui.unmount()
})

test('the pane lists at most nine sets and points to the command for the rest', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  await setup($, on, [...NAMES, 'eta', 'theta', 'iota', 'kappa'])
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.findAll({ type: 'Button' })).length).toBe(9)
  expect(await ui.find({ type: 'Text', text: /\+1 more/ })).toBeDefined()
  await ui.unmount()
})

test('/sidekick-pick with a number or a name picks directly, and reports a bad or ambiguous one', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
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
  mock.store(on)
  await setup($, on, ['search'])
  expect((await $.command.run({ command: 'sidekick-pick', args: '', ...RUN })).text).toBe('Only one ticket set here: search.')
})

test('/sidekick-pick with no sets only says so', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  world(on, ROOT)
  expect((await $.command.run({ command: 'sidekick-pick', args: '', ...RUN })).text).toMatch(/No ticket sets found/)
})

test('/sidekick-pick without args asks, offering the 4 newest sets, and takes a typed name', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const d = dialog(on)
  await setup($, on, NAMES)
  d.reply = 'alpha'
  const picked = await $.command.run({ command: 'sidekick-pick', args: '', ...RUN })
  await clock.settle()
  // zeta, epsilon, delta, gamma are the newest four; the typed "alpha" is matched among all.
  expect(d.asked[0]?.options).toEqual(['zeta', 'epsilon', 'delta', 'gamma'])
  expect(picked.text).toBe('Showing alpha: 0/2 done.')
})

test('/sidekick-pick takes a choice from the dialog, and a dismissed dialog changes nothing', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  const d = dialog(on)
  await setup($, on, ['search', 'billing'])
  d.reply = 'search'
  expect((await $.command.run({ command: 'sidekick-pick', args: '', ...RUN })).text).toBe('Showing search: 1/2 done.')
  expect(d.asked[0]?.options).toEqual(['billing', 'search'])
  d.reply = undefined
  expect((await $.command.run({ command: 'sidekick-pick', args: '', ...RUN })).text).toBe('Pick cancelled.')
})

test('a pick holds until Claude touches a file in another set', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('tool.call', () => ({ result: { ok: true } }))
  await setup($, on, ['search', 'billing'])
  await $.command.run({ command: 'sidekick-pick', args: 'search', ...RUN })
  await clock.advance(20_000)
  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '.scratch/search/issues' })).toBeDefined()
  await ui.unmount()

  await $.tool.call({ tool: 'Read', file_path: `${ROOT}/.scratch/billing/issues/01-plans.md` })
  await clock.settle()
  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: '.scratch/billing/issues' })).toBeDefined()
  await ui.unmount()
})
