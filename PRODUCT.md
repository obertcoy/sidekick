# Product

## Register

product

## Users

One developer working in Claude Code in a terminal, often across several projects in a day. They glance at the pane between turns or when returning to a project; they are in the middle of a coding task and are not there to read the pane.

## Product Purpose

Shows where the current project stands without asking the chat for a recap: the tickets in the set being worked on, with what is done, in progress and open, and a short summary of the session: its goal, the phase it is in and what needs the developer. Success is the developer no longer typing "tldr" after a chat.

## Brand Personality

Lively, legible, terse. It should be easy to spot and pleasant to look at, closer to OpenCode's task list than to a log. Colour and symbols carry meaning; sentences are kept short.

## Anti-references

- A plain wall of same-weight text, which is what the first version was.
- A log or debug panel. The note view is not one: it opens only when the developer asks for it and shows decisions, not a log.
- Decoration that carries no state: boxes around everything, banners, ASCII art. The sidekick's look is the one exception: it is the user's own pick and is not read as project state.

## Design Principles

- Glanceable first: the count and the next ticket are readable in under a second.
- State has a shape and a colour: done, in progress and open differ by glyph, never by colour alone.
- What needs the developer is the loudest thing on the pane.
- Follow the terminal: use the person's theme colours and the width and height the pane is given.
- Announce changes where they happen: a finished ticket or a new ask floats up briefly, then the pane holds the steady state.
- A small pixel sidekick gives the pane a face: the user picks its character, outfit and background. Every character is original, in the spirit of a monster-collecting game, not a copy of any existing sprite.

## Accessibility & Inclusion

- No state is shown by colour alone; every state has its own glyph or label.
- Colours come from the terminal theme's named roles, so light, dark and colour-blind themes are followed.
- State animations mark what happened: the sidekick writes while a turn runs, looks around while a search runs, zaps when a ticket is done and cheers when the whole set is. Between them it has small ambient motion of its own, a few seconds apart; one command turns that off, and then it stands still and nothing moves on its own.
- Long titles are cut with an ellipsis and never wrap the checklist out of shape.
