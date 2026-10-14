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
const TASKS_RECIPE =
  '{"kind":"files","glob":"docs/tasks/*.md","statusLabel":"Status","doneValues":["done"],"activeValues":[]}'

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

test('a recipe that finds a new folder replaces the old one, and the old one is offered to the model to widen', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const w = await known($, on)
  w.tree[ROOT] = [...(w.tree[ROOT] ?? []), { name: 'docs', kind: 'dir' }]
  w.tree[`${ROOT}/docs`] = [{ name: 'tasks', kind: 'dir' }]
  w.tree[`${ROOT}/docs/tasks`] = [{ name: 'a.md', kind: 'file', mtimeMs: 9 }]
  w.files[`${ROOT}/docs/tasks/a.md`] = ticket('Alpha', 'done')
  w.answer = () => answered(TASKS_RECIPE)

  await $.tool.call({ tool: 'Write', file_path: `${ROOT}/docs/tasks/a.md`, content: 'x' })
  await clock.settle()
  expect(w.asked.length).toBe(2)
  expect(w.asked[1]).toContain('tickets are in docs/tasks/')
  expect(w.asked[1]).toContain('.scratch/*/issues/*.md')
  await shows($, 'docs/tasks', '.scratch/checkout/issues')
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
