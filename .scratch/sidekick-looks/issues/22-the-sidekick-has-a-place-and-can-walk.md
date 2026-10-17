# 22: The sidekick has a place and can walk

**What to build:** The sidekick has a place on the stage and a facing, kept by the activity state machine, so it can walk somewhere and stay there. A character declares a walk cycle (leg rows for contact and passing steps); walking moves it a pixel per step, rises a pixel on the passing step, and can kick dust from the ground layer. An animation can ask to start from, or end at, a place (for example a strike point), and the sidekick walks there first or afterwards. With motion off it does not walk: it appears at its place. The camera from ticket 19 follows the walk. This is also where subagent helpers will later stand.

**Blocked by:** 21: Layers and an effects library

**Status:** ready-for-agent

- [ ] Place and facing are part of the activity state and survive between animations
- [ ] A character's walk cycle is declared on the character and checked at load like its poses
- [ ] Walking moves the sidekick one pixel per step toward its target and turns it to face the way it goes
- [ ] An animation that names a start place is preceded by a walk there; one that names an end place is followed by one
- [ ] With motion off, or while the pane is not shown, the sidekick moves to its place without walking
- [ ] The camera keeps the walking sidekick in view at every supported pane width
- [ ] Covered at the pure level (the transition) and by whole-mod tests that advance the mock clock
