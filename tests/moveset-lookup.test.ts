import { expect } from 'claude-code/testing'
import { createActivity, type Shown } from '../hooks/activity'
import { playsFor } from '../hooks/sprite'
import { foxkit } from '../hooks/sprite/characters/foxkit'
import { defineCharacter } from '../hooks/sprite/compose'
import { setSavedLook } from '../hooks/sprite/look-in-use'
import { AMBIENT, type AmbientName, ANIMATIONS, animationNameOf, animationOf, CHARACTERS, PLAIN } from '../hooks/sprite/registry'
import { type Character, MOMENTS, type Moment } from '../hooks/sprite/types'
import { BURNS, isStruck, STRIKE_REST_STEPS, strikeSteps } from '../hooks/strike'
import { test } from './world'

// What plays for a character with its own moveset. This file imports nothing that the moveset work added,
// so on code without a moveset these tests fail by their assertions, not by a missing export.
// They work on the parts directly: a character registered from a test is not seen by the running mod.

const withMoveset = (name: string, moveset: Record<string, string>): Character => defineCharacter({ ...foxkit, name, moveset } as Character)

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

test('a character that names an animation for a moment plays it there, and the plain default for every other moment', async () => {
  const owl = withMoveset('owl', { 'ticket-done': 'cheer', working: 'shrug' })
  expect(animationOf(owl, 'ticket-done')).toBe(ANIMATIONS.cheer)
  expect(animationOf(owl, 'working')).toBe(ANIMATIONS.shrug)
  for (const moment of ['searching', 'search-failed', 'set-done', 'resting'] as const) {
    expect(animationOf(owl, moment), moment).toBe(ANIMATIONS[PLAIN[moment]])
  }
})

test('a name left undefined for a moment counts as naming nothing, and plays the plain default', async () => {
  const owl = withMoveset('owl', { working: undefined as unknown as string })
  expect(animationOf(owl, 'working')).toBe(ANIMATIONS.nod)
})

test('switching the character switches the animation played for the next moment, and switching back restores the first one', async () => {
  const owl = withMoveset('owl', { 'ticket-done': 'cheer' })
  await registered(owl, async () => {
    expect(playsFor('ticket-done')).toBe(ANIMATIONS.zap)
    setSavedLook({ character: 'owl' })
    expect(playsFor('ticket-done')).toBe(ANIMATIONS.cheer)
    expect(playsFor('working')).toBe(ANIMATIONS.nod)
    setSavedLook({ character: 'foxkit' })
    expect(playsFor('ticket-done')).toBe(ANIMATIONS.zap)
  })
})

test('a strike for a moveset entry for "ticket done" draws the frames of the named animation in order, then ends after the steps of those frames and the rest step', async () => {
  const owl = withMoveset('owl', { 'ticket-done': 'cheer' })
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
    moment => animationOf(owl, moment),
  )
  const seen: number[] = []
  let started: number | undefined
  let ended = false
  activity.queue({
    moment: 'ticket-done',
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

test('a moment left out of the moveset plays its plain default, for a character with no moveset at all', async () => {
  const bare = defineCharacter({ ...foxkit, name: 'bare', moveset: undefined })
  for (const moment of MOMENTS) expect(animationOf(bare, moment), moment).toBe(ANIMATIONS[PLAIN[moment]])
})

test('the foxkit and the classic name the animations they played before, so they behave as before', async () => {
  const before = { working: 'write', searching: 'look', 'search-failed': 'shrug', 'ticket-done': 'zap', 'set-done': 'cheer' } as const
  for (const character of Object.values(CHARACTERS)) {
    for (const [moment, name] of Object.entries(before)) expect(animationNameOf(character, moment as Moment), `${character.name} ${moment}`).toBe(name)
    expect(animationOf(character, 'resting'), character.name).toBe(ANIMATIONS.idle)
  }
})

test('the library holds animations that no shipped moveset plays, and none of them is played for any moment (the walk is played by walking)', async () => {
  const played = new Set(Object.values(CHARACTERS).flatMap(character => MOMENTS.map(moment => animationNameOf(character, moment))))
  const unused = Object.keys(ANIMATIONS).filter(name => !played.has(name) && !AMBIENT.includes(name as AmbientName))
  expect(unused).toEqual(['nod', 'dip', 'sink', 'hop', 'bounce', 'walk'])
})
