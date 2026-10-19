import { defineAnimation } from '../compose'
import { burst, confetti, smoke } from '../effects'

// The plain defaults: what plays for a moment when a character's moveset leaves it out. Each one needs no anchor beyond the head and feet
// and no pose, so any character can play it (a knight is never handed the bolt). They move the head and, for the moments that happen once, draw an effect
// from the head or the stage edges alone, so nothing clashes with a character or its outfit. The registry names which one is for which moment (`PLAIN`) and checks that at load.

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

/** A failed search, plainly: the head sinks, stays down and comes back, and a puff of grey rises over it. */
export const sink = defineAnimation({
  needs: [],
  poses: [],
  frames: 8,
  msPerFrame: 150,
  once: true,
  hides: [],
  frame: (step, { head }) => ({
    bob: step >= 1 && step <= 6 ? 1 : 0,
    dots: smoke({ seed: 9, at: { x: head.x, y: head.y - 1 }, frame: step - 1, count: 3, life: 6 }),
  }),
})

/**
 * A finished ticket, plainly: the head hops three times and dust is kicked up at the feet. It has at least `MIN_STRIKE_FRAMES` frames, so the ticket strike can keep in step with it.
 * The dust is settled before the last frame.
 */
export const hop = defineAnimation({
  needs: [],
  poses: [],
  frames: 8,
  msPerFrame: 110,
  once: true,
  hides: [],
  frame: (step, { feet }, edges) => ({
    bob: step >= 1 && step <= 6 && step % 2 === 1 ? 1 : 0,
    dots: burst({
      seed: 4,
      at: feet,
      frame: step - 1,
      floor: edges.ground - 1,
      count: 8,
      speed: 0.6,
      spread: 2.2,
      gravity: 0.2,
      life: 4,
      colors: ['dust', 'smokeDim', 'dust'],
    }),
  }),
})

/** A finished set, plainly: the head bounces twice and ends at rest while confetti falls over the stage. */
export const bounce = defineAnimation({
  needs: [],
  poses: [],
  frames: 10,
  msPerFrame: 130,
  once: true,
  hides: [],
  frame: (step, _at, edges) => ({
    bob: step < 9 && (step % 4 === 1 || step % 4 === 2) ? 1 : 0,
    dots: confetti({ seed: 12, frame: step - 1, edges, count: 16, fall: 2 }),
  }),
})
