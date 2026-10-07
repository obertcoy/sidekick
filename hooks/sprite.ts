export type Mode = 'idle' | 'write' | 'zap'

export const SPRITE = { columns: 16, rows: 6 } as const

const DEFAULT = 0x01000000
const PALETTE: Record<string, number> = {
  y: 0xffd43b,
  k: 0x2b2b3a,
  e: 0x1a1a24,
  r: 0xe5484d,
  n: 0x8b5a2b,
  w: 0xfffbe6,
  g: 0x40c057,
  p: 0xf1f3f5,
  i: 0x495057,
}

// Two pixels to a cell, one above the other: 16 wide, 12 tall. A small yellow
// electric critter: black-tipped ears, red cheeks, a zigzag tail on the left.
const BODY = [
  '..k......k......',
  '..yy....yy......',
  '...yy..yy.......',
  '...yyyyyy.......',
  '..yyyyyyyy......',
  '..yyeyyeyy......',
  'yyryyyyyyr......',
  '.y.yyyyyy.......',
  'yy.yyyyyy.......',
  '.nnyyyyyy.......',
  '...yyyyyy.......',
  '...yy..yy.......',
]

type Dot = readonly [x: number, y: number, color: string]

const line = (x: number, y: number, dx: number, dy: number, count: number, color: string): Dot[] =>
  Array.from({ length: count }, (_, step) => [x + dx * step, y + dy * step, color] as const)

const PAPER: Dot[] = [7, 8, 9, 10].flatMap(y => line(11, y, 1, 0, 5, 'p'))
const CHECK: Dot[] = [[10, 6, 'g'], [11, 7, 'g'], [12, 6, 'g'], [13, 5, 'g'], [14, 4, 'g']]
const bolt = (color: string): Dot[] => [
  ...line(14, 0, -1, 1, 3, color),
  ...line(12, 3, 1, 0, 3, color),
  ...line(14, 4, -1, 1, 4, color),
]
const CHARGE: Dot[] = [[2, 6, 'w'], [9, 6, 'w'], [10, 5, 'y'], [11, 4, 'w'], [1, 5, 'y']]

const WRITE: Dot[][] = [0, 1, 2, 3, 4, 5].map(step => [
  ...PAPER,
  ...line(12, 8, 1, 0, Math.min(3, step + 1), 'i'),
  ...line(12, 9, 1, 0, Math.max(0, step - 2), 'i'),
  [9, 8, 'y'],
  [10, 8, 'y'],
  [11, 8 + (step % 2), 'r'],
])

const ZAP: Dot[][] = [
  CHARGE,
  CHARGE,
  [...CHARGE, ...bolt('w')],
  [...bolt('y'), [10, 9, 'y'], [13, 9, 'y'], [12, 10, 'w'], [14, 8, 'y']],
  [[11, 10, 'y'], [14, 6, 'y'], [13, 2, 'y']],
  ...Array.from({ length: 8 }, () => CHECK),
]

const FRAMES: Record<Mode, Dot[][]> = { idle: [[]], write: WRITE, zap: ZAP }

export const frameCount = (mode: Mode): number => FRAMES[mode].length

const encode = (bytes: Uint8Array): string => {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let text = ''
  for (let at = 0; at < bytes.length; at += 3) {
    const a = bytes[at] ?? 0
    const b = bytes[at + 1] ?? 0
    const c = bytes[at + 2] ?? 0
    text += table[a >> 2]
    text += table[((a & 3) << 4) | (b >> 4)]
    text += at + 1 < bytes.length ? table[((b & 15) << 2) | (c >> 6)] : '='
    text += at + 2 < bytes.length ? table[c & 63] : '='
  }

  return text
}

/** One frame as a Raster's cells: each cell a half block coloured by its upper and lower pixel. */
export const cellsOf = (mode: Mode, frame: number): string => {
  const pixels = BODY.map(row => [...row])
  for (const [x, y, color] of FRAMES[mode][frame % frameCount(mode)] ?? []) {
    const row = pixels[y]
    if (row !== undefined && x >= 0 && x < SPRITE.columns) row[x] = color
  }
  const words = new Uint32Array(SPRITE.columns * SPRITE.rows * 3)
  for (let row = 0; row < SPRITE.rows; row++) {
    for (let column = 0; column < SPRITE.columns; column++) {
      const upper = PALETTE[pixels[row * 2]?.[column] ?? '.']
      const lower = PALETTE[pixels[row * 2 + 1]?.[column] ?? '.']
      const at = (row * SPRITE.columns + column) * 3
      // An upper half block shows its foreground above and its background below.
      words[at] = upper === undefined ? (lower === undefined ? 0x20 : 0x2584) : 0x2580
      words[at + 1] = upper ?? lower ?? DEFAULT
      words[at + 2] = upper === undefined ? DEFAULT : (lower ?? DEFAULT)
    }
  }

  return encode(new Uint8Array(words.buffer))
}
