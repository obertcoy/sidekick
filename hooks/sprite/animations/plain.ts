import { defineAnimation } from '../compose'

// The plain defaults: what plays for a moment when a character's moveset leaves it out. Each one needs no anchor beyond the head and feet
// and no pose, so any character can play it (a knight is never handed the bolt). They only move the head, which draws nothing a character
// or its outfit could clash with. The registry names which one is for which moment (`PLAIN`) and checks that at load.

/** Working, plainly: the head nods up and down. */
export const nod = defineAnimation({ needs: [], poses: [], frames: 4, msPerFrame: 220, once: false, hides: [], frame: step => ({ bob: step % 2 }) })

/** Searching, plainly: the head dips and lifts, as if glancing about. */
export const dip = defineAnimation({
  needs: [],
  poses: [],
  frames: 6,
  msPerFrame: 220,
  once: false,
  hides: [],
  frame: step => ({ bob: step % 3 === 1 ? 1 : 0 }),
})

/** A failed search, plainly: the head sinks, stays down and comes back. */
export const sink = defineAnimation({
  needs: [],
  poses: [],
  frames: 8,
  msPerFrame: 150,
  once: true,
  hides: [],
  frame: step => ({ bob: step >= 1 && step <= 6 ? 1 : 0 }),
})

/** A finished ticket, plainly: the head hops three times. It has at least `MIN_STRIKE_FRAMES` frames, so the ticket strike can keep in step with it. */
export const hop = defineAnimation({
  needs: [],
  poses: [],
  frames: 8,
  msPerFrame: 110,
  once: true,
  hides: [],
  frame: step => ({ bob: step >= 1 && step <= 6 && step % 2 === 1 ? 1 : 0 }),
})

/** A finished set, plainly: the head bounces twice and ends at rest. */
export const bounce = defineAnimation({
  needs: [],
  poses: [],
  frames: 10,
  msPerFrame: 130,
  once: true,
  hides: [],
  frame: step => ({ bob: step < 9 && (step % 4 === 1 || step % 4 === 2) ? 1 : 0 }),
})
