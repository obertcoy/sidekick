# 12: README and vocabulary match the new system

**What to build:** Someone reading the mod's README or its code finds the same words the glossary uses and an accurate account of how the sidekick works. The README's commands table lists the look command and the motion command with examples. Its section on adding sprite parts, which today describes a head-only outfit and a look set by editing a constant, describes slots and accessories, optional slot anchors, the animations a character lists and may replace, the slots an animation hides, and multi-frame backgrounds; each kind of part still reads as one file plus one registry line. It also covers the engine from tickets 18–24: moments, the library and movesets with plain defaults, the stage sized by the character and the camera, body moves and recolours, layers and the effects library, and walking. In the code and its comments the sidekick is no longer called a critter or a buddy, and an animation is no longer called a mode.

**Blocked by:** 06: Held slot, hidden while the paws are busy; 11: A character replaces a state animation; 13: Animations wait until the pane is shown; 24: The classic gets the storm, the jump and the power-up

**Status:** ready-for-agent

- [ ] The README's commands table lists the look command (global, `here`, `none`, `reset`) and the motion command
- [ ] The README says what the sidekick does and when: writes, looks, shrugs, zaps, cheers, and ambient motion at rest
- [ ] The README's section on parts describes characters (slot anchors, eye anchor, ambient list, replaced state animations), accessories and their slots, animations (including hidden slots) and backgrounds, each with a short example that matches the real types
- [ ] The README no longer says the look is set by editing a constant
- [ ] No "critter" or "buddy" for the sidekick, and no "mode" for an animation, remains in the mod's code, comments or tests
- [ ] Every term the README and comments use for these things is the glossary's
- [ ] All tests pass and the bare foxkit's golden frames are unchanged
