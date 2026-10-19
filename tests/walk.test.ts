import { expect, mock } from 'claude-code/testing'
import type { Activity, Effect, Entry, Event, Lookup, Model, Room } from '../hooks/activity'
import { createActivity, initial, transition } from '../hooks/activity'
import { backdropFrames, cellsOf, playsFor as realPlaysFor, roomFor } from '../hooks/sprite'
import { classic } from '../hooks/sprite/characters/classic'
import { foxkit } from '../hooks/sprite/characters/foxkit'
import { cameraFor, composePixels, defineAnimation, defineCharacter, placeRange, stageFor } from '../hooks/sprite/compose'
import { layersOf, setSavedLook } from '../hooks/sprite/look-in-use'
import { ANIMATIONS, CHARACTERS, requireWalk, walkOf } from '../hooks/sprite/registry'
import type { Animation, Character, Facing, Place } from '../hooks/sprite/types'
import { HOME, WALK_POSES } from '../hooks/sprite/types'
import { strikeSteps } from '../hooks/strike'
import { addSet, answered, counting, ON_TICKETS, PANE, PANE_SIZE, RECIPE, paneRender as render, test, ticket, world } from './world'

// The sidekick has a place on the stage and a facing, kept by the activity, and can walk there. The pure transition is tested with a made-up lookup and room;
// the real art and room are driven by a clock the test moves; the whole mod runs in an environment of its own, so it is only checked for staying put.

const fake = (frames: number, msPerFrame: number, where: Pick<Animation, 'startAt' | 'endAt'> = {}): Animation => ({
  needs: [],
  poses: [],
  frames,
  msPerFrame,
  once: false,
  hides: [],
  frame: () => ({}),
  ...where,
})
const WALK = fake(4, 100)
const FAKE: Record<string, Animation> = {
  resting: fake(1, 200),
  working: fake(3, 100),
  'ticket-done': fake(2, 50, { startAt: 3 }),
  'set-done': fake(2, 50, { endAt: -2 }),
}
const playsFor: Lookup = moment => FAKE[moment] ?? fake(1, 1)
const ROOM: Room = () => ({ min: -4, max: 5, walk: WALK })
const NO_WALK: Room = () => ({ min: -4, max: 5, walk: undefined })

const entry = (moment: Entry['moment'], isKept = false): Entry => ({ moment, ...(isKept ? { isKeptWhenHidden: true } : {}) })
const queue = (e: Entry): Event => ({ type: 'queue', entry: e })
const tick: Event = { type: 'tick' }
const motion = (isOn: boolean): Event => ({ type: 'motion', isOn })
const view = (isShown: boolean): Event => ({ type: 'view', isShown })

/** A model at rest, with motion on (or off). */
const resting = (isMotionOn = true): Model => ({ ...initial(playsFor), isMotionOn })

const feed = (events: readonly Event[], from: Model = resting(), room: Room = ROOM): { model: Model; effects: Effect[] } => {
  let model = from
  const effects: Effect[] = []
  for (const event of events) {
    const result = transition(
      model,
      event,
      playsFor,
      () => [],
      () => 1,
      room,
    )
    model = result.model
    effects.push(...result.effects)
  }

  return { model, effects }
}
const placeOf = (model: Model): Place => model.shown.place
const draws = (effects: readonly Effect[]): Place[] => effects.flatMap(effect => (effect.do === 'draw' ? [effect.shown.place] : []))
const kinds = (effects: readonly Effect[]): string[] => effects.map(effect => effect.do)

test('a model starts at home facing right, and an entry with no place named leaves the place as it is', async () => {
  expect(initial(playsFor).shown.place).toEqual(HOME)
  const there = feed([queue(entry('ticket-done')), tick, tick, tick]).model
  expect(placeOf(there)).toEqual({ x: 3, facing: 'right' })
  // A turn, an entry without a place and its end, and a look change keep the place and the facing.
  const after = feed([{ type: 'set', condition: 'turn', isOn: true }, queue(entry('working')), tick, { type: 'look' }], there).model
  expect(placeOf(after)).toEqual({ x: 3, facing: 'right' })
})

test('an animation that names a start place is preceded by a walk there: one pixel a tick through the walk cycle, the entry starting on arrival', async () => {
  const started = feed([queue(entry('ticket-done'))])
  expect(started.model.phase.kind).toBe('walking')
  // The walk begins where it stands; the entry has not started and the timer is the walk's.
  expect(started.effects).toEqual([
    { do: 'stop' },
    { do: 'draw', shown: { moment: 'resting', animation: WALK, frame: 0, place: HOME } },
    { do: 'every', ms: 100 },
  ])
  const steps = feed([tick, tick], started.model)
  expect(draws(steps.effects)).toEqual([
    { x: 1, facing: 'right' },
    { x: 2, facing: 'right' },
  ])
  expect(steps.effects.map(effect => effect.do === 'draw' && effect.shown.frame)).toEqual([1, 2])
  const arrived = feed([tick], steps.model)
  expect(arrived.model.phase.kind).toBe('playing')
  expect(arrived.effects).toEqual([
    { do: 'stop' },
    { do: 'start', entry: entry('ticket-done'), steps: 2 },
    { do: 'draw', shown: { moment: 'ticket-done', animation: playsFor('ticket-done'), frame: 0, place: { x: 3, facing: 'right' } } },
    { do: 'every', ms: 50 },
  ])
})

test('walking turns the sidekick to face the way it goes, and it keeps that facing after', async () => {
  const west = feed([queue(entry('set-done')), tick, tick])
  // The set-done animation ends at -2: after it, a walk left.
  expect(west.model.phase.kind).toBe('walking')
  expect(placeOf(west.model)).toEqual({ x: 0, facing: 'left' })
  const there = feed([tick, tick], west.model).model
  expect(placeOf(there)).toEqual({ x: -2, facing: 'left' })
  expect(there.phase.kind).toBe('resting')
  expect(there.shown.moment).toBe('resting')
  // A later entry that starts to the right turns it the other way.
  const back = feed([queue(entry('ticket-done'))], there)
  expect(placeOf(back.model)).toEqual({ x: -2, facing: 'right' })
})

test('an animation that names an end place is followed by a walk there, after its end hook, and then the rest comes back', async () => {
  const e: Entry = { moment: 'set-done' }
  const played = feed([queue(e), tick, tick])
  expect(played.effects.filter(effect => effect.do === 'end')).toEqual([{ do: 'end', entry: e }])
  expect(played.model.phase.kind).toBe('walking')
  expect(played.effects.at(-1)).toEqual({ do: 'every', ms: 100 })
  const done = feed([tick, tick], played.model)
  expect(done.model.phase).toEqual({ kind: 'resting' })
  expect(kinds(done.effects)).toEqual(['draw', 'stop', 'draw'])
  expect(draws(done.effects).at(-1)).toEqual({ x: -2, facing: 'left' })
})

test('targets are held within the room, and a sidekick that is already there does not walk', async () => {
  const narrow: Room = () => ({ min: -1, max: 2, walk: WALK })
  expect(placeOf(feed([queue(entry('ticket-done')), tick, tick], resting(), narrow).model).x).toBe(2)
  // Back at the strike point the next entry starts at once.
  const there = feed([queue(entry('ticket-done')), tick, tick, tick]).model
  expect(there.phase.kind).toBe('playing')
  const again = feed([tick, tick, queue(entry('ticket-done'))], there)
  expect(again.model.phase.kind).toBe('playing')
  expect(again.model.waiting).toEqual([])
})

test('with motion off the sidekick does not walk: it appears at the start place, and at the end place afterwards', async () => {
  const started = feed([queue(entry('ticket-done'))], resting(false))
  expect(started.model.phase.kind).toBe('playing')
  expect(started.effects).toEqual([
    { do: 'stop' },
    { do: 'start', entry: entry('ticket-done'), steps: 2 },
    { do: 'draw', shown: { moment: 'ticket-done', animation: playsFor('ticket-done'), frame: 0, place: { x: 3, facing: 'right' } } },
    { do: 'every', ms: 50 },
  ])
  const ended = feed([queue(entry('set-done')), tick, tick], resting(false))
  expect(ended.model.phase.kind).toBe('resting')
  expect(placeOf(ended.model)).toEqual({ x: -2, facing: 'left' })
  expect(ended.effects.some(effect => effect.do === 'every' && effect.ms === WALK.msPerFrame)).toBe(false)
})

test('a character with no walk cycle appears at its place instead of walking', async () => {
  const started = feed([queue(entry('ticket-done'))], resting(), NO_WALK)
  expect(started.model.phase.kind).toBe('playing')
  expect(placeOf(started.model)).toEqual({ x: 3, facing: 'right' })
})

test('turning motion off during a walk ends it where it was going, and what waited for it starts', async () => {
  const walking = feed([queue(entry('ticket-done')), tick]).model
  const result = feed([motion(false)], walking)
  expect(result.model.phase.kind).toBe('playing')
  expect(placeOf(result.model)).toEqual({ x: 3, facing: 'right' })
  expect(kinds(result.effects)).toEqual(['stop', 'start', 'draw', 'every'])
})

test('entries that arrive during a walk wait behind the one it is for, and a condition only records', async () => {
  const walking = feed([queue(entry('ticket-done'))]).model
  const queued = feed([queue(entry('working'))], walking)
  expect(queued.effects).toEqual([])
  expect(queued.model.waiting).toEqual([entry('working')])
  expect(queued.model.phase).toBe(walking.phase)
  const set = feed([{ type: 'set', condition: 'turn', isOn: true }], walking)
  expect(set.effects).toEqual([])
  expect(set.model.conditions.turn).toBe(true)
})

test('while the pane is hidden nothing walks: the timer stops, the sidekick stands where it was going, a kept entry waits and starts there when the pane is shown', async () => {
  const walking = feed([queue(entry('ticket-done', true)), tick]).model
  const gone = feed([view(false)], walking)
  expect(gone.effects).toEqual([{ do: 'stop' }])
  expect(gone.model.phase.kind).toBe('away')
  expect(placeOf(gone.model)).toEqual({ x: 3, facing: 'right' })
  expect(gone.model.waiting).toEqual([entry('ticket-done', true)])
  // A tick that was on its way is ignored.
  expect(feed([tick], gone.model).effects).toEqual([])
  const back = feed([view(true)], gone.model)
  expect(back.model.phase.kind).toBe('playing')
  expect(kinds(back.effects)).toEqual(['stop', 'start', 'draw', 'every'])
  // An entry that is not kept is dropped with the walk.
  const dropped = feed([view(false)], feed([queue(entry('ticket-done')), tick]).model).model
  expect(dropped.waiting).toEqual([])
})

test('hiding the pane while an entry with an end place plays leaves the sidekick at the end place', async () => {
  const gone = feed([queue(entry('set-done')), view(false)])
  expect(placeOf(gone.model)).toEqual({ x: -2, facing: 'left' })
  expect(gone.effects.filter(effect => effect.do === 'end')).toHaveLength(1)
})

test("a walk with the activity runs one timer at a time, the walk's, and none while hidden or once motion is off", async () => {
  type Timer = ReturnType<Parameters<typeof createActivity>[0]['every']>
  const slots: { isOn: boolean; fn: () => void }[] = []
  const every = (_ms: number, fn: () => void): Timer => {
    const slot = { isOn: true, fn }
    slots.push(slot)

    return {
      cancel: () => {
        slot.isOn = false
      },
    } as Timer
  }
  const running = (): number => slots.filter(slot => slot.isOn).length
  const seen: Place[] = []
  const activity = createActivity(
    { every, after: every },
    shown => void seen.push(shown.place),
    playsFor,
    () => [],
    undefined,
    () => 1,
    ROOM,
  )
  activity.setMotion(true)
  activity.queue(entry('ticket-done', true))
  expect(running(), 'the walk').toBe(1)
  slots
    .filter(slot => slot.isOn)
    .at(-1)
    ?.fn()
  expect(running()).toBe(1)
  expect(seen.at(-1)).toEqual({ x: 1, facing: 'right' })
  activity.setShown(false)
  expect(running(), 'hidden').toBe(0)
  activity.setShown(true)
  expect(running(), 'the kept entry, at the strike point').toBe(1)
  expect(seen.at(-1)).toEqual({ x: 3, facing: 'right' })
  expect(activity.shown().place).toEqual({ x: 3, facing: 'right' })
  // Another walk, ended by turning motion off: the entry takes the timer over.
  const home = createActivity(
    { every, after: every },
    () => undefined,
    playsFor,
    () => [],
    undefined,
    () => 1,
    ROOM,
  )
  activity.setShown(false)
  home.setMotion(true)
  home.queue(entry('ticket-done'))
  const before = running()
  home.setMotion(false)
  expect(running(), 'the entry replaced the walk').toBe(before)
})

// The stage keeps the sidekick on the world, and the camera keeps it in view.

/** A plain character `width` pixels wide with no anchors but the required two. */
const wide = (width: number): Character =>
  defineCharacter({
    name: `wide${width}`,
    body: Array.from({ length: 12 }, () => 'o'.repeat(width)),
    legend: { o: 'outline' },
    palette: { outline: 0x223344, base: 0x88aacc },
    anchors: { head: { x: 0, y: 0 }, feet: { x: width - 1, y: 11 } },
    headRegion: { left: 0, top: 0, right: width - 1, bottom: 2 },
    bobs: { head: false },
  })

test('the camera keeps the walking sidekick whole in view at every pane width, at every place the stage allows', async () => {
  for (const character of [foxkit, classic, wide(12), wide(50)]) {
    const stage = stageFor(character)
    const { min, max } = placeRange(stage)
    expect(min, character.name).toBeLessThanOrEqual(0)
    expect(max, character.name).toBeGreaterThanOrEqual(0)
    for (let columns = 1; columns <= stage.columns + 4; columns++) {
      for (let x = min; x <= max; x++) {
        const camera = cameraFor(stage, { columns, rows: stage.rows }, x)
        const label = `${character.name} ${columns} columns at ${x}`
        expect(camera.left, label).toBeGreaterThanOrEqual(0)
        expect(camera.left + camera.columns, label).toBeLessThanOrEqual(stage.columns)
        expect(stage.frame.left + x, label).toBeGreaterThanOrEqual(camera.left)
        expect(stage.frame.right + x, label).toBeLessThanOrEqual(camera.left + camera.columns - 1)
      }
    }
  }
})

test('the camera is where it was with no place given, and follows the sidekick one column for each pixel it walks', async () => {
  const stage = stageFor(foxkit)
  const still = cameraFor(stage, { columns: 20, rows: 8 })
  expect(cameraFor(stage, { columns: 20, rows: 8 }, 0)).toEqual(still)
  expect(cameraFor(stage, { columns: 20, rows: 8 }, 4).left).toBe(still.left + 4)
  expect(cameraFor(stage, { columns: 20, rows: 8 }, -4).left).toBe(still.left - 4)
})

// What is drawn at a place.

const layers = (character: string) => layersOf({ character, outfit: { head: 'cap' }, background: null })
const IDLE = ANIMATIONS.idle

test('a sidekick at a place is the sidekick at home moved that many pixels, accessories included; the stage keeps it on the world', async () => {
  for (const name of Object.keys(CHARACTERS)) {
    const look = layers(name)
    const home = composePixels(look, IDLE, 0)
    const moved = composePixels(look, IDLE, 0, 0, undefined, { x: 3, facing: 'right' })
    for (const [y, row] of home.entries()) {
      for (const [x, color] of row.entries()) expect(moved[y]?.[x + 3], `${name} ${x},${y}`).toBe(color)
    }
    // Far past the edge it is held at the edge.
    const { max, min } = placeRange(stageFor(look.character))
    expect(composePixels(look, IDLE, 0, 0, undefined, { x: 999, facing: 'right' })).toEqual(
      composePixels(look, IDLE, 0, 0, undefined, { x: max, facing: 'right' }),
    )
    expect(composePixels(look, IDLE, 0, 0, undefined, { x: -999, facing: 'right' })).toEqual(
      composePixels(look, IDLE, 0, 0, undefined, { x: min, facing: 'right' }),
    )
  }
})

test('facing left turns the sidekick about the middle of its frame, as a mirrored frame does, accessories with it', async () => {
  const mirrored = defineAnimation({ needs: [], poses: [], frames: 1, msPerFrame: 100, once: false, hides: [], frame: () => ({ mirror: true }) })
  for (const name of Object.keys(CHARACTERS)) {
    const look = layers(name)
    expect(composePixels(look, IDLE, 0, 0, undefined, { x: 0, facing: 'left' }), name).toEqual(composePixels(look, mirrored, 0))
    // Facing left and mirrored both is facing right.
    expect(composePixels(look, mirrored, 0, 0, undefined, { x: 0, facing: 'left' }), name).toEqual(composePixels(look, IDLE, 0))
  }
})

test('the animation is given its anchors where the sidekick stands and turned to the way it faces, and the way it faces', async () => {
  const look = layers('foxkit')
  const stage = stageFor(look.character)
  const seen: { feet: number; ear: number | undefined; facing: Facing | undefined }[] = []
  const probe = defineAnimation({
    needs: ['ears'],
    poses: [],
    frames: 1,
    msPerFrame: 100,
    once: false,
    hides: [],
    frame: (_, { feet, ears }, __, facing) => {
      seen.push({ feet: feet.x, ear: ears[0].x, facing })

      return {}
    },
  })
  composePixels(look, probe, 0)
  composePixels(look, probe, 0, 0, undefined, { x: 2, facing: 'right' })
  composePixels(look, probe, 0, 0, undefined, { x: 2, facing: 'left' })
  const feet = foxkit.anchors.feet.x + stage.offset.x
  const ear = (foxkit.anchors.ears?.[0]?.x ?? 0) + stage.offset.x
  const centre = stage.frame.left + stage.frame.right
  expect(seen).toEqual([
    { feet, ear, facing: 'right' },
    { feet: feet + 2, ear: ear + 2, facing: 'right' },
    { feet: centre - feet + 2, ear: centre - ear + 2, facing: 'left' },
  ])
})

// The walk cycle.

test('a character walks when it declares all three leg poses, and is refused at load when it declares only some', async () => {
  for (const character of Object.values(CHARACTERS)) {
    expect(walkOf(character), character.name).toBe(ANIMATIONS.walk)
    expect(() => requireWalk(character), character.name).not.toThrow()
    for (const pose of WALK_POSES) expect(character.poses?.[pose], `${character.name} ${pose}`).toBeDefined()
  }
  const { walkB: _, ...partial } = foxkit.poses ?? {}
  const half = { ...foxkit, name: 'half', poses: partial }
  expect(() => requireWalk(half)).toThrow(/half.*walkA, walkPass.*walkB/)
  expect(walkOf(half)).toBeUndefined()
  const { walkA: _a, walkB: _b, walkPass: _p, ...bare } = foxkit.poses ?? {}
  expect(walkOf({ ...foxkit, poses: bare })).toBeUndefined()
  expect(() => requireWalk({ ...foxkit, poses: bare })).not.toThrow()
  // A leg pose that is not on the body is refused with the other poses.
  expect(() => defineCharacter({ ...foxkit, name: 'off', poses: { walkA: { at: { x: 0, y: 99 }, rows: ['o'] } } })).toThrow(/pose "walkA" off the body/)
})

test('the walk cycle steps a foot, the legs passing, the other foot, the legs passing; the body rises a pixel on a passing step; dust is kicked up behind the feet from the ground layer', async () => {
  const at = { head: { x: 8, y: 1 }, feet: { x: 8, y: 20 } }
  const edges = { skyTop: 0, ground: 21, left: 0, right: 40 }
  const plans = [0, 1, 2, 3].map(step => ANIMATIONS.walk.frame(step, at, edges, 'right'))
  expect(plans.map(plan => plan.poses)).toEqual([['walkA'], ['walkPass'], ['walkB'], ['walkPass']])
  expect(plans.map(plan => plan.dy)).toEqual([0, -1, 0, -1])
  expect(plans.map(plan => plan.layers?.ground?.length ?? 0)).toEqual([2, 0, 2, 0])
  const behind = (facing: Facing): number => (ANIMATIONS.walk.frame(0, at, edges, facing).layers?.ground?.[0]?.[0] ?? 0) - at.feet.x
  expect(behind('right'), 'it kicks dust back, away from where it is going').toBeLessThan(0)
  expect(behind('left')).toBeGreaterThan(0)
  expect(ANIMATIONS.walk.frame(0, at, edges).layers?.ground?.[0]?.[0], 'facing right when left out').toBe(at.feet.x + behind('right'))
})

test('on the shipped characters the walk draws three different pictures, the two passing steps alike', async () => {
  for (const name of Object.keys(CHARACTERS)) {
    const look = layers(name)
    const frames = [0, 1, 2].map(step => render(look, ANIMATIONS.walk, step))
    expect(new Set(frames).size, name).toBe(3)
    expect(render(look, ANIMATIONS.walk, 1), name).toBe(render(look, ANIMATIONS.walk, 3))
  }
})

// The sidekick with the real art, the real room and the real drawing, on a clock the test moves. The mod itself runs in an environment of its own
// and no shipped animation names a place yet, so the zap is sent to a strike point here, for the length of the test, in an activity the test builds.

const POINT = 6
const WALK_STEP = ANIMATIONS.walk.msPerFrame
const ZAP_STEP = ANIMATIONS.zap.msPerFrame
const DUSK = layersOf({ character: 'foxkit', outfit: {}, background: 'dusk' })
const picture = (animation: Animation, step: number, place: Place): string => render(DUSK, animation, step, undefined, place)
const restAt = (place: Place): string => picture(ANIMATIONS.idle, 0, place)
const home: Place = { x: 0, facing: 'left' }

type Timer = ReturnType<Parameters<typeof createActivity>[0]['every']>

/** A clock the test moves on: timers fire in order of their time, and a repeating one comes round again. */
const clockOf = () => {
  type Slot = { at: number; ms: number; isRepeating: boolean; fn: () => void; isOn: boolean }
  const slots: Slot[] = []
  let now = 0
  const add = (ms: number, fn: () => void, isRepeating: boolean): Timer => {
    const slot: Slot = { at: now + ms, ms, isRepeating, fn, isOn: true }
    slots.push(slot)

    return {
      cancel: () => {
        slot.isOn = false
      },
    } as Timer
  }

  return {
    every: (ms: number, fn: () => void) => add(ms, fn, true),
    after: (ms: number, fn: () => void) => add(ms, fn, false),
    running: (): number => slots.filter(slot => slot.isOn).length,
    advance: (ms: number): void => {
      const until = now + ms
      for (;;) {
        const due = slots.filter(slot => slot.isOn && slot.at <= until).sort((a, b) => a.at - b.at)[0]
        if (due === undefined) break
        now = due.at
        if (due.isRepeating) due.at += due.ms
        else due.isOn = false
        due.fn()
      }
      now = until
    },
  }
}

type Play = { activity: Activity; clock: ReturnType<typeof clockOf>; painted: string[] }

/**
 * Runs `body` with an activity that paints through the pane's own drawing at the size the whole-mod tests use, on a background that shows the camera move,
 * and with the zap given a strike point to start from and home to end at.
 */
const withStrikePoint = (isMotionOn: boolean, body: (play: Play) => void): void => {
  const zap = ANIMATIONS.zap as { startAt?: number; endAt?: number }
  zap.startAt = POINT
  zap.endAt = 0
  setSavedLook({ background: 'dusk' })
  try {
    const clock = clockOf()
    const painted: string[] = []
    const activity = createActivity(
      clock,
      ({ animation, frame, place }, background) => void painted.push(cellsOf(animation, frame, background, PANE_SIZE, place)),
      realPlaysFor,
      () => [],
      undefined,
      backdropFrames,
      roomFor,
    )
    activity.setMotion(isMotionOn)
    body({ activity, clock, painted })
  } finally {
    delete zap.startAt
    delete zap.endAt
    setSavedLook({})
  }
}

test('a finished ticket sends the sidekick to the strike point first: it walks a pixel a step with the camera after it, the zap begins on arrival, and it walks home afterwards', async () => {
  withStrikePoint(true, ({ activity, clock, painted }) => {
    activity.queue({ moment: 'ticket-done' })
    const stride = (x: number): string => picture(ANIMATIONS.walk, x % ANIMATIONS.walk.frames, { x, facing: 'right' })
    expect(painted, 'it starts walking at once, the zap not yet begun').toEqual([stride(0)])
    expect(clock.running(), 'one timer, the walk').toBe(1)
    for (let x = 1; x < POINT; x++) {
      clock.advance(WALK_STEP)
      expect(painted.at(-1), `a pixel on, step ${x}`).toBe(stride(x))
    }
    // The camera follows: each step shows the world from another column.
    expect(new Set(painted).size, 'every step is its own picture').toBe(POINT)
    const there: Place = { x: POINT, facing: 'right' }
    clock.advance(WALK_STEP)
    expect(painted.at(-1), 'the zap begins where it arrives').toBe(picture(ANIMATIONS.zap, 0, there))
    for (let step = 1; step < ANIMATIONS.zap.frames; step++) {
      clock.advance(ZAP_STEP)
      expect(painted.at(-1), `zap ${step}`).toBe(picture(ANIMATIONS.zap, step, there))
    }
    // When the zap is over it turns to face home and walks back.
    const back = (x: number): string => picture(ANIMATIONS.walk, (POINT - x) % ANIMATIONS.walk.frames, { x, facing: 'left' })
    clock.advance(ZAP_STEP)
    expect(painted.at(-1), 'it turns on the spot').toBe(back(POINT))
    expect(clock.running(), 'one timer, the walk home').toBe(1)
    for (let x = POINT - 1; x > 0; x--) {
      clock.advance(WALK_STEP)
      expect(painted.at(-1), `a pixel nearer home, at ${x}`).toBe(back(x))
    }
    clock.advance(WALK_STEP)
    expect(painted.at(-1), 'it stands home, still facing the way it walked').toBe(restAt(home))
    expect(clock.running(), 'nothing runs once it is home').toBe(0)
    const count = painted.length
    clock.advance(10_000)
    expect(painted.length, 'it stands still').toBe(count)
    expect(activity.shown().place).toEqual(home)
  })
})

test('with motion off a finished ticket makes the sidekick appear at the strike point and at home after, with no walking in between', async () => {
  withStrikePoint(false, ({ activity, clock, painted }) => {
    activity.queue({ moment: 'ticket-done' })
    expect(painted, 'the zap at the strike point at once').toEqual([picture(ANIMATIONS.zap, 0, { x: POINT, facing: 'right' })])
    clock.advance((ANIMATIONS.zap.frames + 1) * ZAP_STEP)
    expect(painted.at(-1)).toBe(restAt(home))
    const places: Place[] = [home, { x: POINT, facing: 'right' }]
    const walks = new Set([0, 1, 2, 3].flatMap(step => places.map(place => picture(ANIMATIONS.walk, step, place))))
    expect(painted.some(cells => walks.has(cells))).toBe(false)
    expect(clock.running()).toBe(0)
    expect(activity.shown().place).toEqual(home)
  })
})

test('a pane that goes behind another during the walk stops it; shown again, the kept zap plays at the strike point without walking', async () => {
  withStrikePoint(true, ({ activity, clock, painted }) => {
    activity.queue({ moment: 'ticket-done', isKeptWhenHidden: true })
    clock.advance(2 * WALK_STEP)
    activity.setShown(false)
    const frozen = painted.length
    expect(clock.running(), 'no timer while hidden').toBe(0)
    clock.advance(10 * WALK_STEP)
    expect(painted.length, 'nothing is drawn while hidden').toBe(frozen)
    activity.setShown(true)
    expect(painted.at(-1), 'the zap begins at the strike point').toBe(picture(ANIMATIONS.zap, 0, { x: POINT, facing: 'right' }))
    expect(clock.running(), "one timer, the zap's").toBe(1)
  })
})

test('turning motion off during the walk puts the sidekick at the strike point, and no timer is left over', async () => {
  withStrikePoint(true, ({ activity, clock }) => {
    activity.queue({ moment: 'ticket-done' })
    clock.advance(2 * WALK_STEP)
    activity.setMotion(false)
    expect(activity.shown().place).toEqual({ x: POINT, facing: 'right' })
    expect(clock.running(), "one timer, the zap's").toBe(1)
    clock.advance(ZAP_STEP * (ANIMATIONS.zap.frames + 1))
    expect(activity.shown().place).toEqual(home)
    expect(clock.running()).toBe(0)
  })
})

// The whole mod: the shipped animations name no place, so with motion on nothing walks and the sidekick stays where it is.

const ROOT = '/work/shop'
const ISSUES = `${ROOT}/.scratch/checkout/issues`
const TICKETS = {
  '01-cart.md': ticket('01: Cart', 'done'),
  '02-pay.md': ticket('02: Payment', 'in-progress'),
  '03-ship.md': ticket('03: Shipping', 'ready-for-agent'),
}
const STRIKE_MS = strikeSteps(ANIMATIONS.zap) * ZAP_STEP
const BARE = layersOf({ character: 'foxkit', outfit: {}, background: null })

test('with motion on and no shipped animation naming a place, a finished ticket plays the zap where the sidekick stands, and no walking frame is painted', async ($, on) => {
  const timers = counting(on)
  const clock = mock.clock(timers.on)
  mock.store(on, ON_TICKETS)
  const w = world(on, ROOT)
  addSet(w, ROOT, 'checkout', TICKETS, 5)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: { ok: true } }))
  w.answer = prompt => (prompt.startsWith('Tickets:') ? answered('{"items":[]}') : answered(RECIPE))
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await clock.settle()
  await $.ui.mount({ ...PANE, surface: 'terminal' })
  await clock.settle()
  w.painted.length = 0
  addSet(w, ROOT, 'checkout', { ...TICKETS, '02-pay.md': ticket('02: Payment', 'done') }, 9)
  await $.tool.call({ tool: 'Read', file_path: `${ISSUES}/02-pay.md` })
  await clock.settle()
  await clock.advance(STRIKE_MS)
  const zap = Array.from({ length: ANIMATIONS.zap.frames }, (_, step) => render(BARE, ANIMATIONS.zap, step))
  const walking = new Set(Array.from({ length: ANIMATIONS.walk.frames }, (_, step) => render(BARE, ANIMATIONS.walk, step)))
  expect(w.painted.slice(0, ANIMATIONS.zap.frames)).toEqual(zap)
  expect(w.painted.some(cells => walking.has(cells))).toBe(false)
  expect(w.painted.at(-1)).toBe(render(BARE, ANIMATIONS.idle, 0))
  expect(timers.running() - timers.gaps(), 'no timer runs after the strike but the wait for the next ambient animation').toBe(0)
})
