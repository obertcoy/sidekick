import { defineAnimation } from '../compose'
import { burst, ridingBob } from '../effects'
import type { Dot, Point } from '../types'

// What the sparks thrown from the ear tips are made of: bright, not cooling to embers.
// The row just above a point.
const above = (point: Point): Point => ({ x: point.x, y: point.y - 1 })

const SPARKS = ['spark', 'flash'] as const

/**
 * A cheer: the head hops twice while sparks leap from each ear tip, climb in a loose fan and fade. The last frame draws nothing, so the cheer ends at rest.
 * The sparks are thrown from the row above the ear tips in a narrow fan, so they stay clear of what is worn on the head and rise slowly, well inside the headroom of any stage; the cheer uses no paw, so it hides no slot.
 */
export const cheer = defineAnimation({
  needs: ['ears'],
  poses: [],
  frames: 10,
  msPerFrame: 130,
  once: true,
  hides: [],
  frame: (step, { ears }, edges, _facing, headRegion) => {
    const bob = step < 9 && (step % 4 === 1 || step % 4 === 2) ? 1 : 0
    const dots: Dot[] = ears.flatMap((ear, which) =>
      burst({
        seed: 21 + which,
        // An ear inside the bob region moves down with the head, and its sparks start from where it is drawn.
        at: above(ridingBob(ear, bob, headRegion)),
        frame: step,
        floor: edges.ground - 1,
        count: 5,
        speed: 0.3,
        spread: 0.3,
        gravity: 0.05,
        life: 7,
        colors: SPARKS,
      }),
    )

    // The last frame is the resting one, so the cheer ends where it began.
    return { bob, dots }
  },
})
