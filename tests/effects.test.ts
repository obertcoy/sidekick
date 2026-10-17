import { expect } from 'claude-code/testing'
import { aura, bolt, boltPath, burst, confetti, crackle, flash, rng, shockwave, smoke } from '../hooks/sprite/effects'
import type { Dot, Edges, Mask, Point } from '../hooks/sprite/types'
import { test } from './world'

// The effects library, at the pure level: each effect is a function of the frame number, a seed and what it is aimed by (anchors, a mask, the stage's edges), and nothing else.

const EDGES: Edges = { skyTop: 0, ground: 20, left: 4, right: 43 }
const FLOOR = EDGES.ground - 1

const key = (dot: Dot): string => dot.join(',')
const same = (a: readonly Dot[], b: readonly Dot[]): boolean => a.length === b.length && a.every((dot, at) => key(dot) === key(b[at] as Dot))
const lowest = (dots: readonly Dot[]): number => Math.max(...dots.map(([, y]) => y))
const highest = (dots: readonly Dot[]): number => Math.min(...dots.map(([, y]) => y))
const inside = ([x, y]: Dot): boolean => x >= EDGES.left && x <= EDGES.right && y >= EDGES.skyTop && y <= FLOOR

test('the random numbers come from the seed alone, and every effect rounds to whole pixels (never minus zero)', async () => {
  const first = rng(7)
  const again = rng(7)
  const run = Array.from({ length: 5 }, () => first())
  expect(Array.from({ length: 5 }, () => again())).toEqual(run)
  expect(run.every(n => n >= 0 && n < 1)).toBe(true)
  const other = rng(8)
  expect(Array.from({ length: 5 }, () => other())).not.toEqual(run)
  for (const dot of [
    ...burst({ seed: 3, at: { x: 10, y: 10 }, frame: 2, floor: FLOOR }),
    ...smoke({ seed: 3, at: { x: 10, y: 10 }, frame: 3 }),
    ...confetti({ seed: 3, frame: 9, edges: EDGES }),
  ]) {
    expect(Number.isInteger(dot[0]) && Number.isInteger(dot[1]), key(dot)).toBe(true)
    expect(Object.is(dot[0], -0) || Object.is(dot[1], -0), key(dot)).toBe(false)
  }
})

test('a bolt zigzags from its top to where it strikes, in connected pixels, the same for the same seed', async () => {
  const from: Point = { x: 20, y: 2 }
  const to: Point = { x: 14, y: 16 }
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const path = boltPath(seed, from, to)
    expect(path[0], `seed ${seed} starts at the top`).toEqual(from)
    expect(path.at(-1), `seed ${seed} ends where it strikes`).toEqual(to)
    for (const [at, point] of path.slice(1).entries()) {
      const before = path[at] as Point
      expect(Math.abs(point.x - before.x) + (point.y - before.y), `seed ${seed} step ${at}`).toBeGreaterThan(0)
      expect(Math.abs(point.x - before.x), `seed ${seed} step ${at} is joined`).toBeLessThanOrEqual(1)
      expect(point.y - before.y, `seed ${seed} step ${at} goes down`).toBeGreaterThanOrEqual(0)
      expect(point.y - before.y, `seed ${seed} step ${at} goes down by a row at most`).toBeLessThanOrEqual(1)
    }
  }
  expect(boltPath(3, from, to)).toEqual(boltPath(3, from, to))
  expect(new Set([1, 2, 3, 4, 5, 6].map(seed => JSON.stringify(boltPath(seed, from, to)))).size, 'the seed shapes it').toBeGreaterThan(1)
  // Straight down, or no way down at all, still makes a bolt.
  const straight = boltPath(1, { x: 5, y: 3 }, { x: 5, y: 6 })
  expect([straight[0], straight.at(-1)]).toEqual([
    { x: 5, y: 3 },
    { x: 5, y: 6 },
  ])
  // A target farther sideways than it has rows to get there is still reached.
  expect(boltPath(1, { x: 5, y: 3 }, { x: 12, y: 5 }).at(-1)).toEqual({ x: 12, y: 5 })
  expect(boltPath(1, { x: 5, y: 3 }, { x: 5, y: 1 })).toEqual([{ x: 5, y: 3 }])
})

test('a bolt is drawn with its core over its glow, and its branches fork off the main path and go down', async () => {
  const from: Point = { x: 20, y: 2 }
  const to: Point = { x: 14, y: 16 }
  const plain = bolt({ seed: 4, from, to, core: 'flash' })
  expect(plain.every(dot => dot[2] === 'flash')).toBe(true)
  expect(plain.length).toBe(boltPath(4, from, to).length)
  const glowing = bolt({ seed: 4, from, to, core: 'flash', glow: 'glow' })
  const roles = glowing.map(dot => dot[2])
  expect(roles.lastIndexOf('glow'), 'every glow pixel is drawn before the core').toBeLessThan(roles.indexOf('flash'))
  expect(glowing.filter(dot => dot[2] === 'flash').map(key), 'the core is the path').toEqual(plain.map(key))
  const path = new Set(boltPath(4, from, to).map(point => `${point.x},${point.y}`))
  const forked = bolt({ seed: 4, from, to, core: 'flash', branches: 3 })
  const extra = forked.filter(dot => !path.has(`${dot[0]},${dot[1]}`))
  expect(extra.length, 'branches add pixels').toBeGreaterThan(0)
  expect(lowest(forked), 'the branches stay above the strike').toBeLessThanOrEqual(to.y + 3)
  expect(highest(extra), 'the branches start below the top').toBeGreaterThan(from.y)
  expect(same(forked, bolt({ seed: 4, from, to, core: 'flash', branches: 3 }))).toBe(true)
})

test('a burst throws sparks that fall under gravity, stop at the floor, and are gone when their life is over', async () => {
  const at: Point = { x: 20, y: 10 }
  expect(burst({ seed: 5, at, frame: -1, floor: FLOOR }), 'nothing before it starts').toEqual([])
  expect(burst({ seed: 5, at, frame: 200, floor: FLOOR }), 'nothing long after').toEqual([])
  const early = burst({ seed: 5, at, frame: 2, floor: FLOOR })
  expect(early.length).toBeGreaterThan(0)
  expect(same(early, burst({ seed: 5, at, frame: 2, floor: FLOOR }))).toBe(true)
  expect(same(early, burst({ seed: 6, at, frame: 2, floor: FLOOR }))).toBe(false)
  for (let frame = 0; frame < 14; frame++) expect(lowest(burst({ seed: 5, at, frame, floor: 12, count: 30 })), `frame ${frame}`).toBeLessThanOrEqual(12)
  // With no throw at all, one spark just falls: the further down the later it is, and it rests on the floor.
  const drop = (frame: number): Dot[] => burst({ seed: 1, at, frame, floor: 14, count: 1, speed: 0, life: 40 })
  const ys = [1, 3, 5, 7, 9, 11].map(frame => (drop(frame)[0] as Dot)[1])
  expect(ys).toEqual([...ys].sort((a, b) => a - b))
  expect(ys[0]).toBeGreaterThan(at.y - 1)
  expect(ys.at(-1)).toBeGreaterThan(ys[0] as number)
  expect(lowest(drop(20)), 'it rests on the floor').toBe(14)
  // The colours cool with age.
  const hot = burst({ seed: 2, at, frame: 0, floor: FLOOR, count: 20 })
  expect(hot.every(dot => dot[2] === 'flash')).toBe(true)
  expect(burst({ seed: 2, at, frame: 4, floor: FLOOR, count: 20, colors: [0x123456] }).every(dot => dot[2] === 0x123456)).toBe(true)
})

test('smoke rises and drifts from where it starts, grey, and is gone after its life', async () => {
  const at: Point = { x: 20, y: 18 }
  expect(smoke({ seed: 9, at, frame: -3 })).toEqual([])
  expect(smoke({ seed: 9, at, frame: 40 })).toEqual([])
  const young = smoke({ seed: 9, at, frame: 5, count: 12 })
  const old = smoke({ seed: 9, at, frame: 12, count: 12 })
  expect(young.length).toBeGreaterThan(0)
  expect(highest(old), 'it has risen').toBeLessThan(highest(young))
  expect(highest(old)).toBeLessThan(at.y)
  expect(old.every(dot => dot[2] === 'smoke' || dot[2] === 'smokeDim')).toBe(true)
  expect(same(young, smoke({ seed: 9, at, frame: 5, count: 12 }))).toBe(true)
  expect(same(young, smoke({ seed: 10, at, frame: 5, count: 12 }))).toBe(false)
})

test('a shockwave runs out along the ground from where it starts, both ways, to the stage edges or its own reach', async () => {
  const at: Point = { x: 24, y: FLOOR }
  const wave = (frame: number, reach?: number): Dot[] => shockwave({ at, frame, edges: EDGES, speed: 2, reach })
  expect(wave(-1)).toEqual([])
  const tip = (frame: number): number[] =>
    wave(frame)
      .filter(dot => dot[1] === FLOOR && dot[2] !== 'glow')
      .map(dot => dot[0])
  expect(tip(0)).toEqual([24, 24])
  expect(tip(3).sort((a, b) => a - b)).toEqual([18, 30])
  expect(tip(5).sort((a, b) => a - b)).toEqual([14, 34])
  expect(
    wave(4).some(dot => dot[2] === 'glow'),
    'a glow trails the front',
  ).toBe(true)
  // The left edge is 20 away and the right 19: the wave never leaves the stage, and it is over once both ends are past.
  for (let frame = 0; frame < 16; frame++) expect(wave(frame).every(inside), `frame ${frame}`).toBe(true)
  expect(wave(9).length, 'the right end has met its edge').toBeGreaterThan(0)
  expect(wave(11)).toEqual([])
  expect(wave(3, 4), 'its own reach ends it sooner').toEqual([])
  expect(same(wave(3), wave(3))).toBe(true)
})

test('an aura hugs the mask: it draws around the body, never on it, and licks up off the top', async () => {
  const body: Mask = (x, y) => x >= 20 && x <= 24 && y >= 10 && y <= 17
  const region = { left: 10, right: 34, top: 0, bottom: 19 }
  const halo = (frame: number, size = 2, seed = 5): Dot[] => aura({ seed, frame, region, size })(body)
  const dots = halo(0)
  expect(dots.length).toBeGreaterThan(0)
  expect(
    dots.every(([x, y]) => !body(x, y)),
    'nothing on the body',
  ).toBe(true)
  expect(
    dots.every(([x, y]) => x >= region.left && x <= region.right && y >= region.top && y <= region.bottom),
    'inside the region',
  ).toBe(true)
  const touching = dots.filter(([x, y]) => body(x - 1, y) || body(x + 1, y) || body(x, y - 1) || body(x, y + 1))
  expect(touching.length, 'it clings to the body').toBeGreaterThan(0)
  expect(
    dots.some(([, y]) => y < 10),
    'flames lick up off the top',
  ).toBe(true)
  // Beside and below the body it reaches `size` pixels at most.
  expect(dots.filter(([, y]) => y >= 10).every(([x, y]) => x >= 18 && x <= 26 && y <= 19)).toBe(true)
  expect(same(dots, halo(0))).toBe(true)
  expect(same(dots, halo(1)), 'it flickers from frame to frame').toBe(false)
  expect(same(dots, halo(0, 2, 6)), 'and with the seed').toBe(false)
  expect(
    aura({ seed: 5, frame: 0, region, size: 2 })(() => false),
    'no body, nothing to hug',
  ).toEqual([])
  expect(
    aura({ seed: 5, frame: 0, region, size: 0 })(body).filter(([, y]) => y >= 10),
    'no thickness, no halo',
  ).toEqual([])
  // The colours are the caller's.
  expect(aura({ seed: 5, frame: 0, region, size: 2, colors: [0x111111, 0x222222, 0x333333] })(body).every(dot => typeof dot[2] === 'number')).toBe(true)
})

test('an effect that has not begun draws nothing: a negative frame', async () => {
  const region = { left: 10, right: 34, top: 0, bottom: 19 }
  const body: Mask = (x, y) => x >= 20 && x <= 24 && y >= 10 && y <= 17
  expect(crackle({ seed: 1, at: { x: 5, y: 5 }, frame: -1 })).toEqual([])
  expect(aura({ seed: 1, frame: -1, region, size: 2 })(body)).toEqual([])
  expect(crackle({ seed: 1, at: { x: 5, y: 5 }, frame: 0 }).length).toBe(4)
  expect(aura({ seed: 1, frame: 0, region, size: 2 })(body).length).toBeGreaterThan(0)
})

test('a crackle is a short zigzag of lightning going down from a point, bright at its start', async () => {
  const at: Point = { x: 20, y: 8 }
  const zig = crackle({ seed: 4, at, frame: 2 })
  expect(zig.map(dot => dot[1])).toEqual([8, 9, 10, 11])
  expect(zig[0]).toEqual([20, 8, 'flash'])
  expect(zig.slice(1).every(dot => dot[2] === 'spark')).toBe(true)
  for (const [i, dot] of zig.slice(1).entries()) expect(Math.abs(dot[0] - (zig[i] as Dot)[0]), `step ${i}`).toBe(1)
  expect(same(zig, crackle({ seed: 4, at, frame: 2 }))).toBe(true)
  const shapes = new Set([0, 1, 2, 3, 4, 5].map(frame => crackle({ seed: 4, at, frame }).map(key).join(' ')))
  expect(shapes.size, 'a new shape each frame').toBeGreaterThan(1)
})

test('confetti falls over the stage from its top edge, between the side edges, and lies on the ground; a piece never vanishes while it falls', async () => {
  const fall = (frame: number, count = 24): Dot[] => confetti({ seed: 11, frame, edges: EDGES, count })
  expect(fall(-1)).toEqual([])
  expect(fall(0).length, 'not every piece starts at once').toBeLessThan(24)
  let seen = 0
  for (let frame = 0; frame < 60; frame++) {
    const dots = fall(frame)
    expect(dots.every(inside), `frame ${frame} stays on the stage`).toBe(true)
    // A piece that has begun to fall is drawn in every later frame, so the count only grows.
    expect(dots.length, `frame ${frame}`).toBeGreaterThanOrEqual(seen)
    seen = dots.length
  }
  expect(seen, 'in the end every piece is down').toBe(24)
  const mean = (dots: readonly Dot[]): number => dots.reduce((sum, dot) => sum + dot[1], 0) / dots.length
  expect(mean(fall(14))).toBeGreaterThan(mean(fall(8)))
  expect(
    fall(60).every(dot => dot[1] === FLOOR),
    'on the ground',
  ).toBe(true)
  expect(new Set(fall(30).map(dot => dot[2])).size, 'in several colours').toBeGreaterThan(1)
  expect(same(fall(20), fall(20))).toBe(true)
  expect(same(fall(20), confetti({ seed: 12, frame: 20, edges: EDGES, count: 24 }))).toBe(false)
})

test('a flash lights every pixel of the sky between the stage edges and nothing below the horizon, brighter at level 2', async () => {
  const lit = flash({ edges: EDGES, level: 1 })
  expect(lit.length).toBe((EDGES.right - EDGES.left + 1) * EDGES.ground)
  expect(lit.every(inside)).toBe(true)
  expect(new Set(lit.map(dot => dot[2]))).toEqual(new Set(['skyLit']))
  expect(new Set(flash({ edges: EDGES, level: 2 }).map(dot => dot[2]))).toEqual(new Set(['skyFlash']))
  expect(flash({ edges: EDGES, level: 0 }), 'level 0 is dark').toEqual([])
  expect(new Set(lit.map(key)).size, 'each pixel once').toBe(lit.length)
})
