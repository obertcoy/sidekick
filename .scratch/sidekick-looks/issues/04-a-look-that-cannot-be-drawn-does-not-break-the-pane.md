# 04: A look that cannot be drawn does not break the pane

**What to build:** A saved look can go bad after it was saved: an accessory, background or character is later removed from the mod. Today an unknown name throws. After this ticket the pane always renders: the part that can't be drawn is left out and the rest of the look is kept, and an unknown character falls back to the foxkit. The pane shows one short dim line naming what was dropped, once, not on every refresh. The saved look is not rewritten, so the part returns if it becomes drawable again.

**Blocked by:** 02: Pick a global look with a command

**Status:** done

- [x] With a saved look naming an accessory that doesn't exist, the pane renders and the character and the other parts are as saved
- [x] The same holds for an unknown background and for an accessory saved under a slot it doesn't belong to
- [x] An unknown saved character is drawn as the foxkit, with the rest of the look kept
- [x] The pane shows one line naming the dropped part, for example "no accessory named cap"
- [x] The line is not repeated on later refreshes, and it clears when the look next changes
- [x] The saved look is unchanged by the fallback
- [x] The no-argument listing of the look command marks parts that could not be drawn
- [x] Covered by whole-mod tests that seed the store with a bad look
