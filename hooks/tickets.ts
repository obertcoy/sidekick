import type { Progress, Summary } from '../types'

export type Recipe =
  | { kind: 'none' }
  | { kind: 'checklist'; glob: string }
  | {
      kind: 'files'
      glob: string
      statusLabel: string | null
      doneValues: string[]
      activeValues: string[]
    }

export type Ticket = { title: string; isDone: boolean; isActive: boolean }

export type FileInfo = { path: string; mtimeMs: number }

export type TicketSet = { id: string; files: FileInfo[]; mtimeMs: number }

const DONE_VALUES = ['done', 'closed', 'resolved', 'complete', 'completed', 'merged', 'shipped']
const ACTIVE_VALUES = ['in-progress', 'in progress', 'claimed', 'doing', 'wip', 'started', 'active']
const CHECKBOX = /^\s*[-*+]\s+\[(.)\]\s*(.*)$/

export const normalize = (path: string): string =>
  path.replace(/\\/g, '/').replace(/\/+$/, '')

export const toRelative = (root: string, path: string): string | undefined => {
  const base = normalize(root)
  const full = normalize(path)
  if (!/^([A-Za-z]:)?\//.test(full)) return full.replace(/^\.\//, '')
  if (!full.toLowerCase().startsWith(`${base.toLowerCase()}/`)) return undefined

  return full.slice(base.length + 1)
}

export const globToRegExp = (glob: string): RegExp => {
  const source = glob
    .split(/(\*\*\/|\*\*|\*)/)
    .map(part => {
      if (part === '**/') return '(?:.*/)?'
      if (part === '**') return '.*'
      if (part === '*') return '[^/]*'

      return part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('')

  return new RegExp(`^${source}$`, 'i')
}

/** The folder a glob's matches all sit under, and how deep below it they go. */
export const globReach = (glob: string): { dir: string; depth: number } => {
  const parts = glob.split('/')
  const wild = parts.findIndex(part => part.includes('*'))
  const fixed = wild < 0 ? parts.length - 1 : wild
  const rest = parts.slice(fixed)

  return {
    dir: parts.slice(0, fixed).join('/'),
    depth: rest.some(part => part.includes('**')) ? 6 : rest.length,
  }
}

/** The folder paths a hint names: its words with a slash, cleaned to plain root-relative segments. */
export const hintPaths = (root: string, hint: string): string[] => {
  const found = hint
    .split(/\s+/)
    .filter(word => word.includes('/'))
    .flatMap(word => {
      const bare = word.replace(/^["'`@]+/, '').replace(/["'`,;]+$/, '')
      const relative = toRelative(root, bare)
      if (relative === undefined) return []
      const path = relative
        .split('/')
        .filter(part => part !== '' && part !== '.' && part !== '..' && !part.includes(':'))
        .join('/')

      return path === '' ? [] : [path]
    })

  return [...new Set(found)]
}

/** Whether the folder ends with the path's segments, ignoring case and a leading dot ("scratch" is ".scratch"). */
export const endsWithPath = (folder: string, path: string): boolean => {
  const plain = (value: string): string[] =>
    value.split('/').filter(part => part !== '').map(part => part.replace(/^\./, '').toLowerCase())
  const have = plain(folder)
  const want = plain(path)
  if (want.length === 0 || want.length > have.length) return false

  return want.every((part, index) => part === have[have.length - want.length + index])
}

const words = (value: unknown, fallback: string[]): string[] => {
  const given = Array.isArray(value)
    ? value.filter((one): one is string => typeof one === 'string')
    : []

  return [...new Set([...given, ...fallback].map(one => one.trim().toLowerCase()))]
    .filter(one => one !== '' && one.length <= 40)
    .slice(0, 24)
}

const jsonIn = (text: string): Record<string, unknown> | undefined => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1))

    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

const isSafeGlob = (glob: unknown): glob is string =>
  typeof glob === 'string' &&
  glob !== '' &&
  glob.length <= 200 &&
  !glob.startsWith('/') &&
  !glob.includes(':') &&
  !glob.includes('\\') &&
  !glob.split('/').includes('..')

/** Reads the model's reply to a search; anything that doesn't fit the fixed fields is no recipe. */
export const parseRecipe = (text: string): Recipe | undefined => {
  const found = jsonIn(text)
  if (found === undefined) return undefined
  if (found.kind === 'none') return { kind: 'none' }
  if (!isSafeGlob(found.glob)) return undefined
  if (found.kind === 'checklist') return { kind: 'checklist', glob: found.glob }
  if (found.kind !== 'files') return undefined
  const label = typeof found.statusLabel === 'string' ? found.statusLabel.trim() : ''

  return {
    kind: 'files',
    glob: found.glob,
    statusLabel: label !== '' && label.length <= 40 ? label : null,
    doneValues: words(found.doneValues, DONE_VALUES),
    activeValues: words(found.activeValues, ACTIVE_VALUES),
  }
}

const clip = (value: unknown): string =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 240) : ''

/** Reads the model's reply to a turn: a new summary, or undefined to keep the old one. */
export const parseSummary = (text: string): Summary | undefined => {
  const found = jsonIn(text)
  if (found === undefined || found.change !== true) return undefined
  const summary = {
    happened: clip(found.happened),
    next: clip(found.next),
    needsYou: clip(found.needsYou),
  }

  return summary.happened === '' && summary.next === '' ? undefined : summary
}

const statusOf = (lines: string[], label: string): string | undefined => {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^[\\s>*_-]*${escaped}[*_]*\\s*:[*_]*\\s*(.+?)[*_\\s]*$`, 'i')
  for (const line of lines.slice(0, 40)) {
    const value = pattern.exec(line)?.[1]
    if (value !== undefined) return value.replace(/["'`]/g, '').trim().toLowerCase()
  }

  return undefined
}

const titleOf = (name: string, lines: string[]): string => {
  for (const line of lines.slice(0, 40)) {
    const heading = /^#\s+(.+?)\s*$/.exec(line)?.[1] ?? /^title\s*:\s*(.+?)\s*$/i.exec(line)?.[1]
    if (heading !== undefined) return heading.replace(/^["']|["']$/g, '')
  }

  return name.replace(/\.[^.]+$/, '')
}

/** One ticket per file: the status line decides when the format has one, else the checkboxes. */
export const parseTicketFile = (
  name: string,
  text: string,
  recipe: Extract<Recipe, { kind: 'files' }>,
): Ticket => {
  const lines = text.split(/\r?\n/)
  const title = titleOf(name, lines)
  const status = recipe.statusLabel === null ? undefined : statusOf(lines, recipe.statusLabel)
  if (status !== undefined) {
    const isDone = recipe.doneValues.includes(status)

    return { title, isDone, isActive: !isDone && recipe.activeValues.includes(status) }
  }
  const boxes = lines.flatMap(line => CHECKBOX.exec(line)?.[1] ?? [])
  const ticked = boxes.filter(box => box.toLowerCase() === 'x').length

  return { title, isDone: boxes.length > 0 && ticked === boxes.length, isActive: false }
}

/** One ticket per checklist line. */
export const parseChecklist = (text: string): Ticket[] =>
  text.split(/\r?\n/).flatMap(line => {
    const found = CHECKBOX.exec(line)
    const title = found?.[2]?.trim() ?? ''
    if (found === null || title === '') return []
    const mark = (found[1] ?? ' ').toLowerCase()

    return [{ title, isDone: mark === 'x', isActive: mark === '~' || mark === '/' || mark === '-' }]
  })

export const setIdOf = (recipe: Recipe, path: string): string | undefined => {
  if (recipe.kind === 'none' || !globToRegExp(recipe.glob).test(path)) return undefined
  if (recipe.kind === 'checklist') return path
  const cut = path.lastIndexOf('/')

  return cut < 0 ? '.' : path.slice(0, cut)
}

export const groupSets = (recipe: Recipe, files: FileInfo[]): TicketSet[] => {
  const sets = new Map<string, TicketSet>()
  for (const file of files) {
    const id = setIdOf(recipe, file.path)
    if (id === undefined) continue
    const set = sets.get(id) ?? { id, files: [], mtimeMs: 0 }
    set.files.push(file)
    set.mtimeMs = Math.max(set.mtimeMs, file.mtimeMs)
    sets.set(id, set)
  }
  for (const set of sets.values()) {
    set.files.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
  }

  return [...sets.values()]
}

/** The set the session touched, else the most recently changed one. */
export const pickSet = (sets: TicketSet[], touched: string | undefined): TicketSet | undefined =>
  sets.find(set => set.id === touched) ??
  [...sets].sort((a, b) => b.mtimeMs - a.mtimeMs)[0]

export const progressOf = (tickets: Ticket[], source: string): Progress => {
  const open = tickets.filter(ticket => !ticket.isDone)

  return {
    done: tickets.length - open.length,
    total: tickets.length,
    next: (open.find(ticket => ticket.isActive) ?? open[0])?.title ?? null,
    source,
    rows: tickets.slice(0, 300).map(ticket => ({
      title: ticket.title,
      state: ticket.isDone ? 'done' : ticket.isActive ? 'active' : 'open',
    })),
  }
}

/** A title without the number its file order already shows ("01: Cart" is "Cart"). */
export const shortTitle = (title: string): string =>
  title.replace(/^#?\d+\s*[:.)-]\s+/, '') || title

/** The stretch of a list that fits `room` rows, kept around the row at `focus`. */
export const windowOf = (
  length: number,
  focus: number,
  room: number,
): { start: number; end: number } => {
  if (length <= room) return { start: 0, end: length }
  const start = Math.max(0, Math.min(focus - 1, length - room))

  return { start, end: start + room }
}
