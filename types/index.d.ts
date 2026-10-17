/** A NEEDS YOU line of the inbox: a question, a blocker or a change of direction, with its ticket's title or none. */
export type Asking = {
  /** The inbox item's id, which its detail opens by. */
  id: number
  kind: 'needs-you' | 'blocked' | 'changed-direction'
  ticket: string | null
  short: string
}

/** A ticket in the inbox with its checkboxes, `ticked` of `boxes` (0 of 0 when it has none). */
export type Checked = {
  title: string
  ticked: number
  boxes: number
}

/** The inbox as the pane draws it, each section in its order; an empty one is not drawn. */
export type InboxView = {
  needsYou: Asking[]
  /** Tickets done in their files and not yet reviewed. */
  review: Checked[]
  /** Tickets active in their files, with when the mod first saw each active (null: just now). */
  working: (Checked & { since: number | null })[]
  /** How many items, and tickets of the set, have been reviewed. */
  reviewed: number
}

export type TicketRow = {
  title: string
  state: 'done' | 'active' | 'open'
}

export type Progress = {
  done: number
  total: number
  next: string | null
  source: string
  rows: TicketRow[]
}

export type SetEntry = {
  id: string
  label: string
  done: number
  total: number
}

export type View = {
  project: string
  isSearching: boolean
  inbox: InboxView
  progress: Progress | null
  /** Every ticket set, most recently changed first, and the id of the session's active one ('' when none is). */
  sets: SetEntry[]
  current: string
  /** True while the set picker shows: a new session, a /clear or a rescan, until a pick, a touch or the end of the next turn. */
  isChoosing: boolean
}

declare module 'claude-code' {
  interface PluginState {
    sidekick: { view: View }
  }
}
