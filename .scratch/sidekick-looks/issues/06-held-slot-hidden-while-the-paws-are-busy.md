# 06: Held slot, hidden while the paws are busy

**What to build:** The sidekick can hold something. The outfit gains a held slot with one new accessory (for example a flag), set with `held=`. Because writing draws paper at the paw and zapping draws an arm and a bolt there, a held accessory disappears while the sidekick writes or zaps and returns afterwards. Each animation declares the slots it hides, so an animation that doesn't use the paws leaves the held accessory visible.

**Blocked by:** 05: Face and neck slots

**Status:** done

- [x] One held accessory exists and appears in the look command's listing under the held slot
- [x] `held=` shows it on the foxkit and on the classic character while the sidekick rests
- [x] It is not drawn in any frame painted while the sidekick writes
- [x] It is not drawn in any frame painted during a zap
- [x] It is drawn again once the sidekick is back at rest
- [x] An animation declares the slots it hides; an animation that hides none leaves every accessory drawn
- [x] Held is drawn above the other accessories
- [x] The bare foxkit's golden frames are unchanged
- [x] Covered by whole-mod tests that read the painted cells during a turn and during a strike
