import { expect } from 'claude-code/testing'
import { addCall, costReport, dollarsOf, emptyTotals, HAIKU_PRICE, parseSession, parseTotals, shortDollars, totalOf } from '../hooks/cost'
import { test } from './world'

// The sidekick's own cost, at the pure level: adding up each call's usage, and pricing it.

const usage = (input: number, output: number, cacheWrite = 0, cacheRead = 0) => ({
  input_tokens: input,
  output_tokens: output,
  cache_creation_input_tokens: cacheWrite,
  cache_read_input_tokens: cacheRead,
})

test('each call adds one call and its four token counts to its own kind', () => {
  let totals = emptyTotals()
  totals = addCall(totals, 'summary', usage(1000, 50, 10, 20))
  totals = addCall(totals, 'summary', usage(500, 25))
  totals = addCall(totals, 'search', usage(4000, 100))
  expect(totals.summary).toEqual({ calls: 2, input: 1500, output: 75, cacheWrite: 10, cacheRead: 20 })
  expect(totals.search).toEqual({ calls: 1, input: 4000, output: 100, cacheWrite: 0, cacheRead: 0 })
})

test('a call with no usage (it threw before any reply) still counts as a call', () => {
  const totals = addCall(emptyTotals(), 'search', undefined)
  expect(totals.search).toEqual({ calls: 1, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 })
})

test('adding leaves the totals it was given unchanged', () => {
  const before = emptyTotals()
  addCall(before, 'summary', usage(1, 1))
  expect(before).toEqual(emptyTotals())
})

test('dollars are each count times its Haiku price per million tokens', () => {
  const tally = { calls: 1, input: 1_000_000, output: 1_000_000, cacheWrite: 1_000_000, cacheRead: 1_000_000 }
  const sum = HAIKU_PRICE.input + HAIKU_PRICE.output + HAIKU_PRICE.cacheWrite + HAIKU_PRICE.cacheRead
  expect(Math.abs(dollarsOf(tally) - sum)).toBeLessThan(1e-12)
  expect(Math.abs(dollarsOf({ calls: 1, input: 2000, output: 100, cacheWrite: 0, cacheRead: 0 }) - 0.00025)).toBeLessThan(1e-12)
  expect(dollarsOf({ calls: 3, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 })).toBe(0)
})

test('the price is Haiku 5.5 as published for prompts up to 100,000 tokens', () => {
  expect(HAIKU_PRICE).toEqual({ input: 0.1, cacheWrite: 0.125, cacheRead: 0.01, output: 0.5 })
})

test('the total adds both kinds', () => {
  let totals = addCall(emptyTotals(), 'summary', usage(10, 1))
  totals = addCall(totals, 'search', usage(20, 2, 3, 4))
  expect(totalOf(totals)).toEqual({ calls: 2, input: 30, output: 3, cacheWrite: 3, cacheRead: 4 })
})

test('the short dollar figure is marked an estimate and stays narrow', () => {
  expect(shortDollars(0.0042)).toBe('~$0.004')
  expect(shortDollars(0.0004)).toBe('<$0.001')
  expect(shortDollars(0)).toBe('$0')
  expect(shortDollars(0.25)).toBe('~$0.250')
  expect(shortDollars(12.345)).toBe('~$12.35')
  for (const dollars of [0, 0.0001, 0.004, 0.999, 9.99, 999.99]) expect(shortDollars(dollars).length).toBeLessThanOrEqual(8)
})

test('totals read back from the store; anything unreadable reads as nothing spent', () => {
  const totals = addCall(emptyTotals(), 'summary', usage(10, 1))
  expect(parseTotals(JSON.parse(JSON.stringify(totals)))).toEqual(totals)
  expect(parseTotals(undefined)).toEqual(emptyTotals())
  expect(parseTotals('lots')).toEqual(emptyTotals())
  expect(parseTotals({ summary: { calls: 'two' } })).toEqual(emptyTotals())
  // One readable kind is kept when the other is not.
  expect(parseTotals({ summary: totals.summary, search: null })).toEqual(totals)
})

test("a session's totals are read back only for the same session; another session starts over", () => {
  const totals = addCall(emptyTotals(), 'search', usage(10, 1))
  const saved = { session: 's1', totals }
  expect(parseSession(saved, 's1')).toEqual(totals)
  expect(parseSession(saved, 's2')).toEqual(emptyTotals())
  expect(parseSession(undefined, 's1')).toEqual(emptyTotals())
})

test('the report gives calls, tokens and dollars by kind, for the session and all time', () => {
  const session = addCall(emptyTotals(), 'summary', usage(2000, 100))
  let allTime = addCall(session, 'summary', usage(8000, 400))
  allTime = addCall(allTime, 'search', usage(10_000, 200, 0, 1000))
  const text = costReport(session, allTime)
  expect(text).toContain('This session')
  expect(text).toContain('All time in this project')
  expect(text).toMatch(/summary\s+1 call\s+2,000 in\s+100 out\s+<\$0\.001/)
  expect(text).toMatch(/summary\s+2 calls\s+10,000 in\s+500 out\s+~\$0\.001/)
  // Cache reads and writes are input: they are shown with it and priced at their own rates.
  expect(text).toMatch(/search\s+1 call\s+11,000 in\s+200 out\s+~\$0\.001/)
  expect(text).toMatch(/search\s+0 calls/)
  expect(text).toContain('estimate')
  expect(text).toContain('Haiku 5.5')
})
