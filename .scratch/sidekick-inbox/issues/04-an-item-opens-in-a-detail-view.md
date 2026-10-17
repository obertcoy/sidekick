# 04: An item opens in a detail view

**What to build:** An inbox item opens in a detail view that takes the inbox's place in the pane: **Goal** (the ticket's first paragraph, read live from its file; none for an item with no ticket), the item's long explanation, **What happened** (the ticket's newest 5 history lines), **Evidence** (ticked boxes), a **Mark reviewed** button, and **← Back** to the inbox at the scroll position it left. On NEEDS YOU rows a `▸` at the end of the row opens the detail (clicking the row itself is ticket 10); on every other row, clicking the row opens it. Opening an item never marks it reviewed. Mark reviewed moves it to REVIEWED; an item with no ticket is deleted instead (ticket 01's cleanup).

**Blocked by:** 02: The inbox replaces the Done/Next block

**Status:** done

- [x] `▸` on a NEEDS YOU row, or a click on any other row, opens that item's detail; the keyboard can do the same
- [x] The goal is read from the ticket file each time the detail opens
- [x] Back returns to the inbox where it was
- [x] Opening and going back leaves the item unreviewed
- [x] Mark reviewed moves a ticket's item to REVIEWED and deletes an item with no ticket
- [x] The detail wraps to the pane's width and scrolls when it is taller than the pane
- [x] Covered by whole-mod tests that click into an item, back out, and mark it reviewed

## As built (2026-10-17)

- The pure part is in `hooks/inbox.ts`: `goalOf` (the first paragraph after the title, on one line, emphasis dropped; front matter, headings, checkboxes and a lone status line are skipped), `detailOf` (an `Opened` entry, an item by id or a ticket, into a `Detail`), `markReviewed`, `tidyReviewed` and `readReviewed`. `tickets.ts` gained `boxesIn` and `tickedOf`. `Asking` carries the item's `id`.
- The detail takes the inbox's place in the Inbox tab (key `detail`; after ticket 03 the Tickets tab shows the list, and going back to Inbox shows the detail still open): `← Back` (hotkey `b`), the row's glyph and title, the item's question when it has a ticket, **Goal**, the long explanation, **What happened** (the ticket's notes, newest first), **Evidence · k/n ticked** with each ticked box, and **Mark reviewed** (hotkey `r`). A section with nothing in it is left out; every line wraps (`wrap="wrap"`) and the pane scrolls a detail taller than it.
- An item with no ticket shows its short line as the title and its explanation alone. A ticket's own detail (READY TO REVIEW or WORKING) is explained by its newest note with an explanation.
- Rows: NEEDS YOU rows end in a `▸` Button (the title is cut 2 columns shorter to leave room); READY TO REVIEW and WORKING rows have their title line as a plain Button, so a click or Enter under the focus opens them. The glyph of those rows is no longer coloured (a Button's label is one string); the glyph alone tells the state.
- Mark reviewed is offered on NEEDS YOU items and READY TO REVIEW tickets, not on WORKING tickets (nothing is done there to review). It returns to the inbox. An item of a ticket is kept with `isReviewed`; an item of no ticket is deleted. A ticket is remembered in the store under `reviewed:<root>` (keys as `keyOf`), never in its file; READY TO REVIEW leaves it out and REVIEWED counts it. A reviewed ticket that stops being done is forgotten at the next refresh, so it comes back to review once done again. This ends ticket 02's interim "every done ticket is ready to review".
- The goal and the boxes are read with `$.fs.read` each time the detail opens, past the parse cache, so an edit with the same mtime is seen.
- Back: the window's offset at the last drawing of the inbox is kept; Back asks `$.ui.scroll` for the top and the mod's own `ui.scroll` hook puts that offset in its place. Opening scrolls to the detail's top. The test kit has no `$.ui.scroll` (it throws "no implementation"), so the window's moves are not covered by tests; both calls are caught and the mod goes on without them. Worth a look in a real terminal.
- Opening and Back are module state (one pane), reset at `session.start`.
- Covered by `tests/inbox.test.ts` (pure) and `tests/inbox-detail.test.ts` (whole mod: ▸ and Back on both surfaces, a no-ticket item, marking a question, a READY TO REVIEW ticket and its return once done again, a WORKING row, the goal read afresh, wrapping). `tests/world.ts` gained `linesIn` (Buttons and rows read as lines) and `setButtons` (the picker's Buttons, now that rows are Buttons too); `pick`, `recipe`, `summary`, `strike`, `tabs` and `inbox-pane` tests were adjusted for that (`setButtons` came from ticket 03 too; the two were merged).
