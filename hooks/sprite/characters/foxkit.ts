import { defineCharacter } from '../compose'

// V3 Foxkit: ears that stick straight out sideways, a forked flame-tip tail, coral cheek points, dark outline.
export const foxkit = defineCharacter({
  name: 'foxkit',
  body: [
    '..................',
    '....ooooooo.......',
    '.oooyhyyyyyooo....',
    'osyyhyyyyyyyyso...',
    '.oooyeyyyeyooo....',
    '...oyeyyyeyo......',
    'o.ocyyoyyco.......',
    'hoh.oyyyyyo.......',
    'oyyooybbbyo.......',
    'osyoyybbbyso......',
    'oso.oybbbyso......',
    '.oo.oybbbyso......',
    '...oyyyyysso......',
    '...oyyooyyso......',
    '...ooo..ooo.......',
    '..................',
  ],
  legend: { o: 'outline', y: 'base', s: 'shade', h: 'highlight', c: 'cheek', e: 'eye', b: 'belly' },
  palette: {
    outline: 0x2b1d2a,
    base: 0xffcf33,
    shade: 0xe58a2b,
    highlight: 0xfff1a0,
    cheek: 0xff6f5e,
    eye: 0x1a1420,
    belly: 0xfff3cf,
  },
  anchors: {
    head: { x: 7, y: 1 },
    paw: { x: 12, y: 10 },
    reach: { x: 13, y: 7 },
    boltFrom: { x: 17, y: 0 },
    cheeks: [{ x: 3, y: 6 }, { x: 9, y: 6 }],
    tail: [{ x: 0, y: 6 }, { x: 2, y: 6 }],
    ears: [{ x: 0, y: 3 }, { x: 14, y: 3 }],
    feet: { x: 7, y: 14 },
  },
  // Columns 0-2 hold the ear tip and the tail, which stay put while the head bobs.
  headRegion: { left: 3, top: 1, right: 17, bottom: 8 },
})
