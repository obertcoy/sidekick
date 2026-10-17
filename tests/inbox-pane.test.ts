import type { Engine, MockClock } from 'claude-code/testing'
import { expect, mock } from 'claude-code/testing'
import type { World } from './world'
import { addSet, answered, linesIn, openStore, PANE, RECIPE, RUN, SURFACES, test, world } from './world'

// The inbox in the pane: NEEDS YOU from the items the summary writes, READY TO REVIEW and WORKING from the ticket files.
const SHOP = '/work/shop'

const file = (title: string, status: string, boxes: string): string => `# ${title}\n\n**Status:** ${status}\n\n${boxes}\n`

const TICKETS = {
  '01-cart.md': file('01: Cart', 'in-progress', '- [x] a\n- [ ] b\n- [ ] c'),
  '02-payment.md': file('02: Payment', 'done', '- [x] a\n- [x] b\n- [x] c'),
  '03-emails.md': file('03: Emails', 'done', '- [x] a\n- [ ] b\n- [ ] c\n- [ ] d\n- [ ] e\n- [ ] f'),
  '04-docs.md': file('04: Docs', 'done', 'No boxes here.'),
  '05-ship.md': file('05: Ship', 'ready-for-agent', '- [ ] a'),
}

const items = (...list: unknown[]): string => JSON.stringify({ items: list })

const ANSWERED = { answer: 'Built it.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const

/** The pane mounted at `bodyColumns` on the surface, its inbox read, and unmounted again. */
const paint = async ($: Engine, surface: (typeof SURFACES)[number] = 'terminal', bodyColumns = 40): Promise<{ lines: string[]; all: string[] }> => {
  const ui = await $.ui.mount({ ...PANE, surface, props: { ...PANE.props, bodyColumns } })
  const lines = await linesIn(ui, 'inbox')
  const all = (await ui.findAll({ type: 'Text' })).map(one => one.text)
  await ui.unmount()

  return { lines, all }
}

const start = async ($: Engine, on: Parameters<typeof world>[0], tickets: Record<string, string>, saved: Record<string, unknown> = {}) => {
  const clock = mock.clock(on)
  const store = openStore(on, { [`recipe:${SHOP}`]: JSON.parse(RECIPE), ...saved })
  const w = world(on, SHOP)
  addSet(w, SHOP, 'shop', tickets, 10)
  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()

  return { clock, store, w }
}

const endTurn = async ($: Engine, clock: MockClock, w: World, reply: string): Promise<void> => {
  w.answer = () => answered(reply)
  await $.turn.complete({ ...ANSWERED })
  await clock.settle()
}

test('the four sections draw in order, each sorted, with the evidence beside each ticket', async ($, on) => {
  const reviewed = {
    id: 1,
    kind: 'needs-you',
    ticket: { set: '.scratch/shop/issues', title: '02: Payment' },
    short: 'Card or bank?',
    long: '',
    at: 1,
    isReviewed: true,
  }
  const { clock, w } = await start($, on, TICKETS, { [`inbox:${SHOP}`]: { items: [reviewed], next: 2 } })
  await endTurn(
    $,
    clock,
    w,
    items(
      { kind: 'needs-you', ticket: 2, short: 'Which provider?', long: '' },
      { kind: 'blocked', ticket: null, short: 'Staging is down', long: '' },
      { kind: 'changed-direction', ticket: 1, short: 'Dropped the queue', long: '' },
      { kind: 'note', ticket: 1, short: 'Cart half built', long: '' },
      { kind: 'needs-you', ticket: null, short: 'Ship on Friday?', long: '' },
    ),
  )
  for (const surface of SURFACES) {
    const { lines, all } = await paint($, surface)
    expect(lines).toEqual([
      'NEEDS YOU · 4',
      '? Ship on Friday? ▸',
      '✗ Staging is down ▸',
      '? 02 Payment ▸',
      '  Which provider?',
      '! 01 Cart ▸',
      '  Dropped the queue',
      'READY TO REVIEW · 3',
      '◐ 03 Emails',
      '  agent says done · 1/6 ticked',
      '✓ 02 Payment',
      '  agent says done · 3/3',
      // A ticket with no checkboxes shows no count, not 0/0.
      '✓ 04 Docs',
      '  agent says done',
      'WORKING · 1 ticket',
      '◐ 01 Cart',
      '  1/3 ticked · active <1m',
      'REVIEWED · 1',
    ])
    // The progress bar still counts the tickets done in their files; nothing anywhere says "verified".
    expect(all).toContain('3/5 done')
    expect(all.filter(text => /verified/i.test(text))).toEqual([])
    // The Done/Next block is gone: a note is a ticket's history, not a line of the inbox.
    expect(all.filter(text => /Cart half built|^Done$|^Next$/.test(text))).toEqual([])
  }
})

/** Opens the pane again, which reads the ticket files again. */
const reopen = async ($: Engine, clock: MockClock): Promise<void> => {
  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()
}

test('WORKING shows how long each ticket has been active, from when the mod first saw it so, and drops it once it is done', async ($, on) => {
  const { clock, w } = await start($, on, TICKETS)
  await clock.advance(12 * 60_000)
  expect((await paint($)).lines.slice(-3)).toEqual(['WORKING · 1 ticket', '◐ 01 Cart', '  1/3 ticked · active 12m'])

  // Another ticket goes active: it starts from now, and the heading counts both.
  addSet(w, SHOP, 'shop', { ...TICKETS, '05-ship.md': file('05: Ship', 'in-progress', '- [ ] a') }, 20)
  await reopen($, clock)
  await clock.advance(50 * 60_000)
  expect((await paint($)).lines.slice(-5)).toEqual(['WORKING · 2 tickets', '◐ 01 Cart', '  1/3 ticked · active 1h', '◐ 05 Ship', '  0/1 ticked · active 50m'])

  // Done in its file: it leaves WORKING for READY TO REVIEW.
  addSet(w, SHOP, 'shop', { ...TICKETS, '01-cart.md': file('01: Cart', 'done', '- [x] a\n- [x] b\n- [x] c') }, 30)
  await reopen($, clock)
  const { lines } = await paint($)
  expect(lines).not.toContain('WORKING · 1 ticket')
  expect(lines.filter(line => line.startsWith('WORKING'))).toEqual([])
  expect(lines.slice(0, 3)).toEqual(['READY TO REVIEW · 4', '◐ 03 Emails', '  agent says done · 1/6 ticked'])
  expect(lines).toContain('✓ 01 Cart')
})

test('an empty section is not drawn', async ($, on) => {
  // Only open tickets: nothing to review, nothing working, nothing asked.
  const { clock, w } = await start($, on, { '05-ship.md': TICKETS['05-ship.md'] })
  expect((await paint($)).lines).toEqual(['Nothing in the inbox yet.'])

  await endTurn($, clock, w, items({ kind: 'blocked', ticket: 1, short: 'Waiting on the API key', long: '' }))
  expect((await paint($)).lines).toEqual(['NEEDS YOU · 1', '✗ 05 Ship ▸', '  Waiting on the API key'])

  // Notes alone fill no section.
  await endTurn($, clock, w, items({ kind: 'note', ticket: 1, short: 'Started shipping', long: '' }))
  expect((await paint($)).lines).toEqual(['NEEDS YOU · 1', '✗ 05 Ship ▸', '  Waiting on the API key'])
})

test('every line of the inbox fits the pane at 40 and 72 columns', async ($, on) => {
  const long = 'A ticket title far too long to fit on one line of any narrow pane at all, even a wide one'
  const { clock, w } = await start($, on, {
    '01-cart.md': file(`01: ${long}`, 'in-progress', '- [x] a\n- [ ] b'),
    '02-payment.md': file(`02: ${long}`, 'done', '- [x] a\n- [ ] b'),
  })
  await endTurn(
    $,
    clock,
    w,
    items(
      { kind: 'needs-you', ticket: 1, short: `Keep timed-out payments pending, or ${long}?`, long: '' },
      { kind: 'changed-direction', ticket: null, short: `Dropped the queue for ${long}`, long: '' },
    ),
  )
  for (const bodyColumns of [40, 72]) {
    const columns = bodyColumns - 2
    for (const surface of SURFACES) {
      const { lines } = await paint($, surface, bodyColumns)
      expect(lines.length).toBe(10)
      for (const line of lines) expect([...line].length).toBeLessThanOrEqual(columns)
      // A line too long is cut with an ellipsis that fills it to the pane's edge (before a NEEDS YOU row's ▸): the question, the change of direction and the three titles.
      expect(lines.filter(line => line.includes('…')).every(line => [...line].length === columns)).toBe(true)
      expect(lines.filter(line => line.includes('…')).length).toBe(5)
    }
  }
})
