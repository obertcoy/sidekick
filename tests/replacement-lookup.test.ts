import { expect } from 'claude-code/testing'
import { createActivity, type Shown } from '../hooks/activity'
import { playsFor } from '../hooks/sprite'
import { foxkit } from '../hooks/sprite/characters/foxkit'
import { defineCharacter } from '../hooks/sprite/compose'
import { setSavedLook } from '../hooks/sprite/look-in-use'
import { ANIMATIONS, animationOf, CHARACTERS, STATES } from '../hooks/sprite/registry'
import type { Character } from '../hooks/sprite/types'
import { BURNS, isStruck, STRIKE_REST_STEPS, strikeSteps } from '../hooks/strike'
import { test } from './world'

// What plays for a character that names its own animations. This file imports nothing that ticket 11 added,
// so on code without replacements these tests fail by their assertions, not by a missing export.
// They work on the parts directly: a character registered from a test is not seen by the running mod.

const withReplacements = (name: string, animations: Record<string, string>): Character => defineCharacter({ ...foxkit, name, animations } as Character)

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

test('a character that names an animation for a state plays it there, and the shared animation for every other state', async () => {
  const owl = withReplacements('owl', { 'ticket-done': 'cheer', working: 'shrug' })
  expect(animationOf(owl, 'ticket-done')).toBe(ANIMATIONS.cheer)
  expect(animationOf(owl, 'working')).toBe(ANIMATIONS.shrug)
  for (const state of ['searching', 'search-failed', 'set-done', 'resting'] as const) {
    expect(animationOf(owl, state), state).toBe(ANIMATIONS[STATES[state]])
  }
})

test('a name left undefined for a state counts as naming nothing', async () => {
  const owl = withReplacements('owl', { working: undefined as unknown as string })
  expect(animationOf(owl, 'working')).toBe(ANIMATIONS.write)
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

test('a strike for a replacement of "ticket done" draws the replacement frames in order, then ends after the steps of those frames and the rest step', async () => {
  const owl = withReplacements('owl', { 'ticket-done': 'cheer' })
  const expectedSteps = ANIMATIONS.cheer.frames + STRIKE_REST_STEPS
  const ticks: (() => void)[] = []
  const every = (_ms: number, fn: () => void) => {
    ticks.push(fn)

    return { cancel: () => ticks.pop() } as never
  }
  const clock = { every, after: every }
  const drawn: Shown[] = []
  const activity = createActivity(
    clock,
    one => drawn.push(one),
    state => animationOf(owl, state),
  )
  const seen: number[] = []
  let started: number | undefined
  let ended = false
  activity.queue({
    state: 'ticket-done',
    restSteps: STRIKE_REST_STEPS,
    onStart: steps => {
      started = steps
      seen.push(0)
    },
    onStep: step => seen.push(step),
    onEnd: () => {
      ended = true
    },
  })
  for (let tick = 0; tick < expectedSteps + 2 && !ended; tick++) ticks.at(-1)?.()
  expect(ended).toBe(true)
  expect(started).toBe(expectedSteps)
  expect(started).toBe(strikeSteps(ANIMATIONS.cheer))
  expect(seen).toEqual(Array.from({ length: expectedSteps }, (_, step) => step))
  expect(drawn.slice(0, ANIMATIONS.cheer.frames).map(one => ({ animation: one.animation, frame: one.frame }))).toEqual(
    Array.from({ length: ANIMATIONS.cheer.frames }, (_, frame) => ({ animation: ANIMATIONS.cheer, frame })),
  )
  // The row is still struck at the burn and plain at the last step.
  expect(isStruck(BURNS, expectedSteps)).toBe(true)
  expect(isStruck(expectedSteps - 1, expectedSteps)).toBe(false)
})
