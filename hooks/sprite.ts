// The sidekick's sprite, as register.tsx draws it. The pieces live in ./sprite/: characters,
// animations, accessories and backgrounds, each one file, put together by ./sprite/registry.ts;
// ./sprite/look-in-use.ts resolves what is worn now.
import { backgroundFrames, cameraFor, render, stageOf, type View } from './sprite/compose'
import { characterInUse, drawable } from './sprite/look-in-use'
import { ambientAnimationsOf, animationOf, type Moment } from './sprite/registry'
import type { Animation, Layers } from './sprite/types'

export { leftOut } from './sprite/look-in-use'
export type { Moment, View }

/** What the pane gives the sprite to look through: the pane's body, in cells. */
export type Pane = { readonly columns: number; readonly rows: number }

/** The pane body's size before any pane has rendered, as the dock usually is: a repaint then looks through the camera it would have there. */
export const DEFAULT_PANE: Pane = { columns: 40, rows: 30 }

/** The columns the pane's header keeps for its text beside the sprite; the camera gets the rest of the width. */
export const HEADER_TEXT_COLUMNS = 17

/** The rows of the pane that are neither the sprite nor the ticket list: the header's text, the bar, the tabs and the lines around the list. */
export const PANE_CHROME_ROWS = 8

/** The rows the ticket list has always had: the pane body less this, at least 3. The sprite gets what the pane has left beside the list, so a taller stage never costs the list a row. */
export const LIST_PANE_ROWS = 16

/** The rows the ticket list gets in a pane of `rows` rows, beside a sprite of `spriteRows` cells. */
export const listRoom = (rows: number, spriteRows: number): number => Math.max(3, rows - PANE_CHROME_ROWS - spriteRows)

/**
 * What the camera looks at in a pane: the stage of the look drawn now, through the pane's width (less a column of padding each side and the header's text)
 * and the height left once the list has the rows it has always had (the camera trims sky from the stage to fit, but never cuts into the character). It keeps the character centred and whole; see `cameraFor`. With no pane it is the whole stage.
 */
export const viewIn = (pane?: Pane, layers: Layers = drawable()): View =>
  cameraFor(
    stageOf(layers),
    pane === undefined
      ? undefined
      : { columns: pane.columns - 2 - 1 - HEADER_TEXT_COLUMNS, rows: pane.rows - PANE_CHROME_ROWS - Math.max(3, pane.rows - LIST_PANE_ROWS) },
  )

/** The animation that plays for a moment, for the character drawn now. The activity times by it and the pane draws it. */
export const playsFor = (moment: Moment): Animation => animationOf(characterInUse(), moment)

/** The ambient animations the character drawn now plays on its own; none when it lists none. The activity asks again whenever the answer matters. */
export const ambientFor = (): Animation[] => ambientAnimationsOf(characterInUse())

/** How many frames the background drawn now has in all; one when it is still or there is none. The activity asks again whenever the answer matters, to know whether the background moves at rest. */
export const backdropFrames = (): number => backgroundFrames(drawable().background)

/**
 * One frame of an animation as a Raster's cells: each cell a half block coloured by its upper and lower pixel, of the part of the stage the pane's camera looks at (all of it with no pane).
 * The look is resolved on each call, and a part that cannot be drawn is left out. The background steps with the animation unless given its own frame.
 */
export const cellsOf = (animation: Animation, frame: number, backgroundFrame?: number, pane?: Pane): string => {
  const layers = drawable()

  return render(layers, animation, frame, backgroundFrame, viewIn(pane, layers))
}
