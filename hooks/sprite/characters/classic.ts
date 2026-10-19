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
  poses: {
    // The raised arm zap draws around the `reach` paw at (10,9): outline above it, base on it, outline to its lower left. The patch straddles the headRegion (bottom row 9): its pixels at y 8 and 9 bob with the head, the `k` at (9,10) does not. Zap has no bob, so nothing tears today; a bobbing animation using this pose would need the patch moved inside the region.
    armUp: { at: { x: 9, y: 8 }, rows: [' k', ' y', 'k'] },
    // Both arms up for the jump and the power-up: `armUp`'s right arm and a left one, an outline pixel over a base one at (1,7)-(1,8), as the motion prototype draws them. The patch spans the head region (rows 8 and 9 bob with the head, as armUp's do); neither animation that uses it bobs.
    armsUp: { at: { x: 1, y: 7 }, rows: ['k', 'y        k', '         y', '        k'] },
    // Closed eyes: the one-pixel eyes at (4,8) and (7,8) become shade, the lid; the eye and the outline are nearly the same colour, so shade reads better. Inside the headRegion, so it bobs with the head; glasses draw over it.
    blink: { at: { x: 4, y: 8 }, rows: ['n  n'] },
    // The zigzag's upper tip moves up and left: (0,8) is drawn and (0,9) cleared, so the tail leans. Columns 0-1 are outside the headRegion, so it stays put while the head bobs.
    tailUp: { at: { x: 0, y: 8 }, rows: ['y', '.y'] },
    // The zigzag drops: the tail's upper tip at (0,9) is cleared and a base pixel set at (0,10), under it. Outside the headRegion.
    tailDown: { at: { x: 0, y: 9 }, rows: ['.', 'y'] },
    // Each ear tip gains an outline pixel above it, at (2,2) and (9,2), so the ears look lifted. Both are above the headRegion (top row 3); the ear flick has no bob.
    earsUp: { at: { x: 2, y: 2 }, rows: ['k      k'] },
    // The power-up's ears: the row above the ear tips becomes outline at the tips (2,2) and (9,2) with base between them and the tips, so each ear grows a point. Above the headRegion (top row 3), so it does not bob.
    spiky: { at: { x: 2, y: 2 }, rows: ['ky    yk'] },
    // The walk cycle is its feet row (14), drawn over the standing feet at columns 3-4 and 7-8 as the motion prototype's legs are: a stride one way, the legs together for the passing step, a stride the other way.
    walkA: { at: { x: 0, y: 14 }, rows: ['..yy...yy'] },
    walkB: { at: { x: 0, y: 14 }, rows: ['...yy...yy'] },
    walkPass: { at: { x: 0, y: 14 }, rows: ['....yyy..'] },
  },
  // What it plays for each moment: the animations drawn for it (the storm, the jump and the power-up are its own: the foxkit plays the zap and the cheer). A moment left out would play its plain default.
  moveset: {
    working: 'write',
    searching: 'look',
    'search-failed': 'shrug',
    'ticket-done': 'thunder',
    'set-done': 'jump',
    // Where the power-up finally plays is the owner's to decide (ticket 24); until then it plays when the last open ticket of a set is started.
    'last-started': 'powerUp',
  },
  // The ambient animations it plays while it rests; each needs anchors and poses it has.
  ambient: ['blink', 'tailFlick', 'earFlick', 'cheekSpark'],
  // Columns 0-1 hold the tail, which stays put while the head bobs.
  headRegion: { left: 2, top: 3, right: 17, bottom: 9 },
  // The cap and glasses ride the head; the scarf and what is held stay on the body.
  bobs: { head: true, face: true, neck: false, held: false },
})
