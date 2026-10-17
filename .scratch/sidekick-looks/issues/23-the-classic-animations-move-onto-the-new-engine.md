# 23: The classic animations move onto the new engine

**What to build:** The existing animations (idle, write, look, shrug, zap, cheer and the ambient ones) are rewritten with the effects library and stage edges instead of hand-placed dots, so they work at any stage size and for any character that has their anchors. They should look at least as good as today on the classic and the foxkit; this ticket does not add new animations. Each moment's plain default from ticket 18 is drawn with the effects library too.

**Blocked by:** 22: The sidekick has a place and can walk

**Status:** ready-for-agent

- [ ] No animation file places a pixel by a fixed coordinate or a hand-written dot list where an effect exists for it
- [ ] Each animation plays on the classic, the foxkit and a 24-pixel test character without drawing off the stage
- [ ] The ticket strike stays in step with the zap
- [ ] The owner approves the re-recorded golden frames before the commit
- [ ] By-eye check in the running app (`run` skill) by the owner, at real terminal size
