import { MIN_STRIKE_FRAMES } from '../strike'
import { cap } from './accessories/cap'
import { flag } from './accessories/flag'
import { glasses } from './accessories/glasses'
import { scarf } from './accessories/scarf'
import { blink } from './animations/blink'
import { cheekSpark } from './animations/cheekSpark'
import { cheer } from './animations/cheer'
import { earFlick } from './animations/earFlick'
import { idle } from './animations/idle'
import { look } from './animations/look'
import { bounce, dip, hop, nod, sink } from './animations/plain'
import { shrug } from './animations/shrug'
import { tailFlick } from './animations/tailFlick'
import { write } from './animations/write'
import { zap } from './animations/zap'
import { dusk } from './backgrounds/dusk'
import { classic } from './characters/classic'
import { foxkit } from './characters/foxkit'
import type { Accessory, Anchors, Animation, Background, Character, FramePlan, Look, Moment, Slot } from './types'
import { ANCHOR_NAMES, LIST_ANCHORS, MOMENTS, POSES, REQUIRED_ANCHORS } from './types'

// The part catalog: every part by name, and the rules that hold between parts. Immutable; the look in
// use (what was chosen, what is drawn) is in ./look-in-use.ts. Adding a character, animation, accessory
// or background is its file plus one line here.

export const CHARACTERS: Readonly<Record<string, Character>> = { foxkit, classic }

export const ANIMATIONS = {
  idle,
  write,
  zap,
  look,
  shrug,
  cheer,
  blink,
  tailFlick,
  earFlick,
  cheekSpark,
  nod,
  dip,
  sink,
  hop,
  bounce,
} as const satisfies Record<string, Animation>

/**
 * The plain default of each moment: the library animation that plays for it when a character's moveset leaves it out. Each uses only the anchors
 * every character has and no pose (`requirePlainDefaults` checks that at load). Resting is stillness.
 */
export const PLAIN = {
  working: 'nod',
  searching: 'dip',
  'search-failed': 'sink',
  'ticket-done': 'hop',
  'set-done': 'bounce',
  resting: 'idle',
} as const satisfies Record<Moment, keyof typeof ANIMATIONS>

export type { Moment }

/** The part named `name` in a catalog map, or undefined; only its own names count. */
export const found = <T>(registry: Readonly<Record<string, T>>, name: string): T | undefined => (Object.hasOwn(registry, name) ? registry[name] : undefined)

/** The name of the library animation that plays for a moment, for a character: the one its moveset names, else the moment's plain default. */
export const animationNameOf = (character: Character, moment: Moment): string => character.moveset?.[moment] ?? PLAIN[moment]

/**
 * What plays for a moment, for a character. The one lookup: the activity times by it and the pane draws by it.
 * The names are checked at load (`requireMoveset`).
 */
export const animationOf = (character: Character, moment: Moment): Animation => ANIMATIONS[animationNameOf(character, moment) as keyof typeof ANIMATIONS]

/** The fewest frames an animation needs to play for each moment. */
const MIN_FRAMES = {
  working: 1,
  searching: 1,
  'search-failed': 1,
  'ticket-done': MIN_STRIKE_FRAMES,
  'set-done': 1,
  resting: 1,
} as const satisfies Record<Moment, number>

/**
 * Refuses a moveset that cannot play: a moment that does not exist, an animation that is not in the library (the message names the ones that are),
 * or one with too few frames for its moment. Checked against `catalog`, the library unless given.
 */
export const requireMoveset = (character: Character, catalog: Readonly<Record<string, Animation>> = ANIMATIONS): void => {
  for (const [moment, name] of Object.entries(character.moveset ?? {})) {
    // A moment left undefined names nothing, as one left out does.
    if (name === undefined) continue
    const known = MOMENTS.find(one => one === moment)
    if (known === undefined) {
      throw new Error(
        `sprite: character "${character.name}" names the moment "${moment}"; there is no moment named "${moment}"; moments: ${MOMENTS.join(', ')}`,
      )
    }
    const animation = found(catalog, name)
    if (animation === undefined) {
      throw new Error(
        `sprite: character "${character.name}" names the animation "${name}" for "${moment}", which does not exist; known: ${Object.keys(catalog).join(', ')}`,
      )
    }
    const least = MIN_FRAMES[known]
    if (animation.frames < least) {
      throw new Error(
        `sprite: character "${character.name}" plays "${name}" for "${moment}", which has ${animation.frames} frames; "${moment}" needs at least ${least}`,
      )
    }
  }
}

/**
 * Refuses a plain default that not every character could play: one that is not in the library, needs an anchor beyond the required ones or a pose,
 * or has too few frames for its moment. Checked against `catalog` and `plain`, the library and the defaults unless given.
 */
export const requirePlainDefaults = (catalog: Readonly<Record<string, Animation>> = ANIMATIONS, plain: Readonly<Record<Moment, string>> = PLAIN): void => {
  for (const moment of MOMENTS) {
    const name = plain[moment]
    const animation = found(catalog, name)
    if (animation === undefined) {
      throw new Error(`sprite: the plain default for "${moment}" is "${name}", which does not exist; known: ${Object.keys(catalog).join(', ')}`)
    }
    const extra = animation.needs.filter(need => !(REQUIRED_ANCHORS as readonly string[]).includes(need))
    if (extra.length > 0) {
      throw new Error(
        `sprite: the plain default for "${moment}" ("${name}") needs the anchors ${extra.join(', ')}; a plain default may need only ${REQUIRED_ANCHORS.join(', ')}`,
      )
    }
    if (animation.poses.length > 0) {
      throw new Error(`sprite: the plain default for "${moment}" ("${name}") asks for the poses ${animation.poses.join(', ')}; a plain default asks for none`)
    }
    if (animation.frames < MIN_FRAMES[moment]) {
      throw new Error(`sprite: the plain default for "${moment}" ("${name}") has ${animation.frames} frames; "${moment}" needs at least ${MIN_FRAMES[moment]}`)
    }
  }
}
requirePlainDefaults()

/** Stage edges for the checks that run a frame without a stage: only what a frame is given, not where anything is. */
const EDGES = { skyTop: 0, ground: 0, left: 0, right: 0 } as const

/**
 * Refuses a library animation that does not keep its own declaration, whether or not any moveset plays it: its frame count and pace, the anchors it
 * needs (known names), and the poses it asks for at each step (declared ones). Its frames are worked out from the declared anchors alone, so a frame
 * that reads another anchor fails here.
 */
export const requireDeclaration = (name: string, animation: Animation): void => {
  const fail = (why: string): never => {
    throw new Error(`sprite: the animation "${name}" ${why}`)
  }
  if (!Number.isInteger(animation.frames) || animation.frames < 1) fail(`has ${animation.frames} frames; it needs a whole number, at least 1`)
  if (!(animation.msPerFrame > 0)) fail(`has ${animation.msPerFrame} ms per frame; it needs more than 0`)
  for (const need of animation.needs) {
    if (!(ANCHOR_NAMES as readonly string[]).includes(need)) fail(`needs "${need}", which is not an anchor; anchors: ${ANCHOR_NAMES.join(', ')}`)
  }
  for (const pose of animation.poses) {
    if (!(POSES as readonly string[]).includes(pose)) fail(`declares the pose "${pose}", which is not a pose; poses: ${POSES.join(', ')}`)
  }
  // Only the declared anchors, each at one point of the stage: a frame that reads any other anchor, even by optional chaining, throws.
  const point = { x: 0, y: 0 }
  const declared: Record<string, unknown> = Object.fromEntries(
    [...REQUIRED_ANCHORS, ...animation.needs].map(anchor => [anchor, (LIST_ANCHORS as readonly string[]).includes(anchor) ? [point] : point]),
  )
  const given = new Proxy(declared, {
    get: (target, key) => {
      if (typeof key === 'string' && key !== 'then' && !Object.hasOwn(target, key)) throw new Error(`reads the undeclared anchor "${key}"`)

      return Reflect.get(target, key)
    },
  })
  for (let step = 0; step < animation.frames; step++) {
    let plan: FramePlan
    try {
      plan = animation.frame(step, given as Anchors, EDGES)
    } catch {
      throw new Error(
        `sprite: the animation "${name}" fails at step ${step} when given only the anchors it needs (${animation.needs.join(', ') || 'none'}); it reads one it does not declare`,
      )
    }
    for (const pose of plan.poses ?? []) {
      if (!animation.poses.includes(pose)) fail(`asks for the pose "${pose}" at step ${step}, but does not declare it`)
    }
  }
}
for (const [name, animation] of Object.entries(ANIMATIONS)) requireDeclaration(name, animation)

/**
 * Refuses a character that lacks an anchor one of the given animations needs; the animations are those it plays, by name.
 * Where characters and animations meet, so each character file can still be checked alone by `defineCharacter`.
 */
export const requireAnchors = (character: Character, played: Readonly<Record<string, Animation>>): void => {
  for (const [name, animation] of Object.entries(played)) {
    for (const need of animation.needs) {
      if (character.anchors[need] === undefined) {
        throw new Error(`sprite: character "${character.name}" is missing the anchor "${need}", which the animation "${name}" needs`)
      }
    }
  }
}

/** Refuses a character that lacks a pose one of the given animations asks for; the same shape of check as `requireAnchors`. */
export const requirePoses = (character: Character, played: Readonly<Record<string, Animation>>): void => {
  for (const [name, animation] of Object.entries(played)) {
    for (const pose of animation.poses) {
      if (character.poses?.[pose] === undefined) {
        throw new Error(`sprite: character "${character.name}" has no pose "${pose}", which the animation "${name}" needs`)
      }
    }
  }
}

/**
 * Refuses an animation whose frames, played with this character's anchors, ask for a pose it did not declare.
 * The compiler stops this for animations made with `defineAnimation`; this guards the ones that got past it.
 */
export const requireDeclaredPoses = (character: Character, played: Readonly<Record<string, Animation>>): void => {
  for (const [name, animation] of Object.entries(played)) {
    for (let step = 0; step < animation.frames; step++) {
      for (const pose of animation.frame(step, character.anchors, EDGES).poses ?? []) {
        if (!animation.poses.includes(pose)) {
          throw new Error(
            `sprite: the animation "${name}" asks for the pose "${pose}" at step ${step} for character "${character.name}", but does not declare it`,
          )
        }
      }
    }
  }
}

/**
 * The shared catalog of ambient animations: the ones a character may play on its own while it rests. Each character lists the subset it
 * uses (`Character.ambient`), and the load check covers exactly those. A new ambient animation is its file, its catalog line and a name here.
 */
export const AMBIENT = ['blink', 'tailFlick', 'earFlick', 'cheekSpark'] as const satisfies readonly (keyof typeof ANIMATIONS)[]
export type AmbientName = (typeof AMBIENT)[number]

/** The ambient animations a character plays, in the order it lists them; none for a character that lists none. The names are checked at load (`requirePlayed`). */
export const ambientAnimationsOf = (character: Character): Animation[] =>
  (character.ambient ?? []).flatMap(name => {
    const animation = found<Animation>(ANIMATIONS, name)
    return animation === undefined || !(AMBIENT as readonly string[]).includes(name) ? [] : [animation]
  })

// Checked at load for each character: its moveset first, then the anchors and poses of exactly what it plays. That is the animation
// of each moment through the lookup (named with its moment, "zap (ticket-done)"), plus each ambient one the character lists (by plain name).
// An animation the character's moveset does not name for any moment, and does not list as ambient, is not played, so it is not checked here (the library check covers its own declaration).
// `ambient` is the names that count as ambient animations; the characters list only from it.
export const requirePlayed = (character: Character, catalog: Readonly<Record<string, Animation>> = ANIMATIONS, ambient: readonly string[] = AMBIENT): void => {
  requireMoveset(character, catalog)
  const byMoment = MOMENTS.flatMap(moment => {
    const name = animationNameOf(character, moment)
    const animation = found(catalog, name)
    return animation === undefined ? [] : [[`${name} (${moment})`, animation] as const]
  })
  const byAmbient = (character.ambient ?? []).map(name => {
    const animation = ambient.includes(name) ? found(catalog, name) : undefined
    if (animation === undefined) {
      throw new Error(`sprite: character "${character.name}" lists "${name}", which is not an ambient animation; ambient: ${ambient.join(', ')}`)
    }
    return [name, animation] as const
  })
  const played = Object.fromEntries([...byMoment, ...byAmbient])
  requireAnchors(character, played)
  requirePoses(character, played)
  requireDeclaredPoses(character, played)
}
for (const character of Object.values(CHARACTERS)) requirePlayed(character)

export const ACCESSORIES: Readonly<Record<string, Accessory>> = { cap, flag, glasses, scarf }

export const BACKGROUNDS: Readonly<Record<string, Background>> = { dusk }

/** The look nothing was chosen for: the bare foxkit. */
export const DEFAULT_LOOK: Look = { character: 'foxkit', outfit: {}, background: null }

/** The part named `name`; an unknown name throws, naming the ones that exist. */
export const pick = <T>(kind: string, registry: Readonly<Record<string, T>>, name: string): T => {
  const part = found(registry, name)
  if (part === undefined) {
    throw new Error(`sprite: no ${kind} named "${name}"; known: ${Object.keys(registry).join(', ')}`)
  }
  return part
}

// The default look must name a character that exists.
pick('character', CHARACTERS, DEFAULT_LOOK.character)

/** Why the accessory named `name` cannot go in `slot`, or undefined when it can. The one slot rule, whoever asks. */
export const slotRefusal = (name: string, accessory: Accessory, slot: Slot): string | undefined =>
  accessory.slot === slot ? undefined : `"${name}" is a ${accessory.slot} accessory and does not go in the ${slot} slot`
