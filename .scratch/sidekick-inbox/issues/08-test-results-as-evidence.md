# 08: Test results as evidence

**What to build:** Besides ticked boxes, an item's evidence shows the last test run: passed, failed, or not run since the last change. Which command is the project's test command, and how it is learned, is to be decided with the owner before this ticket is ready (options discussed: learn it once like the ticket recipe, or recognize common test commands). A failed run sorts its item to the top of READY TO REVIEW with `⚠`.

**Blocked by:** 02: The inbox replaces the Done/Next block

**Status:** later (needs the owner's decision on how the test command is found)

- [ ] Decision recorded: how the test command is found
- [ ] The evidence shows `tests passed`, `tests failed` or `no tests run`, read from the tool call's exit code, never from what the agent says
- [ ] A failed run marks the item `⚠` and sorts it first in READY TO REVIEW
