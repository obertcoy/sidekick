import { defineAnimation } from '../compose'
import { aura, bolt, burst, crackle, flash, inView, rng, shockwave } from '../effects'
import type { BodyRole, Dot, Region } from '../types'

// The classic's power-up, after the motion prototype (variant C): it charges, shakes with the pebbles lifting, a bolt strikes it and it turns gold with glowing eyes and a flaming aura, then powers down.
// It is in the library; where it plays is the owner's to decide (ticket 24).

const POSES = ['armsUp', 'blink', 'earsUp', 'spiky'] as const

/** The body half way to gold, then all the way (the prototype's colours). */
const MID: Readonly<Partial<Record<BodyRole, number>>> = { base: 0xffe680, outline: 0xc98a10, cheek: 0xff7a5c }
const FULL: Readonly<Partial<Record<BodyRole, number>>> = { base: 0xfff3b0, shade: 0xffc94d, outline: 0xe8a400, eye: 0x2bd9ff, cheek: 0xff8a5c }
const FLAME = 0xfff3a0
const SPARK_GOLD = 0xffd43b

/** Pebbles by their distance from the feet, left (negative) and right. */
const PEBBLES = [-12, -9, 8, 11, 15, -15] as const

/** The phases, by the step each begins at. */
const RISE = 6
const BURST = 12
const HOLD = 15
const DOWN = 34

/** How far the pebbles are lifted at a step (pixels). */
const liftAt = (step: number): number => (step < RISE ? 0 : step < BURST ? (step - 5) * 0.5 : step < DOWN ? 4 : Math.max(0, 6 - (step - DOWN) * 2) * 0.6)

/**
 * The sidekick powers up: it crouches with its eyes shut while the ground trembles, shakes as pebbles lift off and the aura sparks on, a bolt from the sky strikes it and it turns gold with glowing eyes
 * and a roaring aura, the pebbles float, and then it powers down and the pebbles drop. The aura hugs the body (`aimed`); everything else is placed by the sidekick's anchors and the stage's edges.
 */
export const powerUp = defineAnimation({
  needs: ['ears', 'reach', 'tail'],
  poses: POSES,
  frames: 40,
  msPerFrame: 80,
  once: true,
  // Both arms are the armsUp pose, where a held accessory would be.
  hides: ['held'],
  frame: (step, { ears, feet, head, reach, tail }, edges) => {
    const ground = edges.ground
    const isCharge = step < RISE
    const isRise = step >= RISE && step < BURST
    const isBurst = step >= BURST && step < HOLD
    const isHold = step >= HOLD && step < DOWN
    const isDown = step >= DOWN

    // Where the body is, to hug it with the aura: a few pixels around the ears, tail, arms and feet, and the rows the flames can reach above the ear tips.
    const earTop = Math.min(...ears.map(ear => ear.y))
    const xs = [...ears, ...tail, head, reach].map(point => point.x)
    const region: Region = {
      left: Math.max(Math.min(...xs) - 4, edges.left),
      right: Math.min(Math.max(...xs) + 4, edges.right),
      top: Math.max(earTop - 8, edges.skyTop),
      bottom: feet.y,
    }
    const size = isCharge ? step % 2 : isRise ? 1 : isDown ? (step < 36 ? 1 : 0) : 2

    let poses: readonly (typeof POSES)[number][] = []
    let recolor: Readonly<Partial<Record<BodyRole, number>>> | undefined
    let [dx, dy, squash] = [0, 0, 0]
    if (isCharge) {
      poses = ['blink']
      squash = 1
    } else if (isRise) {
      poses = ['blink', 'earsUp']
      dx = step % 2 === 1 ? 1 : -1
      recolor = step >= 9 ? MID : undefined
    } else if (isBurst) {
      poses = ['spiky', 'armsUp']
      squash = -1
      dy = step === BURST ? -1 : 0
      recolor = FULL
    } else if (isHold) {
      poses = ['spiky', step % 9 === 0 ? 'blink' : 'earsUp']
      dy = step % 4 < 2 ? 0 : -1
      recolor = FULL
    } else if (step < 36) {
      poses = ['earsUp']
      recolor = MID
    }

    const lift = liftAt(step)
    const dots: Dot[] = []
    const marks: Dot[] = []
    // Pebbles tremble on the ground, lift off and float, then drop.
    PEBBLES.forEach((offset, which) => {
      const up = lift * (0.6 + (which % 3) * 0.3) + (lift > 0 ? Math.sin(step / 2 + which) * 0.8 : step % 2 === which % 2 ? -0.6 : 0)
      const at = { x: Math.max(Math.min(feet.x + offset, edges.right), edges.left), y: feet.y - up }
      marks.push([at.x, Math.round(at.y) + 0, which % 2 === 1 ? 'dust' : 'smokeDim'])
      if (which % 3 === 0) marks.push([at.x + 1, Math.round(at.y) + 0, 'smokeDim'])
    })
    // Cracks run out from under it from the burst on.
    if (step >= BURST) {
      const reachOut = Math.min(14, (step - 11) * 3)
      for (let d = 0; d <= reachOut; d += 2) marks.push([feet.x - 1 - d, ground, 'scorch'], [feet.x + d, ground, 'scorch'])
    }
    // Lightning crackles in the aura, and in the hold a few flames fly up off it.
    if (!isCharge && !isDown && step % 2 === 0) {
      const next = rng(60 + step)
      const x = feet.x - 7 + Math.floor(next() * 13)
      const y = feet.y - 12 + Math.floor(next() * 8)
      dots.push(...crackle({ seed: 70, at: { x, y }, frame: step }))
    }
    if (isHold) {
      const next = rng(80 + step)
      for (let i = 0; i < 3; i++) dots.push([feet.x - 8 + Math.floor(next() * 16), feet.y - 13 - Math.floor(next() * 4), FLAME])
    }
    if (isBurst) {
      // The bolt from the sky strikes the tip of the ears; the ground shakes out a wave and sparks fly.
      const strike = { x: head.x, y: earTop - 1 }
      if (step <= BURST + 1) {
        dots.push(
          ...bolt({
            seed: 31,
            from: { x: head.x + 1, y: edges.skyTop },
            to: strike,
            core: step === BURST ? 'flash' : 'spark',
            glow: step === BURST ? 'glow' : 'glowDim',
          }),
        )
      }
      dots.push(...shockwave({ at: { x: feet.x - 1, y: ground }, frame: step - BURST, edges, speed: 2.6, reach: 20 }))
      dots.push(
        ...burst({
          seed: 90,
          at: { x: feet.x - 1, y: feet.y - 6 },
          frame: step - BURST + 1,
          floor: feet.y,
          count: 20,
          speed: 1.9,
          gravity: 0.1,
          life: 7,
          colors: ['flash', SPARK_GOLD, FLAME, 'spark'],
        }),
      )
    }

    return {
      poses,
      dx,
      dy,
      squash,
      ...(recolor === undefined ? {} : { recolor }),
      dots: inView(dots, edges),
      layers: {
        sky: flash({ edges, level: step === BURST ? 2 : step === BURST + 1 ? 1 : 0 }),
        ground: inView(marks, edges),
      },
      ...(size > 0 ? { aimed: aura({ seed: 50, frame: step, region, size }) } : {}),
    }
  },
})
