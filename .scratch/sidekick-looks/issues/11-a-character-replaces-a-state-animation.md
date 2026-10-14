# 11: A character replaces a state animation

**What to build:** Every character shares the same state animations by default, so a new character works without drawing them. But an animation doesn't suit every character: a bolt fits an electric one, not an owl. After this ticket a character may name its own animation for any state (working, searching, search failed, ticket done, set done), and the pane plays that one when the state occurs for that character. The ticket strike stays in step with whichever animation plays for a finished ticket: the bolt still leaves the sidekick and lands on the row, and the row's flash and strike-through follow that animation's frame count.

**Blocked by:** 07: The sidekick looks around during a search and shrugs when it fails

**Status:** ready-for-agent

- [ ] A character that names nothing plays the shared animation for every state
- [ ] A character that names an animation for a state plays it in place of the shared one, and the shared ones for the other states
- [ ] Switching character with the look command switches which animations play, from the next state on
- [ ] With a replacement for "ticket done", the strike on the ticket's row still runs from charge to plain done, in step with the replacement's frames
- [ ] A replacement for "ticket done" with fewer frames than the strike's fixed steps before the burn is refused at load
- [ ] A character that names an animation that doesn't exist is refused at load, naming the ones that exist
- [ ] The foxkit and the classic character behave as before
- [ ] Covered by a whole-mod test using a test-only character that replaces "ticket done", and by character validation tests
