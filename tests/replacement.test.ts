import { expect } from 'claude-code/testing'
import { foxkit } from '../hooks/sprite/characters/foxkit'
import { defineCharacter } from '../hooks/sprite/compose'
import { ANIMATIONS, CHARACTERS, requireReplacements } from '../hooks/sprite/registry'
import type { Animation, Character } from '../hooks/sprite/types'
import { BURNS, HITS, isStruck, MIN_STRIKE_FRAMES, strikeSteps } from '../hooks/strike'
import { test } from './world'

// The load checks for a character's replacements. What plays is in replacement-lookup.test.ts. These tests
// call the checks directly: a character registered from a test is not seen by the running mod.

type Replacements = NonNullable<Character['animations']>
const withReplacements = (name: string, animations: Replacements): Character => defineCharacter({ ...foxkit, name, animations })

/** A replacement animation with the given number of frames, for the load checks only. */
const framesOf = (frames: number): Animation => ({ ...ANIMATIONS.cheer, frames })

test('a replacement for "ticket done" with fewer frames than the strike has steps before the burn is refused, naming the animation and the needed frames', async () => {
  const catalog = { stub: framesOf(MIN_STRIKE_FRAMES - 1), enough: framesOf(MIN_STRIKE_FRAMES) }
  expect(() => requireReplacements(withReplacements('owl', { 'ticket-done': 'stub' }), catalog)).toThrow(
    `sprite: character "owl" replaces "ticket-done" with "stub", which has ${MIN_STRIKE_FRAMES - 1} frames; "ticket-done" needs at least ${MIN_STRIKE_FRAMES}`,
  )
  expect(() => requireReplacements(withReplacements('owl', { 'ticket-done': 'enough' }), catalog)).not.toThrow()
  // The fewest frames accepted still show the flash and a struck burn step; one frame fewer would not show the burn.
  const steps = strikeSteps(catalog.enough)
  expect(HITS).toBeLessThan(steps)
  expect(isStruck(BURNS, steps)).toBe(true)
  expect(isStruck(BURNS, strikeSteps(catalog.stub))).toBe(false)
  // Another state has no strike to keep in step with.
  expect(() => requireReplacements(withReplacements('owl', { working: 'stub' }), catalog)).not.toThrow()
})

test('a character that names an animation that does not exist is refused, naming the state and the animations that exist', async () => {
  const owl = withReplacements('owl', { searching: 'hoot' })
  expect(() => requireReplacements(owl)).toThrow(
    `sprite: character "owl" names the animation "hoot" for "searching", which does not exist; known: ${Object.keys(ANIMATIONS).join(', ')}`,
  )
  expect(() => requireReplacements(withReplacements('owl', { searching: 'constructor' }))).toThrow('which does not exist')
})

test('a state left undefined names nothing and is not refused', async () => {
  const owl = withReplacements('owl', { working: undefined })
  expect(() => requireReplacements(owl)).not.toThrow()
})

test('a character may not replace the resting animation, or name a state that does not exist', async () => {
  expect(() => requireReplacements(withReplacements('owl', { resting: 'cheer' }))).toThrow('cannot replace "resting"')
  expect(() => requireReplacements(withReplacements('owl', { dancing: 'cheer' } as unknown as Replacements))).toThrow('no state named "dancing"')
})

test('the shipped characters name nothing and still pass the load checks', async () => {
  for (const character of Object.values(CHARACTERS)) {
    expect(character.animations, character.name).toBeUndefined()
    expect(() => requireReplacements(character), character.name).not.toThrow()
  }
})
