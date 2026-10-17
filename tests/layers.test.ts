import { expect } from 'claude-code/testing'
import { classic } from '../hooks/sprite/characters/classic'
import { foxkit } from '../hooks/sprite/characters/foxkit'
import { backgroundFrames, cameraFor, composePixels, edgesOf, maskOf, type Pixels, stageFor, stageOf, wholeStage } from '../hooks/sprite/compose'
import { confetti, flash } from '../hooks/sprite/effects'
import { ANIMATIONS, BACKGROUNDS } from '../hooks/sprite/registry'
import type { Animation, Background, Character, Dot, FramePlan, Layers } from '../hooks/sprite/types'
import { BACK_LAYERS, LAYERS } from '../hooks/sprite/types'
import { test } from './world'

// The frame is drawn in layers, back to front: sky, far, ground, character, effects, overlay. These tests read the pure frame, with a foxkit on a stage and
// backgrounds made for the test, whose pictures are single marked pixels so what covers what can be told.

const STAGE = stageOf({ character: foxkit, outfit: {}, background: null })
const GROUND = STAGE.ground
const bare = (character: Character, background: Background | null = null): Layers => ({ character, outfit: {}, background })
const doing = (plan: FramePlan): Animation => ({ needs: [], poses: [], frames: 1, msPerFrame: 100, once: true, hides: [], frame: () => plan })

const at = (pixels: Pixels, x: number, y: number): number | undefined => pixels[y]?.[x]
const draw = (layers: Layers, plan: FramePlan = {}, backgroundFrame = 0): Pixels => composePixels(layers, doing(plan), 0, backgroundFrame)

/** A picture of one marked pixel at stage (x, y), for a layer: sky and far stand on the row above the ground, the ground layer on the ground row. */
const spot = (layer: 'sky' | 'far' | 'ground', x: number, y: number, letter: string): string[] => {
  const rows = (layer === 'ground' ? GROUND : GROUND - 1) - y + 1
  const column = (((x - STAGE.offset.x) % STAGE.width) + STAGE.width) % STAGE.width
  const blank = '.'.repeat(STAGE.width)

  return Array.from({ length: rows }, (_, row) => (row === 0 ? blank.slice(0, column) + letter + blank.slice(column + 1) : blank))
}

const PALETTE = { a: 0x0a0a0a, b: 0x0b0b0b, c: 0x0c0c0c, d: 0x0d0d0d, e: 0x0e0e0e, f: 0x0f0f0f, g: 0x101010, h: 0x111111, i: 0x121212 }

test('the layers are sky, far, ground, character, effects and overlay, back to front, and a background has a picture for the first three', async () => {
  expect(LAYERS).toEqual(['sky', 'far', 'ground', 'character', 'effects', 'overlay'])
  expect(BACK_LAYERS).toEqual(['sky', 'far', 'ground'])
})

test('a frame is drawn back to front: each layer covers the one behind it, its picture first and then the dots put on it', async () => {
  // A pixel in the sky that nothing in the character's body covers.
  const [x, y] = [STAGE.offset.x + 1, 3]
  expect(at(draw(bare(foxkit)), x, y)).toBeUndefined()
  const order: readonly { readonly name: string; readonly color: number; readonly background: Partial<Background>; readonly plan: FramePlan }[] = [
    { name: 'sky picture', color: PALETTE.a, background: { sky: [spot('sky', x, y, 'a')] }, plan: {} },
    { name: 'sky dots', color: PALETTE.b, background: {}, plan: { layers: { sky: [[x, y, PALETTE.b]] } } },
    { name: 'far picture', color: PALETTE.c, background: { far: [spot('far', x, y, 'c')] }, plan: {} },
    { name: 'far dots', color: PALETTE.d, background: {}, plan: { layers: { far: [[x, y, PALETTE.d]] } } },
    { name: 'ground picture', color: PALETTE.e, background: { ground: [spot('ground', x, y, 'e')] }, plan: {} },
    { name: 'ground dots', color: PALETTE.f, background: {}, plan: { layers: { ground: [[x, y, PALETTE.f]] } } },
    { name: 'effect dots', color: PALETTE.g, background: {}, plan: { dots: [[x, y, PALETTE.g]] } },
    { name: 'overlay dots', color: PALETTE.h, background: {}, plan: { layers: { overlay: [[x, y, PALETTE.h]] } } },
  ]
  for (let count = 1; count <= order.length; count++) {
    const used = order.slice(0, count)
    const background: Background = { name: 'test', palette: PALETTE, ...Object.assign({}, ...used.map(one => one.background)) }
    const plan: FramePlan = {
      dots: used.flatMap(one => one.plan.dots ?? []),
      layers: Object.assign({}, ...used.map(one => one.plan.layers)),
    }
    expect(at(draw(bare(foxkit, background), plan), x, y), `up to ${used.at(-1)?.name}`).toBe(used.at(-1)?.color)
  }
})

test('the character is drawn over the sky, far and ground layers and under the effects and the overlay', async () => {
  const stage = stageFor(foxkit)
  const rest = draw(bare(foxkit))
  const mask = maskOf(bare(foxkit), doing({}), 0)
  const body = rest.flatMap((row, y) => [...row].flatMap((color, x) => (color !== undefined && mask(x, y) ? [{ x, y, color }] : [])))
  const { x, y, color } = body[Math.floor(body.length / 2)] ?? { x: 0, y: 0, color: 0 }
  expect(stage.offset.x).toBeLessThanOrEqual(x)
  const behind: Background = {
    name: 'test',
    palette: PALETTE,
    sky: [spot('sky', x, Math.min(y, GROUND - 1), 'a')],
    far: [spot('far', x, Math.min(y, GROUND - 1), 'c')],
  }
  const marks: FramePlan['layers'] = { sky: [[x, y, PALETTE.b]], far: [[x, y, PALETTE.d]], ground: [[x, y, PALETTE.f]] }
  expect(at(draw(bare(foxkit, behind), { layers: marks }), x, y), 'everything behind it is hidden').toBe(color)
  expect(at(draw(bare(foxkit, behind), { layers: marks, dots: [[x, y, PALETTE.g]] }), x, y), 'an effect is in front of it').toBe(PALETTE.g)
  expect(
    at(draw(bare(foxkit, behind), { layers: { ...marks, overlay: [[x, y, PALETTE.h]] }, dots: [[x, y, PALETTE.g]] }), x, y),
    'and the overlay in front of that',
  ).toBe(PALETTE.h)
})

test('a far effect is hidden by the hills in front of it, and shows above them', async () => {
  // Left of the character, so its body is not in the way.
  const x = STAGE.offset.x - 4
  const column = (((x - STAGE.offset.x) % STAGE.width) + STAGE.width) % STAGE.width
  const hillRow = `${'.'.repeat(column)}h${'.'.repeat(STAGE.width - column - 1)}`
  // Hills three pixels high at x, standing on the ground row; a distant tower in the far picture reaches down behind them.
  const background: Background = {
    name: 'hills',
    palette: PALETTE,
    far: [spot('far', x, GROUND - 5, 'c')],
    ground: [[hillRow, hillRow, hillRow, 'g'.repeat(STAGE.width)]],
  }
  const bolt: Dot[] = [GROUND - 1, GROUND - 3, GROUND - 4, GROUND - 5].map(y => [x, y, PALETTE.d])
  const frame = draw(bare(foxkit, background), { layers: { far: bolt } })
  expect(at(frame, x, GROUND - 1), 'the foot of the bolt is behind the hill').toBe(PALETTE.h)
  expect(at(frame, x, GROUND - 3), 'so is its middle').toBe(PALETTE.h)
  expect(at(frame, x, GROUND - 4), 'above the hill it shows').toBe(PALETTE.d)
  expect(at(frame, x, GROUND - 5), 'to its top').toBe(PALETTE.d)
  // The same dots on the effects layer are in front of the hills.
  expect(at(draw(bare(foxkit, background), { dots: bolt }), x, GROUND - 1), 'an effect is not hidden').toBe(PALETTE.d)
})

test('a flash lights the sky layer and nothing else: far, ground, character, effects and overlay stay as they were, and only in its frames', async () => {
  const x = STAGE.offset.x + 1
  const hillRow = 'h'.repeat(STAGE.width)
  const background: Background = {
    name: 'storm',
    palette: PALETTE,
    sky: [spot('sky', x, 4, 'a')],
    far: [spot('far', x + 3, 6, 'c')],
    ground: [[hillRow, 'g'.repeat(STAGE.width)]],
  }
  const edges = edgesOf(STAGE, wholeStage(STAGE))
  const layers = bare(foxkit, background)
  const plan: FramePlan = {
    layers: { far: [[x + 5, 8, PALETTE.d]], ground: [[x + 6, GROUND - 1, PALETTE.f]], overlay: [[x + 7, 9, PALETTE.h]] },
    dots: [[x + 8, 10, PALETTE.g]],
  }
  const calm = draw(layers, plan)
  const lit = draw(layers, { ...plan, layers: { ...plan.layers, sky: flash({ edges, level: 2 }) } })
  // Everything but the sky layer, drawn without it, tells which pixels the flash may not touch.
  const withoutSky = draw(bare(foxkit, { ...background, sky: undefined }), plan)
  let changed = 0
  for (let y = 0; y < STAGE.height; y++) {
    for (let px = 0; px < STAGE.width; px++) {
      if (at(withoutSky, px, y) !== undefined) {
        expect(at(lit, px, y), `${px},${y} belongs to a layer in front of the sky`).toBe(at(withoutSky, px, y))
      } else {
        expect(at(lit, px, y), `${px},${y} is sky`).toBe(y < GROUND ? 0x4a4766 : undefined)
        if (at(lit, px, y) !== at(calm, px, y)) changed += 1
      }
    }
  }
  expect(changed, 'the sky changed').toBeGreaterThan(0)
  // The flash is only in the frames that ask for it.
  const blinking: Animation = { ...doing({}), frames: 3, frame: step => (step === 1 ? { layers: { sky: flash({ edges, level: 2 }) } } : {}) }
  const frames = [0, 1, 2].map(step => composePixels(layers, blinking, step, 0))
  expect(frames[0]).toEqual(composePixels(bare(foxkit, background), doing({}), 0, 0))
  expect(frames[1]).not.toEqual(frames[0])
  expect(frames[2]).toEqual(frames[0])
})

test("confetti and a flash are told the stage's sky top and the camera's side edges: a pane that trims sky only crops them, a wider pane shows more", async () => {
  const stage = stageOf(bare(foxkit))
  const pane = (columns: number, rows: number) => cameraFor(stage, { columns, rows })
  const [narrow, wide, short] = [pane(20, 13), pane(40, 13), pane(20, 7)]
  expect(short.top).toBeGreaterThan(0)
  const confettiOf = (view: typeof narrow) => confetti({ seed: 3, frame: 20, edges: edgesOf(stage, view), count: 12 })
  // Trimming sky leaves the sky top where it is, so the same pieces fall the same way in both.
  expect(edgesOf(stage, short).skyTop).toBe(0)
  expect(confettiOf(short)).toEqual(confettiOf(narrow))
  expect(flash({ edges: edgesOf(stage, short), level: 2 })).toEqual(flash({ edges: edgesOf(stage, narrow), level: 2 }))
  // A wider pane has more sky to light.
  expect(flash({ edges: edgesOf(stage, wide), level: 1 }).length).toBeGreaterThan(flash({ edges: edgesOf(stage, narrow), level: 1 }).length)
  expect(confettiOf(wide)).not.toEqual(confettiOf(narrow))
})

test('a mark on the ground is there only in the frames that draw it: the picture at rest again has none', async () => {
  const [x, y] = [STAGE.offset.x + 2, GROUND - 1]
  const background: Background = { name: 'flat', palette: PALETTE, ground: [['g'.repeat(STAGE.width)]] }
  const layers = bare(foxkit, background)
  const mark: Dot[] = [[x, y, 0x141116]]
  const scorching: Animation = {
    ...doing({}),
    frames: 4,
    frame: step => (step === 1 || step === 2 ? { layers: { ground: mark } } : {}),
  }
  const frames = [0, 1, 2, 3].map(step => composePixels(layers, scorching, step, 0))
  const rest = composePixels(layers, ANIMATIONS.idle, 0, 0)
  expect(at(frames[1] as Pixels, x, y)).toBe(0x141116)
  expect(at(frames[2] as Pixels, x, y)).toBe(0x141116)
  expect(frames[3], 'the last frame is the rest').toEqual(rest)
  expect(frames[0]).toEqual(rest)
  // The mark is on the ground layer: the character stands over it.
  const mask = maskOf(layers, doing({}), 0)
  const foot = rest.flatMap((row, py) => [...row].flatMap((color, px) => (color !== undefined && mask(px, py) ? [{ x: px, y: py, color }] : []))).at(-1)
  if (foot === undefined) throw new Error('no body')
  const over = composePixels(layers, doing({ layers: { ground: [[foot.x, foot.y, 0x141116]] } }), 0, 0)
  expect(at(over, foot.x, foot.y), 'the body is in front of it').toBe(foot.color)
})

test('every layer has frames of its own, cycled by the background frame; a background has as many frames as it takes for all of them to come back', async () => {
  const [x, y] = [STAGE.offset.x + 1, 3]
  const background: Background = {
    name: 'two',
    palette: PALETTE,
    sky: [spot('sky', x, y, 'a'), spot('sky', x, y, 'b')],
    ground: [[...Array.from({ length: 1 }, () => 'c'.repeat(STAGE.width))], ['d'.repeat(STAGE.width)], ['e'.repeat(STAGE.width)]],
  }
  expect(backgroundFrames(background)).toBe(6)
  const seen = [0, 1, 2, 3, 4, 5, 6, 7].map(frame => {
    const pixels = draw(bare(foxkit, background), {}, frame)

    return [at(pixels, x, y), at(pixels, 0, GROUND)]
  })
  expect(seen.map(([sky]) => sky)).toEqual([PALETTE.a, PALETTE.b, PALETTE.a, PALETTE.b, PALETTE.a, PALETTE.b, PALETTE.a, PALETTE.b])
  expect(seen.map(([, ground]) => ground)).toEqual([PALETTE.c, PALETTE.d, PALETTE.e, PALETTE.c, PALETTE.d, PALETTE.e, PALETTE.c, PALETTE.d])
  expect(new Set(seen.slice(0, 6).map(pair => pair.join())).size, 'six distinct pictures before it repeats').toBe(6)
  expect(backgroundFrames(null)).toBe(1)
  expect(backgroundFrames({ name: 'still', palette: {}, ground: [['g']] })).toBe(1)
  expect(backgroundFrames({ name: 'none', palette: {} })).toBe(1)
  expect(backgroundFrames(BACKGROUNDS.dusk ?? null), 'dusk is still').toBe(1)
  expect(backgroundFrames(BACKGROUNDS.twinkle ?? null), 'twinkle moves').toBeGreaterThan(1)
})

test('twinkle changes from frame to frame and comes back to its first after its last', async () => {
  const twinkle = BACKGROUNDS.twinkle
  if (twinkle === undefined) throw new Error('no twinkle')
  const count = backgroundFrames(twinkle)
  const frames = Array.from({ length: count + 1 }, (_, frame) => draw(bare(foxkit, twinkle), {}, frame))
  for (let a = 0; a < count; a++) {
    for (let b = a + 1; b < count; b++) expect(frames[a], `frame ${a} and ${b}`).not.toEqual(frames[b])
  }
  expect(frames[count]).toEqual(frames[0])
})

test('dusk is drawn as it was when a background was one picture: its stars in the sky, its line under the feet, on every character', async () => {
  const dusk = BACKGROUNDS.dusk
  if (dusk === undefined) throw new Error('no dusk')
  // The picture as a background used to be: one grid, its last row on the ground.
  const OLD = [
    '..................',
    '...............s..',
    '..................',
    '..................',
    '..s...............',
    ...Array.from({ length: 10 }, () => '..................'),
    'gggggggggggggggggg',
  ]
  for (const character of [foxkit, classic]) {
    const stage = stageFor(character, dusk.heightCap)
    const front = composePixels(bare(character), doing({}), 0, 0)
    const behind = composePixels(bare(character, dusk), doing({}), 0, 0)
    for (let y = 0; y < stage.height; y++) {
      const row = OLD[Math.min(y - stage.ground + OLD.length - 1, OLD.length - 1)]
      for (let x = 0; x < stage.width; x++) {
        const from = (((x - stage.offset.x) % 18) + 18) % 18
        const old = row === undefined ? undefined : dusk.palette[row[from] ?? '.']
        expect(behind[y]?.[x], `${character.name} at ${x},${y}`).toBe(front[y]?.[x] ?? old)
      }
    }
  }
})
