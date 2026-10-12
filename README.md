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

To load the local folder in every session, add it to the `env` block of your own `~/.claude/settings.json` (never a project's settings):

```json
"env": {
  "CLAUDE_CODE_PLUGIN_DIRS": "~/Work/sidekick"
}
```

Each new session loads the mod from that folder and reloads it when a file there is saved. To turn it off, remove that line and start a new session.

Then, from the mod's folder:

```
claude plugin validate .
claude plugin test .
```

### Sprite: characters, animations, outfits, backgrounds

The sidekick is drawn on a fixed stage of 18×8 cells (18×16 pixels, two stacked in each cell), in layers: background, body, outfit, then the animation's props and effects. Each part is one file in `hooks/sprite/` plus one line in `hooks/sprite/registry.ts`; `LOOK` there picks what the pane shows.

- **Character** (`characters/<name>.ts`): a pixel grid, a legend from letters to colour roles (`outline`, `base`, `shade`, `highlight`, `cheek`, `eye`, `belly`), a colour per role, anchors (`head`, `paw`, `reach`, `boltFrom`, `cheeks`, `tail`, `ears`, `feet`) and the `headRegion` that bobs. `defineCharacter` refuses one that is too big for the stage or misses an anchor.

  ```ts
  export const owl = defineCharacter({ name: 'owl', body: ['..oo..', '.oyyo.'], legend: { o: 'outline', y: 'base' },
    palette: { outline: 0x222222, base: 0x996633 }, anchors: { head: { x: 2, y: 0 }, /* paw, reach, … */ },
    headRegion: { left: 0, top: 0, right: 17, bottom: 6 } })
  // registry.ts: CHARACTERS = { foxkit, classic, owl }
  ```

- **Animation** (`animations/<name>.ts`): a frame count and a function from a step and the character's anchors to a head bob and dots coloured by role. It never reads the character's pixels, so it fits every character. Its key in `ANIMATIONS` is the mode name; `register.tsx` sets the frame timing.

  ```ts
  export const wave: Animation = { frames: 2, msPerFrame: 220, once: false,
    frame: (step, { paw }) => ({ dots: [[paw.x, paw.y - 1 - step, 'base']] }) }
  // registry.ts: ANIMATIONS = { idle, write, zap, wave }
  ```

- **Outfit** (`outfits/<name>.ts`): a small grid with its own colours and the `origin` pixel that sits on the `head` anchor; it bobs with the head. Wear it with `LOOK = { character: 'foxkit', outfit: 'cap', background: null }`.

  ```ts
  export const band: Outfit = { name: 'band', pixels: ['rrrrr'], origin: { x: 2, y: 0 }, palette: { r: 0xe5484d } }
  ```

- **Background** (`backgrounds/<name>.ts`): one or more full-stage grids, shown only where nothing is drawn above. Use it with `background: 'dusk'` in `LOOK`.

  ```ts
  export const floor: Background = { name: 'floor', frames: [[...Array(15).fill(''), 'gggggggggggggggggg']], palette: { g: 0x3a3340 } }
  ```

`tests/sprite.test.ts` pins every frame of the default look to `tests/sprite-golden.ts`; a change meant to alter the foxkit's pixels has to replace that file too.

Claude Code writes its type declarations into `.claude-plugin/types/` when it loads the mod; that folder is not committed, and `tsconfig.json` extends a file inside it.

The mod API is early access and may change between Claude Code releases.

## Notes

- Nothing is written to your project. Recipes and summaries live in the mod's own store on your machine.
- The search and the summary each use a small model through your Claude Code session.
- `GLOSSARY.md` defines the terms used in the code; `.scratch/sidekick/` holds the spec and open tickets.
