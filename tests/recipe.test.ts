import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { PANE, RECIPE, RUN, SURFACES, addSet, answered, failed, ticket, world } from './world'
import type { Reply, World } from './world'

const ROOT = '/work/shop'
const CHECKOUT = {
  '01-cart.md': ticket('01: Cart', 'done'),
  '02-pay.md': ticket('02: Payment', 'in-progress'),
  '03-ship.md': ticket('03: Shipping', 'ready-for-agent'),
}
const KEPT = 'Found nothing new; still reading .scratch/checkout/issues: 1/3 done.'
const TASKS_RECIPE = '{"kind":"files","glob":"docs/tasks/*.md","statusLabel":"Status","doneValues":["done"],"activeValues":[]}'

const known = async ($: Engine, on: On): Promise<World> => {
  const w = world(on, ROOT)
  addSet(w, ROOT, 'checkout', CHECKOUT, 5)
  on('tool.call', () => ({ result: { ok: true } }))
  w.answer = () => answered(RECIPE)
  const ran = await $.command.run({ command: 'sidekick-rescan', args: '', ...RUN })
  expect(ran.text).toBe('Reading tickets from .scratch/checkout/issues: 1/3 done.')

  return w
}

const shows = async ($: Engine, source: string | undefined, hidden?: string): Promise<void> => {
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    if (source !== undefined) expect(await ui.find({ type: 'Text', text: source })).toBeDefined()
    if (hidden !== undefined) expect(await ui.find({ type: 'Text', text: hidden })).toBeUndefined()
    await ui.unmount()
  }
}

const FAILURES: [string, Reply | (() => Reply)][] = [
  ['finds no tickets', answered('{"kind":"none"}')],
  ['points outside the project', answered('{"kind":"files","glob":"../x/*.md","statusLabel":null,"doneValues":[],"activeValues":[]}')],
  ['finds a glob that matches nothing', answered('{"kind":"files","glob":"nope/*.md","statusLabel":null,"doneValues":[],"activeValues":[]}')],
  ['fails', failed],
]

for (const [how, reply] of FAILURES) {
  test(`a rescan whose search ${how} keeps the recipe that worked and says so`, async ($, on) => {
    const clock = mock.clock(on)
    mock.store(on)
    const w = await known($, on)
    w.answer = () => reply as Reply
    const ran = await $.command.run({ command: 'sidekick-rescan', args: 'tickets are in docs/tasks', ...RUN })
    expect(ran.text).toBe(KEPT)
    await shows($, '.scratch/checkout/issues')

    // The recipe survived: a refresh reads it and asks nothing.
    const asked = w.asked.length
    await $.command.run({ command: 'sidekick', args: '', ...RUN })
    await clock.settle()
    expect(w.asked.length).toBe(asked)
    await shows($, '1/3 done')
  })
}

test('a rescan that finds nothing in a project that never had a recipe still records none', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const w = world(on, ROOT)
  addSet(w, ROOT, 'checkout', CHECKOUT, 5)
  w.answer = () => answered('{"kind":"none"}')
  const ran = await $.command.run({ command: 'sidekick-rescan', args: '', ...RUN })
  expect(ran.text).toBe('No tickets found. Try a hint: /sidekick-rescan tickets are in docs/tasks')
  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()
  expect(w.asked.length).toBe(1)
})

const addDocsTasks = (w: World): void => {
  w.tree[ROOT] = [...(w.tree[ROOT] ?? []), { name: 'docs', kind: 'dir' }]
  w.tree[`${ROOT}/docs`] = [{ name: 'tasks', kind: 'dir' }]
  w.tree[`${ROOT}/docs/tasks`] = [{ name: 'a.md', kind: 'file', mtimeMs: 9 }]
  w.files[`${ROOT}/docs/tasks/a.md`] = ticket('Alpha', 'done')
}

test('a Write of a ticket in a new folder adds a place and keeps the old one, without switching the active set or opening the picker', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const w = await known($, on)
  addDocsTasks(w)
  w.answer = () => answered(TASKS_RECIPE)

  await $.tool.call({ tool: 'Write', file_path: `${ROOT}/docs/tasks/a.md`, content: 'x' })
  await clock.settle()
  expect(w.asked.length).toBe(2)
  expect(w.asked[1]).toContain('tickets are in docs/tasks/')
  expect(w.asked[1]).toContain('`.scratch/*/issues/*.md`')
  // The session keeps its set; the new one only shows in the count.
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: '.scratch/checkout/issues' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '2 sets · /sidekick-pick' })).toBeDefined()
    expect(await ui.find({ type: 'Button' })).toBeUndefined()
    await ui.unmount()
  }
  // Creating the ticket was no touch; reading it is.
  await $.tool.call({ tool: 'Read', file_path: `${ROOT}/docs/tasks/a.md` })
  await clock.settle()
  await shows($, 'docs/tasks', '.scratch/checkout/issues')
})

test('a rescan with a hint adds the place it finds and keeps the old one, and a plain rescan adds too', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const w = await known($, on)
  addDocsTasks(w)
  w.answer = () => answered(TASKS_RECIPE)
  const ran = await $.command.run({ command: 'sidekick-rescan', args: 'tickets are in docs/tasks', ...RUN })
  expect(ran.text).toBe('Reading tickets from .scratch/checkout/issues: 1/3 done.')
  expect(w.asked[1]).toContain('`.scratch/*/issues/*.md`')
  // Both places are read now: the picker lists both sets.
  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.findAll({ type: 'Button' })).length).toBe(2)
  await ui.unmount()

  // A plain rescan adds a third place the model finds, with the others still there.
  w.tree[`${ROOT}/docs/tasks`] = [...(w.tree[`${ROOT}/docs/tasks`] ?? []), { name: 'TODO.md', kind: 'file', mtimeMs: 9 }]
  w.tree[`${ROOT}/docs`] = [...(w.tree[`${ROOT}/docs`] ?? []), { name: 'extra', kind: 'dir' }]
  w.tree[`${ROOT}/docs/extra`] = [{ name: 'TODO.md', kind: 'file', mtimeMs: 12 }]
  w.files[`${ROOT}/docs/extra/TODO.md`] = '- [ ] one\n- [x] two\n'
  w.answer = () => answered('{"kind":"checklist","glob":"docs/extra/TODO.md"}')
  await $.command.run({ command: 'sidekick-rescan', args: '', ...RUN })
  await clock.settle()
  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.findAll({ type: 'Button' })).length).toBe(3)
  await ui.unmount()
})

test('a place whose glob is already known is replaced with the new rules, not duplicated', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  const w = await known($, on)
  w.answer = () => answered(RECIPE.replace('"done"', '"done","shipped-it"'))
  await $.command.run({ command: 'sidekick-rescan', args: '', ...RUN })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /sets/ })).toBeUndefined()
  await ui.unmount()
})

test('a rescan that finds a place already read, or nothing, leaves the recipe as it was', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  const w = await known($, on)
  addDocsTasks(w)
  w.answer = () => answered('{"kind":"none"}')
  const ran = await $.command.run({ command: 'sidekick-rescan', args: 'tickets are in docs/tasks', ...RUN })
  expect(ran.text).toBe(KEPT)
  await shows($, '.scratch/checkout/issues')
})

test('an old single-glob recipe in the store is read as one place', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on, { [`recipe:${ROOT}`]: JSON.parse(RECIPE) })
  const w = world(on, ROOT)
  addSet(w, ROOT, 'checkout', CHECKOUT, 5)
  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()
  expect(w.asked.length).toBe(0)
  await shows($, '.scratch/checkout/issues')
  await shows($, '1/3 done')
})

test('a place whose files are gone drops out and is saved without the others', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const w = await known($, on)
  addDocsTasks(w)
  w.answer = () => answered(TASKS_RECIPE)
  await $.command.run({ command: 'sidekick-rescan', args: 'tickets are in docs/tasks', ...RUN })
  await clock.settle()
  await shows($, 'Pick a ticket set:')

  w.tree[`${ROOT}/docs/tasks`] = []
  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()
  // The folder comes back, but the place was dropped and saved so: only the other set is read.
  w.tree[`${ROOT}/docs/tasks`] = [{ name: 'a.md', kind: 'file', mtimeMs: 9 }]
  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()
  await shows($, '.scratch/checkout/issues', '2 sets · /sidekick-pick')
  // One set is left, so it is active at once, with no picker.
  expect(w.asked.length).toBe(2)
  await shows($, '.scratch/checkout/issues')
})

test('a new ticket file whose search finds nothing leaves the old recipe and pane alone', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const w = await known($, on)
  w.tree[ROOT] = [...(w.tree[ROOT] ?? []), { name: 'docs', kind: 'dir' }]
  w.tree[`${ROOT}/docs`] = [{ name: 'tasks', kind: 'dir' }]
  w.tree[`${ROOT}/docs/tasks`] = [{ name: 'a.md', kind: 'file', mtimeMs: 9 }]
  w.answer = () => answered('{"kind":"none"}')

  await $.tool.call({ tool: 'Write', file_path: `${ROOT}/docs/tasks/a.md`, content: 'x' })
  await clock.settle()
  expect(w.asked.length).toBe(2)
  await shows($, '.scratch/checkout/issues')
  // A recipe that finds tickets elsewhere, not the new file, is no adoption either.
  w.answer = () => answered(RECIPE)
  await $.tool.call({ tool: 'Write', file_path: `${ROOT}/docs/tasks/b.md`, content: 'x' })
  await clock.settle()
  await shows($, '.scratch/checkout/issues')
})

test('a burst of writes in one folder searches once, and a folder is not searched again', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const w = await known($, on)
  w.tree[`${ROOT}/docs`] = [{ name: 'tasks', kind: 'dir' }]
  w.tree[`${ROOT}/docs/tasks`] = [{ name: 'a.md', kind: 'file', mtimeMs: 9 }]
  w.answer = () => answered('{"kind":"none"}')

  for (const name of ['a', 'b', 'c']) {
    void $.tool.call({ tool: 'Write', file_path: `${ROOT}/docs/tasks/${name}.md`, content: 'x' })
  }
  await clock.settle()
  expect(w.asked.length).toBe(2)
  await $.tool.call({ tool: 'Write', file_path: `${ROOT}/docs/tasks/d.md`, content: 'x' })
  await clock.settle()
  expect(w.asked.length).toBe(2)
})

test('only a Write of a markdown file inside the project, in a ticket-like folder, starts a search', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const w = await known($, on)
  w.answer = () => answered('{"kind":"none"}')
  const quiet = async (input: Record<string, unknown>): Promise<void> => {
    await $.tool.call(input as never)
    await clock.settle()
    expect(w.asked.length).toBe(1)
  }
  await quiet({ tool: 'Read', file_path: `${ROOT}/docs/tasks/a.md` })
  await quiet({ tool: 'Edit', file_path: `${ROOT}/docs/tasks/a.md`, old_string: 'a', new_string: 'b' })
  await quiet({ tool: 'Write', file_path: `${ROOT}/docs/tasks/a.txt`, content: 'x' })
  await quiet({ tool: 'Write', file_path: `${ROOT}/src/notes/a.md`, content: 'x' })
  await quiet({ tool: 'Write', file_path: `${ROOT}/README.md`, content: 'x' })
  await quiet({ tool: 'Write', file_path: `/work/other/docs/tasks/a.md`, content: 'x' })
  await quiet({ tool: 'Write', file_path: `${ROOT}/node_modules/plan/a.md`, content: 'x' })
  // A write that the recipe already reads only switches the pane.
  await quiet({ tool: 'Write', file_path: `${ROOT}/.scratch/checkout/issues/04-new.md`, content: 'x' })
})

test('with no recipe at all, a new ticket file in a likely folder is adopted and shown', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const w = world(on, ROOT)
  on('tool.call', () => ({ result: { ok: true } }))
  w.answer = () => answered('{"kind":"none"}')
  await $.command.run({ command: 'sidekick-rescan', args: '', ...RUN })
  addSet(w, ROOT, 'new-feature', { '01-foo.md': ticket('01: Foo', 'open') }, 7)
  w.answer = () => answered(RECIPE)

  await $.tool.call({ tool: 'Write', file_path: `${ROOT}/.scratch/new-feature/issues/01-foo.md`, content: 'x' })
  await clock.settle()
  await shows($, '.scratch/new-feature/issues')
})
