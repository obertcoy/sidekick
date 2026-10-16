import { defineAnimation } from '../compose'

/** The ear tips lift for two frames and drop. It is the character's own `earsUp` pose, so it needs the ear anchors. No state plays it; ambient motion schedules it. */
export const earFlick = defineAnimation({
  needs: ['ears'],
  poses: ['earsUp'],
  frames: 4,
  msPerFrame: 90,
  once: true,
  hides: [],
  frame: step => (step === 1 || step === 2 ? { poses: ['earsUp'] } : {}),
})
