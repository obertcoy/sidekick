import { defineAnimation } from '../compose'
import type { Dot, Point, Role } from '../types'

// The bolt's zigzag, from its top (the boltFrom anchor) down to where it strikes.
const BOLT: readonly (readonly [number, number])[] = [
  [0, 0],
  [-1, 1],
  [0, 1],
  [-1, 2],
  [-2, 3],
  [-1, 3],
  [0, 3],
  [-1, 4],
  [-2, 5],
  [-1, 5],
  [-2, 6],
]
// The check mark, from the top-left of the paper spot.
const CHECK: readonly (readonly [number, number])[] = [
  [4, 0],
  [3, 1],
  [0, 2],
  [2, 2],
  [1, 3],
]

// A point that may be missing: only the second tail tip, since a tail may have a single tip.
const at = (point: Point | undefined, dx: number, dy: number, role: Role): Dot[] => (point === undefined ? [] : [[point.x + dx, point.y + dy, role]])

/** A ticket is done: the cheeks charge, a bolt strikes the raised paw, sparks fall, and a check mark stays. */
export const zap = defineAnimation({
  needs: ['boltFrom', 'cheeks', 'ears', 'paw', 'reach', 'tail'],
  // The raised arm is the character's own pose; the glowing paw in the last frame is a dot at `reach`.
  poses: ['armUp'],
  frames: 12,
  msPerFrame: 110,
  once: true,
  // The bolt is drawn at the paw, where a held accessory would be; the raised arm is the armUp pose.
  hides: ['held'],
  frame: (step, { boltFrom, cheeks, ears, paw, reach, tail }) => {
    const paper = { x: paw.x + 1, y: paw.y - 1 }
    const bolt = (role: Role): Dot[] => BOLT.map(([dx, dy]) => [boltFrom.x + dx, boltFrom.y + dy, role] as const)
    const strike = { x: boltFrom.x - 2, y: boltFrom.y + 6 }
    const glow = (role: Role): Dot[] => cheeks.flatMap(cheek => at(cheek, 1, 0, role))
    // The raised arm is part of the body, so a dot would draw over it. Where a glow lands on the paw (the classic's right cheek), the arm stays on top, as it always was.
    const glowBesideArm = (role: Role): Dot[] => glow(role).filter(([x, y]) => x !== reach.x || y !== reach.y)
    const near = (dx: number, dy: number, role: Role): Dot[] => at(paper, dx, dy, role)

    switch (step) {
      case 0:
        return { dots: [...at(tail[0], 0, 0, 'spark'), ...at(tail[1], 0, 0, 'spark'), ...glow('spark')] }
      case 1:
        return {
          dots: [
            ...at(ears[0], 0, 0, 'flash'),
            ...at(boltFrom, -2, 3, 'spark'),
            ...at(tail[0], 0, 0, 'spark'),
            ...at(tail[1], 0, 0, 'flash'),
            ...glow('flash'),
          ],
        }
      case 2:
        return { poses: ['armUp'], dots: [...bolt('flash'), ...glowBesideArm('flash')] }
      case 3:
        return {
          poses: ['armUp'],
          dots: [
            ...bolt('spark'),
            ...at(strike, 1, 0, 'flash'),
            ...at(tail[0], 1, -1, 'spark'),
            ...glowBesideArm('spark'),
            ...near(1, -1, 'spark'),
            ...near(3, 0, 'flash'),
            ...near(2, 2, 'spark'),
            ...near(4, 3, 'flash'),
          ],
        }
      case 4:
        return {
          poses: ['armUp'],
          dots: [...at(tail[0], 0, -1, 'spark'), ...at(reach, 0, 0, 'spark'), ...near(4, -2, 'spark'), ...near(4, 0, 'spark'), ...near(1, 3, 'spark')],
        }
      case 5:
        return { dots: [...near(1, 0, 'spark'), ...near(4, 4, 'spark')] }
      default:
        return { dots: CHECK.map(([dx, dy]) => [paper.x + dx, paper.y + dy, 'check'] as const) }
    }
  },
})
