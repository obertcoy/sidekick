import type { Engine, MockClock } from 'claude-code/testing'
import { expect, mock } from 'claude-code/testing'
import type { World } from './world'
import { addSet, answered, linesIn, openStore, PANE, RECIPE, RUN, test, world } from './world'

// A click on a NEEDS YOU row opens its detail and tags the prompt; the message sent carries the tagged questions as hidden context.
const SHOP = '/work/shop'

const TICKETS = {
  '01-cart.md': '# 01: Cart\n\nThe cart keeps lines.\n\n**Status:** in-progress\n\n- [x] add\n- [ ] remove\n',
  '02-payment.md': '# 02: Payment\n\nRetries reuse the id.\n\n**Status:** in-progress\n\n- [x] Retries reuse the id\n- [ ] Covered by tests\n',
}

const items = (...list: unknown[]): string => JSON.stringify({ items: list })

const ANSWERED = { answer: 'Built it.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const

// Ids: 1 a question on Payment, 2 a blocker of no ticket.
const TURN = items(
  { kind: 'needs-you', ticket: 2, short: 'Which provider?', long: 'Card is quicker to ship; bank transfer is cheaper per payment.' },
  { kind: 'blocked', ticket: null, short: 'Staging is down', long: 'Nothing can be tried on staging until it is back.' },
)

const PAYMENT_TAG = '02 Payment: '
const STAGING_TAG = 'Staging is down: '

const start = async ($: Engine, on: Parameters<typeof world>[0]) => {
  const clock = mock.clock(on)
  openStore(on, { [`recipe:${SHOP}`]: JSON.parse(RECIPE) })
  const w = world(on, SHOP)
  addSet(w, SHOP, 'shop', TICKETS, 10)
  await $.command.run({ command: 'sidekick', args: '', ...RUN })
  await clock.settle()
  await endTurn($, clock, w, TURN)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, scroll: { offset: 0, bodyRows: 30 } } })

  return { w, ui }
}

const endTurn = async ($: Engine, clock: MockClock, w: World, text: string): Promise<void> => {
  w.answer = () => answered(text)
  await $.turn.complete({ ...ANSWERED })
  await clock.settle()
}

const send = ($: Engine, w: World) => $.prompt.submit({ text: w.draft, wait: false, origin: { kind: 'composer' } })

test('a click on a row opens its detail and adds its tag on a new line after the draft already typed', async ($, on) => {
  const { w, ui } = await start($, on)
  expect((await ui.find({ key: 'reply-ask-1' }))?.type).toBe('Button')
  w.draft = 'Thanks for the update.'
  await ui.press({ key: 'reply-ask-1' })
  expect(w.draft).toBe(`Thanks for the update.\n${PAYMENT_TAG}`)
  expect((await linesIn(ui, 'detail')).slice(0, 3)).toEqual(['← Back', '? 02 Payment', 'Which provider?'])
  await ui.unmount()
})

test('the tag goes first in an empty box, and without a second newline after one', async ($, on) => {
  const { w, ui } = await start($, on)
  await ui.press({ key: 'reply-ask-1' })
  expect(w.draft).toBe(PAYMENT_TAG)
  await ui.press({ key: 'back' })
  w.draft = 'Hello\n'
  await ui.press({ key: 'reply-ask-1' })
  expect(w.draft).toBe(`Hello\n${PAYMENT_TAG}`)
  await ui.unmount()
})

test('a second row adds a second tag on its own line, and the same row twice adds one', async ($, on) => {
  const { w, ui } = await start($, on)
  await ui.press({ key: 'reply-ask-1' })
  w.draft += 'Card.'
  await ui.press({ key: 'back' })
  await ui.press({ key: 'reply-ask-2' })
  expect(w.draft).toBe(`${PAYMENT_TAG}Card.\n${STAGING_TAG}`)
  w.draft += 'Ask ops.'
  await ui.press({ key: 'back' })
  await ui.press({ key: 'reply-ask-1' })
  expect(w.draft).toBe(`${PAYMENT_TAG}Card.\n${STAGING_TAG}Ask ops.`)
  await ui.unmount()
})

test('Back with nothing typed after the tag removes it; with text typed after it, the tag stays', async ($, on) => {
  const { w, ui } = await start($, on)
  w.draft = 'Hello'
  await ui.press({ key: 'reply-ask-1' })
  await ui.press({ key: 'back' })
  expect(w.draft).toBe('Hello')
  await ui.press({ key: 'reply-ask-2' })
  w.draft += 'Ask ops.'
  await ui.press({ key: 'back' })
  expect(w.draft).toBe(`Hello\n${STAGING_TAG}Ask ops.`)
  await ui.unmount()
})

test('the arrow opens the detail and leaves the prompt alone', async ($, on) => {
  const { w, ui } = await start($, on)
  w.draft = 'Hello'
  await ui.press({ key: 'open-ask-1' })
  expect((await linesIn(ui, 'detail'))[1]).toBe('? 02 Payment')
  expect(w.draft).toBe('Hello')
  await ui.press({ key: 'back' })
  expect(w.draft).toBe('Hello')
  await ui.unmount()
})

test('on send, every tagged question in the message is attached as hidden context, and only those', async ($, on) => {
  const { w, ui } = await start($, on)
  await ui.press({ key: 'reply-ask-1' })
  w.draft += 'Card.'
  await ui.press({ key: 'back' })
  await ui.press({ key: 'reply-ask-2' })
  w.draft += 'Ask ops.'
  await ui.press({ key: 'back' })
  await send($, w)
  expect(w.submitted).toHaveLength(1)
  const [sent] = w.submitted
  expect(sent?.text).toBe(`${PAYMENT_TAG}Card.\n${STAGING_TAG}Ask ops.`)
  expect(sent?.context).toHaveLength(2)
  expect(sent?.context?.[0]).toContain('02 Payment')
  expect(sent?.context?.[0]).toContain('Which provider?')
  expect(sent?.context?.[0]).toContain('Card is quicker to ship; bank transfer is cheaper per payment.')
  expect(sent?.context?.[1]).toContain('Staging is down')
  expect(sent?.context?.[1]).toContain('Nothing can be tried on staging until it is back.')

  // The tags were spent with the message: a later message with the same words attaches nothing.
  await send($, w)
  expect(w.submitted[1]?.context).toBeUndefined()
  await ui.unmount()
})

test('a tag the developer deleted by hand is not attached; a message with no tag is left as it is', async ($, on) => {
  const { w, ui } = await start($, on)
  await ui.press({ key: 'reply-ask-1' })
  w.draft += 'Card.'
  await ui.press({ key: 'back' })
  w.draft = 'Card.\nSaid plain, with no tag.'
  await send($, w)
  expect(w.submitted[0]?.context).toBeUndefined()

  await ui.press({ key: 'reply-ask-1' })
  w.draft += 'Card.'
  await ui.press({ key: 'back' })
  await ui.press({ key: 'reply-ask-2' })
  w.draft += 'Ask ops.'
  await ui.press({ key: 'back' })
  w.draft = `${PAYMENT_TAG}Card.`
  await send($, w)
  expect(w.submitted[1]?.context).toHaveLength(1)
  expect(w.submitted[1]?.context?.[0]).toContain('Which provider?')
  await ui.unmount()
})

test('under a dialog or headless the detail still opens and nothing breaks', async ($, on) => {
  const { w, ui } = await start($, on)
  w.isPromptHeld = true
  await ui.press({ key: 'reply-ask-1' })
  expect((await linesIn(ui, 'detail'))[1]).toBe('? 02 Payment')
  expect(w.draft).toBe('')
  await ui.press({ key: 'back' })
  expect(await ui.find({ key: 'detail' })).toBeUndefined()
  expect(w.draft).toBe('')
  // Nothing was tagged, so a message sent now carries nothing.
  await send($, w)
  expect(w.submitted[0]?.context).toBeUndefined()
  await ui.unmount()
})
