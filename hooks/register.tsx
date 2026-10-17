import type { AgentStatus, EngineInterface, ModelCompleteRequest, ModelCompleteResult, Register } from 'claude-code'
import { atom, read, update } from 'claude-code'

import type { InboxView, SetEntry, Tab, View } from '../types'
import type { Activity } from './activity'
import { createActivity } from './activity'
import type { CostKind, SavedSession } from './cost'
import { addCall, costReport, dollarsOf, parseSession, parseTotals, shortDollars, totalOf } from './cost'
import type { Detail, FileTicket, Inbox, Opened, TicketRef } from './inbox'
import {
  activeSince,
  addItems,
  detailOf,
  fit,
  inboxTitle,
  markReviewed,
  parseItems,
  readInbox,
  readReviewed,
  readSince,
  reviewLine,
  sectionsOf,
  tidy,
  tidyReviewed,
  workingHeading,
  workingLine,
} from './inbox'
import type { Target } from './look'
import { changeLook, lookReport, parseSaved, targetOf } from './look'
import { changeMotion, MOTION, motionReport, parseMotion } from './motion'
import { ambientFor, cellsOf, leftOut, playsFor, SPRITE } from './sprite'
import { projectRoot, setCurrentRoot, setProjectLook, setSavedLook } from './sprite/look-in-use'
import type { SavedLook } from './sprite/types'
import { BURN_STEPS, BURNS, HITS, isStruck, LANDS, LEAVES, STRIKE_REST_STEPS } from './strike'
import type { FileInfo, Place, Recipe, Ticket, TicketSet } from './tickets'
import {
  addPlace,
  endsWithPath,
  findSet,
  globReach,
  globToRegExp,
  groupSets,
  hintPaths,
  labelOf,
  namedIn,
  normalize,
  orderSets,
  parseChecklist,
  parsePlace,
  parseTicketFile,
  progressOf,
  readRecipe,
  setIdOf,
  shortTitle,
  toRelative,
  windowOf,
} from './tickets'

const PANE = 'sidekick'
const LOOK = 'look'
const BUDDY = 'buddy'
const REFRESH_MS = 20_000
const SKIPPED = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'target',
  'vendor',
  '.next',
  '.venv',
  'venv',
  '__pycache__',
  '.idea',
  '.vscode',
  'coverage',
  '.claude-plugin',
  '.pytest_cache',
  '.ruff_cache',
  '.mypy_cache',
  '.tox',
  '.cache',
])
const isSkipped = (name: string): boolean => SKIPPED.has(name) || name.startsWith('.tmp')
const LISTED = /(\.(md|mdx|markdown|txt|org|ya?ml|json|toml)|^[^.]+)$/i
const LIKELY = /issue|ticket|task|todo|backlog|plan|roadmap|scratch|stor(y|ies)|spec|kanban|board/i
const GLYPH = { done: '✓', active: '◐', open: '○' } as const
/** A glyph and its colour; the glyph alone tells the kind, so it never rests on colour. */
type Mark = { glyph: string; color: 'warning' | 'error' | 'success' | 'claude' | 'suggestion' }
/** How NEEDS YOU marks each kind: a question, a blocker, a change of direction. */
const ASKED = {
  'needs-you': { glyph: '?', color: 'warning' },
  blocked: { glyph: '✗', color: 'error' },
  'changed-direction': { glyph: '!', color: 'warning' },
} as const satisfies Record<string, Mark>
const FILE_TOOLS = new Set(['Read', 'Edit', 'Write', 'MultiEdit'])
// Reading or editing a ticket file is a touch; writing one (maybe a new ticket) is not.
const TOUCH_TOOLS = new Set(['Read', 'Edit', 'MultiEdit'])

const SEARCH_RULES = `You find where a software project keeps its tickets (units of planned work) as local files.
You get a file listing and the start of some files. Answer with one JSON object and nothing else.

- Tickets are one file each: {"kind":"files","glob":"<path pattern>","statusLabel":"<label>" or null,"doneValues":[...],"activeValues":[...]}
  glob is relative to the project root with forward slashes; * matches within one folder name, ** across folders.
  Example: ".scratch/*/issues/*.md". Match only ticket files, not specs, maps or readmes.
  statusLabel is the word before the colon on the line that holds a ticket's status ("Status" for "**Status:** done"); null when tickets have no such line.
  doneValues are the status values that mean finished; activeValues the ones that mean being worked on.
- Tickets are lines of a checklist ("- [ ] thing"): {"kind":"checklist","glob":"<path pattern of the checklist file or files>"}
- No tickets, or a layout that fits neither: {"kind":"none"}

Answer with one place to add to the places already known, never a replacement for them.

Documentation, changelogs and notes are not tickets.`

const SUMMARY_RULES = `You keep the inbox of a software project for its developer: short items on what needs them and how each ticket is going.
You get the project's tickets, numbered, the newest items already in the inbox, and what happened in the latest turn of their coding session.
Write items only when the turn decided something, finished, started or found something in a piece of work, or asked something of the developer. A question answered, a file read, or small talk writes nothing. Never write again an item the inbox already holds.

Each item has:
- "kind": "needs-you" when the developer must answer or decide something; "blocked" when work cannot go on until something outside it changes; "changed-direction" when the planned approach was dropped for another; "note" for progress on a ticket, one line of its history.
- "ticket": the number of the ticket it belongs to, from the list, or null when it belongs to none.
- "short": one line of at most 36 characters, to fit a narrow pane. For needs-you it is the question itself.
- "long": up to four sentences for a developer who has forgotten the ticket: what it is about, what happened or was found, and the choice or trade-off when there is one.

Good short lines: "Keep timed-out payments pending?", "Retry tests pass", "Waiting on the staging API key", "Dropped the queue for a cron job".
Bad short lines: "The agent has finished the retry logic and needs a decision on pending payments" (too long), "Update" (says nothing), "Needs your input" (repeats the kind, not the question).

Answer with one JSON object and nothing else:
{"items":[]}
or {"items":[{"kind":"needs-you","ticket":3,"short":"<short line>","long":"<explanation>"}]}`

/** At most this many tickets are listed for the summary to name; the sets changed last come first. */
const SUMMARY_TICKETS = 60
/** The newest items the summary is shown, so it does not write them again. */
const SUMMARY_HELD = 10

const view = atom(
  { plugin: 'sidekick', key: 'view' } as const,
  {
    project: '',
    isSearching: false,
    inbox: { needsYou: [], review: [], working: [], reviewed: 0 },
    progress: null,
    sets: [],
    current: '',
    isChoosing: false,
    tab: 'inbox',
  } satisfies View as View,
)

let isSearching = false
// True when the last search added no place and the recipe was kept as it was.
let isKept = false
// The set picker shows from a new session or a rescan until a pick, a touch or the end of the next turn.
let isChoosing = false
// The session the mod last saw; another id means a new session (a /clear gives one).
let knownSession: string | undefined
// The id a /clear ended: until the engine reports another, the session holds no choice of its own.
let clearedSession: string | undefined
// Folders a new ticket file was already looked into this session, so a burst of writes searches once.
const probed = new Set<string>()
const SET_ROWS = 9
const ASK_OPTIONS = 4
const parsed = new Map<string, { mtimeMs: number; tickets: Ticket[] }>()

type Dollar = EngineInterface

// The subagents running now, by id, for the WORKING heading: a spawn adds one, the end of its turn (answered, failed or
// stopped) takes it out. Held in memory only, so a restart starts at none; a new session clears it too.
const running = new Set<string>()
const ENDED: ReadonlySet<AgentStatus> = new Set(['completed', 'failed', 'killed'])

/** Drops the agents the engine lists as ended: a turn end missed (a kill, say) leaves no stale count past the next refresh. */
const dropEnded = async ($: Dollar): Promise<void> => {
  if (running.size === 0) return
  const listed = await $.agent.list().catch(() => [])
  for (const agent of listed) if (ENDED.has(agent.status)) running.delete(agent.id)
}

// The sidekick's own cost: every call it makes to the small model adds its usage to this session's totals and to the
// project's all-time ones, in the store. The header shows the session's in estimated dollars (./cost).
const costKey = (root: string): string => `cost:${root}`
// One entry per project, holding the session it is for: another session starts over.
const sessionCostKey = (root: string): string => `cost-session:${root}`
let sessionDollars = 0
// Calls are added one after another, so two that end together never lose one another's usage.
let costWrites: Promise<void> = Promise.resolve()

const countCall = ($: Dollar, kind: CostKind, usage: ModelCompleteResult['usage'] | undefined): Promise<void> => {
  costWrites = costWrites
    .then(async () => {
      const root = await rootOf($)
      const session = await $.session.id()
      const allTime = addCall(parseTotals(await $.store.get(costKey(root))), kind, usage)
      const totals = addCall(parseSession(await $.store.get(sessionCostKey(root)), session), kind, usage)
      await $.store.set(costKey(root), allTime)
      await $.store.set(sessionCostKey(root), { session, totals } satisfies SavedSession)
      sessionDollars = dollarsOf(totalOf(totals))
      $.ui.invalidate('ui.render')
    })
    .catch(error => $.ui.log(`sidekick: ${String(error)}`, { to: 'debug' }))

  return costWrites
}

/** A call to the small model whose usage is counted whatever came of it; one that threw counts with no usage and reads as unanswered. */
const complete = async ($: Dollar, kind: CostKind, request: ModelCompleteRequest): Promise<ModelCompleteResult | { isAnswered: false }> => {
  const reply = await $.model.complete(request).catch(() => undefined)
  await countCall($, kind, reply?.usage)

  return reply ?? { isAnswered: false }
}

// The strike: when tickets finish, the critter zaps and a bolt lands on their rows, which flash and
// have the strike-through burn across them before they settle as done. One step per frame of the
// animation that plays for the ticket-done state; the beats are in ./strike.
type Was = 'active' | 'open'
/** The steps are those the running entry has, told by the activity when the strike starts. */
type Strike = { rows: Map<string, Was>; step: number; steps: number }
const BOLT = '↯'

/** What one pane keeps: what its sidekick is doing, the strike on show, and the batch of rows waiting to be struck. */
type Scene = {
  activity: Activity
  strike: Strike | undefined
  pending: Map<string, Was> | undefined
}

// One scene per pane, so what one pane shows is never read from another's.
const scenes = new Map<string, Scene>()

/**
 * Whether the pane is the one shown, as against a tab behind another pane. It has nothing to do with the keyboard.
 * The host raises no event when the shown pane changes, so this is asked. When it cannot be told the pane counts as shown, so that a failed ask never stills the sidekick.
 */
const isPaneShown = async ($: Dollar): Promise<boolean> => {
  try {
    return (await $.ui.panes()).find(pane => pane.id === PANE)?.isShown ?? true
  } catch {
    return true
  }
}

const sceneOf = ($: Dollar): Scene => {
  const held = scenes.get(PANE)
  if (held !== undefined) return held
  const scene: Scene = {
    strike: undefined,
    pending: undefined,
    activity: createActivity(
      { every: (ms, fn) => $.clock.every(ms, fn), after: (ms, fn) => $.clock.after(ms, fn) },
      ({ animation, frame }) => {
        void $.ui.blit({ requestId: PANE, key: BUDDY, cells: cellsOf(animation, frame) }).catch(() => undefined)
      },
      playsFor,
      ambientFor,
      () => isPaneShown($),
    ),
  }
  scenes.set(PANE, scene)

  return scene
}

/** Tells the sidekick whether its pane is the one shown now; asked wherever news arrives (a render, a refresh, a turn) so it never animates for a pane nobody sees. */
const syncShown = async ($: Dollar): Promise<void> => {
  sceneOf($).activity.setShown(await isPaneShown($))
}

/** Strikes the rows that just finished, after any strike already under way. */
const strikeRows = ($: Dollar, rows: Map<string, Was>): void => {
  const scene = sceneOf($)
  // A burst of finishes waits as one batch behind the strike on show, never as a long queue.
  if (scene.pending !== undefined) {
    for (const [title, was] of rows) scene.pending.set(title, was)

    return
  }
  const batch = new Map(rows)
  scene.pending = batch
  scene.activity.queue({
    state: 'ticket-done',
    // The strike has one more step than the animation has frames; the sidekick rests for the last one.
    restSteps: STRIKE_REST_STEPS,
    isKeptWhenHidden: true,
    onStart: steps => {
      if (scene.pending === batch) scene.pending = undefined
      scene.strike = { rows: batch, step: 0, steps }
      $.ui.invalidate('ui.render')
    },
    onStep: step => {
      if (scene.strike !== undefined) scene.strike.step = step
      $.ui.invalidate('ui.render')
    },
    onEnd: () => {
      scene.strike = undefined
      $.ui.invalidate('ui.render')
    },
  })
}

const rootOf = async ($: Dollar): Promise<string> => {
  const root = normalize(await $.session.root())
  // Whatever asks for the root also tells the sprite which project it is drawing for.
  setCurrentRoot(root)

  return root
}

// An old recipe was one glob; readRecipe wraps it as one place.
const recipeOf = async ($: Dollar, root: string): Promise<Recipe | undefined> => readRecipe(await $.store.get(`recipe:${root}`))

const activeKey = (root: string, session: string): string => `active:${root}:${session}`

const walk = async ($: Dollar, root: string, dir: string, depth: number, cap: number, found: FileInfo[] = [], deeper = 0): Promise<FileInfo[]> => {
  if (found.length >= cap) return found
  const listed = await $.fs.list(dir === '' ? root : `${root}/${dir}`).catch(() => [])
  const pathOf = (name: string): string => (dir === '' ? name : `${dir}/${name}`)
  // Folders that look like ticket homes come first, so the cap spends itself elsewhere.
  const isLikelyDir = (entry: (typeof listed)[number]): boolean => entry.kind === 'dir' && LIKELY.test(pathOf(entry.name))
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

const filesIn = async ($: Dollar, root: string, place: Place): Promise<FileInfo[]> => {
  const { dir, depth } = globReach(place.glob)
  const matches = globToRegExp(place.glob)

  return (await walk($, root, dir, depth, 3000)).filter(file => matches.test(file.path))
}

/** Every file the recipe's places read, each once. */
const filesOf = async ($: Dollar, root: string, recipe: Recipe): Promise<FileInfo[]> => {
  const all = (await Promise.all(recipe.places.map(place => filesIn($, root, place)))).flat()

  return all.filter((file, at) => all.findIndex(one => one.path === file.path) === at)
}

const ticketsOf = async ($: Dollar, root: string, place: Place, file: FileInfo): Promise<Ticket[]> => {
  const key = `${root}/${file.path}`
  const held = parsed.get(key)
  if (held !== undefined && held.mtimeMs === file.mtimeMs) return held.tickets
  const text = await $.fs.read(key).catch(() => '')
  const name = file.path.slice(file.path.lastIndexOf('/') + 1)
  const tickets = place.kind === 'files' ? [parseTicketFile(name, text, place)] : parseChecklist(text)
  parsed.set(key, { mtimeMs: file.mtimeMs, tickets })

  return tickets
}

const head = (text: string, lines: number, chars: number): string => text.split(/\r?\n/).slice(0, lines).join('\n').slice(0, chars)

/** A search: looks at the project and adds the place the model finds to the recipe; nothing is ever removed. */
const search = async (
  $: Dollar,
  root: string,
  hint: string,
  previous: Recipe | undefined,
  cover?: string,
): Promise<{ recipe: Recipe; isKept: boolean; isFailed: boolean }> => {
  const known = previous ?? { places: [] }
  const worked = known.places.length > 0
  // `isFailed`: the model gave no answer, or none that could be read. An answer of "no tickets" is an answer.
  const kept = (isFailed = false): { recipe: Recipe; isKept: boolean; isFailed: boolean } => ({
    recipe: known,
    isKept: worked,
    isFailed,
  })
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
  const listing = pointed.length > 0 ? pointed : (await broad()).sort((a, b) => rank(a) - rank(b))
  if (listing.length === 0) {
    if (previous === undefined) await $.store.set(`recipe:${root}`, known)

    return kept()
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
    worked
      ? `Tickets are already read from these places: ${known.places.map(place => `\`${place.glob}\``).join(', ')}. Answer with a place to add to them, not a replacement.`
      : '',
    pointed.length > 0 ? `The developer pointed at the folder \`${at}\`; globs still start from the project root.` : '',
    `Files:\n${listing
      .slice(0, 600)
      .map(file => file.path)
      .join('\n')}`,
    shown.length === 0 ? '' : `Starts of some files:\n${shown.join('\n\n')}`,
  ]
    .filter(part => part !== '')
    .join('\n\n')
  // A call that threw failed as surely as one answered with an error: neither is an answer.
  const reply = await complete($, 'search', { model: 'haiku', system: SEARCH_RULES, prompt, maxTokens: 400, timeoutMs: 60_000 })
  const place = reply.isAnswered ? parsePlace(reply.text) : undefined
  const found = place === undefined || place === 'none' ? [] : await filesIn($, root, place)
  const isFound = found.length > 0 && (cover === undefined || found.some(file => file.path === cover))
  if (place === undefined || place === 'none' || !isFound) {
    // A failed call is not an answer: leave an unsearched project unsearched so the next session asks again.
    if (reply.isAnswered && previous === undefined) await $.store.set(`recipe:${root}`, known)

    return kept(place === undefined)
  }
  const recipe = addPlace(known, place)
  await $.store.set(`recipe:${root}`, recipe)

  return { recipe, isKept: false, isFailed: false }
}

/** The ticket sets the saved recipe reads, most recently changed first. */
const setsOf = async ($: Dollar, root: string): Promise<{ recipe: Recipe | undefined; sets: TicketSet[] }> => {
  const recipe = await recipeOf($, root)
  const files = recipe === undefined ? [] : await filesOf($, root, recipe)

  return { recipe, sets: recipe === undefined ? [] : orderSets(groupSets(recipe, files)) }
}

const entriesOf = async ($: Dollar, root: string, sets: TicketSet[]): Promise<SetEntry[]> =>
  Promise.all(
    sets.map(async set => {
      const tickets = (await Promise.all(set.files.map(file => ticketsOf($, root, set.place, file)))).flat()

      return {
        id: set.id,
        label: labelOf(set.id),
        done: tickets.filter(ticket => ticket.isDone).length,
        total: tickets.length,
      }
    }),
  )

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
    // The sidekick animates the done ticket either way; the rows it can name are struck in step with it.
    if (finished.size > 0) strikeRows($, finished)
    else sceneOf($).activity.queue({ state: 'ticket-done', isKeptWhenHidden: true })
    // The set became all done: it was not at the previous refresh of this same set (`was` is that refresh, and a
    // first load or another set never gets here). The cheer waits behind the zap and its strike.
    if (now.done === now.total && was.done < was.total) sceneOf($).activity.queue({ state: 'set-done', isKeptWhenHidden: true })
    $.ui.toast(now.next === null ? `✓ All ${now.total} tickets done` : `✓ ${now.done}/${now.total} done · next: ${shortTitle(now.next)}`)
  }
}

const inboxKey = (root: string): string => `inbox:${root}`

const inboxOf = async ($: Dollar, root: string): Promise<Inbox> => readInbox(await $.store.get(inboxKey(root)))

// When the mod first saw each ticket active, for WORKING's time active; one entry per project.
const sinceKey = (root: string): string => `active-since:${root}`

// The tickets the developer marked reviewed, by `keyOf`; one entry per project. Never written to a ticket file.
const reviewedKey = (root: string): string => `reviewed:${root}`

/** Every ticket of the sets as its file says, the sets in the order given. */
const fileTicketsOf = async ($: Dollar, root: string, sets: TicketSet[]): Promise<FileTicket[]> =>
  (
    await Promise.all(
      sets.map(async set => (await Promise.all(set.files.map(file => ticketsOf($, root, set.place, file)))).flat().map(one => ({ ...one, set: set.id }))),
    )
  ).flat()

/** Every ticket of the sets, as the inbox names it. */
const ticketRefsOf = async ($: Dollar, root: string, sets: TicketSet[]): Promise<TicketRef[]> =>
  (await fileTicketsOf($, root, sets)).map(({ set, title }) => ({ set, title }))

/**
 * Drops the items whose ticket is in no set any more, and forgets a reviewed ticket once it is not done; keeps when
 * each active ticket went active.
 * With no set read at all nothing changes: a project that cannot be read now has not lost its tickets.
 */
const tidyInbox = async ($: Dollar, root: string, sets: TicketSet[]): Promise<void> => {
  if (sets.length === 0) return
  const tickets = await fileTicketsOf($, root, sets)
  const held = readSince(await $.store.get(sinceKey(root)))
  const since = activeSince(
    held,
    tickets.filter(one => one.isActive),
    await $.clock.now(),
  )
  if (JSON.stringify(since) !== JSON.stringify(held)) await $.store.set(sinceKey(root), since)
  const reviewed = readReviewed(await $.store.get(reviewedKey(root)))
  const stillDone = tidyReviewed(reviewed, tickets)
  if (stillDone.length !== reviewed.length) await $.store.set(reviewedKey(root), stillDone)
  if ((await $.store.get(inboxKey(root))) === undefined) return
  const inbox = await inboxOf($, root)
  const kept = tidy(inbox, tickets)
  if (kept.items.length !== inbox.items.length) await $.store.set(inboxKey(root), kept)
}

/** The inbox the pane draws: the items, and the tickets of the active set (none when no set is active). */
const inboxViewOf = async ($: Dollar, root: string, set: TicketSet | undefined): Promise<InboxView> =>
  sectionsOf(
    await inboxOf($, root),
    set === undefined ? [] : await fileTicketsOf($, root, [set]),
    readSince(await $.store.get(sinceKey(root))),
    readReviewed(await $.store.get(reviewedKey(root))),
  )

// The detail view: an inbox entry opened in the inbox's place in the pane, until Back or Mark reviewed.
/** What the pane shows instead of the inbox, with the glyph its row had; undefined: the inbox. */
let opened: { of: Opened; detail: Detail; mark: Mark } | undefined
/** Where the pane's window stood over the inbox at its last drawing, and where Back puts it again. */
let inboxOffset = 0
let backOffset = 0
/** Where the mod's own next scroll of the pane lands; the engine is asked for the top and this is put in its place. */
let scrollTo: number | undefined

/** The text of a ticket's own file, read afresh; undefined for a checklist line, or a ticket no set holds. */
const ticketFileOf = async ($: Dollar, root: string, ticket: TicketRef): Promise<string | undefined> => {
  const set = (await setsOf($, root)).sets.find(one => one.id === ticket.set)
  if (set === undefined || set.place.kind !== 'files') return undefined
  for (const file of set.files) {
    const [one] = await ticketsOf($, root, set.place, file)
    if (one?.title === ticket.title) return $.fs.read(`${root}/${file.path}`).catch(() => undefined)
  }

  return undefined
}

/**
 * Opens an entry's detail in the inbox's place, its goal read from the ticket's file now. `isMarkable`: the entry can
 * be marked reviewed (an open item, a ticket ready to review). Opening marks nothing.
 */
const openDetail = async ($: Dollar, of: Opened, mark: Mark, isMarkable: boolean): Promise<void> => {
  const root = await rootOf($)
  const inbox = await inboxOf($, root)
  const ticket = 'ticket' in of ? of.ticket : (inbox.items.find(item => item.id === of.item)?.ticket ?? null)
  const detail = detailOf(inbox, of, ticket === null ? undefined : await ticketFileOf($, root, ticket))
  if (detail === undefined) return
  backOffset = inboxOffset
  opened = { of, detail: { ...detail, isReviewable: detail.isReviewable && isMarkable }, mark }
  $.ui.invalidate('ui.render')
  await $.ui.scroll({ to: { key: 'detail' }, in: PANE, block: 'start' }).catch(() => undefined)
}

/** Back to the inbox, its window where it stood when the detail opened. */
const closeDetail = async ($: Dollar): Promise<void> => {
  opened = undefined
  scrollTo = backOffset
  $.ui.invalidate('ui.render')
  await $.ui.scroll({ to: 'start', in: PANE }).catch(() => undefined)
  scrollTo = undefined
}

/** Marks the open entry reviewed, in the mod's store only, and goes back to the inbox. */
const markOpened = async ($: Dollar): Promise<void> => {
  if (opened === undefined) return
  const { of } = opened
  const root = await rootOf($)
  const marked = markReviewed({ inbox: await inboxOf($, root), reviewed: readReviewed(await $.store.get(reviewedKey(root))) }, of)
  if ('item' in of) await $.store.set(inboxKey(root), marked.inbox)
  else await $.store.set(reviewedKey(root), marked.reviewed)
  await refresh($)
  await closeDetail($)
}

// The tab the pane shows, one per project: Inbox unless Tickets was chosen there.
const tabKey = (root: string): string => `tab:${root}`

const tabOf = async ($: Dollar, root: string): Promise<Tab> => ((await $.store.get(tabKey(root))) === 'tickets' ? 'tickets' : 'inbox')

/** Shows the tab at once and keeps it for the project. */
const chooseTab = async ($: Dollar, tab: Tab): Promise<void> => {
  // Kept before it is shown, so a refresh in between reads the new tab.
  await $.store.set(tabKey(await rootOf($)), tab)
  await update($, view, held => ({ ...held, tab }))
  $.ui.invalidate('ui.render')
}

/** Refreshes the pane. `isOffering` (a rescan) opens the set picker; a new session opens it by itself. */
const refresh = async ($: Dollar, hint?: string, cover?: string, isOffering = false): Promise<View> => {
  await syncShown($)
  await followProject($)
  if (isSearching) return read($, view)
  const root = await rootOf($)
  const project = root.slice(root.lastIndexOf('/') + 1)
  const previous = await recipeOf($, root)
  let recipe = previous
  // A place that holds no files drops out; the rest stay.
  let held: { place: Place; files: FileInfo[] }[] = []
  if (recipe !== undefined) {
    held = await Promise.all(recipe.places.map(async place => ({ place, files: await filesIn($, root, place) })))
    const live = held.filter(one => one.files.length > 0)
    if (live.length !== held.length) {
      held = live
      recipe = { places: live.map(one => one.place) }
      await $.store.set(`recipe:${root}`, recipe)
    }
  }
  const isGone = previous !== undefined && previous.places.length > 0 && recipe?.places.length === 0
  let files: FileInfo[] | undefined
  if (recipe === undefined || hint !== undefined || isGone) {
    const { activity } = sceneOf($)
    isSearching = true
    activity.set('search', true)
    let isFailed = true
    try {
      await show($, { ...(await read($, view)), project, isSearching: true, progress: null })
      const found = await search($, root, hint ?? '', recipe, cover)
      recipe = found.recipe
      isKept = found.isKept
      isFailed = found.isFailed
      files = recipe === undefined ? [] : await filesOf($, root, recipe)
    } finally {
      isSearching = false
      // The shrug is queued first, so the sidekick goes from looking straight into it.
      if (isFailed || (files ?? []).length === 0) activity.queue({ state: 'search-failed' })
      activity.set('search', false)
    }
  }
  files ??= recipe === undefined ? [] : await filesOf($, root, recipe)
  const sets = recipe === undefined ? [] : orderSets(groupSets(recipe, files))
  await tidyInbox($, root, sets)
  await dropEnded($)
  const session = await $.session.id()
  sessionDollars = dollarsOf(totalOf(parseSession(await $.store.get(sessionCostKey(root)), session)))
  const key = activeKey(root, session)
  let active = (await $.store.get(key)) as string | undefined
  if (!sets.some(set => set.id === active)) active = undefined
  if (session !== knownSession) {
    // A new session has no set active; a resumed one comes back with its own.
    knownSession = session
    probed.clear()
    if (session === clearedSession && active !== undefined) {
      await $.store.delete(key)
      active = undefined
    }
    isChoosing = active === undefined && sets.length > 1
  }
  if (isOffering) isChoosing = sets.length > 1
  if (sets.length === 1 && active !== sets[0]?.id) {
    active = sets[0]?.id
    await $.store.set(key, active)
  }
  const set = sets.find(one => one.id === active)
  const tickets = set === undefined ? [] : (await Promise.all(set.files.map(file => ticketsOf($, root, set.place, file)))).flat()
  const next: View = {
    project,
    isSearching: false,
    inbox: await inboxViewOf($, root, set),
    progress: set === undefined || tickets.length === 0 ? null : progressOf(tickets, set.id),
    sets: sets.length < 2 ? [] : await entriesOf($, root, sets),
    current: set?.id ?? '',
    isChoosing: isChoosing && sets.length > 1,
    tab: await tabOf($, root),
  }
  await show($, next)
  // WORKING's time active moves on while nothing else changes, so the pane is drawn again at every refresh.
  if (next.inbox.working.length > 0) $.ui.invalidate('ui.render')

  return next
}

/** How an item is told to the summary: its kind, its ticket and its short line. */
const heldLine = (item: Inbox['items'][number]): string =>
  `- ${item.kind}${item.ticket === null ? '' : ` (${labelOf(item.ticket.set)} · ${item.ticket.title})`}: ${item.short}`

/** Asks the small model what the turn moved, and adds the items it writes to the inbox. A call that fails adds nothing. */
const summarize = async ($: Dollar, answer: string): Promise<void> => {
  const messages = await $.session.messages()
  if (!Array.isArray(messages)) return
  const start = messages.findLastIndex(one => one.role === 'user' && one.text.trim() !== '' && (one.toolResults ?? []).length === 0)
  const turn = messages.slice(Math.max(0, start))
  const tools = turn
    .flatMap(one => one.toolUses)
    .map(use => {
      const target = use.input.file_path ?? use.input.command ?? use.input.pattern ?? ''

      return `${use.tool} ${String(target).slice(0, 100)}`
    })
  if (answer.trim() === '' && tools.length === 0) return
  const root = await rootOf($)
  const tickets = (await ticketRefsOf($, root, (await setsOf($, root)).sets)).slice(0, SUMMARY_TICKETS)
  const held = (await inboxOf($, root)).items.slice(-SUMMARY_HELD)
  const reply = await complete($, 'summary', {
    model: 'haiku',
    system: SUMMARY_RULES,
    prompt: [
      `Tickets:\n${tickets.length === 0 ? 'none' : tickets.map((one, at) => `${at + 1}. ${labelOf(one.set)} · ${one.title}`).join('\n')}`,
      `Items already in the inbox, newest last:\n${held.length === 0 ? 'none yet' : held.map(heldLine).join('\n')}`,
      `The developer asked:\n${(turn[0]?.text ?? '').slice(0, 2000)}`,
      tools.length === 0 ? '' : `Tools used:\n${tools.slice(-40).join('\n')}`,
      `The assistant's final answer:\n${answer.slice(0, 4000)}`,
    ]
      .filter(part => part !== '')
      .join('\n\n'),
    maxTokens: 1000,
    timeoutMs: 60_000,
  })
  const drafts = reply.isAnswered ? parseItems(reply.text, tickets) : undefined
  if (drafts === undefined || drafts.length === 0) return
  // Read again: a refresh may have tidied the inbox while the model was answering.
  await $.store.set(inboxKey(root), addItems(await inboxOf($, root), drafts, await $.clock.now()))
  for (const draft of drafts) {
    if (draft.kind === 'needs-you') $.ui.toast(`Needs you: ${draft.short}`, { timeoutMs: 8000 })
  }
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

/** Whether ambient motion is on, as the store holds it; on when nothing is saved, and on when the store cannot be read, so the sidekick keeps going without it. */
const storedMotion = async ($: Dollar): Promise<boolean> => {
  try {
    return parseMotion(await $.store.get(MOTION))
  } catch (error) {
    $.ui.log(`sidekick: ${String(error)}`, { to: 'debug' })

    return true
  }
}

/** Reads the override of the project the session is in now, unless the one in memory is already for it. */
const followProject = async ($: Dollar): Promise<void> => {
  const root = await rootOrNone($)
  if (root === undefined || projectRoot() === root) return
  setProjectLook((await storedLook($, lookKey('project', root))) ?? {}, root)
  // The other project may show another character, with other things to do while it rests.
  sceneOf($).activity.lookChanged()
}

const quietly = (work: Promise<unknown>, $: Dollar): void => {
  void work.catch(error => $.ui.log(`sidekick: ${String(error)}`, { to: 'debug' }))
}

/** Makes the set the session's active one and closes the picker; it holds until another pick or touch. */
const choose = async ($: Dollar, id: string): Promise<void> => {
  const root = await rootOf($)
  await $.store.set(activeKey(root, await $.session.id()), id)
  isChoosing = false
  await refresh($)
}

/** A new markdown file written in a folder that looks like a ticket home no place covers: a search adds its place. */
const adopt = async ($: Dollar, _root: string, tool: string, relative: string | undefined): Promise<void> => {
  if (tool !== 'Write' || relative === undefined || !/\.md$/i.test(relative)) return
  const folder = relative.slice(0, Math.max(0, relative.lastIndexOf('/')))
  if (folder === '' || !LIKELY.test(folder) || isSearching || probed.has(folder)) return
  if (relative.split('/').some(part => part === '..' || isSkipped(part))) return
  probed.add(folder)
  await refresh($, `tickets are in ${folder}/`, relative)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'sidekick',
      description: "Show this project's summary and ticket progress in a pane",
      argumentHint: '[close]',
    })
    await $.command.register({
      name: 'sidekick-rescan',
      description: 'Look again for where this project keeps its tickets',
      argumentHint: '[hint, e.g. tickets are in docs/tasks]',
    })
    await $.command.register({
      name: 'sidekick-pick',
      description: 'Choose which ticket set the pane shows',
      argumentHint: '[number or name]',
    })
    await $.command.register({
      name: 'sidekick-look',
      description: "Choose the sidekick's character, accessories and background",
      argumentHint: '[character=classic head=cap background=dusk]',
    })
    await $.command.register({
      name: 'sidekick-motion',
      description: "Turn the sidekick's ambient motion off or on, for all projects",
      argumentHint: '[off|on]',
    })
    await $.command.register({
      name: 'sidekick-cost',
      description: "Show what the sidekick's own model calls cost, this session and all time",
    })
    // A session that ended mid-turn may never have raised turn.complete; the new one starts with no turn running, and no subagents.
    sceneOf($).activity.set('turn', false)
    // A new session shows the inbox, not a detail an earlier one left open.
    opened = undefined
    running.clear()
    setSavedLook((await storedLook($, LOOK)) ?? {})
    const root = await rootOrNone($)
    setProjectLook((await storedLook($, lookKey('project', root))) ?? {}, root)
    // The look is in place before the activity asks what the character plays on its own.
    sceneOf($).activity.setMotion(await storedMotion($))
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
    isKept = false
    const { progress, sets } = await refresh($, e.args.trim(), undefined, true)
    const reading =
      progress !== null
        ? `${progress.source}: ${progress.done}/${progress.total} done`
        : sets.length > 1
          ? `${sets.length} ticket sets. /sidekick-pick chooses one`
          : undefined

    return {
      text:
        reading === undefined
          ? 'No tickets found. Try a hint: /sidekick-rescan tickets are in docs/tasks'
          : isKept
            ? `Found nothing new; still reading ${reading}.`
            : `Reading tickets from ${reading}.`,
    }
  })

  on('command.run', { command: 'sidekick-pick' }, async ($, e) => {
    const root = await rootOrNone($)
    if (root === undefined) return { text: 'Could not find the project.' }
    const { sets } = await setsOf($, root)
    if (sets.length === 0) return { text: 'No ticket sets found. /sidekick-rescan looks again.' }
    if (sets.length === 1) return { text: `Only one ticket set here: ${labelOf(sets[0]?.id ?? '')}.` }
    let query = e.args.trim()
    if (query === '' && sets.length > ASK_OPTIONS) {
      // The dialog holds four options at most; more sets are chosen in the pane, which gets the keys.
      await refresh($, undefined, undefined, true)
      const opened = await $.ui.open({ id: PANE, title: 'Sidekick', focus: true })

      return {
        text: `Pick a ticket set in the pane (${sets.length} sets).${opened.isPlaced ? '' : ' The pane is not drawn; widen the terminal.'}`,
      }
    }
    if (query === '') {
      const shown = sets.slice(0, ASK_OPTIONS)
      const labels = shown.map(set => labelOf(set.id))
      // Two sets with one name are told apart by their whole id.
      const options = labels.map((label, at) => (labels.indexOf(label) === at ? label : (shown[at]?.id ?? label)))
      try {
        query = await $.ui.ask('Which ticket set?', { options, header: 'Tickets' })
      } catch {
        return { text: 'Pick cancelled.' }
      }
      const at = options.indexOf(query)
      if (at >= 0) query = shown[at]?.id ?? query
    }
    const chosen = findSet(sets, query)
    if (chosen === 'none') return { text: `No ticket set matches "${query}". /sidekick-pick shows the choices.` }
    if (chosen === 'many') return { text: `More than one ticket set matches "${query}". Type more of the name.` }
    await $.store.set(activeKey(root, await $.session.id()), chosen.id)
    isChoosing = false
    const next = await refresh($)
    const entry = next.sets.find(one => one.id === chosen.id)

    return {
      text: entry === undefined ? `Showing ${labelOf(chosen.id)}.` : `Showing ${entry.label}: ${entry.done}/${entry.total} done.`,
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
    sceneOf($).activity.repaint()
    $.ui.invalidate('ui.render')

    return { text: change.text }
  })

  on('command.run', { command: 'sidekick-motion' }, async ($, e) => {
    // Another terminal may have changed the setting since this session read it, so the store is the truth.
    const { activity } = sceneOf($)
    const held = await storedMotion($)
    activity.setMotion(held)
    if (e.args.trim() === '') return { text: motionReport(held) }
    const change = changeMotion(e.args)
    if (!change.isSaved) return { text: change.text }
    try {
      await $.store.set(MOTION, change.isOn)
    } catch (error) {
      $.ui.log(`sidekick: ${String(error)}`, { to: 'debug' })

      return { text: 'Could not save the setting. Nothing was changed.' }
    }
    activity.setMotion(change.isOn)

    return { text: change.text }
  })

  on('command.run', { command: 'sidekick-cost' }, async $ => {
    const root = await rootOrNone($)
    if (root === undefined) return { text: 'Could not find the project.' }
    // Calls still being added are waited for, so the report includes them.
    await costWrites
    const session = parseSession(await $.store.get(sessionCostKey(root)), await $.session.id())

    return { text: costReport(session, parseTotals(await $.store.get(costKey(root)))) }
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
        if (id === undefined) {
          await adopt($, root, String(e.tool), relative)

          return
        }
        // Only reading or editing a ticket picks its set; a Write may be a new ticket and picks none.
        if (TOUCH_TOOLS.has(String(e.tool))) await choose($, id)
        else await refresh($)
      })(),
      $,
    )

    return ran
  })

  // A /clear fires no session.start; session.end with reason 'clear' is the only sign of it.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      clearedSession = e.sessionId
      knownSession = undefined
      quietly(refresh($), $)
    }

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    // The first prompt after the picker appeared may name a set; one that names exactly one picks it.
    if (isChoosing) {
      quietly(
        (async () => {
          const named = namedIn((await setsOf($, await rootOf($))).sets, e.text)
          if (named !== undefined) await choose($, named.id)
        })(),
        $,
      )
    }
    // The session may have moved to another project since the last refresh; draw that project's look.
    await followProject($)
    await syncShown($)
    // A subagent run raises no turn.start, so this is always the main conversation's turn.
    const { activity } = sceneOf($)
    const isWriting = activity.has('turn')
    activity.set('turn', true)
    // A turn that follows one with no end is not a change of conditions, but the project's look may be.
    if (isWriting) activity.repaint()

    return next(e)
  })

  // A teammate idles between turns instead of ending, so only subagents are counted.
  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.agentId !== undefined && e.isTeammate !== true) {
      running.add(started.agentId)
      $.ui.invalidate('ui.render')
    }

    return started
  })

  on('turn.complete', async ($, e, next) => {
    const ended = await next(e)
    // A subagent's run is one turn, whatever ended it.
    if (e.agentId !== undefined && running.delete(e.agentId)) $.ui.invalidate('ui.render')
    await syncShown($)
    if (e.agentId === undefined) sceneOf($).activity.set('turn', false)
    // The first turn ended with no pick: the picker gives way to the hint line.
    if (e.agentId === undefined && isChoosing) {
      isChoosing = false
      quietly(refresh($), $)
    }
    if (e.agentId === undefined && e.reason === 'answer') {
      quietly(
        summarize($, e.answer).then(() => refresh($)),
        $,
      )
    }

    return ended
  })

  // The engine scrolls only to something drawn, never to a row number, so going back asks for the top and lands where the inbox stood.
  on('ui.scroll', { component: 'Pane', requestId: PANE }, async (_, e, next) => {
    if (scrollTo === undefined || e.origin.kind !== 'plugin') return next(e)

    return next({ ...e, offset: scrollTo })
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    // The host draws the pane when it is shown, so a render is also the news that it is, before the picture is read.
    await syncShown($)
    const table = $.ui.resolve(e)
    const { Box, Text, Button } = table
    // The mobile app draws no Select yet, so only the tables that declare one offer it.
    const Select = 'Select' in table ? table.Select : undefined
    const { project, isSearching: isLooking, inbox, progress, sets, current, isChoosing: isListed, tab } = await read($, view)
    // One column of padding on each side; the bar and rules span what is left.
    const columns = Math.max(12, e.props.bodyColumns - 2)
    const rows = progress?.rows ?? []
    const focus = rows.findIndex(row => row.state !== 'done' && row.title === progress?.next)
    // What the header, the bar, the tabs and the lines around the list take; the list has the rest.
    const room = Math.max(3, e.props.scroll.bodyRows - 16)
    const steady = windowOf(rows.length, Math.max(0, focus), room)
    // A row being struck is brought into view for the strike, then the list goes back to the next ticket.
    const { activity, strike } = sceneOf($)
    const struck = strike === undefined ? -1 : rows.findIndex(row => row.state === 'done' && strike.rows.has(row.title))
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
    // Two or more sets and none active: the picker shows, or after the first turn only a hint.
    const isUndecided = sets.length > 1 && current === ''
    const isComplete = progress !== null && progress.done === progress.total
    const accent = isComplete ? 'success' : 'claude'
    const filled = progress === null ? 0 : Math.round((progress.done / progress.total) * columns)
    const agents = running.size
    const isWorking = inbox.working.length + agents > 0
    const isInboxEmpty = inbox.needsYou.length + inbox.review.length + inbox.reviewed === 0 && !isWorking
    const now = await $.clock.now()
    // Every inbox line is cut to the pane's width: a heading; a glyph and a title; a detail indented under it.
    const heading = (text: string, color: Mark['color']) => (
      <Text bold color={color}>
        {fit(text, columns)}
      </Text>
    )
    // A NEEDS YOU row opens its detail from the ▸ at its end (a click on the row itself is the reply's, ticket 10).
    const asked = (one: InboxView['needsYou'][number]) => {
      const mark = ASKED[one.kind]

      return (
        <Box key={`ask-${one.id}`} flexDirection="column">
          <Box flexDirection="row" justifyContent="space-between">
            <Text>
              <Text color={mark.color}>{mark.glyph} </Text>
              {fit(one.ticket === null ? one.short : inboxTitle(one.ticket), columns - 4)}
            </Text>
            <Button key={`open-ask-${one.id}`} plain label="▸" onPress={() => quietly(openDetail($, { item: one.id }, mark, true), $)} />
          </Box>
          {/* An item of no ticket is its short line alone; one of a ticket has the ticket above it. */}
          {one.ticket !== null && <Text>{`  ${fit(one.short, columns - 2)}`}</Text>}
        </Box>
      )
    }
    // Any other row is a Button as a whole: a click, or Enter under the keyboard's focus, opens its detail.
    const entry = (key: string, mark: Mark, title: string, detail: string, onPress: () => void) => (
      <Box key={key} flexDirection="column">
        <Button key={`open-${key}`} plain label={`${mark.glyph} ${fit(title, columns - 2)}`} onPress={onPress} />
        <Text>{`  ${fit(detail, columns - 2)}`}</Text>
      </Box>
    )
    const ticketOf = (title: string): TicketRef => ({ set: current, title })
    // The detail in the inbox's place: every line wraps to the pane, and the pane scrolls a detail taller than it.
    const detailView = (shown: NonNullable<typeof opened>) => {
      const { detail, mark } = shown
      const line = (key: string, text: string, isBold = false) => (
        <Text key={key} wrap="wrap" bold={isBold}>
          {text}
        </Text>
      )

      return (
        <Box key="detail" flexDirection="column" marginTop={1}>
          <Button key="back" plain hotkey="b" label="← Back" onPress={() => quietly(closeDetail($), $)} />
          <Text wrap="wrap" bold>
            <Text color={mark.color}>{mark.glyph} </Text>
            {detail.title}
          </Text>
          {detail.short !== null && line('short', detail.short)}
          {detail.goal !== null && line('goal-heading', 'Goal', true)}
          {detail.goal !== null && line('goal', detail.goal)}
          {detail.long !== '' && line('long', detail.long)}
          {detail.happened.length > 0 && line('happened-heading', 'What happened', true)}
          {detail.happened.map((one, at) => line(`happened-${at}`, `· ${one}`))}
          {detail.boxes > 0 && line('evidence-heading', `Evidence · ${detail.ticked.length}/${detail.boxes} ticked`, true)}
          {detail.ticked.map((one, at) => line(`ticked-${at}`, `${GLYPH.done} ${one}`))}
          {detail.isReviewable && <Button key="mark-reviewed" plain hotkey="r" label="Mark reviewed" onPress={() => quietly(markOpened($), $)} />}
        </Box>
      )
    }
    if (opened === undefined) inboxOffset = e.props.scroll.offset
    const dropped = leftOut()
    // Only the terminal has a cell grid to draw the character on.
    const buddy =
      e.surface === 'terminal'
        ? (() => {
            const { Raster } = $.ui.resolve(e)

            const { animation, frame } = activity.shown()

            return <Raster key={BUDDY} columns={SPRITE.columns} rows={SPRITE.rows} cells={cellsOf(animation, frame)} />
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
            {/* On a line of its own, so a long project name never pushes it out of a narrow pane. */}
            {sessionDollars > 0 && <Text dimColor>{shortDollars(sessionDollars)}</Text>}
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
        <Box key="tabs" flexDirection="row" gap={2} marginTop={1}>
          {/* The tab shown is marked by its glyph as well as its strength, so it never rests on colour. */}
          <Button
            key="tab-inbox"
            plain
            hotkey="i"
            dimColor={tab !== 'inbox'}
            label={`${tab === 'inbox' ? '●' : '○'} Inbox${inbox.needsYou.length > 0 ? ` · ${inbox.needsYou.length}` : ''}`}
            onPress={() => quietly(chooseTab($, 'inbox'), $)}
          />
          <Button
            key="tab-tickets"
            plain
            hotkey="t"
            dimColor={tab !== 'tickets'}
            label={`${tab === 'tickets' ? '●' : '○'} Tickets`}
            onPress={() => quietly(chooseTab($, 'tickets'), $)}
          />
        </Box>
        {/* The picker asks for a set whichever tab shows. */}
        {sets.length > 1 && isListed && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Pick a ticket set:</Text>
            {sets.length > SET_ROWS && Select !== undefined ? (
              <Select
                key="set-select"
                autoFocus
                value={current === '' ? undefined : current}
                options={sets.map(one => ({ value: one.id, label: `${one.label} ${one.done}/${one.total}` }))}
                onSelect={value => quietly(choose($, value), $)}
              />
            ) : (
              sets.map((one, at) => (
                <Button
                  key={`set-${at + 1}`}
                  plain
                  hotkey={String(at + 1)}
                  dimColor={one.id !== current}
                  label={`${one.id === current ? '›' : ' '} ${at + 1}: ${one.label} ${one.done}/${one.total}`}
                  onPress={() => quietly(choose($, one.id), $)}
                />
              ))
            )}
          </Box>
        )}
        {tab === 'tickets' ? (
          <Box key="tickets" flexDirection="column">
            {!isLooking && progress === null && !isUndecided && (
              <Box marginTop={1}>
                <Text dimColor>○ No tickets here. /sidekick-rescan looks again.</Text>
              </Box>
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
                  if (row.state === 'done' && was !== undefined && strike !== undefined && isStruck(step, strike.steps)) {
                    return struckRow(row.title, was, step, columns)
                  }

                  return (
                    <Text wrap="truncate-end" dimColor={row.state === 'done'} strikethrough={row.state === 'done'} bold={isNext}>
                      <Text color={row.state === 'done' ? 'success' : isNext ? 'claude' : 'text'}>{GLYPH[row.state]} </Text>
                      {shortTitle(row.title)}
                    </Text>
                  )
                })}
                {end < rows.length && <Text dimColor>↓ {rows.length - end} more</Text>}
              </Box>
            )}
            {sets.length > 1 && !isListed && (
              <Box marginTop={1}>
                <Text dimColor wrap="truncate-end">
                  {isUndecided ? `${sets.length} ticket sets · /sidekick-pick` : `${sets.length} sets · /sidekick-pick`}
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
        ) : opened !== undefined ? (
          // The detail takes the inbox's place in the Inbox tab.
          detailView(opened)
        ) : (
          <Box key="inbox" flexDirection="column" marginTop={1}>
            {isInboxEmpty && <Text dimColor>{fit('Nothing in the inbox yet.', columns)}</Text>}
            {inbox.needsYou.length > 0 && (
              <Box flexDirection="column">
                {heading(`NEEDS YOU · ${inbox.needsYou.length}`, 'warning')}
                {inbox.needsYou.map(asked)}
              </Box>
            )}
            {inbox.review.length > 0 && (
              <Box flexDirection="column" marginTop={inbox.needsYou.length > 0 ? 1 : 0}>
                {heading(`READY TO REVIEW · ${inbox.review.length}`, 'suggestion')}
                {inbox.review.map((one, at) => {
                  const { glyph, text } = reviewLine(one)
                  const mark: Mark = { glyph, color: glyph === '✓' ? 'success' : 'warning' }

                  return entry(`review-${at}`, mark, inboxTitle(one.title), text, () => quietly(openDetail($, { ticket: ticketOf(one.title) }, mark, true), $))
                })}
              </Box>
            )}
            {isWorking && (
              <Box flexDirection="column" marginTop={inbox.needsYou.length + inbox.review.length > 0 ? 1 : 0}>
                {heading(workingHeading(inbox.working.length, agents), 'claude')}
                {inbox.working.map((one, at) => {
                  const mark: Mark = { glyph: GLYPH.active, color: 'claude' }

                  return entry(`working-${at}`, mark, inboxTitle(one.title), workingLine(one, now), () =>
                    quietly(openDetail($, { ticket: ticketOf(one.title) }, mark, false), $),
                  )
                })}
              </Box>
            )}
            {inbox.reviewed > 0 && (
              <Box marginTop={inbox.needsYou.length + inbox.review.length > 0 || isWorking ? 1 : 0}>
                <Text dimColor>{fit(`REVIEWED · ${inbox.reviewed}`, columns)}</Text>
              </Box>
            )}
          </Box>
        )}
      </Box>
    )
  })
}
