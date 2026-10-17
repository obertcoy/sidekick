import type { Engine, MockClock } from 'claude-code/testing'
import { expect, mock } from 'claude-code/testing'
import type { Inbox } from '../hooks/inbox'
import type { World } from './world'
import { addSet, answered, linesIn, openStore, PANE, RECIPE, RUN, test, world } from './world'

// Items the developer dealt with in the conversation move on by themselves, when a later turn's summary sees it.
const SHOP = '/work/shop'

const file = (title: string, status: string): string => `# ${title}\n\nWhat it is for.\n\n**Status:** ${status}\n\n- [x] a\n- [x] b\n`

const TICKETS = {
  '01-cart.md': file('01: Cart', 'in-progress'),
  '02-payment.md': file('02: Payment', 'in-progress'),
}

const reply = (items: unknown[], closed: unknown[] = []): string => JSON.stringify({ items, closed })

const ANSWERED = { answer: 'Built it.', durationMs: 1, isAborted: false, reason: 'answer' } as const

// The first turn writes, so with these ids: 1 a question on Payment, 2 a blocker on Cart, 3 a change of direction on
// Cart, 4 a question of no ticket.
const FIRST = reply([
  { kind: 'needs-you', ticket: 2, short: 'Which provider?', long: 'Card ships sooner; bank is cheaper.' },
  { kind: 'blocked', ticket: 1, short: 'Staging is down', long: 'Nothing can be tried there.' },
  { kind: 'changed-direction', ticket: 1, short: 'Dropped the queue', long: 'A cron job does it now.' },
  { kind: 'needs-you', ticket: null, short: 'Rename the repo?', long: '' },
])

const start = async ($: Engine, on: Parameters<typeof world>[0]) => {
  const clock = mock.clock(on)
  const store = openStore(on, { [`recipe:${SHOP}`]: JSON.parse(RECIPE) })
  const w = world(on, SHOP)
  addSet(w, SHOP, 'shop', TICKETS, 10)
  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()
  await endTurn($, clock, w, 'Build the payment.', FIRST, 't1')

  return { clock, store, w }
}

/** One turn: the developer's message, and the summary's reply to it. */
const endTurn = async ($: Engine, clock: MockClock, w: World, said: string, text: string, turnId: string): Promise<void> => {
  w.messages = [
    { role: 'user', text: said, toolUses: [] },
    { role: 'assistant', text: 'Done.', toolUses: [] },
  ]
  w.answer = () => answered(text)
  await $.turn.complete({ ...ANSWERED, turnId })
  await clock.settle()
}

const inbox = async ($: Engine): Promise<string[]> => {
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const lines = await linesIn(ui, 'inbox')
  await ui.unmount()

  return lines
}

const stored = (store: Map<string, unknown>) =>
  (store.get(`inbox:${SHOP}`) as Inbox).items.map(item => ({ id: item.id, isReviewed: item.isReviewed, receipt: item.receipt }))

test('the summary is told the open questions and blockers by id, and moves the ones a turn answered or unblocked to REVIEWED with a receipt', async ($, on) => {
  const { clock, store, w } = await start($, on)
  expect((await inbox($)).slice(0, 7)).toEqual([
    'NEEDS YOU · 4',
    '? Rename the repo? ▸',
    '? 02 Payment ▸',
    '  Which provider?',
    '✗ 01 Cart ▸',
    '  Staging is down',
    '! 01 Cart ▸',
  ])

  // The model names the change of direction too: it is news to read, so it stays.
  await endTurn(
    $,
    clock,
    w,
    'Go with card. Staging is back, try it.',
    reply(
      [],
      [
        { id: 1, said: 'go with card' },
        { id: 2, said: 'staging is back' },
        { id: 3, said: 'ok' },
      ],
    ),
    't2',
  )
  const prompt = w.asked.at(-1) ?? ''
  expect(prompt).toContain('#1 needs-you (shop · 02: Payment): Which provider?')
  expect(prompt).toContain('#2 blocked (shop · 01: Cart): Staging is down')
  expect(prompt).toContain('#4 needs-you: Rename the repo?')
  expect(prompt).not.toContain('#3 ')
  expect(prompt).toContain('Go with card. Staging is back, try it.')
  // The rules say how to close one.
  expect(w.told.at(-1)).toContain('"closed"')

  const lines = await inbox($)
  expect(lines.slice(0, 4)).toEqual(['NEEDS YOU · 2', '? Rename the repo? ▸', '! 01 Cart ▸', '  Dropped the queue'])
  expect(lines.at(-1)).toBe('REVIEWED · 2')
  expect(stored(store)).toEqual([
    { id: 1, isReviewed: true, receipt: 'you said: go with card' },
    { id: 2, isReviewed: true, receipt: 'unblocked: staging is back' },
    { id: 3, isReviewed: false, receipt: undefined },
    { id: 4, isReviewed: false, receipt: undefined },
  ])
  // A closing toasts nothing.
  expect(w.toasts.map(toast => toast.text)).toEqual(['Needs you: Which provider?', 'Needs you: Rename the repo?'])

  // The receipt is kept in the ticket's history, in the detail.
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'open-ask-3' })
  const detail = await linesIn(ui, 'detail')
  expect(detail.slice(detail.indexOf('What happened'), detail.indexOf('What happened') + 2)).toEqual([
    'What happened',
    '· Staging is down · unblocked: staging is back',
  ])
  await ui.press({ key: 'back' })
  await ui.unmount()
})

test('a change of direction stays until marked reviewed, and an item marked reviewed by hand is not brought back by a later summary', async ($, on) => {
  const { clock, store, w } = await start($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'open-ask-3' })
  await ui.press({ key: 'mark-reviewed' })
  await ui.press({ key: 'open-ask-1' })
  await ui.press({ key: 'mark-reviewed' })
  await ui.unmount()

  await endTurn(
    $,
    clock,
    w,
    'Card. Fine about the queue.',
    reply(
      [],
      [
        { id: 1, said: 'card' },
        { id: 3, said: 'fine' },
        { id: 2, said: 'later' },
      ],
    ),
    't2',
  )
  const prompt = w.asked.at(-1) ?? ''
  // Reviewed items are not open: the model is not asked about them, and a closing that names them changes nothing.
  expect(prompt).not.toContain('#1 ')
  expect(prompt).not.toContain('#3 ')
  expect(stored(store)).toEqual([
    { id: 1, isReviewed: true, receipt: undefined },
    { id: 2, isReviewed: true, receipt: 'unblocked: later' },
    { id: 3, isReviewed: true, receipt: undefined },
    { id: 4, isReviewed: false, receipt: undefined },
  ])
  // The items the inbox holds are shown with what became of them, so the model does not write a reviewed one again.
  expect(prompt).toContain('- needs-you (shop · 02: Payment), reviewed: Which provider?')
  expect((await inbox($)).slice(0, 2)).toEqual(['NEEDS YOU · 1', '? Rename the repo? ▸'])
})

test('a ticket done in its file after its question was answered shows in READY TO REVIEW, for the work', async ($, on) => {
  const { clock, w } = await start($, on)
  await endTurn($, clock, w, 'Card.', reply([], [{ id: 1, said: 'card' }]), 't2')
  expect(await inbox($)).not.toContain('✓ 02 Payment')

  addSet(w, SHOP, 'shop', { ...TICKETS, '02-payment.md': file('02: Payment', 'done') }, 20)
  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()
  const lines = await inbox($)
  expect(lines.slice(lines.indexOf('READY TO REVIEW · 1'), lines.indexOf('READY TO REVIEW · 1') + 3)).toEqual([
    'READY TO REVIEW · 1',
    '✓ 02 Payment',
    '  agent says done · 2/2',
  ])
  expect(lines.at(-1)).toBe('REVIEWED · 1')
})

test('a reply that cannot be read closes nothing, and a reply with no closed list closes nothing', async ($, on) => {
  const { clock, store, w } = await start($, on)
  await endTurn($, clock, w, 'Card.', '{"items":[{"kind":"bogus"}]}', 't2')
  await endTurn($, clock, w, 'Card.', JSON.stringify({ items: [] }), 't3')
  expect(stored(store).every(item => !item.isReviewed)).toBe(true)
  // A reply of closings alone, with no new items, is an answer.
  await endTurn($, clock, w, 'Card.', reply([], [{ id: 1, said: 'card' }]), 't4')
  expect(stored(store)[0]).toEqual({ id: 1, isReviewed: true, receipt: 'you said: card' })
})
