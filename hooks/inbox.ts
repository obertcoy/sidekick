// The inbox: what the summary after each turn writes, kept per project in the mod's store.
// Each item has a kind, the ticket it belongs to or none, a short line for the pane and a long explanation for its detail.

import type { Summary } from '../types'
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

/** The current summary as the pane draws it until the inbox has its own: the newest news, and the newest open question. */
export const summaryOf = (inbox: Inbox): Summary | null => {
  if (inbox.items.length === 0) return null
  const newest = [...inbox.items].reverse()

  return {
    happened: newest.find(item => item.kind !== 'needs-you')?.short ?? '',
    next: '',
    needsYou: newest.find(item => item.kind === 'needs-you' && !item.isReviewed)?.short ?? '',
  }
}

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
