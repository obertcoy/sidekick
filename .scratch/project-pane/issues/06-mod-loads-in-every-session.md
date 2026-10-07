# 06: The mod loads in every session

**What to build:** Today the mod loads only in a session started with the plugin-folder flag. After this ticket, every Claude Code session the user starts on this machine has the mod on, with no flag to remember, and edits to the mod's folder are still picked up. The change is made in the user's own Claude Code settings, not in any project, and how to turn it off again is written down.

**Blocked by:** 04: The pane reads well in a real terminal

**Status:** ready-for-agent

- [ ] A session started with plain `claude` in a project has the open and rescan commands available
- [ ] The same holds in a second, different project
- [ ] The setting lives in the user's own settings, and no project folder is changed
- [ ] The user is asked before their settings file is edited
- [ ] How to turn the mod off again is noted in the mod's folder
