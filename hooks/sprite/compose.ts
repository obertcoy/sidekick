import type { Animation, Character, Layers, Point, PropRole, Role } from './types'

/** The fixed stage every look is drawn on: 18 cells wide, 8 tall, two pixels stacked in each cell. */
export const STAGE = { columns: 18, rows: 8, width: 18, height: 16 } as const

/** Prop and effect colours, the same for every character. */
export const PROPS: Readonly<Record<PropRole, number>> = {
  paper: 0xf1f3f5,
  ink: 0x4a5160,
  spark: 0x7cf0ff,
  flash: 0xffffff,
  check: 0x40c057,
}

const ANCHOR_POINTS = ['head', 'paw', 'reach', 'boltFrom', 'feet'] as const
const ANCHOR_LISTS = ['cheeks', 'tail', 'ears'] as const

const onStage = (point: Point | undefined): boolean =>
  point !== undefined &&
  Number.isInteger(point.x) &&
  Number.isInteger(point.y) &&
  point.x >= 0 &&
  point.x < STAGE.width &&
  point.y >= 0 &&
  point.y < STAGE.height

/** Checks a character against the stage and returns it; a character that cannot be drawn throws here, at load. */
export const defineCharacter = (character: Character): Character => {
  const fail = (why: string): never => {
    throw new Error(`sprite: character "${character.name}" ${why}`)
  }
  if (character.body.length > STAGE.height) {
    fail(`is ${character.body.length} pixels tall; the stage is ${STAGE.height}`)
  }
  character.body.forEach((row, y) => {
    if (row.length > STAGE.width) fail(`row ${y} is ${row.length} pixels wide; the stage is ${STAGE.width}`)
    for (const letter of row) {
      if (letter === '.') continue
      const role = character.legend[letter]
      if (role === undefined) fail(`uses "${letter}" in row ${y}, which its legend does not name`)
      else if (character.palette[role] === undefined) fail(`has no colour for the role "${role}"`)
    }
  })
  for (const role of ['outline', 'base'] as const) {
    if (character.palette[role] === undefined) fail(`has no colour for the role "${role}"`)
  }
  const anchors = (character.anchors ?? {}) as Partial<Record<string, unknown>>
  for (const name of ANCHOR_POINTS) {
    if (!onStage(anchors[name] as Point | undefined)) fail(`is missing the anchor "${name}", or it is off the stage`)
  }
  for (const name of ANCHOR_LISTS) {
    const list = anchors[name]
    if (!Array.isArray(list) || list.length === 0 || !list.every(point => onStage(point as Point))) {
      fail(`is missing the anchor "${name}" (one or more points on the stage)`)
    }
  }
  const region = character.headRegion
  if (
    region === undefined ||
    !onStage({ x: region.left, y: region.top }) ||
    !onStage({ x: region.right, y: region.bottom }) ||
    region.left > region.right ||
    region.top > region.bottom
  ) {
    fail('has no headRegion on the stage')
  }

  return character
}

/** A stage of colours, row by row; undefined is transparent. */
export type Pixels = (number | undefined)[][]

const blank = (): Pixels => Array.from({ length: STAGE.height }, () => new Array<number | undefined>(STAGE.width))

const put = (pixels: Pixels, x: number, y: number, color: number | undefined): void => {
  if (color === undefined || x < 0 || x >= STAGE.width || y < 0 || y >= STAGE.height) return
  const row = pixels[y]
  if (row !== undefined) row[x] = color
}

const inRegion = (point: Point, character: Character): boolean => {
  const region = character.headRegion
  return point.x >= region.left && point.x <= region.right && point.y >= region.top && point.y <= region.bottom
}

/**
 * One frame as stage pixels, in layer order: background, body (with the frame's head bob),
 * outfit (on the head anchor, bobbing with it), then the animation's props and effects.
 */
export const composePixels = (look: Layers, animation: Animation, step: number): Pixels => {
  const { character } = look
  const plan = animation.frame(step, character.anchors)
  const bob = plan.bob ?? 0
  const pixels = blank()

  const background = look.background
  if (background) {
    const grid = background.frames[step % background.frames.length] ?? []
    grid.forEach((row, y) => [...row].forEach((letter, x) => put(pixels, x, y, background.palette[letter])))
  }

  // The body, with the head region moved down by the bob; what it leaves behind is transparent.
  const region = character.headRegion
  const colorAt = (x: number, y: number): number | undefined => {
    const letter = character.body[y]?.[x]
    const role = letter === undefined ? undefined : character.legend[letter]
    return role === undefined ? undefined : character.palette[role]
  }
  for (let y = 0; y < STAGE.height; y++) {
    for (let x = 0; x < STAGE.width; x++) {
      const moved = bob !== 0 && inRegion({ x, y }, character)
      const fromY = moved ? y - bob : y
      const inside = !moved || (fromY >= region.top && fromY <= region.bottom)
      put(pixels, x, y, inside ? colorAt(x, fromY) : undefined)
    }
  }

  const outfit = look.outfit
  if (outfit) {
    const head = character.anchors.head
    const lift = inRegion(head, character) ? bob : 0
    outfit.pixels.forEach((row, y) =>
      [...row].forEach((letter, x) =>
        put(pixels, head.x - outfit.origin.x + x, head.y - outfit.origin.y + y + lift, outfit.palette[letter]),
      ),
    )
  }

  const colorOf = (role: Role): number | undefined =>
    (character.palette as Partial<Record<Role, number>>)[role] ?? (PROPS as Partial<Record<Role, number>>)[role]
  for (const [x, y, role] of plan.dots ?? []) put(pixels, x, y, colorOf(role))

  return pixels
}

const DEFAULT = 0x01000000

const encode = (bytes: Uint8Array): string => {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let text = ''
  for (let at = 0; at < bytes.length; at += 3) {
    const a = bytes[at] ?? 0
    const b = bytes[at + 1] ?? 0
    const c = bytes[at + 2] ?? 0
    text += table[a >> 2]
    text += table[((a & 3) << 4) | (b >> 4)]
    text += at + 1 < bytes.length ? table[((b & 15) << 2) | (c >> 6)] : '='
    text += at + 2 < bytes.length ? table[c & 63] : '='
  }

  return text
}

/** Stage pixels as a Raster's cells: each cell a half block coloured by its upper and lower pixel. */
export const encodeCells = (pixels: Pixels): string => {
  const words = new Uint32Array(STAGE.columns * STAGE.rows * 3)
  for (let row = 0; row < STAGE.rows; row++) {
    for (let column = 0; column < STAGE.columns; column++) {
      const upper = pixels[row * 2]?.[column]
      const lower = pixels[row * 2 + 1]?.[column]
      const at = (row * STAGE.columns + column) * 3
      // An upper half block shows its foreground above and its background below.
      words[at] = upper === undefined ? (lower === undefined ? 0x20 : 0x2584) : 0x2580
      words[at + 1] = upper ?? lower ?? DEFAULT
      words[at + 2] = upper === undefined ? DEFAULT : (lower ?? DEFAULT)
    }
  }

  return encode(new Uint8Array(words.buffer))
}

/** One frame of a look playing an animation, as a Raster's cells. The step wraps around the animation. */
export const render = (look: Layers, animation: Animation, step: number): string => {
  const at = ((step % animation.frames) + animation.frames) % animation.frames
  return encodeCells(composePixels(look, animation, at))
}
