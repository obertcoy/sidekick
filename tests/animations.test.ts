import { expect } from 'claude-code/testing'
import { classic } from '../hooks/sprite/characters/classic'
import { foxkit } from '../hooks/sprite/characters/foxkit'
import { ANIMATIONS, PLAIN } from '../hooks/sprite/registry'
import type { Anchors, Animation, Dot, Edges, Point } from '../hooks/sprite/types'
import { HITS, LANDS, LEAVES, MIN_STRIKE_FRAMES } from '../hooks/strike'
import { test } from './world'

// The classic animations, now drawn with the effects library and the stage's edges, at the pure level: each frame is a function of the anchors it is given and the edges of the stage.
// Where an effect is placed and how it is timed is what these read; the generic checks (nothing off the stage, nothing at a fixed coordinate, every character and pose) are in stage.test.ts and sprite.test.ts.

const SHIPPED = [foxkit, classic] as const
/** A stage as the animations see it: a sky top, a ground row under the feet, and the camera's side columns. */
const edgesFor = (anchors: Anchors): Edges => ({ skyTop: 0, ground: anchors.feet.y + 1, left: 0, right: 39 })
const dotsOf = (animation: Animation, step: number, anchors: Anchors, edges: Edges = edgesFor(anchors)): readonly Dot[] =>
  animation.frame(step, anchors, edges).dots ?? []
const overlayOf = (animation: Animation, step: number, anchors: Anchors): readonly Dot[] =>
  animation.frame(step, anchors, edgesFor(anchors)).layers?.overlay ?? []
const at = (dots: readonly Dot[]): string[] => dots.map(([x, y]) => `${x},${y}`)
/** Where the bolt strikes: two pixels right of the raised paw and one up, as it always has. */
const landing = (anchors: Required<Pick<Anchors, 'reach'>>): Point => ({ x: anchors.reach.x + 2, y: anchors.reach.y - 1 })

test("the zap keeps its length and pace, so the ticket strike keeps its beats: the bolt leaves at the strike's LEAVES step and lands at LANDS", async () => {
  expect(ANIMATIONS.zap.frames).toBe(12)
  expect(ANIMATIONS.zap.msPerFrame).toBe(110)
  expect(ANIMATIONS.zap.frames).toBeGreaterThanOrEqual(MIN_STRIKE_FRAMES)
  for (const { anchors, name } of SHIPPED) {
    const { boltFrom, reach } = anchors
    if (boltFrom === undefined || reach === undefined) throw new Error(`${name} has no bolt`)
    const target = landing({ reach })
    // The bolt is a core of flash then spark running the whole way from `boltFrom` to where it lands, and no frame before LEAVES draws more than its top.
    const whole = (step: number): boolean => {
      const lit = new Set(at(dotsOf(ANIMATIONS.zap, step, anchors)))

      return lit.has(`${boltFrom.x},${boltFrom.y}`) && lit.has(`${target.x},${target.y}`)
    }
    const first = Array.from({ length: ANIMATIONS.zap.frames }, (_, step) => step).find(whole)
    expect(first, name).toBe(LEAVES)
    expect(whole(LANDS), name).toBe(true)
    expect(whole(HITS + 1), name).toBe(false)
    // Every row from the top of the bolt to where it lands has a bolt pixel, and a pixel is next to the one above it (the pixels of a bolt are joined).
    for (const step of [LEAVES, LANDS]) {
      const rows = new Set(dotsOf(ANIMATIONS.zap, step, anchors).map(([, y]) => y))
      for (let y = boltFrom.y; y <= target.y; y++) expect(rows.has(y), `${name} ${step} row ${y}`).toBe(true)
    }
    // The bolt in the first frame it shows is bright, with a glow either side.
    const roles = dotsOf(ANIMATIONS.zap, LEAVES, anchors).map(dot => dot[2])
    expect(roles, name).toContain('flash')
    expect(roles, name).toContain('glow')
  }
})

test('the zap kicks up sparks where the bolt lands, which fall to the ground the stage tells it and are gone before the last frame', async () => {
  for (const { anchors, name } of SHIPPED) {
    const { reach } = anchors
    if (reach === undefined) throw new Error(`${name} has no reach`)
    const target = landing({ reach })
    // The frame it lands in has a flash on the landing point.
    expect(dotsOf(ANIMATIONS.zap, LANDS, anchors), name).toContainEqual([target.x, target.y, 'flash'])
    // With the ground raised, the sparks still stop on the row above it (frame 5 draws sparks and nothing else).
    for (const ground of [anchors.feet.y + 1, target.y + 1]) {
      const sparks = dotsOf(ANIMATIONS.zap, 5, anchors, { ...edgesFor(anchors), ground })
      expect(sparks.length, `${name} ground ${ground}`).toBeGreaterThan(0)
      expect(Math.max(...sparks.map(([, y]) => y)), `${name} ground ${ground}`).toBeLessThanOrEqual(ground - 1)
    }
    // Over before the end: the last frame holds the check mark alone.
    expect(dotsOf(ANIMATIONS.zap, ANIMATIONS.zap.frames - 1, anchors), name).toEqual([])
  }
})

test('the zap leaves the check mark over the paper spot from the sixth frame, in front of everything, and not before', async () => {
  for (const { anchors, name } of SHIPPED) {
    const { paw } = anchors
    if (paw === undefined) throw new Error(`${name} has no paw`)
    const paper = { x: paw.x + 1, y: paw.y - 1 }
    const last = overlayOf(ANIMATIONS.zap, ANIMATIONS.zap.frames - 1, anchors)
    expect(at(last).sort(), name).toEqual(
      [
        [paper.x + 4, paper.y],
        [paper.x + 3, paper.y + 1],
        [paper.x, paper.y + 2],
        [paper.x + 2, paper.y + 2],
        [paper.x + 1, paper.y + 3],
      ]
        .map(([x, y]) => `${x},${y}`)
        .sort(),
    )
    expect(
      last.every(dot => dot[2] === 'check'),
      name,
    ).toBe(true)
    for (let step = 0; step < ANIMATIONS.zap.frames; step++) {
      expect(overlayOf(ANIMATIONS.zap, step, anchors).length, `${name} ${step}`).toBe(step >= 6 ? 5 : 0)
    }
  }
})

test('the zap crackles on the tail and the cheeks while it charges, and on the raised paw when the bolt arrives', async () => {
  for (const { anchors, name } of SHIPPED) {
    const { cheeks, tail, reach } = anchors
    if (cheeks === undefined || tail === undefined || reach === undefined) throw new Error(`${name} lacks an anchor`)
    for (const step of [0, 1]) {
      const lit = new Set(at(dotsOf(ANIMATIONS.zap, step, anchors)))
      // A cheek glows one pixel to the right of it; a tip of the tail is lit.
      for (const cheek of cheeks) expect(lit.has(`${cheek.x + 1},${cheek.y}`), `${name} ${step} cheek`).toBe(true)
      for (const tip of tail) expect(lit.has(`${tip.x},${tip.y}`), `${name} ${step} tail`).toBe(true)
    }
    // The paw glows once, in the frame after the bolt lands.
    expect(dotsOf(ANIMATIONS.zap, HITS, anchors), name).toContainEqual([reach.x, reach.y, 'spark'])
  }
})

test('the cheer throws sparks up from each ear tip, which climb and fade, and ends with nothing drawn', async () => {
  for (const { anchors, name } of SHIPPED) {
    const { ears } = anchors
    if (ears === undefined) throw new Error(`${name} has no ears`)
    // The first frame has a spark on the row above each ear tip, and the sparks stay above the tips.
    const first = new Set(at(dotsOf(ANIMATIONS.cheer, 0, anchors)))
    for (const ear of ears) expect(first.has(`${ear.x},${ear.y - 1}`), `${name} ear ${ear.x}`).toBe(true)
    let highest = Number.POSITIVE_INFINITY
    for (let step = 0; step < 7; step++) {
      const dots = dotsOf(ANIMATIONS.cheer, step, anchors)
      expect(dots.length, `${name} ${step}`).toBeGreaterThan(0)
      for (const [, y] of dots) {
        expect(y, `${name} ${step}`).toBeLessThanOrEqual(Math.min(...ears.map(ear => ear.y)) - 1)
        highest = Math.min(highest, y)
      }
    }
    expect(highest, name).toBeLessThan(Math.min(...ears.map(ear => ear.y)) - 1)
    expect(dotsOf(ANIMATIONS.cheer, ANIMATIONS.cheer.frames - 1, anchors), name).toEqual([])
    // The head still hops twice.
    const bobs = Array.from({ length: ANIMATIONS.cheer.frames }, (_, step) => ANIMATIONS.cheer.frame(step, anchors, edgesFor(anchors)).bob)
    expect(bobs).toEqual([0, 1, 1, 0, 0, 1, 1, 0, 0, 0])
  }
})

test('the plain defaults are drawn with effects from the head, the feet and the stage edges alone: hop kicks up dust, sink lets out a puff, bounce drops confetti; nod and dip stay plain', async () => {
  const { anchors } = foxkit
  const edges: Edges = { skyTop: 0, ground: 20, left: 5, right: 30 }
  const play = (name: keyof typeof PLAIN): Animation => ANIMATIONS[PLAIN[name]]
  const drawn = (animation: Animation): Dot[][] => Array.from({ length: animation.frames }, (_, step) => [...dotsOf(animation, step, anchors, edges)])

  // Looping ones draw nothing: stillness and a bob.
  for (const moment of ['working', 'searching'] as const) expect(drawn(play(moment)).flat(), moment).toEqual([])

  // A finished ticket: dust kicked up at the feet from the first hop, falling back to the ground row and gone before the last frame.
  const hop = drawn(play('ticket-done'))
  expect(hop.flat().length).toBeGreaterThan(0)
  expect(hop.at(-1)).toEqual([])
  for (const [x, y, role] of hop.flat()) {
    expect(y).toBeLessThanOrEqual(edges.ground - 1)
    expect(y).toBeGreaterThan(anchors.feet.y - 6)
    expect(Math.abs(x - anchors.feet.x)).toBeLessThan(8)
    expect(role === 'dust' || role === 'smokeDim').toBe(true)
  }

  // A failed search: a puff of smoke over the head, grey.
  const sink = drawn(play('search-failed')).flat()
  expect(sink.length).toBeGreaterThan(0)
  expect(sink.every(dot => dot[2] === 'smoke' || dot[2] === 'smokeDim')).toBe(true)
  expect(sink.every(([, y]) => y < anchors.head.y)).toBe(true)

  // A finished set: confetti between the side edges, from the sky top, on every frame after the first few.
  const bounce = drawn(play('set-done'))
  const pieces = bounce.flat()
  expect(pieces.length).toBeGreaterThan(0)
  for (const [x, y] of pieces) {
    expect(x).toBeGreaterThanOrEqual(edges.left)
    expect(x).toBeLessThanOrEqual(edges.right)
    expect(y).toBeGreaterThanOrEqual(edges.skyTop)
    expect(y).toBeLessThanOrEqual(edges.ground - 1)
  }
  expect(bounce.at(-1)?.length).toBeGreaterThan(0)
})

test('the plain defaults still need nothing but the head and the feet, no pose, and keep their length for the strike', async () => {
  for (const name of Object.values(PLAIN)) {
    expect(ANIMATIONS[name].needs, name).toEqual([])
    expect(ANIMATIONS[name].poses, name).toEqual([])
  }
  expect(ANIMATIONS[PLAIN['ticket-done']].frames).toBeGreaterThanOrEqual(MIN_STRIKE_FRAMES)
})
