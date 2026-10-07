import { expect, mock, test } from 'claude-code/testing'

const ROOT = '/work/shop'
const TICKETS: Record<string, string> = {
  '01-cart.md': '# 01: Cart\n\n**Status:** done\n\n- [x] add items\n',
  '02-pay.md': '# 02: Payment\n\n**Status:** in-progress\n\n- [ ] charge card\n',
  '03-ship.md': '# 03: Shipping\n\n**Status:** ready-for-agent\n\n- [ ] print label\n',
}
const TREE: Record<string, { name: string; kind: 'file' | 'dir' }[]> = {
  [ROOT]: [
    { name: 'README.md', kind: 'file' },
    { name: '.scratch', kind: 'dir' },
    { name: 'node_modules', kind: 'dir' },
  ],
  [`${ROOT}/.scratch`]: [{ name: 'checkout', kind: 'dir' }],
  [`${ROOT}/.scratch/checkout`]: [
    { name: 'spec.md', kind: 'file' },
    { name: 'issues', kind: 'dir' },
  ],
  [`${ROOT}/.scratch/checkout/issues`]: Object.keys(TICKETS).map(name => ({ name, kind: 'file' })),
}
// The engine hands a hook the path as this machine spells it (D:\work\shop on Windows).
const posix = (path: string): string => path.replace(/^[A-Za-z]:/, '').replace(/\\/g, '/')
const PANE = {
  plugin: 'project-pane',
  component: 'Pane',
  requestId: 'project-pane',
  props: {
    title: 'Project',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const
const RUN = {
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 160 },
} as const

test('a rescan finds the tickets once, and the pane then shows progress and the summary', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const asked: string[] = []
  let reply = '{"kind":"files","glob":".scratch/*/issues/*.md","statusLabel":"Status","doneValues":["done"],"activeValues":["in-progress"]}'
  on('session.root', () => ({ value: ROOT }))
  on('fs.list', (_, e) => ({
    value: (TREE[posix(e.path)] ?? []).map(entry => ({ ...entry, size: 1, mtimeMs: 5, isLink: false })),
  }))
  on('fs.read', (_, e) => ({
    value: TICKETS[posix(e.path).slice(posix(e.path).lastIndexOf('/') + 1)] ?? 'A shop.',
  }))
  on('model.complete', (_, e) => {
    asked.push(e.prompt)

    return {
      value: {
        isAnswered: true as const,
        text: reply,
        usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      },
    }
  })
  on('session.messages', () => ({
    value: [
      { role: 'user' as const, text: 'Build the cart.', toolUses: [] },
      { role: 'assistant' as const, text: 'Built it.', toolUses: [] },
    ],
  }))
  on('turn.complete', (_, e) => ({ text: e.answer }))

  const ran = await $.command.run({ command: 'project-rescan', args: '', ...RUN })
  expect(ran.text).toBe('Reading tickets from .scratch/checkout/issues: 1/3 done.')
  expect(asked.length).toBe(1)
  expect(asked[0]).toContain('.scratch/checkout/issues/01-cart.md')
  expect(asked[0]).not.toContain('node_modules/')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: '1/3 done' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '✓ Cart' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '○ Shipping' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '◐ Payment' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /summary appears/ })).toBeDefined()
    await ui.unmount()
  }

  reply = '{"change":true,"happened":"Built the cart.","next":"Add payment.","needsYou":"Pick a payment provider."}'
  await $.turn.complete({ answer: 'Built it.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(0)
  expect(asked.length).toBe(2)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Built the cart.' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /NEEDS YOU\s+Pick a payment provider\./ })).toBeDefined()
  await ui.unmount()

  reply = '{"change":false}'
  await $.turn.complete({ answer: 'Sure.', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
  await clock.advance(0)
  expect(asked.length).toBe(3)
  const kept = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await kept.find({ type: 'Text', text: 'Built the cart.' })).toBeDefined()
  await kept.unmount()
})
