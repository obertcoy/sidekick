import { defineAnimation } from '../compose'

/** Standing still. */
export const idle = defineAnimation({ needs: [], poses: [], frames: 1, msPerFrame: 220, once: false, hides: [], frame: () => ({}) })
