import type { AnchorName, Anchors, Animation, Character, Edges, FramePlan, Layers, Needed, Patch, Point, PoseName, PropRole, Role, Slot } from './types'
import { LIST_ANCHORS, OPTIONAL_POINT_ANCHORS, POSES, REQUIRED_ANCHORS, REQUIRED_BODY_ROLES, SLOTS } from './types'

/** The most pixels a character may measure either way; a bigger one is refused at load. */
export const MAX_CHARACTER = 64

/** Sky kept above a character's body for jumps and falling bolts, in pixels. A pixel more when the height would otherwise be odd (a cell holds two). */
export const HEADROOM = 8

/** The fewest ground rows under a character's feet, in pixels; rows of the body under the feet count as ground too. */
export const GROUND_ROWS = 1

/** The least wide the world is, in pixels (one column each): the pane looks into it through the camera. */
export const WORLD_MIN_WIDTH = 40

/**
 * The stage a character is drawn on, measured in pixels from its top-left corner (two pixels stack in each cell, one column per pixel).
 * Its height comes from the character: headroom, then the character down to its feet, then the ground. Its width is the world, centred on the character.
 * The character's anchors are given to animations already moved by `offset`, so they place things in stage pixels.
 */
export type Stage = {
  readonly width: number
  readonly height: number
  readonly columns: number
  readonly rows: number
  /** Where the character's own top-left pixel sits on the stage. */
  readonly offset: Point
  /** The first ground row: the row under the feet. Everything from here down is ground. */
  readonly ground: number
  /** The columns the character's frame (its art and its anchors) covers on the stage, inclusive. */
  readonly frame: { readonly left: number; readonly right: number }
}

/** What the pane looks at: a window of the stage. `left` and `top` are in pixels, `columns` and `rows` in cells. */
export type View = { readonly left: number; readonly top: number; readonly columns: number; readonly rows: number }

/** The columns a character covers in its own pixels: where its art is drawn, plus every anchor, since animations and accessories draw there. */
const extentOf = (character: Character): { readonly left: number; readonly right: number } => {
  const xs: number[] = []
  for (const row of character.body) {
    for (const [x, letter] of [...row].entries()) if (letter !== '.') xs.push(x)
  }
  for (const patch of Object.values(character.poses ?? {})) {
    if (patch === undefined) continue
    for (const row of patch.rows) {
      for (const [dx, letter] of [...row].entries()) if (letter !== ' ' && letter !== '.') xs.push(patch.at.x + dx)
    }
  }
  for (const anchor of Object.values(character.anchors)) {
    // An anchor present but undefined is no anchor.
    if (anchor === undefined) continue
    for (const point of Array.isArray(anchor) ? anchor : [anchor]) xs.push(point.x)
  }

  return { left: Math.min(...xs), right: Math.max(...xs) }
}

/** The rows of the character down to its feet: what is above the ground. */
const heightOf = (character: Character): number => character.anchors.feet.y + 1

/** The ground rows under a character's feet. */
const groundOf = (character: Character): number => Math.max(GROUND_ROWS, character.body.length - heightOf(character))

/** Why a character cannot stand on a stage no taller than `cap` pixels (rounded down to a whole cell), or undefined when it can. */
export const heightRefusal = (character: Character, cap: number): string | undefined => {
  const needed = heightOf(character) + groundOf(character)

  return needed > cap - (cap % 2)
    ? `character "${character.name}" is ${heightOf(character)} pixels tall and needs ${needed} with its ground; the look's height cap is ${cap}`
    : undefined
}

/** The stage for a character; a look can cap its height in pixels. A character too tall for the cap throws, naming it. */
export const stageFor = (character: Character, cap?: number): Stage => {
  const refusal = cap === undefined ? undefined : heightRefusal(character, cap)
  if (refusal !== undefined) throw new Error(`sprite: ${refusal}`)
  const height = heightOf(character)
  const ground = groundOf(character)
  const wanted = HEADROOM + height + ground
  const total = Math.min(wanted + (wanted % 2), cap === undefined ? Number.POSITIVE_INFINITY : cap - (cap % 2))
  const { left, right } = extentOf(character)
  const width = Math.max(WORLD_MIN_WIDTH, right - left + 1)
  const x = Math.floor((width - (right - left + 1)) / 2) - left

  return {
    width,
    height: total,
    columns: width,
    rows: total / 2,
    offset: { x, y: total - height - ground },
    ground: total - ground,
    frame: { left: left + x, right: right + x },
  }
}

/** The stage of a look's layers: the character's, under its background's height cap. */
export const stageOf = (look: Layers): Stage => stageFor(look.character, look.background?.heightCap)

/** The whole stage as a view, as when nothing crops it. */
export const wholeStage = (stage: Stage): View => ({ left: 0, top: 0, columns: stage.columns, rows: stage.rows })

/**
 * The camera: a view of `room` cells (columns, rows) into the stage. It keeps the character's frame centred horizontally and stays inside the world;
 * it never shows less than the character's frame across, nor less than the rows from the character's top to the ground, and it trims sky from the top first.
 * With no room asked for it shows the whole stage.
 */
export const cameraFor = (stage: Stage, room?: { readonly columns: number; readonly rows: number }): View => {
  if (room === undefined) return wholeStage(stage)
  const frameWidth = stage.frame.right - stage.frame.left + 1
  const columns = Math.min(stage.columns, Math.max(Math.floor(room.columns), frameWidth))
  const lowest = Math.ceil((stage.height - stage.offset.y) / 2)
  const rows = Math.min(stage.rows, Math.max(Math.floor(room.rows), lowest))
  const centre = (stage.frame.left + stage.frame.right + 1) / 2
  const left = Math.min(Math.max(Math.round(centre - columns / 2), 0), stage.columns - columns)

  return { left, top: (stage.rows - rows) * 2, columns, rows }
}

/** The named edges an animation may place things by, for a stage seen through a view. */
export const edgesOf = (stage: Stage, view: View): Edges => ({ skyTop: view.top, ground: stage.ground, left: view.left, right: view.left + view.columns - 1 })

/** Prop and effect colours, the same for every character. */
export const PROPS: Readonly<Record<PropRole, number>> = {
  paper: 0xf1f3f5,
  ink: 0x4a5160,
  spark: 0x7cf0ff,
  flash: 0xffffff,
  check: 0x40c057,
}

/**
 * Makes an animation whose frames read only the anchors it names: `frame` is given those anchors as certain.
 * Whether a character has them is checked where characters and animations meet (the registry), not here.
 */
export const defineAnimation = <N extends AnchorName, P extends PoseName>(
  animation: Omit<Animation, 'needs' | 'poses' | 'frame'> & {
    readonly needs: readonly N[]
    readonly poses: readonly P[]
    readonly frame: (step: number, at: Needed<N>, edges: Edges) => Omit<FramePlan, 'poses'> & { readonly poses?: readonly NoInfer<P>[] }
  },
): Animation => animation as unknown as Animation

/** Whether a point is a whole-pixel place on a body of `rows` rows. The stage is made to fit the character, so its own pixels are all a point is measured by. */
const onBody = (point: Point | undefined, rows: number): boolean =>
  point !== undefined && Number.isInteger(point.x) && Number.isInteger(point.y) && point.x >= 0 && point.x < MAX_CHARACTER && point.y >= 0 && point.y < rows

/** Checks a character on its own and returns it; a character that cannot be drawn throws here, at load. The stage is made to fit it (`stageFor`). */
export const defineCharacter = (character: Character): Character => {
  const fail = (why: string): never => {
    throw new Error(`sprite: character "${character.name}" ${why}`)
  }
  const onStage = (point: Point | undefined): boolean => onBody(point, character.body.length)
  if (character.body.length > MAX_CHARACTER) {
    fail(`is ${character.body.length} pixels tall; a character is at most ${MAX_CHARACTER}`)
  }
  character.body.forEach((row, y) => {
    if (row.length > MAX_CHARACTER) fail(`row ${y} is ${row.length} pixels wide; a character is at most ${MAX_CHARACTER}`)
    for (const letter of row) {
      if (letter === '.') continue
      const role = character.legend[letter]
      if (role === undefined) fail(`uses "${letter}" in row ${y}, which its legend does not name`)
      else if (character.palette[role] === undefined) fail(`has no colour for the role "${role}"`)
    }
  })
  for (const role of REQUIRED_BODY_ROLES) {
    if (character.palette[role] === undefined) fail(`has no colour for the role "${role}"`)
  }
  // Only the stage frame (head, feet) is certain; the other anchors are checked against what the character plays, in the registry.
  // An anchor is a pixel of the body: whole, and no further down than its last row.
  const anchors = (character.anchors ?? {}) as Partial<Record<string, unknown>>
  for (const name of REQUIRED_ANCHORS) {
    if (!onStage(anchors[name] as Point | undefined)) fail(`is missing the anchor "${name}", or it is off the body`)
  }
  for (const name of OPTIONAL_POINT_ANCHORS) {
    if (anchors[name] !== undefined && !onStage(anchors[name] as Point)) fail(`has the anchor "${name}" off the body`)
  }
  for (const name of LIST_ANCHORS) {
    const list = anchors[name]
    if (list === undefined) continue
    if (!Array.isArray(list) || list.length === 0 || !list.every(point => onStage(point as Point))) {
      fail(`has the anchor "${name}" empty, or with a point off the body`)
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
    fail('has no headRegion on the body')
  }
  for (const [pose, patch] of Object.entries((character.poses ?? {}) as Readonly<Record<string, Patch | undefined>>)) {
    if (!(POSES as readonly string[]).includes(pose)) fail(`has the pose "${pose}", which is not one of: ${POSES.join(', ')}`)
    // A pose set to undefined is no patch at all, so the registry refuses it like a missing one.
    if (patch === undefined) continue
    const { at, rows } = patch
    if (!onStage(at) || rows.length === 0 || at.y + rows.length > character.body.length || rows.some(row => at.x + row.length > MAX_CHARACTER)) {
      fail(`has the pose "${pose}" off the body`)
    }
    for (const row of rows) {
      for (const letter of row) {
        if (letter === ' ' || letter === '.') continue
        const role = character.legend[letter]
        if (role === undefined) fail(`uses "${letter}" in the pose "${pose}", which its legend does not name`)
        else if (character.palette[role] === undefined) fail(`uses "${letter}" in the pose "${pose}", whose role "${role}" has no colour`)
      }
    }
  }
  const bobs = (character.bobs ?? {}) as Partial<Record<Slot, unknown>>
  for (const slot of Object.keys(bobs)) {
    if (!(SLOTS as readonly string[]).includes(slot) || anchors[slot] === undefined) {
      fail(`declares whether the slot "${slot}" bobs, but has no anchor for it`)
    }
  }
  for (const slot of SLOTS) {
    if (anchors[slot] === undefined) continue
    const moves = bobs[slot]
    if (typeof moves !== 'boolean') fail(`does not declare whether the slot "${slot}" bobs`)
    else if (moves && !inRegion(anchors[slot] as Point, character)) {
      fail(`declares the slot "${slot}" as bobbing, but its anchor is outside the headRegion`)
    }
  }

  return character
}

/** The body as letters on the character's own grid: every row padded with transparent pixels to the width its art and anchors cover, then each pose's patch laid over it, in the order given (a later pose wins). */
export const posed = (character: Character, poses: readonly PoseName[]): string[] => {
  const width = extentOf(character).right + 1
  const rows = Array.from({ length: character.body.length }, (_, y) => [...(character.body[y] ?? '').padEnd(width, '.')])
  for (const pose of poses) {
    const patch = character.poses?.[pose]
    if (patch === undefined) continue
    patch.rows.forEach((patchRow, dy) => {
      for (const [dx, letter] of [...patchRow].entries()) {
        if (letter === ' ') continue
        const row = rows[patch.at.y + dy]
        if (row !== undefined && patch.at.x + dx < width) row[patch.at.x + dx] = letter
      }
    })
  }

  return rows.map(row => row.join(''))
}

/** A stage of colours, row by row; undefined is transparent. */
export type Pixels = (number | undefined)[][]

const inRegion = (point: Point, character: Character): boolean => {
  const region = character.headRegion
  return point.x >= region.left && point.x <= region.right && point.y >= region.top && point.y <= region.bottom
}

/** The order accessories are drawn in, back to front. */
export const SLOT_ORDER = ['neck', 'face', 'head', 'held'] as const satisfies readonly Slot[]

const moved = (point: Point, by: Point): Point => ({ x: point.x + by.x, y: point.y + by.y })

/** Anchors moved from the character's own pixels onto the stage. */
const placed = (anchors: Anchors, by: Point): Anchors =>
  Object.fromEntries(
    Object.entries(anchors)
      .filter(([, anchor]) => anchor !== undefined)
      .map(([name, anchor]) => [name, 'x' in anchor ? moved(anchor, by) : anchor.map(point => moved(point, by))]),
  ) as unknown as Anchors

/**
 * One frame as stage pixels, in layer order: background, body (with the frame's head bob),
 * accessories (each on its slot's anchor, bobbing with it where the character declares the slot bobs;
 * a slot the animation hides is skipped),
 * then the animation's props and effects.
 * The background has its own frame; by default it steps with the animation. `view` is what the pane looks at (the whole stage unless given):
 * the animation is told its edges, but the pixels returned are the whole stage. `onClip` hears of each opaque pixel drawn off the stage.
 */
const compose = (
  look: Layers,
  animation: Animation,
  step: number,
  backgroundFrame: number,
  view: View | undefined,
  onClip: ((x: number, y: number) => void) | undefined,
): Pixels => {
  const { character } = look
  const stage = stageOf(look)
  const at = placed(character.anchors, stage.offset)
  const plan = animation.frame(step, at, edgesOf(stage, view ?? wholeStage(stage)))
  const bob = plan.bob ?? 0
  const pixels: Pixels = Array.from({ length: stage.height }, () => new Array<number | undefined>(stage.width))
  const put = (x: number, y: number, color: number | undefined): void => {
    if (color === undefined) return
    if (x < 0 || x >= stage.width || y < 0 || y >= stage.height) onClip?.(x, y)
    else {
      const row = pixels[y]
      if (row !== undefined) row[x] = color
    }
  }

  // The background's picture stands on the ground: its last row on the first ground row (and repeated under it), repeated sideways across the world from where the character stands.
  const background = look.background
  if (background) {
    const grid = background.frames[backgroundFrame % background.frames.length] ?? []
    const last = grid.length - 1
    for (let y = 0; y < stage.height; y++) {
      const row = grid[Math.min(y - stage.ground + last, last)]
      if (row === undefined || row.length === 0) continue
      for (let x = 0; x < stage.width; x++) {
        const from = (((x - stage.offset.x) % row.length) + row.length) % row.length
        put(x, y, background.palette[row[from] ?? '.'])
      }
    }
  }

  // The body, with the head region moved down by the bob; what it leaves behind is transparent.
  const region = character.headRegion
  const body = posed(character, plan.poses ?? [])
  const colorAt = (x: number, y: number): number | undefined => {
    const letter = body[y]?.[x]
    const role = letter === undefined ? undefined : character.legend[letter]
    return role === undefined ? undefined : character.palette[role]
  }
  for (let y = 0; y < body.length; y++) {
    for (let x = 0; x < (body[y]?.length ?? 0); x++) {
      const isMoved = bob !== 0 && inRegion({ x, y }, character)
      const fromY = isMoved ? y - bob : y
      const inside = !isMoved || (fromY >= region.top && fromY <= region.bottom)
      put(x + stage.offset.x, y + stage.offset.y, inside ? colorAt(x, fromY) : undefined)
    }
  }

  for (const slot of SLOT_ORDER) {
    const accessory = look.outfit[slot]
    const anchor = at[slot]
    if (accessory === undefined || anchor === undefined || animation.hides.includes(slot)) continue
    const lift = character.bobs[slot] ? bob : 0
    accessory.pixels.forEach((row, y) => {
      for (const [x, letter] of [...row].entries()) {
        put(anchor.x - accessory.origin.x + x, anchor.y - accessory.origin.y + y + lift, accessory.palette[letter])
      }
    })
  }

  const colorOf = (role: Role): number | undefined =>
    (character.palette as Partial<Record<Role, number>>)[role] ?? (PROPS as Partial<Record<Role, number>>)[role]
  for (const [x, y, role] of plan.dots ?? []) put(x, y, colorOf(role))

  return pixels
}

/** One frame as stage pixels (see `compose`): the whole stage, whatever the view; the view tells the animation where the camera's edges are. */
export const composePixels = (look: Layers, animation: Animation, step: number, backgroundFrame: number = step, view?: View): Pixels =>
  compose(look, animation, step, backgroundFrame, view, undefined)

/** Every pixel one frame draws off the stage, as "x,y": none, for a character and parts that fit it. */
export const offStage = (look: Layers, animation: Animation, step: number, view?: View): string[] => {
  const clipped: string[] = []
  compose(look, animation, step, step, view, (x, y) => clipped.push(`${x},${y}`))

  return clipped
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

/** The part of stage pixels a view looks at as a Raster's cells: each cell a half block coloured by its upper and lower pixel. */
export const encodeCells = (pixels: Pixels, view: View): string => {
  const words = new Uint32Array(view.columns * view.rows * 3)
  for (let row = 0; row < view.rows; row++) {
    for (let column = 0; column < view.columns; column++) {
      const upper = pixels[view.top + row * 2]?.[view.left + column]
      const lower = pixels[view.top + row * 2 + 1]?.[view.left + column]
      const at = (row * view.columns + column) * 3
      // An upper half block shows its foreground above and its background below.
      words[at] = upper === undefined ? (lower === undefined ? 0x20 : 0x2584) : 0x2580
      words[at + 1] = upper ?? lower ?? DEFAULT
      words[at + 2] = upper === undefined ? DEFAULT : (lower ?? DEFAULT)
    }
  }

  return encode(new Uint8Array(words.buffer))
}

/** One frame of a look playing an animation, as a Raster's cells. The step wraps around the animation; the background steps with it unless given its own frame. The view is the whole stage unless given. */
export const render = (look: Layers, animation: Animation, step: number, backgroundFrame?: number, view?: View): string => {
  const at = ((step % animation.frames) + animation.frames) % animation.frames
  const seen = view ?? wholeStage(stageOf(look))

  return encodeCells(composePixels(look, animation, at, backgroundFrame ?? at, seen), seen)
}
