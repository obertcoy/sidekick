import type { Animation, Dot, Point } from '../types'

const above = (point: Point | undefined, dx: number, role: Dot[2]): Dot[] =>
  point === undefined ? [] : [[point.x + dx, point.y - 1, role]]

/** Looking around: the head dips and lifts while a glint passes from one ear tip to the other and back. Everything it draws is on the row above the ears, clear of what is worn. */
export const look: Animation = {
  frames: 6,
  msPerFrame: 220,
  once: false,
  hides: [],
  frame: (step, { ears }) => {
    const first = ears[0]
    const last = ears[ears.length - 1]
    // Left ear, rising and falling, then right ear, then back.
    const glints = [above(first, 0, 'spark'), [], above(last, 0, 'spark'), above(last, 0, 'flash'), [], above(first, 0, 'flash')]

    return { bob: step % 3 === 1 ? 1 : 0, dots: glints[step] ?? [] }
  },
}
