import type { Accessory } from '../types'

/** Dark lenses joined by a bridge, with a glint, seven wide and two tall. The bridge sits on the face anchor, so the lenses cover the eyes. */
export const glasses: Accessory = {
  name: 'glasses',
  slot: 'face',
  pixels: [
    'gLLLgLL',
    'LLL.LLL',
  ],
  origin: { x: 3, y: 0 },
  palette: { L: 0x1f2430, g: 0x8fb4ff },
}
