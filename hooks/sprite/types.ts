// The parts a look is built from. Every part is plain data or a pure function of
// its inputs, so a new character, animation, accessory or background is one file.

/** One pixel of the stage, counted from the top-left corner. Two pixels stack in each cell. */
export type Point = { readonly x: number; readonly y: number }

/** Colours a character defines for its own body. */
export type BodyRole = 'outline' | 'base' | 'shade' | 'highlight' | 'cheek' | 'eye' | 'belly'

/** Colours shared by every look, for props and effects. */
export type PropRole = 'paper' | 'ink' | 'spark' | 'flash' | 'check'

export type Role = BodyRole | PropRole

/** Where things attach to a character. Animations and accessories place everything relative to these. */
export type Anchors = {
  /** The top-centre pixel of the head; a hat sits on it. */
  readonly head: Point
  /** Where the face, neck and held slots attach, when the character has them. */
  readonly face?: Point
  readonly neck?: Point
  readonly held?: Point
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
  /**
   * Per slot the character has an anchor for: whether an accessory in it moves with the head bob (true) or stays put (false).
   * Every anchored slot is declared. A slot declared to move needs its anchor inside `headRegion`, since nothing else moves there.
   */
  readonly bobs: Readonly<Partial<Record<Slot, boolean>>>
}

/** A pixel an animation lays over the body; `role` is a body role (taken from the character) or a prop role. */
export type Dot = readonly [x: number, y: number, role: Role]

/** What one frame does: the head bob (in pixels, down) and the props and effects drawn on top. */
export type FramePlan = { readonly bob?: number; readonly dots?: readonly Dot[] }

export type Animation = {
  readonly frames: number
  /** How long each frame shows; register.tsx plays the animation at this pace. */
  readonly msPerFrame: number
  /** True when the animation plays once and then hands back to the resting one. */
  readonly once: boolean
  /** The slots whose accessory is not drawn while this animation plays, because the animation draws there itself; `[]` hides none. */
  readonly hides: readonly Slot[]
  /** One frame, worked out from the character's anchors only, never from its pixels. */
  readonly frame: (step: number, at: Anchors) => FramePlan
}

/** The places an accessory can go. Every character has the head slot; the others are optional per character. */
export type Slot = 'head' | 'face' | 'neck' | 'held'

/** One thing the sidekick wears, such as a cap; it belongs to exactly one slot and moves with the head bob when the character declares that slot as bobbing (`Character.bobs`). */
export type Accessory = {
  readonly name: string
  readonly slot: Slot
  readonly pixels: readonly string[]
  /** Which pixel of `pixels` sits on the slot's anchor. */
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

/** Accessories by registry name, at most one per slot; a slot left out is empty. */
export type OutfitNames = Readonly<Partial<Record<Slot, string>>>

/** An outfit with its names looked up. */
export type Outfit = Readonly<Partial<Record<Slot, Accessory>>>

/** What the sidekick looks like, by registry name; null leaves a layer out. */
export type Look = {
  readonly character: string
  readonly outfit: OutfitNames
  readonly background: string | null
}

/**
 * The parts of a look that were set; a part left out is not set. This is what is saved.
 * A project's override can also set a slot or the background to null: explicitly empty, which
 * wins over what the global look has there. The global look never holds a null.
 */
export type SavedLook = {
  readonly character?: string
  readonly outfit?: Readonly<Partial<Record<Slot, string | null>>>
  readonly background?: string | null
}

/** A look with its names looked up: everything one rendered frame is made of, apart from the animation. */
export type Layers = {
  readonly character: Character
  readonly outfit: Outfit
  readonly background: Background | null
}
