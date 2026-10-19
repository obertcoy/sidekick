import type { Dot, Edges, Mask, Point, Region, Role } from './types'

// The effects library: things an animation draws that are not the body, drawn from the character's anchors, its mask and the stage's edges, and from nothing else.
// Every effect is a pure function of the frame number, a seed and what it is aimed by (anchors, a mask, the edges it is given), and returns dots: the same arguments draw the same pixels, whatever was drawn before.
// An effect that takes the stage's edges reads the side edges the camera has (so a wider pane shows more of a shockwave or confetti), and the stage's own sky top, so a pane that trims sky only crops it.
// `bolt` and `flash` take no frame: the animation owns their timing, by calling them in the frames that show them.
// A frame number counts from when the effect begins; before it begins (negative) an effect draws nothing. The animation chooses the layer the dots go on (`FramePlan`).
// The looks and numbers follow the motion prototype (variant C, `.scratch/sidekick/prototypes.html#motion`).

/** A colour for a dot: a role, or a plain 0xRRGGBB. */
type Paint = Role | number

/** A small seeded random number generator (mulberry32): the same seed gives the same run of numbers in [0, 1). */
export const rng = (seed: number): (() => number) => {
  let state = seed | 0

  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A pixel of a computed position: whole, and never minus zero. */
const px = (n: number): number => Math.round(n) + 0

const dot = (x: number, y: number, paint: Paint): Dot => [px(x), px(y), paint]

/**
 * The path of a bolt from `from` down to `to`: joined pixels, one row at a time with a sideways step now and then, hurrying toward `to` when it would otherwise miss.
 * It ends at `to` and starts at `from`; a `to` that is not below `from` is no way down, and the path is `from` alone.
 */
export const boltPath = (seed: number, from: Point, to: Point): Point[] => {
  const next = rng(seed)
  const path: Point[] = [from]
  let x = from.x
  for (let y = from.y; y <= to.y; y++) {
    if (y > from.y) path.push({ x, y })
    const remaining = to.y - y
    const need = to.x - x
    // A bolt that still has rows to wander in may step either way; one that is running out of rows steps toward its target.
    const step = need !== 0 && Math.abs(need) >= remaining ? Math.sign(need) : remaining > 0 ? (next() < 0.5 ? -1 : 1) * (next() < 0.7 ? 1 : 0) : 0
    if (step !== 0) {
      x += step
      path.push({ x, y })
    }
  }
  // A target farther sideways than the rows allow is reached along the last row.
  while (x !== to.x && to.y >= from.y) {
    x += Math.sign(to.x - x)
    path.push({ x, y: to.y })
  }

  return path
}

/**
 * A bolt of lightning from `from` down to `to` (stage pixels), `core` on a glow of `glow` either side when given, and `branches` forks that leave the main bolt on the way down.
 * The glow is drawn first so the core is over it. It takes no frame: the animation owns its timing and calls it in the frames that show it.
 */
export const bolt = ({
  seed,
  from,
  to,
  branches = 0,
  core = 'flash',
  glow,
}: {
  seed: number
  from: Point
  to: Point
  branches?: number
  core?: Paint
  glow?: Paint
}): Dot[] => {
  const path = boltPath(seed, from, to)
  const next = rng(seed + 101)
  const forks = Array.from({ length: branches }, () => {
    // A fork leaves somewhere in the upper four fifths and heads one way, mostly down.
    const start = path[Math.floor((0.2 + next() * 0.6) * path.length)] ?? from
    const dir = next() < 0.5 ? -1 : 1
    const length = 3 + Math.floor(next() * 3)
    const points: Point[] = []
    let [x, y] = [start.x, start.y]
    for (let i = 0; i < length; i++) {
      x += dir
      if (next() < 0.6) y += 1
      points.push({ x, y })
    }

    return points
  })
  const all = [...path, ...forks.flat()]
  const lit = new Set(all.map(point => `${point.x},${point.y}`))
  const sides =
    glow === undefined ? [] : all.flatMap(point => [-1, 1].filter(d => !lit.has(`${point.x + d},${point.y}`)).map(d => dot(point.x + d, point.y, glow)))

  return [...sides, ...all.map(point => dot(point.x, point.y, core))]
}

/**
 * Sparks thrown up from `at` that fall back under gravity and stop on `floor` (a row); `frame` counts from the burst.
 * Each spark has its own throw and its own life; they cool from white through cyan and ember to coal unless `colors` are given.
 */
export const burst = ({
  seed,
  at,
  frame,
  floor,
  count = 12,
  speed = 1.6,
  spread = 2.4,
  gravity = 0.28,
  life = 9,
  colors,
}: {
  seed: number
  at: Point
  frame: number
  floor: number
  count?: number
  speed?: number
  spread?: number
  gravity?: number
  life?: number
  colors?: readonly Paint[]
}): Dot[] => {
  const next = rng(seed)
  const sparks: Dot[] = []
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (next() - 0.5) * spread
    const pace = speed * (0.5 + next())
    const lasts = life * (0.6 + 0.6 * next())
    const pick = next()
    if (frame < 0 || frame > lasts) continue
    const age = frame / lasts
    const paint =
      colors === undefined
        ? age < 0.2
          ? 'flash'
          : age < 0.45
            ? 'spark'
            : age < 0.75
              ? 'ember'
              : 'coal'
        : (colors[Math.floor(pick * colors.length)] ?? 'spark')
    sparks.push(dot(at.x + Math.cos(angle) * pace * frame, Math.min(at.y + Math.sin(angle) * pace * frame + 0.5 * gravity * frame * frame, floor), paint))
  }

  return sparks
}

/** Smoke puffs that start at `at` one after another, rise and drift and fade from grey to dark grey, gone after `life` frames each. */
export const smoke = ({ seed, at, frame, count = 6, life = 14 }: { seed: number; at: Point; frame: number; count?: number; life?: number }): Dot[] => {
  const next = rng(seed)
  const puffs: Dot[] = []
  for (let i = 0; i < count; i++) {
    const delay = next() * 4
    const sideways = (next() - 0.5) * 4
    const drift = (next() - 0.3) * 0.25
    const age = frame - delay
    if (age < 0 || age > life) continue
    puffs.push(dot(at.x + sideways + drift * age + Math.sin(age / 2 + i), at.y - age * 0.45, age < life * 0.5 ? 'smoke' : 'smokeDim'))
  }

  return puffs
}

/**
 * A ring that runs out along the ground from `at` (its row is `at.y`) both ways at `speed` pixels a frame, white near the start, a glow trailing the front.
 * It is held to the stage's side edges and over when both ends are past them, or past `reach` when given.
 */
export const shockwave = ({ at, frame, edges, speed = 2, reach }: { at: Point; frame: number; edges: Edges; speed?: number; reach?: number }): Dot[] => {
  if (frame < 0) return []
  const far = reach ?? Math.max(at.x - edges.left, edges.right - at.x)
  const d = px(frame * speed)
  if (d > far) return []
  const ring: Dot[] = []
  for (const side of [-1, 1]) {
    const lays = (x: number, y: number, paint: Paint): void => {
      if (x >= edges.left && x <= edges.right) ring.push(dot(x, y, paint))
    }
    lays(at.x + side * d, at.y, d < far * 0.5 ? 'flash' : 'spark')
    lays(at.x + side * (d - 1), at.y, 'glow')
    if (d < far * 0.4) lays(at.x + side * d, at.y - 1, 'spark')
  }

  return ring
}

/** The default colours of an aura, from its outer flames in to its inner glow. */
const AURA = [0xe8a400, 0xffd43b, 0xfff3a0] as const

/**
 * A flickering aura `size` pixels thick around the pixels `mask` covers, with flames licking up off the top: an effect that hugs the body, so it is aimed by the mask and drawn as the plan's `aimed`.
 * It looks for the body only inside `region`, and draws only there; it never draws on the mask. Before it begins (a negative frame) it draws nothing.
 */
export const aura =
  ({ seed, frame, region, size, colors = AURA }: { seed: number; frame: number; region: Region; size: number; colors?: readonly [Paint, Paint, Paint] }) =>
  (mask: Mask): Dot[] => {
    if (frame < 0) return []
    const next = rng(seed + frame * 7)
    const dots: Dot[] = []
    for (let y = region.top; y <= region.bottom; y++) {
      for (let x = region.left; x <= region.right; x++) {
        if (mask(x, y)) continue
        let near = Number.POSITIVE_INFINITY
        for (let dy = -size; dy <= size; dy++) {
          for (let dx = -size; dx <= size; dx++) {
            if (Math.abs(dx) + Math.abs(dy) <= size && mask(x + dx, y + dy)) near = Math.min(near, Math.abs(dx) + Math.abs(dy))
          }
        }
        if (near <= size && next() < (near === 1 ? 0.9 : 0.55)) dots.push(dot(x, y, near === 1 ? colors[2] : near === 2 ? colors[1] : colors[0]))
      }
    }
    for (let x = region.left; x <= region.right; x++) {
      let top = -1
      for (let y = region.top; y <= region.bottom; y++) {
        if (mask(x, y)) {
          top = y
          break
        }
      }
      if (top < 0) continue
      const tall = Math.floor(next() * (size + 3))
      for (let i = 1; i <= size + tall; i++) {
        const lean = next() < 0.2 ? (next() < 0.5 ? -1 : 1) : 0
        const y = top - i
        const flame = x + lean
        if (next() < 0.8 && y >= region.top && flame >= region.left && flame <= region.right && !mask(flame, y))
          dots.push(dot(flame, y, i <= size ? colors[1] : colors[0]))
      }
    }

    return dots
  }

/** A short zigzag of lightning going down from `at`, four pixels, bright at its start; its shape is new each frame; before it begins (a negative frame) it draws nothing. */
export const crackle = ({ seed, at, frame }: { seed: number; at: Point; frame: number }): Dot[] => {
  if (frame < 0) return []
  const next = rng(seed + frame * 31)
  let x = at.x

  return Array.from({ length: 4 }, (_, i) => {
    const here = dot(x, at.y + i, i === 0 ? 'flash' : 'spark')
    x += next() < 0.5 ? -1 : 1

    return here
  })
}

/** Colours of the confetti, unless given. */
const CONFETTI = [0xff6b6b, 0xffd43b, 0x69db7c, 0x4dabf7, 0xda77f2, 0xffffff] as const

/**
 * Confetti falling from the stage's top edge over the width between its side edges, each piece starting at its own moment and swaying as it falls; a piece that reaches the ground lies there.
 * A piece's whole course is drawn from the seed, so a piece that has begun to fall is in every later frame.
 */
export const confetti = ({
  seed,
  frame,
  edges,
  count = 24,
  fall = 0.55,
  colors = CONFETTI,
}: {
  seed: number
  frame: number
  edges: Edges
  count?: number
  fall?: number
  colors?: readonly Paint[]
}): Dot[] => {
  const next = rng(seed)
  const width = edges.right - edges.left + 1
  const pieces: Dot[] = []
  for (let i = 0; i < count; i++) {
    const start = next() * width
    const delay = next() * 6
    const paint = colors[Math.floor(next() * colors.length)] ?? 'flash'
    const sway = next() * 6
    const pace = 0.7 + next() * 0.6
    const age = frame - delay
    if (age < 0) continue
    const x = Math.min(Math.max(px(edges.left + start + Math.sin((age + sway) / 2) * 1.2), edges.left), edges.right)
    pieces.push(dot(x, Math.min(edges.skyTop + age * fall * pace, edges.ground - 1), paint))
  }

  return pieces
}

/** The wash a flash puts on the sky layer: every pixel of the sky between the stage's side edges, lit to `level` (1 lit, 2 flashing, 0 dark: nothing). Put it on the `sky` layer and it lights that layer and no other. */
export const flash = ({ edges, level }: { edges: Edges; level: 0 | 1 | 2 }): Dot[] => {
  if (level === 0) return []
  const paint = level === 1 ? 'skyLit' : 'skyFlash'

  return Array.from({ length: edges.ground - edges.skyTop }, (_, row) =>
    Array.from({ length: edges.right - edges.left + 1 }, (_, column) => dot(edges.left + column, edges.skyTop + row, paint)),
  ).flat()
}

/** The pixels of the check mark, from its top-left corner. */
const CHECK_MARK: readonly (readonly [number, number])[] = [
  [4, 0],
  [3, 1],
  [0, 2],
  [2, 2],
  [1, 3],
]

/** A check mark five pixels wide and four tall, its top-left corner at `at`. It takes no frame: the animation owns its timing, and puts it on the `overlay` layer to keep it in front of everything. */
export const checkMark = ({ at }: { at: Point }): Dot[] => CHECK_MARK.map(([dx, dy]) => dot(at.x + dx, at.y + dy, 'check'))

/** An anchor as the frame draws it: moved down by the frame's `bob` when it lies inside `headRegion` (what the head bob moves), else where it is. For an effect that starts on the head or an ear (start it a row above the result); with no region given, `at` stays. */
export const ridingBob = (at: Point, bob: number, headRegion?: Region): Point =>
  headRegion !== undefined && at.x >= headRegion.left && at.x <= headRegion.right && at.y >= headRegion.top && at.y <= headRegion.bottom
    ? { x: at.x, y: at.y + bob }
    : at
