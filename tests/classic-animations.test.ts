import { expect } from 'claude-code/testing'
import { classic } from '../hooks/sprite/characters/classic'
import { foxkit } from '../hooks/sprite/characters/foxkit'
import { ANIMATIONS } from '../hooks/sprite/registry'
import type { Animation, Dot, Edges, Facing } from '../hooks/sprite/types'
import { BURNS, beatsOf, beatsRefusal, framesForBeats, HITS, LANDS, LEAVES } from '../hooks/strike'
import { test } from './world'

// The classic's own animations (ticket 24), at the pure level: the storm for a finished ticket, the jump for a finished set and the power-up, drawn after the motion prototype (variant C).
// Only the classic's moveset names them; the foxkit keeps its zap and its cheer.

const ANCHORS = classic.anchors
/** The stage as the classic's own pixels see it: the ground under its feet, the camera's columns 0 to 39. */
const EDGES: Edges = { skyTop: 0, ground: ANCHORS.feet.y + 1, left: 0, right: 39 }
/** A camera wide enough for the strike to be fourteen pixels either side of the paw. */
const WIDE: Edges = { ...EDGES, left: -40, right: 79 }
const planOf = (animation: Animation, step: number, facing: Facing = 'right', edges: Edges = EDGES) => animation.frame(step, ANCHORS, edges, facing)

test("the storm declares the strike's beats, which fit its length: the streak leaves at 4, the bolt lands at 8, the row flashes at 9 and burns from 10", async () => {
  const { thunder } = ANIMATIONS
  expect(thunder.frames).toBe(44)
  expect(thunder.msPerFrame).toBe(80)
  expect(thunder.strikeAt).toEqual({ leaves: 4, lands: 8 })
  expect(beatsOf(thunder)).toEqual({ leaves: 4, lands: 8, hits: 9, burns: 10 })
  expect(thunder.frames).toBeGreaterThanOrEqual(framesForBeats(beatsOf(thunder)))
  // An animation that declares none has the strike's own beats, which are the zap's.
  expect(beatsOf(ANIMATIONS.zap)).toEqual({ leaves: LEAVES, lands: LANDS, hits: HITS, burns: BURNS })
  expect(beatsRefusal(thunder)).toBeUndefined()
})

test('beats that cannot be kept in step with are refused: out of order, not whole, or with no room before the end', async () => {
  expect(beatsRefusal({ frames: 44, strikeAt: { leaves: 8, lands: 4 } })).toContain('and before it lands')
  expect(beatsRefusal({ frames: 44, strikeAt: { leaves: 1, lands: 8 } })).toContain('after the charge')
  expect(beatsRefusal({ frames: 44, strikeAt: { leaves: 2, lands: 8 } })).toBeUndefined()
  expect(beatsRefusal({ frames: 44, strikeAt: { leaves: 2, lands: 2 } })).toContain('leaves 2 and lands 2')
  expect(beatsRefusal({ frames: 44, strikeAt: { leaves: 1.5, lands: 3 } })).toContain('whole steps')
  expect(beatsRefusal({ frames: 11, strikeAt: { leaves: 4, lands: 8 } })).toBe('has 11 frames, and the strike beats it declares need at least 12')
  expect(beatsRefusal({ frames: 12, strikeAt: { leaves: 4, lands: 8 } })).toBeUndefined()
  expect(beatsRefusal({ frames: 1 })).toBeUndefined()
})

test('the storm: a streak climbs from the raised paw at the step the bolt leaves, and a leader comes down before the bolt cracks into the ground', async () => {
  const { reach } = ANCHORS
  if (reach === undefined) throw new Error('no reach')
  const { thunder } = ANIMATIONS
  // At the step the bolt leaves there is a bright streak over the raised paw, four pixels long and starting with a flash.
  const streak = planOf(thunder, beatsOf(thunder).leaves).dots ?? []
  expect(streak.some(([x, y, role]) => x === reach.x && y < reach.y - 1 && role === 'flash')).toBe(true)
  // It climbs six rows a step (the first step is lifted a row by the stretch) toward the top of the stage (the classic stands lower on the real one: ten rows down here), and what climbs off the top is cut.
  const low = Object.fromEntries(
    Object.entries(ANCHORS).map(([name, anchor]) => [
      name,
      'x' in anchor ? { ...anchor, y: anchor.y + 10 } : anchor.map(point => ({ ...point, y: point.y + 10 })),
    ]),
  ) as unknown as typeof ANCHORS
  const lowEdges = { ...EDGES, ground: EDGES.ground + 10 }
  const head = (step: number): number => Math.min(...(thunder.frame(step, low, lowEdges, 'right').dots ?? []).map(dot => dot[1]))
  expect(head(5), 'five on the first step, as the stretch of that step lets go').toBe(head(4) - 5)
  expect(head(6)).toBe(head(5) - 6)
  expect(head(7)).toBe(lowEdges.skyTop)
  // The leader (step 7) is a faint bolt from the top of the stage with the bright dot at its head, and no glow of the bolt to come.
  const leader = planOf(thunder, 7).dots ?? []
  expect(leader.some(dot => dot[1] === EDGES.skyTop && dot[2] === 'flash')).toBe(true)
  expect(leader.every(dot => dot[2] === 'flash' || dot[2] === 'glowDim')).toBe(true)
})

test('the storm: the bolt cracks the whole way down from the top of the stage to the ground ahead in one step, with the sky flashing and the ground lit', async () => {
  const { thunder } = ANIMATIONS
  const { skyTop, ground } = EDGES
  const crack = planOf(thunder, 8)
  const rows = new Set((crack.dots ?? []).filter(dot => dot[2] === 'flash').map(dot => dot[1]))
  for (let y = skyTop; y < ground; y++) expect(rows.has(y), `row ${y}`).toBe(true)
  // The ground flash along the row at its foot, and the sky lit brighter than for the glow after.
  expect((crack.dots ?? []).filter(dot => dot[1] === ground && dot[2] === 'flash').length).toBeGreaterThanOrEqual(9)
  expect(new Set((crack.layers?.sky ?? []).map(dot => dot[2]))).toEqual(new Set(['skyFlash']))
  expect(new Set((planOf(thunder, 9).layers?.sky ?? []).map(dot => dot[2]))).toEqual(new Set(['skyLit']))
  // Not before, and not as a whole bolt afterwards.
  expect(planOf(thunder, 7).layers?.sky ?? []).toEqual([])
  const wholeAt = (step: number): boolean => {
    const lit = new Set((planOf(thunder, step).dots ?? []).filter(dot => dot[2] === 'flash' || dot[2] === 'spark').map(dot => dot[1]))

    return Array.from({ length: ground - skyTop }, (_, row) => skyTop + row).every(y => lit.has(y))
  }
  expect(wholeAt(8)).toBe(true)
  expect(wholeAt(7)).toBe(false)
  expect(wholeAt(11)).toBe(false)
  // The aftershock lands later, with its own flash of the sky.
  expect(planOf(thunder, 12).layers?.sky?.length).toBeGreaterThan(0)
  expect(planOf(thunder, 11).layers?.sky ?? []).toEqual([])
})

test('the storm strikes the ground ahead of the paw the way the sidekick faces, held to the camera, and the ground is scorched there with embers', async () => {
  const { reach } = ANCHORS
  if (reach === undefined) throw new Error('no reach')
  const { thunder } = ANIMATIONS
  const strikeOf = (facing: Facing, edges: Edges): number => {
    const marks = (thunder.frame(20, ANCHORS, edges, facing).layers?.ground ?? []).filter(dot => dot[2] === 'scorch' && dot[1] === edges.ground)
    // The aftershock's scorch is the narrower; the strike's is five pixels wide.
    const xs = marks.map(dot => dot[0]).sort((a, b) => a - b)
    const first = xs.findIndex((x, at) => xs[at + 4] === x + 4)

    return (xs[first] ?? 0) + 2
  }
  expect(strikeOf('right', WIDE)).toBe(reach.x + 14)
  expect(strikeOf('left', WIDE)).toBe(reach.x - 14)
  // A narrow camera brings it closer, short of its edge but never behind the paw.
  const narrow = { ...EDGES, left: 0, right: reach.x + 6 }
  expect(strikeOf('right', narrow)).toBeGreaterThan(reach.x)
  expect(strikeOf('right', narrow)).toBeLessThanOrEqual(narrow.right - 2)
  // With the paw at the camera's edge the strike stays in view: it is held to the edges at last, however close.
  for (const [facing, edges] of [
    ['right', { ...EDGES, left: 0, right: reach.x }],
    ['left', { ...EDGES, left: reach.x, right: 79 }],
  ] as const) {
    const scorch = (thunder.frame(20, ANCHORS, edges, facing).layers?.ground ?? []).filter(dot => dot[2] === 'scorch')
    // The strike's own scorch is five wide, centred on the edge: three of its pixels are in view (the aftershock's are further in).
    const near = scorch.filter(dot => (facing === 'right' ? dot[0] >= edges.right - 2 : dot[0] <= edges.left + 2))
    expect(near.length, `${facing} strike at the edge`).toBe(3)
  }
  const embers = (planOf(thunder, 9).layers?.ground ?? []).filter(dot => dot[2] === 'ember' || dot[2] === 'coal')
  expect(embers.length).toBeGreaterThan(0)
  // Further on the scorch is still there and the embers have died down.
  const late = planOf(thunder, 43).layers?.ground ?? []
  expect(late.filter(dot => dot[2] === 'scorch').length).toBeGreaterThan(0)
  expect(late.filter(dot => dot[2] === 'ember' || dot[2] === 'coal').length).toBeLessThan(embers.length)
})

test('the storm: a shockwave runs along the ground and reaches the feet as the sidekick leaves the ground to hop over it', async () => {
  const { thunder } = ANIMATIONS
  const { feet } = ANCHORS
  const { ground } = EDGES
  for (const facing of ['right', 'left'] as const) {
    const wave = (step: number): Dot[] =>
      (planOf(thunder, step, facing, WIDE).dots ?? []).filter(dot => dot[1] === ground && (dot[2] === 'flash' || dot[2] === 'spark' || dot[2] === 'glow'))
    expect(
      wave(16).some(dot => dot[0] === feet.x),
      `${facing} not yet`,
    ).toBe(false)
    expect(
      wave(17).some(dot => dot[0] === feet.x),
      `${facing} at the feet as the hop begins`,
    ).toBe(true)
  }
  // The hop: arms up, up and down by the prototype's plan, squashed to leave the ground and to land.
  const hops = Array.from({ length: 6 }, (_, at) => planOf(thunder, 17 + at))
  expect(hops.map(plan => plan.dy)).toEqual([-1, -3, -4, -3, -1, 0])
  expect(hops.map(plan => plan.squash)).toEqual([-1, 0, 0, 0, 0, 1])
  expect(hops.every(plan => plan.poses?.includes('armsUp'))).toBe(true)
  expect(planOf(thunder, 16).dy).toBe(0)
  expect(planOf(thunder, 23).dy).toBe(0)
})

test('the storm: the check mark rises over the crater from the end of the hop, in front of everything, and stays to the last frame', async () => {
  const { thunder } = ANIMATIONS
  for (let step = 0; step < 23; step++) expect(planOf(thunder, step).layers?.overlay ?? [], `step ${step}`).toEqual([])
  const mark = (step: number): Dot[] => (planOf(thunder, step).layers?.overlay ?? []).filter(dot => dot[2] === 'check')
  expect(mark(23).length).toBe(7)
  const topOf = (step: number): number => Math.min(...mark(step).map(dot => dot[1]))
  expect(topOf(23) - topOf(27), 'it rises four rows').toBe(4)
  expect(topOf(27)).toBe(topOf(43))
  // The last frame is the check mark and the scorch on the ground, nothing among the effects.
  expect(planOf(thunder, 43).dots ?? []).toEqual([])
})

test('the storm hides the held slot, needs only the cheeks and the raised paw, and draws only inside the camera, however narrow', async () => {
  const { thunder } = ANIMATIONS
  expect(thunder.hides).toEqual(['held'])
  expect([...thunder.needs].sort()).toEqual(['cheeks', 'reach'])
  for (const edges of [EDGES, { ...EDGES, left: 5, right: ANCHORS.boltFrom?.x ?? 14 }]) {
    for (let step = 0; step < thunder.frames; step++) {
      const plan = thunder.frame(step, ANCHORS, edges, 'right')
      for (const [x, y] of [...(plan.dots ?? []), ...(plan.layers?.ground ?? []), ...(plan.layers?.overlay ?? [])]) {
        expect(x >= edges.left && x <= edges.right && y >= edges.skyTop && y <= edges.ground, `step ${step} at ${x},${y}`).toBe(true)
      }
    }
  }
})

test('it is the classic that plays the storm, the jump and the power-up; the foxkit keeps its zap and its cheer', async () => {
  expect(classic.moveset).toMatchObject({ 'ticket-done': 'thunder', 'set-done': 'jump', 'last-started': 'powerUp' })
  expect(foxkit.moveset).toMatchObject({ 'ticket-done': 'zap', 'set-done': 'cheer' })
  expect(foxkit.moveset?.['last-started']).toBeUndefined()
})

test('the jump crouches, jumps with both arms up and spins at the top, hops once more and lands, as the prototype plans it', async () => {
  const { jump } = ANIMATIONS
  expect(jump.frames).toBe(30)
  expect(jump.msPerFrame).toBe(85)
  const plans = Array.from({ length: jump.frames }, (_, step) => planOf(jump, step))
  expect(plans.slice(0, 20).map(plan => [plan.dy, plan.squash])).toEqual([
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
  ])
  // It stands from then on.
  for (const plan of plans.slice(20)) expect([plan.dy, plan.squash]).toEqual([0, 0])
  // Spins (mirrors) for the two steps at the top of the first jump, and only then.
  expect(plans.flatMap((plan, step) => (plan.mirror === true ? [step] : []))).toEqual([5, 6])
  // Arms and ears up from the jump until it lands.
  expect(plans.flatMap((plan, step) => ((plan.poses ?? []).length > 0 ? [step] : []))).toEqual(Array.from({ length: 17 }, (_, at) => at + 2))
  expect(plans[10]?.poses).toEqual(['armsUp', 'earsUp'])
  expect(jump.hides).toEqual(['held'])
  expect(jump.needs).toEqual([])
})

test('the jump bursts a star of sparks above the head at the top of the jump and lets confetti fall from the sky over the whole stage', async () => {
  const { jump } = ANIMATIONS
  const { head } = ANCHORS
  const dotsAt = (step: number): Dot[] => [...(planOf(jump, step).dots ?? [])]
  const star = (step: number): Dot[] => dotsAt(step).filter(dot => dot[2] === 'flash' || dot[2] === 'base' || dot[2] === 'spark')
  expect(star(3)).toEqual([])
  for (const step of [4, 5, 6]) expect(star(step).length, `step ${step}`).toBeGreaterThan(0)
  // It starts above the head; none comes after the burst is over.
  expect(star(5).every(dot => dot[1] < head.y)).toBe(true)
  expect(star(12)).toEqual([])
  // Confetti is in colours of its own, between the camera's edges, and has begun by the time the jump starts.
  const confetti = (step: number): Dot[] => dotsAt(step).filter(dot => typeof dot[2] === 'number')
  expect(confetti(1)).toEqual([])
  expect(confetti(8).length).toBeGreaterThan(0)
  expect(confetti(29).length).toBeGreaterThan(0)
  for (const [x, y] of [...confetti(20), ...confetti(29)]) {
    expect(x >= EDGES.left && x <= EDGES.right && y >= EDGES.skyTop && y < EDGES.ground).toBe(true)
  }
  // Nothing is drawn above the sky top, however high the burst climbs.
  for (let step = 0; step < jump.frames; step++) for (const [, y] of dotsAt(step)) expect(y).toBeGreaterThanOrEqual(EDGES.skyTop)
})

test('the power-up charges, shakes, is struck and turns gold, holds, and powers down, in the phases of the prototype', async () => {
  const { powerUp } = ANIMATIONS
  expect(powerUp.frames).toBe(40)
  expect(powerUp.msPerFrame).toBe(80)
  expect(powerUp.once).toBe(true)
  const plans = Array.from({ length: powerUp.frames }, (_, step) => planOf(powerUp, step))
  // Charge: crouching with the eyes shut, no colour.
  for (const step of [0, 1, 2, 3, 4, 5]) {
    expect(plans[step]?.squash, `charge ${step}`).toBe(1)
    expect(plans[step]?.poses, `charge ${step}`).toEqual(['blink'])
    expect(plans[step]?.recolor, `charge ${step}`).toBeUndefined()
  }
  // Rise: shaking a pixel either way, half gold from step 9.
  expect(plans.slice(6, 12).map(plan => plan.dx)).toEqual([-1, 1, -1, 1, -1, 1])
  expect(plans[8]?.recolor).toBeUndefined()
  expect(plans[9]?.recolor).toEqual({ base: 0xffe680, outline: 0xc98a10, cheek: 0xff7a5c })
  // The bolt strikes: stretched, arms up and spiky, gold with glowing eyes; then the hold.
  for (const step of [12, 13, 14, 20, 33]) {
    expect(plans[step]?.poses?.includes('spiky'), `spiky ${step}`).toBe(true)
    expect(plans[step]?.recolor?.eye, `eyes ${step}`).toBe(0x2bd9ff)
  }
  expect(plans[12]?.squash).toBe(-1)
  expect(plans[12]?.poses).toContain('armsUp')
  expect(plans[20]?.squash).toBe(0)
  // Power down: half gold, then plain, and the spikes are gone.
  expect(plans[34]?.recolor).toEqual(plans[9]?.recolor)
  expect(plans[36]?.recolor).toBeUndefined()
  expect(plans[39]?.poses).toEqual([])
  expect(powerUp.hides).toEqual(['held'])
})

test('the power-up is struck by a bolt from the sky at the step of the transformation, with the sky flashing, and not at any other', async () => {
  const { powerUp } = ANIMATIONS
  // The bolt is the only thing with a glow, and it runs from the top of the stage.
  const reachesSky = (step: number): boolean =>
    (planOf(powerUp, step).dots ?? []).some(dot => dot[1] === EDGES.skyTop && (dot[2] === 'glow' || dot[2] === 'glowDim'))
  expect(Array.from({ length: powerUp.frames }, (_, step) => step).filter(reachesSky)).toEqual([12, 13])
  expect(new Set((planOf(powerUp, 12).layers?.sky ?? []).map(dot => dot[2]))).toEqual(new Set(['skyFlash']))
  expect(new Set((planOf(powerUp, 13).layers?.sky ?? []).map(dot => dot[2]))).toEqual(new Set(['skyLit']))
  expect(planOf(powerUp, 14).layers?.sky ?? []).toEqual([])
})

test('the power-up lifts pebbles off the ground while it holds and drops them when it powers down, and cracks the ground from the burst on', async () => {
  const { powerUp } = ANIMATIONS
  const { feet } = ANCHORS
  const pebbles = (step: number): Dot[] => (planOf(powerUp, step).layers?.ground ?? []).filter(dot => dot[2] === 'dust' || dot[2] === 'smokeDim')
  const height = (step: number): number => Math.max(...pebbles(step).map(dot => feet.y - dot[1]))
  expect(height(0)).toBeLessThanOrEqual(1)
  expect(height(20)).toBeGreaterThanOrEqual(3)
  expect(height(39)).toBeLessThanOrEqual(1)
  expect(height(11)).toBeGreaterThan(height(6))
  const cracks = (step: number): Dot[] => (planOf(powerUp, step).layers?.ground ?? []).filter(dot => dot[2] === 'scorch')
  expect(cracks(11)).toEqual([])
  expect(cracks(12).length).toBeGreaterThan(0)
  expect(cracks(20).length).toBeGreaterThan(cracks(12).length)
  expect(cracks(20).every(dot => dot[1] === EDGES.ground)).toBe(true)
})

test('the power-up wraps the body in an aura, aimed by the mask: it grows with the power and is never drawn on the body', async () => {
  const { powerUp } = ANIMATIONS
  // A block for a body, in stage pixels, around the classic's.
  const body = { left: 0, right: 10, top: 3, bottom: 14 }
  const mask = (x: number, y: number): boolean => x >= body.left && x <= body.right && y >= body.top && y <= body.bottom
  const aura = (step: number): readonly Dot[] => planOf(powerUp, step).aimed?.(mask) ?? []
  expect(planOf(powerUp, 0).aimed, 'no aura at the first step of the charge').toBeUndefined()
  expect(planOf(powerUp, 1).aimed).toBeDefined()
  expect(planOf(powerUp, 39).aimed, 'gone at the end').toBeUndefined()
  expect(aura(8).length).toBeGreaterThan(0)
  expect(aura(20).length).toBeGreaterThan(aura(8).length)
  for (const step of [1, 8, 12, 20, 35])
    expect(
      aura(step).every(([x, y]) => !mask(x, y)),
      `step ${step}`,
    ).toBe(true)
  // It licks up off the top of the body.
  expect(aura(20).some(([, y]) => y < body.top)).toBe(true)
  // The same step draws the same aura.
  expect(aura(20)).toEqual(aura(20))
})
