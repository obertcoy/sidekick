// The sidekick's own cost: what its calls to the small model (the summary after a turn, the search for tickets)
// spend, added up by kind. Pure; register.tsx does the storing and the drawing.
//
// Tokens are counted as the API reported them, on every call, failed ones included. Dollars are an estimate:
// tokens times the published price below, which can drift from the real bill (another model behind the alias,
// a long prompt's higher rate, US-only inference, a plan that bills otherwise).

/** The kinds of call the sidekick makes, in the order they are reported. */
export const COST_KINDS = ['summary', 'search'] as const
export type CostKind = (typeof COST_KINDS)[number]

/** One call's usage, as `$.model.complete` reports it on every arm of its result. */
export type Usage = {
  readonly input_tokens: number
  readonly output_tokens: number
  readonly cache_creation_input_tokens: number
  readonly cache_read_input_tokens: number
}

/** What calls of one kind added up to. */
export type Tally = { calls: number; input: number; output: number; cacheWrite: number; cacheRead: number }
export type Totals = Record<CostKind, Tally>

/**
 * Claude Haiku 5.5's price in US dollars per million tokens, for prompts up to 100,000 tokens (the sidekick's are far
 * smaller), with 5-minute cache writes. Taken 2026-10-17 from Anthropic's pricing reference,
 * https://platform.claude.com/docs/en/about-claude/pricing ("Model pricing" table). The mod asks for `haiku`, which
 * Claude Code resolves to the current Haiku.
 */
export const HAIKU_PRICE = { input: 0.1, cacheWrite: 0.125, cacheRead: 0.01, output: 0.5 } as const

const PER_TOKEN = 1 / 1_000_000

const emptyTally = (): Tally => ({ calls: 0, input: 0, output: 0, cacheWrite: 0, cacheRead: 0 })

export const emptyTotals = (): Totals => ({ summary: emptyTally(), search: emptyTally() })

/** The totals with one more call of `kind`; a call with no usage (it threw before any reply) adds a call and no tokens. */
export const addCall = (totals: Totals, kind: CostKind, usage: Usage | undefined): Totals => {
  const held = totals[kind]

  return {
    ...totals,
    [kind]: {
      calls: held.calls + 1,
      input: held.input + (usage?.input_tokens ?? 0),
      output: held.output + (usage?.output_tokens ?? 0),
      cacheWrite: held.cacheWrite + (usage?.cache_creation_input_tokens ?? 0),
      cacheRead: held.cacheRead + (usage?.cache_read_input_tokens ?? 0),
    },
  }
}

/** Both kinds added together. */
export const totalOf = (totals: Totals): Tally =>
  COST_KINDS.map(kind => totals[kind]).reduce(
    (sum, one) => ({
      calls: sum.calls + one.calls,
      input: sum.input + one.input,
      output: sum.output + one.output,
      cacheWrite: sum.cacheWrite + one.cacheWrite,
      cacheRead: sum.cacheRead + one.cacheRead,
    }),
    emptyTally(),
  )

/** The estimated dollars a tally cost. */
export const dollarsOf = (tally: Tally): number =>
  (tally.input * HAIKU_PRICE.input + tally.output * HAIKU_PRICE.output + tally.cacheWrite * HAIKU_PRICE.cacheWrite + tally.cacheRead * HAIKU_PRICE.cacheRead) *
  PER_TOKEN

/** Dollars as a short estimate, never wider than eight characters below $1000: `~$0.004`, `<$0.001`, `~$12.35`. */
export const shortDollars = (dollars: number): string => {
  if (dollars <= 0) return '$0'
  if (dollars < 0.001) return '<$0.001'

  return `~$${dollars.toFixed(dollars < 1 ? 3 : 2)}`
}

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

const parseTally = (raw: unknown): Tally | undefined => {
  if (typeof raw !== 'object' || raw === null) return undefined
  const { calls, input, output, cacheWrite, cacheRead } = raw as Record<string, unknown>
  if (![calls, input, output, cacheWrite, cacheRead].every(isCount)) return undefined

  return { calls, input, output, cacheWrite, cacheRead } as Tally
}

/** Totals read back from the store; a kind that cannot be read counts as nothing spent. */
export const parseTotals = (raw: unknown): Totals => {
  const held = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}

  return { summary: parseTally(held.summary) ?? emptyTally(), search: parseTally(held.search) ?? emptyTally() }
}

/** What the store keeps for the session: its id beside its totals, so another session starts over. */
export type SavedSession = { session: string; totals: Totals }

/** The session's totals read back, or nothing spent when the store holds another session's. */
export const parseSession = (raw: unknown, session: string): Totals => {
  if (typeof raw !== 'object' || raw === null || (raw as { session?: unknown }).session !== session) return emptyTotals()

  return parseTotals((raw as { totals?: unknown }).totals)
}

const count = (n: number): string => n.toLocaleString('en-US')

const line = (label: string, tally: Tally): string =>
  [
    label.padEnd(8),
    `${tally.calls} ${tally.calls === 1 ? 'call' : 'calls'}`.padEnd(10),
    `${count(tally.input + tally.cacheWrite + tally.cacheRead)} in`.padEnd(14),
    `${count(tally.output)} out`.padEnd(12),
    shortDollars(dollarsOf(tally)),
  ].join(' ')

const block = (title: string, totals: Totals): string[] => [
  title,
  ...COST_KINDS.map(kind => `  ${line(kind, totals[kind])}`),
  `  ${line('total', totalOf(totals))}`,
]

/** The reply to /sidekick-cost. */
export const costReport = (session: Totals, allTime: Totals): string =>
  [
    ...block('This session:', session),
    ...block('All time in this project:', allTime),
    'Tokens are as the API counted them, failed calls included. Dollars are an estimate at Claude Haiku 5.5’s published price (taken 2026-10-17).',
  ].join('\n')
