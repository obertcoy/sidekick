import type { Accessory } from '../types'

/** A pennant on a pole, four wide and six tall. The foot of the pole sits on the held anchor; the flag flies from the top. */
export const flag: Accessory = {
  name: 'flag',
  slot: 'held',
  pixels: [
    'pfff',
    'pffd',
    'pd..',
    'p...',
    'p...',
    'p...',
  ],
  origin: { x: 0, y: 5 },
  palette: { p: 0x8b6b4a, f: 0x3b82f6, d: 0x1e56b8 },
}
