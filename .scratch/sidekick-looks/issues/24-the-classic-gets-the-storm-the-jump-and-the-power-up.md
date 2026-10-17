# 24: The classic gets the storm, the jump and the power-up

**What to build:** The classic's moveset gets the animations the owner chose from prototype C (`../../sidekick/prototypes.html#motion`, variant C):
- **Ticket done:** the sidekick charges and throws a streak into the sky; a leader comes down, a branching bolt strikes the ground ahead with a sky flash; sparks and rubble, a scorch with embers, smoke; a smaller aftershock bolt; a shockwave along the ground that it hops over; the check mark rises over the crater.
- **Set done:** a crouch, a big jump with a spin, a star burst at the top, confetti, a second hop.
- **Storm sky:** a cloud bank and distant bolts behind the hills, as the classic's background, flickering at rest as ambient motion.
- **Power-up:** charge, shaking with lifting pebbles, a bolt that strikes it, a gold body with glowing eyes and a flaming aura, power down. It goes into the library. Where it plays is not decided; until the owner decides, the classic plays it for a new moment, **last ticket started** (the last open ticket of the set becomes active), if the mod can detect that reliably. If it cannot, the power-up stays in the library unplayed and this box is reported.

**Blocked by:** 23: The classic animations move onto the new engine

**Status:** ready-for-agent

- [ ] The ticket-done bolt, set-done jump and storm sky play for the classic as in prototype C; the ticket strike stays in step with the new ticket-done
- [ ] The foxkit still plays its own animations or the plain defaults, never the classic's bolt
- [ ] With motion off, the storm sky holds still at rest and the power-up does not play
- [ ] While the pane is not shown none of it plays; once-only moments wait as ticket 13 says
- [ ] "Last ticket started" is a moment only if it comes from the ticket files' real state; the owner decides where the power-up finally goes
- [ ] By-eye check in the running app by the owner
