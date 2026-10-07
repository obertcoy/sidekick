# Project Pane

A Claude Code mod that shows the state of the current project in a pane, so it can be read without asking the chat for a recap.

## Language

**Project**:
The folder the Claude Code session is running in; the pane shows this one project and no other.
_Avoid_: Repo, workspace

**Summary**:
A short account of where the project stands: what happened, what's next, and what needs the user. It is replaced only when a turn decides something or moves the work, not on every turn.
_Avoid_: TLDR, recap, status

**Ticket**:
One unit of planned work in a project, stored as a local file or as one line of a checklist file.
_Avoid_: Issue, task, todo

**Ticket set**:
A group of tickets that belong to one feature or effort within a project.
_Avoid_: Feature, epic, board

**Active ticket set**:
The ticket set the project's latest session read or edited, or the most recently changed one when the session touched none.
_Avoid_: Current feature

**Recipe**:
A project's saved description of where its tickets are and how to read a ticket's title and whether it is done.
_Avoid_: Format, parser, config, schema

**Search**:
The one-time inspection of a project that produces its recipe.
_Avoid_: Scan, discovery, detection

**Rescan**:
A search the user asks for, optionally with a hint, that replaces the project's recipe.

**Done**:
A ticket whose status says it is finished, or, in a format with no status, whose checkboxes are all ticked.
_Avoid_: Closed, complete, resolved

**Progress**:
The tickets of the active ticket set, each done, in progress or open, with the count of done ones and the next ticket that isn't done.
