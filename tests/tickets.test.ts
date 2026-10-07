import { expect, test } from 'claude-code/testing'

import {
  globReach,
  globToRegExp,
  groupSets,
  parseChecklist,
  parseRecipe,
  parseSummary,
  parseTicketFile,
  pickSet,
  progressOf,
  setIdOf,
  shortTitle,
  toRelative,
  windowOf,
} from '../hooks/tickets'
import type { Recipe } from '../hooks/tickets'
import { SPRITE, cellsOf, frameCount } from '../hooks/sprite'

const files = parseRecipe(
  '{"kind":"files","glob":".scratch/*/issues/*.md","statusLabel":"Status","doneValues":["resolved"],"activeValues":["claimed"]}',
) as Extract<Recipe, { kind: 'files' }>

test('a recipe is read from the model reply, and anything outside the fixed fields is refused', async () => {
  expect(files.kind).toBe('files')
  expect(files.doneValues).toContain('resolved')
  expect(files.doneValues).toContain('done')
  expect(parseRecipe('Here you go: {"kind":"checklist","glob":"TODO.md"}')).toEqual({
    kind: 'checklist',
    glob: 'TODO.md',
  })
  expect(parseRecipe('{"kind":"none"}')).toEqual({ kind: 'none' })
  expect(parseRecipe('{"kind":"files","glob":"../other/*.md"}')).toBeUndefined()
  expect(parseRecipe('{"kind":"files","glob":"C:/x/*.md"}')).toBeUndefined()
  expect(parseRecipe('{"kind":"script","glob":"a.md"}')).toBeUndefined()
  expect(parseRecipe('no tickets here')).toBeUndefined()
})

test('a glob matches within a folder with * and across folders with **', async () => {
  const one = globToRegExp('.scratch/*/issues/*.md')
  expect(one.test('.scratch/checkout/issues/01-cart.md')).toBe(true)
  expect(one.test('.scratch/checkout/spec.md')).toBe(false)
  expect(one.test('.scratch/a/b/issues/01.md')).toBe(false)
  expect(globToRegExp('docs/**/*.md').test('docs/a/b/c.md')).toBe(true)
  expect(globToRegExp('docs/**/*.md').test('docs/c.md')).toBe(true)
  expect(globReach('.scratch/*/issues/*.md')).toEqual({ dir: '.scratch', depth: 3 })
  expect(globReach('TODO.md')).toEqual({ dir: '', depth: 1 })
})

test('the status line decides when a ticket has one, else its checkboxes do', async () => {
  const open = '# 01: Cart\n\n**Status:** ready-for-agent\n\n- [x] one\n- [x] two\n'
  expect(parseTicketFile('01-cart.md', open, files)).toEqual({
    title: '01: Cart',
    isDone: false,
    isActive: false,
  })
  expect(parseTicketFile('02.md', '# Pay\nStatus: claimed\n', files).isActive).toBe(true)
  expect(parseTicketFile('03.md', '# Ship\n**Status:** Resolved\n- [ ] x\n', files).isDone).toBe(true)
  expect(parseTicketFile('04.md', '# Boxes\n- [x] a\n- [X] b\n', files).isDone).toBe(true)
  expect(parseTicketFile('05.md', '# Boxes\n- [x] a\n- [ ] b\n', files).isDone).toBe(false)
  expect(parseTicketFile('06-no-heading.md', 'just text', files).title).toBe('06-no-heading')
})

test('a checklist has one ticket per line', async () => {
  expect(parseChecklist('# Todo\n- [x] first\n- [~] second\n* [ ] third\nnot a ticket\n')).toEqual([
    { title: 'first', isDone: true, isActive: false },
    { title: 'second', isDone: false, isActive: true },
    { title: 'third', isDone: false, isActive: false },
  ])
})

test('the set the session touched wins over the most recently changed one', async () => {
  const sets = groupSets(files, [
    { path: '.scratch/old/issues/02-b.md', mtimeMs: 10 },
    { path: '.scratch/old/issues/01-a.md', mtimeMs: 5 },
    { path: '.scratch/new/issues/01-a.md', mtimeMs: 99 },
    { path: '.scratch/new/spec.md', mtimeMs: 500 },
  ])
  expect(sets.map(set => set.id).sort()).toEqual(['.scratch/new/issues', '.scratch/old/issues'])
  expect(pickSet(sets, undefined)?.id).toBe('.scratch/new/issues')
  expect(pickSet(sets, '.scratch/old/issues')?.files.map(file => file.path)).toEqual([
    '.scratch/old/issues/01-a.md',
    '.scratch/old/issues/02-b.md',
  ])
  expect(pickSet(sets, '.scratch/gone/issues')?.id).toBe('.scratch/new/issues')
  expect(setIdOf({ kind: 'checklist', glob: 'TODO.md' }, 'TODO.md')).toBe('TODO.md')
  expect(setIdOf(files, 'README.md')).toBeUndefined()
})

test('progress counts done tickets and names the one in progress, else the first open', async () => {
  const done = { title: 'a', isDone: true, isActive: false }
  const open = { title: 'b', isDone: false, isActive: false }
  const active = { title: 'c', isDone: false, isActive: true }
  expect(progressOf([done, open, active], 'x')).toEqual({
    done: 1,
    total: 3,
    next: 'c',
    source: 'x',
    rows: [
      { title: 'a', state: 'done' },
      { title: 'b', state: 'open' },
      { title: 'c', state: 'active' },
    ],
  })
  expect(progressOf([done, open], 'x').next).toBe('b')
  expect(progressOf([done], 'x').next).toBeNull()
})

test('a path is made relative to the project on Windows and POSIX alike', async () => {
  expect(toRelative('D:/Work/app', 'D:\\Work\\app\\.scratch\\a\\issues\\01.md')).toBe(
    '.scratch/a/issues/01.md',
  )
  expect(toRelative('/home/me/app', '/home/me/app/TODO.md')).toBe('TODO.md')
  expect(toRelative('/home/me/app', '/home/me/other/TODO.md')).toBeUndefined()
  expect(toRelative('/home/me/app', './TODO.md')).toBe('TODO.md')
})

test('the summary is kept unless the model says something moved', async () => {
  expect(parseSummary('{"change":false}')).toBeUndefined()
  expect(parseSummary('nothing')).toBeUndefined()
  expect(parseSummary('{"change":true,"happened":"Built the cart.","next":"Add payment.","needsYou":""}')).toEqual({
    happened: 'Built the cart.',
    next: 'Add payment.',
    needsYou: '',
  })
})

test('a long ticket list is cut to the room it has, around the next ticket', async () => {
  expect(windowOf(4, 2, 10)).toEqual({ start: 0, end: 4 })
  expect(windowOf(20, 0, 5)).toEqual({ start: 0, end: 5 })
  expect(windowOf(20, 9, 5)).toEqual({ start: 8, end: 13 })
  expect(windowOf(20, 19, 5)).toEqual({ start: 15, end: 20 })
  expect(shortTitle('01: Cart')).toBe('Cart')
  expect(shortTitle('#12 - Fix login')).toBe('Fix login')
  expect(shortTitle('2024 roadmap')).toBe('2024 roadmap')
})

test('every frame of the character fills its grid, and the frames differ', async () => {
  const bytes = SPRITE.columns * SPRITE.rows * 12
  const length = Math.ceil(bytes / 3) * 4
  for (const mode of ['idle', 'write', 'zap'] as const) {
    for (let frame = 0; frame < frameCount(mode); frame++) {
      expect(cellsOf(mode, frame).length).toBe(length)
    }
  }
  expect(cellsOf('write', 0)).not.toBe(cellsOf('idle', 0))
  expect(cellsOf('zap', 2)).not.toBe(cellsOf('zap', 0))
  expect(cellsOf('zap', frameCount('zap'))).toBe(cellsOf('zap', 0))
})
