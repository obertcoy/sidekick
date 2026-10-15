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
    // The top row of the lenses, which cover the eye row below; in the head region, so glasses bob with the head.
    face: { x: 6, y: 7 },
    // The first row of the body under the head, outside the head region: a scarf stays put while the head bobs.
    neck: { x: 6, y: 10 },
    // The foot of a held pole, one pixel right of the paw and two down, so the whole flag (x 10-13, y 8-13) clears the head and the cap's brim even when the brim bobs down a pixel; outside the head region, so it stays put while the head bobs.
    held: { x: 10, y: 13 },
    paw: { x: 9, y: 11 },
    reach: { x: 10, y: 9 },
    boltFrom: { x: 14, y: 2 },
    cheeks: [
      { x: 2, y: 9 },
      { x: 9, y: 9 },
    ],
    tail: [
      { x: 0, y: 9 },
      { x: 0, y: 11 },
    ],
    ears: [
      { x: 2, y: 3 },
      { x: 9, y: 3 },
    ],
    feet: { x: 6, y: 14 },
  },
  // Columns 0-1 hold the tail, which stays put while the head bobs.
  headRegion: { left: 2, top: 3, right: 17, bottom: 9 },
  // The cap and glasses ride the head; the scarf and what is held stay on the body.
  bobs: { head: true, face: true, neck: false, held: false },
})
