import { expect } from 'claude-code/testing'
import type { Draft, FileTicket, Inbox, Item, TicketRef } from '../hooks/inbox'
import {
  activeSince,
  addItems,
  ago,
  fit,
  HISTORY_LINES,
  historyOf,
  inboxTitle,
  keyOf,
  parseItems,
  readInbox,
  readSince,
  reviewLine,
  sectionsOf,
  tidy,
  workingLine,
} from '../hooks/inbox'
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

const asking = (id: number, kind: Item['kind'], ticket: TicketRef | null, short: string, isReviewed = false): Item => ({
  id,
  kind,
  ticket,
  short,
  long: '',
  at: id,
  isReviewed,
})

const fromFile = (title: string, state: Partial<FileTicket>): FileTicket => ({
  set: CART.set,
  title,
  isDone: false,
  isActive: false,
  ticked: 0,
  boxes: 0,
  ...state,
})

test('NEEDS YOU holds the open questions, blockers and changes of direction: no ticket first, then by kind, newest first', () => {
  const inbox: Inbox = {
    items: [
      asking(1, 'changed-direction', CART, 'Dropped the queue'),
      asking(2, 'needs-you', PAY, 'Which provider?'),
      asking(3, 'note', CART, 'Cart built'),
      asking(4, 'blocked', PAY, 'Waiting on the API key'),
      asking(5, 'needs-you', CART, 'Keep the old cart?'),
      asking(6, 'blocked', null, 'Staging is down'),
      asking(7, 'needs-you', null, 'Ship on Friday?'),
      asking(8, 'needs-you', PAY, 'Refund by card?', true),
      asking(9, 'note', PAY, 'Payment reviewed', true),
    ],
    next: 10,
  }
  const { needsYou, reviewed } = sectionsOf(inbox, [], {})
  expect(needsYou.map(one => one.short)).toEqual([
    'Ship on Friday?',
    'Staging is down',
    'Keep the old cart?',
    'Which provider?',
    'Waiting on the API key',
    'Dropped the queue',
  ])
  expect(needsYou[0]).toEqual({ kind: 'needs-you', ticket: null, short: 'Ship on Friday?' })
  expect(needsYou[2]).toEqual({ kind: 'needs-you', ticket: '01: Cart', short: 'Keep the old cart?' })
  // Notes are a ticket's history, not news for the inbox; a reviewed question is counted in REVIEWED.
  expect(reviewed).toBe(1)
})

test('READY TO REVIEW holds the tickets done in their files, some boxes unticked first; WORKING the active ones with when they went active', () => {
  const tickets = [
    fromFile('01: Cart', { isActive: true, ticked: 2, boxes: 4 }),
    fromFile('02: Payment', { isDone: true, ticked: 3, boxes: 3 }),
    fromFile('03: Emails', { isDone: true, ticked: 1, boxes: 3 }),
    fromFile('04: Docs', { isDone: true }),
    fromFile('05: Ship', {}),
    fromFile('06: Tax', { isActive: true }),
  ]
  const since = { [keyOf({ set: CART.set, title: '01: Cart' })]: 100 }
  const { review, working, needsYou, reviewed } = sectionsOf(EMPTY, tickets, since)
  expect(review).toEqual([
    { title: '03: Emails', ticked: 1, boxes: 3 },
    { title: '02: Payment', ticked: 3, boxes: 3 },
    { title: '04: Docs', ticked: 0, boxes: 0 },
  ])
  // A ticket with no time held went active just now.
  expect(working).toEqual([
    { title: '01: Cart', ticked: 2, boxes: 4, since: 100 },
    { title: '06: Tax', ticked: 0, boxes: 0, since: null },
  ])
  expect(needsYou).toEqual([])
  expect(reviewed).toBe(0)
})

test('when each active ticket went active is kept; one no longer active is dropped', () => {
  const cart = { set: CART.set, title: '01: Cart' }
  const tax = { set: 'docs/tasks', title: 'Tax' }
  const held = activeSince({}, [cart], 100)
  expect(held).toEqual({ [keyOf(cart)]: 100 })
  const later = activeSince(held, [cart, tax], 500)
  expect(later).toEqual({ [keyOf(cart)]: 100, [keyOf(tax)]: 500 })
  expect(activeSince(later, [tax], 900)).toEqual({ [keyOf(tax)]: 500 })
  expect(readSince({ a: 1, b: 'x', c: null })).toEqual({ a: 1 })
  expect(readSince('junk')).toEqual({})
  expect(readSince([3])).toEqual({})
})

test('the evidence beside a ticket is its ticked boxes, never a verdict', () => {
  expect(reviewLine({ title: 'x', ticked: 7, boxes: 7 })).toEqual({ glyph: '✓', text: 'agent says done · 7/7' })
  expect(reviewLine({ title: 'x', ticked: 3, boxes: 6 })).toEqual({ glyph: '◐', text: 'agent says done · 3/6 ticked' })
  expect(reviewLine({ title: 'x', ticked: 0, boxes: 0 })).toEqual({ glyph: '✓', text: 'agent says done' })
  expect(workingLine({ title: 'x', ticked: 2, boxes: 6, since: 0 }, 12 * 60_000)).toBe('2/6 ticked · active 12m')
  expect(workingLine({ title: 'x', ticked: 0, boxes: 0, since: null }, 5)).toBe('active <1m')
  for (const line of [reviewLine({ title: 'x', ticked: 7, boxes: 7 }).text, workingLine({ title: 'x', ticked: 7, boxes: 7, since: 0 }, 1)]) {
    expect(line).not.toMatch(/verified/i)
  }
})

test('how long, in the largest whole unit', () => {
  expect(ago(0)).toBe('<1m')
  expect(ago(59_999)).toBe('<1m')
  expect(ago(60_000)).toBe('1m')
  expect(ago(59 * 60_000)).toBe('59m')
  expect(ago(60 * 60_000)).toBe('1h')
  expect(ago(23 * 3_600_000 + 59 * 60_000)).toBe('23h')
  expect(ago(24 * 3_600_000)).toBe('1d')
  expect(ago(-5)).toBe('<1m')
})

test("a ticket's title in the inbox keeps its number, without the colon", () => {
  expect(inboxTitle('08: Payment retries')).toBe('08 Payment retries')
  expect(inboxTitle('#12. Checkout')).toBe('12 Checkout')
  expect(inboxTitle('Checkout')).toBe('Checkout')
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
