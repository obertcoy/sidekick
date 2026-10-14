# 10: A multi-frame background cycles at rest

**What to build:** A background with more than one frame is animated even when the sidekick is doing nothing. Today a background only steps while an animation plays, so at rest it is frozen. After this ticket it advances one frame at a slow fixed interval while the sidekick rests. It is part of ambient motion: with motion off the background holds its first frame at rest and no timer runs. During any animation it steps with the animation, as today.

**Blocked by:** 09: Ambient motion with an off switch

**Status:** ready-for-agent

- [ ] At least one background has more than one frame
- [ ] With that background chosen and the sidekick at rest, the painted background advances frame by frame at a fixed interval and wraps around
- [ ] A background with one frame causes no repaints and no timer at rest
- [ ] With motion off the background shows its first frame at rest and no timer is pending
- [ ] During a state or ambient animation the background steps with the animation's frames, as today
- [ ] The cycling and the ambient animations don't disturb each other: an ambient animation still plays within its 5 to 15 second gap
- [ ] Covered by whole-mod tests that advance the mock clock and read the painted cells
