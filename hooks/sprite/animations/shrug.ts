import { defineAnimation } from '../compose'
import type { Dot, Point } from '../types'

const above = (point: Point, dx: number, dy: number, role: Dot[2]): Dot[] => [[point.x + dx, point.y - 1 + dy, role]]

/** A shrug: the head sinks, stays down while a drop of sweat forms and falls beside the right ear, then comes back. The drop stays on the rows above the ears, clear of what is worn. */
export const shrug = defineAnimation({
  needs: ['ears'],
  poses: [],
  frames: 8,
  msPerFrame: 150,
  once: true,
  hides: [],
  frame: (step, { ears }) => {
    const ear = ears.at(-1) ?? ears[0]
    const drops: Dot[][] = [[], [], above(ear, 1, -1, 'spark'), above(ear, 1, -1, 'spark'), above(ear, 1, 0, 'spark'), above(ear, 1, 0, 'flash'), [], []]

    return { bob: step >= 1 && step <= 6 ? 1 : 0, dots: drops[step] ?? [] }
  },
})
