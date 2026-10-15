import { ACCESSORIES, BACKGROUNDS, CHARACTERS, DEFAULT_LOOK, found, slotRefusal } from './sprite/registry'
import { currentLook, droppedOf, projectLook, savedLook } from './sprite/look-in-use'
import { LOOK_PARTS, SLOTS } from './sprite/types'
import type { Look, LookPart, SavedLook, Slot } from './sprite/types'

// The look command: reading what the store holds, turning `part=name` words into a new saved look
// or a refusal, and describing the look. Pure; register.tsx does the storing and repainting.

const isPart = (word: string): word is LookPart => (LOOK_PARTS as readonly string[]).includes(word)
const isSlot = (part: LookPart): part is Slot => (SLOTS as readonly string[]).includes(part)
const names = (registry: Readonly<Record<string, unknown>>): string => Object.keys(registry).join(', ')
const known = (registry: Readonly<Record<string, unknown>>, name: string): boolean => Object.hasOwn(registry, name)

/** Reads a saved look back from the store, keeping only well-formed parts. A null is an override's "explicitly empty"; an empty name counts as not set. */
export const parseSaved = (raw: unknown): SavedLook => {
  if (typeof raw !== 'object' || raw === null) return {}
  const { character, outfit, background } = raw as Record<string, unknown>
  const kept: Partial<Record<Slot, string | null>> = {}
  if (typeof outfit === 'object' && outfit !== null) {
    for (const slot of SLOTS) {
      const name = (outfit as Record<string, unknown>)[slot]
      if ((typeof name === 'string' && name !== '') || name === null) kept[slot] = name
    }
  }

  return {
    ...(typeof character === 'string' && character !== '' ? { character } : {}),
    ...(Object.keys(kept).length > 0 ? { outfit: kept } : {}),
    ...((typeof background === 'string' && background !== '') || background === null ? { background } : {}),
  }
}

/** The accessories that fit a slot, by name. */
const accessoriesFor = (slot: Slot): string =>
  Object.values(ACCESSORIES)
    .filter(accessory => accessory.slot === slot)
    .map(accessory => accessory.name)
    .join(', ')

/** Everything that exists, and what the command takes. */
const listing = (): string[] => [
  `Characters: ${names(CHARACTERS)}`,
  'Accessories:',
  ...SLOTS.map(slot => `  ${slot}: ${accessoriesFor(slot) || '(none yet)'}`),
  `Backgrounds: ${names(BACKGROUNDS)}`,
  'Set parts with /sidekick-look part=name, e.g. character=classic head=cap background=dusk',
]

const NOTE = ' (this project)'

/** The current look, each part marked when the project's override is where it comes from, or when it cannot be drawn. */
const describe = (look: Look): string[] => {
  const mine = projectLook()
  const dropped = droppedOf(look)
  const line = (part: LookPart, name: string, isMine: boolean): string => {
    const why = dropped.find(one => one.part === part)?.why

    return `  ${part}: ${name}${isMine ? NOTE : ''}${why === undefined ? '' : ` (not drawn: ${why})`}`
  }
  const isMine = (part: LookPart): boolean =>
    part === 'character' ? mine.character !== undefined : part === 'background' ? mine.background !== undefined : mine.outfit?.[part] !== undefined
  const lines = [
    line('character', look.character, isMine('character')),
    ...SLOTS.map(slot => line(slot, look.outfit[slot] ?? '-', isMine(slot))),
    line('background', look.background ?? '-', isMine('background')),
  ]

  return ['Current look:', ...lines, ...(lines.some(one => one.includes(NOTE)) ? ['  (this project) = set for this project only'] : [])]
}

/** The reply to the command with no arguments. */
export const lookReport = (): string => [...describe(currentLook()), '', ...listing()].join('\n')

/** Whether the words are for this project's override (a leading `here`) or the global look, and the words that remain. */
export const targetOf = (args: string): { readonly target: Target; readonly words: string } => {
  const match = /^\s*here(?:\s+|$)/.exec(args)

  return match === null ? { target: 'global', words: args } : { target: 'project', words: args.slice(match[0].length) }
}

export type Target = 'global' | 'project'

export type LookChange = { readonly isSaved: true; readonly saved: SavedLook; readonly text: string } | { readonly isSaved: false; readonly text: string }

/**
 * Lays the `part=name` words over the saved look of the target (the global look, or the project's override).
 * `part=none` empties a part: in the global look that simply takes it out, in an override it is kept as
 * explicitly empty so it wins over the global part. `reset` alone clears the target.
 * Any word that cannot be applied refuses the lot, so nothing half-applies.
 */
export const changeLook = (args: string, held: SavedLook, target: Target): LookChange => {
  const where = target === 'project' ? ' for this project' : ''
  const words = args.split(/\s+/).filter(one => one !== '')
  if (words[0] === 'reset') {
    if (words.length > 1) return { isSaved: false, text: 'reset takes no parts.\nNothing was changed.' }

    return {
      isSaved: true,
      saved: {},
      text: target === 'project' ? 'This project follows the global look again.' : 'The global look is back to the default.',
    }
  }
  if (words.length === 0) {
    return { isSaved: false, text: 'Name the parts to override here, e.g. here character=classic, or here reset.\nNothing was changed.' }
  }
  const refusals: string[] = []
  let character = held.character
  let background = held.background
  const outfit: Partial<Record<Slot, string | null>> = { ...held.outfit }
  const done: string[] = []
  const touched = new Set<Slot>()
  // What an emptied part is saved as: nothing in the global look, an explicit null in an override.
  const empty = target === 'project' ? null : undefined
  for (const word of words) {
    const at = word.indexOf('=')
    const part = at === -1 ? word : word.slice(0, at)
    const name = at === -1 ? '' : word.slice(at + 1)
    if (!isPart(part)) {
      refusals.push(`Unknown part "${part}"; the parts are: ${LOOK_PARTS.join(', ')}`)
      continue
    }
    if (isSlot(part)) touched.add(part)
    if (name === 'none') {
      if (part === 'character') {
        refusals.push(`The character cannot be none; known: ${names(CHARACTERS)}`)
        continue
      }
      if (part === 'background') background = empty
      else if (empty === null) outfit[part] = null
      else delete outfit[part]
    } else if (part === 'character' || part === 'background') {
      const registry = part === 'character' ? CHARACTERS : BACKGROUNDS
      if (!known(registry, name)) {
        refusals.push(`No ${part} named "${name}"; known: ${names(registry)}`)
        continue
      }
      if (part === 'character') character = name
      else background = name
    } else if (isSlot(part)) {
      const accessory = found(ACCESSORIES, name)
      if (accessory === undefined) {
        refusals.push(`No accessory named "${name}" for ${part}; known: ${accessoriesFor(part) || '(none yet)'}`)
        continue
      }
      const refusal = slotRefusal(name, accessory, part)
      if (refusal !== undefined) {
        refusals.push(refusal)
        continue
      }
      outfit[part] = name
    }
    done.push(`${part}=${name}`)
  }
  if (refusals.length > 0) return { isSaved: false, text: [...refusals, 'Nothing was changed.'].join('\n') }
  const next: SavedLook = {
    ...(character === undefined ? {} : { character }),
    ...(Object.keys(outfit).length === 0 ? {} : { outfit }),
    ...(background === undefined ? {} : { background }),
  }

  // The accessory is drawn on the character the look will show: this project's override beats the global look.
  const chosen = (target === 'project' ? character : (projectLook().character ?? character)) ?? savedLook().character ?? DEFAULT_LOOK.character
  const showing = known(CHARACTERS, chosen) ? chosen : DEFAULT_LOOK.character
  // From the final outfit, once per slot: a slot emptied again in the same command has nothing to report.
  const lacking = SLOTS.filter(slot => touched.has(slot)).flatMap(slot => {
    const name = outfit[slot]

    return typeof name === 'string' && CHARACTERS[showing]?.anchors[slot] === undefined
      ? [`${showing} has no ${slot} slot, so ${name} is saved but not drawn until a character with that slot is shown.`]
      : []
  })

  return { isSaved: true, saved: next, text: [`Look set${where}: ${done.join(' ')}.`, ...lacking].join('\n') }
}
