# 11: A character replaces a state animation

**What to build:** Every character shares the same state animations by default, so a new character works without drawing them. But an animation doesn't suit every character: a bolt fits an electric one, not an owl. After this ticket a character may name its own animation for any state (working, searching, search failed, ticket done, set done), and the pane plays that one when the state occurs for that character. The ticket strike stays in step with whichever animation plays for a finished ticket: the bolt still leaves the sidekick and lands on the row, and the row's flash and strike-through follow that animation's frame count.

**Blocked by:** 07: The sidekick looks around during a search and shrugs when it fails

**Status:** done

- [x] A character that names nothing plays the shared animation for every state
- [x] A character that names an animation for a state plays it in place of the shared one, and the shared ones for the other states
- [x] Switching character with the look command switches which animations play, from the next state on
- [x] With a replacement for "ticket done", the strike on the ticket's row still runs from charge to plain done, in step with the replacement's frames
- [x] A replacement for "ticket done" with too few frames for the strike to show the flash and at least one struck burn step (`MIN_STRIKE_FRAMES`) is refused at load
- [x] A character that names an animation that doesn't exist is refused at load, naming the ones that exist
- [x] The foxkit and the classic character behave as before
- [x] Covered at the pure level by `tests/replacement-lookup.test.ts` (lookup, switching character, the strike driven through the real activity with a replacement for "ticket done") and `tests/replacement.test.ts` (load validation). A whole-mod test with a test-only character is not possible: the mod runs its own copy of the sprite modules, so a character registered from a test never reaches it.
