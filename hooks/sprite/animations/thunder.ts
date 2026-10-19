import { defineAnimation } from '../compose'
import { bolt, boltPath, burst, checkMark, flash, inView, scorch, shockwave, smoke } from '../effects'
import type { Dot, Point } from '../types'

// The classic's ticket-done animation, after the motion prototype (variant C, `.scratch/sidekick/prototypes.html#motion`): the storm. Everything is placed by the sidekick's anchors, the way it faces and the stage's edges.

/** The step the main bolt cracks into the ground: the ticket strike lands its bolt on the row here. */
const CRACK = 8
/** The step the shockwave reaches the feet and the sidekick leaves the ground to hop over it. */
const HOP_AT = 17
/** How high the hop takes it, by step from `HOP_AT`. */
const HOP = [-1, -3, -4, -3, -1, 0] as const

const BOLT_SEED = 17
const AFTERSHOCK_SEED = 23
const POSES = ['armUp', 'armsUp', 'blink', 'earsUp', 'tailUp', 'tailDown'] as const
type Pose = (typeof POSES)[number]

/** The sky's flash by step: the main strike (2), the glow after it (1), the aftershock and its glow. */
const FLASH: Readonly<Record<number, 1 | 2>> = { 8: 2, 9: 1, 10: 1, 12: 2, 13: 1 }

/**
 * A ticket is done: the sidekick crouches and charges, throws a streak into the sky, and a leader comes down, then a branching bolt strikes the ground ahead of it while the sky flashes.
 * Sparks and rubble fly, the ground scorches with embers and smoke rises; a smaller aftershock bolt lands closer; a shockwave runs along the ground and the sidekick hops over it; the check mark rises over the crater.
 * The strike point is fourteen pixels ahead of the raised paw (the way it faces), held to the camera's edges. The ticket strike keeps its beats: the streak leaves the sidekick at step 4 and the bolt lands at step 8.
 */
export const thunder = defineAnimation({
  needs: ['cheeks', 'reach'],
  poses: POSES,
  frames: 44,
  msPerFrame: 80,
  once: true,
  // The raised arm is the armUp pose, where a held accessory would be.
  hides: ['held'],
  strikeAt: { leaves: 4, lands: CRACK },
  frame: (step, { cheeks, feet, reach }, edges, facing = 'right') => {
    const dir = facing === 'left' ? -1 : 1
    const ground = edges.ground
    const ahead = reach.x + dir * 14
    // Ahead of the paw, at least one pixel and as far as fourteen, short of the camera's edge.
    // and kept inside the camera at last, even when the paw is at its edge.
    const wanted = dir === 1 ? Math.max(Math.min(ahead, edges.right - 3), reach.x + 1) : Math.min(Math.max(ahead, edges.left + 3), reach.x - 1)
    const x = Math.max(Math.min(wanted, edges.right), edges.left)
    const target: Point = { x, y: ground - 1 }
    const top: Point = { x: x + dir * 3, y: edges.skyTop }
    // The aftershock lands closer, six pixels back toward the sidekick.
    const nearer: Point = { x: x - dir * 6, y: ground - 1 }
    const nearerTop: Point = { x: x - dir * 4, y: edges.skyTop }
    // The shockwave is paced to reach the feet as the hop begins.
    const speed = Math.max(1, Math.abs(x - feet.x) / (HOP_AT - 9))

    let poses: readonly Pose[] = []
    let [dx, dy, squash] = [0, 0, 0]
    if (step <= 3) {
      poses = ['earsUp', step % 2 === 1 ? 'tailUp' : 'tailDown']
      squash = step >= 2 ? 1 : 0
    } else if (step <= 6) {
      poses = ['armUp', 'earsUp']
      squash = step === 4 ? -1 : 0
    } else if (step === 7) poses = ['armUp']
    else if (step <= 10) poses = ['armUp', 'blink']
    else if (step < 12) {
      poses = ['blink']
      dx = -dir
    } else if (step < HOP_AT) {
      poses = step < 14 ? ['blink'] : []
      dx = step < 14 ? -dir : 0
      squash = step === 12 ? 1 : 0
    } else if (step < HOP_AT + HOP.length) {
      poses = ['armsUp']
      dy = HOP[step - HOP_AT] ?? 0
      squash = step === HOP_AT ? -1 : step === HOP_AT + HOP.length - 1 ? 1 : 0
    }

    const dots: Dot[] = []
    const marks: Dot[] = []
    if (step <= 3) {
      // The cheeks crackle; they sit a row lower once it has crouched.
      const [first] = cheeks
      const last = cheeks.at(-1) ?? first
      const lowered = (cheek: Point): Point => ({ x: cheek.x + dir, y: cheek.y + (step >= 2 ? 1 : 0) })
      dots.push(
        [lowered(first).x, lowered(first).y, step % 2 === 1 ? 'flash' : 'spark'],
        [lowered(last).x, lowered(last).y, step % 2 === 1 ? 'spark' : 'flash'],
        ...burst({
          seed: 30 + step,
          at: lowered(last),
          frame: 1.5,
          floor: ground - 1,
          count: 4,
          speed: 1.2,
          gravity: 0,
          life: 3,
          colors: ['spark', 'flash'],
        }),
      )
    }
    if (step >= 4 && step <= 6) {
      // A streak of charge climbing from the raised paw off the top of the stage.
      const head = reach.y - 1 + (step === 4 ? -1 : 0) - 1 - (step - 4) * 6
      for (let i = 0; i < 4; i++) dots.push([reach.x + dir * (i % 2), head + i, i === 0 ? 'flash' : 'spark'])
    }
    if (step === 7) {
      // A leader crawls down, every other row of the bolt to come.
      dots.push([top.x, top.y, 'flash'])
      for (const point of boltPath(BOLT_SEED, top, target)) if ((point.y - edges.skyTop) % 2 === 0) dots.push([point.x, point.y, 'glowDim'])
    }
    if (step === CRACK || step === CRACK + 1) {
      const isMain = step === CRACK
      dots.push(...bolt({ seed: BOLT_SEED, from: top, to: target, branches: 2, core: isMain ? 'flash' : 'spark', glow: isMain ? 'glow' : 'glowDim' }))
      if (isMain) for (let d = -4; d <= 4; d++) dots.push([x + d, ground, 'flash'])
    }
    if (step === CRACK + 2) {
      for (const point of boltPath(BOLT_SEED, top, target)) if ((point.y - edges.skyTop) % 3 === 0) dots.push([point.x, point.y, 'glowDim'])
    }
    // The aftershock: a smaller second bolt lands closer.
    if (step === 12 || step === 13) {
      const isMain = step === 12
      dots.push(...bolt({ seed: AFTERSHOCK_SEED, from: nearerTop, to: nearer, core: isMain ? 'flash' : 'spark', glow: isMain ? 'glow' : 'glowDim' }))
      if (isMain) for (let d = -2; d <= 2; d++) dots.push([nearer.x + d, ground, 'flash'])
    }
    if (step >= 12) {
      dots.push(...burst({ seed: 14, at: nearer, frame: step - 12, floor: ground - 1, count: 10, speed: 1.3, life: 8 }))
      dots.push(...smoke({ seed: 8, at: target, frame: step - 12, count: 10, life: 18 }))
    }
    if (step >= 9) {
      // Rubble and sparks from the crater, and the wave along the ground.
      dots.push(...burst({ seed: 12, at: target, frame: step - 9, floor: ground - 1, count: 22, speed: 1.8, life: 11 }))
      dots.push(
        ...burst({
          seed: 13,
          at: target,
          frame: step - 9,
          floor: ground - 1,
          count: 8,
          speed: 1.1,
          gravity: 0.22,
          life: 14,
          colors: ['dust', 'smokeDim', 'dust'],
        }),
      )
      dots.push(...shockwave({ at: { x, y: ground }, frame: step - 9, edges, speed }))
      marks.push(...scorch({ seed: 4, at: { x, y: ground }, radius: 2, frame: step - 9, embers: 7 }))
    }
    if (step >= 13) marks.push(...scorch({ seed: 6, at: { x: nearer.x, y: ground }, radius: 1, frame: step - 13, embers: 3 }))

    // The check mark rises over the crater, stays in front of everything and is cut by the camera's edges.
    const rise = Math.max(0, 4 - (step - (HOP_AT + HOP.length)))
    const check =
      step >= HOP_AT + HOP.length
        ? checkMark({ at: { x: Math.max(Math.min(x - 3, edges.right - 6), edges.left), y: ground - 12 + rise }, big: true, outline: true })
        : []
    const level = FLASH[step] ?? 0

    return {
      poses,
      dx,
      dy,
      squash,
      dots: inView(dots, edges),
      layers: { sky: flash({ edges, level: level as 0 | 1 | 2 }), ground: inView(marks, edges), overlay: inView(check, edges) },
    }
  },
})
