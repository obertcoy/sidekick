# 01: Search failure and recovery is proven

**What to build:** The search behaves sensibly when things go wrong, and that is shown by tests that drive the whole mod. A model call that fails during a search is not remembered as "no tickets", so the project is searched again later. A recipe that used to find tickets and now finds none triggers a new search by itself. A project with no listable files is recorded as having no tickets without calling the model. A rescan asked for while a search is already running is refused with a clear message. Any behaviour the tests show to be wrong is fixed.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] A test shows that after a failed model call no recipe is stored and the next refresh searches again
- [x] A test shows that a stored recipe matching no files leads to exactly one new search, and that the result replaces the old recipe
- [x] A test shows that an empty project is recorded as having no tickets with no model call made
- [x] A test shows that a rescan during a running search answers that a search is already running and starts no second one
- [x] A test shows that a recipe pointing outside the project is refused and the project is treated as having no tickets
- [x] All tests drive the mod through the engine's test kit and assert on command output and pane text, not on stored keys
- [x] The validator, the type-check and the full test run pass
