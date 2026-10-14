# Sidekick looks and animations

Status: ready-for-agent

## Problem Statement

The sidekick in the pane's header is always the same bare foxkit, and it only ever does two things: it writes while a turn runs and zaps when a ticket is done. The layered sprite system can already draw other characters, a hat and a background, but nothing lets me choose them: the look is a constant in the code, so changing it means editing the mod.

When I have several terminals open on different projects, every pane has the same face, so the sidekick does nothing to tell them apart. While a search for tickets runs, or fails, or when I finish the last ticket of a set, the sidekick stands still, so the moments that matter most look the same as nothing happening. And between turns it is a frozen picture, which makes the pane feel dead.

## Solution

I pick my sidekick's look with a command: its character, an outfit made of accessories in up to four slots (head, face, neck, held), and a background. The pick is mine and carries no project state. One look applies to every project, and I can override single parts of it for one project so that its pane is recognisable at a glance.

The sidekick reacts to more of what happens: it looks around while a search or rescan runs, shrugs once when a search fails, and cheers once when the active ticket set becomes all done, in addition to writing and zapping as it does today. Between those, it has small ambient motion of its own (a blink, a tail or ear flick, a cheek spark, depending on the character), a few seconds apart. A second command turns the ambient motion off, after which the sidekick behaves as it does today: still unless something happened.

## User Stories

### Choosing the look

1. As a developer, I want to choose my sidekick's character with a command, so that I don't have to edit the mod to change it.
2. As a developer, I want to choose a background with the same command, so that the sidekick's stage is mine too.
3. As a developer, I want to put an accessory in a named slot (`head=cap`), so that I can dress the sidekick one piece at a time.
4. As a developer, I want to set several parts in one command (`character=classic head=cap background=dusk`), so that I can set a whole look at once.
5. As a developer, I want a change to leave the parts I didn't name as they were, so that adding a scarf doesn't remove my hat.
6. As a developer, I want to clear one part (an empty slot, no background), so that I can take something off without resetting everything.
7. As a developer, I want the command with no arguments to show my current look and list every character, accessory (by slot) and background that exists, so that I know what I can pick without reading the code.
8. As a developer, I want the pane to repaint with the new look as soon as the command returns, so that I see what I picked.
9. As a developer, I want my look to survive restarting Claude Code, so that I set it once.
10. As a developer who never ran the command, I want the bare foxkit as today, so that the feature changes nothing until I use it.
11. As a developer, I want the command to refuse a name that doesn't exist and list the ones that do, so that a typo doesn't silently do nothing.
12. As a developer, I want the command to refuse an accessory placed in the wrong slot (a cap in `neck`), so that I learn which slot it belongs to.

### One look everywhere, with a project's own parts

13. As a developer, I want one look for all my projects by default, so that I don't set it again in each one.
14. As a developer, I want to change a part for the current project only (`here character=classic`), so that two open terminals have different faces.
15. As a developer, I want a project's override to cover only the parts I named there, so that a hat I add globally also appears in that project.
16. As a developer, I want to remove a project's override (`here reset`), so that the project goes back to my global look.
17. As a developer, I want the no-argument listing to tell me which parts of the current look come from the project's override, so that I understand why this pane differs.
18. As a developer, I want a change to the global look to show at once in the current pane for every part the project doesn't override, so that the command visibly worked.

### Outfits and slots

19. As a developer, I want four slots (head, face, neck, held), so that the sidekick can wear more than a hat.
20. As a developer, I want at most one accessory per slot, so that putting on a new hat replaces the old one.
21. As a developer, I want every accessory to follow the part of the body it sits on (a hat and glasses bob with the head), so that the outfit doesn't float when the sidekick moves.
22. As a developer, I want a held accessory to disappear while the sidekick writes or zaps and return afterwards, so that the paper and the bolt aren't drawn through a flag.
23. As a developer, I want a held accessory to stay visible during animations that don't use the paws (the cheer), so that it isn't hidden more than necessary.
24. As a developer, I want the command to tell me when my character has no such slot ("snake has no held slot"), so that I know the accessory isn't broken.
25. As a developer, I want switching to a character that lacks a slot to keep my saved accessory for that slot, so that it comes back when I switch to a character that has it.

### A look that can't be drawn

26. As a developer, I want the pane to keep working when my saved look names a part that no longer exists, so that a cosmetic never breaks the pane.
27. As a developer, I want the part that can't be drawn to be left out and the rest of the look kept, so that one missing hat doesn't reset my character.
28. As a developer, I want an unknown saved character to fall back to the foxkit, so that there is always a sidekick.
29. As a developer, I want one short line telling me which part was dropped, shown once and not on every repaint, so that I know why the look changed without being nagged.

### State animations

30. As a developer, I want the sidekick to keep writing while a turn runs and zapping when a ticket is done, so that what I already rely on doesn't change.
31. As a developer, I want the sidekick to look around while a search or rescan runs, so that I can see the mod is working before the pane has anything to show.
32. As a developer, I want the sidekick to shrug once when a search fails or finds nothing, so that the failure is visible on the sidekick as well as in the text.
33. As a developer, I want the sidekick to cheer once when the last ticket of the active ticket set becomes done, so that finishing a set feels different from finishing one ticket.
34. As a developer, I want the cheer to play again if I reopen a ticket and finish the set again, so that it marks every completion.
35. As a developer, I want no cheer when the pane opens on a set that is already all done, so that old news isn't announced.
36. As a developer, I want no cheer when the active ticket set changes to a different set that happens to be all done, so that switching sets isn't mistaken for finishing one.
37. As a developer, I want the zap for the last ticket to play to its end before the cheer starts, so that the strike on the ticket's row isn't cut off.
38. As a developer, I want once-only animations that arrive together to play one after another in the order they arrived, so that none is dropped.
39. As a developer, I want the sidekick to return, after the once-only animations, to whatever is still going on (writing if a turn runs, else looking if a search runs, else resting), so that it always shows the present.
40. As a developer, I want the ticket strike to stay in step with whichever animation plays for a finished ticket, so that the bolt still leaves the sidekick and lands on the row.

### Characters differ

41. As a developer, I want every character to share the same state animations by default, so that a new character works without drawing five animations for it.
42. As a mod author, I want a character to be able to replace a state animation with its own (an owl that hoots in place of zapping), so that an animation that doesn't suit a character isn't forced on it.
43. As a mod author, I want each character to name the ambient animations it uses, so that a character without cheeks doesn't spark and one without a tail doesn't flick it.
44. As a mod author, I want a character that names an animation that doesn't exist to be refused when the mod loads, so that the mistake shows up in tests and not in someone's pane.
45. As a mod author, I want adding a character, accessory, background or animation to stay one file plus one registry line, so that the system stays easy to extend.

### Ambient motion

46. As a developer, I want the resting sidekick to blink, flick or spark now and then, so that the pane feels alive.
47. As a developer, I want a random gap of 5 to 15 seconds between ambient animations, so that the motion doesn't pulse like a clock or pull my eye constantly.
48. As a developer, I want ambient motion only while the sidekick is resting, so that it never interrupts writing, looking or a once-only animation.
49. As a developer, I want a state animation to start at once even if an ambient animation is playing, so that real events are never delayed by decoration.
50. As a developer, I want a background with several frames to cycle slowly while the sidekick rests, so that an animated background is animated.
51. As a developer, I want a command that turns ambient motion off and on, so that I can have a still pane if motion distracts me.
52. As a developer, I want "off" to stop both the ambient animations and the background's cycling, so that nothing moves on its own.
53. As a developer, I want state animations to keep playing with ambient motion off, so that "off" gives me today's behaviour and not a dead sidekick.
54. As a developer, I want the motion setting to be mine across all projects, so that I don't have to turn it off in each one.
55. As a developer, I want the motion setting to survive a restart, so that I set it once.
56. As a developer, I want the motion command with no arguments to say whether ambient motion is on or off, so that I can check.
57. As a developer, I want no timer running while ambient motion is off and nothing is happening, so that a still pane costs nothing.

### First content

58. As a developer, I want at least one accessory to pick for each slot, so that every slot is usable on day one.
59. As a developer, I want the foxkit and the classic character to support all four slots and blink, so that the first version is complete on the characters that exist.

## Implementation Decisions

### Vocabulary

- The glossary now defines Sidekick, Character, Look, Background, Outfit, Accessory, Slot, Animation and Ambient motion. The code is brought in line with it: what the sprite types call an "outfit" today (one picture on the head) becomes an **accessory**; the **outfit** is the set of accessories, at most one per slot. "Critter", "buddy" and "mode" leave the code and comments.

### The look

- A look is a character name, an outfit (slot → accessory name, any slot may be empty) and a background name or none.
- Two things are saved in the mod's store: the user's global look, and per project root an **override** holding only the parts the user set for that project. Each is saved as a partial look; a part that is absent means "not set here", which is different from a part explicitly set to empty.
- The look the pane draws is resolved in order: built-in default (foxkit, empty outfit, no background), then the global look's parts, then the project override's parts. "Explicitly empty" in an override wins over a global accessory, so a project can take the global hat off.
- Resolution never throws. Each part is checked on its own: an unknown character falls back to the foxkit; an unknown accessory or background, an accessory saved in a slot it doesn't belong to, or an accessory for a slot the resolved character lacks is left out. Resolution returns the drawable look plus the list of parts it dropped and why. The saved look is not rewritten, so a part that becomes drawable again (the character changes, the accessory returns) reappears.
- The pane shows one dim line for dropped parts. It is shown when the set of dropped parts changes and cleared on the next change of look, not repeated on every refresh. A slot the current character lacks is not reported as dropped on the pane (the command already said so when it was set); only parts that no longer exist are.
- The look is resolved when the pane refreshes and when a look command runs, not at module load, so the sprite module no longer holds a fixed look.

### Slots and accessories

- An accessory declares its slot, its pixels, its palette and which of its pixels sits on the slot's anchor.
- A character gives one anchor per slot it supports. The head anchor stays required; face, neck and held anchors are optional, and a missing one means the character has no such slot. A character also declares, per slot, whether the slot moves with the head bob; head and face do on both existing characters.
- A new optional anchor for the eyes supports the blink. The foxkit and the classic character gain face, neck, held and eye anchors.
- Layer order within a frame: background, body, accessories in a fixed slot order (neck, face, head, held), then the animation's props and effects.
- An animation declares the slots it hides while it plays. Writing and zapping hide the held slot; looking, shrugging, cheering and the ambient animations hide none. A hidden slot's accessory is simply not drawn for that animation's frames.
- Character validation at load is extended: optional anchors must be on the stage when given, and every animation name the character refers to must exist.

### Animations and what triggers them

- The pane tracks the sidekick's **activity** rather than a single mode. The activity has two parts: the conditions that currently hold (a turn is running; a search is running) and a queue of once-only animations waiting to play.
- Events and what they do:
  - main-conversation turn starts / completes → sets and clears "turn running" (subagent turns are ignored, as today);
  - a search or rescan starts / ends → sets and clears "search running";
  - a search ends with no answer or no tickets found → queues the shrug;
  - one or more tickets become done → queues the zap (with its strike, as today);
  - the active ticket set's done count reaches its total, having been below it at the previous refresh of the *same* set → queues the cheer after that zap. No cheer on the first refresh of a session, on a change of active ticket set, or for an empty set.
- What plays: if the queue is not empty, its head plays to its last frame, then the next. When the queue is empty the sidekick rests in the loop for the conditions that hold: writing if a turn runs, otherwise looking if a search runs, otherwise idle with ambient motion. A once-only animation is never cut short by a change of conditions or by another queued animation.
- The existing rule that tickets finishing mid-strike are struck afterwards is kept; it becomes one case of the queue.
- Each state (working, searching, search failed, ticket done, set done, resting) maps to a shared animation by default. A character may replace the animation for any state by name. The strike's step count follows the frame count of whichever animation plays for "ticket done", so a replacement stays in step with the row's flash and strike-through; a replacement must have at least as many frames as the strike has fixed steps before the burn.
- Frame timing is read from the animation itself. The pane's own copy of the timings, and the test that pins the two together, are removed.

### Ambient motion

- Shared ambient animations: blink (needs the eye anchor), tail flick, ear flick, cheek spark. Each plays once and is short. They are ordinary animations in the registry, drawn from anchors only.
- Each character lists the ambient animations it uses; an empty list means the character has none. A character that lists the blink must give an eye anchor.
- While the sidekick rests with ambient motion on: wait a random 5 to 15 seconds, play one animation chosen at random from the character's list, repeat. The wait is one timer armed on entering rest and cancelled on leaving it; a state animation that arrives during an ambient animation replaces it at once.
- A background with more than one frame advances one frame at a slow fixed interval while the sidekick rests with ambient motion on. During any animation it steps with the animation, as today.
- The motion setting is one global boolean in the store, on by default. Off means: no ambient timer, no background cycling at rest, a multi-frame background holds its first frame at rest. State animations are unaffected.
- With ambient motion off and nothing happening, no timer runs.

### Commands

- A look command, registered beside the existing two:
  - no arguments: replies with the current look (marking parts that come from the project override and parts that could not be drawn) and the available characters, accessories grouped by slot, and backgrounds;
  - `part=name` pairs (`character`, `head`, `face`, `neck`, `held`, `background`), any number: sets those parts in the global look;
  - `part=none`: sets that part explicitly empty (not valid for `character`);
  - a leading `here`: applies the pairs to the current project's override instead;
  - `here reset`: deletes the project's override; `reset` alone deletes the global look.
- The command validates before saving and saves nothing if any pair is invalid: unknown part, unknown name (reply lists the known names for that part), accessory in the wrong slot (reply names its slot). Setting an accessory for a slot the character it will be drawn on lacks is saved but the reply says the current character has no such slot.
- A motion command: `on`, `off`, or no argument to report the setting.
- Both commands repaint the pane's sidekick before returning.

### Content in the first version

- Existing: foxkit, classic, cap (head), dusk.
- New: one accessory each for face, neck and held; the shared animations for searching, search failed and set done; the four ambient animations.
- The bare foxkit's existing frames for idle, write and zap do not change.

## Testing Decisions

A good test here drives the mod as the engine does and checks what the user would see: the command's reply, the pane's text, and the sidekick's painted cells. It does not reach into the activity queue, the saved store shape or timer handles.

- **Whole-mod seam (existing, preferred).** The test world that stands beneath the mod, with the mock clock and mounted pane already used by the strike and pane tests. Almost everything is tested here: run a command and read its reply and the next painted sidekick; start and end turns and searches; mark tickets done; advance the clock. The world today records only the key of each repaint; it is extended to keep the painted cells, so a test can say *which* frame was painted by comparing against the pure renderer's output for an expected look and animation.
  - Look: default is the bare foxkit; a set part shows on the next paint and after a fresh session start; unnamed parts persist; `none` clears; project override beats global part by part and `here reset` restores; a global change shows through for non-overridden parts; invalid input saves nothing and lists valid names.
  - Undrawable look: seed the store with a look naming a part that doesn't exist; the pane still renders, the rest of the look is kept, the notice appears once.
  - Triggers: looking while a search is pending and stopping when it resolves; shrug after a failed search; cheer after the last ticket's zap finishes, not before; cheer again after reopen-and-finish; no cheer on first open of a finished set or on a change of active set; return to writing when a turn is still running.
  - Held slot: hidden in frames painted during write and zap, present during cheer and at rest.
  - Ambient: nothing painted in the first 5 s of rest; at least one ambient animation by 15 s plus its length; none while a turn runs; none with motion off, and no pending timers then; the setting survives a session start.
  - Character override: a test-only character that replaces the "ticket done" animation, with the strike still completing on the row.
- **Pure sprite seam (existing).** The renderer as a function from look, animation and step to pixels, as in the current sprite tests. Used for what is about pixels rather than behaviour: accessories land on their slot anchors and bob with the head where declared; layer order; a hidden slot isn't drawn; character validation refuses a bad optional anchor, an unknown animation name, and a blink without eyes; every registered character plays every shared state animation and every ambient animation it lists without leaving the stage.
- **Golden frames.** The bare foxkit's idle, write and zap frames stay pinned to the existing golden file unchanged; that is the proof the refactor to slots and resolved looks didn't move a pixel. New animations and accessories are not added to the golden file; they are covered by the structural checks above.
- **No new seam.** The random gap is tested through the clock by its bounds, so no random source needs injecting.
- Not automated, worth a manual pass in a real terminal: whether the new accessories read at 18×16 pixels, whether the ambient cadence feels calm rather than twitchy, and whether a cycling background distracts.

## Out of Scope

- An animation for "the summary needs the user". It was considered and left out.
- Different animations per tool type.
- A sleep animation after long idle.
- Parts earned or unlocked from work, and any counters that would need.
- Backgrounds or outfits that change with project state.
- A live picker in the pane; the look is set by command arguments only.
- A per-project motion setting.
- New characters beyond the foxkit and classic, and more than one new accessory per new slot. More art follows as separate tickets.
- Following the operating system's reduced-motion preference.
- User-supplied characters or accessories from outside the mod's folder.

## Further Notes

- The product document was amended alongside this spec: the look is the one allowed decoration that carries no state; ambient motion is allowed and can be turned off; the sidekick's character is the user's pick rather than one fixed critter.
- "Motion off" is deliberately the behaviour before this spec, which gives a simple regression check: with motion off and the default look, the pane should be indistinguishable from the previous version apart from the three new state animations.
- The README's section on adding sprite parts describes a head-only outfit and a constant look; it needs rewriting for slots, accessories, per-character animation lists and the two commands.
