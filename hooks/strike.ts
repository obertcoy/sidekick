import type { Animation } from './sprite/types'

// The ticket strike: when tickets finish, a bolt lands on their rows, which flash and have the
// strike-through burn across them. It is paced in steps of the animation that plays for the ticket-done
// moment, one step per frame and one more at rest; register.tsx draws the rows, the tests read these.

/** The steps past the last frame of the animation, at rest; the activity adds them to the frames of the animation that plays when the strike starts. */
export const STRIKE_REST_STEPS = 1

/** How many steps the strike has for the animation that plays: one per frame, and the last one at rest. */
export const strikeSteps = (animation: Pick<Animation, 'frames'>): number => animation.frames + STRIKE_REST_STEPS

/** Whether a step still draws the struck row; the last two steps show it plain, as done. */
export const isStruck = (step: number, steps: number): boolean => step < steps - 2

// The beats of the strike, by step: 0-1 the sidekick charges (the row still shows what it was), 2 the bolt
// leaves the sidekick, 3 it lands on the row's glyph, 4 the row flashes as done, 5-10 the strike-through burns, the rest is rest.
export const LEAVES = 2
export const LANDS = 3
export const HITS = 4
export const BURNS = 5
export const BURN_STEPS = 6

/**
 * The fewest frames an animation can have and still play for a finished ticket: with the rest step the strike then has enough steps
 * for the flash and for at least one step of the burn still drawn struck, before the last two steps show the row plain.
 */
export const MIN_STRIKE_FRAMES = BURNS + 2

/**
 * The beats of the strike for one animation, by step: the bolt leaves the sidekick (`leaves`), lands on the row's glyph (`lands`), the row flashes as done (`hits`), and the strike-through burns from `burns` for `BURN_STEPS` steps.
 * An animation that declares `strikeAt` sets when the bolt leaves and lands; the rest follow from them. One that does not has the defaults above, which fit the zap.
 */
export type Beats = { readonly leaves: number; readonly lands: number; readonly hits: number; readonly burns: number }

/** The beats of the strike while `animation` plays for a finished ticket. */
export const beatsOf = (animation: Pick<Animation, 'strikeAt'>): Beats => {
  const { strikeAt } = animation

  return strikeAt === undefined
    ? { leaves: LEAVES, lands: LANDS, hits: HITS, burns: BURNS }
    : { leaves: strikeAt.leaves, lands: strikeAt.lands, hits: strikeAt.lands + 1, burns: strikeAt.lands + 2 }
}

/** The fewest frames an animation with these beats can have and still play for a finished ticket (see `MIN_STRIKE_FRAMES`, which is the same for the default beats). */
export const framesForBeats = (beats: Beats): number => beats.burns + 2

/** Why an animation's declared beats cannot be kept in step with, or undefined when they can: whole steps in order, with room for the flash and the burn before it ends. */
export const beatsRefusal = (animation: Pick<Animation, 'strikeAt' | 'frames'>): string | undefined => {
  const { strikeAt } = animation
  if (strikeAt === undefined) return undefined
  if (!Number.isInteger(strikeAt.leaves) || !Number.isInteger(strikeAt.lands) || strikeAt.leaves < 0 || strikeAt.lands <= strikeAt.leaves) {
    return `has the strike beats leaves ${strikeAt.leaves} and lands ${strikeAt.lands}; they need whole steps, the bolt leaving before it lands`
  }
  const least = framesForBeats(beatsOf(animation))

  return animation.frames < least ? `has ${animation.frames} frames, and the strike beats it declares need at least ${least}` : undefined
}
