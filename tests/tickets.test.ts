import { expect, test } from 'claude-code/testing'
import { cellsOf, SPRITE } from '../hooks/sprite'
import { ANIMATIONS } from '../hooks/sprite/registry'
import type { Place, Recipe } from '../hooks/tickets'
import {
  addPlace,
  findSet,
  globReach,
  globToRegExp,
  groupSets,
  labelOf,
  namedIn,
  orderSets,
  parseChecklist,
  parsePlace,
  parseSummary,
  parseTicketFile,
  progressOf,
  readRecipe,
  setIdOf,
  shortTitle,
  toRelative,
  windowOf,
} from '../hooks/tickets'

const files = parsePlace(
  '{"kind":"files","glob":".scratch/*/issues/*.md","statusLabel":"Status","doneValues":["resolved"],"activeValues":["claimed"]}',
) as Extract<Place, { kind: 'files' }>
const recipe: Recipe = { places: [files] }

test('a place is read from the model reply, and anything outside the fixed fields is refused', async () => {
  expect(files.kind).toBe('files')
  expect(files.doneValues).toContain('resolved')
  expect(files.doneValues).toContain('done')
  expect(parsePlace('Here you go: {"kind":"checklist","glob":"TODO.md"}')).toEqual({
    kind: 'checklist',
    glob: 'TODO.md',
  })
  expect(parsePlace('{"kind":"none"}')).toBe('none')
  expect(parsePlace('{"kind":"files","glob":"../other/*.md"}')).toBeUndefined()
  expect(parsePlace('{"kind":"files","glob":"C:/x/*.md"}')).toBeUndefined()
  expect(parsePlace('{"kind":"script","glob":"a.md"}')).toBeUndefined()
  expect(parsePlace('no tickets here')).toBeUndefined()
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
  const open = '# 01: Cart\n\n**Status:** ready-for-agent\n\n- [x] one\n- [ ] two\n'
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

const REAL = '**Status:** resolved (commit `8b6d9702` on branch `worktree-agent-a2d462a49df30f41b`, not merged; flag `CHAT_LOOKUP_STOP`)'

test('a status counts by whole words anywhere in it, unless a negation comes right before', async () => {
  const of = (status: string, boxes = '- [ ] a'): ReturnType<typeof parseTicketFile> =>
    parseTicketFile('t.md', `# T\n\n**Status:** ${status}\n\n${boxes}\n`, files)
  expect(of(REAL.replace('**Status:** ', '')).isDone).toBe(true)
  expect(of('ready-for-agent').isDone).toBe(false)
  expect(of('ready-for-agent, not merged').isDone).toBe(false)
  expect(of('not done yet').isDone).toBe(false)
  expect(of('undone').isDone).toBe(false)
  expect(of('doneish').isDone).toBe(false)
  expect(of('\u2705 Done').isDone).toBe(true)
  expect(of('~~Done~~').isDone).toBe(true)
  expect(of('In Progress')).toMatchObject({ isDone: false, isActive: true })
  expect(of('in_progress (alice)').isActive).toBe(true)
  expect(of('in-progress, not done').isActive).toBe(true)
  expect(of('done, was in progress')).toMatchObject({ isDone: true, isActive: false })
})

test('an unknown status falls back to the checkboxes', async () => {
  const of = (boxes: string): boolean => parseTicketFile('t.md', `# T\n**Status:** waiting on review\n${boxes}\n`, files).isDone
  expect(of('- [x] a\n- [x] b')).toBe(true)
  expect(of('- [x] a\n- [ ] b')).toBe(false)
  expect(parseTicketFile('t.md', '# T\n**Status:** \u{1F6A7} wip\n- [x] a', files).isActive).toBe(true)
})

test('two tickets: a resolved one with trailing text and a ready one count 1/2 done', async () => {
  const tickets = [
    parseTicketFile('01.md', `# One\n\n${REAL}\n\n- [ ] a step\n`, files),
    parseTicketFile('02.md', '# Two\n\n**Status:** ready-for-agent\n\n- [ ] a step\n', files),
  ]
  expect(tickets.filter(t => t.isDone)).toHaveLength(1)
  expect(tickets[0]?.isDone).toBe(true)
})

test('a checklist has one ticket per line', async () => {
  expect(parseChecklist('# Todo\n- [x] first\n- [~] second\n* [ ] third\nnot a ticket\n')).toEqual([
    { title: 'first', isDone: true, isActive: false },
    { title: 'second', isDone: false, isActive: true },
    { title: 'third', isDone: false, isActive: false },
  ])
})

test('sets are grouped across places with unique ids, and a path maps to its set', async () => {
  const both: Recipe = { places: [files, { kind: 'checklist', glob: 'TODO.md' }] }
  const sets = groupSets(both, [
    { path: '.scratch/old/issues/02-b.md', mtimeMs: 10 },
    { path: '.scratch/old/issues/01-a.md', mtimeMs: 5 },
    { path: '.scratch/new/issues/01-a.md', mtimeMs: 99 },
    { path: '.scratch/new/spec.md', mtimeMs: 500 },
    { path: 'TODO.md', mtimeMs: 7 },
  ])
  expect(sets.map(set => set.id).sort()).toEqual(['.scratch/new/issues', '.scratch/old/issues', 'TODO.md'])
  expect(sets.find(set => set.id === '.scratch/old/issues')?.files.map(file => file.path)).toEqual([
    '.scratch/old/issues/01-a.md',
    '.scratch/old/issues/02-b.md',
  ])
  expect(setIdOf(both, 'TODO.md')).toBe('TODO.md')
  expect(setIdOf(both, '.scratch/new/issues/01-a.md')).toBe('.scratch/new/issues')
  expect(setIdOf(both, 'README.md')).toBeUndefined()
  // Two places reading one folder: the first keeps the set id.
  const txt: Place = { ...files, glob: '.scratch/*/issues/*.txt' }
  const one = groupSets({ places: [files, txt] }, [
    { path: '.scratch/a/issues/1.md', mtimeMs: 1 },
    { path: '.scratch/a/issues/2.txt', mtimeMs: 2 },
  ])
  expect(one).toHaveLength(1)
  expect(one[0]?.place).toBe(files)
  expect(one[0]?.files).toHaveLength(1)
})

test('an old single recipe is read as one place, an old none as no places, and a new place is added', async () => {
  expect(readRecipe({ kind: 'checklist', glob: 'TODO.md' })).toEqual({ places: [{ kind: 'checklist', glob: 'TODO.md' }] })
  expect(readRecipe({ ...files })).toEqual({ places: [files] })
  expect(readRecipe({ kind: 'none' })).toEqual({ places: [] })
  expect(readRecipe({ places: [files, { kind: 'bogus' }] })).toEqual({ places: [files] })
  expect(readRecipe(undefined)).toBeUndefined()
  expect(readRecipe({ kind: 'script' })).toBeUndefined()
  const todo: Place = { kind: 'checklist', glob: 'TODO.md' }
  const added = addPlace(recipe, todo)
  expect(added.places).toEqual([files, todo])
  // The same glob replaces in place, with the new rules.
  const wider = { ...files, doneValues: ['x'] }
  expect(addPlace(added, wider).places).toEqual([wider, todo])
})

test('a prompt names a set by label or id, ignoring case and - _ spaces; two matches name none', async () => {
  const sets = groupSets(
    { places: [files] },
    ['new-feature', 'old_thing', 'search', 'search-v2'].map(name => ({ path: `.scratch/${name}/issues/1.md`, mtimeMs: 1 })),
  )
  const named = (text: string): string | undefined => namedIn(sets, text)?.id
  expect(named('continue new-feature')).toBe('.scratch/new-feature/issues')
  expect(named('work on New Feature please')).toBe('.scratch/new-feature/issues')
  expect(named('back to old thing.')).toBe('.scratch/old_thing/issues')
  expect(named('look at .scratch/old_thing/issues')).toBe('.scratch/old_thing/issues')
  expect(named('fix the cart')).toBeUndefined()
  expect(named('search and old thing')).toBeUndefined()
  expect(named('research it')).toBeUndefined()
  // "search-v2" also contains the word "search".
  expect(named('work on search-v2')).toBeUndefined()
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
  expect(toRelative('D:/Work/app', 'D:\\Work\\app\\.scratch\\a\\issues\\01.md')).toBe('.scratch/a/issues/01.md')
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
    for (let frame = 0; frame < ANIMATIONS[mode].frames; frame++) {
      expect(cellsOf(ANIMATIONS[mode], frame).length).toBe(length)
    }
  }
  expect(cellsOf(ANIMATIONS.write, 0)).not.toBe(cellsOf(ANIMATIONS.idle, 0))
  expect(cellsOf(ANIMATIONS.zap, 2)).not.toBe(cellsOf(ANIMATIONS.zap, 0))
  expect(cellsOf(ANIMATIONS.zap, ANIMATIONS.zap.frames)).toBe(cellsOf(ANIMATIONS.zap, 0))
})

test('sets are numbered most recently changed first, and a set is found by number, name or part of its id', () => {
  const sets = orderSets([
    { id: '.scratch/search/issues', files: [], mtimeMs: 5 },
    { id: '.scratch/billing/issues', files: [], mtimeMs: 9 },
    { id: 'docs/tasks', files: [], mtimeMs: 9 },
  ])
  expect(sets.map(set => set.id)).toEqual(['.scratch/billing/issues', 'docs/tasks', '.scratch/search/issues'])
  expect(labelOf('.scratch/search/issues')).toBe('search')
  expect(labelOf('docs/tasks')).toBe('docs')
  expect(labelOf('.')).toBe('.')
  expect((findSet(sets, '3') as { id: string }).id).toBe('.scratch/search/issues')
  expect(findSet(sets, '4')).toBe('none')
  expect((findSet(sets, 'Billing') as { id: string }).id).toBe('.scratch/billing/issues')
  expect((findSet(sets, 'sear') as { id: string }).id).toBe('.scratch/search/issues')
  expect(findSet(sets, 'scratch')).toBe('many')
  expect(findSet(sets, 'nope')).toBe('none')
  expect(findSet(sets, ' ')).toBe('none')
})
