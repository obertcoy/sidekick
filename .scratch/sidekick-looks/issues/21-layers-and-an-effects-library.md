# 21: Layers and an effects library

**What to build:** A frame is drawn in layers, back to front: **sky** (it can be lit by a flash), **far** (things behind the hills, like a distant bolt), **ground** (it can carry marks such as a scorch or cracks), **character**, **effects**, **overlay** (the check mark). Animations get a shared library of effects that read the character's anchors, its mask and the stage edges: bolt (with branches), burst (sparks under gravity), smoke, shockwave along the ground, aura around the mask, crackle, confetti, and a flash that lights the sky. Every effect is a pure function of the frame number and a seed, so the same frame always draws the same pixels and golden tests stay possible. Backgrounds become sky, far and ground layers with their own frames; a background with more than one frame steps at rest as part of ambient motion (this absorbs ticket 10). The prototype's effects in `../../sidekick/prototypes.html#motion` are the reference.

**Blocked by:** 20: The body moves and can change colour

**Status:** done

- [x] Layers draw in the order above; an effect can be put on any layer, and a far effect is hidden by the hills in front of it
- [x] Bolt, burst, smoke, shockwave, aura, crackle, confetti and flash exist, each aimed only by anchors, the mask and stage edges
- [x] Each effect draws the same pixels for the same frame and seed
- [x] A flash lights the sky layer for its frames and nothing else
- [x] A ground mark made during an animation is gone by the time the sidekick is at rest again
- [x] From ticket 10: a background with several frames steps at a slow fixed interval at rest; with one frame, or with motion off, no timer runs at rest
- [x] Every existing animation draws the same pixels as before
- [x] Covered at the pure level (one test per effect) and by whole-mod tests for the background at rest

**Notes**
- Layers: `LAYERS` is sky, far, ground, character, effects, overlay. A background has an optional picture (frames of its own) for sky, far and ground, in place of the one `frames` grid it had. Sky and far stand on the row above the ground; the ground picture's last row is the ground and repeats under it, rows above it are hills. A frame puts dots on the other layers with `FramePlan.layers` (`sky`, `far`, `ground`, `overlay`); `dots` and `aimed` are the effects layer, so no existing animation changed. Each layer is its picture, then the dots put on it, then the next layer: a far effect is hidden by the ground picture's hills, a ground mark is behind the character.
- Reading of "far effect is hidden by the hills": the hills are the rows above the ground row in the background's ground picture. A background without hills hides nothing.
- Effects are in `hooks/sprite/effects.ts`: `bolt` (with `branches`), `burst`, `smoke`, `shockwave`, `aura` (returns the function `aimed` takes), `crackle`, `confetti`, `flash`, each a pure function of the frame (counted from when the effect begins; negative draws nothing) and a seed, returning dots. Number-valued randomness is seeded per call (no state between frames); the prototype's confetti drew its random numbers conditionally, which made a piece's course depend on when it was first seen, so it draws them first. Rounded positions are never minus zero.
- A dot's colour may be a plain 0xRRGGBB as well as a role (an aura's flames, confetti); a recolour does not touch it. New prop roles: glow, glowDim, ember, coal, scorch, smoke, smokeDim, dust, skyLit, skyFlash (prototype C colours).
- Flash is a wash of every sky pixel between the camera's side edges, put on the `sky` layer: it lights stars and empty sky alike and is hidden by everything in front of the sky layer. `aura` takes the region to search from the caller (the stage edges and the character's anchors); it never draws on the mask.
- No existing animation uses the new layers or effects yet; ticket 23 moves them onto the library. A ground mark needs no clean-up because a frame is a pure function of its step: it is there only in the frames that draw it.
- Ticket 10 (absorbed): the activity keeps the background's own timer beside the animation timer. `BACKGROUND_STEP_MS` is 2000. It runs while motion is on, the background has more than one frame, and the sidekick rests with a still picture (resting, between, holding with a one-frame animation). During any animation (a turn's loop, once-only, ambient) the background steps with the animation, as before, and it comes back at rest where it was left. Motion off holds its first frame and starts no timer; the pane hidden stops it. A background's frame count is the least common multiple of its layers' (`backgroundFrames`).
- A new background, `twinkle` (two sky frames, four stars that take turns to glow beside the character), is the one shipped with several frames; `dusk` is the same pixels as before. The look command's listing and refusal now name both backgrounds (two assertions in `tests/look.test.ts` changed, and two in `tests/sprite.test.ts` for the new picture fields).
