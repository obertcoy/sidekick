import type { Engine, MockClock } from 'claude-code/testing'
import { expect, mock } from 'claude-code/testing'
import type { Inbox, Item } from '../hooks/inbox'
import { tagOf } from '../hooks/inbox'
import type { World } from './world'
import { addSet, answered, openStore, PANE, RECIPE, RUN, test, world } from './world'

// Fixes found in review: transient read failures, closures without items, unique tags, serialized writes, spent tags only.
const SHOP = '/work/shop'
const SET = '.scratch/shop/issues'
const PAYMENT = `${SHOP}/${SET}/02-payment.md`

const TICKETS = {
  '01-cart.md': '# 01: Cart\n\nThe cart keeps lines.\n\n**Status:** in-progress\n\n- [x] add\n- [ ] remove\n',
  '02-payment.md': '# 02: Payment\n\nRetries reuse the id.\n\n**Status:** done\n\n- [x] Retries reuse the id\n',
}

const items = (...list: unknown[]): string => JSON.stringify({ items: list })

const ANSWERED = { answer: 'Built it.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const

const TURN = items(
  { kind: 'needs-you', ticket: 2, short: 'Which provider?', long: 'Card or bank.' },
  { kind: 'blocked', ticket: null, short: 'Staging is down', long: 'Wait.' },
)

const endTurn = async ($: Engine, clock: MockClock, w: World, text: string): Promise<void> => {
  w.answer = () => answered(text)
  await $.turn.complete({ ...ANSWERED })
  await clock.settle()
}

const start = async ($: Engine, on: Parameters<typeof world>[0], saved: Record<string, unknown> = {}) => {
  const clock = mock.clock(on)
  const store = openStore(on, { [`recipe:${SHOP}`]: JSON.parse(RECIPE), ...saved })
  const w = world(on, SHOP)
  addSet(w, SHOP, 'shop', TICKETS, 10)
  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()
  await endTurn($, clock, w, TURN)

  return { clock, store, w }
}

const inboxIn = (store: Map<string, unknown>): Inbox => store.get(`inbox:${SHOP}`) as Inbox

test('a ticket whose file cannot be read for a moment keeps its items and its reviewed mark', async ($, on) => {
  const { clock, store, w } = await start($, on, { [`reviewed:${SHOP}`]: [`${SET}\n02: Payment`] })
  expect(inboxIn(store).items.map(item => item.id)).toEqual([1, 2])
  addSet(w, SHOP, 'shop', TICKETS, 20)
  w.unreadable.push(PAYMENT)
  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()
  expect(inboxIn(store).items.map(item => item.id)).toEqual([1, 2])
  expect(store.get(`reviewed:${SHOP}`)).toEqual([`${SET}\n02: Payment`])

  // Readable again: nothing was lost.
  w.unreadable.length = 0
  addSet(w, SHOP, 'shop', TICKETS, 30)
  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()
  expect(inboxIn(store).items.map(item => item.id)).toEqual([1, 2])

  // Truly gone: the ticket's items go.
  addSet(w, SHOP, 'shop', { '01-cart.md': TICKETS['01-cart.md'] }, 40)
  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()
  expect(inboxIn(store).items.map(item => item.id)).toEqual([2])
})

test('a closure is kept when the reply holds no items; a reply with nothing readable is still a failed one', async ($, on) => {
  const { clock, store, w } = await start($, on)
  await endTurn($, clock, w, JSON.stringify({ closed: [{ id: 1, said: 'Card.' }] }))
  expect(inboxIn(store).items.find(item => item.id === 1)?.isReviewed).toBe(true)
  await endTurn($, clock, w, JSON.stringify({ items: 'oops', closed: [{ id: 2, said: 'Back up.' }] }))
  // Item 2 is a blocker of no ticket: closed, it is tidied away at once.
  expect(inboxIn(store).items.find(item => item.id === 2)).toBeUndefined()
  const before = JSON.stringify(inboxIn(store))
  await endTurn($, clock, w, 'not json at all')
  expect(JSON.stringify(inboxIn(store))).toBe(before)
})

test('two open questions on one ticket get different tags; one question keeps the plain tag', () => {
  const first = { id: 4, ticket: '02: Payment', short: 'Which provider?' }
  const second = { id: 7, ticket: '02: Payment', short: 'Which currency?' }
  const open = [first, second]
  expect(tagOf(first)).toBe('02 Payment: ')
  expect(tagOf(first, open)).not.toBe(tagOf(second, open))
  expect(tagOf(first, open).startsWith('02 Payment')).toBe(true)
  expect(tagOf(first, [first])).toBe('02 Payment: ')
})

test('a summary does not undo a Mark reviewed that is under way', async ($, on) => {
  const clock = mock.clock(on)
  const gate: { hold: Promise<void> | undefined } = { hold: undefined }
  const raw = on as unknown as (...args: unknown[]) => unknown
  const gated = ((event: string, handler: (...args: unknown[]) => unknown) =>
    event === 'store.get'
      ? raw(event, async (...args: unknown[]) => {
          if ((args[1] as { key: string }).key === `reviewed:${SHOP}` && gate.hold !== undefined) await gate.hold

          return handler(...args)
        })
      : raw(event, handler)) as unknown as Parameters<typeof openStore>[0]
  const store = openStore(gated, { [`recipe:${SHOP}`]: JSON.parse(RECIPE) })
  const w = world(on, SHOP)
  addSet(w, SHOP, 'shop', TICKETS, 10)
  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()
  await endTurn($, clock, w, TURN)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, scroll: { offset: 0, bodyRows: 30 } } })
  await ui.press({ key: 'open-ask-2' })
  let release: () => void = () => undefined
  gate.hold = new Promise<void>(resolve => {
    release = resolve
  })
  const marking = ui.press({ key: 'mark-reviewed' })
  await clock.settle()
  await endTurn($, clock, w, items({ kind: 'note', ticket: 1, short: 'Cart done', long: '' }))
  gate.hold = undefined
  release()
  await marking
  await clock.settle()
  const shorts = (inboxIn(store).items as Item[]).map(item => item.short)
  expect(shorts).toContain('Cart done')
  expect(shorts).toContain('Which provider?')
  expect(shorts).not.toContain('Staging is down')
  await ui.unmount()
})

test('a message sent without a tag spends no tags; only a tag in the sent message is spent', async ($, on) => {
  const { w } = await start($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, scroll: { offset: 0, bodyRows: 30 } } })
  await ui.press({ key: 'reply-ask-1' })
  w.draft += 'Card.'
  await ui.press({ key: 'back' })
  const kept = w.draft
  await $.prompt.submit({ text: 'A word on something else.', wait: false, origin: { kind: 'composer' } })
  expect(w.submitted[0]?.context).toBeUndefined()
  await $.prompt.submit({ text: kept, wait: false, origin: { kind: 'composer' } })
  expect(w.submitted[1]?.context).toHaveLength(1)
  await ui.unmount()
})

test('a click on a question closed meanwhile tags nothing, even after another detail was opened', async ($, on) => {
  const { store, w } = await start($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, scroll: { offset: 0, bodyRows: 30 } } })
  await ui.press({ key: 'open-ask-2' })
  const inbox = inboxIn(store)
  store.set(`inbox:${SHOP}`, { ...inbox, items: inbox.items.map(item => (item.id === 1 ? { ...item, isReviewed: true } : item)) })
  await ui.press({ key: 'reply-ask-1' }).catch(() => undefined)
  expect(w.draft).toBe('')
  await ui.unmount()
})
