# 14: The type check is clean

**What to build:** The type check reports zero errors, so a new error shows up at once instead of hiding among old ones, and the `@ts-expect-error` fixtures (which only the type checker runs) guard what they claim. Today it reports eight errors that predate the sidekick-looks work and that every ticket has had to recount: the pane's ticket-set picker uses a `Select` element that the engine's element table does not declare, and a callback parameter of that picker is untyped; a test passes a possibly-undefined string where a string is required; two strike tests pass a mounted pane whose surface type does not match the helper's parameter; three ticket tests build ticket sets without the `place` field a ticket set now requires. Fix each at its cause, without loosening the type checker's settings and without `any` or blanket casts. No behaviour changes.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The type check reports zero errors
- [ ] The picker's element and its callback are typed from the engine's own declarations; if the engine truly lacks a declaration for the element, the gap is recorded and the narrowest local declaration is used
- [ ] Test fixtures are corrected to the real types (ticket sets carry a `place`; the strike helper accepts the mounted pane it is given; the possibly-undefined string is handled)
- [ ] No compiler setting is loosened, and no `any`, `@ts-ignore` or blanket cast is added
- [ ] All tests pass unchanged in meaning; the golden file is unchanged
- [ ] The README of this folder states the type check command and that it must stay at zero errors
