import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { PANE, RECIPE, RUN, SURFACES, addSet, answered, ticket, world } from './world'
import type { World } from './world'

// Two ticket sets: "search" is older and half done, "billing" changed most recently.
const OLDER = {
  '01-index.md': ticket('01: Index', 'done'),
  '02-query.md': ticket('02: Query', 'ready-for-agent'),
}
const NEWER = {
  '01-plans.md': ticket('01: Plans', 'ready-for-agent'),
  '02-invoices.md': ticket('02: Invoices', 'ready-for-agent'),
  '03-refunds.md': ticket('03: Refunds', 'ready-for-agent'),
}
const SHOWS_OLDER = { source: '.scratch/search/issues', count: '1/2 done', ticket: '✓ Index' }
const SHOWS_NEWER = { source: '.scratch/billing/issues', count: '0/3 done', ticket: '○ Plans' }

// The project as each host spells it, and the path of a ticket in the older set as a file tool hands it.
const SPELLINGS = [
  { label: 'POSIX', root: '/work/shop', posixRoot: '/work/shop', older: '/work/shop/.scratch/search/issues/02-query.md' },
  {
    label: 'Windows',
    root: 'C:\\work\\shop',
    posixRoot: '/work/shop',
    older: 'C:\\work\\shop\\.scratch\\search\\issues\\02-query.md',
  },
] as const

const twoSets = async ($: Engine, on: On, root: string, posixRoot: string): Promise<World> => {
  const w = world(on, root)
  addSet(w, posixRoot, 'search', OLDER, 5)
  addSet(w, posixRoot, 'billing', NEWER, 9)
  w.answer = () => answered(RECIPE)
  on('tool.call', () => ({ result: { ok: true } }))
  const ran = await $.command.run({ command: 'sidekick-rescan', args: '', ...RUN })
  expect(ran.text).toBe(`Reading tickets from ${SHOWS_NEWER.source}: ${SHOWS_NEWER.count}.`)

  return w
}

const expectPane = async ($: Engine, shown: typeof SHOWS_OLDER, hidden: typeof SHOWS_OLDER): Promise<void> => {
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: shown.source })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: shown.count })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: shown.ticket })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: hidden.source })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: hidden.ticket })).toBeUndefined()
    await ui.unmount()
  }
}

test('with two ticket sets the pane shows the most recently changed one before any ticket is touched', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  await twoSets($, on, '/work/shop', '/work/shop')
  await expectPane($, SHOWS_NEWER, SHOWS_OLDER)
})

for (const { label, root, posixRoot, older } of SPELLINGS) {
  for (const tool of ['Read', 'Edit'] as const) {
    test(`${tool === 'Read' ? 'reading' : 'editing'} a ticket in the older set switches the pane's source and count to that set (${label} paths)`, async ($, on) => {
      const clock = mock.clock(on)
      mock.store(on)
      await twoSets($, on, root, posixRoot)
      await expectPane($, SHOWS_NEWER, SHOWS_OLDER)

      if (tool === 'Read') await $.tool.call({ tool, file_path: older })
      else await $.tool.call({ tool, file_path: older, old_string: 'a step', new_string: 'one step' })
      await clock.settle()
      await expectPane($, SHOWS_OLDER, SHOWS_NEWER)
    })
  }
}

test('the touched set stays active through later refreshes and a new session, even when another set changes', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const w = await twoSets($, on, '/work/shop', '/work/shop')
  await $.tool.call({ tool: 'Read', file_path: '/work/shop/.scratch/search/issues/01-index.md' })
  await clock.settle()
  await expectPane($, SHOWS_OLDER, SHOWS_NEWER)

  // The newer set changes again, outside Claude Code; a later refresh keeps the touched set.
  addSet(w, '/work/shop', 'billing', NEWER, 50)
  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()
  await expectPane($, SHOWS_OLDER, SHOWS_NEWER)

  // A new session in the same project, and its timed refresh.
  await $.session.start({ cwd: '/work/shop', surface: 'terminal', isInteractive: true })
  await clock.settle()
  await expectPane($, SHOWS_OLDER, SHOWS_NEWER)
  await clock.advance(20_000)
  await expectPane($, SHOWS_OLDER, SHOWS_NEWER)
  expect(w.asked.length).toBe(1)
})

test('when the touched set is gone the pane falls back to the most recently changed set', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const w = await twoSets($, on, '/work/shop', '/work/shop')
  await $.tool.call({ tool: 'Read', file_path: '/work/shop/.scratch/search/issues/01-index.md' })
  await clock.settle()
  await expectPane($, SHOWS_OLDER, SHOWS_NEWER)

  // The finished feature's folder is deleted.
  delete w.tree['/work/shop/.scratch/search']
  delete w.tree['/work/shop/.scratch/search/issues']
  w.tree['/work/shop/.scratch'] = [{ name: 'billing', kind: 'dir' }]
  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()
  await expectPane($, SHOWS_NEWER, SHOWS_OLDER)
  expect(w.asked.length).toBe(1)
})

test('touching a file that is not a ticket leaves the active ticket set unchanged', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  await twoSets($, on, '/work/shop', '/work/shop')
  await $.tool.call({ tool: 'Read', file_path: '/work/shop/README.md' })
  await $.tool.call({ tool: 'Edit', file_path: '/work/shop/.scratch/search/spec.md', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Read', file_path: '/work/other/.scratch/search/issues/01-index.md' })
  await $.tool.call({ tool: 'Bash', command: 'cat .scratch/search/issues/01-index.md' })
  await clock.settle()
  await expectPane($, SHOWS_NEWER, SHOWS_OLDER)
})

test("the tool call's own result is returned unchanged whether or not the bookkeeping succeeds", async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const w = world(on, '/work/shop')
  addSet(w, '/work/shop', 'search', OLDER, 5)
  addSet(w, '/work/shop', 'billing', NEWER, 9)
  w.answer = () => answered(RECIPE)
  const result = { result: { file: { content: '# 02: Query' } }, context: ['read from the fake disk'] }
  on('tool.call', () => result)
  await $.command.run({ command: 'sidekick-rescan', args: '', ...RUN })

  const path = '/work/shop/.scratch/search/issues/02-query.md'
  expect(await $.tool.call({ tool: 'Read', file_path: path })).toEqual(result)
  await clock.settle()
  await expectPane($, SHOWS_OLDER, SHOWS_NEWER)

  w.isRootGone = true
  expect(await $.tool.call({ tool: 'Read', file_path: '/work/shop/.scratch/billing/issues/01-plans.md' })).toEqual(result)
  await clock.settle()
  // The bookkeeping failed, so the pane stays where it was.
  await expectPane($, SHOWS_OLDER, SHOWS_NEWER)
  expect(await $.tool.call({ tool: 'Bash', command: 'ls' })).toEqual(result)
})
