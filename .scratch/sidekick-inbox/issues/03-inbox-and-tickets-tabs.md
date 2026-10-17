# 03: Inbox and Tickets tabs

**What to build:** The inbox and the ticket list stop competing for rows. Two buttons at the top of the pane, **Inbox** (the default, with the count of NEEDS YOU items) and **Tickets**, switch between them; each gets the pane's full height below the header and the progress bar. The ticket list is today's, unchanged. The choice is remembered per project. The buttons work like the ticket-set picker's: a click, or the keyboard.

**Blocked by:** 02: The inbox replaces the Done/Next block

**Status:** ready-for-agent

- [ ] The pane opens on Inbox; its button shows the NEEDS YOU count
- [ ] Clicking a tab, or its keyboard equivalent, switches the view; the header and progress bar stay
- [ ] The Tickets view is today's ticket list, using the full height
- [ ] The chosen tab is remembered per project across sessions
- [ ] Covered by whole-mod tests that click the tabs and read the painted pane
