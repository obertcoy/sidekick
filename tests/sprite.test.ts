import { expect, test } from 'claude-code/testing'

import { SPRITE, cellsOf, frameCount } from '../hooks/sprite'
import { STAGE, composePixels, defineCharacter, render } from '../hooks/sprite/compose'
import type { Pixels } from '../hooks/sprite/compose'
import { foxkit } from '../hooks/sprite/characters/foxkit'
import { ANIMATIONS, BACKGROUNDS, CHARACTERS, LOOK, OUTFITS, layersOf } from '../hooks/sprite/registry'
import type { Background, Character, Layers } from '../hooks/sprite/types'
import { GOLDEN } from './sprite-golden'

const MODES = ['idle', 'write', 'zap'] as const
const cellsLength = Math.ceil((STAGE.columns * STAGE.rows * 12) / 3) * 4
const bare = (character: Character): Layers => ({ character, outfit: null, background: null })

/** Every opaque pixel as "x,y". */
const opaque = (pixels: Pixels, keep: (color: number) => boolean = () => true): string[] =>
  pixels.flatMap((row, y) => [...row].flatMap((color, x) => (color !== undefined && keep(color) ? [`${x},${y}`] : [])))

test('the foxkit draws every frame of every mode exactly as the standalone sprite did', async () => {
  expect(LOOK).toEqual({ character: 'foxkit', outfit: null, background: null })
  expect(SPRITE).toEqual({ columns: STAGE.columns, rows: STAGE.rows })
  for (const mode of MODES) {
    expect(frameCount(mode), mode).toBe(GOLDEN[mode].length)
    GOLDEN[mode].forEach((cells, frame) => {
      expect(cellsOf(mode, frame), `${mode} frame ${frame}`).toBe(cells)
      expect(render(layersOf(LOOK), ANIMATIONS[mode], frame), `${mode} frame ${frame}`).toBe(cells)
    })
    expect(cellsOf(mode, frameCount(mode)), `${mode} wraps`).toBe(GOLDEN[mode][0])
  }
})

test('the modes keep the timings register.tsx plays them at', async () => {
  expect(ANIMATIONS.zap).toMatchObject({ frames: 12, msPerFrame: 110, once: true })
  expect(ANIMATIONS.write).toMatchObject({ frames: 6, msPerFrame: 220, once: false })
  expect(ANIMATIONS.idle).toMatchObject({ frames: 1, msPerFrame: 220, once: false })
})

test('every character fills the stage in every animation, and write and zap move', async () => {
  for (const [name, character] of Object.entries(CHARACTERS)) {
    const layers = bare(character)
    const still = render(layers, ANIMATIONS.idle, 0)
    for (const [mode, animation] of Object.entries(ANIMATIONS)) {
      for (let step = 0; step < animation.frames; step++) {
        expect(render(layers, animation, step).length, `${name} ${mode} ${step}`).toBe(cellsLength)
        if (mode !== 'idle') expect(render(layers, animation, step), `${name} ${mode} ${step}`).not.toBe(still)
      }
    }
    expect(render(layers, ANIMATIONS.write, 1), name).not.toBe(render(layers, ANIMATIONS.write, 0))
    expect(render(layers, ANIMATIONS.zap, 2), name).not.toBe(render(layers, ANIMATIONS.zap, 0))
    expect(render(layers, ANIMATIONS.zap, 6), name).not.toBe(render(layers, ANIMATIONS.zap, 2))
  }
})

test('an outfit sits on the head anchor and bobs with the head while writing', async () => {
  const cap = OUTFITS.cap ?? null
  for (const [name, character] of Object.entries(CHARACTERS)) {
    const { head } = character.anchors
    /** The pixels the cap changes in one write step. */
    const capAt = (step: number): string[] => {
      const without = composePixels(bare(character), ANIMATIONS.write, step)
      const worn = composePixels({ character, outfit: cap, background: null }, ANIMATIONS.write, step)
      return opaque(worn).filter(at => {
        const [x = 0, y = 0] = at.split(',').map(Number)
        return worn[y]?.[x] !== without[y]?.[x]
      })
    }
    const up = capAt(0)
    const down = capAt(1)
    expect(up.length, name).toBeGreaterThan(0)
    expect(up, name).toContain(`${head.x},${head.y}`)
    expect(down, name).toEqual(up.map(at => at.split(',').map(Number)).map(([x, y]) => `${x},${(y ?? 0) + 1}`))
    expect(down, name).toContain(`${head.x},${head.y + 1}`)
  }
})

test('a background shows only where every layer above it is transparent', async () => {
  const wall = 0x123456
  const solid: Background = {
    name: 'solid',
    frames: [Array.from({ length: STAGE.height }, () => 'x'.repeat(STAGE.width))],
    palette: { x: wall },
  }
  const cap = OUTFITS.cap ?? null
  for (const [mode, animation] of Object.entries(ANIMATIONS)) {
    for (let step = 0; step < animation.frames; step++) {
      const front = composePixels({ character: foxkit, outfit: cap, background: null }, animation, step)
      const behind = composePixels({ character: foxkit, outfit: cap, background: solid }, animation, step)
      for (let y = 0; y < STAGE.height; y++) {
        for (let x = 0; x < STAGE.width; x++) {
          expect(behind[y]?.[x], `${mode} ${step} at ${x},${y}`).toBe(front[y]?.[x] ?? wall)
        }
      }
    }
  }
  const dusk = BACKGROUNDS.dusk
  if (dusk === undefined) throw new Error('no dusk')
  const withDusk = composePixels({ character: foxkit, outfit: null, background: dusk }, ANIMATIONS.idle, 0)
  expect(withDusk[15]?.[0]).toBe(dusk.palette.g)
  expect(withDusk[8]?.[6]).toBe(foxkit.palette.belly)
})

test('a character too big for the stage, or missing an anchor, is refused with a clear error', async () => {
  const tooWide = { ...foxkit, name: 'wide', body: ['o'.repeat(STAGE.width + 1)] }
  expect(() => defineCharacter(tooWide)).toThrow('character "wide" row 0 is 19 pixels wide; the stage is 18')
  const tooTall = { ...foxkit, name: 'tall', body: Array.from({ length: STAGE.height + 1 }, () => 'o') }
  expect(() => defineCharacter(tooTall)).toThrow('character "tall" is 17 pixels tall; the stage is 16')
  const { paw: _paw, ...anchors } = foxkit.anchors
  const pawless = { ...foxkit, name: 'pawless', anchors } as unknown as Character
  expect(() => defineCharacter(pawless)).toThrow('character "pawless" is missing the anchor "paw"')
  const offStage = { ...foxkit, name: 'off', anchors: { ...foxkit.anchors, head: { x: 3, y: -1 } } }
  expect(() => defineCharacter(offStage)).toThrow('character "off" is missing the anchor "head", or it is off the stage')
  const unnamed = { ...foxkit, name: 'unnamed', body: ['oq'] }
  expect(() => defineCharacter(unnamed)).toThrow('uses "q" in row 0, which its legend does not name')
  expect(() => layersOf({ character: 'nobody', outfit: null, background: null })).toThrow('no character named "nobody"')
})
