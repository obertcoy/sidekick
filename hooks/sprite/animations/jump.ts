import { defineAnimation } from '../compose'
import { burst, confetti, inView } from '../effects'

// The classic's set-done animation, after the motion prototype (variant C): a crouch, a big jump with a spin, a star burst at the top, confetti, a second hop.

/** The body by step: how far it is lifted (negative is up) and squashed (negative stretches), as the prototype plans them. After the last entry it stands. */
const PLAN = [
  [0, 1],
  [0, 1],
  [-1, -1],
  [-3, 0],
  [-5, 0],
  [-6, 0],
  [-6, 0],
  [-5, 0],
  [-3, 0],
  [-1, -1],
  [0, 1],
  [0, 0],
  [0, 1],
  [-1, -1],
  [-3, 0],
  [-4, 0],
  [-3, 0],
  [-1, -1],
  [0, 1],
  [0, 0],
] as const

/** The top of the first jump: the steps the sprite is turned the other way, a spin. */
const SPIN = [5, 6]

/**
 * A set is done: the sidekick crouches, jumps high with both arms up and spins at the top while a star of sparks bursts above its head, confetti falls from the sky over the stage, then it hops once more and lands.
 * Everything is placed by its head and the stage's edges. It spins in place (a mirror about the middle of its frame) and does not walk.
 */
export const jump = defineAnimation({
  needs: [],
  poses: ['armsUp', 'earsUp'],
  frames: 30,
  msPerFrame: 85,
  once: true,
  // Both arms are the armsUp pose, where a held accessory would be.
  hides: ['held'],
  frame: (step, { head }, edges) => {
    const [dy, squash] = PLAN[step] ?? [0, 0]
    const dots = [
      ...confetti({ seed: 22, frame: step - 2, edges, count: 40, fall: 0.6 }),
      // The star bursts above the head at the top of the first jump (the head is six pixels up there).
      ...(step >= 4 && step <= 9
        ? burst({
            seed: 40,
            at: { x: head.x, y: head.y - 5 },
            frame: step - 4,
            floor: edges.ground - 1,
            count: 12,
            speed: 1.6,
            gravity: 0.05,
            life: 6,
            colors: ['flash', 'base', 'spark'],
          })
        : []),
    ]

    return {
      dy,
      squash,
      mirror: SPIN.includes(step),
      poses: step >= 2 && step < 19 ? ['armsUp', 'earsUp'] : [],
      dots: inView(dots, edges),
    }
  },
})
