import type { Background } from '../types'

/** A dim sky with two faint stars (the sky layer) and a ground line under the feet (the ground layer). */
export const dusk: Background = {
  name: 'dusk',
  sky: [
    [
      '..................',
      '...............s..',
      '..................',
      '..................',
      '..s...............',
      '..................',
      '..................',
      '..................',
      '..................',
      '..................',
      '..................',
      '..................',
      '..................',
      '..................',
      '..................',
    ],
  ],
  ground: [['gggggggggggggggggg']],
  palette: { s: 0x5c5470, g: 0x3a3340 },
}
