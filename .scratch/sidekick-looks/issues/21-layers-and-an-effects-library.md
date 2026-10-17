# 21: Layers and an effects library

**What to build:** A frame is drawn in layers, back to front: **sky** (it can be lit by a flash), **far** (things behind the hills, like a distant bolt), **ground** (it can carry marks such as a scorch or cracks), **character**, **effects**, **overlay** (the check mark). Animations get a shared library of effects that read the character's anchors, its mask and the stage edges: bolt (with branches), burst (sparks under gravity), smoke, shockwave along the ground, aura around the mask, crackle, confetti, and a flash that lights the sky. Every effect is a pure function of the frame number and a seed, so the same frame always draws the same pixels and golden tests stay possible. Backgrounds become sky, far and ground layers with their own frames; a background with more than one frame steps at rest as part of ambient motion (this absorbs ticket 10). The prototype's effects in `../../sidekick/prototypes.html#motion` are the reference.

**Blocked by:** 20: The body moves and can change colour

**Status:** ready-for-agent

- [ ] Layers draw in the order above; an effect can be put on any layer, and a far effect is hidden by the hills in front of it
- [ ] Bolt, burst, smoke, shockwave, aura, crackle, confetti and flash exist, each aimed only by anchors, the mask and stage edges
- [ ] Each effect draws the same pixels for the same frame and seed
- [ ] A flash lights the sky layer for its frames and nothing else
- [ ] A ground mark made during an animation is gone by the time the sidekick is at rest again
- [ ] From ticket 10: a background with several frames steps at a slow fixed interval at rest; with one frame, or with motion off, no timer runs at rest
- [ ] Every existing animation draws the same pixels as before
- [ ] Covered at the pure level (one test per effect) and by whole-mod tests for the background at rest
