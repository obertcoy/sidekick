# sidekick

A Claude Code mod that shows where the current project stands in a pane beside the conversation, so you don't have to ask the chat for a recap.

- **Ticket checklist**: the tickets of the set you're working on, marked done, in progress or open, with a count and a progress bar.
- **Summary**: what happened, what's next, and what needs you. It changes only when a turn decides something or moves the work.
- **Any local ticket layout**: the first time the mod sees a project, a small model looks once for where the tickets are (one file per ticket, a checklist file, or files with a status field) and saves the answer. After that, plain code reads the tickets.
- **A pixel character** in the header that writes while Claude works and zaps when a ticket is finished.

Hosted trackers (GitHub, GitLab, Linear, Jira) are not read. The mod shows one project: the one the session runs in.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install sidekick --marketplace obertcoy/sidekick
```

Answer `y` to add the marketplace, then pick a scope.

## Use

| Command | What it does |
| --- | --- |
| `/sidekick` | Opens the pane. `/sidekick close` closes it. |
| `/sidekick-rescan [hint]` | Looks again for the project's tickets. The hint is plain words, such as `tickets are in docs/tasks`. |

The pane opens by itself in a wide terminal (144 columns or more). In a narrower one, use `/sidekick`.

## Develop

Load the mod from a local folder for one session:

```
claude --plugin-dir path/to/sidekick
```

Then, from the mod's folder:

```
claude plugin validate .
claude plugin test .
```

Claude Code writes its type declarations into `.claude-plugin/types/` when it loads the mod; that folder is not committed, and `tsconfig.json` extends a file inside it.

The mod API is early access and may change between Claude Code releases.

## Notes

- Nothing is written to your project. Recipes and summaries live in the mod's own store on your machine.
- The search and the summary each use a small model through your Claude Code session.
- `GLOSSARY.md` defines the terms used in the code; `.scratch/sidekick/` holds the spec and open tickets.
