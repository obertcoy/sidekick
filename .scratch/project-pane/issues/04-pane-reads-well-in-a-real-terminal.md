# 04: The pane reads well in a real terminal

**What to build:** The pane has only been checked through tests, never seen. With the user watching a real Claude Code terminal session, the pane is opened on each sample project and looked at in a wide and a narrow terminal. Long summaries and long ticket titles wrap or shorten cleanly, the progress bar fits the pane, "needs you" stands out, and the empty and searching states read clearly. The open command opens the pane at any width and closes it again. Whatever looks wrong is fixed and looked at again.

This ticket needs the user: an agent cannot see an interactive terminal.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [ ] The pane has been seen on a project with one-file-per-ticket tickets, a checklist project, a status-field project and a project with no tickets
- [ ] The pane opens by itself in a wide terminal and through the command in a narrow one
- [ ] The close form of the command closes it
- [ ] A long summary line and a long next-ticket title do not break the layout
- [ ] The progress bar fits inside the pane at its narrowest usable width
- [ ] The "looking for tickets" and "no summary yet" states have each been seen and read clearly
- [ ] The user has said the pane looks right
