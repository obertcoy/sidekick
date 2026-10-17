// The inbox: what the summary after each turn writes, kept per project in the mod's store.
// Each item has a kind, the ticket it belongs to or none, a short line for the pane and a long explanation for its detail.
// The pane draws the inbox in sections: NEEDS YOU from the items, READY TO REVIEW and WORKING from the ticket files.

import type { Asking, Checked, InboxView } from '../types'
import type { Ticket } from './tickets'
import { jsonIn } from './tickets'

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
 * WORKING: the tickets active in their files. REVIEWED: how many items were reviewed (a note is history, never one).
 */
export const sectionsOf = (inbox: Inbox, tickets: readonly FileTicket[], since: Since): InboxView => {
  const open = inbox.items.filter((item): item is Item & { kind: Asking['kind'] } => isAsking(item.kind) && !item.isReviewed)
  const needsYou = open
    .sort((a, b) => Number(a.ticket !== null) - Number(b.ticket !== null) || ASKING.indexOf(a.kind) - ASKING.indexOf(b.kind) || b.id - a.id)
    .map(item => ({ kind: item.kind, ticket: item.ticket?.title ?? null, short: item.short }))
  const done = tickets.filter(ticket => ticket.isDone)
  const isShort = (ticket: FileTicket): boolean => ticket.ticked < ticket.boxes

  return {
    needsYou,
    review: [...done.filter(isShort), ...done.filter(ticket => !isShort(ticket))].map(checkedOf),
    working: tickets.filter(ticket => ticket.isActive).map(ticket => ({ ...checkedOf(ticket), since: since[keyOf(ticket)] ?? null })),
    reviewed: inbox.items.filter(item => item.isReviewed && item.kind !== 'note').length,
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

/** A ticket's title as the inbox shows it: its number kept, without the colon ("08: Payment" is "08 Payment"). */
export const inboxTitle = (title: string): string => title.replace(/^#?(\d+)\s*[:.)-]\s+/, '$1 ')

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
