import { expect, mock, test } from 'claude-code/testing'
import type { World } from './world'
import { answered, RUN, ticket, world } from './world'

// A monorepo: the tickets sit seven levels down, in a sub-project, next to a shallow todo.md.
const ROOT = '/work/npd'
const SUB = 'projects/natural_language/policy_gap_chatbot'
const ISSUES = `${SUB}/.scratch/qa-stop-when-answered/issues`
const RECIPE_DEEP = `{"kind":"files","glob":"${ISSUES}/*.md","statusLabel":"Status","doneValues":["done"],"activeValues":[]}`
const TICKETS = {
  '01-stop.md': ticket('01: Stop', 'done'),
  '02-ask.md': ticket('02: Ask', 'ready-for-agent'),
}

const monorepo = (on: Parameters<typeof world>[0]): World => {
  const w = world(on, ROOT, {
    [ROOT]: [
      { name: 'todo.md', kind: 'file' },
      { name: '.pytest_cache', kind: 'dir' },
      { name: '.ruff_cache', kind: 'dir' },
      { name: '.tmp_strands', kind: 'dir' },
      { name: 'projects', kind: 'dir' },
    ],
    [`${ROOT}/.pytest_cache`]: [{ name: 'README.md', kind: 'file' }],
    [`${ROOT}/.ruff_cache`]: [{ name: 'notes.md', kind: 'file' }],
    [`${ROOT}/.tmp_strands`]: [{ name: 'run.md', kind: 'file' }],
    [`${ROOT}/projects`]: [{ name: 'natural_language', kind: 'dir' }],
    [`${ROOT}/projects/natural_language`]: [{ name: 'policy_gap_chatbot', kind: 'dir' }],
    [`${ROOT}/${SUB}`]: [{ name: '.scratch', kind: 'dir' }],
    [`${ROOT}/${SUB}/.scratch`]: [{ name: 'qa-stop-when-answered', kind: 'dir' }],
    [`${ROOT}/${SUB}/.scratch/qa-stop-when-answered`]: [{ name: 'issues', kind: 'dir' }],
    [`${ROOT}/${ISSUES}`]: Object.keys(TICKETS).map(name => ({ name, kind: 'file' as const, mtimeMs: 9 })),
  })
  for (const [name, text] of Object.entries(TICKETS)) w.files[`${ROOT}/${ISSUES}/${name}`] = text
  // The model finds the folder only when the mod tells it where the developer pointed.
  w.answer = prompt => answered(prompt.includes(`folder \`${ISSUES}\``) ? RECIPE_DEEP : '{"kind":"none"}')

  return w
}

const PLAIN_HINT = 'tickets are in .scratch/qa-stop-when-answered/issues'
const HINTS = [PLAIN_HINT, `tickets are in ${SUB}/scratch/qa-stop-when-answered/issues/`, 'tickets are in @../../../.scratch/qa-stop-when-answered/issues/']

for (const hint of HINTS)
  test(`the hint "${hint}" resolves to the folder on disk`, async ($, on) => {
    mock.clock(on)
    mock.store(on)
    const w = monorepo(on)

    const ran = await $.command.run({ command: 'sidekick-rescan', args: hint, ...RUN })
    expect(ran.text).toBe(`Reading tickets from ${ISSUES}: 1/2 done.`)
    expect(w.asked[0]).toContain(`${ISSUES}/01-stop.md`)
  })

test('with no hint, files in a deep ticket folder are listed before a shallow todo.md', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  const w = monorepo(on)

  await $.command.run({ command: 'sidekick-rescan', args: '', ...RUN })
  const listed = w.asked[0] ?? ''
  expect(listed).toContain(`${ISSUES}/01-stop.md`)
  expect(listed.indexOf(`${ISSUES}/01-stop.md`)).toBeLessThan(listed.indexOf('\ntodo.md'))
})

test('cache folders are never listed or read', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  const w = monorepo(on)

  await $.command.run({ command: 'sidekick-rescan', args: '', ...RUN })
  await $.command.run({ command: 'sidekick-rescan', args: PLAIN_HINT, ...RUN })
  for (const prompt of w.asked) {
    expect(prompt).not.toContain('.pytest_cache')
    expect(prompt).not.toContain('.ruff_cache')
    expect(prompt).not.toContain('.tmp_strands')
  }
  expect(w.touched.filter(path => /\.(pytest_cache|ruff_cache|tmp_strands)/.test(path))).toEqual([])
})

// Sibling projects with hundreds of files each, listed before the one that holds the tickets.
const crowded = (on: Parameters<typeof world>[0], ext: string): World => {
  const w = monorepo(on)
  const rows = (n: number): { name: string; kind: 'file' }[] => Array.from({ length: n }, (_, i) => ({ name: `mod_${i}.${ext}`, kind: 'file' as const }))
  const names = ['aaa_api', 'aab_etl', 'aac_ml', 'aad_web']
  w.tree[`${ROOT}/projects`] = [...names.map(name => ({ name, kind: 'dir' as const })), ...(w.tree[`${ROOT}/projects`] ?? [])]
  for (const name of names) {
    w.tree[`${ROOT}/projects/${name}`] = [{ name: 'src', kind: 'dir' }, ...rows(300)]
    w.tree[`${ROOT}/projects/${name}/src`] = rows(300)
  }

  return w
}

for (const ext of ['py', 'json']) {
  test(`with no hint, ${ext} files in sibling projects do not use up the cap before the deep folder`, async ($, on) => {
    mock.clock(on)
    mock.store(on)
    const w = crowded(on, ext)

    await $.command.run({ command: 'sidekick-rescan', args: '', ...RUN })
    expect(w.asked[0] ?? '').toContain(`${ISSUES}/01-stop.md`)
  })
}
