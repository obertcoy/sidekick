# 20: The body moves and can change colour

**What to build:** Today a frame can only bob the head, lay pose patches and drop loose dots, so the body never moves and motion reads as one-pixel twitches. After this ticket a frame can also move the whole character (`dx`, `dy` in pixels), turn it to face the other way (`mirror`), squash it by a row or stretch it by a row with the feet staying on the ground, and recolour its body roles for that frame (the power-up's gold). The character's outline (its **mask**: the pixels it covers after all of that) is available to effects, so an aura can hug any character. Accessories go where their anchors went: they move, mirror, squash and recolour with the body. What the prototype's `drawChar` does is the reference, not the code to copy.

**Blocked by:** 19: The stage fits the character, and a camera follows it

**Status:** ready-for-agent

- [ ] A frame with `dx`/`dy` draws the whole character, accessories included, moved by that many pixels
- [ ] A mirrored frame draws the character facing the other way, anchors mirrored with it
- [ ] Squash removes a row and stretch adds one, with the feet on the same row both times
- [ ] A recolour changes only the named body roles for that frame; the next frame is back to the character's palette unless it recolours too
- [ ] The mask of a frame is exactly the pixels the character covers in it
- [ ] Every existing animation draws the same pixels as before (no golden change)
- [ ] Covered at the pure level, frame by frame, for the classic and a test-only character
