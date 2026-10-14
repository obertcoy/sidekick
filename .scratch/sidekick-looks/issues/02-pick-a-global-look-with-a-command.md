# 02: Pick a global look with a command

**What to build:** The developer chooses the sidekick's look with a look command instead of editing the mod. `character=classic head=cap background=dusk`, in any combination, changes the look used in every project; the pane's sidekick repaints with it before the command returns, and the look is still there after Claude Code restarts. Parts that were not named stay as they were. With no arguments the command replies with the current look and every character, accessory (grouped by slot) and background that exists. A name that doesn't exist, or an accessory put in the wrong slot, is refused with the valid choices and nothing is saved.

**Blocked by:** 01: The look is resolved, not a constant

**Status:** done

- [x] The look command is registered at session start beside the existing commands
- [x] Setting a character, a head accessory or a background shows on the sidekick's next paint
- [x] Several parts can be set in one command
- [x] A part that was not named keeps its earlier value
- [x] The look is still in effect after a fresh session start
- [x] A developer who never ran the command sees the bare foxkit
- [x] No arguments: the reply shows the current look and lists the characters, the accessories by slot and the backgrounds
- [x] An unknown part or unknown name is refused, the reply lists the known names for that part, and nothing is saved, including the valid pairs of the same command
- [x] An accessory named for a slot it doesn't belong to is refused, and the reply names its slot
- [x] Covered by whole-mod tests that read the command's reply and the painted cells
