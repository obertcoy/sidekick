# 01: The look is resolved, not a constant

**What to build:** A prefactor with no visible change. Today the sidekick's look is a constant fixed when the mod loads, the thing worn on the head is called an "outfit", the pane keeps its own copy of each animation's frame timing, and the test world remembers only that the sidekick was repainted, not what was painted. After this ticket the pane draws a look that is resolved each time it refreshes (still always the default: bare foxkit); what is worn on the head is an accessory in the head slot, and the outfit is the set of accessories; frame timing comes from the animation itself; and a whole-mod test can read the cells of every repaint and compare them with the renderer's output. The developer sees exactly the same pane as before.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] The bare foxkit's idle, write and zap frames match the existing golden file, which is not edited
- [x] The look the pane draws is resolved at refresh, not at module load; with nothing saved it is the bare foxkit
- [x] An accessory declares its slot; the existing cap is an accessory in the head slot and still sits on the head anchor and bobs with it
- [x] An outfit is a set of accessories with at most one per slot
- [x] The pane takes each animation's frame timing from the animation; its own copy of the timings and the test that pinned the two together are gone
- [x] The test world keeps the painted cells of each sidekick repaint, and one whole-mod test uses them to assert which frame was painted
- [x] All existing tests pass
