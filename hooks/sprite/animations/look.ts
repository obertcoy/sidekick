import { defineAnimation } from '../compose'
import type { Dot, Point } from '../types'

const above = (point: Point, dx: number, role: Dot[2]): Dot[] => [[point.x + dx, point.y - 1, role]]

/** Looking around: the head dips and lifts while a glint passes from one ear tip to the other and back. Everything it draws is on the row above the ears, clear of what is worn. */
export const look = defineAnimation({
  needs: ['ears'],
  frames: 6,
  msPerFrame: 220,
  once: false,
  hides: [],
  frame: (step, { ears }) => {
    const [first] = ears
    const last = ears.at(-1) ?? first
    // Left ear, rising and falling, then right ear, then back.
    const glints = [above(first, 0, 'spark'), [], above(last, 0, 'spark'), above(last, 0, 'flash'), [], above(first, 0, 'flash')]

    return { bob: step % 3 === 1 ? 1 : 0, dots: glints[step] ?? [] }
  },
})
