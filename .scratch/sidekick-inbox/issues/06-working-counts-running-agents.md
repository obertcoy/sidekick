# 06: Working counts running agents

**What to build:** The WORKING heading shows how many subagents are running now (`WORKING · 2 tickets · 3 agents`), counted from the mod API's subagent events, not from the model. With none running it shows only the tickets.

**Blocked by:** 02: The inbox replaces the Done/Next block

**Status:** ready-for-agent

- [ ] The count rises when a subagent starts and falls when it ends, failed or not
- [ ] With no subagents running the heading shows no agent count
- [ ] A session restart does not leave a stale count
- [ ] Covered by whole-mod tests that fire subagent start and end events
