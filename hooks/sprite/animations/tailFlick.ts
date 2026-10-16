import { defineAnimation } from '../compose'

/** The tail twitches up twice and settles. It is the character's own `tailUp` pose, so it needs the tail anchor. No state plays it; ambient motion schedules it. */
export const tailFlick = defineAnimation({
  needs: ['tail'],
  poses: ['tailUp'],
  frames: 5,
  msPerFrame: 100,
  once: true,
  hides: [],
  frame: step => (step % 2 === 1 ? { poses: ['tailUp'] } : {}),
})
