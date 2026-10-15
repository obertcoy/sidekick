# 08d: The sidekick can blink

**What to build:** The sidekick gains a blink, ready for ambient motion (09) to play. The shared pose list gains `blink`, the foxkit and the classic character each draw it over their eyes, and a new once-only `blink` animation closes the eyes for one frame between two open frames. The blink is not mapped to any state; 09 schedules it. Because an animation outside the states is never checked by the load-time anchor and pose checks today, this ticket extends those checks to every animation a character can play, not only the ones mapped to a state, so 09's ambient animations are covered from the start. Source: `.scratch/sidekick-looks/pose-engine-plan.md` (step 6).

**Blocked by:** 08c: Zap raises its arm with a pose

**Status:** ready-for-agent

- [ ] `blink` is in the pose list; the foxkit and the classic character each draw it
- [ ] A once-only `blink` animation exists: its middle frame differs from rest only at the eye pixels, and its first and last frames equal rest
- [ ] On a character wearing glasses the blink is hidden by the glasses (accessories draw over poses)
- [ ] The load-time anchor and pose checks cover every animation a character can play, including animations not mapped to a state; a character that would play the blink without the `blink` pose is refused at load
- [ ] No state plays the blink yet; nothing visible changes in the pane
- [ ] The classic character's blink is checked by eye in the running app (it is one pixel per eye and may read weakly); the result is noted in this ticket
