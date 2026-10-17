# 07: The sidekick's own cost

**What to build:** The developer can see what the sidekick's own model calls cost. Every `$.model.complete` result carries `usage` on every arm, failures included; the sidekick adds up its calls' tokens by kind (summary, search), for this session and for all time per project, in the mod's store. Dollars are an estimate: tokens times Haiku's published price, held as one constant in the code (look the price up from the current pricing reference when building; do not write it from memory). The pane shows a dim `~$0.004` for this session in its header. `/sidekick-cost` prints calls, tokens and estimated dollars for summary and search, this session and all time.

**Blocked by:** none (start after sidekick-looks 13, which also touches the pane)

**Status:** ready-for-agent

- [ ] Every summary and search call adds its usage, including calls that failed or timed out
- [ ] The pane header shows this session's estimated cost, dim, and it fits at 40 columns
- [ ] `/sidekick-cost` shows calls, tokens and estimated dollars by kind, for the session and for all time in this project
- [ ] The price is one named constant with the date it was taken and its source
- [ ] All-time totals survive a restart; the session's start over with a new session
- [ ] Covered at the pure level (adding up, pricing) and by whole-mod tests with mocked usage
