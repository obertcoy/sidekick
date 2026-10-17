import type { AgentInfo, AgentSpawnInput, On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, mock } from 'claude-code/testing'
import { addSet, openStore, PANE, RECIPE, RUN, SURFACES, test, world } from './world'

// The WORKING heading counts the subagents running now, from the engine's subagent events: a spawn starts one, its turn's end ends it.
const SHOP = '/work/shop'

const file = (title: string, status: string): string => `# ${title}\n\n**Status:** ${status}\n\n- [x] a\n- [ ] b\n`

const ACTIVE = { '01-cart.md': file('01: Cart', 'in-progress'), '02-ship.md': file('02: Ship', 'ready-for-agent') }
const IDLE = { '01-cart.md': file('01: Cart', 'done'), '02-ship.md': file('02: Ship', 'ready-for-agent') }

const SPAWN: AgentSpawnInput = {
  tool_use_id: 'tu',
  prompt: 'Read the README.',
  description: 'Read',
  subagentType: 'general-purpose',
  provider: { plugin: 'engine', tier: 'core' },
  parentModel: 'opus',
  background: true,
  fork: false,
}

const ENDED = { answer: 'Done.', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' } as const

/** The engine beneath: each spawn starts an agent with the next id (`a1`, `a2`, ...) unless refusing, and `agent.list` answers `listed`. */
const agents = (on: On): { listed: AgentInfo[]; isRefusing: boolean } => {
  const held = { listed: [] as AgentInfo[], isRefusing: false }
  let next = 0
  on('agent.spawn', () => {
    if (held.isRefusing) return { deny: 'no' }
    next += 1

    return { model: 'haiku', agentId: `a${next}` }
  })
  on('agent.list', () => ({ value: held.listed }))

  return held
}

/** The WORKING heading as painted on the surface, or undefined when the section is not drawn. */
const heading = async ($: Engine, surface: (typeof SURFACES)[number] = 'terminal'): Promise<string | undefined> => {
  const ui = await $.ui.mount({ ...PANE, surface })
  const texts = (await ui.findAll({ type: 'Text', text: /^WORKING/ })).map(one => one.text)
  await ui.unmount()

  return texts[0]
}

const start = async ($: Engine, on: On, tickets: Record<string, string>) => {
  const clock = mock.clock(on)
  openStore(on, { [`recipe:${SHOP}`]: JSON.parse(RECIPE) })
  const w = world(on, SHOP)
  addSet(w, SHOP, 'shop', tickets, 10)
  const engine = agents(on)
  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()

  return { clock, w, engine }
}

test('the count rises as subagents start and falls as each ends, failed or not', async ($, on) => {
  const { clock } = await start($, on, ACTIVE)
  for (const surface of SURFACES) expect(await heading($, surface)).toBe('WORKING · 1 ticket')
  await $.agent.spawn(SPAWN)
  await $.agent.spawn(SPAWN)
  await $.agent.spawn({ ...SPAWN, background: false })
  await clock.settle()
  for (const surface of SURFACES) expect(await heading($, surface)).toBe('WORKING · 1 ticket · 3 agents')
  await $.turn.complete({ ...ENDED, agentId: 'a1' })
  await clock.settle()
  expect(await heading($)).toBe('WORKING · 1 ticket · 2 agents')
  await $.turn.complete({ ...ENDED, agentId: 'a2', answer: '', reason: 'error' })
  await $.turn.complete({ ...ENDED, agentId: 'a3', answer: '', isAborted: true, reason: 'aborted' })
  await clock.settle()
  expect(await heading($)).toBe('WORKING · 1 ticket')
})

test("the main conversation's turn ending, or an agent's ending twice, does not move the count", async ($, on) => {
  const { clock } = await start($, on, ACTIVE)
  await $.agent.spawn(SPAWN)
  await $.agent.spawn(SPAWN)
  await $.turn.complete({ ...ENDED })
  await $.turn.complete({ ...ENDED, agentId: 'a1' })
  await $.turn.complete({ ...ENDED, agentId: 'a1' })
  await $.turn.complete({ ...ENDED, agentId: 'unknown' })
  await clock.settle()
  expect(await heading($)).toBe('WORKING · 1 ticket · 1 agent')
})

test('subagents running with no ticket active draw WORKING with the agents alone', async ($, on) => {
  const { clock } = await start($, on, IDLE)
  expect(await heading($)).toBeUndefined()
  await $.agent.spawn(SPAWN)
  await clock.settle()
  for (const surface of SURFACES) expect(await heading($, surface)).toBe('WORKING · 1 agent')
  await $.turn.complete({ ...ENDED, agentId: 'a1' })
  await clock.settle()
  expect(await heading($)).toBeUndefined()
})

test('a refused spawn and a teammate are not counted', async ($, on) => {
  const { clock, engine } = await start($, on, ACTIVE)
  await $.agent.spawn({ ...SPAWN, isTeammate: true })
  engine.isRefusing = true
  await $.agent.spawn(SPAWN)
  await clock.settle()
  expect(await heading($)).toBe('WORKING · 1 ticket')
})

test('a new session starts with no subagents counted', async ($, on) => {
  const { clock } = await start($, on, ACTIVE)
  await $.agent.spawn(SPAWN)
  await clock.settle()
  expect(await heading($)).toBe('WORKING · 1 ticket · 1 agent')
  await $.session.start({ cwd: SHOP, surface: 'terminal', isInteractive: true })
  await clock.settle()
  expect(await heading($)).toBe('WORKING · 1 ticket')
})

test('an agent the engine lists as ended drops out at the next refresh, even with no turn end seen', async ($, on) => {
  const { clock, engine } = await start($, on, ACTIVE)
  await $.agent.spawn(SPAWN)
  await $.agent.spawn(SPAWN)
  await clock.settle()
  const row = { description: 'Read', type: 'general-purpose' }
  engine.listed = [
    { ...row, id: 'a1', status: 'killed' },
    { ...row, id: 'a2', status: 'running' },
  ]
  // Opening the pane refreshes it, as the 20-second refresh does.
  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()
  expect(await heading($)).toBe('WORKING · 1 ticket · 1 agent')
})
