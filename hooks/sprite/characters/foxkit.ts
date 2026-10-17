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
    // Between the eyes; in the head region, so glasses bob with the head.
    face: { x: 7, y: 4 },
    // The row under the chin, outside the head region: a scarf stays put while the head bobs.
    neck: { x: 7, y: 9 },
    // The foot of a held pole, on the paw's pixel; outside the head region, so a held item stays put while the head bobs.
    held: { x: 12, y: 10 },
    paw: { x: 12, y: 10 },
    reach: { x: 13, y: 7 },
    boltFrom: { x: 17, y: 0 },
    cheeks: [
      { x: 3, y: 6 },
      { x: 9, y: 6 },
    ],
    tail: [
      { x: 0, y: 6 },
      { x: 2, y: 6 },
    ],
    ears: [
      { x: 0, y: 3 },
      { x: 14, y: 3 },
    ],
    feet: { x: 7, y: 14 },
  },
  poses: {
    // The raised arm zap draws around the `reach` paw at (13,7): outline above it, base on it, outline to its lower left. The patch is inside the headRegion, so it bobs with the head; zap has no bob.
    armUp: { at: { x: 12, y: 6 }, rows: [' o', ' y', 'o'] },
    // Closed eyes: the two-pixel eyes at (5,4-5) and (9,4-5) become a lid. The top pixel goes to base, the bottom to the outline colour. Inside the headRegion, so it bobs with the head; glasses draw over it.
    blink: { at: { x: 5, y: 4 }, rows: ['y   y', 'o   o'] },
    // The flame fork stands one row higher: tips at (0,5) and (2,5), the stem one row longer. Outside the headRegion (columns 0-2), so it stays put while the head bobs.
    tailUp: { at: { x: 0, y: 5 }, rows: ['o.o', 'hoh', 'oyo'] },
    // Each ear tip gains an outline pixel above it, at (0,2) and (14,2), so the ears look lifted. The left one is outside the headRegion, the right one inside it, so an animation that bobs would tear them apart; the ear flick has no bob.
    earsUp: { at: { x: 0, y: 2 }, rows: ['o             o'] },
  },
  // What it plays for each moment: the shared animations drawn for it. A moment left out would play its plain default.
  moveset: { working: 'write', searching: 'look', 'search-failed': 'shrug', 'ticket-done': 'zap', 'set-done': 'cheer' },
  // The ambient animations it plays while it rests; each needs anchors and poses it has.
  ambient: ['blink', 'tailFlick', 'earFlick', 'cheekSpark'],
  // Columns 0-2 hold the ear tip and the tail, which stay put while the head bobs.
  headRegion: { left: 3, top: 1, right: 17, bottom: 8 },
  // The cap and glasses ride the head; the scarf and what is held stay on the body.
  bobs: { head: true, face: true, neck: false, held: false },
})
