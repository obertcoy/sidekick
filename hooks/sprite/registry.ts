import { MIN_STRIKE_FRAMES } from '../strike'
import { cap } from './accessories/cap'
import { flag } from './accessories/flag'
import { glasses } from './accessories/glasses'
import { scarf } from './accessories/scarf'
import { blink } from './animations/blink'
import { cheer } from './animations/cheer'
import { idle } from './animations/idle'
import { look } from './animations/look'
import { shrug } from './animations/shrug'
import { write } from './animations/write'
import { zap } from './animations/zap'
import { dusk } from './backgrounds/dusk'
import { classic } from './characters/classic'
import { foxkit } from './characters/foxkit'
import type { Accessory, Animation, Background, Character, Look, Slot, State } from './types'
import { REPLACEABLE_STATES, STATE_NAMES } from './types'

// The part catalog: every part by name, and the rules that hold between parts. Immutable; the look in
// use (what was chosen, what is drawn) is in ./look-in-use.ts. Adding a character, animation, accessory
// or background is its file plus one line here.

export const CHARACTERS: Readonly<Record<string, Character>> = { foxkit, classic }

export const ANIMATIONS = { idle, write, zap, look, shrug, cheer, blink } as const satisfies Record<string, Animation>

/** What the sidekick is shown doing, and the animation that plays for each. */
export const STATES = {
  working: 'write',
  searching: 'look',
  'search-failed': 'shrug',
  'ticket-done': 'zap',
  'set-done': 'cheer',
  resting: 'idle',
} as const satisfies Record<State, keyof typeof ANIMATIONS>

export type { State }

/** The part named `name` in a catalog map, or undefined; only its own names count. */
export const found = <T>(registry: Readonly<Record<string, T>>, name: string): T | undefined => (Object.hasOwn(registry, name) ? registry[name] : undefined)

/** The name of the animation that plays for a state, for a character: its own replacement, else the shared one. */
export const animationNameOf = (character: Character, state: State): string => character.animations?.[state] ?? STATES[state]

/**
 * What plays for a state, for a character. The one lookup: the activity times by it and the pane draws by it.
 * A character that names an animation for the state plays that one; otherwise the shared one. The names are checked at load (`requireReplacements`).
 */
export const animationOf = (character: Character, state: State): Animation => ANIMATIONS[animationNameOf(character, state) as keyof typeof ANIMATIONS]

/** The fewest frames an animation needs to play for each replaceable state. */
const MIN_FRAMES = {
  working: 1,
  searching: 1,
  'search-failed': 1,
  'ticket-done': MIN_STRIKE_FRAMES,
  'set-done': 1,
} as const satisfies Record<(typeof REPLACEABLE_STATES)[number], number>

/**
 * Refuses a character whose replacements cannot play: a state it cannot replace, an animation that does not exist
 * (the message names the ones that do), or one with too few frames for its state. Checked against `catalog`, the shared animations unless given.
 */
export const requireReplacements = (character: Character, catalog: Readonly<Record<string, Animation>> = ANIMATIONS): void => {
  for (const [state, name] of Object.entries(character.animations ?? {})) {
    // A state left undefined names nothing, as one left out does.
    if (name === undefined) continue
    const replaceable = REPLACEABLE_STATES.find(one => one === state)
    if (replaceable === undefined) {
      const why = (STATE_NAMES as readonly string[]).includes(state)
        ? `cannot replace "${state}"`
        : `names the state "${state}"; there is no state named "${state}"`
      throw new Error(`sprite: character "${character.name}" ${why}; replaceable: ${REPLACEABLE_STATES.join(', ')}`)
    }
    const animation = found(catalog, name)
    if (animation === undefined) {
      throw new Error(
        `sprite: character "${character.name}" names the animation "${name}" for "${state}", which does not exist; known: ${Object.keys(catalog).join(', ')}`,
      )
    }
    const least = MIN_FRAMES[replaceable]
    if (animation.frames < least) {
      throw new Error(
        `sprite: character "${character.name}" replaces "${state}" with "${name}", which has ${animation.frames} frames; "${state}" needs at least ${least}`,
      )
    }
  }
}

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
      for (const pose of animation.frame(step, character.anchors).poses ?? []) {
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
 * The animations every character plays outside any state, as ambient motion. Ticket 09 schedules from this list, and the load check
 * covers each of them for every character. A new ambient animation is its file, its catalog line and a name here.
 */
export const AMBIENT = ['blink'] as const satisfies readonly (keyof typeof ANIMATIONS)[]
export type AmbientName = (typeof AMBIENT)[number]

// Checked at load for each character: its replacements first, then the anchors and poses of exactly what it plays. That is the animation
// of each state through the lookup (named with its state, "zap (ticket-done)"), plus each ambient one (by plain name). An animation
// that the character displaces (the shared zap, for a character with its own ticket-done) is not played, so it is not checked.
export const requirePlayed = (character: Character, catalog: Readonly<Record<string, Animation>> = ANIMATIONS, ambient: readonly string[] = AMBIENT): void => {
  requireReplacements(character, catalog)
  const byState = STATE_NAMES.flatMap(state => {
    const name = animationNameOf(character, state)
    const animation = found(catalog, name)
    return animation === undefined ? [] : [[`${name} (${state})`, animation] as const]
  })
  const byAmbient = ambient.map(name => {
    const animation = found(catalog, name)
    if (animation === undefined) throw new Error(`sprite: the ambient animation "${name}" does not exist; known: ${Object.keys(catalog).join(', ')}`)
    return [name, animation] as const
  })
  const played = Object.fromEntries([...byState, ...byAmbient])
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
