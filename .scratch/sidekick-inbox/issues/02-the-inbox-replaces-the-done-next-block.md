# 02: The inbox replaces the Done/Next block

**What to build:** The pane's Done/Next block becomes the inbox, in four sections, the most urgent first:
- **NEEDS YOU**: items with no ticket first, then needs you (`?`), blocked (`✗`) and changed direction (`!`).
- **READY TO REVIEW**: tickets done in their files and not yet reviewed, each with the evidence beside what the agent says: `✓` all boxes ticked, `◐` some unticked (`3/6 ticked`).
- **WORKING**: tickets active in their files, with ticked boxes and how long they have been active.
- **REVIEWED**: one collapsed line with a count.

A section with nothing in it is not drawn. The progress bar counts tickets done in their files, as today. Each line fits the pane's width. The mock-ups agreed with the owner are in the session of 2026-10-17 and in `../../sidekick/future-ideas.md`.

**Blocked by:** 01: The summary writes inbox items

**Status:** ready-for-agent

- [ ] The four sections draw in that order, each sorted as above; an empty section is not drawn
- [ ] A ticket done in its file with every box ticked shows `✓` and `n/n`; with boxes unticked, `◐` and `k/n ticked`
- [ ] A ticket with no checkboxes shows no count, not `0/0`
- [ ] WORKING shows each active ticket's ticked boxes and its time active
- [ ] Every line fits at 40 and 72 columns
- [ ] Nothing says "verified"
- [ ] Covered by whole-mod tests that write ticket files, mock the summary and read the painted pane
