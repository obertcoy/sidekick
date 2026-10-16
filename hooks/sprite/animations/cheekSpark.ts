import { defineAnimation } from '../compose'
import type { Dot } from '../types'

/** A spark crackles on each cheek and fades. Dots on the cheek anchors only, so it needs no pose. No state plays it; ambient motion schedules it. */
export const cheekSpark = defineAnimation({
  needs: ['cheeks'],
  poses: [],
  frames: 5,
  msPerFrame: 80,
  once: true,
  hides: [],
  frame: (step, { cheeks }) => {
    const role = step === 2 ? 'flash' : 'spark'
    const dots: Dot[] = step >= 1 && step <= 3 ? cheeks.map(cheek => [cheek.x, cheek.y, role] as const) : []

    return { dots }
  },
})
