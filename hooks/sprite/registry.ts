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
import type { Accessory, Animation, Background, Character, Layers, Look, Outfit, SavedLook, Slot } from './types'

// Every part by name. Adding a character, animation, accessory or background is its file plus one line here.

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

export const ACCESSORIES: Readonly<Record<string, Accessory>> = { cap, flag, glasses, scarf }

export const BACKGROUNDS: Readonly<Record<string, Background>> = { dusk }

/** The look nothing was chosen for: the bare foxkit. */
export const DEFAULT_LOOK: Look = { character: 'foxkit', outfit: {}, background: null }

/** The global look the developer chose, as the mod's store last held it; nothing chosen is an empty object. */
let saved: SavedLook = {}

/** The current project's override: only the parts the developer set for this project, and the root it was read for. */
let override: SavedLook = {}
let overrideRoot: string | undefined

/** The root the session is in right now, as register.tsx last read it. */
let currentRoot: string | undefined

/** Replaces the global look. register.tsx calls it when the store is read at session start and when the look command saves. */
export const setSavedLook = (next: SavedLook): void => {
  saved = next
}

/** Replaces the current project's override, on the same occasions, with the root it belongs to. */
export const setProjectLook = (next: SavedLook, root: string | undefined): void => {
  override = next
  overrideRoot = root
}

/** Tells the registry which project the session is in, so an override read for another project is never drawn. */
export const setCurrentRoot = (root: string | undefined): void => {
  currentRoot = root
}

/** The root the override in memory was read for. */
export const projectRoot = (): string | undefined => overrideRoot

export const savedLook = (): SavedLook => saved

/** The override of the current project; empty when the one in memory belongs to another project. */
export const projectLook = (): SavedLook => (overrideRoot !== undefined && overrideRoot === currentRoot ? override : {})

/** What the sidekick looks like in the pane right now: the default, then the global look's parts, then the project's. Called at each refresh, never fixed at load. */
export const currentLook = (): Look => {
  const outfit: Partial<Record<Slot, string>> = { ...DEFAULT_LOOK.outfit }
  const mine = projectLook()
  for (const layer of [saved, mine]) {
    for (const slot of Object.keys(layer.outfit ?? {}) as Slot[]) {
      const name = layer.outfit?.[slot]
      if (name === undefined) continue
      if (name === null) delete outfit[slot]
      else outfit[slot] = name
    }
  }

  return {
    character: mine.character ?? saved.character ?? DEFAULT_LOOK.character,
    outfit,
    background: mine.background === undefined ? (saved.background ?? DEFAULT_LOOK.background) : mine.background,
  }
}

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
  outfit: Object.fromEntries(
    Object.entries(look.outfit).map(([slot, name]) => {
      const accessory = pick('accessory', ACCESSORIES, name)
      if (accessory.slot !== slot) {
        throw new Error(`sprite: accessory "${name}" belongs in the ${accessory.slot} slot, not ${slot}`)
      }

      return [slot, accessory]
    }),
  ) as Outfit,
  background: look.background === null ? null : pick('background', BACKGROUNDS, look.background),
})

/** A part of a saved look that cannot be drawn: which part, and why in a few words. Everything dropped is `isReported` on the pane except an accessory for a slot the current character lacks. */
export type Dropped = { readonly part: 'character' | Slot | 'background'; readonly why: string; readonly isReported: boolean }

const found = <T>(registry: Readonly<Record<string, T>>, name: string): T | undefined => (Object.hasOwn(registry, name) ? registry[name] : undefined)

/**
 * Like `layersOf`, but never throws: an unknown character is drawn as the foxkit, and an unknown accessory or
 * background, an accessory in a slot it does not belong to, or one for a slot the character lacks is left out.
 * The look itself is not touched, so a part that becomes drawable again comes back.
 */
export const resolve = (look: Look): { readonly layers: Layers; readonly dropped: readonly Dropped[] } => {
  const dropped: Dropped[] = []
  const own = found(CHARACTERS, look.character)
  if (own === undefined) {
    dropped.push({ part: 'character', why: `no character named ${look.character}, drawn as ${foxkit.name}`, isReported: true })
  }
  const character = own ?? foxkit
  const outfit: Partial<Record<Slot, Accessory>> = {}
  for (const slot of Object.keys(look.outfit) as Slot[]) {
    const name = look.outfit[slot]
    if (name === undefined) continue
    const accessory = found(ACCESSORIES, name)
    if (accessory === undefined) dropped.push({ part: slot, why: `no accessory named ${name}`, isReported: true })
    else if (accessory.slot !== slot) {
      dropped.push({ part: slot, why: `${name} belongs in the ${accessory.slot} slot, not ${slot}`, isReported: true })
    } else if (character.anchors[slot] === undefined) {
      dropped.push({ part: slot, why: `${character.name} has no ${slot} slot`, isReported: false })
    } else outfit[slot] = accessory
  }
  let background: Background | null = null
  if (look.background !== null) {
    background = found(BACKGROUNDS, look.background) ?? null
    if (background === null) dropped.push({ part: 'background', why: `no background named ${look.background}`, isReported: true })
  }

  return { layers: { character, outfit, background }, dropped }
}

/** What the pane last saw, so its line about dropped parts shows when the dropped parts change and clears when the look next changes. */
let seen = { look: '', dropped: '', line: '' }

/** The layers to draw for the look now. Called on each paint and render; it also keeps the pane's line up to date. */
export const drawable = (): Layers => {
  const look = currentLook()
  const { layers, dropped } = resolve(look)
  const key = JSON.stringify(look)
  const names = dropped.filter(one => one.isReported).map(one => one.why).join(', ')
  if (key !== seen.look) seen = { look: key, dropped: seen.dropped, line: '' }
  if (names !== seen.dropped) seen = { look: key, dropped: names, line: names }

  return layers
}

/** The one dim line naming what the pane left out of the look, or empty. Valid after `drawable()` has run for this paint. */
export const droppedLine = (): string => seen.line

/** What the look command marks as not drawn, per part. */
export const droppedOf = (look: Look): readonly Dropped[] => resolve(look).dropped
