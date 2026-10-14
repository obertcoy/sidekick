# 05: Face and neck slots

**What to build:** The sidekick can wear more than a hat. The outfit gains a face slot and a neck slot, each with one new accessory (for example glasses and a scarf), set with the look command as `face=` and `neck=` alongside `head=`. The foxkit and the classic character support both. Each accessory follows the part of the body it sits on: one on the face bobs with the head. Only the head slot is required of a character; a character may lack the others, and setting an accessory for a slot the current character lacks is saved but the reply says the character has no such slot, and the accessory comes back when the developer switches to a character that has it.

**Blocked by:** 02: Pick a global look with a command

**Status:** done

- [x] One face accessory and one neck accessory exist and appear in the look command's listing under their slots
- [x] `face=` and `neck=` put them on the foxkit and on the classic character, on that character's anchor for the slot
- [x] Head, face and neck accessories can be worn together, drawn in the order neck, face, head
- [x] A face accessory moves with the head bob; whether a slot moves with the bob is declared by the character
- [x] A new accessory in a slot replaces the one that was there
- [x] A character is valid without face or neck anchors; an anchor that is given must be on the stage or the character is refused at load
- [x] Setting an accessory for a slot the current character lacks is saved, the reply says the character has no such slot, and nothing is drawn for it
- [x] That accessory is drawn after switching to a character that has the slot
- [x] A slot the character lacks is not reported on the pane as a dropped part
- [x] The bare foxkit's golden frames are unchanged
- [ ] Pixel placement covered by renderer tests; the command's replies by whole-mod tests, using a test-only character without the slots
