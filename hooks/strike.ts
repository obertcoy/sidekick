import type { Animation } from './sprite/types'

// The ticket strike: when tickets finish, a bolt lands on their rows, which flash and have the
// strike-through burn across them. It is paced in steps of the animation that plays for the ticket-done
// state, one step per frame and one more at rest; register.tsx draws the rows, the tests read these.

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
