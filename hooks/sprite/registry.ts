import { classic } from './characters/classic'
import { foxkit } from './characters/foxkit'
import { idle } from './animations/idle'
import { write } from './animations/write'
import { zap } from './animations/zap'
import { cap } from './outfits/cap'
import { dusk } from './backgrounds/dusk'
import type { Animation, Background, Character, Layers, Look, Outfit } from './types'

// Every part by name. Adding a character, animation, outfit or background is its file plus one line here.

export const CHARACTERS: Readonly<Record<string, Character>> = { foxkit, classic }

/** The keys are the modes register.tsx plays: idle, write and zap. */
export const ANIMATIONS = { idle, write, zap } as const satisfies Record<string, Animation>

export const OUTFITS: Readonly<Record<string, Outfit>> = { cap }

export const BACKGROUNDS: Readonly<Record<string, Background>> = { dusk }

/** What the sidekick looks like in the pane. */
export const LOOK: Look = { character: 'foxkit', outfit: null, background: null }

const pick = <T>(kind: string, registry: Readonly<Record<string, T>>, name: string): T => {
  const part = Object.hasOwn(registry, name) ? registry[name] : undefined
  if (part === undefined) {
    throw new Error(`sprite: no ${kind} named "${name}"; known: ${Object.keys(registry).join(', ')}`)
  }
  return part
}

/** Looks up each name of a look; an unknown name throws, naming the ones that exist. */
export const layersOf = (look: Look): Layers => ({
  character: pick('character', CHARACTERS, look.character),
  outfit: look.outfit === null ? null : pick('outfit', OUTFITS, look.outfit),
  background: look.background === null ? null : pick('background', BACKGROUNDS, look.background),
})
