# 02: The inbox replaces the Done/Next block

**What to build:** The pane's Done/Next block becomes the inbox, in four sections, the most urgent first:
- **NEEDS YOU**: items with no ticket first, then needs you (`?`), blocked (`✗`) and changed direction (`!`).
- **READY TO REVIEW**: tickets done in their files and not yet reviewed, each with the evidence beside what the agent says: `✓` all boxes ticked, `◐` some unticked (`3/6 ticked`).
- **WORKING**: tickets active in their files, with ticked boxes and how long they have been active.
- **REVIEWED**: one collapsed line with a count.

A section with nothing in it is not drawn. The progress bar counts tickets done in their files, as today. Each line fits the pane's width. The mock-ups agreed with the owner are in the session of 2026-10-17 and in `../../sidekick/future-ideas.md`.

**Blocked by:** 01: The summary writes inbox items

**Status:** done

- [x] The four sections draw in that order, each sorted as above; an empty section is not drawn
- [x] A ticket done in its file with every box ticked shows `✓` and `n/n`; with boxes unticked, `◐` and `k/n ticked`
- [x] A ticket with no checkboxes shows no count, not `0/0`
- [x] WORKING shows each active ticket's ticked boxes and its time active
- [x] Every line fits at 40 and 72 columns
- [x] Nothing says "verified"
- [x] Covered by whole-mod tests that write ticket files, mock the summary and read the painted pane

## As built (2026-10-17)

- The pure part is in `hooks/inbox.ts`: `sectionsOf` builds the four sections (the view types `InboxView`, `Asking`, `Checked` are in `types/index.d.ts`), `reviewLine` and `workingLine` write the evidence, `activeSince`/`readSince` keep when each ticket went active, `ago` and `inboxTitle` format. The pane draws them in `hooks/register.tsx`; every line is cut with `fit` to the pane's width (a glyph and its space take 2 columns; a detail line is indented by 2).
- Layout: a heading per section with its count (`NEEDS YOU · 4`, `READY TO REVIEW · 3`, `WORKING · 1 ticket`, ready for ticket 06's agent count), then per entry a glyph and the ticket's title with its number kept (`08 Payment retries`) and an indented detail line. A NEEDS YOU item with no ticket is its short line alone on one line. REVIEWED is one dim line, `REVIEWED · n`. With every section empty the inbox says `Nothing in the inbox yet.`
- NEEDS YOU sorts no ticket first, then needs you, blocked, changed direction, newest first within each. READY TO REVIEW sorts `◐` (boxes unticked) before `✓`, else file order; WORKING keeps file order.
- READY TO REVIEW and WORKING read the **active ticket set** only, the set the progress bar and ticket list show; NEEDS YOU shows items of every set. With no set active (the picker showing) the two ticket sections are empty.
- Evidence: `agent says done · 7/7`, `agent says done · 3/6 ticked`, and `agent says done` alone for a ticket with no checkboxes. WORKING: `2/6 ticked · active 12m` (`<1m`, minutes, hours, days, the largest whole unit). `parseTicketFile` now counts `ticked` and `boxes` whatever decides the state; a checklist line has none.
- Time active is from when the mod first saw the ticket active, kept per project in the store under `active-since:<root>` (tickets of every set, refreshed with the inbox's cleanup; an entry goes when its ticket stops being active). A ticket already active before the mod first saw it counts from that first sight. The pane is drawn again at each 20-second refresh while WORKING has tickets, so the time moves on.
- "Not yet reviewed" has nothing to read yet: no review exists before ticket 04, so every done ticket of the set is in READY TO REVIEW until then. REVIEWED counts reviewed items other than notes (a note is history, never reviewed by itself).
- The Done/Next block, the NEEDS YOU badge and the fallback to the old `summary:<root>` pair are gone; notes are no longer drawn (they are history, for ticket 04's detail view). `summaryOf` and the `Summary` type are gone. The 8-second "Needs you" toast is unchanged.
- Covered by `tests/inbox.test.ts` (pure) and `tests/inbox-pane.test.ts` (whole mod: ticket files, a mocked summary, the painted pane at 40 and 72 columns on both surfaces); `tests/summary.test.ts` and `tests/pane.test.ts` now read the inbox instead of the Done line.
