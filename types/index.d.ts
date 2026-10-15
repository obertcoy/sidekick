export type Summary = {
  happened: string
  next: string
  needsYou: string
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
  summary: Summary | null
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
