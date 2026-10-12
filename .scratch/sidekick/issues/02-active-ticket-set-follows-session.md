# 02: The active ticket set follows the session

**What to build:** In a project with several ticket sets, the pane shows progress for the one the session is working on. When the session reads or edits a ticket in a set, that set becomes the active ticket set and the pane switches to it, even if another set changed more recently. When the touched set no longer exists, or the session has touched none, the pane shows the most recently changed set. Reading or editing a file that is not a ticket changes nothing. This is shown by tests that drive the whole mod, and anything they show to be wrong is fixed.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] A test with two ticket sets shows the pane on the most recently changed set before any ticket is touched
- [x] A test shows that a file tool reading or editing a ticket in the older set switches the pane's source and count to that set
- [x] A test shows that the choice survives a later refresh and a new session in the same project
- [x] A test shows that when the touched set's files are gone the pane falls back to the most recently changed set
- [x] A test shows that touching a non-ticket file leaves the active ticket set unchanged
- [x] A test shows the tool call's own result is returned unchanged whether or not the bookkeeping succeeds
- [x] Paths are handled in both Windows and POSIX spellings
- [x] The validator, the type-check and the full test run pass
