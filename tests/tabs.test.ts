import type { On } from 'claude-code'
import type { Engine, MockClock } from 'claude-code/testing'
import { expect, mock } from 'claude-code/testing'
import type { World } from './world'
import { addSet, answered, openStore, PANE, RECIPE, RUN, SURFACES, test, ticket, world } from './world'

// Two buttons under the header and the progress bar switch the pane between the inbox and the ticket list.
const SHOP = '/work/shop'
const TICKETS = {
  '01-cart.md': ticket('01: Cart', 'done'),
  '02-payment.md': ticket('02: Payment', 'in-progress'),
  '03-ship.md': ticket('03: Shipping', 'ready-for-agent'),
}
const ANSWERED = { answer: 'Built it.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const
const START = { cwd: SHOP, surface: 'terminal', isInteractive: true } as const

const start = async ($: Engine, on: On, saved: Record<string, unknown> = {}): Promise<{ clock: MockClock; store: Map<string, unknown>; w: World }> => {
  const clock = mock.clock(on)
  const store = openStore(on, { [`recipe:${SHOP}`]: JSON.parse(RECIPE), ...saved })
  const w = world(on, SHOP)
  addSet(w, SHOP, 'shop', TICKETS, 10)
  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()

  return { clock, store, w }
}

const asks = (...shorts: string[]): string => JSON.stringify({ items: shorts.map(short => ({ kind: 'needs-you', ticket: null, short, long: '' })) })

type Painted = { texts: string[]; buttons: { key: string; text: string; hotkey: unknown }[] }

/** What the pane draws on the surface: every Text, and every Button with its key, label and hotkey. */
const paint = async ($: Engine, surface: (typeof SURFACES)[number] = 'terminal', bodyRows = 30): Promise<Painted> => {
  const ui = await $.ui.mount({ ...PANE, surface, props: { ...PANE.props, scroll: { offset: 0, bodyRows } } })
  const texts = (await ui.findAll({ type: 'Text' })).map(one => one.text)
  const buttons = (await ui.findAll({ type: 'Button' })).map(one => ({
    key: String(one.key),
    text: one.text,
    hotkey: (one.props as { hotkey?: unknown }).hotkey,
  }))
  await ui.unmount()

  return { texts, buttons }
}

const press = async ($: Engine, clock: MockClock, key: string, surface: (typeof SURFACES)[number] = 'terminal'): Promise<void> => {
  const ui = await $.ui.mount({ ...PANE, surface })
  await ui.press({ key })
  await ui.unmount()
  await clock.settle()
}

const isRow = (texts: string[], title: string): boolean => texts.some(text => new RegExp(`^\\S ${title}$`).test(text))

test('the pane opens on Inbox: its button carries the NEEDS YOU count, and no ticket rows are drawn', async ($, on) => {
  const { clock, w } = await start($, on)
  w.answer = () => answered(asks('Keep it?', 'Which bank?'))
  await $.turn.complete({ ...ANSWERED })
  await clock.settle()
  for (const surface of SURFACES) {
    const { texts, buttons } = await paint($, surface)
    expect(buttons.map(one => one.key)).toEqual(['tab-inbox', 'tab-tickets'])
    expect(buttons[0]?.text).toMatch(/● Inbox · 2$/)
    expect(buttons[1]?.text).toMatch(/○ Tickets$/)
    expect(texts).toContain('NEEDS YOU · 2')
    expect(isRow(texts, 'Payment')).toBe(false)
    // The header and the progress bar are above the tabs.
    expect(texts).toContain('1/3 done')
    expect(texts.some(text => /^━+─+$/.test(text))).toBe(true)
  }
})

test('with nothing that needs you the Inbox button shows no count', async ($, on) => {
  await start($, on)
  const { buttons } = await paint($)
  expect(buttons[0]?.text).toMatch(/● Inbox$/)
})

test('each tab has a key of its own: i for Inbox, t for Tickets', async ($, on) => {
  await start($, on)
  const { buttons } = await paint($)
  expect(buttons.map(one => one.hotkey)).toEqual(['i', 't'])
})

for (const surface of SURFACES) {
  test(`on the ${surface}, pressing Tickets shows the ticket list in place of the inbox, and Inbox brings it back`, async ($, on) => {
    const { clock } = await start($, on)
    await press($, clock, 'tab-tickets', surface)
    const tickets = await paint($, surface)
    expect(tickets.buttons.map(one => one.text.replace(/^\w: /, ''))).toEqual(['○ Inbox', '● Tickets'])
    expect(isRow(tickets.texts, 'Cart')).toBe(true)
    expect(isRow(tickets.texts, 'Payment')).toBe(true)
    expect(tickets.texts).toContain('.scratch/shop/issues')
    expect(tickets.texts).not.toContain('WORKING · 1 ticket')
    expect(tickets.texts).toContain('1/3 done')

    await press($, clock, 'tab-inbox', surface)
    const inbox = await paint($, surface)
    expect(inbox.texts).toContain('WORKING · 1 ticket')
    expect(isRow(inbox.texts, 'Payment')).toBe(false)
    expect(inbox.texts).not.toContain('.scratch/shop/issues')
  })
}

test('the ticket list takes the height the inbox took: with 30 rows it shows 14 tickets, however full the inbox is', async ($, on) => {
  const many = Object.fromEntries(
    Array.from({ length: 20 }, (_, at) => [`${String(at + 1).padStart(2, '0')}-t.md`, ticket(`${at + 1}: Task ${at + 1}`, 'open')]),
  )
  const { clock, w } = await start($, on, { [`tab:${SHOP}`]: 'tickets' })
  addSet(w, SHOP, 'shop', many, 20)
  w.answer = () => answered(asks('One?', 'Two?', 'Three?', 'Four?', 'Five?'))
  await $.turn.complete({ ...ANSWERED })
  await clock.settle()
  const { texts } = await paint($)
  expect(texts.filter(text => /^○ Task \d+$/.test(text))).toHaveLength(14)
  expect(texts).toContain('↓ 6 more')
})

test('the chosen tab is kept per project, across sessions', async ($, on) => {
  const { clock, store, w } = await start($, on)
  await press($, clock, 'tab-tickets')
  expect(store.get(`tab:${SHOP}`)).toBe('tickets')

  w.sessionId = 's2'
  await $.session.start(START)
  await clock.settle()
  expect((await paint($)).buttons[1]?.text).toMatch(/● Tickets$/)

  // Another project opens on its own tab: Inbox, until one is chosen there.
  w.root = '/work/other'
  addSet(w, '/work/other', 'other', TICKETS, 10)
  store.set('recipe:/work/other', JSON.parse(RECIPE))
  await clock.advance(20_000)
  expect((await paint($)).buttons[0]?.text).toMatch(/● Inbox$/)
})

test('a tab saved by an earlier run is the one the pane opens on', async ($, on) => {
  await start($, on, { [`tab:${SHOP}`]: 'tickets' })
  const { texts, buttons } = await paint($)
  expect(buttons[1]?.text).toMatch(/● Tickets$/)
  expect(isRow(texts, 'Payment')).toBe(true)
})
