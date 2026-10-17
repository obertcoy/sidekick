# 07: The sidekick's own cost

**What to build:** The developer can see what the sidekick's own model calls cost. Every `$.model.complete` result carries `usage` on every arm, failures included; the sidekick adds up its calls' tokens by kind (summary, search), for this session and for all time per project, in the mod's store. Dollars are an estimate: tokens times Haiku's published price, held as one constant in the code (look the price up from the current pricing reference when building; do not write it from memory). The pane shows a dim `~$0.004` for this session in its header. `/sidekick-cost` prints calls, tokens and estimated dollars for summary and search, this session and all time.

**Blocked by:** none (start after sidekick-looks 13, which also touches the pane)

**Status:** done

- [x] Every summary and search call adds its usage, including calls that failed or timed out
- [x] The pane header shows this session's estimated cost, dim, and it fits at 40 columns
- [x] `/sidekick-cost` shows calls, tokens and estimated dollars by kind, for the session and for all time in this project
- [x] The price is one named constant with the date it was taken and its source
- [x] All-time totals survive a restart; the session's start over with a new session
- [x] Covered at the pure level (adding up, pricing) and by whole-mod tests with mocked usage

## As built (2026-10-17)

- Pure part in `hooks/cost.ts` (adding up, pricing, the report); `hooks/register.tsx` wraps both model calls in one `complete` that counts usage on every arm, and a call that threw counts as a call with no tokens.
- Price: `HAIKU_PRICE` = Claude Haiku 5.5 for prompts up to 100,000 tokens: $0.10 input, $0.125 5-minute cache write, $0.01 cache read, $0.50 output per MTok, taken 2026-10-17 from https://platform.claude.com/docs/en/about-claude/pricing. The mod asks for `haiku`; the estimate assumes that is Haiku 5.5 and ignores the long-prompt rate and US-only inference.
- Store: all time under `cost:<root>`; the session under `cost-session:<root>` as `{ session, totals }`, so a resumed session keeps its figure and another session starts over (one entry per project, never one per session).
- The header shows the session's figure on its own dim line under the project name (`~$0.004`, `<$0.001` below a tenth of a cent), only once the session has spent anything; at most 8 characters, so it fits beside the sprite at 40 columns.
- Covered by `tests/cost.test.ts` (pure) and `tests/own-cost.test.ts` (whole mod, mocked usage).
