# 01: The summary writes inbox items

**What to build:** Today the Haiku call after each turn writes one Done/Next pair and a `needsYou` line, and the next turn overwrites them (`hooks/register.tsx`, `SUMMARY_RULES`). After this ticket it writes **inbox items** that are kept. Each item has a kind (needs you, blocked, changed direction, or a note on a ticket's progress), the ticket it belongs to or none, a **short line** that fits a 40-column pane (a question for needs you, e.g. "Keep timed-out payments pending?"), and a **long explanation** for the detail view. A note on a ticket is appended to that ticket's history, which keeps its newest 5 lines. Items are kept per project in the mod's store. Cleanup: an item whose ticket is in no ticket set any more is deleted; an item with no ticket is deleted once reviewed. Nothing is drawn differently yet: the pane keeps showing the current summary, read from the newest items.

**Blocked by:** sidekick-looks 13: Animations wait until the pane is shown

**Status:** ready-for-agent

- [ ] The summary prompt asks for items with kind, ticket (or none), short line and long explanation, with good and bad examples of a short line
- [ ] Items survive the next turn, a restart of the session and a `/clear`
- [ ] A ticket's history keeps its newest 5 lines
- [ ] A short line longer than the pane's width is cut with `…` when drawn; the stored line is whole
- [ ] Items of a ticket that is in no set any more are deleted at the next refresh
- [ ] The summary's failure modes behave as today: a call that fails stores nothing and is not taken as "no items"
- [ ] The 8-second "Needs you" toast still pops for a new needs-you item
- [ ] Covered at the pure level (parsing the reply, history cap, cleanup) and by whole-mod tests with a mocked model
