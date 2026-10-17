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
_Avoid_: Stage (the sidekick's canvas, see **Stage**), step, status

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
The ticket set one session is working on: the one the user picked in that session, or the one the session last read or edited, whichever came last. A project with one ticket set has it active at once; with more, a new session has none until one is picked or touched, and a resumed session keeps its own.
_Avoid_: Current feature

**Recipe**:
A project's saved description of the places its tickets are kept and how to read a ticket's title and whether it is done. A recipe can name several places; a place found later is added, never swapped in for one already known, and a place drops out only once it holds no tickets.
_Avoid_: Format, parser, config, schema

**Search**:
An inspection of a project that produces or extends its recipe: once when the project is first seen, on a rescan, and when a session writes a ticket in a place the recipe does not know.
_Avoid_: Scan, discovery, detection

**Rescan**:
A search the user asks for, optionally with a hint. It adds the places it finds to the recipe and never removes one; a rescan that finds nothing leaves the recipe as it was.

**Done**:
A ticket whose status says it is finished, or whose checkboxes are all ticked when it has no status or a status that says neither finished nor in progress. A status that says finished counts even with more words after it.
_Avoid_: Closed, complete, resolved

**Set picker**:
The list of a project's ticket sets that the pane offers when a session starts or a rescan finds more than one, until the user picks one or starts working.
_Avoid_: Menu, list, chooser

**Progress**:
The tickets of the active ticket set, each done, in progress or open, with the count of done ones and the next ticket that isn't done.

**Inbox**:
What the pane shows below the progress, most urgent first: NEEDS YOU (open inbox items that ask something of the user, block the work or change its direction), READY TO REVIEW (tickets of the active ticket set done in their files), WORKING (its tickets in progress, and how many subagents are running now) and REVIEWED (a count). The ticket files decide READY TO REVIEW and WORKING; the model only writes the items. It never says work is verified: beside what a ticket says it shows evidence the user can check, its ticked boxes.
_Avoid_: Feed, notifications, Done/Next

**Inbox item**:
One thing the summary after a turn writes and the mod keeps per project until it is cleaned up: a needs-you question, a blocker, a change of direction, or a note (one line of a ticket's history). It belongs to one ticket or to none, and has a short line for the pane and a long explanation. Reviewed is the mod's display state only; Claude Code never reads it. A question a later turn answered, or a blocker it shows gone, becomes reviewed by itself and keeps a receipt ("you said: …", "unblocked: …"); a change of direction is reviewed only by hand.
_Avoid_: Message, notification, event

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
The picture behind the sidekick; part of the look, chosen by the user. It stands on the stage's ground and repeats sideways across the world.
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
A short motion of the sidekick. Every animation is in the library, whether or not any character plays it.
_Avoid_: Mode, effect

**Stage**:
The sidekick's canvas, made to fit its character: sky above (headroom for jumps and falling bolts), the character down to its feet, then the ground. It is wide, at least 40 pixels, like a small world, and the character stands in the middle of it. Animations, poses and accessories place things only from the character's anchors and from the stage's named edges (sky top, ground, the camera's left and right), never from fixed coordinates, so any character size works with any effect. A look can cap the stage's height; a character too tall for the cap is refused, and the capping background is left out.
_Avoid_: Canvas, scene, sprite

**Camera**:
What the pane looks into the stage through. It keeps the character centred horizontally and stays inside the world; a narrow pane shows the part around the character, a wide one the whole world. When the pane has less height than the stage it trims the sky first, and never cuts into the character or the ground.
_Avoid_: Viewport, window

**Body motion**:
What a frame can do to the whole character: move it (`dx`, `dy`, in pixels), turn it to face the other way (`mirror`, about the middle of its frame), squash it by a row or stretch it by a row (the feet stay on the same row), and recolour some of its body roles for that frame only. Accessories move, turn, squash and stretch with the body; a recolour reaches only the body, since an accessory has its own colours.
_Avoid_: Transform, animation of the body

**Mask**:
The pixels the character covers in a frame, accessories included, after all its body motion; props and effects are not part of it. An effect that hugs the character, such as an aura, is aimed by it.
_Avoid_: Silhouette, hitbox

**Moment**:
Something the mod can detect that the sidekick answers with an animation: a turn is working, a search runs, a search fails, a ticket is done, a set is done, the sidekick rests. The list is closed; one is added only together with a real event that produces it.
_Avoid_: State, event, trigger

**Library**:
Every animation the mod has, by name. An animation can sit in it without being played for any moment.

**Moveset**:
What a character plays: for each moment it names, the library animation. A moment it leaves out plays that moment's plain default.
_Avoid_: Animation set, replacements

**Plain default**:
The animation that plays for a moment when a character's moveset leaves it out. It uses only what every character has (its head and feet), so any character can play it and a knight is never handed the bolt.

**Ambient motion**:
Animations the sidekick plays on its own while nothing is happening, such as a blink. Each character names its own; the user can turn all of it off.
_Avoid_: Idle animation, fidget
