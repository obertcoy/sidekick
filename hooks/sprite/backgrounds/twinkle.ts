import type { Background } from '../types'

/** One frame of the sky: 18 columns by 15 rows, '.' empty, 's' a dim star and 't' a glowing one, at the `stars` given as column, row. */
const sky = (stars: readonly (readonly [x: number, y: number, light: 's' | 't'])[]): string[] =>
  Array.from({ length: 15 }, (_, y) => Array.from({ length: 18 }, (_, x) => stars.find(([sx, sy]) => sx === x && sy === y)?.[2] ?? '.').join(''))

/** Four stars beside the sidekick, which take turns to glow: two sky frames that step slowly while it rests, over a ground line. */
export const twinkle: Background = {
  name: 'twinkle',
  sky: [
    sky([
      [16, 2, 't'],
      [17, 6, 's'],
      [13, 10, 't'],
      [16, 12, 's'],
    ]),
    sky([
      [16, 2, 's'],
      [17, 6, 't'],
      [13, 10, 's'],
      [16, 12, 't'],
    ]),
  ],
  ground: [['gggggggggggggggggg']],
  palette: { s: 0x5c5470, t: 0xc9bfe8, g: 0x3a3340 },
}
