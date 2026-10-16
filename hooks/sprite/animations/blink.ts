import { defineAnimation } from '../compose'

/** The eyes close for one frame between two open ones. No state plays it; ambient motion schedules it. */
export const blink = defineAnimation({
  needs: [],
  poses: ['blink'],
  frames: 3,
  msPerFrame: 90,
  once: true,
  hides: [],
  frame: step => (step === 1 ? { poses: ['blink'] } : {}),
})
