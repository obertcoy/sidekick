# 03: A project has its own parts

**What to build:** The developer can make one project's sidekick differ from the rest, so two open terminals are told apart at a glance. A leading `here` on the look command applies the named parts to the current project only, as an override of single parts: anything the project doesn't override still follows the global look, so a hat added globally also appears there. `part=none` sets a part explicitly empty, which in an override takes a global accessory off for that project. `here reset` removes the project's override; `reset` alone removes the global look. The no-argument listing marks which parts of the current look come from the project.

**Blocked by:** 02: Pick a global look with a command

**Status:** done

- [x] `here character=classic` changes the sidekick in this project and not in another project
- [x] A part the project doesn't override follows the global look, including a global change made afterwards, which shows at once in the current pane
- [x] `part=none` clears that part; it is refused for `character`
- [x] `here head=none` hides a global head accessory in this project only
- [x] `here reset` returns the project to the global look
- [x] `reset` returns the global look to the default and leaves project overrides alone
- [x] The no-argument listing marks the parts that come from the project's override
- [x] Overrides survive a fresh session start
- [x] Covered by whole-mod tests using two project roots
