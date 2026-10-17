import { expect } from 'claude-code/testing'
import { classic } from '../hooks/sprite/characters/classic'
import { foxkit } from '../hooks/sprite/characters/foxkit'
import { composePixels, defineCharacter, maskOf, type Pixels, stageFor } from '../hooks/sprite/compose'
import { ACCESSORIES } from '../hooks/sprite/registry'
import type { Accessory, Animation, Character, FramePlan, Layers } from '../hooks/sprite/types'
import { test } from './world'

// A frame can move the whole character, turn it, squash or stretch it and recolour its body, and the pixels it covers are its mask. These tests read
// the pure frame: the pixels one plan draws, for the classic and for a character made only for the test, whose every row is a different letter so a moved row can be told.

/** Six rows, each its own letter and its own body role; the rows are uneven so a mirror shows. The feet are on the last row. */
const stub = defineCharacter({
  name: 'stub',
  body: ['..hh..', '.aaa..', 'bbbbb.', 'cccccc', 'dddddd', 'ff.f..'],
  legend: { h: 'highlight', a: 'base', b: 'shade', c: 'cheek', d: 'eye', f: 'outline' },
  palette: { highlight: 0x010101, base: 0x020202, shade: 0x030303, cheek: 0x040404, eye: 0x050505, outline: 0x060606 },
  anchors: { head: { x: 2, y: 0 }, neck: { x: 2, y: 2 }, held: { x: 4, y: 5 }, feet: { x: 1, y: 5 } },
  headRegion: { left: 0, top: 0, right: 5, bottom: 1 },
  bobs: { head: true, neck: false, held: false },
})

const LETTERS: Readonly<Record<number, string>> = {
  65793: 'h',
  131586: 'a',
  197379: 'b',
  263172: 'c',
  328965: 'd',
  394758: 'f',
  16711935: 'X',
  65535: 'Y',
  65280: 'G',
}

const dot = (slot: 'head' | 'held', color: number): Accessory => ({ name: `${slot}-dot`, slot, pixels: ['x'], origin: { x: 0, y: 0 }, palette: { x: color } })
const pair: Accessory = { name: 'pair', slot: 'neck', pixels: ['xy'], origin: { x: 0, y: 0 }, palette: { x: 0xff00ff, y: 0x00ffff } }

const bare = (character: Character): Layers => ({ character, outfit: {}, background: null })
const dressed: Layers = { character: stub, outfit: { head: dot('head', 0xff00ff), held: dot('held', 0x00ff00) }, background: null }

/** An animation whose only frame is `plan`. */
const doing = (plan: FramePlan): Animation => ({ needs: [], poses: [], frames: 1, msPerFrame: 100, once: true, hides: [], frame: () => plan })
const REST = doing({})

/** Every opaque pixel as "x,y" mapped to its colour. */
const colorsOf = (pixels: Pixels): Map<string, number> => {
  const colors = new Map<string, number>()
  for (const [y, row] of pixels.entries()) {
    for (const [x, color] of [...row].entries()) if (color !== undefined) colors.set(`${x},${y}`, color)
  }

  return colors
}

const frame = (layers: Layers, plan: FramePlan): Map<string, number> => colorsOf(composePixels(layers, doing(plan), 0))

/** Rows y -2 to 6 and columns -1 to 6 of the stub's own pixels, as letters, '.' where nothing is drawn. */
const shown = (layers: Layers, plan: FramePlan): string[] => {
  const { offset } = stageFor(layers.character)
  const pixels = composePixels(layers, doing(plan), 0)

  return Array.from({ length: 9 }, (_, row) =>
    Array.from({ length: 8 }, (_, column) => {
      const color = pixels[row - 2 + offset.y]?.[column - 1 + offset.x]
      return color === undefined ? '.' : (LETTERS[color] ?? '#')
    }).join(''),
  )
}

const moveBy = (colors: Map<string, number>, by: (x: number, y: number) => [number, number]): Map<string, number> =>
  new Map([...colors].map(([at, color]) => [by(...(at.split(',').map(Number) as [number, number])).join(','), color]))

const REST_ROWS = ['........', '........', '...hh...', '..aaa...', '.bbbbb..', '.cccccc.', '.dddddd.', '.ff.f...', '........']

test('a frame with dx and dy draws the whole character, accessories included, moved by that many pixels', async () => {
  expect(shown(bare(stub), {})).toEqual(REST_ROWS)
  for (const layers of [
    dressed,
    bare(classic),
    { character: classic, outfit: { head: ACCESSORIES.cap, face: ACCESSORIES.glasses, neck: ACCESSORIES.scarf, held: ACCESSORIES.flag }, background: null },
  ]) {
    const rest = frame(layers, {})
    for (const [dx, dy] of [
      [2, 0],
      [-3, 1],
      [1, -2],
    ] as const) {
      expect(frame(layers, { dx, dy }), `${layers.character.name} by ${dx},${dy}`).toEqual(moveBy(rest, (x, y) => [x + dx, y + dy]))
    }
  }
  // The accessory itself moved, not only the body.
  const at = (colors: Map<string, number>, color: number): string[] => [...colors].filter(([, c]) => c === color).map(([where]) => where)
  const { offset } = stageFor(stub)
  expect(at(frame(dressed, { dx: 2, dy: 1 }), 0xff00ff)).toEqual([`${2 + offset.x + 2},${0 + offset.y + 1}`])
})

test('a mirrored frame draws the character facing the other way, accessories and their anchors turned with it', async () => {
  expect(shown(bare(stub), { mirror: true })).toEqual([
    '........',
    '........',
    '...hh...',
    '...aaa..',
    '..bbbbb.',
    '.cccccc.',
    '.dddddd.',
    '...f.ff.',
    '........',
  ])
  // A two-pixel accessory on the neck anchor: the anchor turns, and the pixels turn about it, so the pair reads the other way round.
  const worn: Layers = { character: stub, outfit: { neck: pair }, background: null }
  expect(shown(worn, {})[4]).toBe('.bbXYb..')
  expect(shown(worn, { mirror: true })[4]).toBe('..bYXbb.')
  // The whole frame is the rest frame flipped about the middle of the character's frame, colours kept.
  for (const layers of [
    worn,
    dressed,
    bare(classic),
    bare(foxkit),
    { character: foxkit, outfit: { head: ACCESSORIES.cap, face: ACCESSORIES.glasses, neck: ACCESSORIES.scarf }, background: null },
  ]) {
    const flip = (x: number, y: number): [number, number] => {
      const { frame: own } = stageFor(layers.character)
      return [own.left + own.right - x, y]
    }
    expect(frame(layers, { mirror: true }), layers.character.name).toEqual(moveBy(frame(layers, {}), flip))
    expect(frame(layers, { mirror: true, bob: 1, dx: 2 }), `${layers.character.name} bobbing and moved`).toEqual(
      moveBy(frame(layers, { bob: 1 }), (x, y) => [flip(x, y)[0] + 2, y]),
    )
  }
})

test('squash takes a row out just above the feet and stretch repeats one, the feet staying on the same row both times', async () => {
  expect(shown(bare(stub), { squash: 1 })).toEqual(['........', '........', '........', '...hh...', '..aaa...', '.bbbbb..', '.cccccc.', '.ff.f...', '........'])
  expect(shown(bare(stub), { squash: -1 })).toEqual([
    '........',
    '...hh...',
    '..aaa...',
    '.bbbbb..',
    '.cccccc.',
    '.dddddd.',
    '.dddddd.',
    '.ff.f...',
    '........',
  ])
  // Two rows at once, and no more rows than there are above the feet.
  expect(shown(bare(stub), { squash: 2 })).toEqual(['........', '........', '........', '........', '...hh...', '..aaa...', '.bbbbb..', '.ff.f...', '........'])
  expect(shown(bare(stub), { squash: 99 })).toEqual([
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '.ff.f...',
    '........',
  ])
  for (const character of [classic, foxkit, stub]) {
    const rest = composePixels(bare(character), REST, 0)
    const rowsOf = (pixels: Pixels): number[] => pixels.flatMap((row, y) => ([...row].some(color => color !== undefined) ? [y] : []))
    const { offset } = stageFor(character)
    const footRow = offset.y + character.anchors.feet.y
    for (const squash of [1, -1]) {
      const squashed = composePixels(bare(character), doing({ squash }), 0)
      const before = rowsOf(rest)
      const after = rowsOf(squashed)
      expect(after.length, `${character.name} ${squash}`).toBe(before.length - squash)
      expect(squashed[footRow], `${character.name} feet row, squash ${squash}`).toEqual(rest[footRow])
      expect(after.at(-1)).toBe(before.at(-1))
      expect(after[0], `${character.name} top, squash ${squash}`).toBe((before[0] ?? 0) + squash)
    }
  }
})

test('accessories squash, stretch and move with the body, except one on the feet row, which stays on the ground', async () => {
  const at = (colors: Map<string, number>, color: number): string[] => [...colors].filter(([, c]) => c === color).map(([where]) => where)
  const { offset } = stageFor(stub)
  const head = (dx: number, dy: number): string => `${2 + offset.x + dx},${offset.y + dy}`
  const held = (dx: number, dy: number): string => `${4 + offset.x + dx},${5 + offset.y + dy}`
  expect(at(frame(dressed, {}), 0xff00ff)).toEqual([head(0, 0)])
  expect(at(frame(dressed, { squash: 1 }), 0xff00ff)).toEqual([head(0, 1)])
  expect(at(frame(dressed, { squash: -1 }), 0xff00ff)).toEqual([head(0, -1)])
  expect(at(frame(dressed, { squash: 1, dx: 1, dy: -1 }), 0xff00ff)).toEqual([head(1, 0)])
  expect(at(frame(dressed, { squash: 1, bob: 1 }), 0xff00ff)).toEqual([head(0, 2)])
  expect(at(frame(dressed, { mirror: true }), 0xff00ff)).toEqual([head(1, 0)])
  for (const squash of [1, -1]) expect(at(frame(dressed, { squash }), 0x00ff00), `held, squash ${squash}`).toEqual([held(0, 0)])
  expect(at(frame(dressed, { mirror: true }), 0x00ff00)).toEqual([held(-3, 0)])
  // The classic's cap rides down with its head.
  const capped: Layers = { character: classic, outfit: { head: ACCESSORIES.cap }, background: null }
  const capOnly = (plan: FramePlan): string[] => {
    const worn = frame(capped, plan)
    const none = frame(bare(classic), plan)
    return [...worn].filter(([where, color]) => none.get(where) !== color).map(([where]) => where)
  }
  expect(capOnly({ squash: 1 })).toEqual(capOnly({}).map(where => where.replace(/,(\d+)$/, (_, y) => `,${Number(y) + 1}`)))
})

test('a recolour changes only the named body roles for that frame, and the next frame is back to the palette', async () => {
  const gold = { shade: 0xabcdef, eye: 0xfedcba }
  const rest = frame(bare(stub), {})
  const recoloured = frame(bare(stub), { recolor: gold })
  expect([...recoloured.keys()]).toEqual([...rest.keys()])
  for (const [where, color] of rest) {
    const role = color === 0x030303 ? 'shade' : color === 0x050505 ? 'eye' : undefined
    expect(recoloured.get(where), where).toBe(role === undefined ? color : gold[role])
  }
  // A role a frame does not name keeps the palette, and so does the frame after a recoloured one.
  const twoFrames: Animation = { ...REST, frames: 2, frame: step => (step === 0 ? { recolor: gold } : {}) }
  expect(colorsOf(composePixels(bare(stub), twoFrames, 1))).toEqual(rest)
  expect(colorsOf(composePixels(bare(stub), twoFrames, 0))).toEqual(recoloured)
  // A dot in a body role takes the frame's colour too.
  expect(frame(bare(stub), { recolor: gold, dots: [[0, 0, 'shade']] }).get('0,0')).toBe(0xabcdef)
})

const FULL: readonly Layers[] = [
  dressed,
  { character: stub, outfit: { neck: pair }, background: null },
  { character: classic, outfit: { head: ACCESSORIES.cap, face: ACCESSORIES.glasses, neck: ACCESSORIES.scarf, held: ACCESSORIES.flag }, background: null },
  { character: foxkit, outfit: { head: ACCESSORIES.cap, face: ACCESSORIES.glasses, neck: ACCESSORIES.scarf, held: ACCESSORIES.flag }, background: null },
]
const PLANS: readonly FramePlan[] = [
  {},
  { dx: 3, dy: -2 },
  { mirror: true },
  { squash: 1 },
  { squash: -1 },
  { bob: 1, squash: 1, mirror: true, dx: -2 },
  { poses: ['blink'] },
]

test('the mask of a frame is exactly the pixels the character covers in it, props and effects left out', async () => {
  for (const layers of FULL) {
    const { width, height } = stageFor(layers.character)
    for (const plan of PLANS) {
      const withDots = { ...plan, dots: [[3, 3, 'spark'] as const, [10, 12, 'flash'] as const] }
      const covered = frame(layers, plan)
      const mask = maskOf(layers, doing(withDots), 0)
      const seen = new Set<string>()
      for (let y = -1; y <= height; y++) {
        for (let x = -1; x <= width; x++) if (mask(x, y)) seen.add(`${x},${y}`)
      }
      expect([...seen].sort(), `${layers.character.name} ${JSON.stringify(plan)}`).toEqual([...covered.keys()].sort())
    }
  }
  expect(maskOf(dressed, REST, 0)(-1, -1)).toBe(false)
})

test('an effect can aim by the mask: the plan is given it once the body is drawn, and what it returns is drawn with the dots', async () => {
  const { offset } = stageFor(stub)
  const aura = (mask: (x: number, y: number) => boolean) => {
    const dots: [number, number, 'spark'][] = []
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 40; x++) if (!mask(x, y) && mask(x, y + 1)) dots.push([x, y, 'spark'])
    }
    return dots
  }
  for (const plan of [{}, { dy: 2 }, { squash: 1 }]) {
    const aimed = frame(bare(stub), { ...plan, aimed: aura })
    const rest = frame(bare(stub), plan)
    const added = [...aimed].filter(([where]) => !rest.has(where)).map(([where]) => where)
    // One spark above each column of the body: the top of the 'hh' row and the rows that stick out beyond it.
    expect(added.length, JSON.stringify(plan)).toBeGreaterThan(0)
    for (const where of added) {
      const [x = 0, y = 0] = where.split(',').map(Number)
      expect(rest.has(`${x},${y + 1}`), where).toBe(true)
    }
  }
  expect(frame(bare(stub), { aimed: () => [[offset.x, offset.y, 'spark']] }).has(`${offset.x},${offset.y}`)).toBe(true)
})

test('a frame that moves nothing draws what it drew before', async () => {
  for (const layers of FULL) {
    expect(frame(layers, { dx: 0, dy: 0, mirror: false, squash: 0, recolor: {} })).toEqual(frame(layers, {}))
  }
})
