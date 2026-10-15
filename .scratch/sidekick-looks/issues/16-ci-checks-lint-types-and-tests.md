# 16: CI checks lint and tests; a pre-commit hook checks lint and types

**What to build:** Every push to `main` and every pull request runs Biome's check and the mod's test suite on GitHub Actions, so a change that breaks style or behaviour shows red before anyone reads it. The type check runs in a pre-commit hook instead, because only a developer's machine has the generated mod API types it needs. The commands are the same ones a developer runs locally. The repo still has no `package.json` or `node_modules`: tools run through `npx` at exact versions, and the type check uses a pinned TypeScript instead of a copy borrowed from a developer's machine. Before the workflow is written, it is confirmed that the test suite runs in a clean environment without a login or API key; if it cannot, the owner decides (a repo secret, or tests left out of CI) before anything is added. Locally, a pre-commit hook runs Biome on the staged files and the pinned type check, and blocks a commit that fails either.

**Blocked by:** 14: The type check is clean; 15: Lint and format with Biome

**Status:** ready-for-agent

- [ ] It is confirmed, and written down, whether `claude plugin test .` runs with no credentials and a clean home folder
- [ ] One workflow runs on pushes to `main` and on pull requests
- [ ] CI runs Biome's check and the test suite, each at a pinned version, with no `package.json` added. The type check is not in CI: the mod API's types (`.claude-plugin/types`) are written only by a logged-in Claude Code session and are gitignored, so a fresh clone cannot type-check (owner's decision, option 3; move to committing the types if a type error ever slips through)
- [ ] The local commands in this folder's README and the CI commands are the same, and the type check command no longer depends on `~/.pi-lens`
- [ ] The first run on GitHub is green; a deliberate lint error or failing test on a throwaway branch turns it red (then the branch is deleted)
- [ ] No secret is added without the owner's OK
- [ ] A git pre-commit hook, committed in the repo (e.g. `.githooks/pre-commit`, enabled once per clone with `git config core.hooksPath .githooks`, no Husky or npm), runs Biome on the staged files and the pinned type check, and blocks the commit when either fails; it takes a few seconds
- [ ] The hook is enabled in this clone, a commit with a lint error and a commit with a type error are each refused by it, and the enable command is written in the README and in this folder's README
