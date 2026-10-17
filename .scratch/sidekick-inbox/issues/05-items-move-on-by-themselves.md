# 05: Items move on by themselves

**What to build:** Items the developer has dealt with in the conversation leave NEEDS YOU without a click. When a later turn's summary sees that a needs-you question was answered, the item moves to REVIEWED with a receipt, "you said: …", in the developer's words as the summary read them. A blocked item moves the same way once a later turn shows the work going on. A changed direction does not move by itself: it is news to read, so it stays until marked reviewed. The developer can still mark any item reviewed by hand. A ticket that becomes done in its file after its question was answered shows up in READY TO REVIEW again, for the work.

**Blocked by:** 01: The summary writes inbox items; 04: An item opens in a detail view

**Status:** ready-for-agent

- [ ] The summary is given the open needs-you and blocked items and says which a turn answered or unblocked
- [ ] An answered question moves to REVIEWED with "you said: …"; an unblocked item with a receipt saying what unblocked it
- [ ] A changed direction stays in NEEDS YOU until marked reviewed
- [ ] An item marked reviewed by hand is not brought back by a later summary
- [ ] A ticket done in its file shows in READY TO REVIEW even if its earlier question is reviewed
- [ ] Covered by whole-mod tests with a mocked summary over several turns
