# Sidekick

Status: ready-for-agent

## Problem Statement

I work in Claude Code across several projects, and after each chat I have to ask for a recap ("tldr", or a recap command) to find out where the project stands. The answer lives in the chat that just ended, so I re-ask it every time and re-explain the same project context when I come back.

My tickets already describe the planned work, but nothing shows me at a glance how far through them I am or which one is next. Different projects keep tickets in different shapes (one file per ticket, a single checklist, files with a status field), so a tool tied to one layout would only work in some of my projects.

## Solution

A Claude Code mod that keeps a pane open beside the conversation for the project the session is running in. The pane shows two things without my asking:

- A **summary** of where the project stands: what happened, what's next, and what needs me. It changes only when a turn decides something or moves the work.
- **Progress** through the project's tickets: how many are done out of the total in the ticket set I'm working on, and the title of the next ticket.

The mod works out where a project keeps its tickets by itself. The first time it sees a project it runs one **search** with a small model, saves the result as a **recipe**, and from then on reads the tickets with plain code. If the search guesses wrong, I can see where it is reading from and ask for a **rescan** with a hint.

## User Stories

### Seeing where the project stands

1. As a developer, I want a pane that shows the current project's summary, so that I don't have to ask the chat for a recap.
2. As a developer, I want the summary split into what happened, what's next and what needs me, so that I can find the part I care about at a glance.
3. As a developer, I want "what needs me" to stand out visually, so that I notice when the work is waiting on a decision of mine.
4. As a developer, I want the summary to change only when a turn decides something or moves the work, so that a question or small talk doesn't overwrite a useful summary.
5. As a developer, I want a decision made purely in conversation, with no file touched, to update the summary, so that planning sessions are captured too.
6. As a developer, I want the summary to survive closing the session, so that I see it when I come back to the project later.
7. As a developer, I want the pane to tell me when there is no summary yet and when one will appear, so that an empty pane doesn't look broken.
8. As a developer, I want turns run by subagents not to rewrite the summary, so that it reflects my conversation and not internal steps.
9. As a developer, I want an interrupted or failed turn to leave the summary alone, so that a half-finished turn isn't recorded as progress.
10. As a developer, I want the pane to show the project's name, so that I know which project I'm looking at when several terminals are open.

### Seeing ticket progress

11. As a developer, I want to see how many tickets are done out of the total, so that I know how far through the work I am.
12. As a developer, I want a bar alongside the count, so that I can read progress without parsing numbers.
13. As a developer, I want to see the title of the next ticket, so that I know what to pick up.
14. As a developer, I want a ticket marked as in progress to be shown as next ahead of the first open one, so that the pane points at what I'm actually working on.
15. As a developer, I want to be told when every ticket is done, so that I know the ticket set is finished.
16. As a developer, I want progress read from the ticket files themselves, so that edits made outside Claude Code show up.
17. As a developer, I want progress to update soon after a ticket file changes, so that the pane doesn't lag behind the work.
18. As a developer, I want the pane to show where it is reading tickets from, so that I can spot a wrong guess.
19. As a developer, I want a project with no tickets to show only its summary, so that the pane stays useful there.

### Working with several ticket sets

20. As a developer with one folder of tickets per feature, I want the pane to show the ticket set my session touched, so that the count is about the feature I'm working on.
21. As a developer, I want the pane to fall back to the most recently changed ticket set when my session hasn't touched any tickets, so that it shows something sensible at the start of a session.
22. As a developer, I want finished old features left out of the count, so that the number isn't inflated by work that's long done.
23. As a developer, I want tickets within a set listed in their numbered order, so that "next" follows the order I planned.

### Finding tickets in any project

24. As a developer, I want the mod to find where a project keeps its tickets without my configuring it, so that it works in a new project straight away.
25. As a developer using Matt Pocock's local ticket layout, I want it recognised, so that my existing projects work unchanged.
26. As a developer who keeps a single checklist file, I want each checklist line counted as a ticket, so that simple projects work too.
27. As a developer whose tickets carry a status field, I want that field read, so that my own status words are respected.
28. As a developer, I want the search to run once per project and not on every refresh, so that it costs one small model call and gives the same count every time.
29. As a developer, I want the search to run in the background, so that it never interrupts my conversation.
30. As a developer, I want the pane to say that it is looking for tickets while the search runs, so that I know why progress isn't shown yet.
31. As a developer, I want the search to ignore dependency and build folders, so that it's fast and isn't fooled by vendored files.
32. As a developer, I want documentation, changelogs and specs not counted as tickets, so that the total is real.
33. As a developer, I want a project where no tickets are found remembered as such, so that the mod doesn't search it again every session.
34. As a developer, I want a search that failed because the model call failed not to be remembered as "no tickets", so that a network blip doesn't hide my tickets.
35. As a developer, I want nothing added to my project folder by the mod, so that nothing shows up in version control.

### Correcting a wrong guess

36. As a developer, I want a rescan command, so that I can make the mod look again after I reorganise a project.
37. As a developer, I want to give the rescan a hint in plain words, so that I can point it at the right folder or tell it which status word means done.
38. As a developer, I want the rescan to tell me what it found, so that I can confirm the fix without opening the pane.
39. As a developer, I want the rescan to suggest giving a hint when it finds nothing, so that I know what to try next.
40. As a developer, I want the mod to search again by itself when a saved recipe stops finding any tickets, so that moving my tickets doesn't leave the pane permanently empty.
41. As a developer, I want a second rescan refused while a search is running, so that two searches don't overwrite each other.

### Deciding when a ticket is done

42. As a developer, I want a ticket's status to decide whether it's done when the format has a status, so that ticked checkboxes on an unfinished ticket don't count it as done.
43. As a developer, I want a ticket with no status to be done when all its checkboxes are ticked, so that checkbox-only formats work.
44. As a developer, I want common finished words (done, closed, resolved and similar) recognised even when the search didn't see them, so that the first finished ticket in a new project is counted.
45. As a developer, I want a status word the mod doesn't recognise treated as not done, so that progress is never overstated.

### Controlling the pane

46. As a developer, I want a command that opens the pane, so that I can bring it up in a narrow terminal where it doesn't open by itself.
47. As a developer, I want the same command to close the pane, so that I can get the space back.
48. As a developer, I want the pane to open by itself in a wide terminal, so that I don't have to remember to open it.
49. As a developer, I want the pane to keep working after the mod's code is hot-reloaded, so that its contents aren't lost mid-session.

### Safety

50. As a developer, I want the model's search answer limited to a fixed set of fields, so that the mod never runs code a model wrote.
51. As a developer, I want a recipe that points outside the project refused, so that a bad answer can't make the mod read elsewhere on my machine.
52. As a developer, I want a failure inside the mod to be logged quietly and never block a tool call or a turn, so that the mod can't break my session.

## Implementation Decisions

### Shape of the mod

- The mod is a Claude Code plugin of function hooks: one hooks module, a type contract for the value the pane draws from, and a manifest.
- It has two modules. A **ticket-reading module** is pure: it turns text and file lists into recipes, tickets, ticket sets and progress, and touches nothing outside its arguments. A **hooks module** does everything that reaches the engine: commands, timers, file access, model calls, storage and drawing.
- The pane is scoped to the **project** the session runs in, identified by the session's project root. It shows no other project. A view across projects was considered and dropped: the mod's storage is per machine, so such a view would silently miss projects worked on from another machine or a VM.

### Recipe

- A recipe has fixed fields only; the model never supplies code or patterns that are executed as written. The shape, from the build:

  ```ts
  type Recipe =
    | { kind: 'none' }
    | { kind: 'checklist'; glob: string }
    | { kind: 'files'; glob: string; statusLabel: string | null;
        doneValues: string[]; activeValues: string[] }
  ```

- `glob` is relative to the project root, with a single star matching within one folder name and a double star matching across folders. A glob that is absolute, names a drive, or climbs out of the project is refused.
- `statusLabel` is the word before the colon on a ticket's status line. The line is matched leniently, so bold markers, list markers and front-matter style all work.
- A fixed list of finished words and in-progress words is merged into whatever the search returns.
- A layout that fits neither `files` nor `checklist` is `none`.
- The recipe is stored in the mod's own key-value store, keyed by project root. Nothing is written to the project.

### Search

- The search runs when a project has no stored recipe, when a stored recipe matches no files, or on a rescan.
- It sends a small model the project's file listing and the opening lines of a few files whose paths look ticket-related, plus the user's hint when given.
- The listing skips dependency, build and tool folders, is depth-limited and capped, and keeps only text-like files.
- An empty listing is recorded as `none` without calling the model.
- The model's answer is parsed into a recipe and then validated against the file system: a recipe that matches no files becomes `none`.
- A model call that failed stores nothing, so the search is retried later. Only an answered call is remembered.
- Only one search runs at a time. Refreshes that arrive during a search leave the pane as it is.

### Tickets, ticket sets and progress

- In a `files` recipe a ticket is one file; its **ticket set** is the folder holding it. In a `checklist` recipe a ticket is one checklist line; its ticket set is the file.
- A ticket's title is its first top-level heading, else a front-matter title, else its file name.
- **Done**: when the recipe has a status label and the file has that line, the status decides. Otherwise the ticket is done when it has at least one checkbox and all are ticked.
- In a checklist, a ticked box is done and a box holding an in-progress mark is in progress.
- The **active ticket set** is the one the session last read or edited, stored per project. If that set no longer exists or none was touched, it is the set whose files changed most recently.
- **Progress** is done out of total for the active ticket set, plus the next ticket: the first in-progress one, else the first not done.
- Tickets within a set are ordered by path with numeric ordering.
- Parsed files are cached by path and modification time, so a refresh re-reads only what changed.

### Summary

- At the end of a main-conversation turn that ended with an answer, the mod sends a small model the current summary and an account of the turn: the user's message, the tools used with their main argument, and the assistant's final answer, each truncated.
- The model answers either "no change" or a new summary. "No change" and any unparseable answer keep the stored summary.
- A turn with no answer text and no tool use is skipped without a model call.
- The summary is stored in the mod's own store, keyed by project root.
- Summarising runs after the turn's own result is returned, so it never delays the turn.

### Refreshing and drawing

- The pane draws from one state value holding the project name, whether a search is running, the summary and the progress. The state is written only when it differs from what is held, so an unchanged refresh causes no redraw.
- A refresh runs at session start, on a timer of about twenty seconds, after a turn ends, after a ticket file is read or edited by a file tool, and when either command runs.
- The pane opens unasked at session start, which the engine honours only in a wide terminal; the open command works at any width.
- The pane lists the active ticket set's tickets as a checklist, each with a glyph for done, in progress or open, under a header holding the project name, the count and a full-width progress bar. This replaced an earlier decision to show only the count and the next ticket. A list longer than the pane's height is cut to a window around the next ticket, with the number hidden above and below.
- The summary sits under the checklist, and what needs the user is shown last as a highlighted label.
- In the terminal the header holds a small pixel character drawn on a cell grid and repainted in place without redrawing the pane. It writes while a main-conversation turn runs, plays a short zap when a ticket becomes done, and stands still otherwise; a timer runs only while it is moving. Other surfaces show the header without it.
- A finished ticket and a new "needs you" each raise a brief toast, the one floating element a mod can draw; the first load and a search's result raise none.
- The mod is written to draw on any surface the engine offers, using only elements every surface has.

### Commands

- One command opens the pane, and closes it when given `close`.
- One command runs a rescan, taking everything after its name as the hint, and answers with the source and count found, or a suggestion to add a hint.

### Failure handling

- Background work is run detached with its errors sent to the debug log.
- The tool-call hook always returns the tool's own result first and does its bookkeeping afterwards, so it never refuses or alters a tool call.

## Testing Decisions

- A good test here drives the mod the way a session does and asserts on what the user would see: the text a command answers with and the text the pane draws. It doesn't assert on stored keys, internal function calls or the order of file reads.
- **Primary seam: the whole mod through the engine's plugin test kit.** The test stands beneath the mod and fakes the project root, the file listing, file contents, the model's replies, the store and the clock. It then runs commands, ends turns and mounts the pane. This one seam covers the search, recipe validation, progress, the summary being replaced, and the summary being kept when the model reports no change. The pane is mounted on more than one surface so the mod is shown not to depend on the terminal.
- **Secondary seam: the ticket-reading module called directly.** It is used only for format edge cases that are tedious to stage through the whole mod: glob matching, refused globs, status versus checkbox precedence, checklist marks, ticket set selection, next-ticket choice, and path handling for both Windows and POSIX spellings.
- New behaviour should be tested at the primary seam unless it is a parsing edge case.
- Fakes must accept paths as the host machine spells them. On Windows the engine hands file hooks a drive-letter, backslash path even when the mod asked with forward slashes.
- Prior art: the mod already has one test at each seam, and both follow the patterns above. Beyond the automated tests, the search was run once with the real model against four sample projects (Matt Pocock local layout with two feature folders, a single checklist, front-matter status files, and a project with no tickets); all four gave the expected source and count.
- Not covered by any automated test, and worth a manual pass: how the pane looks and wraps in a real terminal, whether the real model's judgement of "something moved" matches the user's, and the active ticket set following real file reads and edits in a live session.

## Out of Scope

- Any view of more than one project, on one machine or across machines.
- Tickets that are not local files: GitHub, GitLab, Linear, Jira and other hosted trackers.
- Showing blocked-by relationships or anything about a ticket beyond its title and whether it is done, in progress or open.
- Writing to tickets: claiming, closing or editing them from the pane.
- Ticket layouts that fit neither one-file-per-ticket nor a checklist. These are treated as no tickets.
- Reading Matt Pocock's wayfinder maps as anything other than ordinary ticket files.
- Running inside T3 Code or any front end that does not load Claude Code mods.
- Sharing the mod through a marketplace.
- User-configurable options, such as the refresh interval or which model is used.

## Further Notes

- The mod is already built and passing its tests; this spec records the agreed behaviour and decisions as built, so later changes have something to be judged against.
- Vocabulary follows the project glossary: project, summary, ticket, ticket set, active ticket set, recipe, search, rescan, done, progress.
- No ADR has been recorded. The two decisions most likely to be questioned later are the fixed-field recipe (chosen over model-written parsing code for safety and repeatable counts) and the single-project scope (chosen because per-machine storage makes a cross-project view misleading).
- The mod is loaded per session with the plugin-folder flag. Loading it in every session is a settings change that has not been made.
- The mod API is early access and may change between Claude Code releases; a break after an update is most likely an API change, and the engine's own validator and type declarations are the first things to check.
