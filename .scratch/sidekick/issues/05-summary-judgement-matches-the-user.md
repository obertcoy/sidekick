# 05: The summary's judgement matches the user's

**What to build:** Whether a turn "decided something or moved the work" is judged by a small model, and that judgement has only been tried against a fake. After the user has run the mod through several real sessions, the cases where the summary changed when it shouldn't have, or stayed put when it should have changed, are collected, and the instructions given to the small model are adjusted until the summary behaves as the user expects. The wording of the three lines (what happened, what's next, what needs the user) is tuned at the same time so they are short and specific.

This ticket needs the user: only they can say whether a summary change was right.

**Blocked by:** 04: The pane reads well in a real terminal

**Status:** done

- [x] The mod has been used in at least three real sessions, including one planning-only session with no files touched
- [x] Each wrong change and each missed change the user noticed is written down with the turn that caused it
- [x] The instructions to the small model are adjusted to fix those cases
- [x] A decision made purely in conversation updates the summary
- [x] A question, a file read and small talk leave the summary unchanged
- [x] The existing tests still pass
- [x] The user has said the summary now changes when they'd expect
