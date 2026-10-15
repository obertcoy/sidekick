// The parts a look is built from. Every part is plain data or a pure function of
// its inputs, so a new character, animation, accessory or background is one file.

/** One pixel of the stage, counted from the top-left corner. Two pixels stack in each cell. */
export type Point = { readonly x: number; readonly y: number }

/** Colours a character defines for its own body. */
const BODY_ROLES = ['outline', 'base', 'shade', 'highlight', 'cheek', 'eye', 'belly'] as const
export type BodyRole = (typeof BODY_ROLES)[number]

/** The body roles every character colours: the rest are for the legend to use or not. */
export const REQUIRED_BODY_ROLES = ['outline', 'base'] as const satisfies readonly BodyRole[]

/** Colours shared by every look, for props and effects. */
const PROP_ROLES = ['paper', 'ink', 'spark', 'flash', 'check'] as const
export type PropRole = (typeof PROP_ROLES)[number]

export type Role = BodyRole | PropRole

/**
 * Where things attach to a character, by name. Animations and accessories place everything relative to these.
 *  - head: the top-centre pixel of the head; a hat sits on it.
 *  - face, neck, held: where those slots attach, when the character has them.
 *  - paw: the paw that writes; the pen is one pixel to its right and the paper's top-left corner one pixel above that.
 *  - reach: the paw raised to catch a bolt; the arm is drawn around it.
 *  - boltFrom: the top of the bolt; it zigzags down and two pixels left from here, ending near `reach`.
 *  - feet: the centre of the lowest body row.
 * Lists (each at least one point):
 *  - cheeks: the cheek pixels; the zap glows one pixel to the right of each.
 *  - tail: the tail tips, the first one the outermost; sparks crackle on and above them.
 *  - ears: the ear tips.
 * Only `head` and `feet` are certain for every character; any other anchor is there when the animations the character plays need it.
 */
export const REQUIRED_ANCHORS = ['head', 'feet'] as const
export const OPTIONAL_POINT_ANCHORS = ['face', 'neck', 'held', 'paw', 'reach', 'boltFrom'] as const
export const LIST_ANCHORS = ['cheeks', 'tail', 'ears'] as const
export const POINT_ANCHORS = [...REQUIRED_ANCHORS, ...OPTIONAL_POINT_ANCHORS] as const
export const ANCHOR_NAMES = [...POINT_ANCHORS, ...LIST_ANCHORS] as const

export type RequiredAnchor = (typeof REQUIRED_ANCHORS)[number]
export type OptionalPointAnchor = (typeof OPTIONAL_POINT_ANCHORS)[number]
export type ListAnchor = (typeof LIST_ANCHORS)[number]
export type AnchorName = (typeof ANCHOR_NAMES)[number]

/** One or more points on the stage. */
export type Points = readonly [Point, ...Point[]]

export type Anchors = { readonly [N in RequiredAnchor]: Point } & { readonly [N in OptionalPointAnchor]?: Point } & {
  readonly [N in ListAnchor]?: Points
}

/** What an animation that needs the named anchors is given: the stage frame, those anchors certain to be there, and nothing else. */
export type Needed<N extends AnchorName> = Pick<Anchors, RequiredAnchor> & { readonly [K in N]-?: NonNullable<Anchors[K]> }

/** An inclusive rectangle of pixels. */
export type Region = { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }

/** What the sidekick is shown doing. The registry says which shared animation plays for each. */
export const STATE_NAMES = ['working', 'searching', 'search-failed', 'ticket-done', 'set-done', 'resting'] as const
export type State = (typeof STATE_NAMES)[number]

/** The states a character may play its own animation for: every one but resting, which stays the shared stillness. */
export const REPLACEABLE_STATES = ['working', 'searching', 'search-failed', 'ticket-done', 'set-done'] as const satisfies readonly State[]

export type Character = {
  readonly name: string
  /**
   * Per state, the name of the animation this character plays in place of the shared one; a state left out plays the shared one.
   * The registry refuses, at load, a name that is not an animation or a replacement the strike cannot keep in step with.
   */
  readonly animations?: Readonly<Partial<Record<State, string>>>
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
  /**
   * The poses this character draws, each a patch over `body`. Which ones it must have is checked against what it plays (the registry).
   * Animations never read these pixels; they only ask for a pose by name.
   */
  readonly poses?: Readonly<Partial<Record<PoseName, Patch>>>
}

/**
 * Body changes an animation can ask for by name; each character draws its own. One shared, fixed list.
 * It grows only together with the animation that first uses a new name.
 */
export const POSES = ['armUp'] as const
export type PoseName = (typeof POSES)[number]

/** Letters laid over the body from `at`, row by row: ' ' keeps the body's pixel, '.' clears it, any other letter is from the legend. */
export type Patch = { readonly at: Point; readonly rows: readonly string[] }

/** A pixel an animation lays over the body; `role` is a body role (taken from the character) or a prop role. */
export type Dot = readonly [x: number, y: number, role: Role]

/**
 * What one frame does: the head bob (in pixels, down), the poses laid over the body in order (a later one wins),
 * and the props and effects drawn on top. Accessories draw over posed pixels; anchors do not move with poses.
 * A patch inside the character's `headRegion` bobs with the head.
 */
export type FramePlan = { readonly bob?: number; readonly poses?: readonly PoseName[]; readonly dots?: readonly Dot[] }

export type Animation = {
  /** The anchors the frames read. A character that plays this animation and lacks one is refused at load (the registry checks). */
  readonly needs: readonly AnchorName[]
  /** The poses the frames ask for. A character that plays this animation and lacks one is refused at load (the registry checks). */
  readonly poses: readonly PoseName[]
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

/** The places an accessory can go. Every character has the head slot; the others are optional per character. Each is also the name of its anchor. */
export const SLOTS = ['head', 'face', 'neck', 'held'] as const satisfies readonly AnchorName[]
export type Slot = (typeof SLOTS)[number]

/** The parts of a look that can be set by name. */
export const LOOK_PARTS = ['character', ...SLOTS, 'background'] as const
export type LookPart = (typeof LOOK_PARTS)[number]

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
