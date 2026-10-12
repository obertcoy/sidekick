import { expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { TurnCompleteInput } from 'claude-code'

import { PANE, SURFACES, answered, failed, world } from './world'
import type { Reply, World } from './world'

// A project with no tickets: the only model calls are the summary's.
const ROOT = '/work/notes'
const FIRST = '{"change":true,"happened":"Built the cart.","next":"Add payment.","needsYou":"Pick a payment provider."}'
const SECOND = '{"change":true,"happened":"Dropped the cart.","next":"Start over.","needsYou":""}'

const ANSWERED = { answer: 'Built it.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const

const endTurn = async ($: Engine, clock: MockClock, turn: Partial<TurnCompleteInput> = {}): Promise<void> => {
  await $.turn.complete({ ...ANSWERED, ...turn } as TurnCompleteInput)
  await clock.settle()
}

/** Ends one answered turn whose reply sets the first summary, and checks the pane shows it. */
const withSummary = async ($: Engine, clock: MockClock, w: World): Promise<void> => {
  w.answer = () => answered(FIRST)
  await endTurn($, clock)
  expect(w.asked.length).toBe(1)
  await expectSummary($)
}

const expectSummary = async ($: Engine): Promise<void> => {
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: 'Built the cart.' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /NEEDS YOU\s+Pick a payment provider\./ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Dropped the cart.' })).toBeUndefined()
    await ui.unmount()
  }
}

test("a subagent's turn makes no model call and leaves the pane's summary unchanged", async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const w = world(on, ROOT)
  await withSummary($, clock, w)

  w.answer = () => answered(SECOND)
  await endTurn($, clock, { agentId: 'a1b2c3', answer: 'Report: dropped the cart.', turnId: 't2' })
  expect(w.asked.length).toBe(1)
  await expectSummary($)
})

test('an interrupted turn, an errored turn and a refused turn each make no model call', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const w = world(on, ROOT)
  await withSummary($, clock, w)

  w.answer = () => answered(SECOND)
  const ends: Partial<TurnCompleteInput>[] = [
    { reason: 'aborted', isAborted: true, answer: 'Dropping the ca', turnId: 't2' },
    { reason: 'error', answer: '', turnId: 't3' },
    { reason: 'refusal', refusal: { category: 'cyber', explanation: null }, answer: 'I can’t help with that.', turnId: 't4' },
  ]
  for (const end of ends) {
    await endTurn($, clock, end)
    expect(w.asked.length).toBe(1)
  }
  await expectSummary($)
})

test('a turn with an empty answer and no tool use makes no model call', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const w = world(on, ROOT)
  await withSummary($, clock, w)

  w.answer = () => answered(SECOND)
  w.messages = [
    { role: 'user', text: 'Think about it.', toolUses: [] },
    { role: 'assistant', text: '', toolUses: [] },
  ]
  await endTurn($, clock, { answer: '', turnId: 't2' })
  await endTurn($, clock, { answer: '  \n ', turnId: 't3' })
  expect(w.asked.length).toBe(1)
  await expectSummary($)

  // An empty answer after tool use is still a turn that may have moved the work.
  w.messages = [
    { role: 'user', text: 'Delete the cart.', toolUses: [] },
    { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'u1', tool: 'Bash', input: { command: 'rm -r cart' } }] },
  ]
  await endTurn($, clock, { answer: '', turnId: 't4' })
  expect(w.asked.length).toBe(2)
  expect(w.asked[1]).toContain('Bash rm -r cart')
})

test('a reply that is not valid for a summary keeps the stored summary', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const w = world(on, ROOT)
  await withSummary($, clock, w)

  const replies = [
    'Dropped the cart.',
    '{"change":true,"happened":"Dropped the cart."',
    '{"change":"yes","happened":"Dropped the cart.","next":"Start over.","needsYou":""}',
    '{"change":true,"happened":"","next":"","needsYou":"Dropped the cart."}',
    '["Dropped the cart."]',
  ]
  for (const [index, reply] of replies.entries()) {
    w.answer = () => answered(reply)
    await endTurn($, clock, { turnId: `t${index + 2}` })
    expect(w.asked.length).toBe(index + 2)
    await expectSummary($)
  }
})

test('a failed model call keeps the stored summary', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const w = world(on, ROOT)
  await withSummary($, clock, w)

  w.answer = () => failed
  await endTurn($, clock, { turnId: 't2' })
  expect(w.asked.length).toBe(2)
  await expectSummary($)

  w.answer = () => {
    throw new Error('connection reset')
  }
  await endTurn($, clock, { turnId: 't3' })
  expect(w.asked.length).toBe(3)
  await expectSummary($)
})

test("the turn's own result reaches the engine unchanged and is not delayed by summarising", async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const w = world(on, ROOT)
  let release: (reply: Reply) => void = () => undefined
  w.answer = () => new Promise<Reply>(resolve => (release = resolve))
  const usage = {
    input_tokens: 3,
    output_tokens: 4,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    model: 'claude-opus-5-5',
  }
  w.endTurn = e => ({ text: `${e.answer} (shown)`, usage })

  // The model has not answered, yet the turn's end has already come back whole.
  const ended = await $.turn.complete({ ...ANSWERED })
  expect(ended).toEqual({ text: 'Built it. (shown)', usage })
  await clock.settle()
  expect(w.asked.length).toBe(1)
  const before = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await before.find({ type: 'Text', text: 'Built the cart.' })).toBeUndefined()
  await before.unmount()

  release(answered(FIRST))
  await clock.settle()
  await expectSummary($)
})
