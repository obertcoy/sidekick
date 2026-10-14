# 08: The sidekick cheers when the set is done

**What to build:** Finishing the last ticket of the active ticket set looks different from finishing one ticket: after the zap and its strike have played to the end, the sidekick cheers once, then returns to whatever is still going on. The cheer marks the moment the set becomes all done, so it plays again if a ticket is reopened and the set is finished again, and it does not announce old news: no cheer when the pane first shows a set that is already all done, and none when the active ticket set changes to a different set that happens to be all done.

**Blocked by:** 07: The sidekick looks around during a search and shrugs when it fails

**Status:** ready-for-agent

- [ ] When the last ticket of the active ticket set becomes done, the cheer plays once
- [ ] The cheer starts only after that ticket's zap has reached its last frame, and the strike on the row completes as before
- [ ] After the cheer the sidekick writes if a turn is still running, and stands still otherwise
- [ ] A ticket that becomes done while others remain open gets a zap and no cheer
- [ ] Reopening a ticket and finishing the set again plays the cheer again
- [ ] No cheer on the first refresh of a session when the set is already all done
- [ ] No cheer when the active ticket set changes to a set that is all done
- [ ] No cheer for a set with no tickets
- [ ] Every registered character plays the cheer without leaving the stage
- [ ] Covered by whole-mod tests that read the painted cells across the zap and the cheer
