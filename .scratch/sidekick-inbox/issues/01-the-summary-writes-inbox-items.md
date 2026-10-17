# 01: The summary writes inbox items

**What to build:** Today the Haiku call after each turn writes one Done/Next pair and a `needsYou` line, and the next turn overwrites them (`hooks/register.tsx`, `SUMMARY_RULES`). After this ticket it writes **inbox items** that are kept. Each item has a kind (needs you, blocked, changed direction, or a note on a ticket's progress), the ticket it belongs to or none, a **short line** that fits a 40-column pane (a question for needs you, e.g. "Keep timed-out payments pending?"), and a **long explanation** for the detail view. A note on a ticket is appended to that ticket's history, which keeps its newest 5 lines. Items are kept per project in the mod's store. Cleanup: an item whose ticket is in no ticket set any more is deleted; an item with no ticket is deleted once reviewed. Nothing is drawn differently yet: the pane keeps showing the current summary, read from the newest items.

**Blocked by:** sidekick-looks 13: Animations wait until the pane is shown

**Status:** done

- [x] The summary prompt asks for items with kind, ticket (or none), short line and long explanation, with good and bad examples of a short line
- [x] Items survive the next turn, a restart of the session and a `/clear`
- [x] A ticket's history keeps its newest 5 lines
- [x] A short line longer than the pane's width is cut with `…` when drawn; the stored line is whole
- [x] Items of a ticket that is in no set any more are deleted at the next refresh
- [x] The summary's failure modes behave as today: a call that fails stores nothing and is not taken as "no items"
- [x] The 8-second "Needs you" toast still pops for a new needs-you item
- [x] Covered at the pure level (parsing the reply, history cap, cleanup) and by whole-mod tests with a mocked model

## As built (2026-10-17)

- The pure part is `hooks/inbox.ts` (`parseItems`, `addItems`, `historyOf`, `tidy`, `summaryOf`, `readInbox`, `fit`); the store key is `inbox:<root>`, holding `{ items, next }`, oldest item first. Each item has `id`, `kind` (`needs-you`, `blocked`, `changed-direction`, `note`), `ticket` (`{ set, title }` or null), `short`, `long`, `at` and `isReviewed`.
- The prompt lists the tickets of every set, numbered (at most 60, the sets changed last first), and the newest 10 items already held; the model names a ticket by its number. A number not in the list becomes "no ticket".
- A ticket's history is its `note` items: adding a note drops that ticket's notes beyond the newest 5. Notes with no ticket are capped the same way, so they cannot pile up before review exists. Other kinds are not capped.
- A reply of `{"items":[]}` is an answer and stores nothing; a failed or thrown call, or a reply that cannot be read (including one whose items are all unreadable), is not an answer and stores nothing either. The two are told apart in `parseItems` (`[]` against `undefined`) for later tickets.
- Cleanup runs on every refresh, against every set's tickets. When no set can be read at all, nothing is deleted: a project that cannot be read right now has not lost its tickets.
- The pane's summary: Done is the newest item that is not a question, NEEDS YOU the newest unreviewed question, each cut with `…` to its room. There is no Next line any more (no item kind carries it). A project with no inbox yet still shows its last stored Done/Next pair (`summary:<root>`) until the first turn writes items.
- The needs-you toast now pops from the summary, once per new needs-you item, instead of from comparing the drawn line.
- `parseSummary` is gone. `tests/world.ts` gained `openStore` (a store the test can read), `told` (system prompts) and `toasts`.
