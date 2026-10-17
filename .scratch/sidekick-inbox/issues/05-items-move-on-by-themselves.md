# 05: Items move on by themselves

**What to build:** Items the developer has dealt with in the conversation leave NEEDS YOU without a click. When a later turn's summary sees that a needs-you question was answered, the item moves to REVIEWED with a receipt, "you said: …", in the developer's words as the summary read them. A blocked item moves the same way once a later turn shows the work going on. A changed direction does not move by itself: it is news to read, so it stays until marked reviewed. The developer can still mark any item reviewed by hand. A ticket that becomes done in its file after its question was answered shows up in READY TO REVIEW again, for the work.

**Blocked by:** 01: The summary writes inbox items; 04: An item opens in a detail view

**Status:** done

- [x] The summary is given the open needs-you and blocked items and says which a turn answered or unblocked
- [x] An answered question moves to REVIEWED with "you said: …"; an unblocked item with a receipt saying what unblocked it
- [x] A changed direction stays in NEEDS YOU until marked reviewed
- [x] An item marked reviewed by hand is not brought back by a later summary
- [x] A ticket done in its file shows in READY TO REVIEW even if its earlier question is reviewed
- [x] Covered by whole-mod tests with a mocked summary over several turns

## As built (2026-10-17)

- The pure part is in `hooks/inbox.ts`: `closableOf` (the open needs-you and blocked items, unreviewed), `parseClosed` (the reply's `closed` list, `[{ id, said }]`) and `closeItems`. An item gained an optional `receipt`, stored only on an item a summary closed (`readInbox` keeps it when it is a string), so items written before keep their shape.
- The prompt gains a section `Open questions and blockers, by id:` with lines like `#1 needs-you (shop · 02: Payment): Which provider?` (`none` when there are none); `SUMMARY_RULES` asks for `"closed":[{"id":…,"said":…}]` beside `items`: for a question the developer's answer in their own words, for a blocker what unblocked it, each at most 60 characters. The held items are now told with `, reviewed` when they are, and the rules say never to write again an item the inbox holds, open or reviewed, so a question marked reviewed by hand is not written back as a new one.
- Receipts: `you said: <said>` for a question, `unblocked: <said>` for a blocker. A closed item becomes reviewed (it leaves NEEDS YOU and counts in REVIEWED); closing toasts nothing.
- Only an id open when the reply arrives is closed: the inbox is read again after the model answers, so an item the developer marked reviewed meanwhile keeps no receipt. A change of direction, an item already reviewed, an unknown id, a repeated id or an empty `said` is ignored. A reply whose `items` cannot be read closes nothing (it is not an answer); a reply of closings alone with `"items":[]` is an answer and closes them.
- Where the receipt shows: REVIEWED is still one collapsed count, so the receipt is a line of its ticket's history, in the detail's **What happened** (`Staging is down · unblocked: staging is back`), newest first among the notes, the newest 5 lines kept. An item of no ticket closed by a summary is reviewed, so ticket 01's cleanup deletes it at the next refresh; its receipt goes with it.
- READY TO REVIEW needed no change: it reads the ticket files and the reviewed tickets, never the items, so a ticket done after its question was answered shows there (covered by a test).
- An open detail is not redrawn when a summary closes its item; Mark reviewed on it then changes nothing that matters.
- Covered by `tests/inbox.test.ts` (pure) and `tests/inbox-moves.test.ts` (whole mod over several turns: the prompt's open list, closing a question and a blocker, a change of direction kept, items reviewed by hand left alone, READY TO REVIEW after the answer, unreadable replies).
