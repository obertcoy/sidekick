# Sidekick: decision inbox and work animations

Status: exploration notes, not an approved implementation spec.

## Why these ideas matter

Large projects can have 25 or more tickets, with several agents working in parallel. The developer cannot keep every ticket's original purpose, technical details and discoveries in their head. When work returns, they often need to ask what the ticket was about and what happened along the way.

The current Done/Next summary does not provide enough continuity. Important context can disappear behind the latest update.

Sidekick should help the developer regain context and see what deserves attention. It is not responsible for redesigning the planning interview or ensuring the developer fully understands every technical choice upfront.

## 1. Before approval: explain the decision

Instead of only asking “approve this implementation?”, connect the question to the problem and its consequences.

> **Ticket 08 · Payment retries**
>
> **Decision:** reuse the original payment ID.
>
> **Why:** prevents retries creating duplicate charges.
>
> **Trade-off:** timed-out payments may stay pending longer.
>
> **Affects:** tickets 12 and 17.

This is a candidate presentation for a decision that already needs the developer, not a new requirement to approve every implementation detail.

## 2. After approval: keep a decision receipt

Keep a persistent, plain-language record rather than making the developer reconstruct their answers from the conversation.

> **You approved:** reuse payment IDs.
>
> **Implementation:** running.
>
> **Verification:** not yet done.

Approval, implementation and verification must be represented separately. Approving a choice does not mean it has been implemented; implementation does not mean the result has been verified.

Receipts should distinguish what is known from what has not been checked. They should not infer verification from an agent finishing or reporting “done”.

### Evidence, not a verdict (developer's choice, 2026-10-17)

Sidekick never labels anything “verified”. Next to what the agent says, it shows only evidence it can check itself, and the developer judges:

```text
✓ 12 Checkout validation
  agent says done · 7/7 · tests passed
◐ 14 Order emails
  agent says done · 3/6 ticked
⚠ 11 Tax rounding
  agent says done · 4/4 · tests failed
```

- Ticked boxes in the ticket file (`7/7`) come first: the easiest and most useful evidence.
- The last test run in the session (passed, failed, or not run since the last change) comes next.
- Within a group, the most worrying items come first (`⚠`, then `◐`, then `✓`).
- An item leaves the inbox only when the developer marks it reviewed; opening it is not enough.

Inbox lines must fit the pane: the summary asks for a short question or line plus a full explanation for the detail view, and the code truncates the short line with `…` as a last resort.

## 3. When agents return: reconnect results to the goal

Do not show disconnected completion reports without the reason the work existed.

```text
GOAL: prevent duplicate charges

3 agents returned
✓ Retry handling implemented and tested
! Migration needs your decision
! Timeout behavior still unverified

YOUR RECENT DECISIONS
• Reuse payment IDs — implemented
• Keep existing pending payments — awaiting verification
```

For each returned result, make it possible to recover:

- What was this ticket trying to solve?
- What did the agent encounter or discover?
- What changed, and what was actually verified?
- What remains unresolved or needs the developer?

## Inbox as a possible interface

Keep the ticket list for overall progress. Explore replacing the Done/Next summary with an inbox organized around **Needs you** and **Ready to review**.

Example items:

```text
? Ticket 08 needs a decision
  Found a case the original plan did not cover.

✓ Ticket 12 ready to review
  What changed, why, and what was verified.

! Ticket 15 changed direction
  The planned approach did not work; here is what replaced it.
```

Items would stay unread until reviewed, rather than being overwritten when another agent finishes. Reading an item would not itself approve a decision or verify an implementation.

This should be a context-and-attention surface, not a tool-call log.

### Compact overview, details on demand

Do not put every decision field or full ticket description into the overview. Use three layers:

1. **Ticket list:** a compact title and state for overall progress.
2. **Inbox:** a short reason an item needs attention or is ready to review.
3. **Item detail:** open one item to recover its goal, findings, relevant decision or trade-off, and verification status.

Example overview:

```text
NEEDS YOU · 1
▸ 08 Payment retries
  Keep timed-out payments pending?

READY TO REVIEW · 2
▸ 12 Checkout validation
  Finished; edge cases tested.
```

Only show fields such as trade-offs, affected tickets and approval receipts when they are relevant. Keep longer technical detail in the ticket file; the pane is an index into that context, not a replacement for it.

### Opening an item inside the pane

Activating an inbox row would temporarily replace the overview with that item's detail view. A **Back** control returns to the overview without losing its place.

This expands the content within the pane's existing width; it does not mean physically widening the pane.

Sidekick already uses buttons for its ticket-set picker. Explore using the same interaction pattern for inbox rows and Back:

- Allow mouse activation where the terminal and Claude Code UI support it. The developer confirmed (2026-10-17) that clicking the ticket-set picker's buttons works in their terminal.
- Provide keyboard selection and activation so the workflow does not depend on mouse support.
- Make the selected item and the route back clear.
- Keep unread/review state distinct from approval and verification; merely opening details grants neither.

## Animation idea: summon helpers for subagents

### Starting point

The developer suggested a shadow-clone-style entrance: a puff of ninja smoke, then a helper appears and goes to work.

The animation should make delegation recognizable. It does not need to copy an existing character or franchise's artwork.

### Possible summon styles

- **Smoke clone:** smoke appears and a miniature companion emerges.
- **Portal:** a small doorway opens and a helper steps out with its tool.
- **Familiar:** the character sends a raven, spirit or small forest creature.
- **Detached shadow:** the character's shadow peels away and becomes a helper.

A suggested direction is one understandable summon lifecycle, with character-specific effects:

| Character | Possible summon effect |
| --- | --- |
| Horned Wanderer | Smoke gathers into a spirit double |
| Raven Swordsman | A burst of feathers releases a raven helper |
| Forest Guardian | Leaves gather into a sapling helper |

These mappings are ideas, not final choices.

### Helper lifecycle

```text
summoned → working → returns with a result → disappears
```

When several subagents start together, consider a grouped summon rather than repeatedly interrupting the pane. Keep helpers small and working motion subtle.

Returning with a result does not automatically mean success or verified work. How helpers indicate failure, uncertainty or a blocked task is still undecided.

## Animation idea: tickets as enemies or obstacles

The developer suggested a common enemy that the character attacks while working, or chopping down a tree.

Two possible directions:

- **Enemy:** attack during work, block when stuck, defeat the enemy when the ticket finishes.
- **Obstacle:** chop a tree, chip a boulder or cut through vines, with a distinct completion animation.

Obstacles were recommended as a calmer representation of sustained work. No final direction has been chosen.

Possible character-specific obstacles:

| Character | Possible work animation |
| --- | --- |
| Forest Guardian | Chop a massive tree |
| Horned Wanderer | Chip apart a rune-covered boulder |
| Raven Swordsman | Cut through tangled thorn vines |

Subagent helpers could work on the same obstacle from the other side. A returning helper could deliver a stronger hit when its contribution is successfully completed, rather than for every return regardless of outcome.

### Do not invent progress

- Elapsed time is not evidence of ticket progress.
- Small repeated strikes can mean “working”, without gradually destroying the obstacle on a timer.
- Reserve the tree falling or rock shattering for a confirmed ticket-completion event.
- Keep implementation completion distinct from verification and developer review, consistent with the inbox.

## Open choices

- Should every character work on one shared obstacle, or have a character-specific one?
- Should all helpers share the parent ticket's obstacle, or represent separate subtasks?
- How should blocked, failed and unverified results look without suggesting success?
- What should be visible when many subagents run at once?
- How should inbox items and receipts be stored, grouped, reviewed and reopened?
- Which events and evidence can reliably establish approval, implementation and verification?
- How should the new effects interact with the existing motion setting, pane visibility and reduced-motion preferences?

Nothing in these notes authorizes implementation or changes the installed plugin's behavior.
