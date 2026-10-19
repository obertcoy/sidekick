import { defineAnimation } from '../compose'
import { bolt, boltPath, burst, checkMark, crackle } from '../effects'
import type { Dot, Point, Role } from '../types'

// The bolt and the sparks it throws are drawn from these seeds, so every ticket-done zap has the same bolt.
const BOLT_SEED = 17
const CRACKLE_SEED = 3
const SPARK_SEED = 5

// A point that may be missing: only the second tail tip, since a tail may have a single tip.
const at = (point: Point | undefined, dx: number, dy: number, role: Role): Dot[] => (point === undefined ? [] : [[point.x + dx, point.y + dy, role]])

/**
 * A ticket is done: the tail crackles and the cheeks charge, a bolt strikes the raised paw and throws sparks that fall to the ground, and a check mark stays.
 * The beats are the strike's: the bolt leaves at step 2 and lands at step 3, and the last frame holds the check mark alone.
 */
export const zap = defineAnimation({
  needs: ['boltFrom', 'cheeks', 'ears', 'paw', 'reach', 'tail'],
  // The raised arm is the character's own pose; the glowing paw in the frame after the bolt lands is a dot at `reach`.
  poses: ['armUp'],
  frames: 12,
  msPerFrame: 110,
  once: true,
  // The bolt is drawn at the paw, where a held accessory would be; the raised arm is the armUp pose.
  hides: ['held'],
  frame: (step, { boltFrom, cheeks, ears, paw, reach, tail }, edges, facing = 'right') => {
    const paper = { x: paw.x + 1, y: paw.y - 1 }
    // Two pixels ahead of the raised paw (the way it faces) and one up: where the bolt ends.
    const strike = { x: reach.x + (facing === 'left' ? -2 : 2), y: reach.y - 1 }
    const glow = (role: Role): Dot[] => cheeks.flatMap(cheek => at(cheek, 1, 0, role))
    // The raised arm is part of the body, so a dot would draw over it. Where a glow lands on the paw (the classic's right cheek), the arm stays on top, as it always was.
    const glowBesideArm = (role: Role): Dot[] => glow(role).filter(([x, y]) => x !== reach.x || y !== reach.y)
    // Lightning crackling down onto the tail tips from above, each tip lit as well.
    const onTail = (tips: readonly Point[], role: Role): Dot[] =>
      tips.flatMap((tip, which) => [...at(tip, 0, 0, role), ...crackle({ seed: CRACKLE_SEED + which, at: { x: tip.x, y: tip.y - 4 }, frame: step })])
    // The sparks the strike throws, from the frame it lands in, falling to the row above the ground.
    const sparks = burst({ seed: SPARK_SEED, at: strike, frame: step - 3, floor: edges.ground - 1, count: 8, speed: 1, life: 6, spread: 2.8 })

    switch (step) {
      case 0:
        return { dots: [...onTail(tail, 'spark'), ...glow('spark')] }
      case 1:
        return {
          dots: [
            ...at(ears[0], 0, 0, 'flash'),
            // The top of the bolt to come, a leader on its way down.
            ...boltPath(BOLT_SEED, boltFrom, strike)
              .slice(0, 4)
              .flatMap(point => at(point, 0, 0, 'spark')),
            ...onTail(tail, 'flash'),
            ...glow('flash'),
          ],
        }
      case 2:
        return { poses: ['armUp'], dots: [...bolt({ seed: BOLT_SEED, from: boltFrom, to: strike, core: 'flash', glow: 'glow' }), ...glowBesideArm('flash')] }
      case 3:
        return {
          poses: ['armUp'],
          dots: [
            ...bolt({ seed: BOLT_SEED, from: boltFrom, to: strike, core: 'spark', glow: 'glowDim' }),
            ...sparks,
            ...onTail(tail.slice(0, 1), 'spark'),
            ...glowBesideArm('spark'),
          ],
        }
      case 4:
        return { poses: ['armUp'], dots: [...onTail(tail.slice(0, 1), 'spark'), ...at(reach, 0, 0, 'spark'), ...sparks] }
      case 5:
        return { dots: sparks }
      default:
        // The sparks are over by now; the check mark rises over the spot where the paper was.
        return { dots: sparks, layers: { overlay: checkMark({ at: paper }) } }
    }
  },
})
