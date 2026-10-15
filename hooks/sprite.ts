// The sidekick's sprite, as register.tsx draws it. The pieces live in ./sprite/: characters,
// animations, accessories and backgrounds, each one file, put together by ./sprite/registry.ts;
// ./sprite/look-in-use.ts resolves what is worn now.
import { render, STAGE } from './sprite/compose'
import { characterInUse, drawable } from './sprite/look-in-use'
import { animationOf, type State } from './sprite/registry'
import type { Animation } from './sprite/types'

export { leftOut } from './sprite/look-in-use'
export type { State }

/** The fixed stage in cells, so the pane's layout never changes with the look. */
export const SPRITE = { columns: STAGE.columns, rows: STAGE.rows } as const

/** The animation that plays for a state, for the character drawn now. The activity times by it and the pane draws it. */
export const playsFor = (state: State): Animation => animationOf(characterInUse(), state)

/**
 * One frame of an animation as a Raster's cells: each cell a half block coloured by its upper and lower pixel.
 * The look is resolved on each call, and a part that cannot be drawn is left out. The background steps with the animation unless given its own frame.
 */
export const cellsOf = (animation: Animation, frame: number, backgroundFrame?: number): string => render(drawable(), animation, frame, backgroundFrame)
