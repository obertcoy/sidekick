// The sidekick's sprite, as register.tsx draws it. The pieces live in ./sprite/: characters,
// animations, outfits and backgrounds, each one file, put together by ./sprite/registry.ts.
import { STAGE, render } from './sprite/compose'
import { ANIMATIONS, LOOK, layersOf } from './sprite/registry'

/** What the sidekick is doing: one animation per mode. */
export type Mode = keyof typeof ANIMATIONS

/** The fixed stage in cells, so the pane's layout never changes with the look. */
export const SPRITE = { columns: STAGE.columns, rows: STAGE.rows } as const

const layers = layersOf(LOOK)

export const frameCount = (mode: Mode): number => ANIMATIONS[mode].frames

/** One frame as a Raster's cells: each cell a half block coloured by its upper and lower pixel. */
export const cellsOf = (mode: Mode, frame: number): string => render(layers, ANIMATIONS[mode], frame)
