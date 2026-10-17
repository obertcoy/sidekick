import type { Engine, MockClock } from 'claude-code/testing'
import { expect, mock } from 'claude-code/testing'
import type { World } from './world'
import { addSet, answered, linesIn, openStore, PANE, RECIPE, RUN, SURFACES, test, world } from './world'

// An inbox entry opens in a detail view that takes the inbox's place in the pane, and goes back to it.
const SHOP = '/work/shop'
const SET = '.scratch/shop/issues'
const PAYMENT = `${SHOP}/${SET}/02-payment.md`

const GOAL = 'Retries reuse the payment id, so a retry never charges twice.'

const TICKETS = {
  '01-cart.md': '# 01: Cart\n\nThe cart keeps lines.\n\n**Status:** in-progress\n\n- [x] add\n- [ ] remove\n',
  '02-payment.md': `# 02: Payment\n\n${GOAL}\n\n**Status:** done\n\n- [x] Retries reuse the id\n- [x] A timeout stays pending\n- [x] Covered by tests\n`,
  '03-emails.md': '# 03: Emails\n\nMail the receipt.\n\n**Status:** done\n\n- [x] send\n- [ ] retry\n',
}

const items = (...list: unknown[]): string => JSON.stringify({ items: list })

const ANSWERED = { answer: 'Built it.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const

// The turn writes, in this order (so with these ids): 1 a question on Payment, 2 a note on it, 3 a blocker of no ticket.
const TURN = items(
  { kind: 'needs-you', ticket: 2, short: 'Which provider?', long: 'Card is quicker to ship; bank transfer is cheaper per payment.' },
  { kind: 'note', ticket: 2, short: 'Retries built', long: 'Each retry reuses the payment id.' },
  { kind: 'blocked', ticket: null, short: 'Staging is down', long: 'Nothing can be tried on staging until it is back.' },
)

const INBOX = ['NEEDS YOU · 2', '✗ Staging is down ▸', '? 02 Payment ▸', '  Which provider?']

const start = async ($: Engine, on: Parameters<typeof world>[0]) => {
  const clock = mock.clock(on)
  const store = openStore(on, { [`recipe:${SHOP}`]: JSON.parse(RECIPE) })
  const w = world(on, SHOP)
  addSet(w, SHOP, 'shop', TICKETS, 10)
  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()
  await endTurn($, clock, w, TURN)

  return { clock, store, w }
}

const endTurn = async ($: Engine, clock: MockClock, w: World, reply: string): Promise<void> => {
  w.answer = () => answered(reply)
  await $.turn.complete({ ...ANSWERED })
  await clock.settle()
}

const mount = ($: Engine, surface: (typeof SURFACES)[number], offset = 0) =>
  $.ui.mount({ ...PANE, surface, props: { ...PANE.props, scroll: { offset, bodyRows: 30 } } })

type Stored = { items: { id: number; isReviewed: boolean }[] }

const storedItems = (store: Map<string, unknown>): [number, boolean][] => (store.get(`inbox:${SHOP}`) as Stored).items.map(item => [item.id, item.isReviewed])

test("▸ on a NEEDS YOU row opens the item's detail in the inbox's place; Back returns to the inbox where it was, the item unreviewed", async ($, on) => {
  const { store } = await start($, on)
  for (const surface of SURFACES) {
    const ui = await mount($, surface, 6)
    expect((await linesIn(ui, 'inbox')).slice(0, 4)).toEqual(INBOX)
    // The ▸ is a Button, so a click or Enter under the keyboard's focus opens it.
    expect((await ui.find({ key: 'open-ask-1' }))?.type).toBe('Button')
    await ui.press({ key: 'open-ask-1' })
    expect(await ui.find({ key: 'inbox' })).toBeUndefined()
    expect(await linesIn(ui, 'detail')).toEqual([
      '← Back',
      '? 02 Payment',
      'Which provider?',
      'Goal',
      GOAL,
      'Card is quicker to ship; bank transfer is cheaper per payment.',
      'What happened',
      '· Retries built',
      'Evidence · 3/3 ticked',
      '✓ Retries reuse the id',
      '✓ A timeout stays pending',
      '✓ Covered by tests',
      'Mark reviewed',
    ])
    // Back and Mark reviewed each have a key of their own.
    expect((await ui.find({ key: 'back' }))?.props.hotkey).toBe('b')
    expect((await ui.find({ key: 'mark-reviewed' }))?.props.hotkey).toBe('r')

    await ui.press({ key: 'back' })
    expect(await ui.find({ key: 'detail' })).toBeUndefined()
    // The inbox comes back as it was. (The kit implements no `$.ui.scroll`, so the window's move back to where it
    // stood is not seen here; the mod goes on without it, as it does when the engine refuses a scroll.)
    expect((await linesIn(ui, 'inbox')).slice(0, 4)).toEqual(INBOX)
    // Opening and going back marks nothing.
    expect(storedItems(store)).toEqual([
      [1, false],
      [2, false],
      [3, false],
    ])
    await ui.unmount()
  }
})

test('an item of no ticket shows its explanation alone, and marking it reviewed deletes it', async ($, on) => {
  const { store } = await start($, on)
  const ui = await mount($, 'terminal')
  await ui.press({ key: 'open-ask-3' })
  expect(await linesIn(ui, 'detail')).toEqual(['← Back', '✗ Staging is down', 'Nothing can be tried on staging until it is back.', 'Mark reviewed'])
  await ui.press({ key: 'mark-reviewed' })
  // Back in the inbox: the item is gone, not counted as reviewed.
  expect(await ui.find({ key: 'detail' })).toBeUndefined()
  const lines = await linesIn(ui, 'inbox')
  expect(lines.slice(0, 3)).toEqual(['NEEDS YOU · 1', '? 02 Payment ▸', '  Which provider?'])
  expect(lines.filter(line => line.startsWith('REVIEWED'))).toEqual([])
  expect(storedItems(store)).toEqual([
    [1, false],
    [2, false],
  ])
  await ui.unmount()
})

test("marking a ticket's question reviewed moves it to REVIEWED; it stays in the store as reviewed", async ($, on) => {
  const { store } = await start($, on)
  const ui = await mount($, 'desktop')
  await ui.press({ key: 'open-ask-1' })
  await ui.press({ key: 'mark-reviewed' })
  const lines = await linesIn(ui, 'inbox')
  expect(lines.slice(0, 2)).toEqual(['NEEDS YOU · 1', '✗ Staging is down ▸'])
  expect(lines.at(-1)).toBe('REVIEWED · 1')
  expect(storedItems(store)).toEqual([
    [1, true],
    [2, false],
    [3, false],
  ])
  await ui.unmount()
})

test('a click on a READY TO REVIEW row opens the ticket; Mark reviewed moves it to REVIEWED, in the store and never in its file', async ($, on) => {
  const { store, w } = await start($, on)
  const before = { ...w.files }
  const ui = await mount($, 'terminal')
  const review = await linesIn(ui, 'inbox')
  expect(review.slice(4, 9)).toEqual(['READY TO REVIEW · 2', '◐ 03 Emails', '  agent says done · 1/2 ticked', '✓ 02 Payment', '  agent says done · 3/3'])
  // The row is a Button: a click, or Enter under the keyboard's focus.
  expect((await ui.find({ key: 'open-review-1' }))?.type).toBe('Button')
  await ui.press({ key: 'open-review-1' })
  // A ticket's own detail is explained by its newest note.
  expect(await linesIn(ui, 'detail')).toEqual([
    '← Back',
    '✓ 02 Payment',
    'Goal',
    GOAL,
    'Each retry reuses the payment id.',
    'What happened',
    '· Retries built',
    'Evidence · 3/3 ticked',
    '✓ Retries reuse the id',
    '✓ A timeout stays pending',
    '✓ Covered by tests',
    'Mark reviewed',
  ])
  await ui.press({ key: 'mark-reviewed' })
  const lines = await linesIn(ui, 'inbox')
  expect(lines.filter(line => line.startsWith('READY TO REVIEW'))).toEqual(['READY TO REVIEW · 1'])
  expect(lines).not.toContain('✓ 02 Payment')
  expect(lines.at(-1)).toBe('REVIEWED · 1')
  expect(store.get(`reviewed:${SHOP}`)).toEqual([`${SET}\n02: Payment`])
  expect(w.files).toEqual(before)
  await ui.unmount()
})

test('a ticket reviewed and then reopened in its file comes back to READY TO REVIEW once it is done again', async ($, on) => {
  const { clock, w } = await start($, on)
  let ui = await mount($, 'terminal')
  await ui.press({ key: 'open-review-1' })
  await ui.press({ key: 'mark-reviewed' })
  await ui.unmount()
  addSet(w, SHOP, 'shop', { ...TICKETS, '02-payment.md': TICKETS['02-payment.md'].replace('**Status:** done', '**Status:** in-progress') }, 20)
  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()
  addSet(w, SHOP, 'shop', TICKETS, 30)
  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()
  ui = await mount($, 'terminal')
  expect(await linesIn(ui, 'inbox')).toContain('✓ 02 Payment')
  await ui.unmount()
})

test('a click on a WORKING row opens the ticket, with nothing to mark reviewed', async ($, on) => {
  const { store } = await start($, on)
  const ui = await mount($, 'terminal')
  await ui.press({ key: 'open-working-0' })
  expect(await linesIn(ui, 'detail')).toEqual(['← Back', '◐ 01 Cart', 'Goal', 'The cart keeps lines.', 'Evidence · 1/2 ticked', '✓ add'])
  await ui.press({ key: 'back' })
  expect(await linesIn(ui, 'inbox')).toContain('◐ 01 Cart')
  expect(store.get(`reviewed:${SHOP}`)).toBeUndefined()
  await ui.unmount()
})

test('the goal is read from the ticket file each time the detail opens', async ($, on) => {
  const { w } = await start($, on)
  const ui = await mount($, 'terminal')
  await ui.press({ key: 'open-ask-1' })
  expect(await linesIn(ui, 'detail')).toContain(GOAL)
  await ui.press({ key: 'back' })
  // The file changes and nothing else does, not even its time: the next opening reads it again.
  w.files[PAYMENT] = (w.files[PAYMENT] ?? '').replace(GOAL, 'Retries stop after three tries.')
  await ui.press({ key: 'open-ask-1' })
  const lines = await linesIn(ui, 'detail')
  expect(lines).toContain('Retries stop after three tries.')
  expect(lines).not.toContain(GOAL)
  await ui.press({ key: 'back' })
  await ui.unmount()
})

test('the detail wraps to the pane and is drawn whole however tall, for the pane to scroll', async ($, on) => {
  const { w } = await start($, on)
  const long = `${'A goal far longer than the pane is wide, '.repeat(6)}to the end.`
  w.files[PAYMENT] = (w.files[PAYMENT] ?? '').replace(GOAL, long)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, scroll: { offset: 0, bodyRows: 8 } } })
  await ui.press({ key: 'open-ask-1' })
  expect(await linesIn(ui, 'detail')).toContain(long)
  // Every line of text wraps rather than being cut at the pane's edge.
  const texts = (await ui.find({ key: 'detail' }))?.children ?? []
  // The rule above the detail is left out: it is as wide as the pane.
  const wraps = (texts as { type?: string; props?: { wrap?: string } }[])
    .filter(one => one.type === 'Text')
    .slice(1)
    .map(one => one.props?.wrap)
  expect(wraps.length).toBeGreaterThan(0)
  expect(wraps.every(wrap => wrap === 'wrap')).toBe(true)
  await ui.press({ key: 'back' })
  await ui.unmount()
})
