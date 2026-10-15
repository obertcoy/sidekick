# 15: Lint and format with Biome

**What to build:** The repo has one linter and formatter, Biome, so style is settled by a tool and not by review. One `biome.json` at the root, run without adding a `package.json` or `node_modules` (through `npx` with an exact Biome version), so the mod still ships as plain files. The formatter is configured to match the code's current style as closely as Biome allows (two-space indent, single quotes, no semicolons, the current line width), so the one-time reformat is small. Generated or foreign files are excluded: the engine's types under `.claude-plugin/types`, and Markdown under `.scratch`. The lint rules start from Biome's recommended set; each rule the code breaks is either fixed in code or switched off with a one-line reason in the config. No behaviour changes.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `biome.json` exists with an exact Biome version and the formatter set to the code's current style
- [ ] The check command runs with no `package.json` and no `node_modules` in the repo, and is written in the README (and in this folder's README beside the type check command)
- [ ] The engine's types and the `.scratch` Markdown are excluded from the check
- [ ] The one-time reformat lands in its own commit, apart from lint fixes, so formatting noise stays out of later diffs
- [ ] Every lint rule the code breaks is fixed in code or switched off with a reason; the check passes with zero errors and zero warnings
- [ ] No behaviour change: all tests pass unchanged in meaning, the golden file is unchanged, and the type check has no new errors
