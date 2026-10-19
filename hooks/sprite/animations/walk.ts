import { defineAnimation } from '../compose'
import type { Dot } from '../types'

/** The legs by step: a contact step with one foot out, the legs passing under the body, the other foot out, passing again. */
const LEGS = ['walkA', 'walkPass', 'walkB', 'walkPass'] as const

/**
 * A step of the walk cycle: the legs follow `LEGS` and the body rises a pixel on each passing step. The activity moves the sidekick one pixel per step; this only draws it.
 * On a contact step a puff of dust is kicked up from the ground layer behind the feet (behind being the side it came from).
 * A character walks when it has the three leg poses; one that has none does not.
 */
export const walk = defineAnimation({
  needs: [],
  poses: ['walkA', 'walkB', 'walkPass'],
  frames: 4,
  msPerFrame: 100,
  once: false,
  hides: [],
  frame: (step, { feet }, _edges, facing = 'right') => {
    const leg = LEGS[step % LEGS.length] ?? 'walkPass'
    const back = facing === 'right' ? -1 : 1
    const dust: Dot[] =
      leg === 'walkPass'
        ? []
        : [
            [feet.x + back * 3, feet.y, 'dust'],
            [feet.x + back * 4, feet.y - 1, 'smokeDim'],
          ]

    return { poses: [leg], dy: leg === 'walkPass' ? -1 : 0, layers: { ground: dust } }
  },
})
