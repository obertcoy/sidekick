import type { On } from 'claude-code'
import type { Engine, MockClock } from 'claude-code/testing'
import { expect, mock } from 'claude-code/testing'
import { viewIn } from '../hooks/sprite'
import type { Reply, World } from './world'
import { addSet, PANE, QUIET, RECIPE, RUN, SURFACES, test, ticket, world } from './world'

// The sidekick's own cost, whole-mod: the small model answers with mocked usage, and the pane and /sidekick-cost
// show what the summary and the search calls added up to.

const ROOT = '/work/shop'
const COST = { command: 'sidekick-cost', ...RUN } as const
const TICKETS = { '01-cart.md': ticket('01: Cart', 'in-progress') }

type Counts = { input?: number; output?: number; cacheWrite?: number; cacheRead?: number }

const usage = ({ input = 0, output = 0, cacheWrite = 0, cacheRead = 0 }: Counts = {}) => ({
  input_tokens: input,
  output_tokens: output,
  cache_creation_input_tokens: cacheWrite,
  cache_read_input_tokens: cacheRead,
})

const reply = (text: string, counts?: Counts): Reply => ({ isAnswered: true, text, usage: usage(counts) })
const apiError = (counts?: Counts): Reply => ({ isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage: usage(counts) })
// The timeout of a call arrives as `aborted`, an arm the world's own Reply does not list.
const timedOut = (): Reply => ({ isAnswered: false, reason: 'aborted', usage: usage() }) as unknown as Reply

const isSummary = (prompt: string): boolean => prompt.startsWith('Tickets:')

const openStore = (on: On, data: Record<string, unknown>) => {
  const store = new Map<string, unknown>(Object.entries({ ...QUIET, ...data }))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)

    return { value: undefined }
  })

  return store
}

type Open = { clock: MockClock; w: World; store: Map<string, unknown> }

/**
 * A session in a project with tickets (so the session starts with a search) or none (no call at all).
 * `search` and `summary` answer the two kinds of call.
 */
const start = async (
  $: Engine,
  on: On,
  {
    saved = {},
    tickets = true,
    search = reply(RECIPE),
    summary = () => reply('{"items":[]}'),
  }: {
    saved?: Record<string, unknown>
    tickets?: boolean
    search?: Reply
    summary?: () => Reply
  } = {},
): Promise<Open> => {
  const clock = mock.clock(on)
  const store = openStore(on, saved)
  const w = world(on, ROOT)
  if (tickets) addSet(w, ROOT, 'checkout', TICKETS, 5)
  w.answer = prompt => (isSummary(prompt) ? summary() : search)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await clock.settle()

  return { clock, w, store }
}

const endTurn = async ($: Engine, clock: MockClock, id: string): Promise<void> => {
  await $.turn.complete({ answer: 'Built it.', durationMs: 1, isAborted: false, turnId: id, reason: 'answer' })
  await clock.settle()
}

/** The report's line for `kind` under the heading that starts with `heading`. */
const lineOf = (text: string | undefined, heading: string, kind: string): string => {
  const lines = (text ?? '').split('\n')
  const at = lines.findIndex(one => one.startsWith(heading))

  return lines.slice(at + 1).find(one => one.trim().startsWith(kind)) ?? ''
}

test('the command is registered at session start', async ($, on) => {
  const { w } = await start($, on, { tickets: false })
  expect(w.registered).toContain('sidekick-cost')
})

test('every summary and search call adds its usage, including calls that failed, timed out or threw', async ($, on) => {
  const replies: (() => Reply)[] = [
    () => reply('{"items":[]}', { input: 1000, output: 50, cacheRead: 300 }),
    () => apiError({ input: 200 }),
    () => timedOut(),
    () => {
      throw new Error('connection reset')
    },
  ]
  const ends = replies.length
  // Each turn's summary takes the next reply.
  const { clock, w } = await start($, on, { search: reply(RECIPE, { input: 3000, output: 100 }), summary: () => (replies.shift() ?? timedOut)() })
  for (let turn = 1; turn <= ends; turn += 1) await endTurn($, clock, `t${turn}`)
  expect(w.asked.filter(isSummary).length).toBe(4)

  const { text } = await $.command.run({ ...COST, args: '' })
  for (const heading of ['This session', 'All time']) {
    expect(lineOf(text, heading, 'summary')).toMatch(/summary\s+4 calls\s+1,500 in\s+50 out\s/)
    expect(lineOf(text, heading, 'search')).toMatch(/search\s+1 call\s+3,000 in\s+100 out\s/)
    expect(lineOf(text, heading, 'total')).toMatch(/total\s+5 calls\s+4,500 in\s+150 out\s/)
  }
})

test("the pane's header shows this session's estimated cost, dim, once the sidekick has spent anything, and it fits at 40 columns", async ($, on) => {
  const { clock } = await start($, on, { tickets: false, summary: () => reply('{"items":[]}', { input: 30_000, output: 2000 }) })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /\$/ }), 'nothing spent, nothing shown').toBeUndefined()
    await ui.unmount()
  }

  await endTurn($, clock, 't1')
  // At 40 columns, less a column of padding each side, the header's text column is what the sprite and the gap leave.
  const room = PANE.props.bodyColumns - 2 - viewIn({ columns: PANE.props.bodyColumns, rows: PANE.props.scroll.bodyRows }).columns - 1
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const cost = await ui.find({ type: 'Text', text: '~$0.004' })
    expect(cost, surface).toBeDefined()
    expect(cost?.text).toBe('~$0.004')
    expect(cost?.props.dimColor).toBe(true)
    expect(cost?.text.length ?? 99).toBeLessThanOrEqual(room)
    await ui.unmount()
  }
})

test('all-time totals survive a restart, while the session starts over in a new session and carries on in the same one', async ($, on) => {
  const before = { calls: 7, input: 70_000, output: 700, cacheWrite: 0, cacheRead: 0 }
  const none = { calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }
  const { clock, w, store } = await start($, on, {
    saved: {
      [`cost:${ROOT}`]: { summary: before, search: none },
      // What an earlier session spent, kept under its own id.
      [`cost-session:${ROOT}`]: { session: 's0', totals: { summary: before, search: none } },
    },
    search: reply(RECIPE, { input: 1000 }),
    summary: () => reply('{"items":[]}', { input: 100, output: 10 }),
  })
  let { text } = await $.command.run({ ...COST, args: '' })
  expect(lineOf(text, 'This session', 'summary')).toMatch(/summary\s+0 calls/)
  expect(lineOf(text, 'This session', 'search')).toMatch(/search\s+1 call\s+1,000 in/)
  expect(lineOf(text, 'All time', 'summary')).toMatch(/summary\s+7 calls\s+70,000 in\s+700 out/)
  expect(lineOf(text, 'All time', 'search')).toMatch(/search\s+1 call\s+1,000 in/)

  await endTurn($, clock, 't1')
  ;({ text } = await $.command.run({ ...COST, args: '' }))
  expect(lineOf(text, 'This session', 'summary')).toMatch(/summary\s+1 call\s+100 in\s+10 out/)
  expect(lineOf(text, 'All time', 'summary')).toMatch(/summary\s+8 calls\s+70,100 in\s+710 out/)
  expect(store.get(`cost-session:${ROOT}`)).toMatchObject({ session: 's1' })

  // A /clear or a new session: what this session spent starts over; all time goes on.
  w.sessionId = 's2'
  await endTurn($, clock, 't2')
  ;({ text } = await $.command.run({ ...COST, args: '' }))
  expect(lineOf(text, 'This session', 'search')).toMatch(/search\s+0 calls/)
  expect(lineOf(text, 'This session', 'summary')).toMatch(/summary\s+1 call\s+100 in\s+10 out/)
  expect(lineOf(text, 'All time', 'summary')).toMatch(/summary\s+9 calls/)
})

test('a session resumed after a restart keeps what it had spent', async ($, on) => {
  const spent = { calls: 2, input: 2000, output: 20, cacheWrite: 0, cacheRead: 0 }
  const none = { calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }
  await start($, on, {
    tickets: false,
    saved: { [`cost:${ROOT}`]: { summary: spent, search: none }, [`cost-session:${ROOT}`]: { session: 's1', totals: { summary: spent, search: none } } },
  })
  const { text } = await $.command.run({ ...COST, args: '' })
  expect(lineOf(text, 'This session', 'summary')).toMatch(/summary\s+2 calls\s+2,000 in\s+20 out/)
})
