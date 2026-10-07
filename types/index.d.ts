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

export type View = {
  project: string
  isSearching: boolean
  summary: Summary | null
  progress: Progress | null
}

declare module 'claude-code' {
  interface PluginState {
    'project-pane': { view: View }
  }
}
