import { expect, mock, test } from 'claude-code/testing'

import { PANE, RECIPE, RUN, SURFACES, addSet, answered, failed, ticket, world } from './world'
import type { Reply } from './world'

const ROOT = '/work/shop'
const NONE_FOUND = 'No tickets found. Try a hint: /sidekick-rescan tickets are in docs/tasks'
const CHECKOUT = {
  '01-cart.md': ticket('01: Cart', 'done'),
  '02-pay.md': ticket('02: Payment', 'in-progress'),
  '03-ship.md': ticket('03: Shipping', 'ready-for-agent'),
}

const FAILURES: [string, () => Reply][] = [
  ['answered with an API error', () => failed],
  [
    'threw',
    () => {
      throw new Error('connection reset')
    },
  ],
]

for (const [how, failure] of FAILURES)
  test(`a search whose model call ${how} is not remembered, and the next refresh searches again`, async ($, on) => {
    const clock = mock.clock(on)
    mock.store(on)
    const w = world(on, ROOT)
    addSet(w, ROOT, 'checkout', CHECKOUT, 5)
    w.answer = failure

    const ran = await $.command.run({ command: 'sidekick-rescan', args: '', ...RUN })
    expect(ran.text).toBe(NONE_FOUND)
    expect(w.asked.length).toBe(1)
    const looked = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await looked.find({ type: 'Text', text: /Looking for tickets/ })).toBeUndefined()
    await looked.unmount()

    w.answer = () => answered(RECIPE)
    await $.command.run({ command: 'sidekick', args: '', ...RUN })
    await clock.settle()
    expect(w.asked.length).toBe(2)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(await ui.find({ type: 'Text', text: '1/3 done' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: '.scratch/checkout/issues' })).toBeDefined()
      await ui.unmount()
    }

    // Answered now, so the next refresh reads the recipe and asks nothing.
    await $.command.run({ command: 'sidekick', args: '', ...RUN })
    await clock.settle()
    expect(w.asked.length).toBe(2)
  })

test('a stored recipe that stops finding tickets leads to exactly one new search, whose result replaces it', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const w = world(on, ROOT)
  addSet(w, ROOT, 'checkout', CHECKOUT, 5)
  w.answer = () => answered(RECIPE)
  const ran = await $.command.run({ command: 'sidekick-rescan', args: '', ...RUN })
  expect(ran.text).toBe('Reading tickets from .scratch/checkout/issues: 1/3 done.')
  expect(w.asked.length).toBe(1)

  // The developer moves the tickets to docs/tasks; the old recipe now matches nothing.
  for (const path of Object.keys(w.tree)) if (path.startsWith(`${ROOT}/.scratch`)) delete w.tree[path]
  w.tree[ROOT] = [{ name: 'docs', kind: 'dir' }]
  w.tree[`${ROOT}/docs`] = [{ name: 'tasks', kind: 'dir' }]
  w.tree[`${ROOT}/docs/tasks`] = [
    { name: 'a.md', kind: 'file', mtimeMs: 7 },
    { name: 'b.md', kind: 'file', mtimeMs: 7 },
  ]
  w.files[`${ROOT}/docs/tasks/a.md`] = ticket('Alpha', 'done')
  w.files[`${ROOT}/docs/tasks/b.md`] = ticket('Beta', 'done')
  w.answer = () => answered('{"kind":"files","glob":"docs/tasks/*.md","statusLabel":"Status","doneValues":["done"],"activeValues":[]}')

  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()
  expect(w.asked.length).toBe(2)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: 'docs/tasks' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /2\/2 done/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '.scratch/checkout/issues' })).toBeUndefined()
    await ui.unmount()
  }

  // The new recipe is the one kept: later refreshes ask nothing more.
  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.advance(20_000)
  await clock.settle()
  expect(w.asked.length).toBe(2)
})

test('a project with no listable files is recorded as having no tickets without asking the model', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const w = world(on, ROOT, {
    [ROOT]: [
      { name: 'logo.png', kind: 'file' },
      { name: 'node_modules', kind: 'dir' },
    ],
    [`${ROOT}/node_modules`]: [{ name: 'README.md', kind: 'file' }],
  })
  w.answer = () => answered(RECIPE)

  const ran = await $.command.run({ command: 'sidekick-rescan', args: '', ...RUN })
  expect(ran.text).toBe(NONE_FOUND)
  expect(w.asked.length).toBe(0)

  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()
  expect(w.asked.length).toBe(0)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /No tickets here/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Looking for tickets/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('a rescan asked for while a search runs is refused, and no second search starts', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const w = world(on, ROOT)
  addSet(w, ROOT, 'checkout', CHECKOUT, 5)
  let release: (reply: Reply) => void = () => undefined
  w.answer = () => new Promise<Reply>(resolve => (release = resolve))

  const first = $.command.run({ command: 'sidekick-rescan', args: '', ...RUN })
  await clock.settle()
  expect(w.asked.length).toBe(1)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /Looking for tickets/ })).toBeDefined()
    await ui.unmount()
  }

  const second = await $.command.run({ command: 'sidekick-rescan', args: 'tickets are in .scratch', ...RUN })
  expect(second.text).toBe('A search is already running.')
  // A refresh meanwhile leaves the pane as it is.
  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()
  expect(w.asked.length).toBe(1)

  release(answered(RECIPE))
  expect((await first).text).toBe('Reading tickets from .scratch/checkout/issues: 1/3 done.')
  expect(w.asked.length).toBe(1)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Looking for tickets/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '1/3 done' })).toBeDefined()
  await ui.unmount()
})

test('a recipe that points outside the project is refused, and the project is treated as having no tickets', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const w = world(on, ROOT)
  addSet(w, ROOT, 'checkout', CHECKOUT, 5)
  // Tickets the bad recipes would reach, were they followed.
  w.tree['/work/other/issues'] = [{ name: '01.md', kind: 'file' }]
  w.files['/work/other/issues/01.md'] = ticket('Secret', 'done')
  w.tree['/etc'] = [{ name: 'passwd', kind: 'file' }]
  const outside = ['../other/issues/*.md', '.scratch/../../other/issues/*.md', '/etc/*', 'C:/work/other/issues/*.md', '..\\\\other\\\\issues\\\\*.md']

  for (const glob of outside) {
    w.answer = () => answered(`{"kind":"files","glob":"${glob}","statusLabel":"Status","doneValues":["done"],"activeValues":[]}`)
    w.touched.length = 0
    const asked = w.asked.length
    const ran = await $.command.run({ command: 'sidekick-rescan', args: '', ...RUN })
    expect(ran.text).toBe(NONE_FOUND)
    expect(w.asked.length).toBe(asked + 1)
    expect(w.touched.filter(path => !path.startsWith(ROOT))).toEqual([])

    // Remembered as no tickets: a refresh does not search again.
    await $.command.run({ command: 'sidekick', args: '', ...RUN })
    await clock.settle()
    expect(w.asked.length).toBe(asked + 1)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(await ui.find({ type: 'Text', text: /No tickets here/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Secret/ })).toBeUndefined()
      await ui.unmount()
    }
  }
})
