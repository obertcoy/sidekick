import { expect } from 'claude-code/testing'
import type { Draft, Inbox, TicketRef } from '../hooks/inbox'
import { addItems, fit, HISTORY_LINES, historyOf, parseItems, readInbox, summaryOf, tidy } from '../hooks/inbox'
import { test } from './world'

const CART: TicketRef = { set: '.scratch/shop/issues', title: '01: Cart' }
const PAY: TicketRef = { set: '.scratch/shop/issues', title: '02: Payment' }
const TICKETS = [CART, PAY]
const EMPTY: Inbox = { items: [], next: 1 }

const note = (short: string, ticket: TicketRef | null = CART): Draft => ({ kind: 'note', ticket, short, long: '' })

test('a reply is read as items with a kind, a ticket from the list or none, a short line and a long explanation', () => {
  const reply = `Here you go:
{"items":[
  {"kind":"needs-you","ticket":2,"short":"Keep timed-out payments pending?","long":"Retries reuse the payment id.  A timed-out one may stay pending."},
  {"kind":"note","ticket":"1","short":"Cart built","long":"The cart adds and removes lines."},
  {"kind":"blocked","ticket":null,"short":"Waiting on the API key","long":""},
  {"kind":"changed-direction","ticket":9,"short":"Dropped the queue","long":"A cron job replaced it."}
]}`
  expect(parseItems(reply, TICKETS)).toEqual([
    {
      kind: 'needs-you',
      ticket: PAY,
      short: 'Keep timed-out payments pending?',
      long: 'Retries reuse the payment id. A timed-out one may stay pending.',
    },
    { kind: 'note', ticket: CART, short: 'Cart built', long: 'The cart adds and removes lines.' },
    { kind: 'blocked', ticket: null, short: 'Waiting on the API key', long: '' },
    // A ticket number that is not in the list belongs to no ticket.
    { kind: 'changed-direction', ticket: null, short: 'Dropped the queue', long: 'A cron job replaced it.' },
  ])
})

test('a reply of no items is an answer; one that cannot be read is not', () => {
  expect(parseItems('{"items":[]}', TICKETS)).toEqual([])
  expect(parseItems('nothing moved', TICKETS)).toBeUndefined()
  expect(parseItems('{"items":[', TICKETS)).toBeUndefined()
  expect(parseItems('{"items":"none"}', TICKETS)).toBeUndefined()
  expect(parseItems('{"change":true,"happened":"Built the cart.","next":"","needsYou":""}', TICKETS)).toBeUndefined()
  // Items that are each unreadable make no answer either; a readable one among them is kept.
  expect(parseItems('{"items":[{"kind":"shout","short":"Hi"},{"kind":"note","short":"  "}]}', TICKETS)).toBeUndefined()
  expect(parseItems('{"items":[{"kind":"shout","short":"Hi"},{"kind":"note","short":"Cart built"}]}', TICKETS)).toEqual([
    { kind: 'note', ticket: null, short: 'Cart built', long: '' },
  ])
})

test('the short line is stored whole, however long', () => {
  const long = 'The agent has finished the payment retry logic and now wants a decision about pending payments'
  const [item] = parseItems(`{"items":[{"kind":"needs-you","ticket":null,"short":"${long}","long":"x"}]}`, TICKETS) ?? []
  expect(item?.short).toBe(long)
})

test('added items are numbered, timed and unreviewed, after those already held', () => {
  const once = addItems(EMPTY, [note('Cart built')], 100)
  const twice = addItems(once, [{ kind: 'needs-you', ticket: null, short: 'Which provider?', long: '' }], 200)
  expect(twice).toEqual({
    items: [
      { id: 1, kind: 'note', ticket: CART, short: 'Cart built', long: '', at: 100, isReviewed: false },
      { id: 2, kind: 'needs-you', ticket: null, short: 'Which provider?', long: '', at: 200, isReviewed: false },
    ],
    next: 3,
  })
})

test("a ticket's history keeps its newest lines only", () => {
  let inbox = EMPTY
  for (let turn = 1; turn <= HISTORY_LINES + 2; turn++) inbox = addItems(inbox, [note(`step ${turn}`), note(`pay ${turn}`, PAY)], turn)
  inbox = addItems(inbox, [{ kind: 'needs-you', ticket: CART, short: 'Keep it?', long: '' }], 99)
  expect(HISTORY_LINES).toBe(5)
  expect(historyOf(inbox, CART).map(item => item.short)).toEqual(['step 7', 'step 6', 'step 5', 'step 4', 'step 3'])
  expect(historyOf(inbox, PAY)).toHaveLength(5)
  // The cap is on notes: a question on the same ticket is kept.
  expect(inbox.items.filter(item => item.kind === 'needs-you')).toHaveLength(1)
  // Notes that belong to no ticket are capped the same way.
  let loose = EMPTY
  for (let turn = 1; turn <= 8; turn++) loose = addItems(loose, [note(`loose ${turn}`, null)], turn)
  expect(historyOf(loose, null).map(item => item.short)).toEqual(['loose 8', 'loose 7', 'loose 6', 'loose 5', 'loose 4'])
})

test('cleanup drops items of tickets in no set and reviewed items of no ticket, and keeps the rest', () => {
  const inbox: Inbox = {
    items: [
      { id: 1, kind: 'note', ticket: CART, short: 'a', long: '', at: 1, isReviewed: false },
      { id: 2, kind: 'needs-you', ticket: PAY, short: 'b', long: '', at: 2, isReviewed: true },
      { id: 3, kind: 'blocked', ticket: null, short: 'c', long: '', at: 3, isReviewed: false },
      { id: 4, kind: 'note', ticket: null, short: 'd', long: '', at: 4, isReviewed: true },
    ],
    next: 5,
  }
  expect(tidy(inbox, [CART]).items.map(item => item.id)).toEqual([1, 3])
  expect(tidy(inbox, [CART, PAY]).items.map(item => item.id)).toEqual([1, 2, 3])
  // The same title in another set is another ticket.
  expect(tidy(inbox, [{ set: 'docs/tasks', title: '01: Cart' }]).items.map(item => item.id)).toEqual([3])
  expect(tidy(inbox, [CART, PAY]).next).toBe(5)
})

test('the current summary is read from the newest items', () => {
  expect(summaryOf(EMPTY)).toBeNull()
  const inbox = addItems(
    addItems(EMPTY, [{ kind: 'needs-you', ticket: null, short: 'Which provider?', long: '' }, note('Cart built')], 1),
    [note('Cart styled')],
    2,
  )
  expect(summaryOf(inbox)).toEqual({ happened: 'Cart styled', next: '', needsYou: 'Which provider?' })
  // A reviewed question no longer needs the developer.
  const reviewed = { ...inbox, items: inbox.items.map(item => ({ ...item, isReviewed: item.kind === 'needs-you' })) }
  expect(summaryOf(reviewed)).toEqual({ happened: 'Cart styled', next: '', needsYou: '' })
})

test('a stored inbox is read back, and anything else reads as an empty one', () => {
  const inbox = addItems(EMPTY, [note('Cart built')], 1)
  expect(readInbox(JSON.parse(JSON.stringify(inbox)))).toEqual(inbox)
  expect(readInbox(undefined)).toEqual(EMPTY)
  expect(readInbox('junk')).toEqual(EMPTY)
  expect(readInbox({ items: [{ id: 'x' }, ...inbox.items], next: 2 })).toEqual(inbox)
})

test('a line longer than its room is cut with an ellipsis', () => {
  expect(fit('Keep timed-out payments pending?', 40)).toBe('Keep timed-out payments pending?')
  expect(fit('Keep timed-out payments pending?', 10)).toBe('Keep time…')
  expect(fit('Keep timed-out payments pending?', 10)).toHaveLength(10)
  expect(fit('abc', 3)).toBe('abc')
  expect(fit('abcd', 1)).toBe('…')
})
