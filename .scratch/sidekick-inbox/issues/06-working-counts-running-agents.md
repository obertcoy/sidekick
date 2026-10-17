# 06: Working counts running agents

**What to build:** The WORKING heading shows how many subagents are running now (`WORKING · 2 tickets · 3 agents`), counted from the mod API's subagent events, not from the model. With none running it shows only the tickets.

**Blocked by:** 02: The inbox replaces the Done/Next block

**Status:** done

- [x] The count rises when a subagent starts and falls when it ends, failed or not
- [x] With no subagents running the heading shows no agent count
- [x] A session restart does not leave a stale count
- [x] Covered by whole-mod tests that fire subagent start and end events

## As built (2026-10-17)

- The pure part is `workingHeading(tickets, agents)` in `hooks/inbox.ts`: `WORKING · 2 tickets · 3 agents`, each count left out while it is 0, singular for one.
- `hooks/register.tsx` holds the running subagents' ids in memory (`running`). An `agent.spawn` hook adds the `agentId` the engine answers once the subagent started; a `turn.complete` carrying an `agentId` takes it out whatever its `reason` (`answer`, `error`, `aborted`, `refusal`), since a subagent's run is one turn. Each change invalidates the pane. A refused spawn (no `agentId`) and a teammate (`isTeammate`, which idles between turns instead of ending) are not counted; nested subagents and workflow agents with a local id are.
- Stale counts: `session.start` clears the set, and a restart starts with none since it is never stored. As a safety net, each refresh with agents counted asks `$.agent.list()` and drops those it lists as `completed`, `failed` or `killed` (a turn end missed, a kill say); an agent the list no longer holds is kept, as it cannot be told from one not listed yet. A failed list call changes nothing.
- With subagents running and no ticket active the WORKING section is drawn with the agents alone (`WORKING · 1 agent`) rather than hidden; with neither it is not drawn, as before.
- Covered by `tests/inbox.test.ts` (the heading) and `tests/agents.test.ts` (whole mod: spawns and turn ends fired through the engine, the painted heading on both surfaces).
