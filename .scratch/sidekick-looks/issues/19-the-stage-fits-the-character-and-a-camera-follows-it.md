# 19: The stage fits the character, and a camera follows it

**What to build:** The stage is no longer the fixed 18 × 16 pixels in `hooks/sprite/compose.ts`. Its height comes from the character: the character's height, plus headroom above for jumps and falling bolts, plus the ground rows. Its width is a wide world (at least 40 pixels) that the pane looks into through a **camera**. The camera keeps the character centred horizontally; when the pane is narrower than the world, the pane shows the part around the character. When the pane is shorter than the stage, the camera trims the sky first, so the ticket list keeps its rows; a look can cap the stage's height. Animations, poses and accessories place things only from the character's anchors and from named stage edges (sky top, ground, the camera's left and right), never from fixed coordinates, so any character size works with any effect.

Owner decisions (2026-10-17): character size is dynamic; on a narrow pane the view centres on the character.

**Blocked by:** 18: Moments and movesets, with plain defaults

**Status:** ready-for-agent

- [ ] The stage's height is derived from the character; a 12-pixel and a 24-pixel test character get different stage heights, each with the same headroom and ground
- [ ] The world is at least 40 pixels wide; the camera centres on the character and clamps at the world's edges
- [ ] At pane widths of 20, 40 and 60 columns the character is fully drawn and centred (or the whole world shows, when it fits)
- [ ] When the pane is shorter than the stage the sky is trimmed first and the ticket list keeps at least its current rows
- [ ] No animation, pose or accessory uses a fixed stage coordinate; a test fails if one draws off the stage at any supported size
- [ ] A character taller than a look's height cap is refused at load, naming the cap
- [ ] The golden frames change only because of the new stage size; the owner approves the re-recorded `tests/sprite-golden.ts` before the commit (the one ticket allowed to touch it, and only with that approval)
- [ ] Covered at the pure level (stage size, camera) and by whole-mod tests that set the pane size and read the painted cells
