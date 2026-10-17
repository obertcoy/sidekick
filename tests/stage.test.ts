import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, mock } from 'claude-code/testing'
import { changeLook } from '../hooks/look'
import { listRoom, PANE_CHROME_ROWS, viewIn } from '../hooks/sprite'
import { classic } from '../hooks/sprite/characters/classic'
import { foxkit } from '../hooks/sprite/characters/foxkit'
import {
  cameraFor,
  defineCharacter,
  edgesOf,
  GROUND_ROWS,
  HEADROOM,
  heightRefusal,
  offStage,
  render,
  type Stage,
  stageFor,
  WORLD_MIN_WIDTH,
  wholeStage,
} from '../hooks/sprite/compose'
import { drawable, resolve, setSavedLook } from '../hooks/sprite/look-in-use'
import { ACCESSORIES, ANIMATIONS, BACKGROUNDS, CHARACTERS, requirePlayed } from '../hooks/sprite/registry'
import type { Background, Character, Layers, Point } from '../hooks/sprite/types'
import { PANE, QUIET, test, world } from './world'

// The stage is made to fit the character and the pane looks into it through a camera. The pure parts (stage size, camera, what is drawn off the
// stage) are tested directly; the last tests mount the pane at several sizes and read what was painted.

/** A plain block of a character `height` pixels tall, with every anchor, pose and slot the shipped animations and accessories use. */
const block = (height: number): Character => {
  const last = height - 1
  const rows = Array.from({ length: height }, () => 'oooooooooooo')

  return defineCharacter({
    name: `block${height}`,
    body: rows,
    legend: { o: 'outline' },
    palette: { outline: 0x223344, base: 0x88aacc },
    anchors: {
      head: { x: 6, y: 0 },
      face: { x: 6, y: 2 },
      neck: { x: 6, y: Math.min(6, last) },
      held: { x: 10, y: last - 2 },
      paw: { x: 10, y: last - 3 },
      reach: { x: 11, y: Math.floor(height / 2) },
      boltFrom: { x: 11, y: 0 },
      cheeks: [
        { x: 2, y: 3 },
        { x: 9, y: 3 },
      ],
      tail: [
        { x: 0, y: last - 2 },
        { x: 0, y: last - 4 },
      ],
      ears: [
        { x: 1, y: 0 },
        { x: 10, y: 0 },
      ],
      feet: { x: 6, y: last },
    },
    poses: {
      armUp: { at: { x: 10, y: Math.floor(height / 2) }, rows: ['o'] },
      blink: { at: { x: 4, y: 2 }, rows: ['o'] },
      tailUp: { at: { x: 0, y: last - 3 }, rows: ['o'] },
      earsUp: { at: { x: 1, y: 1 }, rows: ['o'] },
    },
    moveset: { working: 'write', searching: 'look', 'search-failed': 'shrug', 'ticket-done': 'zap', 'set-done': 'cheer' },
    ambient: ['blink', 'tailFlick', 'earFlick', 'cheekSpark'],
    headRegion: { left: 2, top: 0, right: 11, bottom: 3 },
    bobs: { head: true, face: true, neck: false, held: false },
  })
}

const SIZES = [12, 24] as const
const ODD = block(13)

test('the stage height comes from the character: the same headroom and ground for a 12-pixel and a 24-pixel character, and a stage a cell is two pixels tall', async () => {
  const [small, tall] = SIZES.map(height => stageFor(block(height)))
  if (small === undefined || tall === undefined) throw new Error('no stages')
  expect(tall.height - small.height).toBe(12)
  for (const [stage, height] of [
    [small, 12],
    [tall, 24],
  ] as const) {
    // Sky above the body, the body down to the feet, then the ground to the bottom.
    expect(stage.offset.y, `${height} headroom`).toBeGreaterThanOrEqual(HEADROOM)
    expect(stage.ground, `${height} ground`).toBe(stage.offset.y + height)
    expect(stage.height - stage.ground, `${height} ground rows`).toBe(GROUND_ROWS)
    expect(stage.rows * 2).toBe(stage.height)
  }
  expect(tall.offset.y).toBe(small.offset.y)
  expect(tall.height - tall.ground).toBe(small.height - small.ground)
  // A stage always ends on a whole cell: when the height would be odd, the extra pixel is sky, so the ground stays the same.
  const odd = stageFor(ODD)
  expect(odd.height % 2).toBe(0)
  expect(odd.height - odd.ground).toBe(GROUND_ROWS)
  expect(odd.offset.y).toBeGreaterThanOrEqual(HEADROOM)
  expect(odd.offset.y).toBeLessThanOrEqual(HEADROOM + 1)
  // The shipped characters: the foxkit's blank row under its feet is ground, so it stands on the same stage as before, with sky added above.
  const fox = stageFor(foxkit)
  expect(fox.ground).toBe(fox.offset.y + 15)
  expect(fox.height).toBe(HEADROOM + 15 + GROUND_ROWS)
  expect(stageFor(classic).ground).toBe(stageFor(classic).offset.y + 15)
})

test('the world is at least 40 pixels wide, and the character stands in the middle of it', async () => {
  for (const character of [foxkit, classic, block(12), block(24)]) {
    const stage = stageFor(character)
    expect(stage.width, character.name).toBeGreaterThanOrEqual(WORLD_MIN_WIDTH)
    expect(stage.columns).toBe(stage.width)
    expect(stage.frame.left, character.name).toBeGreaterThanOrEqual(0)
    expect(stage.frame.right, character.name).toBeLessThan(stage.width)
    // Centred, to the pixel.
    expect(Math.abs(stage.frame.left + stage.frame.right + 1 - stage.width), character.name).toBeLessThanOrEqual(1)
  }
})

test('the camera keeps the character centred, never shows less than the whole character, and clamps at the world edges', async () => {
  const stage = stageFor(foxkit)
  const frameWidth = stage.frame.right - stage.frame.left + 1
  const centre = (stage.frame.left + stage.frame.right + 1) / 2
  for (const columns of [frameWidth, 20, 21, 30, 39]) {
    const view = cameraFor(stage, { columns, rows: 12 })
    expect(view.columns, `${columns} columns`).toBe(columns)
    expect(Math.abs(view.left + view.columns / 2 - centre), `${columns} columns are centred`).toBeLessThanOrEqual(0.5)
    expect(view.left).toBeLessThanOrEqual(stage.frame.left)
    expect(view.left + view.columns).toBeGreaterThan(stage.frame.right)
  }
  // Asked for less than the character is wide, the camera still shows all of it; asked for more than the world, it shows the world.
  expect(cameraFor(stage, { columns: 3, rows: 12 }).columns).toBe(frameWidth)
  expect(cameraFor(stage, { columns: 400, rows: 12 })).toEqual(wholeStage(stage))
  expect(cameraFor(stage)).toEqual(wholeStage(stage))
  // At the edges of the world the camera stops, though the character is off to one side.
  const left: Stage = { ...stage, frame: { left: 0, right: 17 } }
  const right: Stage = { ...stage, frame: { left: stage.width - 18, right: stage.width - 1 } }
  expect(cameraFor(left, { columns: 30, rows: 12 }).left).toBe(0)
  expect(cameraFor(right, { columns: 30, rows: 12 }).left).toBe(stage.width - 30)
  expect(cameraFor(right, { columns: 18, rows: 12 }).left).toBe(stage.width - 18)
})

test('when the pane is shorter than the stage the camera trims sky from the top, and never cuts into the character or the ground', async () => {
  const stage = stageFor(foxkit)
  const lowest = Math.ceil((stage.height - stage.offset.y) / 2)
  const full = cameraFor(stage, { columns: 40, rows: stage.rows })
  expect(full).toMatchObject({ top: 0, rows: stage.rows })
  for (let rows = stage.rows - 1; rows >= lowest; rows--) {
    const view = cameraFor(stage, { columns: 40, rows })
    expect(view.rows).toBe(rows)
    // The rows trimmed are the top ones; the bottom of the view is the bottom of the stage.
    expect(view.top).toBe((stage.rows - rows) * 2)
    expect(view.top + view.rows * 2).toBe(stage.height)
  }
  // A pane shorter still gets the character and the ground, and no less.
  for (const rows of [lowest - 1, 3, 0]) {
    const view = cameraFor(stage, { columns: 40, rows })
    expect(view.rows).toBe(lowest)
    expect(view.top).toBeLessThanOrEqual(stage.offset.y)
  }
})

test('the ticket list keeps the rows it has always had, whatever the stage, at every pane height the stage is not taller than', async () => {
  for (const character of ['foxkit', 'classic']) {
    setSavedLook({ character })
    for (let rows = 8; rows <= 60; rows++) {
      const view = viewIn({ columns: 40, rows })
      // The sprite is the eight rows the header always gave it, so the list has the pane less sixteen, at least three.
      expect(view.rows, `${character} at ${rows} rows`).toBe(PANE_CHROME_ROWS)
      expect(listRoom(rows, view.rows), `${character} at ${rows} rows`).toBe(Math.max(3, rows - 16))
    }
  }
  setSavedLook({})
})

test('no animation places anything by a fixed coordinate: moved anchors and edges move every dot with them, at the same pace', async () => {
  const base = foxkit.anchors
  const edges = { skyTop: 0, ground: 15, left: 0, right: 17 }
  const by: Point = { x: 7, y: 13 }
  const move = (point: Point): Point => ({ x: point.x + by.x, y: point.y + by.y })
  const moved = Object.fromEntries(
    Object.entries(base).map(([name, anchor]) => [name, 'x' in anchor ? move(anchor) : anchor.map(move)]),
  ) as unknown as typeof base
  const movedEdges = { skyTop: edges.skyTop + by.y, ground: edges.ground + by.y, left: edges.left + by.x, right: edges.right + by.x }
  for (const [name, animation] of Object.entries(ANIMATIONS)) {
    for (let step = 0; step < animation.frames; step++) {
      const there = animation.frame(step, base, edges)
      const here = animation.frame(step, moved, movedEdges)
      expect(here.bob, `${name} ${step}`).toBe(there.bob)
      expect(here.poses, `${name} ${step}`).toEqual(there.poses)
      expect(here.dots ?? [], `${name} ${step}`).toEqual((there.dots ?? []).map(([x, y, role]) => [x + by.x, y + by.y, role]))
    }
  }
})

test('nothing any animation, pose or accessory draws lands off the stage, for a 12-pixel, a 24-pixel and the shipped characters, with everything worn, through a wide and a narrow camera', async () => {
  for (const character of [foxkit, classic, block(12), block(13), block(24)]) {
    // The load check, as for any character.
    expect(() => requirePlayed(character), character.name).not.toThrow()
    const outfit = { head: ACCESSORIES.cap, face: ACCESSORIES.glasses, neck: ACCESSORIES.scarf, held: ACCESSORIES.flag } as Layers['outfit']
    for (const layers of [
      { character, outfit: {}, background: null },
      { character, outfit, background: BACKGROUNDS.dusk ?? null },
    ] satisfies Layers[]) {
      const stage = stageFor(character)
      for (const view of [undefined, cameraFor(stage, { columns: 20, rows: 8 }), cameraFor(stage, { columns: 1, rows: 1 })]) {
        for (const [name, animation] of Object.entries(ANIMATIONS)) {
          for (let step = 0; step < animation.frames; step++) {
            expect(offStage(layers, animation, step, view), `${character.name} ${name} ${step}`).toEqual([])
          }
        }
      }
    }
  }
})

test('the edges an animation is told are the stage ground and the camera: its sky top, and its leftmost and rightmost columns', async () => {
  const stage = stageFor(foxkit)
  expect(edgesOf(stage, wholeStage(stage))).toEqual({ skyTop: 0, ground: stage.ground, left: 0, right: stage.width - 1 })
  const view = cameraFor(stage, { columns: 20, rows: 8 })
  expect(edgesOf(stage, view)).toEqual({ skyTop: view.top, ground: stage.ground, left: view.left, right: view.left + 19 })
  // An animation sees them: the ground it is told is the row under the feet, wherever the character is.
  const seen: unknown[] = []
  const probe = {
    ...ANIMATIONS.idle,
    frame: (_step: number, _at: unknown, edges: unknown) => {
      seen.push(edges)

      return {}
    },
  }
  offStage({ character: foxkit, outfit: {}, background: null }, probe, 0, view)
  expect(seen).toEqual([edgesOf(stage, view)])
})

test('a look can cap the stage height: a character that needs more is refused, naming the cap, and the stage is trimmed to fit under it', async () => {
  const tall = block(24)
  expect(heightRefusal(tall, 20)).toBe('character "block24" is 24 pixels tall and needs 25 with its ground; the look\'s height cap is 20')
  expect(() => stageFor(tall, 20)).toThrow('character "block24" is 24 pixels tall and needs 25 with its ground; the look\'s height cap is 20')
  // The cap is in pixels and a cell is two: an odd cap holds one pixel less.
  expect(heightRefusal(tall, 25)).toContain("the look's height cap is 25")
  expect(heightRefusal(tall, 26)).toBeUndefined()
  // A character that fits is drawn on a stage no taller than the cap; the sky is what goes.
  const capped = stageFor(foxkit, 20)
  expect(capped.height).toBe(20)
  expect(capped.height - capped.ground).toBe(GROUND_ROWS)
  expect(capped.offset.y).toBe(20 - 15 - GROUND_ROWS)
  expect(stageFor(foxkit, 400).height).toBe(stageFor(foxkit).height)
  expect(heightRefusal(foxkit, 14)).toContain("the look's height cap is 14")
  expect(() => stageFor(foxkit, 14)).toThrow("the look's height cap is 14")
})

test('a background with a height cap is left out for a character taller than it, and reported; a character that fits keeps it', async () => {
  const dusk = BACKGROUNDS.dusk
  if (dusk === undefined) throw new Error('no dusk')
  const low: Background = { ...dusk, name: 'low', heightCap: 20 }
  const backgrounds = BACKGROUNDS as Record<string, Background>
  const characters = CHARACTERS as Record<string, Character>
  backgrounds.low = low
  characters.block24 = block(24)
  try {
    const fits = resolve({ character: 'foxkit', outfit: {}, background: 'low' })
    expect(fits.layers.background).toBe(low)
    expect(fits.dropped).toEqual([])
    const refused = resolve({ character: 'block24', outfit: {}, background: 'low' })
    expect(refused.layers.background).toBeNull()
    expect(refused.dropped).toEqual([
      {
        part: 'background',
        why: 'low is left out: character "block24" is 24 pixels tall and needs 25 with its ground; the look\'s height cap is 20',
        isReported: true,
      },
    ])
    // The character itself is drawn, on its own stage.
    expect(refused.layers.character.name).toBe('block24')
  } finally {
    delete backgrounds.low
    delete characters.block24
  }
})

// Whole-mod: the pane mounted at a size, and the cells it painted.

const ROOT = '/work/shop'

/** A session with the pane mounted at `bodyColumns` x `bodyRows` on the terminal, and the Raster it drew. */
const mountedAt = async ($: Engine, on: On, bodyColumns: number, bodyRows = 30) => {
  const clock = mock.clock(on)
  mock.store(on, QUIET)
  world(on, ROOT)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, bodyColumns, scroll: { offset: 0, bodyRows } } })
  const raster = (await ui.findAll({ type: 'Raster' })).at(0)
  if (raster === undefined) throw new Error('no Raster was drawn')

  return { ui, raster }
}

/** The glyph word of every cell of a Raster's cells, three words (glyph, foreground, background) per cell. */
const wordsOf = (cells: string): Uint32Array => new Uint32Array(Uint8Array.from(atob(cells), letter => letter.charCodeAt(0)).buffer)

/** The columns of a Raster with anything in them. */
const drawnColumns = (cells: string, columns: number): number[] => {
  const words = wordsOf(cells)
  const rows = words.length / 3 / columns

  return Array.from({ length: columns }, (_, column) => column).filter(column =>
    Array.from({ length: rows }, (_, row) => words[(row * columns + column) * 3]).some(glyph => glyph !== 0x20),
  )
}

for (const [bodyColumns, columns] of [
  [20, 18],
  [40, 20],
  [60, 40],
] as const) {
  test(`at ${bodyColumns} columns the pane draws the character whole and centred in ${columns} columns${columns === 40 ? ', the whole world' : ''}`, async ($, on) => {
    const { ui, raster } = await mountedAt($, on, bodyColumns)
    const stage = stageFor(drawable().character)
    expect(raster.props.columns).toBe(columns)
    expect(raster.props.rows).toBe(8)
    const view = viewIn({ columns: bodyColumns, rows: 30 })
    expect(view.columns).toBe(columns)
    // Whole: every column the character draws in the whole world is drawn here.
    const whole = drawnColumns(render(drawable(), ANIMATIONS.idle, 0), stage.columns)
    const here = drawnColumns(raster.props.cells as string, columns)
    expect(here.map(column => column + view.left)).toEqual(whole)
    // Centred: the character's frame is in the middle of the view, to a column; the whole world when it fits.
    if (columns === stage.columns) expect(view.left).toBe(0)
    expect(Math.abs(view.left + columns / 2 - (stage.frame.left + stage.frame.right + 1) / 2)).toBeLessThanOrEqual(0.5)
    await ui.unmount()
  })
}

for (const bodyRows of [8, 12, 30]) {
  test(`at ${bodyRows} rows the pane draws the character and the ground and trims the sky above, so the ticket list keeps its rows`, async ($, on) => {
    const stage = stageFor(drawable().character)
    const { ui, raster } = await mountedAt($, on, 40, bodyRows)
    expect(raster.props.rows).toBe(8)
    expect(raster.props.rows).toBeLessThan(stage.rows)
    await ui.unmount()
  })
}

test('a character taller than the sprite has rows for makes the ticket list yield, and the list rows are pinned for it', async () => {
  // A 30-row pane: the foxkit leaves the list its 14 rows; a 24-pixel character needs 13 rows of sprite, so the list has 9.
  const rows = 30
  const listFor = (character: Character): number => listRoom(rows, viewIn({ columns: 40, rows }, { character, outfit: {}, background: null }).rows)
  expect(listFor(foxkit)).toBe(14)
  expect(listFor(classic)).toBe(14)
  expect(listFor(block(15))).toBe(14)
  expect(viewIn({ columns: 40, rows }, { character: block(24), outfit: {}, background: null }).rows).toBe(13)
  expect(listFor(block(24))).toBe(9)
})

test('the look command refuses a capped background for a character too tall for it, naming the cap, and accepts one that fits', async () => {
  const backgrounds = BACKGROUNDS as Record<string, Background>
  const characters = CHARACTERS as Record<string, Character>
  const dusk = BACKGROUNDS.dusk
  if (dusk === undefined) throw new Error('no dusk')
  backgrounds.low = { ...dusk, name: 'low', heightCap: 20 }
  characters.block24 = block(24)
  try {
    const refused = changeLook('character=block24 background=low', {}, 'global')
    expect(refused.isSaved).toBe(false)
    expect(refused.text).toContain("the look's height cap is 20")
    expect(refused.text).toContain('Nothing was changed.')
    expect(changeLook('character=foxkit background=low', {}, 'global').isSaved).toBe(true)
    // The character may come from the other layer.
    expect(changeLook('character=block24', { background: 'low' }, 'global').isSaved).toBe(false)
    setSavedLook({ character: 'block24' })
    expect(changeLook('background=low', {}, 'project').isSaved).toBe(false)
    expect(changeLook('background=dusk', {}, 'project').isSaved).toBe(true)
  } finally {
    setSavedLook({})
    delete backgrounds.low
    delete characters.block24
  }
})

test('an anchor that is present but undefined is no anchor: the stage, the camera and a frame all work without it', async () => {
  const holed = { ...foxkit, name: 'holed', anchors: { ...foxkit.anchors, paw: undefined } } as unknown as Character
  const loaded = defineCharacter(holed)
  expect(stageFor(loaded)).toEqual(stageFor(foxkit))
  expect(offStage({ character: loaded, outfit: {}, background: null }, ANIMATIONS.idle, 0)).toEqual([])
  expect(render({ character: loaded, outfit: {}, background: null }, ANIMATIONS.idle, 0).length).toBeGreaterThan(0)
})
