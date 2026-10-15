# 16: CI checks lint, types and tests

**What to build:** Every push to `main` and every pull request runs the three checks on GitHub Actions, so a change that breaks style, types or behaviour shows red before anyone reads it. The checks are the same commands a developer runs locally: Biome's check, the type check, and the mod's test suite. The repo still has no `package.json` or `node_modules`: tools run through `npx` at exact versions, and the type check uses a pinned TypeScript instead of a copy borrowed from a developer's machine. Before the workflow is written, it is confirmed that the test suite runs in a clean environment without a login or API key; if it cannot, the owner decides (a repo secret, or tests left out of CI) before anything is added. Locally, a fast pre-commit hook runs Biome on the staged files and blocks a commit that fails it; CI stays the full gate, because a hook can be skipped and must stay fast.

**Blocked by:** 14: The type check is clean; 15: Lint and format with Biome

**Status:** ready-for-agent

- [ ] It is confirmed, and written down, whether `claude plugin test .` runs with no credentials and a clean home folder
- [ ] One workflow runs on pushes to `main` and on pull requests
- [ ] It runs Biome's check, the type check and the test suite, each at a pinned version, with no `package.json` added
- [ ] The local commands in this folder's README and the CI commands are the same, and the type check command no longer depends on `~/.pi-lens`
- [ ] The first run on GitHub is green; a deliberate type error, lint error or failing test on a throwaway branch turns it red (then the branch is deleted)
- [ ] No secret is added without the owner's OK
- [ ] A git pre-commit hook, committed in the repo (e.g. `.githooks/pre-commit`, enabled once per clone with `git config core.hooksPath .githooks`, no Husky or npm), runs Biome on the staged files and blocks the commit when it fails; it takes about a second
- [ ] The hook is enabled in this clone, a commit with a lint error is refused by it, and the enable command is written in the README and in this folder's README
