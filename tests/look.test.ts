import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { setProjectLook, setSavedLook } from '../hooks/sprite/registry'
import { defineCharacter } from '../hooks/sprite/compose'
import { foxkit } from '../hooks/sprite/characters/foxkit'
import type { Accessory, Character } from '../hooks/sprite/types'
import { render } from '../hooks/sprite/compose'
import { ACCESSORIES, ANIMATIONS, CHARACTERS, currentLook, drawable, droppedOf, layersOf, projectLook, savedLook, setCurrentRoot } from '../hooks/sprite/registry'
import { changeLook, lookReport } from '../hooks/look'
import { leftOut } from '../hooks/sprite'
import { STRIKE_STEPS } from '../hooks/strike'
import { GOLDEN } from './sprite-golden'
import { PANE, RECIPE, RUN, addSet, answered, ticket, world } from './world'

// The pane draws the look resolved at each refresh, and the test world keeps what was painted.
const ROOT = '/work/shop'
// A session start with no tickets to find ends in the shrug; these tests are about the look, so they wait it out.
const SETTLED = ANIMATIONS.shrug.frames * ANIMATIONS.shrug.msPerFrame

test('with nothing saved the pane paints the bare foxkit: writing in a turn, idle after it, zapping on a done ticket', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const w = world(on, ROOT)
  addSet(w, ROOT, 'checkout', { '01-cart.md': ticket('01: Cart', 'in-progress') }, 5)
  w.answer = () => answered(RECIPE)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: { ok: true } }))
  await $.command.run({ command: 'sidekick-rescan', args: '', ...RUN })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  // What the renderer draws for the resolved look and an animation frame is what the world saw painted.
  const bare = layersOf(currentLook())
  // The rescan above made the sidekick look and then stand still; what follows is the turn's own.
  expect(w.painted.at(-1)).toBe(GOLDEN.idle[0])
  w.painted.length = 0

  await $.turn.start({ text: 'Build it.', turnId: 't1' })
  expect(w.painted.at(-1)).toBe(render(bare, ANIMATIONS.write, 0))
  await clock.advance(ANIMATIONS.write.msPerFrame)
  expect(w.painted.at(-1)).toBe(render(bare, ANIMATIONS.write, 1))
  expect(w.painted.at(-1)).toBe(GOLDEN.write[1])

  await $.turn.complete({ answer: 'Done.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(w.painted.at(-1)).toBe(render(bare, ANIMATIONS.idle, 0))
  expect(w.painted.at(-1)).toBe(GOLDEN.idle[0])

  addSet(w, ROOT, 'checkout', { '01-cart.md': ticket('01: Cart', 'done') }, 9)
  await $.tool.call({ tool: 'Read', file_path: `${ROOT}/.scratch/checkout/issues/01-cart.md` })
  await clock.settle()
  expect(w.painted.at(-1)).toBe(GOLDEN.zap[0])
  await clock.advance(ANIMATIONS.zap.msPerFrame * 3)
  expect(w.painted.at(-1)).toBe(GOLDEN.zap[3])
  await ui.unmount()
})

const LOOK = { command: 'sidekick-look', ...RUN }

/** A session with the pane mounted and nothing painted yet. */
const started = async ($: Engine, on: On) => {
  const clock = mock.clock(on)
  mock.store(on)
  const w = world(on, ROOT)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await clock.advance(SETTLED)
  w.painted.length = 0

  return { clock, w }
}

const dressed = (character: string, outfit: Record<string, string> = {}, background: string | null = null) =>
  layersOf({ character, outfit, background })

test('a part set with the command shows on the very next paint, and several can be set at once', async ($, on) => {
  const { w } = await started($, on)
  const ran = await $.command.run({ ...LOOK, args: 'character=classic' })
  expect(ran.text).toBe('Look set: character=classic.')
  expect(w.painted.at(-1)).toBe(render(dressed('classic'), ANIMATIONS.idle, 0))

  await $.command.run({ ...LOOK, args: 'head=cap' })
  expect(w.painted.at(-1)).toBe(render(dressed('classic', { head: 'cap' }), ANIMATIONS.idle, 0))

  await $.command.run({ ...LOOK, args: 'background=dusk' })
  expect(w.painted.at(-1)).toBe(render(dressed('classic', { head: 'cap' }, 'dusk'), ANIMATIONS.idle, 0))

  const all = await $.command.run({ ...LOOK, args: 'character=foxkit  head=cap background=dusk' })
  expect(all.text).toBe('Look set: character=foxkit head=cap background=dusk.')
  expect(w.painted.at(-1)).toBe(render(dressed('foxkit', { head: 'cap' }, 'dusk'), ANIMATIONS.idle, 0))
})

test('a look changed mid-turn shows in the next animation frame, with no reload', async ($, on) => {
  const { clock, w } = await started($, on)
  await $.turn.start({ text: 'Build it.', turnId: 't1' })
  expect(w.painted.at(-1)).toBe(GOLDEN.write[0])

  await $.command.run({ ...LOOK, args: 'character=classic head=cap' })
  await clock.advance(ANIMATIONS.write.msPerFrame)
  expect(w.painted.at(-1)).toBe(render(dressed('classic', { head: 'cap' }), ANIMATIONS.write, 1))
  expect(w.painted.at(-1)).not.toBe(GOLDEN.write[1])
})

test('the look survives a fresh session start', async ($, on) => {
  const { w } = await started($, on)
  await $.command.run({ ...LOOK, args: 'character=classic head=cap background=dusk' })

  // A new session holds nothing in memory; the look comes back from the store.
  setSavedLook({})
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  const reply = await $.command.run({ ...LOOK, args: '' })
  expect(reply.text).toContain('  character: classic\n  head: cap\n  face: -\n  neck: -\n  held: -\n  background: dusk')
  w.painted.length = 0
  await $.turn.start({ text: 'Build it.', turnId: 't1' })
  expect(w.painted.at(-1)).toBe(render(dressed('classic', { head: 'cap' }, 'dusk'), ANIMATIONS.write, 0))
})

test('a developer who never chose a look sees the bare foxkit and the listing of what exists', async ($, on) => {
  const { w } = await started($, on)
  setSavedLook({})
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  const reply = await $.command.run({ ...LOOK, args: '' })
  expect(reply.text).toBe(
    [
      'Current look:',
      '  character: foxkit',
      '  head: -',
      '  face: -',
      '  neck: -',
      '  held: -',
      '  background: -',
      '',
      'Characters: foxkit, classic',
      'Accessories:',
      '  head: cap',
      '  face: glasses',
      '  neck: scarf',
      '  held: flag',
      'Backgrounds: dusk',
      'Set parts with /sidekick-look part=name, e.g. character=classic head=cap background=dusk',
    ].join('\n'),
  )
  expect(w.painted).toHaveLength(0)
})

test('the no-argument reply shows what was chosen', async ($, on) => {
  await started($, on)
  await $.command.run({ ...LOOK, args: 'character=classic head=cap' })
  const reply = await $.command.run({ ...LOOK, args: '   ' })
  expect(reply.text).toContain('  character: classic\n  head: cap\n  face: -')
})

const REFUSALS: [string, string, string][] = [
  ['an unknown part', 'hat=cap', 'Unknown part "hat"; the parts are: character, head, face, neck, held, background'],
  ['an unknown character', 'character=snake', 'No character named "snake"; known: foxkit, classic'],
  ['an unknown accessory', 'head=crown', 'No accessory named "crown" for head; known: cap'],
  ['an unknown background', 'background=night', 'No background named "night"; known: dusk'],
  ['an accessory in the wrong slot', 'neck=cap', '"cap" is a head accessory and does not go in the neck slot'],
  ['a word without a name', 'head', 'No accessory named "" for head; known: cap'],
]

for (const [what, args, refusal] of REFUSALS) test(`${what} is refused with the valid choices, and the valid pairs beside it are not saved`, async ($, on) => {
  const { w } = await started($, on)
  await $.command.run({ ...LOOK, args: 'background=dusk' })
  w.painted.length = 0

  const ran = await $.command.run({ ...LOOK, args: `character=classic ${args} head=cap` })
  expect(ran.text).toBe(`${refusal}\nNothing was changed.`)
  expect(w.painted).toHaveLength(0)

  // Still what it was, in memory and in the store.
  const shown = await $.command.run({ ...LOOK, args: '' })
  expect(shown.text).toContain('  character: foxkit\n  head: -')
  expect(shown.text).toContain('  background: dusk')
  setSavedLook({})
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  const reloaded = await $.command.run({ ...LOOK, args: '' })
  expect(reloaded.text).toContain('  character: foxkit\n  head: -')
  expect(reloaded.text).toContain('  background: dusk')
})

test('the look command is registered at session start beside the existing commands', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  const w = world(on, ROOT)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  expect(w.registered).toEqual(['sidekick', 'sidekick-rescan', 'sidekick-pick', 'sidekick-look'])
})

/** A store the test can reach into: `data` is what the mod saved, the flags make a read or a write fail. */
const openStore = (on: On) => {
  const store = { data: new Map<string, unknown>(), failsGet: false, failsProjectGet: false, failsSet: false }
  on('store.get', (_, e) => {
    if ((store.failsGet && e.key === 'look') || (store.failsProjectGet && e.key.startsWith('look:'))) throw new Error('store down')

    return { value: store.data.get(e.key) }
  })
  on('store.set', (_, e) => {
    if (store.failsSet) throw new Error('disk full')
    store.data.set(e.key, e.value)

    return { value: undefined }
  })

  return store
}

test('a part set from another terminal is kept when this terminal sets a different part', async ($, on) => {
  const clock = mock.clock(on)
  const store = openStore(on)
  const w = world(on, ROOT)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await clock.advance(SETTLED)
  w.painted.length = 0
  // Another terminal saved a character after this session read the store.
  store.data.set('look', { character: 'classic' })
  const ran = await $.command.run({ ...LOOK, args: 'head=cap' })
  expect(ran.text).toBe('Look set: head=cap.')
  expect(w.painted.at(-1)).toBe(render(dressed('classic', { head: 'cap' }), ANIMATIONS.idle, 0))
  expect(store.data.get('look')).toEqual({ character: 'classic', outfit: { head: 'cap' } })
  const shown = await $.command.run({ ...LOOK, args: '' })
  expect(shown.text).toContain('  character: classic\n  head: cap')
})

test('a store that cannot be read at session start still opens the pane with the bare foxkit', async ($, on) => {
  const clock = mock.clock(on)
  const store = openStore(on)
  store.failsGet = true
  const w = world(on, ROOT)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  setSavedLook({ character: 'classic' })
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await clock.advance(SETTLED)
  // The pane was opened (ui.open is answered by the world) and the refresh ran after the failed read.
  await $.turn.start({ text: 'Build it.', turnId: 't1' })
  expect(w.painted.at(-1)).toBe(GOLDEN.write[0])

  const ran = await $.command.run({ ...LOOK, args: 'head=cap' })
  expect(ran.text).toBe('Could not read the saved look. Nothing was changed.')
  expect(store.data.has('look')).toBe(false)
})

test('a look that cannot be saved is reported, and the old look stays', async ($, on) => {
  const clock = mock.clock(on)
  const store = openStore(on)
  const w = world(on, ROOT)
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await clock.advance(SETTLED)
  await $.command.run({ ...LOOK, args: 'character=classic' })
  w.painted.length = 0
  store.failsSet = true

  const ran = await $.command.run({ ...LOOK, args: 'head=cap' })
  expect(ran.text).toBe('Could not save the look. Nothing was changed.')
  expect(w.painted).toHaveLength(0)
  expect((await $.command.run({ ...LOOK, args: '' })).text).toContain('  character: classic\n  head: -')
})

// A project's own parts: two projects, one global look, and an override per project.
const SHOP = '/work/shop'
const BLOG = '/work/blog'

/** Opens a session in the given project; the world's root moves there first. */
const enter = async ($: Engine, w: { root: string }, root: string) => {
  w.root = root
  setSavedLook({})
  setProjectLook({}, undefined)
  await $.session.start({ cwd: root, surface: 'terminal', isInteractive: true })
}

const lookOf = async ($: Engine, root: string, w: { root: string }) => {
  await enter($, w, root)

  return (await $.command.run({ ...LOOK, args: '' })).text
}

test('here changes the sidekick in this project and not in another, and survives a fresh session start', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const w = world(on, SHOP)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  await $.session.start({ cwd: SHOP, surface: 'terminal', isInteractive: true })
  await clock.advance(SETTLED)
  w.painted.length = 0

  const ran = await $.command.run({ ...LOOK, args: 'here character=classic' })
  expect(ran.text).toBe('Look set for this project: character=classic.')
  expect(w.painted.at(-1)).toBe(render(dressed('classic'), ANIMATIONS.idle, 0))

  expect(await lookOf($, BLOG, w)).toContain('  character: foxkit\n')
  expect(await lookOf($, SHOP, w)).toContain('  character: classic (this project)\n')
  // The fresh session starts found no tickets and shrugged; the turn waits behind the shrug.
  await clock.advance(SETTLED)
  w.painted.length = 0
  await $.turn.start({ text: 'Build it.', turnId: 't1' })
  expect(w.painted.at(-1)).toBe(render(dressed('classic'), ANIMATIONS.write, 0))
})

test('a part the project does not override follows the global look, including a change made afterwards', async ($, on) => {
  const { w } = await started($, on)
  await $.command.run({ ...LOOK, args: 'here character=classic' })
  await $.command.run({ ...LOOK, args: 'head=cap background=dusk' })
  expect(w.painted.at(-1)).toBe(render(dressed('classic', { head: 'cap' }, 'dusk'), ANIMATIONS.idle, 0))

  // A global change to the part the project overrides does not show here; one to another part does.
  await $.command.run({ ...LOOK, args: 'character=foxkit background=none' })
  expect(w.painted.at(-1)).toBe(render(dressed('classic', { head: 'cap' }), ANIMATIONS.idle, 0))
  const shown = await $.command.run({ ...LOOK, args: '' })
  expect(shown.text).toContain('  character: classic (this project)\n  head: cap\n')
  expect(shown.text).toContain('  background: -\n')
})

test('none clears a part, is refused for the character, and here head=none hides a global head in this project only', async ($, on) => {
  const { w } = await started($, on)
  await $.command.run({ ...LOOK, args: 'head=cap background=dusk' })

  const refused = await $.command.run({ ...LOOK, args: 'here character=none head=none' })
  expect(refused.text).toBe('The character cannot be none; known: foxkit, classic\nNothing was changed.')
  expect((await $.command.run({ ...LOOK, args: '' })).text).toContain('  head: cap\n')
  expect((await $.command.run({ ...LOOK, args: 'character=none' })).text).toContain('cannot be none')

  const ran = await $.command.run({ ...LOOK, args: 'here head=none' })
  expect(ran.text).toBe('Look set for this project: head=none.')
  expect(w.painted.at(-1)).toBe(render(dressed('foxkit', {}, 'dusk'), ANIMATIONS.idle, 0))
  expect((await $.command.run({ ...LOOK, args: '' })).text).toContain('  head: - (this project)\n')
  expect(await lookOf($, BLOG, w)).toContain('  head: cap\n')

  // In the global look none simply takes the part out.
  await enter($, w, SHOP)
  await $.command.run({ ...LOOK, args: 'here reset' })
  await $.command.run({ ...LOOK, args: 'background=none' })
  expect(w.painted.at(-1)).toBe(render(dressed('foxkit', { head: 'cap' }), ANIMATIONS.idle, 0))
})

test('here reset returns the project to the global look, and reset leaves project overrides alone', async ($, on) => {
  const { w } = await started($, on)
  await $.command.run({ ...LOOK, args: 'character=classic head=cap' })
  await $.command.run({ ...LOOK, args: 'here character=foxkit head=none background=dusk' })
  expect(w.painted.at(-1)).toBe(render(dressed('foxkit', {}, 'dusk'), ANIMATIONS.idle, 0))

  const gone = await $.command.run({ ...LOOK, args: 'reset' })
  expect(gone.text).toBe('The global look is back to the default.')
  expect(w.painted.at(-1)).toBe(render(dressed('foxkit', {}, 'dusk'), ANIMATIONS.idle, 0))
  await enter($, w, SHOP)
  expect(w.painted.at(-1)).toBe(render(dressed('foxkit', {}, 'dusk'), ANIMATIONS.idle, 0))
  expect(await lookOf($, BLOG, w)).toContain('  character: foxkit\n  head: -\n')

  await $.command.run({ ...LOOK, args: 'character=classic' })
  await enter($, w, SHOP)
  const back = await $.command.run({ ...LOOK, args: 'here reset' })
  expect(back.text).toBe('This project follows the global look again.')
  expect(w.painted.at(-1)).toBe(render(dressed('classic'), ANIMATIONS.idle, 0))
  expect(await lookOf($, SHOP, w)).not.toContain('this project')
})

test('the no-argument listing marks only the parts that come from the project', async ($, on) => {
  const { w } = await started($, on)
  await $.command.run({ ...LOOK, args: 'head=cap' })
  const plain = await $.command.run({ ...LOOK, args: '' })
  expect(plain.text).not.toContain('this project')

  await $.command.run({ ...LOOK, args: 'here character=classic background=dusk' })
  const shown = await $.command.run({ ...LOOK, args: '' })
  expect(shown.text).toContain(
    [
      'Current look:',
      '  character: classic (this project)',
      '  head: cap',
      '  face: -',
      '  neck: -',
      '  held: -',
      '  background: dusk (this project)',
      '  (this project) = set for this project only',
    ].join('\n'),
  )
  expect(w.registered).toContain('sidekick-look')
})

test('reset takes no parts, and here alone names nothing; both change nothing', async ($, on) => {
  await started($, on)
  await $.command.run({ ...LOOK, args: 'head=cap' })
  expect((await $.command.run({ ...LOOK, args: 'reset head=cap' })).text).toBe('reset takes no parts.\nNothing was changed.')
  expect((await $.command.run({ ...LOOK, args: 'here' })).text).toContain('Nothing was changed.')
  expect((await $.command.run({ ...LOOK, args: 'here head=crown' })).text).toBe(
    'No accessory named "crown" for head; known: cap\nNothing was changed.',
  )
  expect((await $.command.run({ ...LOOK, args: '' })).text).toContain('  head: cap\n')
})

test('an override set from another terminal is kept when this terminal overrides a different part', async ($, on) => {
  const clock = mock.clock(on)
  const store = openStore(on)
  const w = world(on, SHOP)
  await $.session.start({ cwd: SHOP, surface: 'terminal', isInteractive: true })
  await clock.advance(SETTLED)
  w.painted.length = 0
  store.data.set('look:/work/shop', { character: 'classic' })
  store.data.set('look', { background: 'dusk' })

  const ran = await $.command.run({ ...LOOK, args: 'here head=cap' })
  expect(ran.text).toBe('Look set for this project: head=cap.')
  expect(store.data.get('look:/work/shop')).toEqual({ character: 'classic', outfit: { head: 'cap' } })
  expect(store.data.get('look')).toEqual({ background: 'dusk' })
  expect(w.painted.at(-1)).toBe(render(dressed('classic', { head: 'cap' }, 'dusk'), ANIMATIONS.idle, 0))
})

test('an override that cannot be read still lets the pane open, and nothing is changed', async ($, on) => {
  const clock = mock.clock(on)
  const store = openStore(on)
  store.data.set('look', { character: 'classic' })
  store.failsProjectGet = true
  const w = world(on, SHOP)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  await $.session.start({ cwd: SHOP, surface: 'terminal', isInteractive: true })
  await clock.advance(SETTLED)
  await $.turn.start({ text: 'Build it.', turnId: 't1' })
  expect(w.painted.at(-1)).toBe(render(dressed('classic'), ANIMATIONS.write, 0))

  const ran = await $.command.run({ ...LOOK, args: 'here head=cap' })
  expect(ran.text).toBe('Could not read the saved look. Nothing was changed.')
  expect(store.data.has('look:/work/shop')).toBe(false)
  // The global look is still reachable while the override cannot be read.
  expect((await $.command.run({ ...LOOK, args: 'head=cap' })).text).toBe('Look set: head=cap.')
})

test('an override that cannot be saved is reported, and the old override stays', async ($, on) => {
  const clock = mock.clock(on)
  const store = openStore(on)
  const w = world(on, SHOP)
  await $.session.start({ cwd: SHOP, surface: 'terminal', isInteractive: true })
  await clock.advance(SETTLED)
  await $.command.run({ ...LOOK, args: 'here character=classic' })
  w.painted.length = 0
  store.failsSet = true

  const ran = await $.command.run({ ...LOOK, args: 'here head=cap' })
  expect(ran.text).toBe('Could not save the look. Nothing was changed.')
  expect((await $.command.run({ ...LOOK, args: 'here reset' })).text).toBe('Could not save the look. Nothing was changed.')
  expect(w.painted).toHaveLength(0)
  expect((await $.command.run({ ...LOOK, args: '' })).text).toContain('  character: classic (this project)\n  head: -\n')
})

test('a session that moves to another project without a new session start paints that project\'s look, not the last one\'s', async ($, on) => {
  const { w } = await started($, on)
  await $.command.run({ ...LOOK, args: 'head=cap' })
  await $.command.run({ ...LOOK, args: 'here character=classic' })
  expect(w.painted.at(-1)).toBe(render(dressed('classic', { head: 'cap' }), ANIMATIONS.idle, 0))

  w.root = BLOG
  await $.turn.start({ text: 'Build it.', turnId: 't1' })
  expect(w.painted.at(-1)).toBe(render(dressed('foxkit', { head: 'cap' }), ANIMATIONS.write, 0))

  // Back in the first project its override is read again.
  w.root = SHOP
  await $.turn.start({ text: 'Again.', turnId: 't2' })
  expect(w.painted.at(-1)).toBe(render(dressed('classic', { head: 'cap' }), ANIMATIONS.write, 0))
})

test('an override can clear the background for this project only, and stays cleared after a fresh session start', async ($, on) => {
  const { clock, w } = await started($, on)
  await $.command.run({ ...LOOK, args: 'background=dusk' })
  const ran = await $.command.run({ ...LOOK, args: 'here background=none' })
  expect(ran.text).toBe('Look set for this project: background=none.')
  expect(w.painted.at(-1)).toBe(render(dressed('foxkit'), ANIMATIONS.idle, 0))
  expect((await $.command.run({ ...LOOK, args: '' })).text).toContain('  background: - (this project)')
  expect(await lookOf($, BLOG, w)).toContain('  background: dusk\n')

  w.painted.length = 0
  expect(await lookOf($, SHOP, w)).toContain('  background: - (this project)')
  await clock.advance(SETTLED)
  w.painted.length = 0
  await $.turn.start({ text: 'Build it.', turnId: 't1' })
  expect(w.painted.at(-1)).toBe(render(dressed('foxkit'), ANIMATIONS.write, 0))
})

test('a global command after an override that cannot be read draws no stale override', async ($, on) => {
  const clock = mock.clock(on)
  const store = openStore(on)
  const w = world(on, SHOP)
  await $.session.start({ cwd: SHOP, surface: 'terminal', isInteractive: true })
  await clock.advance(SETTLED)
  await $.command.run({ ...LOOK, args: 'here character=classic' })
  store.failsProjectGet = true
  w.painted.length = 0

  const ran = await $.command.run({ ...LOOK, args: 'head=cap' })
  expect(ran.text).toBe('Look set: head=cap.')
  expect(w.painted.at(-1)).toBe(render(dressed('foxkit', { head: 'cap' }), ANIMATIONS.idle, 0))
  expect((await $.command.run({ ...LOOK, args: '' })).text).not.toContain('this project')
})

// A saved look that names something that cannot be drawn: the pane still renders, the rest is kept.
const GOOD = { character: 'classic', outfit: { head: 'cap' }, background: 'dusk' }

type Bad = { what: string; saved: Record<string, unknown>; drawn: [string, Record<string, string>, string | null]; line: string; mark: string }

const BAD: Bad[] = [
  {
    what: 'an accessory that does not exist',
    saved: { ...GOOD, outfit: { head: 'cap', neck: 'crown' } },
    drawn: ['classic', { head: 'cap' }, 'dusk'],
    line: 'Left out: no accessory named crown',
    mark: '(not drawn: no accessory named crown)',
  },
  {
    what: 'an accessory saved under a slot it does not belong to',
    saved: { ...GOOD, outfit: { head: 'cap', neck: 'cap' } },
    drawn: ['classic', { head: 'cap' }, 'dusk'],
    line: 'Left out: cap belongs in the head slot, not neck',
    mark: '(not drawn: cap belongs in the head slot, not neck)',
  },
  {
    what: 'a background that does not exist',
    saved: { ...GOOD, background: 'night' },
    drawn: ['classic', { head: 'cap' }, null],
    line: 'Left out: no background named night',
    mark: '(not drawn: no background named night)',
  },
  {
    what: 'a character that does not exist',
    saved: { ...GOOD, character: 'snake' },
    drawn: ['foxkit', { head: 'cap' }, 'dusk'],
    line: 'Left out: no character named snake, drawn as foxkit',
    mark: '(not drawn: no character named snake, drawn as foxkit)',
  },
]

/** The text of every Text in the mounted pane. */
const texts = async (ui: { findAll: (query: { type: string }) => Promise<{ text: string }[]> }) => (await ui.findAll({ type: 'Text' })).map(one => one.text)

for (const bad of BAD) for (const where of ['global', 'project'] as const) {
  test(`${bad.what} in the ${where} look is left out: session start, turn animation and idle render all draw the rest, the line is in the pane once and not duplicated across refreshes, and the listing marks it`, async ($, on) => {
    const clock = mock.clock(on)
    const store = openStore(on)
    store.data.set(where === 'global' ? 'look' : `look:${SHOP}`, bad.saved)
    const w = world(on, SHOP)
    on('turn.start', (_, e) => ({ turnId: e.turnId }))
    setSavedLook({})
    setProjectLook({}, undefined)
    await $.session.start({ cwd: SHOP, surface: 'terminal', isInteractive: true })
    await clock.advance(SETTLED)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    const [character, outfit, background] = bad.drawn

    // The idle render draws the Raster with the rest of the look.
    const idle = (await ui.findAll({ type: 'Raster' })).at(0)
    expect(idle?.props.cells).toBe(render(dressed(character, outfit, background), ANIMATIONS.idle, 0))
    expect(await texts(ui)).toContain(bad.line)

    // A turn starts and the animation plays on.
    await $.turn.start({ text: 'Build it.', turnId: 't1' })
    expect(w.painted.at(-1)).toBe(render(dressed(character, outfit, background), ANIMATIONS.write, 0))
    await clock.advance(ANIMATIONS.write.msPerFrame * 2)
    expect(w.painted.at(-1)).toBe(render(dressed(character, outfit, background), ANIMATIONS.write, 2))

    // The line is there once: later refreshes do not add it again.
    await ui.redraw()
    await clock.advance(20_000)
    await ui.redraw()
    expect((await texts(ui)).filter(text => text.startsWith('Left out:'))).toEqual([bad.line])

    // The listing marks the part and still names the saved name; nothing was rewritten.
    const listing = (await $.command.run({ ...LOOK, args: '' })).text
    expect(listing).toContain(bad.mark)
    expect(store.data.get(where === 'global' ? 'look' : `look:${SHOP}`)).toEqual(bad.saved)

    // The line clears when the look next changes (here to the foxkit), even for a part still not drawable.
    await $.command.run({ ...LOOK, args: where === 'global' ? 'character=foxkit' : 'here character=foxkit' })
    await ui.redraw()
    expect((await texts(ui)).filter(text => text.startsWith('Left out:'))).toEqual([])
    await ui.unmount()
  })
}

test('a project override holding only a bad character over a good global look draws the foxkit with the global parts', async ($, on) => {
  const clock = mock.clock(on)
  const store = openStore(on)
  store.data.set('look', GOOD)
  store.data.set(`look:${SHOP}`, { character: 'snake' })
  const w = world(on, SHOP)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  setSavedLook({})
  setProjectLook({}, undefined)
  await $.session.start({ cwd: SHOP, surface: 'terminal', isInteractive: true })
  await clock.advance(SETTLED)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect((await ui.findAll({ type: 'Raster' })).at(0)?.props.cells).toBe(render(dressed('foxkit', { head: 'cap' }, 'dusk'), ANIMATIONS.idle, 0))
  await $.turn.start({ text: 'Build it.', turnId: 't1' })
  expect(w.painted.at(-1)).toBe(render(dressed('foxkit', { head: 'cap' }, 'dusk'), ANIMATIONS.write, 0))
  expect((await texts(ui)).filter(text => text.startsWith('Left out:'))).toEqual(['Left out: no character named snake, drawn as foxkit'])
  const listing = (await $.command.run({ ...LOOK, args: '' })).text
  expect(listing).toContain('  character: snake (this project) (not drawn: no character named snake, drawn as foxkit)\n  head: cap\n')
  expect(store.data.get('look')).toEqual(GOOD)
  expect(store.data.get(`look:${SHOP}`)).toEqual({ character: 'snake' })
  await ui.unmount()
})

for (const where of ['global', 'project'] as const) {
  test(`an empty name in the ${where} look counts as not set: no line, no mark, the rest is drawn`, async ($, on) => {
    const clock = mock.clock(on)
    const store = openStore(on)
    const empty = { character: '', outfit: { head: '', neck: 'cap' }, background: '' }
    store.data.set(where === 'global' ? 'look' : `look:${SHOP}`, empty)
    const w = world(on, SHOP)
    on('turn.start', (_, e) => ({ turnId: e.turnId }))
    setSavedLook({})
    setProjectLook({}, undefined)
    await $.session.start({ cwd: SHOP, surface: 'terminal', isInteractive: true })
    await clock.advance(SETTLED)
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

    // neck: cap is a real wrong-slot part and is dropped; the empty names are not parts at all.
    expect((await texts(ui)).filter(text => text.startsWith('Left out:'))).toEqual(['Left out: cap belongs in the head slot, not neck'])
    await $.turn.start({ text: 'Build it.', turnId: 't1' })
    expect(w.painted.at(-1)).toBe(render(dressed('foxkit'), ANIMATIONS.write, 0))
    const listing = (await $.command.run({ ...LOOK, args: '' })).text
    expect(listing).toContain('  character: foxkit\n  head: -\n')
    expect(listing).toContain('  background: -\n')
    expect(((listing ?? '').match(/not drawn/g) ?? []).length).toBe(1)
    await ui.unmount()
  })
}

// Face and neck slots.

/** Puts a test-only part in the registry for the length of `run`, then takes it out; nothing ships. */
const withPart = async <T>(
  registry: Record<string, T>,
  name: string,
  part: T,
  run: () => Promise<void>,
): Promise<void> => {
  registry[name] = part
  try {
    await run()
  } finally {
    delete registry[name]
  }
}

/** A character with a head and nothing else: no face, neck or held slot. */
const { face: _face, neck: _neck, held: _held, ...HEAD_ONLY } = foxkit.anchors
const plain: Character = defineCharacter({ ...foxkit, name: 'plain', anchors: HEAD_ONLY, bobs: { head: true } })

for (const character of ['foxkit', 'classic']) {
  test(`face=glasses neck=scarf head=cap put all three on the ${character}, on its anchors, and replace nothing else`, async ($, on) => {
    const { w } = await started($, on)
    await $.command.run({ ...LOOK, args: `character=${character}` })
    const ran = await $.command.run({ ...LOOK, args: 'head=cap face=glasses neck=scarf' })
    expect(ran.text).toBe('Look set: head=cap face=glasses neck=scarf.')
    const all = { head: 'cap', face: 'glasses', neck: 'scarf' }
    expect(w.painted.at(-1)).toBe(render(dressed(character, all), ANIMATIONS.idle, 0))
    // Each piece is really on the picture: leaving one out changes it.
    for (const slot of Object.keys(all)) {
      const { [slot]: _gone, ...rest } = all as Record<string, string>
      expect(w.painted.at(-1), `${character} without ${slot}`).not.toBe(render(dressed(character, rest), ANIMATIONS.idle, 0))
    }
    // They survive a fresh session start and show in the listing.
    setSavedLook({})
    await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
    const shown = (await $.command.run({ ...LOOK, args: '' })).text
    expect(shown).toContain(`  character: ${character}\n  head: cap\n  face: glasses\n  neck: scarf\n  held: -\n`)
    expect(shown).not.toContain('not drawn')
  })
}

// The mod itself runs in the engine's own copy of the sprite registry, which a test cannot add a character to.
// So the paths that need a character without slots go through the same modules the mod calls (look.ts and the
// registry, which is what the command and the pane use), with a test-only character put in the registry for a moment.

/** Applies words to the global look the way the command does, without the store and the engine. */
const apply = (args: string, target: 'global' | 'project' = 'global') => {
  const held = target === 'global' ? savedLook() : projectLook()
  const change = changeLook(args, held, target)
  if (change.isSaved) {
    if (target === 'global') setSavedLook(change.saved)
    else setProjectLook(change.saved, SHOP)
  }

  return change
}

const clean = () => {
  setSavedLook({})
  setProjectLook({}, undefined)
  setCurrentRoot(undefined)
}

test('a new accessory in a slot replaces the one that was there, and a face accessory is refused in the neck slot', async () => {
  clean()
  try {
    const sash: Accessory = { name: 'sash', slot: 'neck', pixels: ['ss'], origin: { x: 0, y: 0 }, palette: { s: 0xff00ff } }
    await withPart(ACCESSORIES as Record<string, Accessory>, 'sash', sash, async () => {
      apply('neck=scarf face=glasses')
      expect(apply('neck=sash').text).toBe('Look set: neck=sash.')
      expect(currentLook().outfit).toEqual({ neck: 'sash', face: 'glasses' })
      expect(drawable().outfit).toEqual({ neck: sash, face: ACCESSORIES.glasses })
      expect(render(drawable(), ANIMATIONS.idle, 0)).not.toBe(render(dressed('foxkit', { neck: 'scarf', face: 'glasses' }), ANIMATIONS.idle, 0))
      expect(lookReport()).toContain('  face: glasses\n  neck: sash\n')
    })
    expect(apply('neck=glasses').text).toBe('"glasses" is a face accessory and does not go in the neck slot\nNothing was changed.')
  } finally {
    clean()
  }
})

test('an accessory for a slot the character lacks is saved with a reply saying so, is not drawn, is not on the pane, is marked in the listing, and comes back with a character that has the slot', async () => {
  clean()
  try {
    await withPart(CHARACTERS as Record<string, Character>, 'plain', plain, async () => {
      // Setting the character and the accessories in one go: the reply names the character it will be drawn on.
      const ran = apply('character=plain head=cap face=glasses neck=scarf')
      expect(ran.isSaved).toBe(true)
      expect(ran.text).toBe(
        [
          'Look set: character=plain head=cap face=glasses neck=scarf.',
          'plain has no face slot, so glasses is saved but not drawn until a character with that slot is shown.',
          'plain has no neck slot, so scarf is saved but not drawn until a character with that slot is shown.',
        ].join('\n'),
      )
      expect(savedLook()).toEqual({ character: 'plain', outfit: { head: 'cap', face: 'glasses', neck: 'scarf' } })

      // Only the cap is drawn; the pane says nothing about the slots.
      expect(drawable().outfit).toEqual({ head: ACCESSORIES.cap })
      expect(render(drawable(), ANIMATIONS.write, 0)).toBe(render({ ...dressed('foxkit', { head: 'cap' }), character: plain }, ANIMATIONS.write, 0))
      expect(leftOut()).toBe('')

      // The listing marks each one and still names it.
      const listing = lookReport()
      expect(listing).toContain('  face: glasses (not drawn: plain has no face slot)\n  neck: scarf (not drawn: plain has no neck slot)\n')
      expect(listing).toContain('  head: cap\n')

      // Setting one on its own says the same; a slot the character has says nothing extra.
      expect(apply('neck=scarf').text).toBe(
        'Look set: neck=scarf.\nplain has no neck slot, so scarf is saved but not drawn until a character with that slot is shown.',
      )
      expect(apply('head=cap').text).toBe('Look set: head=cap.')

      // This project's character decides which character it is drawn on, whichever look the words go to.
      setCurrentRoot(SHOP)
      setProjectLook({ character: 'foxkit' }, SHOP)
      expect(apply('face=glasses').text).toBe('Look set: face=glasses.')
      setProjectLook({}, SHOP)
      expect(apply('face=glasses', 'project').text).toBe(
        'Look set for this project: face=glasses.\nplain has no face slot, so glasses is saved but not drawn until a character with that slot is shown.',
      )
      setProjectLook({}, SHOP)

      // Switching to a character with the slots draws them, from what was saved all along.
      expect(apply('character=classic').text).toBe('Look set: character=classic.')
      const all = { head: 'cap', face: 'glasses', neck: 'scarf' }
      expect(render(drawable(), ANIMATIONS.write, 0)).toBe(render(dressed('classic', all), ANIMATIONS.write, 0))
      expect(leftOut()).toBe('')
      expect(lookReport()).toContain('  face: glasses\n  neck: scarf\n')
      expect(lookReport()).not.toContain('not drawn')
    })
  } finally {
    clean()
  }
})

test('a slot the character lacks is dropped silently, while a part that does not exist is still reported', async () => {
  clean()
  try {
    await withPart(CHARACTERS as Record<string, Character>, 'plain', plain, async () => {
      setSavedLook({ character: 'plain', outfit: { face: 'glasses', neck: 'crown' } })
      const dropped = droppedOf(currentLook())
      expect(dropped).toEqual([
        { part: 'face', why: 'plain has no face slot', isReported: false },
        { part: 'neck', why: 'no accessory named crown', isReported: true },
      ])
      drawable()
      expect(leftOut()).toBe('no accessory named crown')
    })
  } finally {
    clean()
  }
})

test('a slot set and emptied in one command reports nothing, and a slot set twice reports once', async () => {
  clean()
  try {
    await withPart(CHARACTERS as Record<string, Character>, 'plain', plain, async () => {
      apply('character=plain')
      const emptied = apply('neck=scarf neck=none')
      expect(emptied.text).toBe('Look set: neck=scarf neck=none.')
      expect(savedLook().outfit ?? {}).toEqual({})
      expect(apply('face=glasses face=glasses').text).toBe(
        'Look set: face=glasses face=glasses.\nplain has no face slot, so glasses is saved but not drawn until a character with that slot is shown.',
      )
    })
  } finally {
    clean()
  }
})

// Held slot: hidden in the frames painted while writing and zapping, back at rest.

const FOUR = { head: 'cap', face: 'glasses', neck: 'scarf', held: 'flag' }
const THREE = { head: 'cap', face: 'glasses', neck: 'scarf' }

for (const character of ['foxkit', 'classic']) {
  test(`held=flag shows on the ${character} at rest, vanishes in every frame of a turn and of a zap, and returns after each`, async ($, on) => {
    const clock = mock.clock(on)
    mock.store(on)
    const w = world(on, ROOT)
    // A second ticket stays open, so finishing the first is a zap and not the end of the set.
    addSet(w, ROOT, 'checkout', { '01-cart.md': ticket('01: Cart', 'in-progress'), '02-pay.md': ticket('02: Pay', 'in-progress') }, 5)
    w.answer = () => answered(RECIPE)
    on('turn.start', (_, e) => ({ turnId: e.turnId }))
    on('tool.call', () => ({ result: { ok: true } }))
    await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
    await clock.advance(SETTLED)
    await $.command.run({ command: 'sidekick-rescan', args: '', ...RUN })
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    w.painted.length = 0

    // Resting: all four are drawn, the flag really there, and the listing names it under held.
    await $.command.run({ ...LOOK, args: `character=${character}` })
    const set = await $.command.run({ ...LOOK, args: 'head=cap face=glasses neck=scarf held=flag' })
    expect(set.text).toBe('Look set: head=cap face=glasses neck=scarf held=flag.')
    const resting = render(dressed(character, FOUR), ANIMATIONS.idle, 0)
    expect(w.painted.at(-1)).toBe(resting)
    expect(resting).not.toBe(render(dressed(character, THREE), ANIMATIONS.idle, 0))
    expect((await $.command.run({ ...LOOK, args: '' })).text).toContain(`  character: ${character}\n  head: cap\n  face: glasses\n  neck: scarf\n  held: flag\n`)

    // Writing: every frame painted is the frame of the other three accessories, with no flag in it.
    const before = w.painted.length
    await $.turn.start({ text: 'Build it.', turnId: 't1' })
    for (let step = 0; step < ANIMATIONS.write.frames * 2; step++) {
      await clock.advance(ANIMATIONS.write.msPerFrame)
    }
    const writing = w.painted.slice(before)
    expect(writing.length).toBeGreaterThan(ANIMATIONS.write.frames)
    const writeFrames = Array.from({ length: ANIMATIONS.write.frames }, (_, step) => render(dressed(character, THREE), ANIMATIONS.write, step))
    for (const [at, painted] of writing.entries()) expect(writeFrames, `${character} write paint ${at}`).toContain(painted)
    const withFlag = Array.from({ length: ANIMATIONS.write.frames }, (_, step) => render(dressed(character, FOUR), ANIMATIONS.write, step))
    for (const painted of writing) expect(withFlag.includes(painted) && !writeFrames.includes(painted)).toBe(false)

    // Back at rest after the turn.
    await $.turn.complete({ answer: 'Done.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
    expect(w.painted.at(-1)).toBe(resting)

    // Zapping: all twelve frames, one after the other, none with the flag.
    const zapFrom = w.painted.length
    addSet(w, ROOT, 'checkout', { '01-cart.md': ticket('01: Cart', 'done'), '02-pay.md': ticket('02: Pay', 'in-progress') }, 9)
    await $.tool.call({ tool: 'Read', file_path: `${ROOT}/.scratch/checkout/issues/01-cart.md` })
    await clock.settle()
    for (let step = 0; step < ANIMATIONS.zap.frames; step++) {
      expect(w.painted.at(-1), `${character} zap frame ${step}`).toBe(render(dressed(character, THREE), ANIMATIONS.zap, step))
      await clock.advance(ANIMATIONS.zap.msPerFrame)
    }
    const zapFrames = Array.from({ length: ANIMATIONS.zap.frames }, (_, step) => render(dressed(character, THREE), ANIMATIONS.zap, step))
    const zapping = w.painted.slice(zapFrom)
    expect(zapping.length).toBeGreaterThanOrEqual(ANIMATIONS.zap.frames)
    for (const painted of zapping) expect([...zapFrames, resting]).toContain(painted)

    // Back at rest once the zap has ended.
    expect(w.painted.at(-1)).toBe(resting)
    await ui.unmount()
  })
}

test('a flag set for a character without a held slot is saved with the usual reply, and drawn once a character with the slot is shown', async () => {
  clean()
  try {
    const noHeld: Character = defineCharacter({ ...foxkit, name: 'plain', anchors: { ...foxkit.anchors, held: undefined }, bobs: { head: true, face: true, neck: false } })
    await withPart(CHARACTERS as Record<string, Character>, 'plain', noHeld, async () => {
      expect(apply('character=plain held=flag').text).toBe(
        'Look set: character=plain held=flag.\nplain has no held slot, so flag is saved but not drawn until a character with that slot is shown.',
      )
      expect(drawable().outfit).toEqual({})
      expect(leftOut()).toBe('')
      expect(lookReport()).toContain('  held: flag (not drawn: plain has no held slot)\n')
      expect(apply('character=classic').text).toBe('Look set: character=classic.')
      expect(drawable().outfit).toEqual({ held: ACCESSORIES.flag })
    })
  } finally {
    clean()
  }
})

// Overlapping turns and zaps: no painted frame shows the flag while the paws are busy.

/** A pane with the four accessories on, a ticket in progress, and nothing painted yet. */
const flagged = async ($: Engine, on: On) => {
  const clock = mock.clock(on)
  mock.store(on)
  const w = world(on, ROOT)
  // A second ticket stays open, so finishing the first is a zap and not the end of the set.
  addSet(w, ROOT, 'checkout', { '01-cart.md': ticket('01: Cart', 'in-progress'), '02-pay.md': ticket('02: Pay', 'in-progress') }, 5)
  w.answer = () => answered(RECIPE)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: { ok: true } }))
  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  await clock.advance(SETTLED)
  await $.command.run({ command: 'sidekick-rescan', args: '', ...RUN })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await $.command.run({ ...LOOK, args: 'head=cap face=glasses neck=scarf held=flag' })
  const resting = render(dressed('foxkit', FOUR), ANIMATIONS.idle, 0)
  expect(w.painted.at(-1)).toBe(resting)
  w.painted.length = 0
  const finish = async () => {
    addSet(w, ROOT, 'checkout', { '01-cart.md': ticket('01: Cart', 'done'), '02-pay.md': ticket('02: Pay', 'in-progress') }, 9)
    await $.tool.call({ tool: 'Read', file_path: `${ROOT}/.scratch/checkout/issues/01-cart.md` })
    await clock.settle()
  }
  const frames = (mode: 'write' | 'zap') =>
    Array.from({ length: ANIMATIONS[mode].frames }, (_, step) => render(dressed('foxkit', THREE), ANIMATIONS[mode], step))

  return { clock, w, ui, resting, finish, writeFrames: frames('write'), zapFrames: frames('zap') }
}

test('a ticket finishing while a turn is writing: no frame shows the flag, the write resumes without it, and it is back after the turn', async ($, on) => {
  const { clock, w, ui, resting, finish, writeFrames, zapFrames } = await flagged($, on)
  await $.turn.start({ text: 'Build it.', turnId: 't1' })
  await clock.advance(ANIMATIONS.write.msPerFrame * 2)
  await finish()
  await clock.advance(ANIMATIONS.zap.msPerFrame * (ANIMATIONS.zap.frames + 2))
  await clock.advance(ANIMATIONS.write.msPerFrame * 3)
  expect(w.painted.length).toBeGreaterThan(0)
  for (const [at, painted] of w.painted.entries()) expect([...writeFrames, ...zapFrames], `paint ${at}`).toContain(painted)
  // The zap was really painted, and the write is still going after it.
  expect(w.painted.some(painted => zapFrames.includes(painted) && !writeFrames.includes(painted))).toBe(true)
  expect(writeFrames).toContain(w.painted.at(-1))

  await $.turn.complete({ answer: 'Done.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(w.painted.at(-1)).toBe(resting)
  await ui.unmount()
})

test('a turn that starts and completes while a zap plays: every frame is a zap frame without the flag, or the resting frame with it', async ($, on) => {
  const { clock, w, ui, resting, finish, zapFrames } = await flagged($, on)
  await finish()
  await clock.advance(ANIMATIONS.zap.msPerFrame * 2)
  await $.turn.start({ text: 'Build it.', turnId: 't1' })
  await clock.advance(ANIMATIONS.zap.msPerFrame * 2)
  await $.turn.complete({ answer: 'Done.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(ANIMATIONS.zap.msPerFrame * (ANIMATIONS.zap.frames + 2))
  expect(w.painted.length).toBeGreaterThan(0)
  for (const [at, painted] of w.painted.entries()) {
    expect(zapFrames.includes(painted) || painted === resting, `paint ${at}`).toBe(true)
  }
  expect(w.painted.some(painted => zapFrames.includes(painted))).toBe(true)
  expect(w.painted.at(-1)).toBe(resting)
  await ui.unmount()
})

test('the flag stays drawn through the cheer that ends a set, in every frame, while the zap before it hides it', async ($, on) => {
  const { clock, w, ui, resting, finish, zapFrames } = await flagged($, on)
  await finish()
  await clock.advance(ANIMATIONS.zap.msPerFrame * (STRIKE_STEPS + 1))
  w.painted.length = 0
  // The second ticket finishes: the set is done, and the zap and its strike come first.
  addSet(w, ROOT, 'checkout', { '01-cart.md': ticket('01: Cart', 'done'), '02-pay.md': ticket('02: Pay', 'done') }, 12)
  await $.tool.call({ tool: 'Read', file_path: `${ROOT}/.scratch/checkout/issues/02-pay.md` })
  await clock.settle()
  const cheerFrames = Array.from({ length: ANIMATIONS.cheer.frames }, (_, step) => render(dressed('foxkit', FOUR), ANIMATIONS.cheer, step))
  const bareCheer = Array.from({ length: ANIMATIONS.cheer.frames }, (_, step) => render(dressed('foxkit', THREE), ANIMATIONS.cheer, step))
  await clock.advance(ANIMATIONS.zap.msPerFrame * STRIKE_STEPS + ANIMATIONS.cheer.msPerFrame * (ANIMATIONS.cheer.frames + 1))
  for (const [at, painted] of w.painted.entries()) {
    expect([...zapFrames, ...cheerFrames, resting], `paint ${at}`).toContain(painted)
  }
  // The cheer was painted as it is with the flag, and the flag is what tells it from the cheer without.
  for (const [step, frame] of cheerFrames.entries()) {
    if (frame !== resting) expect(frame, `cheer ${step} keeps the flag`).not.toBe(bareCheer[step])
    expect(w.painted, `cheer ${step} was painted`).toContain(frame)
  }
  expect(w.painted.at(-1)).toBe(resting)
  await ui.unmount()
})
