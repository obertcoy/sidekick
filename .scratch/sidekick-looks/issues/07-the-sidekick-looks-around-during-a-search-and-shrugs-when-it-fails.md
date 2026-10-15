# 07: The sidekick looks around during a search and shrugs when it fails

**What to build:** While a search or rescan runs, the sidekick looks around, so the developer sees the mod working before the pane has anything to show. When a search fails or finds no tickets, the sidekick shrugs once. To make room for more than one thing happening at a time, the pane stops tracking a single mode and tracks the sidekick's activity: the conditions that hold now (a turn is running, a search is running) and a queue of once-only animations. A queued animation plays to its last frame, then the next; when the queue is empty the sidekick rests in the loop for what is still going on: writing if a turn runs, otherwise looking if a search runs, otherwise standing still. Writing, zapping and the ticket strike behave as they do today, and tickets that finish mid-strike are still struck afterwards.

**Blocked by:** 01: The look is resolved, not a constant

**Status:** done

- [x] The sidekick plays the looking animation from the start of a search or rescan until it ends
- [x] It plays the shrug once when a search gets no answer and when it finds no tickets
- [x] No shrug when the search finds tickets
- [x] When a turn and a search run together the sidekick writes; when the turn ends first it looks; when both end it stands still
- [x] A once-only animation is not cut short by a change of conditions or by another queued animation
- [x] Once-only animations that arrive together play in the order they arrived
- [x] Subagent turns do not start or stop the writing, as today
- [x] The existing strike tests pass unchanged in what they assert
- [x] A timer runs only while the sidekick is moving
- [x] Every registered character plays the two new animations without leaving the stage
- [x] Covered by whole-mod tests that hold a search pending, resolve or fail it, and read the painted cells
