import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Summary, View } from '../types'
import { changeLook, lookReport, parseSaved, targetOf } from './look'
import type { Target } from './look'
import { SPRITE, cellsOf, frameCount, leftOut, msPerFrame } from './sprite'
import type { Mode } from './sprite'
import { projectRoot, setCurrentRoot, setProjectLook, setSavedLook } from './sprite/registry'
import type { SavedLook } from './sprite/types'
import {
  endsWithPath,
  globReach,
  globToRegExp,
  groupSets,
  hintPaths,
  normalize,
  parseChecklist,
  parseRecipe,
  parseSummary,
  parseTicketFile,
  pickSet,
  progressOf,
  setIdOf,
  shortTitle,
  toRelative,
  windowOf,
} from './tickets'
import type { FileInfo, Recipe, Ticket } from './tickets'

const PANE = 'sidekick'
const LOOK = 'look'
const BUDDY = 'buddy'
const REFRESH_MS = 20_000
const SKIPPED = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'target', 'vendor', '.next',
  '.venv', 'venv', '__pycache__', '.idea', '.vscode', 'coverage', '.claude-plugin',
  '.pytest_cache', '.ruff_cache', '.mypy_cache', '.tox', '.cache',
])
const isSkipped = (name: string): boolean => SKIPPED.has(name) || name.startsWith('.tmp')
const LISTED = /(\.(md|mdx|markdown|txt|org|ya?ml|json|toml)|^[^.]+)$/i
const LIKELY = /issue|ticket|task|todo|backlog|plan|roadmap|scratch|stor(y|ies)|spec|kanban|board/i
const GLYPH = { done: '✓', active: '◐', open: '○' } as const
const FILE_TOOLS = new Set(['Read', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

const SEARCH_RULES = `You find where a software project keeps its tickets (units of planned work) as local files.
You get a file listing and the start of some files. Answer with one JSON object and nothing else.

- Tickets are one file each: {"kind":"files","glob":"<path pattern>","statusLabel":"<label>" or null,"doneValues":[...],"activeValues":[...]}
  glob is relative to the project root with forward slashes; * matches within one folder name, ** across folders.
  Example: ".scratch/*/issues/*.md". Match only ticket files, not specs, maps or readmes.
  statusLabel is the word before the colon on the line that holds a ticket's status ("Status" for "**Status:** done"); null when tickets have no such line.
  doneValues are the status values that mean finished; activeValues the ones that mean being worked on.
- Tickets are lines of a checklist ("- [ ] thing"): {"kind":"checklist","glob":"<path pattern of the checklist file or files>"}
- No tickets, or a layout that fits neither: {"kind":"none"}

Documentation, changelogs and notes are not tickets.`

const SUMMARY_RULES = `You keep a three-line status of a software project for its developer.
You get the current status and what happened in the latest turn of their coding session.
Change the status only when the turn decided something, finished or started a piece of work, or changed what the developer must do next. A question answered, a file read, or small talk changes nothing.
Answer with one JSON object and nothing else:
{"change":false}
or {"change":true,"happened":"<what was done or decided, one short sentence>","next":"<the next step, one short sentence>","needsYou":"<what the developer must do or decide, or empty>"}`

const view = atom({ plugin: 'sidekick', key: 'view' } as const, {
  project: '',
  isSearching: false,
  summary: null,
  progress: null,
} satisfies View as View)

let isSearching = false
const parsed = new Map<string, { mtimeMs: number; tickets: Ticket[] }>()

type Dollar = EngineInterface

// The character in the pane's corner: it writes while a turn runs and zaps when a ticket is done.
let mode: Mode = 'idle'
let resting: Mode = 'idle'
let frame = 0
let ticker: Timer | undefined

const paint = ($: Dollar): void => {
  void $.ui
    .blit({ requestId: PANE, key: BUDDY, cells: cellsOf(mode, frame) })
    .catch(() => undefined)
}

const animate = ($: Dollar, next: Mode): void => {
  if (next !== 'zap') resting = next
  // A zap plays to its end; what was asked meanwhile is where it rests after.
  if (mode === 'zap' && next !== 'zap' && ticker !== undefined) return
  ticker?.cancel()
  ticker = undefined
  mode = next
  frame = 0
  paint($)
  if (mode === 'idle') return
  ticker = $.clock.every(msPerFrame(mode), () => {
    frame += 1
    if (mode === 'zap' && frame >= frameCount('zap')) {
      ticker?.cancel()
      ticker = undefined
      animate($, resting)

      return
    }
    paint($)
  })
}

// The strike: when tickets finish, the critter zaps and a bolt lands on their rows, which flash and
// have the strike-through burn across them before they settle as done. One step per zap frame.
type Was = 'active' | 'open'
type Strike = { rows: Map<string, Was>; step: number }
const STRIKE_MS = msPerFrame('zap')
const BOLT = '↯'
// Steps: 0-1 the critter charges (the row still shows what it was), 2 the bolt leaves the critter,
// 3 it lands on the row's glyph, 4 the row flashes as done, 5-10 the strike-through burns, 11-12 rest.
const LEAVES = 2
const LANDS = 3
const HITS = 4
const BURNS = 5
const BURN_STEPS = 6
const STRIKE_STEPS = 13
let strike: Strike | undefined
let striker: Timer | undefined
const waiting: Map<string, Was>[] = []

const play = ($: Dollar, rows: Map<string, Was>): void => {
  striker?.cancel()
  strike = { rows, step: 0 }
  animate($, 'zap')
  $.ui.invalidate('ui.render')
  striker = $.clock.every(STRIKE_MS, () => {
    if (strike === undefined) return
    strike.step += 1
    if (strike.step < STRIKE_STEPS) {
      $.ui.invalidate('ui.render')

      return
    }
    striker?.cancel()
    striker = undefined
    strike = undefined
    const queued = waiting.shift()
    if (queued === undefined) $.ui.invalidate('ui.render')
    else play($, queued)
  })
}

/** Strikes the rows that just finished, after any strike already under way. */
const strikeRows = ($: Dollar, rows: Map<string, Was>): void => {
  if (strike === undefined) {
    play($, rows)

    return
  }
  // A burst of finishes waits as one batch behind the strike on show, never as a long queue.
  const last = waiting.at(-1)
  if (last === undefined) waiting.push(rows)
  else for (const [title, was] of rows) last.set(title, was)
}

const rootOf = async ($: Dollar): Promise<string> => {
  const root = normalize(await $.session.root())
  // Whatever asks for the root also tells the sprite which project it is drawing for.
  setCurrentRoot(root)

  return root
}

const recipeOf = async ($: Dollar, root: string): Promise<Recipe | undefined> =>
  parseRecipe(JSON.stringify((await $.store.get(`recipe:${root}`)) ?? null))

const walk = async (
  $: Dollar,
  root: string,
  dir: string,
  depth: number,
  cap: number,
  found: FileInfo[] = [],
  deeper = 0,
): Promise<FileInfo[]> => {
  if (found.length >= cap) return found
  const listed = await $.fs.list(dir === '' ? root : `${root}/${dir}`).catch(() => [])
  const pathOf = (name: string): string => (dir === '' ? name : `${dir}/${name}`)
  // Folders that look like ticket homes come first, so the cap spends itself elsewhere.
  const isLikelyDir = (entry: (typeof listed)[number]): boolean =>
    entry.kind === 'dir' && LIKELY.test(pathOf(entry.name))
  const entries = [...listed].sort((a, b) => Number(isLikelyDir(b)) - Number(isLikelyDir(a)))
  for (const entry of entries) {
    if (found.length >= cap) break
    const path = pathOf(entry.name)
    if (entry.kind === 'file') found.push({ path, mtimeMs: entry.mtimeMs })
    // Past the plain depth, only folders that look like ticket homes are followed, down to ten levels.
    const isEntered = depth > 1 || (deeper > 1 && LIKELY.test(path))
    if (entry.kind === 'dir' && isEntered && !isSkipped(entry.name)) {
      await walk($, root, path, depth - 1, cap, found, deeper - 1)
    }
  }

  return found
}

const FOLDER_LIMIT = 3000

/** The folder a hint points at, root-relative, or undefined when none of its paths is on disk. */
const resolveHint = async ($: Dollar, root: string, hint: string): Promise<string | undefined> => {
  const wanted = hintPaths(root, hint)
  for (const path of wanted) {
    if ((await $.fs.list(`${root}/${path}`).catch(() => [])).length > 0) return path
  }
  if (wanted.length === 0) return undefined
  // Level by level, so the nearest match wins; among equals the folder changed last.
  let level = ['']
  let seen = 0
  for (let depth = 0; depth < 10 && level.length > 0 && seen < FOLDER_LIMIT; depth += 1) {
    const children: { path: string; mtimeMs: number }[] = []
    for (const dir of level) {
      const entries = await $.fs.list(dir === '' ? root : `${root}/${dir}`).catch(() => [])
      for (const entry of entries) {
        if (entry.kind !== 'dir' || isSkipped(entry.name)) continue
        children.push({ path: dir === '' ? entry.name : `${dir}/${entry.name}`, mtimeMs: entry.mtimeMs })
      }
      seen += entries.length
    }
    for (const path of wanted) {
      const matches = children.filter(child => endsWithPath(child.path, path))
      const newest = matches.sort((a, b) => b.mtimeMs - a.mtimeMs)[0]
      if (newest !== undefined) return newest.path
    }
    level = children.map(child => child.path)
  }

  return undefined
}

/** Folders that look like ticket homes, found by folder names alone so file counts cannot hide them. */
const homesOf = async ($: Dollar, root: string): Promise<string[]> => {
  const homes: string[] = []
  let level = ['']
  let seen = 0
  for (let depth = 0; depth < 10 && level.length > 0 && seen < FOLDER_LIMIT; depth += 1) {
    const next: string[] = []
    for (const dir of level) {
      const entries = await $.fs.list(dir === '' ? root : `${root}/${dir}`).catch(() => [])
      seen += entries.length
      for (const entry of entries) {
        if (entry.kind !== 'dir' || isSkipped(entry.name)) continue
        const path = dir === '' ? entry.name : `${dir}/${entry.name}`
        // A home is taken whole; its own walk goes below it.
        if (LIKELY.test(path)) homes.push(path)
        else next.push(path)
      }
    }
    level = next
  }

  return homes
}

const filesOf = async ($: Dollar, root: string, recipe: Recipe): Promise<FileInfo[]> => {
  if (recipe.kind === 'none') return []
  const { dir, depth } = globReach(recipe.glob)
  const matches = globToRegExp(recipe.glob)

  return (await walk($, root, dir, depth, 3000)).filter(file => matches.test(file.path))
}

const ticketsOf = async ($: Dollar, root: string, recipe: Recipe, file: FileInfo): Promise<Ticket[]> => {
  const key = `${root}/${file.path}`
  const held = parsed.get(key)
  if (held !== undefined && held.mtimeMs === file.mtimeMs) return held.tickets
  const text = await $.fs.read(key).catch(() => '')
  const name = file.path.slice(file.path.lastIndexOf('/') + 1)
  const tickets =
    recipe.kind === 'files' ? [parseTicketFile(name, text, recipe)] : parseChecklist(text)
  parsed.set(key, { mtimeMs: file.mtimeMs, tickets })

  return tickets
}

const head = (text: string, lines: number, chars: number): string =>
  text.split(/\r?\n/).slice(0, lines).join('\n').slice(0, chars)

/** The one-time look at a project that produces its recipe. */
const search = async ($: Dollar, root: string, hint: string): Promise<Recipe> => {
  const isListed = (file: FileInfo): boolean => LISTED.test(file.path.slice(file.path.lastIndexOf('/') + 1))
  const at = await resolveHint($, root, hint)
  const pointed = at === undefined ? [] : (await walk($, root, at, 4, 600, [], 4)).filter(isListed)
  // Paths in a folder that looks like a ticket home go first, so the cut at 600 keeps them.
  const rank = (file: FileInfo): number => {
    const dir = file.path.slice(0, Math.max(0, file.path.lastIndexOf('/')))

    return LIKELY.test(dir) ? 0 : LIKELY.test(file.path) ? 1 : 2
  }
  // Without a hint, the likely folders are walked on their own: a project full of files must not use up the cap first.
  const broad = async (): Promise<FileInfo[]> => {
    const near: FileInfo[] = []
    for (const home of await homesOf($, root)) await walk($, root, home, 4, 600, near, 4)
    const all = [...near, ...(await walk($, root, '', 5, 2000, [], 10))]

    return all.filter((file, at) => isListed(file) && all.findIndex(one => one.path === file.path) === at)
  }
  const listing =
    pointed.length > 0 ? pointed : (await broad()).sort((a, b) => rank(a) - rank(b))
  if (listing.length === 0) {
    await $.store.set(`recipe:${root}`, { kind: 'none' })

    return { kind: 'none' }
  }
  const samples = listing
    .filter(file => LIKELY.test(file.path) || hint !== '')
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, 8)
  const shown = await Promise.all(
    samples.map(async file => {
      const text = await $.fs.read(`${root}/${file.path}`).catch(() => '')

      return `--- ${file.path}\n${head(text, 30, 1200)}`
    }),
  )
  const prompt = [
    hint === '' ? '' : `The developer says: ${hint}`,
    pointed.length > 0
      ? `The developer pointed at the folder \`${at}\`; globs still start from the project root.`
      : '',
    `Files:\n${listing.slice(0, 600).map(file => file.path).join('\n')}`,
    shown.length === 0 ? '' : `Starts of some files:\n${shown.join('\n\n')}`,
  ]
    .filter(part => part !== '')
    .join('\n\n')
  // A call that threw failed as surely as one answered with an error: neither is an answer.
  const reply = await $.model
    .complete({ model: 'haiku', system: SEARCH_RULES, prompt, maxTokens: 400, timeoutMs: 60_000 })
    .catch(() => ({ isAnswered: false }) as const)
  const recipe = (reply.isAnswered ? parseRecipe(reply.text) : undefined) ?? { kind: 'none' }
  const isFound = (await filesOf($, root, recipe)).length > 0
  // A failed call is not an answer: leave the project unsearched so the next session asks again.
  if (reply.isAnswered) await $.store.set(`recipe:${root}`, isFound ? recipe : { kind: 'none' })

  return isFound ? recipe : { kind: 'none' }
}

const show = async ($: Dollar, next: View): Promise<void> => {
  const held = await read($, view)
  if (JSON.stringify(held) === JSON.stringify(next)) return
  await update($, view, () => next)
  // The first load and a search's result are not news; a ticket finished or a new ask is.
  if (held.project !== next.project || held.isSearching) return
  const was = held.progress
  const now = next.progress
  if (was !== null && now !== null && was.source === now.source && now.done > was.done) {
    const finished = new Map<string, Was>()
    for (const row of now.rows) {
      const before = was.rows.find(one => one.title === row.title)
      if (row.state === 'done' && before !== undefined && before.state !== 'done') finished.set(row.title, before.state)
    }
    // The critter zaps either way; the rows it can name are struck in step with it.
    if (finished.size > 0) strikeRows($, finished)
    else animate($, 'zap')
    $.ui.toast(
      now.next === null
        ? `✓ All ${now.total} tickets done`
        : `✓ ${now.done}/${now.total} done · next: ${shortTitle(now.next)}`,
    )
  }
  const needsYou = next.summary?.needsYou ?? ''
  if (needsYou !== '' && needsYou !== (held.summary?.needsYou ?? '')) {
    $.ui.toast(`Needs you: ${needsYou}`, { timeoutMs: 8000 })
  }
}

const refresh = async ($: Dollar, hint?: string): Promise<View> => {
  await followProject($)
  if (isSearching) return read($, view)
  const root = await rootOf($)
  const project = root.slice(root.lastIndexOf('/') + 1)
  const summary = ((await $.store.get(`summary:${root}`)) ?? null) as Summary | null
  let recipe = hint === undefined ? await recipeOf($, root) : undefined
  let files = recipe === undefined ? [] : await filesOf($, root, recipe)
  const isStale = recipe !== undefined && recipe.kind !== 'none' && files.length === 0
  if (recipe === undefined || isStale) {
    isSearching = true
    await show($, { project, isSearching: true, summary, progress: null })
    try {
      recipe = await search($, root, hint ?? '')
      files = await filesOf($, root, recipe)
    } finally {
      isSearching = false
    }
  }
  const touched = (await $.store.get(`touched:${root}`)) as string | undefined
  const set = recipe === undefined ? undefined : pickSet(groupSets(recipe, files), touched)
  const tickets =
    set === undefined || recipe === undefined
      ? []
      : (await Promise.all(set.files.map(file => ticketsOf($, root, recipe, file)))).flat()
  const next: View = {
    project,
    isSearching: false,
    summary,
    progress: set === undefined || tickets.length === 0 ? null : progressOf(tickets, set.id),
  }
  await show($, next)

  return next
}

/** Asks the small model whether the turn moved anything, and keeps the old summary when it didn't. */
const summarize = async ($: Dollar, answer: string): Promise<void> => {
  const messages = await $.session.messages()
  if (!Array.isArray(messages)) return
  const start = messages.findLastIndex(
    one => one.role === 'user' && one.text.trim() !== '' && (one.toolResults ?? []).length === 0,
  )
  const turn = messages.slice(Math.max(0, start))
  const tools = turn
    .flatMap(one => one.toolUses)
    .map(use => {
      const target = use.input.file_path ?? use.input.command ?? use.input.pattern ?? ''

      return `${use.tool} ${String(target).slice(0, 100)}`
    })
  if (answer.trim() === '' && tools.length === 0) return
  const root = await rootOf($)
  const held = ((await $.store.get(`summary:${root}`)) ?? null) as Summary | null
  const reply = await $.model.complete({
    model: 'haiku',
    system: SUMMARY_RULES,
    prompt: [
      `Current status: ${held === null ? 'none yet' : JSON.stringify(held)}`,
      `The developer asked:\n${(turn[0]?.text ?? '').slice(0, 2000)}`,
      tools.length === 0 ? '' : `Tools used:\n${tools.slice(-40).join('\n')}`,
      `The assistant's final answer:\n${answer.slice(0, 4000)}`,
    ]
      .filter(part => part !== '')
      .join('\n\n'),
    maxTokens: 300,
    timeoutMs: 60_000,
  })
  const summary = reply.isAnswered ? parseSummary(reply.text) : undefined
  if (summary !== undefined) await $.store.set(`summary:${root}`, summary)
}

/** The project root, or undefined (logged) when the session cannot say; a look command then has no project to work on. */
const rootOrNone = async ($: Dollar): Promise<string | undefined> => {
  try {
    return await rootOf($)
  } catch (error) {
    $.ui.log(`sidekick: ${String(error)}`, { to: 'debug' })
    setCurrentRoot(undefined)

    return undefined
  }
}

/** Where a look is saved: the global one under `look`, a project's override under `look:${root}`. */
const lookKey = (target: Target, root: string | undefined): string | undefined =>
  target === 'global' ? LOOK : root === undefined ? undefined : `${LOOK}:${root}`

/** The look the store holds under the key; undefined when it cannot be read, so the caller keeps going without it. */
const storedLook = async ($: Dollar, key: string | undefined): Promise<SavedLook | undefined> => {
  if (key === undefined) return undefined
  try {
    return parseSaved(await $.store.get(key))
  } catch (error) {
    $.ui.log(`sidekick: ${String(error)}`, { to: 'debug' })

    return undefined
  }
}

/** Reads the override of the project the session is in now, unless the one in memory is already for it. */
const followProject = async ($: Dollar): Promise<void> => {
  const root = await rootOrNone($)
  if (root === undefined || projectRoot() === root) return
  setProjectLook((await storedLook($, lookKey('project', root))) ?? {}, root)
}

const quietly = (work: Promise<unknown>, $: Dollar): void => {
  void work.catch(error => $.ui.log(`sidekick: ${String(error)}`, { to: 'debug' }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'sidekick',
      description: 'Show this project\'s summary and ticket progress in a pane',
      argumentHint: '[close]',
    })
    await $.command.register({
      name: 'sidekick-rescan',
      description: 'Look again for where this project keeps its tickets',
      argumentHint: '[hint, e.g. tickets are in docs/tasks]',
    })
    await $.command.register({
      name: 'sidekick-look',
      description: 'Choose the sidekick\'s character, accessories and background',
      argumentHint: '[character=classic head=cap background=dusk]',
    })
    setSavedLook((await storedLook($, LOOK)) ?? {})
    const root = await rootOrNone($)
    setProjectLook((await storedLook($, lookKey('project', root))) ?? {}, root)
    void $.ui.open({ id: PANE, title: 'Sidekick' })
    quietly(refresh($), $)
    $.clock.every(REFRESH_MS, () => quietly(refresh($), $))

    return next(e)
  })

  on('command.run', { command: 'sidekick' }, async ($, e) => {
    if (e.args.trim() === 'close') {
      await $.ui.close({ id: PANE })

      return { text: 'Sidekick closed.' }
    }
    await $.ui.open({ id: PANE, title: 'Sidekick' })
    quietly(refresh($), $)

    return { text: 'Sidekick opened.' }
  })

  on('command.run', { command: 'sidekick-rescan' }, async ($, e) => {
    if (isSearching) return { text: 'A search is already running.' }
    const { progress } = await refresh($, e.args.trim())

    return {
      text:
        progress === null
          ? 'No tickets found. Try a hint: /sidekick-rescan tickets are in docs/tasks'
          : `Reading tickets from ${progress.source}: ${progress.done}/${progress.total} done.`,
    }
  })

  on('command.run', { command: 'sidekick-look' }, async ($, e) => {
    // Another terminal may have changed either look since this session read it, so the store is the truth.
    const { target, words } = targetOf(e.args)
    // The root is read once, so a read and the save that follows it are for the same project.
    const root = await rootOrNone($)
    const globalLook = await storedLook($, LOOK)
    const projectLook = await storedLook($, lookKey('project', root))
    if (globalLook !== undefined) setSavedLook(globalLook)
    // An override that cannot be read is dropped, as at session start, rather than drawn stale.
    setProjectLook(projectLook ?? {}, root)
    if (e.args.trim() === '') return { text: lookReport() }
    const held = target === 'project' ? projectLook : globalLook
    if (held === undefined) return { text: 'Could not read the saved look. Nothing was changed.' }
    const change = changeLook(words, held, target)
    if (!change.isSaved) return { text: change.text }
    try {
      await $.store.set(lookKey(target, root) ?? LOOK, change.saved)
    } catch (error) {
      $.ui.log(`sidekick: ${String(error)}`, { to: 'debug' })

      return { text: 'Could not save the look. Nothing was changed.' }
    }
    if (target === 'project') setProjectLook(change.saved, root)
    else setSavedLook(change.saved)
    // The sidekick repaints with the new look before the command returns.
    paint($)
    $.ui.invalidate('ui.render')

    return { text: change.text }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const path = (e as unknown as { file_path?: unknown }).file_path
    if (!FILE_TOOLS.has(String(e.tool)) || typeof path !== 'string') return ran
    quietly(
      (async () => {
        const root = await rootOf($)
        const relative = toRelative(root, path)
        const recipe = await recipeOf($, root)
        const id = relative === undefined || recipe === undefined ? undefined : setIdOf(recipe, relative)
        if (id === undefined) return
        await $.store.set(`touched:${root}`, id)
        await refresh($)
      })(),
      $,
    )

    return ran
  })

  on('turn.start', async ($, e, next) => {
    // The session may have moved to another project since the last refresh; draw that project's look.
    await followProject($)
    animate($, 'write')

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const ended = await next(e)
    if (e.agentId === undefined) animate($, 'idle')
    if (e.agentId === undefined && e.reason === 'answer') {
      quietly(summarize($, e.answer).then(() => refresh($)), $)
    }

    return ended
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const { project, isSearching: isLooking, summary, progress } = await read($, view)
    // One column of padding on each side; the bar and rules span what is left.
    const columns = Math.max(12, e.props.bodyColumns - 2)
    const rows = progress?.rows ?? []
    const focus = rows.findIndex(row => row.state !== 'done' && row.title === progress?.next)
    const room = Math.max(3, e.props.scroll.bodyRows - 17)
    const steady = windowOf(rows.length, Math.max(0, focus), room)
    // A row being struck is brought into view for the strike, then the list goes back to the next ticket.
    const struck = strike === undefined ? -1 : rows.findIndex(row => row.state === 'done' && strike?.rows.has(row.title))
    const isHidden = struck !== -1 && (struck < steady.start || struck >= steady.end)
    const { start, end } = isHidden ? windowOf(rows.length, struck, room) : steady
    const step = struck === -1 ? -1 : (strike?.step ?? -1)
    // The bolt runs down the gutter from the critter to the list; only the terminal draws the critter.
    const isTrail = e.surface === 'terminal'
    const trailOn = (line: number): boolean => isTrail && step === line
    // One frame of a struck row; every frame keeps a glyph, so the state never rests on colour alone.
    const struckRow = (title: string, was: Was, at: number, width: number) => {
      const text = shortTitle(title)
      if (at < LANDS) {
        return (
          <Text wrap="truncate-end">
            <Text color="text">{GLYPH[was]} </Text>
            {text}
          </Text>
        )
      }
      if (at === LANDS) {
        return (
          <Text wrap="truncate-end">
            <Text bold color="warning">
              {BOLT}{' '}
            </Text>
            {text}
          </Text>
        )
      }
      if (at === HITS) {
        return (
          <Text wrap="truncate-end" bold color="inverseText" backgroundColor="warning">
            {GLYPH.done} {text}
          </Text>
        )
      }
      const chars = [...text]
      const shown = Math.min(chars.length, Math.max(1, width - 2))
      const cut = Math.min(shown, Math.ceil((shown * (at - BURNS + 1)) / BURN_STEPS))

      return (
        <Text wrap="truncate-end">
          <Text color="success">{GLYPH.done} </Text>
          <Text dimColor strikethrough>
            {chars.slice(0, cut).join('')}
          </Text>
          {cut < shown && (
            <Text bold color="warning">
              {chars[cut]}
            </Text>
          )}
          {chars.slice(cut < shown ? cut + 1 : cut).join('')}
        </Text>
      )
    }
    const isComplete = progress !== null && progress.done === progress.total
    const accent = isComplete ? 'success' : 'claude'
    const filled = progress === null ? 0 : Math.round((progress.done / progress.total) * columns)
    const needsYou = summary?.needsYou ?? ''
    const dropped = leftOut()
    // Only the terminal has a cell grid to draw the character on.
    const buddy =
      e.surface === 'terminal'
        ? (() => {
            const { Raster } = $.ui.resolve(e)

            return <Raster key={BUDDY} columns={SPRITE.columns} rows={SPRITE.rows} cells={cellsOf(mode, frame)} />
          })()
        : null

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box flexDirection="row" gap={1}>
          {buddy}
          <Box flexDirection="column" flexGrow={1} justifyContent="flex-end">
            <Text bold wrap="truncate-end">
              {project}
            </Text>
            {progress !== null && (
              <Text bold color={accent}>
                {isComplete ? '✓ ' : ''}
                {progress.done}/{progress.total} done
              </Text>
            )}
          </Box>
        </Box>
        {progress !== null && (
          <Text>
            {trailOn(LEAVES) && (
              <Text bold color="warning">
                {BOLT}
              </Text>
            )}
            <Text color={accent}>{'━'.repeat(trailOn(LEAVES) ? Math.max(0, filled - 1) : filled)}</Text>
            <Text dimColor>{'─'.repeat(columns - Math.max(filled, trailOn(LEAVES) ? 1 : 0))}</Text>
          </Text>
        )}
        {dropped !== '' && (
          <Text dimColor wrap="truncate-end">
            Left out: {dropped}
          </Text>
        )}
        {isLooking && <Text color="suggestion">◌ Looking for tickets…</Text>}
        {!isLooking && progress === null && (
          <Text dimColor>○ No tickets here. /sidekick-rescan looks again.</Text>
        )}
        {progress !== null && (
          <Box flexDirection="column" marginTop={trailOn(LANDS) ? 0 : 1}>
            {/* The bolt's second segment takes the blank line above the list, so nothing moves. */}
            {trailOn(LANDS) && (
              <Text bold color="warning">
                {BOLT}
              </Text>
            )}
            {start > 0 && <Text dimColor>↑ {start} earlier</Text>}
            {rows.slice(start, end).map((row, index) => {
              const isNext = start + index === focus
              const was = step === -1 ? undefined : strike?.rows.get(row.title)
              if (row.state === 'done' && was !== undefined && step < STRIKE_STEPS - 2) {
                return struckRow(row.title, was, step, columns)
              }

              return (
                <Text
                  wrap="truncate-end"
                  dimColor={row.state === 'done'}
                  strikethrough={row.state === 'done'}
                  bold={isNext}
                >
                  <Text color={row.state === 'done' ? 'success' : isNext ? 'claude' : 'text'}>
                    {GLYPH[row.state]}{' '}
                  </Text>
                  {shortTitle(row.title)}
                </Text>
              )
            })}
            {end < rows.length && <Text dimColor>↓ {rows.length - end} more</Text>}
          </Box>
        )}
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>{'─'.repeat(columns)}</Text>
          {summary === null && (
            <Text dimColor>The summary appears after a turn that moves something.</Text>
          )}
          {summary !== null && (
            <Box flexDirection="row">
              <Box width={6} flexShrink={0}>
                <Text bold color="suggestion">
                  Done
                </Text>
              </Box>
              <Box flexGrow={1} flexShrink={1}>
                <Text>{summary.happened}</Text>
              </Box>
            </Box>
          )}
          {summary !== null && summary.next !== '' && (
            <Box flexDirection="row" marginTop={1}>
              <Box width={6} flexShrink={0}>
                <Text bold color="suggestion">
                  Next
                </Text>
              </Box>
              <Box flexGrow={1} flexShrink={1}>
                <Text>{summary.next}</Text>
              </Box>
            </Box>
          )}
        </Box>
        {needsYou !== '' && (
          <Box marginTop={1}>
            <Text>
              <Text bold color="inverseText" backgroundColor="warning">
                {' NEEDS YOU '}
              </Text>{' '}
              {needsYou}
            </Text>
          </Box>
        )}
        {progress !== null && (
          <Box marginTop={1}>
            <Text dimColor wrap="truncate-start">
              {progress.source}
            </Text>
          </Box>
        )}
      </Box>
    )
  })
}
