import type { Progress } from '../types'

/** One place tickets are kept, and how to read them there. */
export type Place =
  | { kind: 'checklist'; glob: string }
  | {
      kind: 'files'
      glob: string
      statusLabel: string | null
      doneValues: string[]
      activeValues: string[]
    }

/** A project's saved places; empty once searched and nothing found. */
export type Recipe = { places: Place[] }

/** A ticket as its file says: done, in progress or neither, and its checkboxes (`ticked` of `boxes`; a checklist line has none). */
export type Ticket = { title: string; isDone: boolean; isActive: boolean; ticked: number; boxes: number }

export type FileInfo = { path: string; mtimeMs: number }

export type TicketSet = { id: string; files: FileInfo[]; mtimeMs: number; place: Place }

const DONE_VALUES = ['done', 'closed', 'resolved', 'complete', 'completed', 'merged', 'shipped']
const ACTIVE_VALUES = ['in-progress', 'in progress', 'claimed', 'doing', 'wip', 'started', 'active']
const CHECKBOX = /^\s*[-*+]\s+\[(.)\]\s*(.*)$/

export const normalize = (path: string): string => path.replace(/\\/g, '/').replace(/\/+$/, '')

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
    value
      .split('/')
      .filter(part => part !== '')
      .map(part => part.replace(/^\./, '').toLowerCase())
  const have = plain(folder)
  const want = plain(path)
  if (want.length === 0 || want.length > have.length) return false

  return want.every((part, index) => part === have[have.length - want.length + index])
}

const words = (value: unknown, fallback: string[]): string[] => {
  const given = Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string') : []

  return [...new Set([...given, ...fallback].map(one => one.trim().toLowerCase()))].filter(one => one !== '' && one.length <= 40).slice(0, 24)
}

/** The first JSON object in a model's reply, or undefined when there is none that parses. */
export const jsonIn = (text: string): Record<string, unknown> | undefined => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1))

    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined
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

/** Reads the model's reply to a search: a place to add, 'none', or undefined when it does not fit the fixed fields. */
export const parsePlace = (text: string): Place | 'none' | undefined => {
  const found = jsonIn(text)
  if (found === undefined) return undefined
  if (found.kind === 'none') return 'none'
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

/** Reads a stored recipe. An old single place is wrapped as one; an old `none` is no places. */
export const readRecipe = (stored: unknown): Recipe | undefined => {
  if (typeof stored !== 'object' || stored === null) return undefined
  const given = (stored as { places?: unknown }).places
  if (Array.isArray(given)) {
    const places = given.flatMap(one => {
      const place = parsePlace(JSON.stringify(one))

      return place === undefined || place === 'none' ? [] : [place]
    })

    return { places }
  }
  const place = parsePlace(JSON.stringify(stored))
  if (place === undefined) return undefined

  return { places: place === 'none' ? [] : [place] }
}

/** The recipe with the place added; a place with the same glob is replaced in its spot. */
export const addPlace = (recipe: Recipe, place: Place): Recipe => {
  const at = recipe.places.findIndex(one => one.glob === place.glob)
  if (at < 0) return { places: [...recipe.places, place] }

  return { places: recipe.places.map((one, index) => (index === at ? place : one)) }
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

const NEGATIONS = new Set(['not', 'no', 'never', 'isnt', 'un'])

// Lowercase words only: emoji, markdown, dashes and underscores all become one space.
const wordsOf = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')

/** True when a value stands in the status as whole words and no negation sits right before it. */
const hasValue = (status: string, values: string[]): boolean => {
  const words = wordsOf(status)

  return values.some(value => {
    const wanted = wordsOf(value)

    return words.some((_, at) => wanted.every((word, step) => words[at + step] === word) && !NEGATIONS.has(words[at - 1] ?? ''))
  })
}

/** One ticket per file: the status line decides when the format has one, else the checkboxes. */
export const parseTicketFile = (name: string, text: string, recipe: Extract<Place, { kind: 'files' }>): Ticket => {
  const lines = text.split(/\r?\n/)
  const title = titleOf(name, lines)
  const status = recipe.statusLabel === null ? undefined : statusOf(lines, recipe.statusLabel)
  // The boxes are counted whatever decides the state: the inbox shows them as evidence beside it.
  const marks = lines.flatMap(line => CHECKBOX.exec(line)?.[1] ?? [])
  const ticked = marks.filter(box => box.toLowerCase() === 'x').length
  const boxes = marks.length
  // A status that names neither state is no answer: the checkboxes decide.
  if (status !== undefined) {
    const isDone = hasValue(status, recipe.doneValues)
    const isActive = !isDone && hasValue(status, recipe.activeValues)
    if (isDone || isActive) return { title, isDone, isActive, ticked, boxes }
  }

  return { title, isDone: boxes > 0 && ticked === boxes, isActive: false, ticked, boxes }
}

/** One checkbox of a ticket file: its text and whether it is ticked. */
export type Checkbox = { text: string; isTicked: boolean }

/** A ticket file's checkboxes in file order. */
export const boxesIn = (text: string): Checkbox[] =>
  text.split(/\r?\n/).flatMap(line => {
    const found = CHECKBOX.exec(line)

    return found === null ? [] : [{ text: (found[2] ?? '').trim(), isTicked: found[1]?.toLowerCase() === 'x' }]
  })

/** One ticket per checklist line. */
export const parseChecklist = (text: string): Ticket[] =>
  text.split(/\r?\n/).flatMap(line => {
    const found = CHECKBOX.exec(line)
    const title = found?.[2]?.trim() ?? ''
    if (found === null || title === '') return []
    const mark = (found[1] ?? ' ').toLowerCase()

    return [{ title, isDone: mark === 'x', isActive: mark === '~' || mark === '/' || mark === '-', ticked: 0, boxes: 0 }]
  })

/** The id of the set a path belongs to in the first place that reads it, or undefined. */
export const setIdOf = (recipe: Recipe, path: string): string | undefined => {
  const place = recipe.places.find(one => globToRegExp(one.glob).test(path))
  if (place === undefined) return undefined
  if (place.kind === 'checklist') return path
  const cut = path.lastIndexOf('/')

  return cut < 0 ? '.' : path.slice(0, cut)
}

/** Sets across all places. A set id is taken by the first place that reads it, so ids stay unique. */
export const groupSets = (recipe: Recipe, files: FileInfo[]): TicketSet[] => {
  const sets = new Map<string, TicketSet>()
  for (const place of recipe.places) {
    const matches = globToRegExp(place.glob)
    for (const file of files) {
      if (!matches.test(file.path)) continue
      const id = setIdOf({ places: [place] }, file.path) ?? file.path
      const set = sets.get(id) ?? { id, files: [], mtimeMs: 0, place }
      if (set.place !== place) continue
      set.files.push(file)
      set.mtimeMs = Math.max(set.mtimeMs, file.mtimeMs)
      sets.set(id, set)
    }
  }
  for (const set of sets.values()) {
    set.files.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
  }

  return [...sets.values()]
}

/** The one set a prompt names by its label or id, ignoring case and -, _ and spaces; none when it names no set or several. */
export const namedIn = (sets: TicketSet[], text: string): TicketSet | undefined => {
  const flat = (value: string): string =>
    value
      .toLowerCase()
      .replace(/[-_\s]+/g, ' ')
      .trim()
  const prompt = flat(text)
  const hits = sets.filter(set =>
    [labelOf(set.id), set.id].some(name => {
      const want = flat(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

      return want !== '' && new RegExp(`(?<![\\p{L}\\p{N}])${want}(?![\\p{L}\\p{N}])`, 'u').test(prompt)
    }),
  )

  return hits.length === 1 ? hits[0] : undefined
}

/** Sets in the order the pane and /sidekick-pick number them: most recently changed first. */
export const orderSets = (sets: TicketSet[]): TicketSet[] => [...sets].sort((a, b) => b.mtimeMs - a.mtimeMs || a.id.localeCompare(b.id))

/** A short name for a set: ".scratch/search/issues" is "search". */
export const labelOf = (id: string): string => {
  const parts = id.split('/').filter(part => part !== '')
  if (parts[0] === '.scratch' && parts.length > 1) parts.shift()
  if (parts.length > 1 && /^(issues|tickets|tasks)$/i.test(parts[parts.length - 1] ?? '')) parts.pop()

  return parts.slice(-2).join('/') || id
}

/** The set a pick names: a 1-based number, an id, a label, or a part of an id that only one set has. */
export const findSet = (sets: TicketSet[], query: string): TicketSet | 'none' | 'many' => {
  const wanted = query.trim().toLowerCase()
  if (wanted === '') return 'none'
  if (/^\d+$/.test(wanted)) return sets[Number(wanted) - 1] ?? 'none'
  const exact = sets.filter(set => set.id.toLowerCase() === wanted || labelOf(set.id).toLowerCase() === wanted)
  if (exact.length > 1) return 'many'
  if (exact[0] !== undefined) return exact[0]
  const part = sets.filter(set => set.id.toLowerCase().includes(wanted))
  if (part.length > 1) return 'many'

  return part[0] ?? 'none'
}

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

/**
 * Whether the last open ticket of a set was just started: at the refresh before (`was`) a ticket was open, and now (`now`, the same set) it is active and every other ticket is done.
 * Read from the ticket files' state alone, so it is true once, at the refresh that sees it: a set of one ticket has no "last" and never counts, and a set whose rows are cut short (more than the list keeps) is not judged.
 */
export const isLastStarted = (was: Progress, now: Progress): boolean => {
  if (now.total < 2 || now.rows.length !== now.total) return false
  const open = now.rows.filter(row => row.state !== 'done')
  const [last] = open
  if (open.length !== 1 || last === undefined || last.state !== 'active') return false

  return was.rows.some(row => row.title === last.title && row.state === 'open')
}

/** A title without the number its file order already shows ("01: Cart" is "Cart"). */
export const shortTitle = (title: string): string => title.replace(/^#?\d+\s*[:.)-]\s+/, '') || title

/** The stretch of a list that fits `room` rows, kept around the row at `focus`. */
export const windowOf = (length: number, focus: number, room: number): { start: number; end: number } => {
  if (length <= room) return { start: 0, end: length }
  const start = Math.max(0, Math.min(focus - 1, length - room))

  return { start, end: start + room }
}
