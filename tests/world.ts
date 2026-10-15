import type { On, SessionMessage, TurnCompleteInput, TurnCompleteResult } from 'claude-code'

// The world beneath the mod in the whole-mod tests: a project on disk, the small model and the session.

export type Entry = { name: string; kind: 'file' | 'dir'; mtimeMs?: number }

export type Reply =
  | { isAnswered: true; text: string; usage: typeof USAGE }
  | { isAnswered: false; reason: 'api-error'; status: number | null; error: 'overloaded'; usage: typeof USAGE }

const USAGE = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

export const answered = (text: string): Reply => ({ isAnswered: true, text, usage: USAGE })

export const failed: Reply = { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: USAGE }

export const RECIPE =
  '{"kind":"files","glob":".scratch/*/issues/*.md","statusLabel":"Status","doneValues":["done"],"activeValues":["in-progress"]}'

// The engine hands a hook the path as this machine spells it (D:\work\shop on Windows). A POSIX
// host running a Windows-rooted test resolves the drive path under its own working folder
// (/here/C:/work/shop), so everything before the drive is dropped too.
export const posix = (path: string): string =>
  path.replace(/^.*?[A-Za-z]:(?=[\\/])/, '').replace(/\\/g, '/')

export const ticket = (title: string, status: string): string =>
  `# ${title}\n\n**Status:** ${status}\n\n- [ ] a step\n`

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
  /** Every prompt the small model was sent. */
  asked: string[]
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
    asked: [],
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

    return { value: w.files[posix(e.path)] ?? '' }
  })
  on('model.complete', async (_, e) => {
    w.asked.push(e.prompt)

    return { value: await w.answer(e.prompt) }
  })
  on('session.messages', () => ({ value: w.messages }))
  on('turn.complete', (_, e) => w.endTurn(e))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.open', (_, e) => {
    w.opened.push({ id: e.id, focus: e.focus })

    return { value: { isPlaced: true } }
  })
  on('ui.blit', (_, e) => {
    w.blits.push(e.key)
    w.painted.push('cells' in e ? e.cells : '')

    return { value: {} }
  })

  return w
}

/** Lays out tickets as files in `<root>/.scratch/<set>/issues/`, each at `mtimeMs`. */
export const addSet = (
  w: World,
  root: string,
  set: string,
  tickets: Record<string, string>,
  mtimeMs: number,
): void => {
  const scratch = `${root}/.scratch`
  w.tree[root] = [
    ...(w.tree[root] ?? []).filter(one => one.name !== '.scratch'),
    { name: '.scratch', kind: 'dir' },
  ]
  w.tree[scratch] = [...(w.tree[scratch] ?? []).filter(one => one.name !== set), { name: set, kind: 'dir' }]
  w.tree[`${scratch}/${set}`] = [{ name: 'issues', kind: 'dir' }]
  w.tree[`${scratch}/${set}/issues`] = Object.keys(tickets).map(name => ({ name, kind: 'file', mtimeMs }))
  for (const [name, text] of Object.entries(tickets)) w.files[`${scratch}/${set}/issues/${name}`] = text
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

export const RUN = {
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 160 },
} as const

export const SURFACES = ['terminal', 'desktop'] as const

/** The pane's refresh, which waits through every session; it is not the sidekick moving. */
export const REFRESH_MS = 20_000

/**
 * Hand `counting(on).on` to `mock.clock` in place of `on`, and `running()` says how many `clock.every` and
 * `clock.after` waits are in flight now, those of `ignored` lengths left out. A timer the mod cancels is not counted.
 */
export const counting = (on: On, ignored: readonly number[] = [REFRESH_MS]): { on: On; running: () => number } => {
  let waits = 0
  const hooked = (event: string, ...rest: unknown[]): unknown => {
    const hook = rest[rest.length - 1] as (...args: unknown[]) => unknown
    if (event === 'clock.every' || event === 'clock.after') {
      rest[rest.length - 1] = async (...args: unknown[]) => {
        const { ms } = args[1] as { ms: number }
        const isCounted = !ignored.includes(ms)
        if (isCounted) waits += 1
        try {
          return await hook(...args)
        } finally {
          if (isCounted) waits -= 1
        }
      }
    }

    return (on as unknown as (...args: unknown[]) => unknown)(event, ...rest)
  }

  return { on: hooked as unknown as On, running: () => waits }
}
