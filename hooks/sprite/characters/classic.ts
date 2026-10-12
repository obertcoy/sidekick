import { defineCharacter } from '../compose'

// The first sidekick: a small yellow electric critter with black-tipped ears, red cheeks and a
// zigzag tail on the left. Its own pixels, moved three rows down so its feet stand near the stage floor.
export const classic = defineCharacter({
  name: 'classic',
  body: [
    '',
    '',
    '',
    '..k......k',
    '..yy....yy',
    '...yy..yy',
    '...yyyyyy',
    '..yyyyyyyy',
    '..yyeyyeyy',
    'yyryyyyyyr',
    '.y.yyyyyy',
    'yy.yyyyyy',
    '.nnyyyyyy',
    '...yyyyyy',
    '...yy..yy',
  ],
  legend: { k: 'outline', y: 'base', n: 'shade', e: 'eye', r: 'cheek' },
  palette: {
    outline: 0x2b2b3a,
    base: 0xffd43b,
    shade: 0x8b5a2b,
    eye: 0x1a1a24,
    cheek: 0xe5484d,
  },
  anchors: {
    head: { x: 6, y: 6 },
    paw: { x: 9, y: 11 },
    reach: { x: 10, y: 9 },
    boltFrom: { x: 14, y: 2 },
    cheeks: [{ x: 2, y: 9 }, { x: 9, y: 9 }],
    tail: [{ x: 0, y: 9 }, { x: 0, y: 11 }],
    ears: [{ x: 2, y: 3 }, { x: 9, y: 3 }],
    feet: { x: 6, y: 14 },
  },
  // Columns 0-1 hold the tail, which stays put while the head bobs.
  headRegion: { left: 2, top: 3, right: 17, bottom: 9 },
})
