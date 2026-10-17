# 04: An item opens in a detail view

**What to build:** An inbox item opens in a detail view that takes the inbox's place in the pane: **Goal** (the ticket's first paragraph, read live from its file; none for an item with no ticket), the item's long explanation, **What happened** (the ticket's newest 5 history lines), **Evidence** (ticked boxes), a **Mark reviewed** button, and **← Back** to the inbox at the scroll position it left. On NEEDS YOU rows a `▸` at the end of the row opens the detail (clicking the row itself is ticket 10); on every other row, clicking the row opens it. Opening an item never marks it reviewed. Mark reviewed moves it to REVIEWED; an item with no ticket is deleted instead (ticket 01's cleanup).

**Blocked by:** 02: The inbox replaces the Done/Next block

**Status:** ready-for-agent

- [ ] `▸` on a NEEDS YOU row, or a click on any other row, opens that item's detail; the keyboard can do the same
- [ ] The goal is read from the ticket file each time the detail opens
- [ ] Back returns to the inbox where it was
- [ ] Opening and going back leaves the item unreviewed
- [ ] Mark reviewed moves a ticket's item to REVIEWED and deletes an item with no ticket
- [ ] The detail wraps to the pane's width and scrolls when it is taller than the pane
- [ ] Covered by whole-mod tests that click into an item, back out, and mark it reviewed
