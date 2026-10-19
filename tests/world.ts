import type { On, SessionMessage, TurnCompleteInput, TurnCompleteResult } from 'claude-code'
import type { TestBody, TestOptions } from 'claude-code/testing'
import { test as harnessTest } from 'claude-code/testing'
import { viewIn } from '../hooks/sprite'
import { foxkit } from '../hooks/sprite/characters/foxkit'
import { render, stageFor, type View } from '../hooks/sprite/compose'
import type { Animation, Layers, Place } from '../hooks/sprite/types'

/**
 * How long one whole-mod test may run. The harness stops a test at 5000 ms. Each of these tests loads the
 * whole mod, and `claude plugin test` runs a file per process side by side, so on a busy machine (another
 * test run, a VM) a test that needs 0.1-1 s alone can wait several seconds for a turn on the processor.
 * The limit is only there to catch a test that hangs, so it is raised here, once, for every test file (each imports `test` from here, not from the harness).
 */
export const TEST_TIMEOUT_MS = 30_000

/** `test` of the harness with the limit above; a test that sets its own `timeoutMs` keeps it. */
export const test = (name: string, ...rest: readonly [body: TestBody] | readonly [options: TestOptions, body: TestBody]): void => {
  const [options, body] = rest.length === 1 ? [{}, rest[0]] : rest
  harnessTest(name, { ...options, timeoutMs: options.timeoutMs ?? TEST_TIMEOUT_MS }, body)
}

/**
 * A store that holds the motion setting off. Whole-mod tests that read what the sidekick painted over a stretch of mock time at rest
 * start from it, so an ambient animation cannot land in the middle of what they are about; tests/ambient.test.ts covers motion on.
 */
export const QUIET = { motion: false }

/**
 * A store that opens the pane on its Tickets tab, in every project the whole-mod tests stand in. Tests that read the
 * ticket list start from it; tests/tabs.test.ts covers the tabs, and the Inbox the pane opens on when nothing is saved.
 */
export const ON_TICKETS: Readonly<Record<string, unknown>> = Object.fromEntries(
  ['/work/shop', 'C:/work/shop', '/work/npd', '/work/notes'].map(root => [`tab:${root}`, 'tickets']),
)

// The world beneath the mod in the whole-mod tests: a project on disk, the small model and the session.

export type Entry = { name: string; kind: 'file' | 'dir'; mtimeMs?: number }

export type Reply =
  | { isAnswered: true; text: string; usage: typeof USAGE }
  | { isAnswered: false; reason: 'api-error'; status: number | null; error: 'overloaded'; usage: typeof USAGE }

const USAGE = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

export const answered = (text: string): Reply => ({ isAnswered: true, text, usage: USAGE })

export const failed: Reply = { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: USAGE }

export const RECIPE = '{"kind":"files","glob":".scratch/*/issues/*.md","statusLabel":"Status","doneValues":["done"],"activeValues":["in-progress"]}'

// The engine hands a hook the path as this machine spells it (D:\work\shop on Windows). A POSIX
// host running a Windows-rooted test resolves the drive path under its own working folder
// (/here/C:/work/shop), so everything before the drive is dropped too.
export const posix = (path: string): string => path.replace(/^.*?[A-Za-z]:(?=[\\/])/, '').replace(/\\/g, '/')

export const ticket = (title: string, status: string): string => `# ${title}\n\n**Status:** ${status}\n\n- [ ] a step\n`

export type World = {
  /** The project root the session reports; a test can move it to stand in another project. */
  root: string
  /** The session id the engine reports; a test sets another to stand in a /clear or a new session. */
  sessionId: string
  /** How the engine answers the end of a turn. */
  endTurn: (e: TurnCompleteInput) => TurnCompleteResult
  /** Set to make every ask for the project root fail. */
  isRootGone: boolean
  /** Folder listings, by POSIX path from the drive's root ('/work/shop/.scratch'). */
  tree: Record<string, Entry[]>
  /** File contents, by the same paths. */
  files: Record<string, string>
  /** Paths whose read fails, as a file does while it is being written. */
  unreadable: string[]
  /** Every prompt the small model was sent. */
  asked: string[]
  /** The system prompt of each of those calls, in the same order. */
  told: string[]
  /** Every path the mod listed or read. */
  touched: string[]
  /** How the small model answers the next call. */
  answer: (prompt: string) => Reply | Promise<Reply>
  /** What the session holds for the latest turn. */
  messages: SessionMessage[]
  /** The name of every command the mod registered, in order. */
  registered: string[]
  /** Every pane the mod opened, with whether it asked for the keyboard. */
  opened: { id: string; focus?: true }[]
  /** The key of every Raster the mod repainted with `$.ui.blit`, in order. */
  blits: string[]
  /** The cells of every one of those repaints, in order: what the sidekick looked like each time. */
  painted: string[]
  /** Whether the sidekick's pane is the one shown (true) or a tab behind another pane (false); the engine answers `$.ui.panes()` with it. */
  isShown: boolean
  /** Whether the person has given the sidekick's pane the keyboard; it has no bearing on whether the pane is shown. */
  hasKeyboard: boolean
  /** Every toast the mod popped, in order. */
  toasts: { text: string; timeoutMs?: number }[]
  /** The prompt box's draft; a test types by adding to it, and `$.prompt.fill` writes it. */
  draft: string
  /** Set to stand in a dialog holding the keys (or a headless run): the box takes nothing. */
  isPromptHeld: boolean
  /** Every prompt that reached the bottom of `prompt.submit`, with the context the hooks attached. */
  submitted: { text: string; context: readonly string[] | undefined }[]
}

/** Stands beneath the mod as a project at `root` (spelled as the host spells it). */
export const world = (on: On, root: string, tree: Record<string, Entry[]> = {}): World => {
  const w: World = {
    root,
    sessionId: 's1',
    isRootGone: false,
    endTurn: e => ({ text: e.answer }),
    tree,
    files: {},
    unreadable: [],
    asked: [],
    told: [],
    touched: [],
    answer: () => answered('{"kind":"none"}'),
    messages: [
      { role: 'user', text: 'Build the cart.', toolUses: [] },
      { role: 'assistant', text: 'Built it.', toolUses: [] },
    ],
    registered: [],
    opened: [],
    blits: [],
    painted: [],
    isShown: true,
    hasKeyboard: false,
    toasts: [],
    draft: '',
    isPromptHeld: false,
    submitted: [],
  }
  on('session.root', () => {
    if (w.isRootGone) throw new Error('the session has no root')

    return { value: w.root }
  })
  on('session.id', () => ({ value: w.sessionId }))
  on('command.register', (_, e) => {
    w.registered.push(e.name)

    return { value: { command: e.name } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.list', (_, e) => {
    w.touched.push(posix(e.path))

    return {
      value: (w.tree[posix(e.path)] ?? []).map(entry => ({
        name: entry.name,
        kind: entry.kind,
        size: 1,
        mtimeMs: entry.mtimeMs ?? 5,
        isLink: false,
      })),
    }
  })
  on('fs.read', (_, e) => {
    w.touched.push(posix(e.path))
    if (w.unreadable.includes(posix(e.path))) throw new Error('the file is being written')

    return { value: w.files[posix(e.path)] ?? '' }
  })
  on('model.complete', async (_, e) => {
    w.asked.push(e.prompt)
    w.told.push(e.system ?? '')

    return { value: await w.answer(e.prompt) }
  })
  on('session.messages', () => ({ value: w.messages }))
  on('turn.complete', (_, e) => w.endTurn(e))
  on('ui.toast', (_, e) => {
    w.toasts.push({ text: e.text, timeoutMs: e.timeoutMs })

    return { value: undefined }
  })
  on('prompt.read', () => ({ value: { text: w.draft, cursor: w.draft.length } }))
  on('prompt.fill', (_, e) => {
    if (w.isPromptHeld) return { isFilled: false, refusal: 'dialog', text: w.draft, cursor: w.draft.length }
    w.draft = e.mode === 'replace' ? e.text : `${w.draft}${e.text}`

    return { isFilled: true, text: w.draft, cursor: w.draft.length }
  })
  on('prompt.submit', (_, e) => {
    w.submitted.push({ text: e.text, context: e.context })

    return { text: e.text, context: e.context }
  })
  on('ui.log', () => ({ value: undefined }))
  on('ui.open', (_, e) => {
    w.opened.push({ id: e.id, focus: e.focus })

    return { value: { isPlaced: true } }
  })
  on('ui.panes', () => ({
    value: [{ id: 'sidekick', title: 'Sidekick', isShown: w.isShown, isFocused: w.hasKeyboard, isPlaced: true }],
  }))
  on('ui.blit', (_, e) => {
    w.blits.push(e.key)
    w.painted.push('cells' in e ? e.cells : '')

    return { value: {} }
  })

  return w
}

/** Lays out tickets as files in `<root>/.scratch/<set>/issues/`, each at `mtimeMs`. */
export const addSet = (w: World, root: string, set: string, tickets: Record<string, string>, mtimeMs: number): void => {
  const scratch = `${root}/.scratch`
  w.tree[root] = [...(w.tree[root] ?? []).filter(one => one.name !== '.scratch'), { name: '.scratch', kind: 'dir' }]
  w.tree[scratch] = [...(w.tree[scratch] ?? []).filter(one => one.name !== set), { name: set, kind: 'dir' }]
  w.tree[`${scratch}/${set}`] = [{ name: 'issues', kind: 'dir' }]
  w.tree[`${scratch}/${set}/issues`] = Object.keys(tickets).map(name => ({ name, kind: 'file', mtimeMs }))
  // Files of tickets dropped from a set stay in `w.files`; that is harmless, since the mod reads only the paths the `tree` lists.
  for (const [name, text] of Object.entries(tickets)) w.files[`${scratch}/${set}/issues/${name}`] = text
}

type Mounted = { find: (query: { key: string }) => Promise<unknown> }
type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[] }

/**
 * The lines of the element keyed `key` as painted, top to bottom, its rules left out: each outermost Text is one line,
 * a Button is a line of its label, and a row of them side by side is one line, its parts a space apart.
 */
export const linesIn = async (ui: Mounted, key: string): Promise<string[]> => {
  const lines: string[] = []
  // A child is a string or an element as drawn, its own children inside.
  const textOf = (node: unknown): string => {
    if (typeof node === 'string') return node
    if (typeof node !== 'object' || node === null) return ''
    const one = node as Node
    if (one.type === 'Button') return String(one.props?.label ?? '')
    const parts = (one.children ?? []).map(textOf)

    return one.type === 'Box' ? parts.filter(part => part !== '').join(' ') : parts.join('')
  }
  const walk = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return
    const one = node as Node
    if (one.type === 'Text' || one.type === 'Button' || (one.type === 'Box' && one.props?.flexDirection === 'row')) {
      lines.push(textOf(one))

      return
    }
    for (const child of one.children ?? []) walk(child)
  }
  walk(await ui.find({ key }))

  return lines.filter(line => !/^─+$/.test(line))
}

export const PANE = {
  plugin: 'sidekick',
  component: 'Pane',
  requestId: 'sidekick',
  props: {
    title: 'Sidekick',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

/** The size of the pane body the whole-mod tests mount at, as the sprite is given it; it is also the size the sprite assumes before a pane has rendered. */
export const PANE_SIZE = { columns: PANE.props.bodyColumns, rows: PANE.props.scroll.bodyRows } as const

/** A frame as the pane paints it: `render` through the camera the pane has. The whole-mod tests compare what was painted with it. */
export const paneRender = (layers: Layers, animation: Animation, step: number, backgroundFrame?: number, place?: Place): string =>
  render(layers, animation, step, backgroundFrame, viewIn(PANE_SIZE, layers, place), place)

/** The part of a whole-stage foxkit frame (a golden one) that a view looks at: the cells of the frame, cut to the view. */
export const cropped = (cells: string | undefined, view: View = viewIn(PANE_SIZE)): string => {
  if (cells === undefined) throw new Error('no such golden frame')
  const { columns } = stageFor(foxkit)
  const words = new Uint32Array(Uint8Array.from(atob(cells), letter => letter.charCodeAt(0)).buffer)
  const out = new Uint32Array(view.columns * view.rows * 3)
  for (let row = 0; row < view.rows; row++) {
    for (let column = 0; column < view.columns; column++) {
      const from = ((view.top / 2 + row) * columns + view.left + column) * 3
      out.set(words.subarray(from, from + 3), (row * view.columns + column) * 3)
    }
  }

  return btoa(String.fromCharCode(...new Uint8Array(out.buffer)))
}

export const RUN = {
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 160 },
} as const

export const SURFACES = ['terminal', 'desktop'] as const

/** The set picker's buttons in a mounted pane, the tabs' and the inbox rows' left out. */
export const setButtons = async <T extends { key?: unknown }>(ui: { findAll: (query: { type: 'Button' }) => Promise<T[]> }): Promise<T[]> =>
  (await ui.findAll({ type: 'Button' })).filter(one => String(one.key).startsWith('set-'))

/** The pane's refresh, which waits through every session; it is not the sidekick moving. */
export const REFRESH_MS = 20_000

/**
 * Hand `counting(on).on` to `mock.clock` in place of `on`, and `running()` says how many `clock.every` and
 * `clock.after` waits are in flight now, those of `ignored` lengths left out. A timer the mod cancels is not counted.
 */
export const counting = (
  on: On,
  ignored: readonly number[] = [REFRESH_MS],
): {
  on: On
  running: () => number
  /** How many one-time waits (`clock.after`) are in flight now: the sidekick's gaps between ambient animations. */
  gaps: () => number
  /** The length in milliseconds of every one-time wait the mod started, in order. */
  gapLengths: number[]
} => {
  let waits = 0
  let pendingGaps = 0
  const gapLengths: number[] = []
  const hooked = (event: string, ...rest: unknown[]): unknown => {
    const hook = rest[rest.length - 1] as (...args: unknown[]) => unknown
    if (event === 'clock.every' || event === 'clock.after') {
      rest[rest.length - 1] = async (...args: unknown[]) => {
        const { ms } = args[1] as { ms: number }
        const isCounted = !ignored.includes(ms)
        const isGap = event === 'clock.after'
        if (isCounted) waits += 1
        if (isGap) {
          pendingGaps += 1
          gapLengths.push(ms)
        }
        try {
          return await hook(...args)
        } finally {
          if (isCounted) waits -= 1
          if (isGap) pendingGaps -= 1
        }
      }
    }

    return (on as unknown as (...args: unknown[]) => unknown)(event, ...rest)
  }

  return { on: hooked as unknown as On, running: () => waits, gaps: () => pendingGaps, gapLengths }
}

/**
 * Answers `$.store` as `mock.store` does, and hands the test what it holds, so a test can read what the mod stored.
 * Each value is copied in and out, as the engine's store keeps no reference to what it was given.
 */
export const openStore = (on: On, entries: Readonly<Record<string, unknown>> = {}): Map<string, unknown> => {
  const copy = (value: unknown): unknown => (value === undefined ? undefined : structuredClone(value))
  const held = new Map(Object.entries(entries).map(([key, value]) => [key, copy(value)]))
  on('store.get', (_, e) => ({ value: copy(held.get(e.key)) }))
  on('store.set', (_, e) => {
    held.set(e.key, copy(e.value))

    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    held.delete(e.key)

    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...held.keys()] }))

  return held
}
