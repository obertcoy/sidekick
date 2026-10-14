// The sidekick's sprite, as register.tsx draws it. The pieces live in ./sprite/: characters,
// animations, accessories and backgrounds, each one file, put together by ./sprite/registry.ts.
import { STAGE, render } from './sprite/compose'
import { ANIMATIONS, drawable, droppedLine } from './sprite/registry'

/** What the sidekick is doing: one animation per mode. */
export type Mode = keyof typeof ANIMATIONS

/** The fixed stage in cells, so the pane's layout never changes with the look. */
export const SPRITE = { columns: STAGE.columns, rows: STAGE.rows } as const

export const frameCount = (mode: Mode): number => ANIMATIONS[mode].frames

/** How long each frame of the mode's animation shows. */
export const msPerFrame = (mode: Mode): number => ANIMATIONS[mode].msPerFrame

/** One frame as a Raster's cells: each cell a half block coloured by its upper and lower pixel. The look is resolved on each call, and a part that cannot be drawn is left out. */
export const cellsOf = (mode: Mode, frame: number): string => render(drawable(), ANIMATIONS[mode], frame)

/** The line naming the parts left out of the look, or empty; it follows the look as last resolved. */
export const leftOut = (): string => {
  drawable()

  return droppedLine()
}
