# 13: Animations wait until the pane is shown

**What to build:** The sidekick animates only while its pane is the one shown. When several panes are open, one is shown and the rest are tabs; while the sidekick's pane is a tab behind another, nothing of it can be seen, so nothing plays and no animation timer runs. A once-only animation that arrives while the pane is not shown (the zap for a done ticket, the shrug for a failed search, the cheer for a finished set) is not lost: it is kept and plays once when the pane is next shown, in the order it arrived, the zap still in step with its row's flash and strike-through. A lasting state (writing while a turn runs, looking while a search runs) is not replayed: when the pane is shown again the sidekick simply does what that state calls for now, or rests if the state has ended. Ambient motion does not run while the pane is not shown, and its wait starts afresh when the pane is shown. "Shown" is about which pane is in view, not about which has the keyboard: the sidekick keeps animating while the developer types in the prompt.

**Blocked by:** 09: Ambient motion with an off switch

**Status:** ready-for-agent

- [ ] While the sidekick's pane is the shown pane, every animation plays as it did before this ticket, whether or not the pane has the keyboard
- [ ] While the pane is not shown, no frame is painted and no animation or ambient timer is pending
- [ ] A ticket that becomes done while the pane is not shown zaps once, with its strike, when the pane is next shown
- [ ] A search that fails while the pane is not shown shrugs once when the pane is next shown
- [ ] A ticket set that becomes all done while the pane is not shown cheers once when the pane is next shown, after its zap
- [ ] Several once-only animations kept while the pane is not shown play in the order they arrived, each once
- [ ] A turn or search that started and ended while the pane was not shown plays nothing when the pane is shown
- [ ] A turn or search still running when the pane is shown plays its animation from then on
- [ ] No ambient animation plays in the first 5 seconds after the pane is shown
- [ ] With only the sidekick's pane open, behaviour is unchanged from before this ticket
- [ ] The bare foxkit's golden frames are unchanged
- [ ] Covered by whole-mod tests that hide and show the pane and advance the mock clock
