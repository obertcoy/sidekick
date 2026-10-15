# 08c: Zap raises its arm with a pose

**What to build:** A prefactor with no visible change that gives the sprite engine poses. Today an animation can only shift the head down (bob) and paint dots on top, so zap fakes its raised arm with three dots painted over the body, and nothing can change the body itself (no blink, no tail or ear motion). After this ticket an animation can ask for a pose by name: a small change to the body that each character draws for itself as a patch over its body. Pose names are one shared, fixed list, starting with `armUp`. An animation declares the poses it uses, the same way it declares the anchors it reads, and a character that plays an animation but lacks one of its poses is refused at load. Zap's raised arm becomes the `armUp` pose, drawn with exactly the pixels the three dots draw today, so every frame stays pixel-identical. Source: `.scratch/sidekick-looks/pose-engine-plan.md` (steps 1–4).

**Blocked by:** 08b: Refactor — parts declare what they need

**Status:** ready-for-agent

- [ ] Pose names are a single `as const` list with a derived type; it holds only `armUp` for now
- [ ] A character may give a patch for any pose: rows laid over its body from a point, where a space keeps the body's pixel, `.` clears it, and any other letter comes from its legend
- [ ] A pose that is not a known name, a patch off the stage, or a letter the legend does not name (or that has no colour) is refused at load with a message naming the character and the pose
- [ ] An animation declares the poses it uses, and a frame can only ask for declared poses (checked by the compiler, with a `@ts-expect-error` fixture)
- [ ] A character lacking a pose that an animation it plays needs is refused at load, naming the pose and the animation; the check runs through the one state → animation lookup, like the anchor check
- [ ] Poses in one frame apply in order, later wins; accessories draw over posed pixels; anchors do not move with poses
- [ ] Zap uses `armUp` instead of painted arm dots; every frame of every character and animation is pixel-identical (golden file unchanged)
- [ ] Every shipped character has every pose the shipped animations use
