import { defineAnimation } from '../compose'
import type { Dot, Point } from '../types'

const above = (point: Point, dx: number, dy: number, role: Dot[2]): Dot[] => [[point.x + dx, point.y - 1 + dy, role]]

/**
 * A cheer: the head hops twice while a spark leaps from each ear tip, climbs and settles back, a second spark trailing the one on the right.
 * The last frame draws nothing, so the cheer ends at rest. Everything it draws is on the rows above the ears, clear of what is worn, and it uses no paw, so it hides no slot.
 */
export const cheer = defineAnimation({
  needs: ['ears'],
  poses: [],
  frames: 10,
  msPerFrame: 130,
  once: true,
  hides: [],
  frame: (step, { ears }) => {
    const [first] = ears
    const last = ears.at(-1) ?? first
    // How far above the ear tips the leading spark is, and what it looks like; the right one has a trail one step behind.
    const climb = [0, -1, -2, -2, -1, -2, -2, -2, -1, 0]
    const lead = climb[step]
    const trail = climb[step - 1]
    const role = step % 2 === 0 ? 'spark' : 'flash'
    const dots: Dot[] =
      step >= climb.length - 1
        ? []
        : [...above(first, 0, lead ?? 0, role), ...above(last, 0, lead ?? 0, role), ...(trail === undefined ? [] : above(last, 1, trail, 'spark'))]

    // The last frame is the resting one, so the cheer ends where it began.
    return { bob: step < climb.length - 1 && (step % 4 === 1 || step % 4 === 2) ? 1 : 0, dots }
  },
})
