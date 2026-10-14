import type { Animation } from '../types'

/** Standing still. */
export const idle: Animation = { frames: 1, msPerFrame: 220, once: false, hides: [], frame: () => ({}) }
