# sidekick-inbox tickets: order and status

Work the tickets top to bottom. Each ticket file holds its own `Blocked by`, `Status` and acceptance checkboxes; this list is the agreed order. Background and the agreed shape: `../../sidekick/future-ideas.md` (decision inbox, evidence not a verdict). Planned with the owner on 2026-10-17.

This track runs in parallel with `../../sidekick-looks/issues/` once that set's ticket 13 has landed: both touch the pane in `hooks/register.tsx`.

| Order | Ticket | Blocked by | Status |
|---|---|---|---|
| 1 | 01 The summary writes inbox items | looks 13 | ready |
| 2 | 02 The inbox replaces the Done/Next block | 01 | ready |
| 3 | 03 Inbox and Tickets tabs | 02 | ready |
| 4 | 04 An item opens in a detail view | 02 | ready |
| 5 | 05 Items move on by themselves | 01, 04 | ready |
| 6 | 06 Working counts running agents | 02 | ready |
| 7 | 07 The sidekick's own cost | — (after looks 13) | ready |
| 8 | 10 Reply from the inbox | 04, 05 | ready |
| — | 08 Test results as evidence | 02 | later |
| — | 09 Needs you and agent returned are moments | 05, looks 18 | later |

## Decisions on record

- The inbox replaces the Done/Next block; the per-turn Haiku summary stays, and writes inbox items instead of one Done/Next pair.
- Sources are mixed: the ticket files decide READY TO REVIEW (a ticket done in its file) and WORKING (active); the model only writes the words and flags needs you, blocked and changed direction.
- Sidekick never says "verified". It shows what the agent says beside evidence it can check: in the first version, the ticket's ticked boxes.
- Reviewed is Sidekick's display state only: Claude Code never reads or waits on it. It lives in the mod's store, never in ticket files.
- Cleanup: an item goes when its ticket is in no set any more; an item with no ticket goes once reviewed.
- An answered question and an unblocked blocker close by themselves when a later turn's summary sees it, keeping "you said: …" as a receipt; a changed direction stays until the developer marks it reviewed.
- The progress bar counts tickets done in their files, as today. The 8-second "Needs you" toast stays.
- Clicking works in the developer's terminal (confirmed with the ticket-set picker); every click has a keyboard equivalent.

## Checks

Same as `../../sidekick-looks/issues/README.md`: Biome, `claude plugin test .`, and the type check with zero errors.
