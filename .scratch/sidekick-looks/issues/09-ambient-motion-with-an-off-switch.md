# 09: Ambient motion with an off switch

**What to build:** Between turns the sidekick is no longer a frozen picture. While it rests it plays a small ambient animation now and then: a blink, a tail flick, an ear flick or a cheek spark. Each character names the ones it uses, so a character without cheeks doesn't spark. After each one the sidekick waits a random 5 to 15 seconds before the next. Ambient motion never gets in the way: it plays only at rest, and a state animation that arrives while one is playing starts at once. A motion command turns ambient motion off and on for all projects and reports the setting when run with no argument; the setting survives a restart. With it off the sidekick is still unless something happened, as before this work, and no timer runs while nothing is happening.

**Blocked by:** 07: The sidekick looks around during a search and shrugs when it fails

**Status:** ready-for-agent

- [ ] Four shared ambient animations exist: blink, tail flick, ear flick and cheek spark; each plays once and is drawn from anchors only
- [ ] Each character lists the ambient animations it uses; the foxkit and the classic character each list at least the blink
- [ ] The blink uses a new eye anchor, given by the foxkit and the classic character
- [ ] A character that lists an animation that doesn't exist, or lists the blink without an eye anchor, is refused at load
- [ ] A character with an empty list has no ambient motion
- [ ] At rest nothing is painted in the first 5 seconds, and at least one ambient animation has played by 15 seconds plus its length
- [ ] Only animations from the current character's list play
- [ ] No ambient animation plays while a turn runs, a search runs or a once-only animation plays
- [ ] A state animation that arrives during an ambient animation starts at once
- [ ] The motion command is registered at session start; `off` and `on` set it, and no argument reports it
- [ ] Ambient motion is on for a developer who never ran the command
- [ ] The setting applies in every project and survives a fresh session start
- [ ] With motion off no ambient animation plays, no timer is pending at rest, and writing, looking, shrugging, zapping and cheering still play
- [ ] The bare foxkit's golden frames are unchanged
- [ ] Covered by whole-mod tests that advance the mock clock; the random gap is tested by its bounds, with no random source injected
