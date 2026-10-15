# 08b: Refactor — parts declare what they need, one lookup for what plays

**What to build:** A prefactor with no visible change, done before 09 so that 09, 10 and 11 become small data changes. Source: the architecture review of 2026-10-15 (`$TMPDIR/architecture-review-20261015-132604.html`), candidates 1–4 (all rated Strong), plus single-source constants.

1. **Animations declare the anchors they need.** Each animation lists the anchors it reads. A character gives only `head` and `feet` for sure; every other anchor is optional. Where characters and animations meet (the registry), a character whose animations need an anchor it lacks is refused at load. The `point === undefined ? [] : …` guards in the animation files go away where the declaration makes them unreachable.
2. **One lookup answers "what plays for this state".** The state → animation lookup lives in one place and is used by the activity (timing) and the pane (pixels), so the two cannot disagree. The activity is given the lookup instead of importing the registry. The pane paints from the resolved animation, not from a name. `hooks/sprite.ts` no longer uses the word "mode"; keep it only if it still earns its place (deletion test). Per-character replacement is NOT built here (that is 11), but the lookup takes the character so 11 only adds data.
3. **The ticket strike is paced in steps of the ticket-done animation.** The entry hold is counted in steps, not ms. `msPerFrame('zap')` and the zap frame numbers hard-coded in `register.tsx` go; the strike follows the frame count and pace of whatever animation plays for the ticket-done state. `STRIKE_STEPS` stays single-source.
4. **The background keeps its own frame.** Composing a picture takes the background frame separately from the animation frame; by default it steps with the animation, so every frame drawn today is pixel-identical. (Cycling at rest is ticket 10; this only opens the seam.)
5. **Closed sets are single-source `as const` constants with derived types** (no TS `enum`): slots in draw order, anchor names, conditions, look parts (`'character' | Slot | 'background'`), body roles. The default character comes from `DEFAULT_LOOK.character`, not a second `foxkit` import.

6. **Split the part catalog from the look in use.** `registry.ts` keeps only the catalog (characters, accessories, backgrounds, animations, states). The saved look, the project override, the current root and the "left out" bookkeeping move to their own module. Drawing does not write state; "what was left out" is computed once per render, not as a side effect of drawing.
7. **One "can this be drawn" rule.** The slot check used by the look command (`look.ts`) and by the resolver (`registry.ts`) is one function with one message.
8. **The activity is an explicit state machine.** The flags `playing` / `isHolding` become one `phase` value whose type is a discriminated union over an `as const` list of phase kinds (`resting`, `playing`, `holding`), so an invalid mix such as holding with nothing playing cannot be expressed. Every transition goes through one place, and each switch over the phase is exhaustive (a `never` check), so 09 (ambient) and 13 (paused) add a phase kind and the compiler points at every place to handle it. The interface (`set / has / queue / repaint / shown`) and the behaviour stay the same.

**Blocked by:** 08: The sidekick cheers when the set is done

**Status:** done

- [x] Every frame of every character, accessory, background and animation is pixel-identical to before (golden file unchanged, all existing tests pass with their assertions unchanged in meaning)
- [x] Each animation declares the anchors it needs; a character missing a needed anchor is refused at load, with a test (pure level)
- [x] A character may omit anchors no animation it plays needs, with a test (pure level)
- [x] The state → animation lookup exists once; the activity and the pane both use it
- [x] The strike length and pace come from the ticket-done animation; no `'zap'` literal or zap frame number remains in `register.tsx`
- [x] The background frame is a separate input to composing a picture
- [x] Slots, anchor names, conditions, look parts and body roles each have one `as const` source; no duplicate list remains in hooks or tests
- [x] The catalog and the look in use are separate modules; drawing has no side effect
- [x] One slot rule and one message serve both the look command and the resolver
- [x] The activity holds one discriminated `phase` with exhaustive handling; no `playing`/`isHolding` flags remain; all activity, strike and look tests pass unchanged in meaning
- [x] No new type errors
