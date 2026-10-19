# 23: The classic animations move onto the new engine

**What to build:** The existing animations (idle, write, look, shrug, zap, cheer and the ambient ones) are rewritten with the effects library and stage edges instead of hand-placed dots, so they work at any stage size and for any character that has their anchors. They should look at least as good as today on the classic and the foxkit; this ticket does not add new animations. Each moment's plain default from ticket 18 is drawn with the effects library too.

**Blocked by:** 22: The sidekick has a place and can walk

**Status:** done, except the owner's review of the re-recorded golden frames and the by-eye check (both pending)

- [x] No animation file places a pixel by a fixed coordinate or a hand-written dot list where an effect exists for it
- [x] Each animation plays on the classic, the foxkit and a 24-pixel test character without drawing off the stage
- [x] The ticket strike stays in step with the zap
- [ ] The owner approves the re-recorded golden frames before the commit
- [ ] By-eye check in the running app (`run` skill) by the owner, at real terminal size

## Notes

How the sentences above were read:

- **"Rewritten with the effects library and stage edges"** was taken as: wherever the library has an effect for what an animation drew by hand, the animation now calls it. That is the zap (the bolt, its sparks, the lightning on the tail, the check mark), the cheer (sparks from the ear tips) and the plain defaults. `write`, `look`, `shrug`, `idle` and the ambient animations are unchanged: they place a handful of dots at named anchors (the paper beside the paw, a glint above an ear, a drop of sweat), which is not a fixed coordinate, and the library has no effect for them. New effect: `checkMark` (the zap's check mark, the same five pixels, now on the `overlay` layer).
- **Zap** keeps its 12 frames and 110 ms, so the strike is unchanged: the bolt first shows at step 2 (`LEAVES`), lands at 3 (`LANDS`), the paw glows at 4 (`HITS`), and the last frame is the check mark alone. The bolt now runs from `boltFrom` to a point two right and one up of `reach` (where the hand-written one ended), with a glow either side, so it is a little thicker than before. The sparks the strike throws are a `burst` that falls to the row above the `ground` edge; the lightning on the tail is `crackle`.
- **Cheer** is the same two hops at the same pace; the sparks are a slow `burst` from the row above each ear tip, kept within about three rows above the ears. The camera guarantees only the character's frame and the rows below it, so a short pane trims the sky: what must be seen stays near the character.
- **Plain defaults**: `nod` and `dip` (working and searching) stay a bob; `sink` lets out a puff of `smoke` over the head, `hop` kicks up dust (`burst`) at the feet, `bounce` drops `confetti` between the camera's side edges (on a short pane the sky is trimmed, so only the lower part of its fall shows). They still need only the head and the feet, and no pose.
- **No walking.** The ticket does not ask the classic to walk, so no shipped animation names a place and ticket 22's whole-mod walk test is still not possible; see that ticket's note.
- **Golden frames**: only the zap changed in `tests/sprite-golden.ts` (frames 0-9 differ; 10 and 11, idle and write are identical). The foxkit plays the same shared animations, so its zap changed with the classic's. The owner's approval of the new frames is pending (box unticked).
- **Tests**: `tests/animations.test.ts` is new. The test that the look, shrug and cheer draw clear of the body and the accessories (`sprite.test.ts`) measured against an 18 x 16 corner of the stage and gave animations zero edges; it now measures against the real stage and gives the animation the stage's edges.
