# 22: The sidekick has a place and can walk

**What to build:** The sidekick has a place on the stage and a facing, kept by the activity state machine, so it can walk somewhere and stay there. A character declares a walk cycle (leg rows for contact and passing steps); walking moves it a pixel per step, rises a pixel on the passing step, and can kick dust from the ground layer. An animation can ask to start from, or end at, a place (for example a strike point), and the sidekick walks there first or afterwards. With motion off it does not walk: it appears at its place. The camera from ticket 19 follows the walk. This is also where subagent helpers will later stand.

**Blocked by:** 21: Layers and an effects library

**Status:** done, except the whole-mod walk test (see Notes)

- [x] Place and facing are part of the activity state and survive between animations
- [x] A character's walk cycle is declared on the character and checked at load like its poses
- [x] Walking moves the sidekick one pixel per step toward its target and turns it to face the way it goes
- [x] An animation that names a start place is preceded by a walk there; one that names an end place is followed by one
- [x] With motion off, or while the pane is not shown, the sidekick moves to its place without walking
- [x] The camera keeps the walking sidekick in view at every supported pane width
- [ ] Covered at the pure level (the transition) and by whole-mod tests that advance the mock clock (the pure level and a shell test with the real art and a test clock are done; a whole-mod walk needs an animation that names a place, see Notes)

## Notes

How the sentences above were read:

- **Place** is an x in pixels right of home (negative left) and a facing, held in `Shown.place` (so every picture carries it and the pane draws it). The stage clamps it to the world (`placeRange`), and the activity is given the same range (`Room`) so a walk never aims past the edge.
- **Walk cycle** is three poses, `walkA`, `walkB` (the contact steps) and `walkPass` (the passing step), declared with the character's other poses; the registry refuses a character with some but not all (`requireWalk`). `walkOf` gives the library's `walk` animation to a character that has all three; a character that has none appears at its place instead of walking.
- **Walking** is its own phase (`walking`), with the walk animation's timer: one pixel a tick, the cycle stepping on, the body rising a pixel on passing steps. The sidekick turns on the spot to face the way it goes. The tick that arrives does not draw the walk again: the entry (or the rest) is drawn at the place at once.
- **Start and end places** are `Animation.startAt` and `endAt`, in pixels right of home. An entry with `startAt` waits for the walk (its start hook, and so the ticket strike, begin on arrival); one with `endAt` walks after its end hook. Entries that arrive during a walk queue behind it.
- **No walk**: with motion off, for a character with no walk cycle, the sidekick appears at the place (facing the way it would have gone). Turning motion off mid-walk puts it at its destination and starts what waited. While the pane is hidden the walk stops; the sidekick stands where it was going (at an entry's end place if one ended), and a kept entry starts there when the pane is shown.
- **Facing** also turns the anchors an animation is given (about the middle of the character's frame), so effects that hug the body follow; an animation's own `mirror` is relative to the facing. `frame` gets the facing as an optional fourth argument (the walk's dust trails behind).
- **Camera**: `cameraFor`/`viewIn` take the place and centre on the sidekick where it stands; tested at every pane width and place.
- **The whole-mod checkbox**: the mod runs in an environment of its own, and no shipped animation names a place yet, so a whole-mod test cannot send the sidekick anywhere. The walk is covered at the pure level, through `createActivity` with the real art, room and drawing on a clock the test moves (`tests/walk.test.ts`), and one whole-mod test checks that with motion on and nothing naming a place, the zap plays unchanged and no walking frame is painted. Ticket 23 did not make any animation name a place (its text does not ask for it), and ticket 24 as written does not either (the zap stands still and the sidekick hops over the shockwave). The box stays open until an animation names a place, or the owner drops it.
