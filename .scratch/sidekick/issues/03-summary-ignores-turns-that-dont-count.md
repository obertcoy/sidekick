# 03: The summary ignores turns that shouldn't count

**What to build:** The summary only reflects the user's own conversation. A turn run by a subagent, a turn the user interrupted, a turn that ended in an error or refusal, and a turn with no answer text and no tool use all leave the summary exactly as it was and make no model call. A normal answered turn still asks the small model, and an unparseable reply keeps the old summary. This is shown by tests that drive the whole mod, and anything they show to be wrong is fixed.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] A test shows a subagent's turn makes no model call and leaves the pane's summary unchanged
- [x] A test shows an interrupted turn, an errored turn and a refused turn each make no model call
- [x] A test shows a turn with an empty answer and no tool use makes no model call
- [x] A test shows a reply that is not valid for a summary keeps the stored summary
- [x] A test shows a failed model call keeps the stored summary
- [x] A test shows the turn's own result reaches the engine unchanged and is not delayed by summarising
- [x] The validator, the type-check and the full test run pass
