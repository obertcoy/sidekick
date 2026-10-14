import type { Accessory } from '../types'

/** A teal scarf, six wide, with a short tail hanging under its right end. Its top row sits on the neck anchor. */
export const scarf: Accessory = {
  name: 'scarf',
  slot: 'neck',
  pixels: [
    'tttttt',
    '....td',
  ],
  origin: { x: 3, y: 0 },
  palette: { t: 0x2ec4b6, d: 0x1f8f86 },
}
