import type { On, TurnCompleteInput } from 'claude-code'
import type { Engine, MockClock } from 'claude-code/testing'
import { expect, mock } from 'claude-code/testing'
import type { Inbox } from '../hooks/inbox'
import type { Reply, World } from './world'
import { addSet, answered, failed, openStore, PANE, RECIPE, RUN, SURFACES, test, ticket, world } from './world'

// A project with no tickets: the only model calls are the summary's.
const ROOT = '/work/notes'
const items = (...list: unknown[]): string => JSON.stringify({ items: list })
const FIRST = items(
  { kind: 'note', ticket: null, short: 'Built the cart.', long: 'The cart adds and removes lines.' },
  { kind: 'needs-you', ticket: null, short: 'Pick a payment provider?', long: 'Stripe or Adyen; the cart is ready for either.' },
)
const SECOND = items({ kind: 'changed-direction', ticket: null, short: 'Dropped the cart.', long: 'The developer wants to start over.' })

const ANSWERED = { answer: 'Built it.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const

const endTurn = async ($: Engine, clock: MockClock, turn: Partial<TurnCompleteInput> = {}): Promise<void> => {
  await $.turn.complete({ ...ANSWERED, ...turn } as TurnCompleteInput)
  await clock.settle()
}

type Store = Map<string, unknown>

/** The inbox the store holds for the project. */
const inboxOf = (store: Store, root = ROOT): Inbox | undefined => store.get(`inbox:${root}`) as Inbox | undefined

/** Ends one answered turn whose reply writes the first items, and checks the pane shows them. */
const withSummary = async ($: Engine, clock: MockClock, w: World, store: Store): Promise<void> => {
  w.answer = () => answered(FIRST)
  await endTurn($, clock)
  expect(w.asked.length).toBe(1)
  await expectSummary($, store)
}

const expectSummary = async ($: Engine, store: Store): Promise<void> => {
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: 'NEEDS YOU · 1' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '? Pick a payment provider?' })).toBeDefined()
    // A note is a line of history, not news for the inbox.
    expect(await ui.find({ type: 'Text', text: 'Built the cart.' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'Dropped the cart.' })).toBeUndefined()
    await ui.unmount()
  }
  expect((await inboxOf(store))?.items.map(item => item.short)).toEqual(['Built the cart.', 'Pick a payment provider?'])
}

test("a subagent's turn makes no model call and leaves the pane's summary unchanged", async ($, on) => {
  const clock = mock.clock(on)
  const store = openStore(on)
  const w = world(on, ROOT)
  await withSummary($, clock, w, store)

  w.answer = () => answered(SECOND)
  await endTurn($, clock, { agentId: 'a1b2c3', answer: 'Report: dropped the cart.', turnId: 't2' })
  expect(w.asked.length).toBe(1)
  await expectSummary($, store)
})

test('an interrupted turn, an errored turn and a refused turn each make no model call', async ($, on) => {
  const clock = mock.clock(on)
  const store = openStore(on)
  const w = world(on, ROOT)
  await withSummary($, clock, w, store)

  w.answer = () => answered(SECOND)
  const ends: Partial<TurnCompleteInput>[] = [
    { reason: 'aborted', isAborted: true, answer: 'Dropping the ca', turnId: 't2' },
    { reason: 'error', answer: '', turnId: 't3' },
    { reason: 'refusal', refusal: { category: 'cyber', explanation: null }, answer: 'I can’t help with that.', turnId: 't4' },
  ]
  for (const end of ends) {
    await endTurn($, clock, end)
    expect(w.asked.length).toBe(1)
  }
  await expectSummary($, store)
})

test('a turn with an empty answer and no tool use makes no model call', async ($, on) => {
  const clock = mock.clock(on)
  const store = openStore(on)
  const w = world(on, ROOT)
  await withSummary($, clock, w, store)

  w.answer = () => answered(SECOND)
  w.messages = [
    { role: 'user', text: 'Think about it.', toolUses: [] },
    { role: 'assistant', text: '', toolUses: [] },
  ]
  await endTurn($, clock, { answer: '', turnId: 't2' })
  await endTurn($, clock, { answer: '  \n ', turnId: 't3' })
  expect(w.asked.length).toBe(1)
  await expectSummary($, store)

  // An empty answer after tool use is still a turn that may have moved the work.
  w.messages = [
    { role: 'user', text: 'Delete the cart.', toolUses: [] },
    { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'u1', tool: 'Bash', input: { command: 'rm -r cart' } }] },
  ]
  await endTurn($, clock, { answer: '', turnId: 't4' })
  expect(w.asked.length).toBe(2)
  expect(w.asked[1]).toContain('Bash rm -r cart')
})

test('a reply that cannot be read as items stores nothing and keeps the items held', async ($, on) => {
  const clock = mock.clock(on)
  const store = openStore(on)
  const w = world(on, ROOT)
  await withSummary($, clock, w, store)

  const replies = [
    'Dropped the cart.',
    '{"items":[{"kind":"note","ticket":null,"short":"Dropped the cart."',
    '{"items":"Dropped the cart."}',
    '{"items":[{"kind":"shout","ticket":null,"short":"Dropped the cart.","long":""}]}',
    '{"items":[{"kind":"note","ticket":null,"short":"","long":"Dropped the cart."}]}',
    '{"change":true,"happened":"Dropped the cart.","next":"Start over.","needsYou":""}',
    '["Dropped the cart."]',
  ]
  for (const [index, reply] of replies.entries()) {
    w.answer = () => answered(reply)
    await endTurn($, clock, { turnId: `t${index + 2}` })
    expect(w.asked.length).toBe(index + 2)
    await expectSummary($, store)
  }
})

test('a failed model call stores nothing and keeps the items held', async ($, on) => {
  const clock = mock.clock(on)
  const store = openStore(on)
  const w = world(on, ROOT)
  await withSummary($, clock, w, store)

  w.answer = () => failed
  await endTurn($, clock, { turnId: 't2' })
  expect(w.asked.length).toBe(2)
  await expectSummary($, store)

  w.answer = () => {
    throw new Error('connection reset')
  }
  await endTurn($, clock, { turnId: 't3' })
  expect(w.asked.length).toBe(3)
  await expectSummary($, store)
})

test("the turn's own result reaches the engine unchanged and is not delayed by summarising", async ($, on) => {
  const clock = mock.clock(on)
  const store = openStore(on)
  const w = world(on, ROOT)
  let release: (reply: Reply) => void = () => undefined
  w.answer = () => new Promise<Reply>(resolve => (release = resolve))
  const usage = {
    input_tokens: 3,
    output_tokens: 4,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    model: 'claude-opus-5-5',
  }
  w.endTurn = e => ({ text: `${e.answer} (shown)`, usage })

  // The model has not answered, yet the turn's end has already come back whole.
  const ended = await $.turn.complete({ ...ANSWERED })
  expect(ended).toEqual({ text: 'Built it. (shown)', usage })
  await clock.settle()
  expect(w.asked.length).toBe(1)
  const before = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await before.find({ type: 'Text', text: 'Pick a payment provider?' })).toBeUndefined()
  await before.unmount()

  release(answered(FIRST))
  await clock.settle()
  await expectSummary($, store)
})

test('the summary prompt asks for items with a kind, a ticket or none, a short line and a long explanation, with examples', async ($, on) => {
  const clock = mock.clock(on)
  const store = openStore(on)
  const w = world(on, ROOT)
  w.answer = () => answered('{"items":[]}')
  await endTurn($, clock)
  const rules = w.told[0] ?? ''
  for (const kind of ['"needs-you"', '"blocked"', '"changed-direction"', '"note"']) expect(rules).toContain(kind)
  expect(rules).toContain('"ticket"')
  expect(rules).toContain('"short"')
  expect(rules).toContain('"long"')
  expect(rules).toContain('Good short lines')
  expect(rules).toContain('Bad short lines')
  expect(rules).toContain('Keep timed-out payments pending?')
  // A turn that moved nothing writes nothing, and the inbox stays empty.
  expect(await inboxOf(store)).toBeUndefined()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Nothing in the inbox yet.' })).toBeDefined()
  await ui.unmount()
})

test('items survive the next turn: the pane shows the new change of direction and the open question it did not answer', async ($, on) => {
  const clock = mock.clock(on)
  const store = openStore(on)
  const w = world(on, ROOT)
  await withSummary($, clock, w, store)

  w.answer = () => answered(SECOND)
  await endTurn($, clock, { turnId: 't2' })
  expect((await inboxOf(store))?.items.map(item => item.short)).toEqual(['Built the cart.', 'Pick a payment provider?', 'Dropped the cart.'])
  // The prompt carries the items already held, so the model does not write them again.
  expect(w.asked[1]).toContain('Pick a payment provider?')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'NEEDS YOU · 2' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '? Pick a payment provider?' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '! Dropped the cart.' })).toBeDefined()
  await ui.unmount()
})

test('items survive a /clear and a new session', async ($, on) => {
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  const clock = mock.clock(on)
  const store = openStore(on)
  const w = world(on, ROOT)
  await withSummary($, clock, w, store)

  await $.session.end({ reason: 'clear', sessionId: w.sessionId, resume: { id: w.sessionId } } as never)
  w.sessionId = 's-cleared'
  await clock.settle()
  await expectSummary($, store)

  w.sessionId = 's-next'
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await clock.settle()
  await expectSummary($, store)
})

test('items an earlier run of the session stored are shown after a restart', async ($, on) => {
  const clock = mock.clock(on)
  const inbox: Inbox = {
    items: [
      { id: 1, kind: 'note', ticket: null, short: 'Built the cart.', long: '', at: 1, isReviewed: false },
      { id: 2, kind: 'needs-you', ticket: null, short: 'Pick a payment provider?', long: '', at: 1, isReviewed: false },
    ],
    next: 3,
  }
  const store = openStore(on, { [`inbox:${ROOT}`]: inbox })
  world(on, ROOT)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await clock.settle()
  await expectSummary($, store)
})

test('a short line longer than the pane is cut with an ellipsis when drawn, and stored whole', async ($, on) => {
  const clock = mock.clock(on)
  const store = openStore(on)
  const w = world(on, ROOT)
  const question = 'Keep timed-out payments pending for a whole day?'
  const done = 'Retries now reuse the original payment id everywhere'
  w.answer = () => answered(items({ kind: 'note', ticket: null, short: done, long: '' }, { kind: 'needs-you', ticket: null, short: question, long: '' }))
  await endTurn($, clock)
  expect((await inboxOf(store))?.items.map(item => item.short)).toEqual([done, question])
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // 40 columns less the padding: 38, of which the glyph and its space take 2, and the ▸ that opens its detail with its space 2.
  expect(await ui.find({ type: 'Text', text: /^\? Keep timed-out payments pending f…$/ })).toBeDefined()
  await ui.unmount()
})

test('a new needs-you item pops the 8-second toast once; news without a question pops none', async ($, on) => {
  const clock = mock.clock(on)
  const store = openStore(on)
  const w = world(on, ROOT)
  await withSummary($, clock, w, store)
  expect(w.toasts).toEqual([{ text: 'Needs you: Pick a payment provider?', timeoutMs: 8000 }])

  w.answer = () => answered(SECOND)
  await endTurn($, clock, { turnId: 't2' })
  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()
  expect(w.toasts).toHaveLength(1)

  w.answer = () => answered(items({ kind: 'needs-you', ticket: null, short: 'Start over from scratch?', long: '' }))
  await endTurn($, clock, { turnId: 't3' })
  expect(w.toasts.slice(1)).toEqual([{ text: 'Needs you: Start over from scratch?', timeoutMs: 8000 }])
})

test('a failed call with nothing held stores nothing, and the next answered turn writes its items', async ($, on) => {
  const clock = mock.clock(on)
  const store = openStore(on)
  const w = world(on, ROOT)
  w.answer = () => failed
  await endTurn($, clock)
  expect(await inboxOf(store)).toBeUndefined()
  expect(w.toasts).toEqual([])

  w.answer = () => answered(FIRST)
  await endTurn($, clock, { turnId: 't2' })
  await expectSummary($, store)
})

// A project with one ticket set, so items can belong to tickets.
const SHOP = '/work/shop'
const CART = { '01-cart.md': ticket('01: Cart', 'in-progress'), '02-payment.md': ticket('02: Payment', 'open') }

const withTickets = async ($: Engine, on: On): Promise<{ w: World; clock: MockClock; store: Store }> => {
  const clock = mock.clock(on)
  const store = openStore(on, { [`recipe:${SHOP}`]: JSON.parse(RECIPE) })
  const w = world(on, SHOP)
  addSet(w, SHOP, 'shop', CART, 10)
  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()

  return { w, clock, store }
}

test("the model names tickets from a list; a ticket's history keeps its newest 5 notes", async ($, on) => {
  const { w, clock, store } = await withTickets($, on)
  w.answer = () => answered(items({ kind: 'needs-you', ticket: 2, short: 'Which provider?', long: '' }))
  await endTurn($, clock)
  expect(w.asked[0]).toContain('1. shop · 01: Cart')
  expect(w.asked[0]).toContain('2. shop · 02: Payment')

  for (let turn = 1; turn <= 7; turn++) {
    w.answer = () => answered(items({ kind: 'note', ticket: 2, short: `Payment step ${turn}`, long: '' }))
    await endTurn($, clock, { turnId: `t${turn + 1}` })
  }
  const held = (await inboxOf(store, SHOP))?.items ?? []
  expect(held.map(item => item.short)).toEqual(['Which provider?', 'Payment step 3', 'Payment step 4', 'Payment step 5', 'Payment step 6', 'Payment step 7'])
  expect(held.every(item => item.ticket?.title === '02: Payment' && item.ticket.set === '.scratch/shop/issues')).toBe(true)
})

test('items of a ticket that is in no set any more are deleted at the next refresh', async ($, on) => {
  const { w, clock, store } = await withTickets($, on)
  w.answer = () =>
    answered(
      items(
        { kind: 'needs-you', ticket: 2, short: 'Which provider?', long: '' },
        { kind: 'note', ticket: 2, short: 'Payment started', long: '' },
        { kind: 'note', ticket: 1, short: 'Cart built', long: '' },
        { kind: 'blocked', ticket: null, short: 'Waiting on the API key', long: '' },
      ),
    )
  await endTurn($, clock)
  expect((await inboxOf(store, SHOP))?.items).toHaveLength(4)

  addSet(w, SHOP, 'shop', { '01-cart.md': CART['01-cart.md'] }, 20)
  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()
  expect((await inboxOf(store, SHOP))?.items.map(item => item.short)).toEqual(['Cart built', 'Waiting on the API key'])
})
