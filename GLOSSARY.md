# Sidekick

A Claude Code mod that shows the state of the current project in a pane, so it can be read without asking the chat for a recap.

## Language

**Project**:
The folder the Claude Code session is running in; the pane shows this one project and no other.
_Avoid_: Repo, workspace

**Summary**:
A session's goal, its phase and what needs the user, together. It is rewritten only on a turn that made an edit, or when the user asks for a note; no other turn changes it.
_Avoid_: TLDR, recap, status

**Session**:
One conversation in a project. `/clear` starts a new session; a resume continues the earlier one.
_Avoid_: Chat, thread

**Goal**:
What the session is for, in one line. It stays as written unless the user changes direction. Until the session's first turn with an edit it is provisional: the session's first prompt, cut to one line.
_Avoid_: Task, objective

**Phase**:
The step of work the session is in, in free text. It stays as written unless the work moves to a different step.
_Avoid_: Stage (the sprite's canvas), step, status

**Edit**:
A change to the working tree made in a turn, by an edit tool or by a shell command. A failed edit is not one.
_Avoid_: Change, write

**Turn log**:
The hidden record of a session's recent turns that is given to the model as context. It is never shown.
_Avoid_: History, transcript

**Note**:
A session's short kept list of decisions. The model amends it, the user can add to it in their own words, and it is read in the note view.
_Avoid_: Memo, decisions log

**Note view**:
The second pane that shows notes, this session's first and then the project's other recent sessions. It opens only when the user asks for it.

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

**Sidekick**:
The pixel creature in the pane's header. Where the difference matters, the mod itself is "the Sidekick mod".
_Avoid_: Critter, buddy, sprite, mascot

**Character**:
Which creature the sidekick is, such as the foxkit; the user picks it.
_Avoid_: Skin, species, avatar

**Look**:
What the sidekick looks like: its character, its outfit and its background together. Every part of a look is the user's pick; none of it shows project state. The user has one look for all projects and may give a project its own.
_Avoid_: Theme, skin, style

**Background**:
The picture behind the sidekick; part of the look, chosen by the user.
_Avoid_: Scene, backdrop

**Outfit**:
Everything the sidekick wears at once: at most one accessory in each slot.
_Avoid_: Costume, clothes

**Accessory**:
One thing the sidekick wears, such as a cap or glasses; it belongs to exactly one slot.
_Avoid_: Item, hat (a hat is an accessory in the head slot)

**Slot**:
A place on the sidekick where one accessory goes: head, face, neck or held. Every character has the head slot; a character may lack any of the others.

**Animation**:
A short motion of the sidekick. A state animation marks something that happened in the project; every character shares the same ones unless a character replaces one with its own.
_Avoid_: Mode, effect

**Ambient motion**:
Animations the sidekick plays on its own while nothing is happening, such as a blink. Each character names its own; the user can turn all of it off.
_Avoid_: Idle animation, fidget
