import { expect, test } from 'claude-code/testing'
import { createActivity } from '../hooks/activity'
import { playsFor } from '../hooks/sprite'
import { foxkit } from '../hooks/sprite/characters/foxkit'
import { defineCharacter } from '../hooks/sprite/compose'
import { setSavedLook } from '../hooks/sprite/look-in-use'
import { ANIMATIONS, animationOf, CHARACTERS, requireReplacements, STATES } from '../hooks/sprite/registry'
import type { Animation, Character } from '../hooks/sprite/types'
import { BURNS, isStruck, MIN_STRIKE_FRAMES, STRIKE_REST_STEPS, strikeSteps } from '../hooks/strike'

// A character may name its own animation for a state. These tests work on the parts directly: a character
// registered from a test is not seen by the running mod, which has its own copy of the sprite modules.

type Replacements = NonNullable<Character['animations']>
const withReplacements = (name: string, animations: Replacements): Character => defineCharacter({ ...foxkit, name, animations })

/** Registers `character` in the catalog while `run` runs, as the look command would find it. */
const registered = async (character: Character, run: () => Promise<void>): Promise<void> => {
  const catalog = CHARACTERS as Record<string, Character>
  catalog[character.name] = character
  try {
    await run()
  } finally {
    delete catalog[character.name]
    setSavedLook({})
  }
}

/** A replacement animation with the given number of frames, for the load checks only. */
const framesOf = (frames: number): Animation => ({ ...ANIMATIONS.cheer, frames })

test('a character that names an animation for a state plays it there, and the shared animation for every other state', async () => {
  const owl = withReplacements('owl', { 'ticket-done': 'cheer', working: 'shrug' })
  expect(animationOf(owl, 'ticket-done')).toBe(ANIMATIONS.cheer)
  expect(animationOf(owl, 'working')).toBe(ANIMATIONS.shrug)
  for (const state of ['searching', 'search-failed', 'set-done', 'resting'] as const) {
    expect(animationOf(owl, state), state).toBe(ANIMATIONS[STATES[state]])
  }
})

test('switching the character switches the animation played for the next state, and switching back restores the shared one', async () => {
  const owl = withReplacements('owl', { 'ticket-done': 'cheer' })
  await registered(owl, async () => {
    expect(playsFor('ticket-done')).toBe(ANIMATIONS.zap)
    setSavedLook({ character: 'owl' })
    expect(playsFor('ticket-done')).toBe(ANIMATIONS.cheer)
    expect(playsFor('working')).toBe(ANIMATIONS.write)
    setSavedLook({ character: 'foxkit' })
    expect(playsFor('ticket-done')).toBe(ANIMATIONS.zap)
  })
})

test('the ticket strike runs the whole of a replacement for "ticket done", from the first step to the last, in step with its frames', async () => {
  const owl = withReplacements('owl', { 'ticket-done': 'cheer' })
  const ticks: (() => void)[] = []
  const clock = {
    every: (_ms: number, fn: () => void) => {
      ticks.push(fn)

      return { cancel: () => ticks.pop() } as never
    },
  }
  const shown: Animation[] = []
  const activity = createActivity(
    clock,
    one => shown.push(one.animation),
    state => animationOf(owl, state),
  )
  const seen: number[] = []
  let total = 0
  let ended = false
  activity.queue({
    state: 'ticket-done',
    restSteps: STRIKE_REST_STEPS,
    onStart: steps => {
      total = steps
      seen.push(0)
    },
    onStep: step => seen.push(step),
    onEnd: () => {
      ended = true
    },
  })
  expect(total).toBe(strikeSteps(ANIMATIONS.cheer))
  expect(shown.at(-1)).toBe(ANIMATIONS.cheer)
  for (let tick = 0; tick < total + 2 && !ended; tick++) ticks.at(-1)?.()
  expect(ended).toBe(true)
  expect(seen).toEqual(Array.from({ length: total }, (_, step) => step))
  // The row is still struck at the burn and plain at the end.
  expect(isStruck(BURNS, total)).toBe(true)
  expect(isStruck(total - 1, total)).toBe(false)
})

test('a replacement for "ticket done" with fewer frames than the strike has steps before the burn is refused, naming the animation and the needed frames', async () => {
  const catalog = { stub: framesOf(MIN_STRIKE_FRAMES - 1), enough: framesOf(MIN_STRIKE_FRAMES) }
  expect(() => requireReplacements(withReplacements('owl', { 'ticket-done': 'stub' }), catalog)).toThrow(
    `sprite: character "owl" replaces "ticket-done" with "stub", which has ${MIN_STRIKE_FRAMES - 1} frames; "ticket-done" needs at least ${MIN_STRIKE_FRAMES}`,
  )
  expect(() => requireReplacements(withReplacements('owl', { 'ticket-done': 'enough' }), catalog)).not.toThrow()
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
