// The parts a look is built from. Every part is plain data or a pure function of
// its inputs, so a new character, animation, accessory or background is one file.

/** One pixel, counted from the top-left corner: of a character's body in its own parts, of the stage once drawn (the stage is made to fit the character, see `stageFor`). Two pixels stack in each cell. */
export type Point = { readonly x: number; readonly y: number }

/** Colours a character defines for its own body. */
const BODY_ROLES = ['outline', 'base', 'shade', 'highlight', 'cheek', 'eye', 'belly'] as const
export type BodyRole = (typeof BODY_ROLES)[number]

/** The body roles every character colours: the rest are for the legend to use or not. */
export const REQUIRED_BODY_ROLES = ['outline', 'base'] as const satisfies readonly BodyRole[]

/** Colours shared by every look, for props and effects. */
const PROP_ROLES = [
  'paper',
  'ink',
  'spark',
  'flash',
  'check',
  'glow',
  'glowDim',
  'ember',
  'coal',
  'scorch',
  'smoke',
  'smokeDim',
  'dust',
  'skyLit',
  'skyFlash',
] as const
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
 * All are in the character's own pixels, on its body; the animation is given them moved onto the stage.
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

/**
 * The named edges of the stage an animation may place things by, in stage pixels; never a fixed coordinate, so any character size works with any effect.
 *  - skyTop: the top row of the stage, whatever the camera shows: a camera that trims sky only crops what is drawn, it does not move the effects.
 *  - ground: the first ground row, the row under the feet.
 *  - left, right: the leftmost and rightmost columns the camera shows.
 */
export type Edges = { readonly skyTop: number; readonly ground: number; readonly left: number; readonly right: number }

/** An inclusive rectangle of pixels. */
export type Region = { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }

/**
 * Something the mod can detect, which the sidekick answers with an animation. The list is closed: a moment is added only together with a real event that produces it.
 * Which animation plays for a moment is the character's moveset, else the moment's plain default (the registry).
 */
export const MOMENTS = ['working', 'searching', 'search-failed', 'ticket-done', 'set-done', 'resting'] as const
export type Moment = (typeof MOMENTS)[number]

export type Character = {
  readonly name: string
  /**
   * Per moment, the name of the library animation this character plays for it; a moment left out plays that moment's plain default.
   * The registry refuses, at load, a name that is not in the library, an animation whose anchors or poses the character lacks, or one the strike cannot keep in step with.
   */
  readonly moveset?: Readonly<Partial<Record<Moment, string>>>
  /**
   * The ambient animations this character plays on its own while it rests, by name (the registry's `AMBIENT` catalog); left out or empty means none.
   * The registry refuses, at load, a name that is not an ambient animation, and one whose anchors or poses the character lacks.
   */
  readonly ambient?: readonly string[]
  /** Rows of letters, at most `MAX_CHARACTER` either way; '.' (or anything past a short row) is transparent. The stage is made to fit them. */
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
 * A character's walk cycle is three of them, the rows of its legs: `walkA` and `walkB` are the contact steps (a foot out in front, then the other), `walkPass` the passing step (the legs together).
 */
export const POSES = ['armUp', 'blink', 'tailUp', 'earsUp', 'walkA', 'walkB', 'walkPass'] as const
export type PoseName = (typeof POSES)[number]

/** The poses that make a walk cycle: a character that has any has all of them (the registry checks at load), and it walks; one that has none does not. */
export const WALK_POSES = ['walkA', 'walkB', 'walkPass'] as const satisfies readonly PoseName[]

/** Which way the sidekick faces on the stage; right is the way a character's body is drawn. */
export const FACINGS = ['right', 'left'] as const
export type Facing = (typeof FACINGS)[number]

/**
 * Where the sidekick stands and which way it faces. `x` is how many pixels right of home it is (left when negative); home is where the stage puts the character, and the stage keeps it on the world.
 * It is part of the activity's state and stays between animations.
 */
export type Place = { readonly x: number; readonly facing: Facing }

/** Home, facing right: where the sidekick starts and rests until something sends it elsewhere. */
export const HOME: Place = { x: 0, facing: 'right' }

/** Letters laid over the body from `at`, row by row: ' ' keeps the body's pixel, '.' clears it, any other letter is from the legend. */
export type Patch = { readonly at: Point; readonly rows: readonly string[] }

/** A pixel an animation or effect lays down; `role` is a body role (taken from the character) or a prop role, or a plain 0xRRGGBB colour that no recolour touches (an aura's flames, confetti). */
export type Dot = readonly [x: number, y: number, role: Role | number]

/**
 * The layers a frame is drawn in, back to front. The background supplies a picture for `sky`, `far` and `ground`; the character layer is the body and what it wears;
 * an animation puts dots on every layer but the character's (`FramePlan`), and what it puts on a layer is drawn after that layer's picture and before the next layer.
 */
export const LAYERS = ['sky', 'far', 'ground', 'character', 'effects', 'overlay'] as const
export type LayerName = (typeof LAYERS)[number]

/** The layers a background draws a picture on. */
export const BACK_LAYERS = ['sky', 'far', 'ground'] as const satisfies readonly LayerName[]
export type BackLayer = (typeof BACK_LAYERS)[number]

/** Whether a stage pixel is covered by the character in a frame. */
export type Mask = (x: number, y: number) => boolean

/**
 * What one frame does: the head bob (in pixels, down), the poses laid over the body in order (a later one wins),
 * how the whole character moves, and the props and effects drawn on the layers (see `LAYERS`). Accessories draw over posed pixels; anchors do not move with poses.
 * A patch inside the character's `headRegion` bobs with the head.
 *  - dx, dy: move the whole character, accessories included, by that many pixels (right, down); whole numbers.
 *  - mirror: the character faces the other way, about the middle of its frame so it stays where it stands; accessories are turned with it.
 *  - squash: whole rows; positive takes that many rows out just above the feet, negative (a stretch, at most the sky above the character) repeats the row two above the feet that many times. The feet stay on the same row; the rest of the body, accessories included, moves to meet them.
 *  - recolor: other colours for some body roles in this frame only; the next frame starts from the character's palette again. A worn pixel that is the colour of a recoloured role follows it.
 * A number that is not finite counts as 0. The animation is given the anchors at rest: they do not follow the move, mirror or squash, so an effect that must hug the moved body uses `aimed`.
 *  - dots: the effects layer, in front of the character.
 *  - layers: dots on the other layers, each drawn after that layer's background picture: `sky` (a flash lights it), `far` (behind the hills, so the background's ground layer hides what reaches below them), `ground` (marks such as a scorch or cracks, which exist only in the frames that draw them), and `overlay` (in front of everything, such as the check mark).
 *  - aimed: dots worked out from the character's mask (the pixels it covers in this frame, accessories included), such as an aura that hugs it; drawn with `dots`.
 */
export type FramePlan = {
  readonly bob?: number
  readonly poses?: readonly PoseName[]
  readonly dx?: number
  readonly dy?: number
  readonly mirror?: boolean
  readonly squash?: number
  readonly recolor?: Readonly<Partial<Record<BodyRole, number>>>
  readonly dots?: readonly Dot[]
  readonly layers?: Readonly<Partial<Record<BackLayer | 'overlay', readonly Dot[]>>>
  readonly aimed?: (mask: Mask) => readonly Dot[]
}

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
  /**
   * Where the sidekick stands before this animation starts, in pixels right of home (a strike point, say); it walks there first when it is elsewhere.
   * With motion off, or while the pane is not shown, it appears there. Left out, the animation plays wherever the sidekick is.
   */
  readonly startAt?: number
  /** Where the sidekick stands once this animation is over, as `startAt`; it walks there afterwards. Left out, it stays where it is. */
  readonly endAt?: number
  /**
   * One frame, worked out from the character's anchors (already on the stage, moved to where the sidekick stands and turned to the way it faces) and the stage's named edges only, never from its pixels or a fixed coordinate.
   * `facing` is the way it faces (right when left out), for an effect that trails behind it.
   * `headRegion` is the character's bob region on the stage, moved and turned like the anchors (left out when not known): a point inside it rides the frame's own `bob`, so an effect that starts on the head or the ears is placed with `ridingBob`.
   */
  readonly frame: (step: number, at: Anchors, edges: Edges, facing?: Facing, headRegion?: Region) => FramePlan
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

/** The frames of one layer of a background: one grid per frame, cycled; a grid is rows of letters from the background's palette, '.' (or anything it has no colour for) transparent. */
export type LayerFrames = readonly (readonly string[])[]

/**
 * A picture behind everything, in up to three layers of its own (each optional, each with frames of its own); it shows only where nothing in front is drawn.
 * All repeat sideways across the world from where the character stands, and are drawn back to front: sky, far, ground.
 *  - sky: the last row of each grid sits on the row just above the ground (the horizon); stars, clouds.
 *  - far: the same, but it is drawn behind the ground layer, so the hills in front of it hide what reaches below their tops; distant things.
 *  - ground: the last row sits on the first ground row and is repeated under it, rows above it are hills and grass.
 * With motion on, a background with more than one frame (in any layer) steps at a slow fixed interval while the sidekick rests; see `backgroundFrames`.
 */
export type Background = {
  readonly name: string
  /** The most pixels tall the stage may be with this background; a character that needs more cannot be drawn on it and the background is left out. Left out means no cap. */
  readonly heightCap?: number
  readonly sky?: LayerFrames
  readonly far?: LayerFrames
  readonly ground?: LayerFrames
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
