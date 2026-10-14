import type { Animation, Dot, Point, Role } from '../types'

// The bolt's zigzag, from its top (the boltFrom anchor) down to where it strikes.
const BOLT: readonly (readonly [number, number])[] = [
  [0, 0], [-1, 1], [0, 1], [-1, 2], [-2, 3], [-1, 3], [0, 3], [-1, 4], [-2, 5], [-1, 5], [-2, 6],
]
// The check mark, from the top-left of the paper spot.
const CHECK: readonly (readonly [number, number])[] = [[4, 0], [3, 1], [0, 2], [2, 2], [1, 3]]

const at = (point: Point | undefined, dx: number, dy: number, role: Role): Dot[] =>
  point === undefined ? [] : [[point.x + dx, point.y + dy, role]]

/** A ticket is done: the cheeks charge, a bolt strikes the raised paw, sparks fall, and a check mark stays. */
export const zap: Animation = {
  frames: 12,
  msPerFrame: 110,
  once: true,
  // The arm and the bolt are drawn at the paw, where a held accessory would be.
  hides: ['held'],
  frame: (step, { boltFrom, cheeks, ears, paw, reach, tail }) => {
    const paper = { x: paw.x + 1, y: paw.y - 1 }
    const bolt = (role: Role): Dot[] => BOLT.map(([dx, dy]) => [boltFrom.x + dx, boltFrom.y + dy, role] as const)
    const strike = { x: boltFrom.x - 2, y: boltFrom.y + 6 }
    const glow = (role: Role): Dot[] => cheeks.flatMap(cheek => at(cheek, 1, 0, role))
    const arm = (paw: Role): Dot[] => [...at(reach, 0, -1, 'outline'), ...at(reach, 0, 0, paw), ...at(reach, -1, 1, 'outline')]
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
        return { dots: [...bolt('flash'), ...glow('flash'), ...arm('base')] }
      case 3:
        return {
          dots: [
            ...bolt('spark'),
            ...at(strike, 1, 0, 'flash'),
            ...at(tail[0], 1, -1, 'spark'),
            ...glow('spark'),
            ...arm('base'),
            ...near(1, -1, 'spark'),
            ...near(3, 0, 'flash'),
            ...near(2, 2, 'spark'),
            ...near(4, 3, 'flash'),
          ],
        }
      case 4:
        return {
          dots: [...at(tail[0], 0, -1, 'spark'), ...arm('spark'), ...near(4, -2, 'spark'), ...near(4, 0, 'spark'), ...near(1, 3, 'spark')],
        }
      case 5:
        return { dots: [...near(1, 0, 'spark'), ...near(4, 4, 'spark')] }
      default:
        return { dots: CHECK.map(([dx, dy]) => [paper.x + dx, paper.y + dy, 'check'] as const) }
    }
  },
}
