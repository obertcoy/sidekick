// The parts a look is built from. Every part is plain data or a pure function of
// its inputs, so a new character, animation, outfit or background is one file.

/** One pixel of the stage, counted from the top-left corner. Two pixels stack in each cell. */
export type Point = { readonly x: number; readonly y: number }

/** Colours a character defines for its own body. */
export type BodyRole = 'outline' | 'base' | 'shade' | 'highlight' | 'cheek' | 'eye' | 'belly'

/** Colours shared by every look, for props and effects. */
export type PropRole = 'paper' | 'ink' | 'spark' | 'flash' | 'check'

export type Role = BodyRole | PropRole

/** Where things attach to a character. Animations and outfits place everything relative to these. */
export type Anchors = {
  /** The top-centre pixel of the head; a hat sits on it. */
  readonly head: Point
  /** The paw that writes; the pen is one pixel to its right and the paper's top-left corner one pixel above that. */
  readonly paw: Point
  /** The paw raised to catch a bolt; the arm is drawn around it. */
  readonly reach: Point
  /** The top of the bolt; it zigzags down and two pixels left from here, ending near `reach`. */
  readonly boltFrom: Point
  /** The cheek pixels; the zap glows one pixel to the right of each. */
  readonly cheeks: readonly Point[]
  /** The tail tips, the first one the outermost; sparks crackle on and above them. */
  readonly tail: readonly Point[]
  /** The ear tips. */
  readonly ears: readonly Point[]
  /** The centre of the lowest body row. */
  readonly feet: Point
}

/** An inclusive rectangle of pixels. */
export type Region = { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }

export type Character = {
  readonly name: string
  /** Rows of letters, at most the stage size; '.' (or anything past a short row) is transparent. */
  readonly body: readonly string[]
  /** What each body letter means. */
  readonly legend: Readonly<Record<string, BodyRole>>
  /** The colour of each role the legend uses, as 0xRRGGBB. */
  readonly palette: Readonly<Partial<Record<BodyRole, number>>>
  readonly anchors: Anchors
  /** The bob region: the pixels that move together when the head bobs. A bob shifts them down inside it. */
  readonly headRegion: Region
}

/** A pixel an animation lays over the body; `role` is a body role (taken from the character) or a prop role. */
export type Dot = readonly [x: number, y: number, role: Role]

/** What one frame does: the head bob (in pixels, down) and the props and effects drawn on top. */
export type FramePlan = { readonly bob?: number; readonly dots?: readonly Dot[] }

export type Animation = {
  readonly frames: number
  /**
   * How long each frame shows. register.tsx keeps its own copy of these timings (110 ms for zap,
   * 220 ms otherwise); a test pins the two together until register reads them from here.
   */
  readonly msPerFrame: number
  /** True when the animation plays once and then hands back to the resting one. */
  readonly once: boolean
  /** One frame, worked out from the character's anchors only, never from its pixels. */
  readonly frame: (step: number, at: Anchors) => FramePlan
}

/** A small picture worn on the head; it moves with the head bob. */
export type Outfit = {
  readonly name: string
  readonly pixels: readonly string[]
  /** Which pixel of `pixels` sits on the head anchor. */
  readonly origin: Point
  readonly palette: Readonly<Record<string, number>>
}

/** A full-stage picture behind everything; it shows only where nothing else is drawn. */
export type Background = {
  readonly name: string
  /** One grid per frame of its own, cycled by the animation step; one grid for a still background. */
  readonly frames: readonly (readonly string[])[]
  readonly palette: Readonly<Record<string, number>>
}

/** What the sidekick looks like, by registry name; null leaves a layer out. */
export type Look = {
  readonly character: string
  readonly outfit: string | null
  readonly background: string | null
}

/** A look with its names looked up: everything one rendered frame is made of, apart from the animation. */
export type Layers = {
  readonly character: Character
  readonly outfit: Outfit | null
  readonly background: Background | null
}
