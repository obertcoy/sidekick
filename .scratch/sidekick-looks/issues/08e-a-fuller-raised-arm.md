# 08e: A fuller raised arm (optional)

**What to build:** Zap's raised arm is redrawn as a real arm leaving the body, instead of the three pixels it inherited from the old painted dots. This is the only intended visible change in the pose work, and an art judgement: the owner looks at it in the running app before it is accepted. It unblocks no other ticket. Source: `.scratch/sidekick-looks/pose-engine-plan.md` (step 7).

**Blocked by:** 08c: Zap raises its arm with a pose

**Status:** needs-owner-decision

- [ ] The foxkit and the classic character each draw a fuller `armUp` patch; the paw still sits at the `reach` anchor the bolt strikes
- [ ] The golden file is not edited; a test renders zap with the old arm patch and requires it to equal the golden frames, proving the new patch is the only change
- [ ] A test shows zap frames with the new arm differ from the golden frames
- [ ] No worn accessory collides with the new arm on any zap frame, bobbed frames included
- [ ] The owner has approved the look in the running app
