import { describe, expect, mock, test } from 'claude-code/testing'

import type { KpiProjectFile, KpiSessionFile } from '../hooks/core/session-file'
import { classicStart, HEADLESS, SESSION } from './fixtures/inputs'
import { CWD, PROJECT_DIR, ROOT, SESSION_ID, usageOf, worldOf } from './fixtures/world'

const sessionDirs = (world: ReturnType<typeof worldOf>): string[] =>
  [...new Set(world.under(PROJECT_DIR).map(path => path.slice(PROJECT_DIR.length + 1).split('/')[0] ?? ''))].filter(name => /_\w{8}$/.test(name))

describe('ciclo di vita della sessione', () => {
  test('session.start crea marcatore, project.json e la cartella della sessione', async ($, on) => {
    const world = worldOf(on)

    mock.clock(on)
    await $.session.start(SESSION)

    expect(world.files.has(`${ROOT}/_meta/kpi-root.json`)).toBe(true)

    const project = world.json<KpiProjectFile>(`${PROJECT_DIR}/project.json`)

    expect(project.path).toBe(CWD)
    expect(project.name).toBe('progetto-demo')

    const dirs = sessionDirs(world)

    expect(dirs).toHaveLength(1)
    expect(dirs[0]).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_3f9a1c2e$/)

    const file = world.json<KpiSessionFile>(`${PROJECT_DIR}/${dirs[0]}/session.json`)

    expect(file.sessionId).toBe(SESSION_ID)
    expect(file.kind).toBe('interattiva')
    expect(file.segments).toHaveLength(1)
    expect(file.segments[0]?.source).toBe('startup')
    expect(file.meta.branches).toEqual(['main'])
    expect(world.commands).toEqual(['kpi'])
  })

  test('un turno completo finisce negli eventi e nel summary', async ($, on) => {
    const world = worldOf(on)
    const clock = mock.clock(on)

    on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', interrupted: false }, text: 'ok' }))

    await $.session.start(SESSION)
    await $.prompt.submit({ text: 'ciao mondo segreto', wait: false, origin: { kind: 'composer' } })
    await $.turn.start({ text: 'ciao mondo segreto', turnId: 't1' })
    await $.tool.call({ tool: 'Bash', command: 'git status && npm test' } as never)
    await $.turn.complete({
      answer: 'fatto',
      durationMs: 4200,
      isAborted: false,
      turnId: 't1',
      reason: 'answer',
      usage: { model: 'claude-opus-5-5', input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 1000, cache_creation_input_tokens: 200 },
    } as never)
    world.session.usage = usageOf(0.42, 12)
    await $.session.measure({ context: { tokens: 24000, window: 200000, percent: 12 }, rateLimits: [{ kind: 'five_hour', percentUsed: 23 }], cost: { usd: 0.42 }, changed: ['cost', 'context'] })
    await clock.advance(6000)

    const dir = sessionDirs(world)[0]
    const file = world.json<KpiSessionFile>(`${PROJECT_DIR}/${dir}/session.json`)
    const s = file.summary

    expect(s.prompts.n).toBe(1)
    expect(s.turns.main).toBe(1)
    expect(s.tokens).toEqual({ in: 100, out: 50, cr: 1000, cw: 200 })
    expect(Math.abs(s.cost.usd - 0.42) < 1e-9).toBe(true)
    expect(s.context.lastPct).toBe(12)
    expect(s.rate.five_hour?.max).toBe(23)
    expect(s.tools.byTool.Bash?.n).toBe(1)
    expect(s.bash.byCat.test?.n).toBe(1)
    expect(Object.keys(s.bash.byCmd).sort()).toEqual(['git status', 'npm test'])

    const chunks = world.under(`${PROJECT_DIR}/${dir}/events/`)

    expect(chunks.length).toBe(1)
    expect(world.written()).not.toContain('segreto')
  })

  test('una ripresa riusa la cartella con un nuovo segmento; /clear ne crea una collegata', async ($, on) => {
    const world = worldOf(on)
    const clock = mock.clock(on)

    await $.session.start(SESSION)
    await $.classic.SessionStart(classicStart('startup'))
    await $.session.end({ reason: 'prompt_input_exit', sessionId: SESSION_ID, resume: { id: SESSION_ID } } as never)
    await clock.advance(2000)

    // Un nuovo processo riprende la stessa sessione.
    await $.classic.SessionStart(classicStart('resume'))
    await clock.advance(2000)

    expect(sessionDirs(world)).toHaveLength(1)

    const resumed = world.json<KpiSessionFile>(`${PROJECT_DIR}/${sessionDirs(world)[0]}/session.json`)

    expect(resumed.segments.map(segment => segment.source)).toEqual(['startup', 'resume'])

    // /clear: la sessione corrente finisce e parte la nuova.
    await $.session.end({ reason: 'clear', sessionId: SESSION_ID, resume: { id: SESSION_ID } } as never)

    const next = '9b8a7c6d-0000-0000-0000-000000000000'

    world.session.id = next
    await $.classic.SessionStart(classicStart('clear', next))
    await clock.advance(2000)

    const dirs = sessionDirs(world)

    expect(dirs).toHaveLength(2)

    const files = dirs.map(name => world.json<KpiSessionFile>(`${PROJECT_DIR}/${name}/session.json`))
    const cleared = files.find(file => file.sessionId === next)
    const previous = files.find(file => file.sessionId === SESSION_ID)

    expect(cleared?.links.previousSessionId).toBe(SESSION_ID)
    expect(cleared?.segments[0]?.source).toBe('clear')
    expect(previous?.status).toBe('ended')
    expect(previous?.segments.at(-1)?.endReason).toBe('clear')
  })

  test('una sessione -p è di tipo print e salva a fine turno', async ($, on) => {
    const world = worldOf(on)

    mock.clock(on)
    await $.session.start(HEADLESS)
    await $.turn.start({ text: 'x', turnId: 't1' })
    await $.turn.complete({ answer: '', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' } as never)

    const file = world.json<KpiSessionFile>(`${PROJECT_DIR}/${sessionDirs(world)[0]}/session.json`)

    expect(file.kind).toBe('print')
    expect(file.summary.turns.main).toBe(1)
  })
})
