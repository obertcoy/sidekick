// The inbox: what the summary after each turn writes, kept per project in the mod's store.
// Each item has a kind, the ticket it belongs to or none, a short line for the pane and a long explanation for its detail.
// The pane draws the inbox in sections: NEEDS YOU from the items, READY TO REVIEW and WORKING from the ticket files.

import type { Asking, Checked, InboxView } from '../types'
import type { Ticket } from './tickets'
import { boxesIn, jsonIn } from './tickets'

export const ITEM_KINDS = ['needs-you', 'blocked', 'changed-direction', 'note'] as const
export type ItemKind = (typeof ITEM_KINDS)[number]

/** A ticket as the inbox names it: its set and its title. The same title in another set is another ticket. */
export type TicketRef = { set: string; title: string }

export type Item = {
  id: number
  kind: ItemKind
  ticket: TicketRef | null
  /** A line that fits a narrow pane; stored whole, and cut only when drawn. */
  short: string
  long: string
  /** When the summary wrote it, in milliseconds since the epoch. */
  at: number
  /** Sidekick's display state only; Claude Code never reads it. */
  isReviewed: boolean
  /** Why it closed by itself, when a later turn's summary closed it: "you said: …" or "unblocked: …". */
  receipt?: string
}

/** Oldest item first; `next` is the id the next item gets. */
export type Inbox = { items: Item[]; next: number }

/** An item as the model's reply gives it, before the inbox numbers and times it. */
export type Draft = Pick<Item, 'kind' | 'ticket' | 'short' | 'long'>

/** How many notes a ticket's history keeps, the newest. */
export const HISTORY_LINES = 5

const EMPTY: Inbox = { items: [], next: 1 }

const isKind = (value: unknown): value is ItemKind => ITEM_KINDS.includes(value as ItemKind)

const text = (value: unknown): string => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '')

const isSame = (a: TicketRef | null, b: TicketRef | null): boolean => a?.set === b?.set && a?.title === b?.title

/** The ticket a reply names by its number in the list the prompt gave (from 1), or none. */
const ticketAt = (value: unknown, tickets: readonly TicketRef[]): TicketRef | null => {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^\s*\d+\s*$/.test(value) ? Number(value) : Number.NaN

  return Number.isInteger(number) ? (tickets[number - 1] ?? null) : null
}

/**
 * Reads the model's reply to a turn: the items it writes, [] when the turn moved nothing, or undefined when the
 * reply cannot be read. A reply that cannot be read is not an answer of no items.
 */
export const parseItems = (reply: string, tickets: readonly TicketRef[]): Draft[] | undefined => {
  const found = jsonIn(reply)
  if (found === undefined || !Array.isArray(found.items)) return undefined
  const drafts = found.items.flatMap((raw: unknown): Draft[] => {
    if (typeof raw !== 'object' || raw === null) return []
    const one = raw as Record<string, unknown>
    const short = text(one.short)
    if (!isKind(one.kind) || short === '') return []

    return [{ kind: one.kind, ticket: ticketAt(one.ticket, tickets), short, long: text(one.long) }]
  })

  return found.items.length > 0 && drafts.length === 0 ? undefined : drafts
}

/** Adds the drafts as new items at `at`; a ticket's notes (or the notes of no ticket) keep only the newest `HISTORY_LINES`. */
export const addItems = (inbox: Inbox, drafts: readonly Draft[], at: number): Inbox => {
  const added = drafts.map((draft, index): Item => ({ ...draft, id: inbox.next + index, at, isReviewed: false }))
  const all = [...inbox.items, ...added]
  const items = all.filter(
    (item, index) =>
      item.kind !== 'note' || all.slice(index + 1).filter(later => later.kind === 'note' && isSame(later.ticket, item.ticket)).length < HISTORY_LINES,
  )

  return { items, next: inbox.next + added.length }
}

/** The items a later turn can close by itself: open questions and blockers. A change of direction is news to read, closed only by hand. */
export const closableOf = (inbox: Inbox): Item[] => inbox.items.filter(item => (item.kind === 'needs-you' || item.kind === 'blocked') && !item.isReviewed)

/** An item a turn closed, by id: for a question what the developer said, for a blocker what unblocked it. */
export type Closed = { id: number; said: string }

/**
 * Reads which open items the model's reply says the turn closed (its `closed` list); an id that is not open now, a
 * change of direction or an item already reviewed, is left out, as is the same id twice. Nothing readable: none.
 */
export const parseClosed = (reply: string, inbox: Inbox): Closed[] => {
  const found = jsonIn(reply)
  if (found === undefined || !Array.isArray(found.closed)) return []
  const open = closableOf(inbox).map(item => item.id)
  const closed: Closed[] = []
  for (const raw of found.closed as unknown[]) {
    if (typeof raw !== 'object' || raw === null) continue
    const one = raw as Record<string, unknown>
    const id = typeof one.id === 'number' ? one.id : typeof one.id === 'string' && /^\s*\d+\s*$/.test(one.id) ? Number(one.id) : Number.NaN
    const said = text(one.said)
    if (said !== '' && open.includes(id) && !closed.some(already => already.id === id)) closed.push({ id, said })
  }

  return closed
}

/** Moves the closed items to REVIEWED, each with its receipt; only open questions and blockers move. */
export const closeItems = (inbox: Inbox, closed: readonly Closed[]): Inbox => {
  const open = closableOf(inbox)

  return {
    ...inbox,
    items: inbox.items.map(item => {
      const one = closed.find(close => close.id === item.id)
      if (one === undefined || !open.includes(item)) return item

      return { ...item, isReviewed: true, receipt: `${item.kind === 'blocked' ? 'unblocked' : 'you said'}: ${one.said}` }
    }),
  }
}

/** A ticket's history (or that of no ticket): its notes, newest first. */
export const historyOf = (inbox: Inbox, ticket: TicketRef | null): Item[] =>
  inbox.items.filter(item => item.kind === 'note' && isSame(item.ticket, ticket)).reverse()

/** Drops the items of tickets that are in no set any more, and the reviewed items of no ticket. */
export const tidy = (inbox: Inbox, live: readonly TicketRef[]): Inbox => ({
  ...inbox,
  items: inbox.items.filter(item => (item.ticket === null ? !item.isReviewed : live.some(ticket => isSame(ticket, item.ticket)))),
})

/** A ticket of the active set as its file says, named as the inbox names it. */
export type FileTicket = TicketRef & Omit<Ticket, 'title'>

/** When the mod first saw each ticket active, by `keyOf` the ticket, in milliseconds since the epoch. */
export type Since = Record<string, number>

/** NEEDS YOU, in this order of kinds. */
const ASKING: readonly Asking['kind'][] = ['needs-you', 'blocked', 'changed-direction']

const isAsking = (kind: ItemKind): kind is Asking['kind'] => ASKING.includes(kind as Asking['kind'])

/** One key per ticket, for the store; a title in another set is another ticket. */
export const keyOf = (ticket: TicketRef): string => `${ticket.set}\n${ticket.title}`

const checkedOf = ({ title, ticked, boxes }: FileTicket): Checked => ({ title, ticked, boxes })

/**
 * The inbox's sections. NEEDS YOU: the open questions, blockers and changes of direction, those of no ticket first,
 * then by kind, newest first. READY TO REVIEW: the tickets done in their files, those with boxes unticked first.
 * Tickets the developer marked reviewed leave READY TO REVIEW. WORKING: the tickets active in their files.
 * REVIEWED: how many items and tickets were reviewed (a note is history, never one).
 */
export const sectionsOf = (inbox: Inbox, tickets: readonly FileTicket[], since: Since, reviewed: Reviewed = []): InboxView => {
  const open = inbox.items.filter((item): item is Item & { kind: Asking['kind'] } => isAsking(item.kind) && !item.isReviewed)
  const needsYou = open
    .sort((a, b) => Number(a.ticket !== null) - Number(b.ticket !== null) || ASKING.indexOf(a.kind) - ASKING.indexOf(b.kind) || b.id - a.id)
    .map(item => ({ id: item.id, kind: item.kind, ticket: item.ticket?.title ?? null, short: item.short }))
  const isReviewed = (ticket: FileTicket): boolean => reviewed.includes(keyOf(ticket))
  const done = tickets.filter(ticket => ticket.isDone && !isReviewed(ticket))
  const isShort = (ticket: FileTicket): boolean => ticket.ticked < ticket.boxes

  return {
    needsYou,
    review: [...done.filter(isShort), ...done.filter(ticket => !isShort(ticket))].map(checkedOf),
    working: tickets.filter(ticket => ticket.isActive).map(ticket => ({ ...checkedOf(ticket), since: since[keyOf(ticket)] ?? null })),
    reviewed: inbox.items.filter(item => item.isReviewed && item.kind !== 'note').length + tickets.filter(ticket => ticket.isDone && isReviewed(ticket)).length,
  }
}

/** When each active ticket went active: the time held for one seen before, `now` for one seen the first time; a ticket no longer active is dropped. */
export const activeSince = (held: Since, active: readonly TicketRef[], now: number): Since =>
  Object.fromEntries(active.map(ticket => [keyOf(ticket), held[keyOf(ticket)] ?? now]))

/** The times the store holds; anything unreadable is left out. */
export const readSince = (stored: unknown): Since =>
  typeof stored !== 'object' || stored === null || Array.isArray(stored)
    ? {}
    : Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, number] => typeof entry[1] === 'number'))

/** How long, in the largest whole unit: `<1m`, `12m`, `3h`, `2d`. */
export const ago = (ms: number): string => {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)

  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`
}

/** A ticket ready to review: what its file says beside the evidence, its ticked boxes. Never a verdict. */
export const reviewLine = (ticket: Checked): { glyph: '✓' | '◐'; text: string } => {
  if (ticket.boxes === 0) return { glyph: '✓', text: 'agent says done' }
  if (ticket.ticked === ticket.boxes) return { glyph: '✓', text: `agent says done · ${ticket.ticked}/${ticket.boxes}` }

  return { glyph: '◐', text: `agent says done · ${ticket.ticked}/${ticket.boxes} ticked` }
}

/** A working ticket: its ticked boxes and how long it has been active at `now`. */
export const workingLine = (ticket: InboxView['working'][number], now: number): string =>
  [ticket.boxes === 0 ? '' : `${ticket.ticked}/${ticket.boxes} ticked`, `active ${ago(now - (ticket.since ?? now))}`].filter(part => part !== '').join(' · ')

const counted = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`

/** The WORKING heading: the active tickets, then the subagents running now, each only while there are any. */
export const workingHeading = (tickets: number, agents: number): string =>
  ['WORKING', tickets > 0 ? counted(tickets, 'ticket') : '', agents > 0 ? counted(agents, 'agent') : ''].filter(part => part !== '').join(' · ')

/** A ticket's title as the inbox shows it: its number kept, without the colon ("08: Payment" is "08 Payment"). */
export const inboxTitle = (title: string): string => title.replace(/^#?(\d+)\s*[:.)-]\s+/, '$1 ')

/**
 * A ticket's goal: the first paragraph of its file after the title, on one line, without emphasis; null when it has
 * none. Front matter, headings, checkboxes and a status line are not a goal.
 */
export const goalOf = (file: string): string | null => {
  const lines = file.split(/\r?\n/)
  const body = lines[0]?.trim() === '---' ? lines.slice(lines.findIndex((line, at) => at > 0 && line.trim() === '---') + 1) : lines
  const paragraphs = body
    .join('\n')
    .split(/\n\s*\n/)
    .map(block => block.split('\n').filter(line => line.trim() !== '' && !/^\s*#/.test(line)))
  const goal = paragraphs.find(
    block => block.length > 0 && !/^\s*[-*+]\s+\[.\]/.test(block[0] ?? '') && !(block.length === 1 && /^[\s>*_-]*status[*_]*\s*:/i.test(block[0] ?? '')),
  )

  return goal === undefined ? null : text(goal.join(' ').replace(/\*\*|__/g, ''))
}

/** Which entry of the inbox a detail shows: an item by its id, or a ticket of the active set. */
export type Opened = { item: number } | { ticket: TicketRef }

/** What the detail view shows for one entry. */
export type Detail = {
  /** The ticket's title as the inbox shows it, or the short line of an item with no ticket. */
  title: string
  /** An item's short line under its ticket's title; null when it is the title, or for a ticket's own detail. */
  short: string | null
  /** The ticket's first paragraph, read from its file when the detail opens; null for no ticket or no file. */
  goal: string | null
  long: string
  /** The ticket's history, newest first. */
  happened: string[]
  /** The ticked boxes' text, and how many boxes the file has. */
  ticked: string[]
  boxes: number
  /** Whether Mark reviewed is offered: an open item, or a ticket done in its file and not yet reviewed (the caller says). */
  isReviewable: boolean
}

/** What happened on a ticket, its newest `HISTORY_LINES`, newest first: its notes, and its items a later turn closed with their receipts. */
const happenedOf = (inbox: Inbox, ticket: TicketRef): string[] =>
  inbox.items
    .filter(item => isSame(item.ticket, ticket) && (item.kind === 'note' || item.receipt !== undefined))
    .reverse()
    .slice(0, HISTORY_LINES)
    .map(item => (item.kind === 'note' ? item.short : `${item.short} · ${item.receipt}`))

/** Reviewed tickets, by `keyOf`; Sidekick's display state only, never written to a ticket file. */
export type Reviewed = readonly string[]

/**
 * The detail of an entry, with `file` the text of its ticket's file when it has one; undefined when the item is gone.
 * A ticket's own detail is explained by its newest note that explains anything.
 */
export const detailOf = (inbox: Inbox, opened: Opened, file: string | undefined): Detail | undefined => {
  const item = 'item' in opened ? inbox.items.find(one => one.id === opened.item) : undefined
  if ('item' in opened && item === undefined) return undefined
  const ticket = 'ticket' in opened ? opened.ticket : (item?.ticket ?? null)
  const history = ticket === null ? [] : historyOf(inbox, ticket)
  const boxes = ticket === null || file === undefined ? [] : boxesIn(file)

  return {
    title: ticket === null ? (item?.short ?? '') : inboxTitle(ticket.title),
    short: ticket === null ? null : (item?.short ?? null),
    goal: ticket === null || file === undefined ? null : goalOf(file),
    long: item?.long ?? history.find(one => one.long !== '')?.long ?? '',
    happened: ticket === null ? [] : happenedOf(inbox, ticket),
    ticked: boxes.filter(box => box.isTicked).map(box => box.text),
    boxes: boxes.length,
    isReviewable: item === undefined || !item.isReviewed,
  }
}

/**
 * Marks an entry reviewed: an item of a ticket is kept as reviewed, an item of no ticket is deleted (it has nothing
 * left to show), and a ticket is remembered by its key.
 */
export const markReviewed = (held: { inbox: Inbox; reviewed: Reviewed }, opened: Opened): { inbox: Inbox; reviewed: Reviewed } => {
  if ('ticket' in opened) {
    const key = keyOf(opened.ticket)

    return { ...held, reviewed: held.reviewed.includes(key) ? held.reviewed : [...held.reviewed, key] }
  }
  const items = held.inbox.items.flatMap(item => (item.id !== opened.item ? [item] : item.ticket === null ? [] : [{ ...item, isReviewed: true }]))

  return { ...held, inbox: { ...held.inbox, items } }
}

// Replying from the inbox: a question is tagged in the prompt box, and the message sent carries it as hidden context.

/** The tag a question gets in the prompt box: its ticket as the inbox shows it, or its short line when it has no ticket. */
export const tagOf = (
  item: { id?: number; ticket: string | null; short: string },
  open: readonly { id?: number; ticket: string | null; short: string }[] = [],
): string => {
  const base = item.ticket === null ? item.short : inboxTitle(item.ticket)
  const sameBase = (one: { ticket: string | null; short: string }): boolean => (one.ticket === null ? one.short : inboxTitle(one.ticket)) === base
  // With more than one open question on the ticket, the item's number tells them apart.
  const isShared = item.id !== undefined && open.some(one => one.id !== item.id && sameBase(one))

  return `${base}${isShared ? ` #${item.id}` : ''}: `
}

/** The open questions, blockers and changes of direction: what NEEDS YOU lists. */
export const askedOf = (inbox: Inbox): { id: number; ticket: string | null; short: string }[] =>
  inbox.items.filter(item => isAsking(item.kind) && !item.isReviewed).map(item => ({ id: item.id, ticket: item.ticket?.title ?? null, short: item.short }))

/** Whether the draft holds the tag at the start of a line. */
export const hasTag = (draft: string, tag: string): boolean => draft.split('\n').some(line => line.startsWith(tag.trimEnd()))

/** What to add after the draft to tag it: the tag on a line of its own, after a newline unless the draft is empty or ends with one. */
export const tagAddition = (draft: string, tag: string): string => (draft === '' || draft.endsWith('\n') ? tag : `\n${tag}`)

/** The draft without the tag's line when nothing is typed after the tag; the draft as it was otherwise. */
export const withoutEmptyTag = (draft: string, tag: string): string => {
  const lines = draft.split('\n')
  const at = lines.findIndex(line => line.trimEnd() === tag.trimEnd())
  if (at === -1) return draft
  lines.splice(at, 1)

  return lines.join('\n')
}

/** What Claude is told, out of sight, about a tagged question: which it is, and its whole explanation. */
export const contextOf = (item: Pick<Item, 'ticket' | 'short' | 'long'>, tag = tagOf({ ticket: item.ticket?.title ?? null, short: item.short })): string =>
  [
    `The developer's message answers a question of yours, tagged "${tag.trimEnd()}" in the message; their answer follows the tag.`,
    `Question: ${item.short}`,
    ...(item.long === '' ? [] : [`Explanation: ${item.long}`]),
  ].join('\n')

/** The reviewed tickets still done in their files; one that is not done any more is forgotten, so it comes back to review once done again. */
export const tidyReviewed = (reviewed: Reviewed, tickets: readonly FileTicket[]): string[] =>
  reviewed.filter(key => tickets.some(ticket => ticket.isDone && keyOf(ticket) === key))

/** The reviewed tickets the store holds; anything unreadable is left out. */
export const readReviewed = (stored: unknown): string[] => (Array.isArray(stored) ? stored.filter((one): one is string => typeof one === 'string') : [])

const readRef = (value: unknown): TicketRef | null | undefined => {
  if (value === null) return null
  if (typeof value !== 'object' || value === undefined) return undefined
  const { set, title } = value as Record<string, unknown>

  return typeof set === 'string' && typeof title === 'string' ? { set, title } : undefined
}

const readItem = (value: unknown): Item[] => {
  if (typeof value !== 'object' || value === null) return []
  const one = value as Record<string, unknown>
  const ticket = readRef(one.ticket)
  if (typeof one.id !== 'number' || !isKind(one.kind) || ticket === undefined || typeof one.short !== 'string') return []

  return [
    {
      id: one.id,
      kind: one.kind,
      ticket,
      short: one.short,
      long: typeof one.long === 'string' ? one.long : '',
      at: typeof one.at === 'number' ? one.at : 0,
      isReviewed: one.isReviewed === true,
      ...(typeof one.receipt === 'string' ? { receipt: one.receipt } : {}),
    },
  ]
}

/** The inbox the store holds; anything unreadable reads as empty, and an unreadable item is left out. */
export const readInbox = (stored: unknown): Inbox => {
  if (typeof stored !== 'object' || stored === null) return EMPTY
  const { items, next } = stored as Record<string, unknown>
  const read = Array.isArray(items) ? items.flatMap(readItem) : []
  const after = Math.max(0, ...read.map(item => item.id)) + 1

  return { items: read, next: typeof next === 'number' && next >= after ? next : after }
}

/** The line cut to `width` characters with `…` as its last when it is longer. */
export const fit = (line: string, width: number): string => {
  const chars = [...line]

  return chars.length <= width ? line : `${chars.slice(0, Math.max(0, width - 1)).join('')}…`
}
