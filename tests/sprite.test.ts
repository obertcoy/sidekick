import { expect, test } from 'claude-code/testing'

import { SPRITE, cellsOf, frameCount } from '../hooks/sprite'
import { STAGE, composePixels, defineCharacter, render } from '../hooks/sprite/compose'
import type { Pixels } from '../hooks/sprite/compose'
import { foxkit } from '../hooks/sprite/characters/foxkit'
import { ACCESSORIES, ANIMATIONS, BACKGROUNDS, CHARACTERS, DEFAULT_LOOK, currentLook, layersOf } from '../hooks/sprite/registry'
import type { Animation, Background, Character, Layers } from '../hooks/sprite/types'
import { GOLDEN } from './sprite-golden'

const MODES = ['idle', 'write', 'zap'] as const
const cellsLength = Math.ceil((STAGE.columns * STAGE.rows * 12) / 3) * 4
const cap = ACCESSORIES.cap
if (cap === undefined) throw new Error('no cap')
const capped = { head: cap }
const bare = (character: Character): Layers => ({ character, outfit: {}, background: null })

/** Every opaque pixel as "x,y". */
const opaque = (pixels: Pixels, keep: (color: number) => boolean = () => true): string[] =>
  pixels.flatMap((row, y) => [...row].flatMap((color, x) => (color !== undefined && keep(color) ? [`${x},${y}`] : [])))

test('the foxkit draws every frame of every mode exactly as the standalone sprite did', async () => {
  expect(currentLook()).toEqual({ character: 'foxkit', outfit: {}, background: null })
  expect(DEFAULT_LOOK).toEqual(currentLook())
  expect(SPRITE).toEqual({ columns: STAGE.columns, rows: STAGE.rows })
  for (const mode of MODES) {
    expect(frameCount(mode), mode).toBe(GOLDEN[mode].length)
    GOLDEN[mode].forEach((cells, frame) => {
      expect(cellsOf(mode, frame), `${mode} frame ${frame}`).toBe(cells)
      expect(render(layersOf(currentLook()), ANIMATIONS[mode], frame), `${mode} frame ${frame}`).toBe(cells)
    })
    expect(cellsOf(mode, frameCount(mode)), `${mode} wraps`).toBe(GOLDEN[mode][0])
  }
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

test('an accessory in the head slot sits on the head anchor and bobs with the head while writing', async () => {
  for (const [name, character] of Object.entries(CHARACTERS)) {
    const { head } = character.anchors
    /** The pixels the cap changes in one write step. */
    const capAt = (step: number): string[] => {
      const without = composePixels(bare(character), ANIMATIONS.write, step)
      const worn = composePixels({ character, outfit: capped, background: null }, ANIMATIONS.write, step)
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
  for (const [mode, animation] of Object.entries(ANIMATIONS)) {
    for (let step = 0; step < animation.frames; step++) {
      const front = composePixels({ character: foxkit, outfit: capped, background: null }, animation, step)
      const behind = composePixels({ character: foxkit, outfit: capped, background: solid }, animation, step)
      for (let y = 0; y < STAGE.height; y++) {
        for (let x = 0; x < STAGE.width; x++) {
          expect(behind[y]?.[x], `${mode} ${step} at ${x},${y}`).toBe(front[y]?.[x] ?? wall)
        }
      }
    }
  }
  const dusk = BACKGROUNDS.dusk
  if (dusk === undefined) throw new Error('no dusk')
  const withDusk = composePixels({ character: foxkit, outfit: {}, background: dusk }, ANIMATIONS.idle, 0)
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
  expect(() => layersOf({ character: 'nobody', outfit: {}, background: null })).toThrow('no character named "nobody"')
  expect(() => layersOf({ character: 'foxkit', outfit: { neck: 'cap' }, background: null })).toThrow(
    'accessory "cap" belongs in the head slot, not neck',
  )
  expect(layersOf({ character: 'foxkit', outfit: { head: 'cap' }, background: null }).outfit.head).toBe(ACCESSORIES.cap)
})

const glasses = ACCESSORIES.glasses
const scarf = ACCESSORIES.scarf
if (glasses === undefined || scarf === undefined) throw new Error('no glasses or scarf')

/** The stage pixels that wearing `outfit` changes in one write step, as "x,y". */
const changedBy = (character: Character, outfit: Layers['outfit'], step: number): string[] => {
  const without = composePixels(bare(character), ANIMATIONS.write, step)
  const worn = composePixels({ character, outfit, background: null }, ANIMATIONS.write, step)
  return opaque(worn).filter(at => {
    const [x = 0, y = 0] = at.split(',').map(Number)
    return worn[y]?.[x] !== without[y]?.[x]
  })
}

/** Where an accessory's non-transparent pixels land when its origin sits on `at`, as "x,y". */
const placed = (accessory: { pixels: readonly string[]; origin: { x: number; y: number } }, at: { x: number; y: number }, lift = 0): string[] =>
  accessory.pixels.flatMap((row, y) =>
    [...row].flatMap((letter, x) => (letter === '.' ? [] : [`${at.x - accessory.origin.x + x},${at.y - accessory.origin.y + y + lift}`])),
  )

test('both characters have a face and a neck anchor on the stage, and glasses and scarf sit on them', async () => {
  for (const [name, character] of Object.entries(CHARACTERS)) {
    const { face, neck } = character.anchors
    if (face === undefined || neck === undefined) throw new Error(`${name} lacks a face or neck anchor`)
    const dressed = composePixels({ character, outfit: { face: glasses }, background: null }, ANIMATIONS.idle, 0)
    const plain = composePixels(bare(character), ANIMATIONS.idle, 0)
    const changed = (a: Pixels, b: Pixels): string[] => opaque(a).filter(at => {
      const [x = 0, y = 0] = at.split(',').map(Number)
      return a[y]?.[x] !== b[y]?.[x]
    })
    expect(changed(dressed, plain).sort(), `${name} glasses`).toEqual(placed(glasses, face).sort())
    expect(dressed[face.y]?.[face.x], `${name} glasses bridge on the anchor`).toBe(glasses.palette.L)
    const scarfed = composePixels({ character, outfit: { neck: scarf }, background: null }, ANIMATIONS.idle, 0)
    expect(changed(scarfed, plain).sort(), `${name} scarf`).toEqual(placed(scarf, neck).sort())
    expect(scarfed[neck.y]?.[neck.x], `${name} scarf on the anchor`).toBe(scarf.palette.t)
  }
})

test('glasses bob with the head and a scarf stays put while writing', async () => {
  for (const [name, character] of Object.entries(CHARACTERS)) {
    const { face, neck } = character.anchors
    if (face === undefined || neck === undefined) throw new Error(`${name} lacks a face or neck anchor`)
    expect(changedBy(character, { face: glasses }, 0).sort(), `${name} glasses up`).toEqual(placed(glasses, face).sort())
    expect(changedBy(character, { face: glasses }, 1).sort(), `${name} glasses down`).toEqual(placed(glasses, face, 1).sort())
    expect(changedBy(character, { neck: scarf }, 0).sort(), `${name} scarf up`).toEqual(placed(scarf, neck).sort())
    expect(changedBy(character, { neck: scarf }, 1).sort(), `${name} scarf down`).toEqual(placed(scarf, neck).sort())
  }
})

test('head, face and neck accessories are worn together, drawn neck first, then face, then head', async () => {
  const dot = (slot: 'head' | 'face' | 'neck', colour: number) => ({ name: slot, slot, pixels: ['x'], origin: { x: 0, y: 0 }, palette: { x: colour } })
  const spot = { x: 8, y: 8 }
  const piled = defineCharacter({ ...foxkit, name: 'piled', anchors: { ...foxkit.anchors, head: spot, face: spot, neck: spot } })
  const all = { head: dot('head', 1), face: dot('face', 2), neck: dot('neck', 3) }
  const at = (outfit: Layers['outfit']) => composePixels({ character: piled, outfit, background: null }, ANIMATIONS.idle, 0)[spot.y]?.[spot.x]
  expect(at(all)).toBe(1)
  expect(at({ face: all.face, neck: all.neck })).toBe(2)
  expect(at({ neck: all.neck })).toBe(3)

  // Really worn together on the shipped characters: every piece shows.
  for (const [name, character] of Object.entries(CHARACTERS)) {
    const { head, face, neck } = character.anchors
    if (face === undefined || neck === undefined) throw new Error(`${name} lacks a face or neck anchor`)
    const worn = composePixels({ character, outfit: { head: cap, face: glasses, neck: scarf }, background: null }, ANIMATIONS.idle, 0)
    expect(worn[head.y]?.[head.x], `${name} cap`).toBe(cap.palette.d)
    expect(worn[face.y]?.[face.x], `${name} glasses`).toBe(glasses.palette.L)
    expect(worn[neck.y]?.[neck.x], `${name} scarf`).toBe(scarf.palette.t)
  }
})

test('a character is valid without face or neck anchors, but an anchor it gives must be on the stage', async () => {
  const { face: _face, neck: _neck, held: _held, ...head } = foxkit.anchors
  const plain = defineCharacter({ ...foxkit, name: 'plain', anchors: head, bobs: { head: true } })
  expect(plain.anchors.face).toBeUndefined()
  // Without the anchors the accessories are simply not drawn.
  const worn = composePixels({ character: plain, outfit: { face: glasses, neck: scarf }, background: null }, ANIMATIONS.idle, 0)
  expect(worn).toEqual(composePixels(bare(plain), ANIMATIONS.idle, 0))
  for (const slot of ['face', 'neck'] as const) {
    for (const off of [{ x: -1, y: 4 }, { x: 4, y: STAGE.height }, { x: STAGE.width, y: 4 }, { x: 1.5, y: 4 }]) {
      const bad = { ...foxkit, name: 'off', anchors: { ...foxkit.anchors, [slot]: off } }
      expect(() => defineCharacter(bad), `${slot} ${JSON.stringify(off)}`).toThrow(`character "off" has the anchor "${slot}" off the stage`)
    }
  }
})

test('layersOf takes glasses in the face slot and a scarf in the neck slot, and refuses them elsewhere', async () => {
  const layers = layersOf({ character: 'classic', outfit: { head: 'cap', face: 'glasses', neck: 'scarf' }, background: null })
  expect(layers.outfit).toEqual({ head: cap, face: glasses, neck: scarf })
  expect(() => layersOf({ character: 'foxkit', outfit: { head: 'glasses' }, background: null })).toThrow(
    'accessory "glasses" belongs in the face slot, not head',
  )
})

test('the character declares which slots bob, and the renderer follows the declaration', async () => {
  // Every shipped character declares its slots as it behaves: head and face move, neck stays.
  for (const [name, character] of Object.entries(CHARACTERS)) expect(character.bobs, name).toEqual({ head: true, face: true, neck: false, held: false })

  // A face anchor inside the head region declared as not bobbing is allowed, and its glasses stay put.
  const still = defineCharacter({ ...foxkit, name: 'still', bobs: { ...foxkit.bobs, face: false } })
  expect(changedBy(still, { face: glasses }, 1).sort()).toEqual(placed(glasses, foxkit.anchors.face ?? { x: 0, y: 0 }).sort())
  // The same anchor declared as bobbing moves down with the head.
  expect(changedBy(foxkit, { face: glasses }, 1).sort()).toEqual(placed(glasses, foxkit.anchors.face ?? { x: 0, y: 0 }, 1).sort())
  // A scarf declared as bobbing, with its anchor moved into the head region, moves too.
  const high = defineCharacter({ ...foxkit, name: 'high', anchors: { ...foxkit.anchors, neck: { x: 7, y: 7 } }, bobs: { ...foxkit.bobs, neck: true } })
  expect(changedBy(high, { neck: scarf }, 1).sort()).toEqual(placed(scarf, { x: 7, y: 7 }, 1).sort())
})

test('a character with a bob declaration that cannot be right is refused at load', async () => {
  const { face: _f, neck: _n, held: _h, ...head } = foxkit.anchors
  // A slot declared but with no anchor.
  expect(() => defineCharacter({ ...foxkit, name: 'ghost', anchors: head })).toThrow(
    'character "ghost" declares whether the slot "face" bobs, but has no anchor for it',
  )
  // An anchored slot left undeclared.
  expect(() => defineCharacter({ ...foxkit, name: 'silent', bobs: { head: true, face: true } })).toThrow(
    'character "silent" does not declare whether the slot "neck" bobs',
  )
  expect(() => defineCharacter({ ...foxkit, name: 'headless', bobs: { face: true, neck: false } })).toThrow(
    'character "headless" does not declare whether the slot "head" bobs',
  )
  // A slot declared to move whose anchor is on pixels that do not.
  expect(() => defineCharacter({ ...foxkit, name: 'adrift', bobs: { ...foxkit.bobs, neck: true } })).toThrow(
    'character "adrift" declares the slot "neck" as bobbing, but its anchor is outside the headRegion',
  )
})

// Held slot, hidden while the paws are busy.

const flag = ACCESSORIES.flag
if (flag === undefined) throw new Error('no flag')

/** Every pixel of a frame, so two frames can be compared whole. */
const frameOf = (layers: Layers, animation: Animation, step: number): string => JSON.stringify(composePixels(layers, animation, step))
const withAll = (character: Character): Layers['outfit'] => ({ head: cap, face: glasses, neck: scarf, held: flag })
const withoutHeld = (character: Character): Layers['outfit'] => ({ head: cap, face: glasses, neck: scarf })

/** Expects every pixel of the four accessories to be in `frame` in its own colour, where its anchor, origin and the character's bob declaration put it. */
const expectOwnPixels = (character: Character, frame: Pixels, bob: number, label: string): void => {
  const outfit = withAll(character)
  for (const slot of ['head', 'face', 'neck', 'held'] as const) {
    const accessory = outfit[slot]
    const anchor = character.anchors[slot]
    if (accessory === undefined || anchor === undefined) throw new Error(`${label}: no ${slot}`)
    const lift = character.bobs[slot] ? bob : 0
    accessory.pixels.forEach((row, y) =>
      [...row].forEach((letter, x) => {
        if (letter === '.') return
        const at = { x: anchor.x - accessory.origin.x + x, y: anchor.y - accessory.origin.y + y + lift }
        expect(frame[at.y]?.[at.x], `${label}: ${accessory.name} pixel ${at.x},${at.y}`).toBe(accessory.palette[letter])
      }),
    )
  }
}

test('both characters have a held anchor on the stage, and a flag stands on it, still while the head bobs', async () => {
  for (const [name, character] of Object.entries(CHARACTERS)) {
    const { held } = character.anchors
    if (held === undefined) throw new Error(`${name} lacks a held anchor`)
    expect(character.bobs.held, `${name} held does not bob`).toBe(false)
    const rest = composePixels({ character, outfit: { held: flag }, background: null }, ANIMATIONS.idle, 0)
    const plain = composePixels(bare(character), ANIMATIONS.idle, 0)
    const changed = opaque(rest).filter(at => {
      const [x = 0, y = 0] = at.split(',').map(Number)
      return rest[y]?.[x] !== plain[y]?.[x]
    })
    expect(changed.sort(), `${name} flag`).toEqual(placed(flag, held).sort())
    expect(rest[held.y]?.[held.x], `${name} pole foot on the anchor`).toBe(flag.palette.p)
    // A flag drawn over empty stage only: it covers none of the body.
    expect(opaque(plain).filter(at => changed.includes(at)), `${name} flag clear of the body`).toEqual([])
    // And of the other accessories: worn together at rest, each keeps all of its own pixels.
    expectOwnPixels(character, composePixels({ character, outfit: withAll(character), background: null }, ANIMATIONS.idle, 0), 0, `${name} at rest`)
  }
})

test('writing and zapping hide the held slot in every frame, on both characters, and leave the other slots alone', async () => {
  for (const [name, character] of Object.entries(CHARACTERS)) {
    for (const mode of ['write', 'zap'] as const) {
      const animation = ANIMATIONS[mode]
      expect(animation.hides, mode).toEqual(['held'])
      for (let step = 0; step < animation.frames; step++) {
        const worn = { character, outfit: withAll(character), background: null }
        const hidden = { character, outfit: withoutHeld(character), background: null }
        // The flag is not in the frame: it is exactly the frame of a sidekick holding nothing.
        expect(frameOf(worn, animation, step), `${name} ${mode} ${step}`).toBe(frameOf(hidden, animation, step))
        // The other slots are still drawn.
        expect(frameOf(hidden, animation, step), `${name} ${mode} ${step} outfit`).not.toBe(frameOf(bare(character), animation, step))
      }
    }
    // At rest the same outfit does show the flag.
    expect(frameOf({ character, outfit: withAll(character), background: null }, ANIMATIONS.idle, 0)).not.toBe(
      frameOf({ character, outfit: withoutHeld(character), background: null }, ANIMATIONS.idle, 0),
    )
  }
  expect(ANIMATIONS.idle.hides).toEqual([])
})

test('an animation that hides no slot leaves every accessory drawn, and one that hides a slot hides only that slot', async () => {
  for (const character of Object.values(CHARACTERS)) {
    const layers = { character, outfit: withAll(character), background: null }
    const hidesNone: Animation = { frames: 2, msPerFrame: 100, once: false, hides: [], frame: step => ({ bob: step }) }
    const hidesFace: Animation = { ...hidesNone, hides: ['face'] }
    const everything = (animation: Animation, step: number) => frameOf(layers, animation, step)
    for (const step of [0, 1]) {
      const kept = (hidden: Layers['outfit']) => frameOf({ character, outfit: hidden, background: null }, hidesNone, step)
      // Every accessory's own pixels are in the frame, worked out from the anchors and the bob, not from the renderer.
      expectOwnPixels(character, composePixels(layers, hidesNone, step), step, `${character.name} step ${step}`)
      // The same held accessory is drawn by an animation that hides nothing and not by one that hides held.
      expect(everything(hidesNone, step)).not.toBe(frameOf(layers, { ...hidesNone, hides: ['held'] }, step))
      // Hiding the face takes out the glasses and nothing else.
      const { face: _face, ...noFace } = withAll(character)
      expect(everything(hidesFace, step)).toBe(kept(noFace))
    }
  }
})

test('all four slots are worn together and held is drawn above the other three', async () => {
  const dot = (slot: 'head' | 'face' | 'neck' | 'held', colour: number) => ({ name: slot, slot, pixels: ['x'], origin: { x: 0, y: 0 }, palette: { x: colour } })
  const spot = { x: 8, y: 8 }
  const piled = defineCharacter({ ...foxkit, name: 'piled', anchors: { ...foxkit.anchors, head: spot, face: spot, neck: spot, held: spot }, bobs: { head: true, face: true, neck: false, held: false } })
  const all = { head: dot('head', 1), face: dot('face', 2), neck: dot('neck', 3), held: dot('held', 4) }
  const at = (outfit: Layers['outfit']) => composePixels({ character: piled, outfit, background: null }, ANIMATIONS.idle, 0)[spot.y]?.[spot.x]
  expect(at(all)).toBe(4)
  expect(at({ head: all.head, face: all.face, neck: all.neck })).toBe(1)

  // Really worn together on the shipped characters: every piece shows at once.
  for (const [name, character] of Object.entries(CHARACTERS)) {
    const { head, face, neck, held } = character.anchors
    if (face === undefined || neck === undefined || held === undefined) throw new Error(`${name} lacks an anchor`)
    const worn = composePixels({ character, outfit: withAll(character), background: null }, ANIMATIONS.idle, 0)
    expect(worn[head.y]?.[head.x], `${name} cap`).toBe(cap.palette.d)
    expect(worn[face.y]?.[face.x], `${name} glasses`).toBe(glasses.palette.L)
    expect(worn[neck.y]?.[neck.x], `${name} scarf`).toBe(scarf.palette.t)
    expect(worn[held.y]?.[held.x], `${name} flag`).toBe(flag.palette.p)
  }
})

test('layersOf takes the flag in the held slot only, and a held anchor needs a bobs declaration inside the rules', async () => {
  expect(layersOf({ character: 'classic', outfit: { held: 'flag' }, background: null }).outfit).toEqual({ held: flag })
  expect(() => layersOf({ character: 'foxkit', outfit: { head: 'flag' }, background: null })).toThrow('accessory "flag" belongs in the held slot, not head')
  expect(() => layersOf({ character: 'foxkit', outfit: { held: 'cap' }, background: null })).toThrow('accessory "cap" belongs in the head slot, not held')

  const { held: _held, ...rest } = foxkit.bobs
  expect(() => defineCharacter({ ...foxkit, name: 'unsure', bobs: rest })).toThrow('character "unsure" does not declare whether the slot "held" bobs')
  expect(() => defineCharacter({ ...foxkit, name: 'floating', bobs: { ...foxkit.bobs, held: true } })).toThrow(
    'character "floating" declares the slot "held" as bobbing, but its anchor is outside the headRegion',
  )
  expect(() => defineCharacter({ ...foxkit, name: 'offstage', anchors: { ...foxkit.anchors, held: { x: 18, y: 4 } } })).toThrow(
    'character "offstage" has the anchor "held" off the stage',
  )
})
