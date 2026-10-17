# 18: Moments and movesets, with plain defaults

**What to build:** What happens and what the sidekick plays for it become two separate things. A **moment** is something the mod can detect: a turn is working, a search runs, a search fails, a ticket is done, a set is done, the sidekick rests. Moments are a closed `as const` list, and one is added only together with a real event that produces it. The **library** holds every animation; an animation may sit in it without being played for any moment. A character's **moveset** names, for each moment, the library animation it plays. Every moment has a **plain default** that any character can play, so a character that leaves a moment out still plays something that suits it (a knight is never handed the bolt). This generalizes ticket 11's `Character.animations` from the five states to every moment, and keeps its load checks: a moveset that names an unknown animation, or an animation whose needs the character lacks, is refused at load. The ticket-done minimum (`MIN_STRIKE_FRAMES`) holds for whatever plays for "ticket done", the default included.

Design notes: owner discussion on 2026-10-17 (session after the C prototype, `../../sidekick/prototypes.html#motion`). The power-up is not placed yet; it lands in the library in ticket 24 and is given to the classic only as a placeholder.

**Blocked by:** 13: Animations wait until the pane is shown

**Status:** ready-for-agent

- [ ] Moments are an `as const` list with a derived type; the activity state machine produces moments, not animation names
- [ ] A character's moveset maps moments to library animations; a moment it leaves out plays that moment's plain default
- [ ] Each moment's plain default uses only anchors every character has
- [ ] A moveset that names an unknown animation, or one whose anchors or poses the character lacks, is refused at load, naming what is missing
- [ ] Whatever plays for "ticket done" has at least `MIN_STRIKE_FRAMES` frames, and the strike stays in step with it
- [ ] An animation in the library that no moveset uses is still checked against its own declaration at load and is not played
- [ ] The foxkit and the classic behave as before; their golden frames are unchanged
- [ ] Ticket 11's tests still pass, renamed to the new vocabulary where needed
- [ ] Covered at the pure level (moveset lookup, defaults, load refusals) and by whole-mod tests for the classic
