# 19: The stage fits the character, and a camera follows it

**What to build:** The stage is no longer the fixed 18 × 16 pixels in `hooks/sprite/compose.ts`. Its height comes from the character: the character's height, plus headroom above for jumps and falling bolts, plus the ground rows. Its width is a wide world (at least 40 pixels) that the pane looks into through a **camera**. The camera keeps the character centred horizontally; when the pane is narrower than the world, the pane shows the part around the character. When the pane is shorter than the stage, the camera trims the sky first, so the ticket list keeps its rows; a look can cap the stage's height. Animations, poses and accessories place things only from the character's anchors and from named stage edges (sky top, ground, the camera's left and right), never from fixed coordinates, so any character size works with any effect.

Owner decisions (2026-10-17): character size is dynamic; on a narrow pane the view centres on the character.

**Blocked by:** 18: Moments and movesets, with plain defaults

**Status:** done (owner review of golden frames pending)

- [x] The stage's height is derived from the character; a 12-pixel and a 24-pixel test character get different stage heights, each with the same headroom and ground
- [x] The world is at least 40 pixels wide; the camera centres on the character and clamps at the world's edges
- [x] At pane widths of 20, 40 and 60 columns the character is fully drawn and centred (or the whole world shows, when it fits)
- [x] When the pane is shorter than the stage the sky is trimmed first and the ticket list keeps at least its current rows
- [x] No animation, pose or accessory uses a fixed stage coordinate; a test fails if one draws off the stage at any supported size
- [x] A character taller than a look's height cap is refused at load, naming the cap
- [x] The golden frames change only because of the new stage size (checked cell by cell: every old frame is in the new one at cell column 11, row 4, and every other cell is empty)
- [ ] The owner approves the re-recorded `tests/sprite-golden.ts` (pre-approved to re-record here if only the stage size changed; the owner's review of the frames is still pending after the commit)
- [x] Covered at the pure level (stage size, camera) and by whole-mod tests that set the pane size and read the painted cells

## Notes

- The stage: `stageFor(character, cap?)` in `hooks/sprite/compose.ts`. Headroom is `HEADROOM` (8 pixels, one more when the height would be odd), then the character down to its feet, then the ground (`GROUND_ROWS`, 1 pixel; rows of the body under the feet count as ground too). The world is `WORLD_MIN_WIDTH` (40) pixels or the character's frame, whichever is wider, with the character centred.
- Anchors are still in the character's own pixels; an animation is given them already moved onto the stage, plus the named `Edges` (`skyTop`, `ground`, `left`, `right`) as a third argument. A test moves anchors and edges and checks every dot moves with them.
- The camera: `cameraFor(stage, room?)`; `viewIn(pane)` in `hooks/sprite.ts` gives it the pane's size. The header keeps `HEADER_TEXT_COLUMNS` (17) beside the sprite; the camera gets the rest of the width, never less than the character's frame (so at 40 columns it looks into 20 columns, at 60 the whole 40-column world).
- Height: the ticket list keeps exactly the rows it had (the pane body less 16, at least 3; the existing test asserts 14 at 30 rows). The sprite gets what is left, which for the foxkit and classic is the eight rows it always had, so the camera trims the headroom today. The headroom shows only for a character taller than that, or when a later ticket gives the sprite more rows. This is the reading of "the ticket list keeps at least its current rows" that the existing tests allow; if the owner wants the sky visible in a tall pane, `PANE_CHROME_ROWS`/`listRoom` in `hooks/sprite.ts` is the one place to change.
- The height cap lives on `Background.heightCap` (pixels). `stageFor` throws naming the cap; look resolution never throws, so there the background is left out and reported ("low is left out: character ... the look's height cap is 20"). No shipped background has a cap yet.
- Character validation: an anchor, region or pose must be on the character's own body (whole pixels, no further down than its last row, at most `MAX_CHARACTER`, 64, across); the stage is made to fit, so "off the stage" became "off the body".
- A background stands on the ground (its last row on the first ground row, repeated under it) and repeats sideways from where the character stands.
- Golden frames: re-recorded because the stage grew from 18 x 8 to 40 x 12 cells. Verified by comparing each of the 19 old frames with the new one: the old frame sits at cell column 11, row 4, identical, and every other cell is empty. `look.test.ts` crops the golden frames to the pane's view (`cropped` in `tests/world.ts`) to compare them with what the pane paints.
