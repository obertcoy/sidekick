import { expect } from 'claude-code/testing'
import { foxkit } from '../hooks/sprite/characters/foxkit'
import { defineCharacter } from '../hooks/sprite/compose'
import { ANIMATIONS, CHARACTERS, PLAIN, requireDeclaration, requireMoveset, requirePlainDefaults, requirePlayed } from '../hooks/sprite/registry'
import { type AnchorName, type Animation, type Character, MOMENTS, REQUIRED_ANCHORS } from '../hooks/sprite/types'
import { BURNS, HITS, isStruck, MIN_STRIKE_FRAMES, strikeSteps } from '../hooks/strike'
import { test } from './world'

// The load checks for a character's moveset and for the library. What plays is in moveset-lookup.test.ts. These tests
// call the checks directly: a character registered from a test is not seen by the running mod.

type Moveset = NonNullable<Character['moveset']>
const withMoveset = (name: string, moveset: Moveset): Character => defineCharacter({ ...foxkit, name, moveset })

/** An animation with the given number of frames, for the load checks only. */
const framesOf = (frames: number): Animation => ({ ...ANIMATIONS.cheer, frames })

test('a moveset entry for "ticket done" with fewer frames than the strike has steps before the burn is refused, naming the animation and the needed frames', async () => {
  const catalog = { stub: framesOf(MIN_STRIKE_FRAMES - 1), enough: framesOf(MIN_STRIKE_FRAMES) }
  expect(() => requireMoveset(withMoveset('owl', { 'ticket-done': 'stub' }), catalog)).toThrow(
    `sprite: character "owl" plays "stub" for "ticket-done", which has ${MIN_STRIKE_FRAMES - 1} frames; "ticket-done" needs at least ${MIN_STRIKE_FRAMES}`,
  )
  expect(() => requireMoveset(withMoveset('owl', { 'ticket-done': 'enough' }), catalog)).not.toThrow()
  // The fewest frames accepted still show the flash and a struck burn step; one frame fewer would not show the burn.
  const steps = strikeSteps(catalog.enough)
  expect(HITS).toBeLessThan(steps)
  expect(isStruck(BURNS, steps)).toBe(true)
  expect(isStruck(BURNS, strikeSteps(catalog.stub))).toBe(false)
  // Another moment has no strike to keep in step with.
  expect(() => requireMoveset(withMoveset('owl', { working: 'stub' }), catalog)).not.toThrow()
})

test('an animation with strike beats of its own needs the frames those beats need for "ticket done", and a beat out of order is refused in the library', async () => {
  // Beats that land at step 8 flash at 9 and burn from 10, so the animation needs 12 frames, more than the default seven.
  const late = { ...framesOf(MIN_STRIKE_FRAMES + 1), strikeAt: { leaves: 4, lands: 8 } }
  const catalog = { short: late, long: { ...late, frames: 12 } }
  expect(() => requireMoveset(withMoveset('owl', { 'ticket-done': 'short' }), catalog)).toThrow(
    'sprite: character "owl" plays "short" for "ticket-done", which has 8 frames; "ticket-done" needs at least 12',
  )
  expect(() => requireMoveset(withMoveset('owl', { 'ticket-done': 'long' }), catalog)).not.toThrow()
  // The same animation is no harder to play for another moment.
  expect(() => requireMoveset(withMoveset('owl', { working: 'short' }), catalog)).not.toThrow()
  // The library check refuses beats that cannot be kept in step with, whether or not anything plays the animation.
  expect(() => requireDeclaration('late', catalog.long)).not.toThrow()
  expect(() => requireDeclaration('late', { ...catalog.long, strikeAt: { leaves: 8, lands: 4 } })).toThrow(
    'sprite: the animation "late" has the strike beats leaves 8 and lands 4',
  )
  expect(() => requireDeclaration('late', catalog.short)).toThrow('the animation "late" has 8 frames, and the strike beats it declares need at least 12')
})

test('a character that names an animation that does not exist is refused, naming the moment and the animations that exist', async () => {
  const owl = withMoveset('owl', { searching: 'hoot' })
  expect(() => requireMoveset(owl)).toThrow(
    `sprite: character "owl" names the animation "hoot" for "searching", which does not exist; known: ${Object.keys(ANIMATIONS).join(', ')}`,
  )
  expect(() => requireMoveset(withMoveset('owl', { searching: 'constructor' }))).toThrow('which does not exist')
})

test('a moment left undefined names nothing and is not refused', async () => {
  const owl = withMoveset('owl', { working: undefined })
  expect(() => requireMoveset(owl)).not.toThrow()
})

test('a character may name an animation for resting, but not for a moment that does not exist', async () => {
  expect(() => requireMoveset(withMoveset('owl', { resting: 'idle' }))).not.toThrow()
  expect(() => requireMoveset(withMoveset('owl', { dancing: 'cheer' } as unknown as Moveset))).toThrow('no moment named "dancing"')
})

test('the shipped characters name the animations they play, and still pass the load checks; the foxkit plays what it always played', async () => {
  const shared = { working: 'write', searching: 'look', 'search-failed': 'shrug' } as const
  expect(CHARACTERS.foxkit?.moveset).toEqual({ ...shared, 'ticket-done': 'zap', 'set-done': 'cheer' })
  // The classic has the storm, the jump and the power-up of its own.
  expect(CHARACTERS.classic?.moveset).toEqual({ ...shared, 'ticket-done': 'thunder', 'set-done': 'jump', 'last-started': 'powerUp' })
  for (const character of Object.values(CHARACTERS)) {
    expect(() => requireMoveset(character), character.name).not.toThrow()
    expect(() => requirePlayed(character), character.name).not.toThrow()
  }
})

// The plain defaults: what any character can play for a moment it leaves out.

test('every moment has a plain default in the library, with at least the frames its moment needs, and the ticket-done one can keep the strike in step', async () => {
  expect(Object.keys(PLAIN)).toEqual([...MOMENTS])
  expect(() => requirePlainDefaults()).not.toThrow()
  expect(ANIMATIONS[PLAIN['ticket-done']].frames).toBeGreaterThanOrEqual(MIN_STRIKE_FRAMES)
})

test('each plain default needs only the anchors every character has and no pose, so a character with the bare minimum can play all of them', async () => {
  for (const moment of MOMENTS) {
    const animation = ANIMATIONS[PLAIN[moment]]
    for (const need of animation.needs) expect(REQUIRED_ANCHORS as readonly string[], `${moment} needs ${need}`).toContain(need)
    expect(animation.poses, moment).toEqual([])
  }
  // A character with only a head, a feet anchor and no poses or ambient animations plays every moment.
  const { head, feet } = foxkit.anchors
  const bare = defineCharacter({
    ...foxkit,
    name: 'bare',
    anchors: { head, feet },
    bobs: { head: true },
    poses: undefined,
    moveset: undefined,
    ambient: undefined,
  })
  expect(() => requirePlayed(bare)).not.toThrow()
})

test('a plain default that needs an anchor beyond head and feet, asks for a pose, is missing or has too few frames is refused, naming the moment', async () => {
  expect(() => requirePlainDefaults({ ...ANIMATIONS, nod: ANIMATIONS.look }, PLAIN)).toThrow(
    'sprite: the plain default for "working" ("nod") needs the anchors ears; a plain default may need only head, feet',
  )
  expect(() => requirePlainDefaults({ ...ANIMATIONS, nod: { ...ANIMATIONS.nod, poses: ['blink'] } }, PLAIN)).toThrow(
    'the plain default for "working" ("nod") asks for the poses blink; a plain default asks for none',
  )
  expect(() => requirePlainDefaults({ ...ANIMATIONS, hop: { ...ANIMATIONS.hop, frames: MIN_STRIKE_FRAMES - 1 } }, PLAIN)).toThrow(
    `the plain default for "ticket-done" ("hop") has ${MIN_STRIKE_FRAMES - 1} frames; "ticket-done" needs at least ${MIN_STRIKE_FRAMES}`,
  )
  expect(() => requirePlainDefaults(ANIMATIONS, { ...PLAIN, working: 'hoot' })).toThrow('the plain default for "working" is "hoot", which does not exist')
})

test('a moveset that names an animation whose anchors or poses the character lacks is refused at load, naming what is missing', async () => {
  const { reach: _reach, ...withoutReach } = foxkit.anchors
  const reachless = defineCharacter({ ...foxkit, name: 'reachless', anchors: withoutReach })
  expect(() => requirePlayed(reachless)).toThrow('sprite: character "reachless" is missing the anchor "reach", which the animation "zap (ticket-done)" needs')
  // Left out of the moveset, the moment plays its plain default and nothing is missing.
  const { 'ticket-done': _zap, ...rest } = foxkit.moveset ?? {}
  expect(() => requirePlayed({ ...reachless, moveset: rest })).not.toThrow()
  const { armUp: _armUp, ...withoutArmUp } = foxkit.poses ?? {}
  expect(() => requirePlayed({ ...foxkit, name: 'armless', poses: withoutArmUp })).toThrow('has no pose "armUp", which the animation "zap (ticket-done)" needs')
})

// The library: an animation no moveset names is not played, but keeps its own declaration.

test('a library animation that no moveset uses is checked against its own declaration', async () => {
  const sneaky: Animation = { needs: [], poses: [], frames: 2, msPerFrame: 1, once: false, hides: [], frame: () => ({ poses: ['blink'] }) }
  expect(() => requireDeclaration('sneaky', sneaky)).toThrow('the animation "sneaky" asks for the pose "blink" at step 0, but does not declare it')
  const greedy: Animation = {
    ...sneaky,
    frame: (_step, at) => {
      const { neck } = at as unknown as { neck: { x: number; y: number } }

      return { dots: [[neck.x, neck.y, 'ink']] }
    },
  }
  expect(() => requireDeclaration('greedy', greedy)).toThrow(
    'the animation "greedy" fails at step 0 when given only the anchors it needs (none); it reads one it does not declare',
  )
  expect(() => requireDeclaration('empty', { ...sneaky, frame: () => ({}), frames: 0 })).toThrow('the animation "empty" has 0 frames')
  expect(() => requireDeclaration('odd', { ...sneaky, frame: () => ({}), needs: ['wing' as AnchorName] })).toThrow('needs "wing", which is not an anchor')
  // A read that does not throw is caught too: optional chaining on an anchor the animation does not declare.
  const peeking: Animation = { ...sneaky, frame: (_step, at) => ({ bob: (at as { face?: { y: number } }).face?.y ?? 0 }) }
  expect(() => requireDeclaration('peeking', peeking)).toThrow('the animation "peeking" fails at step 0')
  for (const [name, animation] of Object.entries(ANIMATIONS)) expect(() => requireDeclaration(name, animation), name).not.toThrow()
})
