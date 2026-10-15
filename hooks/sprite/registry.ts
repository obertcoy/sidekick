import { classic } from './characters/classic'
import { foxkit } from './characters/foxkit'
import { cheer } from './animations/cheer'
import { idle } from './animations/idle'
import { look } from './animations/look'
import { shrug } from './animations/shrug'
import { write } from './animations/write'
import { zap } from './animations/zap'
import { cap } from './accessories/cap'
import { flag } from './accessories/flag'
import { glasses } from './accessories/glasses'
import { scarf } from './accessories/scarf'
import { dusk } from './backgrounds/dusk'
import type { Accessory, Animation, Background, Character, Look, Slot } from './types'

// The part catalog: every part by name, and the rules that hold between parts. Immutable; the look in
// use (what was chosen, what is drawn) is in ./look-in-use.ts. Adding a character, animation, accessory
// or background is its file plus one line here.

export const CHARACTERS: Readonly<Record<string, Character>> = { foxkit, classic }

export const ANIMATIONS = { idle, write, zap, look, shrug, cheer } as const satisfies Record<string, Animation>

/** What the sidekick is shown doing, and the animation that plays for each. */
export const STATES = {
  working: 'write',
  searching: 'look',
  'search-failed': 'shrug',
  'ticket-done': 'zap',
  'set-done': 'cheer',
  resting: 'idle',
} as const satisfies Record<string, keyof typeof ANIMATIONS>

export type State = keyof typeof STATES

/**
 * What plays for a state, for a character. The one lookup: the activity times by it and the pane draws by it.
 * Every character plays the shared animation of the state for now; a character's own replacement (ticket 11) is added here.
 */
export const animationOf = (_character: Character, state: State): Animation => ANIMATIONS[STATES[state]]

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

// Every character plays what the lookup gives it for every state, so each is checked against all of those at load.
const STATE_NAMES = Object.keys(STATES) as State[]
for (const character of Object.values(CHARACTERS)) {
  requireAnchors(character, Object.fromEntries(STATE_NAMES.map(state => [`${STATES[state]} (${state})`, animationOf(character, state)])))
}

export const ACCESSORIES: Readonly<Record<string, Accessory>> = { cap, flag, glasses, scarf }

export const BACKGROUNDS: Readonly<Record<string, Background>> = { dusk }

/** The look nothing was chosen for: the bare foxkit. */
export const DEFAULT_LOOK: Look = { character: 'foxkit', outfit: {}, background: null }

/** The part named `name` in a catalog map, or undefined; only its own names count. */
export const found = <T>(registry: Readonly<Record<string, T>>, name: string): T | undefined =>
  Object.hasOwn(registry, name) ? registry[name] : undefined

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
