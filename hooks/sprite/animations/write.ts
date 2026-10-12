import type { Animation, Dot } from '../types'

const row = (x: number, y: number, length: number, role: Dot[2]): Dot[] =>
  Array.from({ length }, (_, step) => [x + step, y, role] as const)

/** Writing on a sheet beside the paw: the head bobs and the paw moves every other frame while two lines of ink fill in. */
export const write: Animation = {
  frames: 6,
  msPerFrame: 220,
  once: false,
  frame: (step, { paw }) => {
    const paper = { x: paw.x + 1, y: paw.y - 1 }
    const lift = step % 2

    return {
      bob: lift,
      dots: [
        ...[0, 1, 2, 3, 4].flatMap(y => row(paper.x, paper.y + y, 5, 'paper')),
        ...row(paper.x + 1, paper.y + 1, Math.min(3, step + 1), 'ink'),
        ...row(paper.x + 1, paper.y + 3, Math.max(0, step - 2), 'ink'),
        [paw.x, paw.y + lift, 'base'],
        [paw.x + 1, paw.y + lift, 'outline'],
      ],
    }
  },
}
