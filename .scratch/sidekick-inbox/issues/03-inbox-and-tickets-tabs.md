# 03: Inbox and Tickets tabs

**What to build:** The inbox and the ticket list stop competing for rows. Two buttons at the top of the pane, **Inbox** (the default, with the count of NEEDS YOU items) and **Tickets**, switch between them; each gets the pane's full height below the header and the progress bar. The ticket list is today's, unchanged. The choice is remembered per project. The buttons work like the ticket-set picker's: a click, or the keyboard.

**Blocked by:** 02: The inbox replaces the Done/Next block

**Status:** done

- [x] The pane opens on Inbox; its button shows the NEEDS YOU count
- [x] Clicking a tab, or its keyboard equivalent, switches the view; the header and progress bar stay
- [x] The Tickets view is today's ticket list, using the full height
- [x] The chosen tab is remembered per project across sessions
- [x] Covered by whole-mod tests that click the tabs and read the painted pane

## As built (2026-10-17)

- The tabs are two plain Buttons in a row under the header, the progress bar and any `Left out:` line, keyed `tab-inbox` and `tab-tickets`, with the hotkeys `i` and `t` (pressed while the pane has the keyboard, as the picker's digits are). The tab shown is `● Inbox` / `● Tickets` at full strength, the other `○ …` and dim, so the choice never rests on colour alone.
- The Inbox button reads `Inbox · n` with n the NEEDS YOU items; with none it reads `Inbox` alone, not `Inbox · 0`.
- **Inbox** draws the inbox sections as ticket 02 left them; the rule above them is gone, the tabs now part it from the header. **Tickets** draws today's list: `No tickets here…`, the rows with the strike, `↑ earlier` / `↓ more`, the `n sets · /sidekick-pick` hint and the source path. `Looking for tickets…` stays above the tabs, on both.
- The set picker, when it shows, is drawn under the tabs on either tab: it is a question to answer, and `/sidekick-pick` with more than four sets opens the pane for it whichever tab was chosen.
- The list's window is now `bodyRows - 16` rows (was `- 17`, which counted an empty inbox below the list); the inbox no longer shares the pane with it, however long it grows. The strike's bolt still lands on the blank line above the list, now under the tabs.
- The tab is kept in the store under `tab:<root>`, one per project, so it holds across sessions and another project opens on its own (Inbox until chosen there). It is written before the view changes, so a refresh in between reads the new tab. `View.tab` (`Tab` in `types/index.d.ts`) carries it to the pane.
- Covered by `tests/tabs.test.ts` (whole mod: presses the tabs on both surfaces and reads the painted pane, the count, the hotkeys, the list's height, the tab kept per project and across sessions). Whole-mod tests about the ticket list now start from `ON_TICKETS` in `tests/world.ts` (a store with the Tickets tab chosen in each test project); picker tests count only the picker's buttons (`setButtons`); `tests/pane.test.ts` presses Tickets to read the rows; the strike's "nothing moves after" compares the drawing without the Buttons' per-render press handles.
