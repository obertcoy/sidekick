import { rng } from '../effects'
import type { Background } from '../types'

// The storm sky of the motion prototype (variant C, `.scratch/sidekick/prototypes.html#motion`): a cloud bank across the top, stars, distant bolts behind the hills, and the hills in front of them.
// It is drawn for the classic's stage: a world 40 wide and 23 rows of sky above the horizon. A stage with less sky shows the lower part of it.

const WIDTH = 40
const SKY_ROWS = 23
const TAU = Math.PI * 2

/** A column of the world as a column of the pictures: the prototype's stage began six pixels left of where the sidekick stands. */
const column = (x: number): number => (((x + WIDTH - 6) % WIDTH) + WIDTH) % WIDTH

const blank = (rows: number): string[][] => Array.from({ length: rows }, () => Array.from({ length: WIDTH }, () => '.'))
const set = (grid: string[][], x: number, y: number, letter: string): void => {
  const row = grid[y]
  if (row !== undefined && y >= 0) row[((x % WIDTH) + WIDTH) % WIDTH] = letter
}
const rowsOf = (grid: string[][]): string[] => grid.map(row => row.join(''))

/** Far-off strikes, by the step they flash at (the prototype's schedule for the zap, 44 steps): `seed` draws a bolt behind the clouds, a strike without one is sheet lightning that only lights the clouds. */
const STRIKES: readonly { readonly at: number; readonly x: number; readonly seed?: number }[] = [
  { at: 1, x: 34, seed: 2 },
  { at: 5, x: 12, seed: 7 },
  { at: 15, x: 22, seed: 9 },
  { at: 22, x: 4, seed: 3 },
  { at: 28, x: 36 },
  { at: 34, x: 16, seed: 5 },
]

/** How many pictures of the far layer there are, one per step of the schedule. */
const STEPS = 44

/** The stars, as column and row. */
const STARS = [
  [3, 2],
  [11, 1],
  [19, 4],
  [26, 1],
  [34, 3],
  [38, 6],
  [15, 7],
  [30, 6],
] as const

const sky = (): string[] => {
  const grid = blank(SKY_ROWS)
  for (const [x, y] of STARS) set(grid, column(x), y, 's')

  return rowsOf(grid)
}

/** The cloud bank: its depth by column, a few rows at the top. */
const depth = (x: number): number => Math.round(2.2 + Math.sin((TAU * 13 * x) / WIDTH) * 1.1 + Math.sin((TAU * 24 * x) / WIDTH + 2) * 0.7)

/** A thin bolt from under the clouds down toward the hills, wandering; `level` 2 is the flash, 1 the glow after it. */
const distantBolt = (grid: string[][], seed: number, x: number, level: 1 | 2): void => {
  const next = rng(seed)
  let at = x
  const bottom = 18 + Math.floor(next() * 3)
  for (let y = 2; y <= bottom; y++) {
    set(grid, at, y, level === 2 ? 'B' : 'b')
    const roll = next()
    if (roll < 0.3) at -= 1
    else if (roll < 0.6) at += 1
    if (y === 6 && level === 2) {
      set(grid, at + 1, y + 1, 'f')
      set(grid, at + 2, y + 2, 'f')
    }
  }
}

/** The far layer at one step: the clouds, lit near a strike on its step and glowing after it, and the bolt behind them. */
const far = (step: number): string[] => {
  const grid = blank(SKY_ROWS)
  const lights = STRIKES.flatMap(strike => {
    const x = column(strike.x)
    if (step === strike.at) return [{ x, reach: strike.seed === undefined ? 14 : 7, level: 2 }]
    if (step === strike.at + 1) return [{ x, reach: 5, level: 1 }]

    return []
  })
  for (let x = 0; x < WIDTH; x++) {
    const level = Math.max(
      0,
      ...lights.map(light => {
        const apart = Math.abs(x - light.x)

        return Math.min(apart, WIDTH - apart) <= light.reach ? light.level : 0
      }),
    )
    for (let y = 0; y < depth(x); y++) set(grid, x, y, 'cde'[level] ?? 'c')
  }
  for (const strike of STRIKES) {
    if (strike.seed === undefined) continue
    if (step === strike.at) distantBolt(grid, strike.seed, column(strike.x), 2)
    if (step === strike.at + 1) distantBolt(grid, strike.seed, column(strike.x), 1)
  }

  return rowsOf(grid)
}

/** The tallest the hills stand above the horizon row, in rows (the horizon row itself included). */
const HILLS = 5
const GRASS = [1, 8, 13, 21, 25, 33, 37] as const

/** The hills in front of the far layer, grass on their feet, and the ground under them. */
const ground = (): string[] => {
  const grid = blank(HILLS)
  for (let x = 0; x < WIDTH; x++) {
    const h = Math.round(2 + Math.sin((TAU * 9 * x) / WIDTH) * 1.3 + Math.sin((TAU * 19 * x) / WIDTH + 1) * 0.6)
    for (let y = HILLS - 1 - h; y < HILLS; y++) set(grid, x, y, 'h')
  }
  for (const x of GRASS) set(grid, column(x), HILLS - 1, 'p')

  return [...rowsOf(grid), 'g'.repeat(WIDTH)]
}

/**
 * A storm: dark clouds across the top, stars, and distant bolts that flash behind the hills (the far layer). The hills and the ground are the ground layer.
 * With motion on it steps while the sidekick rests, so a far-off bolt now and then flashes and fades; an animation steps it with its own frames, so the storm answers the zap's.
 */
export const storm: Background = {
  name: 'storm',
  sky: [sky()],
  far: Array.from({ length: STEPS }, (_, step) => far(step)),
  ground: [ground()],
  palette: {
    s: 0x5c5470,
    c: 0x1d1b27,
    d: 0x34314a,
    e: 0x5a5680,
    b: 0x5b6aa0,
    B: 0xc8d4ff,
    f: 0x7f8fd0,
    h: 0x221e2a,
    p: 0x4d4560,
    g: 0x3a3340,
  },
}
