import { heightRefusal } from './compose'
import { ACCESSORIES, BACKGROUNDS, CHARACTERS, DEFAULT_LOOK, found, pick, slotRefusal } from './registry'
import type { Accessory, Background, Character, Layers, Look, LookPart, Outfit, SavedLook, Slot } from './types'

// The look in use: what the developer chose (globally and for this project), resolved against the
// part catalog into what is drawn, and what that left out. Session state lives here, not in the catalog.

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

/** Tells the look in use which project the session is in, so an override read for another project is never drawn. */
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

/** Looks up each name of a look; an unknown name throws, naming the ones that exist. */
export const layersOf = (look: Look): Layers => ({
  character: pick('character', CHARACTERS, look.character),
  outfit: Object.fromEntries(
    Object.entries(look.outfit).map(([slot, name]) => {
      const accessory = pick('accessory', ACCESSORIES, name)
      const refusal = slotRefusal(name, accessory, slot as Slot)
      if (refusal !== undefined) throw new Error(`sprite: ${refusal}`)

      return [slot, accessory]
    }),
  ) as Outfit,
  background: look.background === null ? null : pick('background', BACKGROUNDS, look.background),
})

/** A part of a saved look that cannot be drawn: which part, and why in a few words. Everything dropped is `isReported` on the pane except an accessory for a slot the current character lacks. */
export type Dropped = { readonly part: LookPart; readonly why: string; readonly isReported: boolean }

/**
 * Like `layersOf`, but never throws: an unknown character is drawn as the default character, and an unknown accessory or
 * background, an accessory in a slot it does not belong to, or one for a slot the character lacks is left out.
 * The look itself is not touched, so a part that becomes drawable again comes back.
 */
export const resolve = (look: Look): { readonly layers: Layers; readonly dropped: readonly Dropped[] } => {
  const dropped: Dropped[] = []
  const fallback = pick('character', CHARACTERS, DEFAULT_LOOK.character)
  const own = found(CHARACTERS, look.character)
  if (own === undefined) {
    dropped.push({ part: 'character', why: `no character named ${look.character}, drawn as ${fallback.name}`, isReported: true })
  }
  const character: Character = own ?? fallback
  const outfit: Partial<Record<Slot, Accessory>> = {}
  for (const slot of Object.keys(look.outfit) as Slot[]) {
    const name = look.outfit[slot]
    if (name === undefined) continue
    const accessory = found(ACCESSORIES, name)
    const refusal = accessory === undefined ? undefined : slotRefusal(name, accessory, slot)
    if (accessory === undefined) dropped.push({ part: slot, why: `no accessory named ${name}`, isReported: true })
    else if (refusal !== undefined) dropped.push({ part: slot, why: refusal, isReported: true })
    else if (character.anchors[slot] === undefined) {
      dropped.push({ part: slot, why: `${character.name} has no ${slot} slot`, isReported: false })
    } else outfit[slot] = accessory
  }
  let background: Background | null = null
  if (look.background !== null) {
    background = found(BACKGROUNDS, look.background) ?? null
    if (background === null) dropped.push({ part: 'background', why: `no background named ${look.background}`, isReported: true })
    // A background can cap the stage's height; a character that needs more cannot stand on it.
    const cap = background?.heightCap
    const refusal = cap === undefined ? undefined : heightRefusal(character, cap)
    if (background !== null && refusal !== undefined) {
      dropped.push({ part: 'background', why: `${look.background} is left out: ${refusal}`, isReported: true })
      background = null
    }
  }

  return { layers: { character, outfit, background }, dropped }
}

/** The layers to draw for the look now. Resolved on each call and writes nothing. */
export const drawable = (): Layers => resolve(currentLook()).layers

/** The character drawn for the look now. */
export const characterInUse = (): Character => drawable().character

/** What the look command marks as not drawn, per part. */
export const droppedOf = (look: Look): readonly Dropped[] => resolve(look).dropped

/** What the pane last showed, so its line about dropped parts shows when the dropped parts change and clears when the look next changes. */
let seen = { look: '', dropped: '', line: '' }

/**
 * The one dim line naming what the pane left out of the look, or empty. Called once per render of the pane,
 * which is the only thing that advances it; drawing a picture does not.
 */
export const leftOut = (): string => {
  const look = currentLook()
  const key = JSON.stringify(look)
  const names = droppedOf(look)
    .filter(one => one.isReported)
    .map(one => one.why)
    .join(', ')
  if (key !== seen.look) seen = { look: key, dropped: seen.dropped, line: '' }
  if (names !== seen.dropped) seen = { look: key, dropped: names, line: names }

  return seen.line
}
