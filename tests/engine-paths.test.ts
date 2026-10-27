import { describe, expect, mock, test } from 'claude-code/testing'

import type { KpiSessionFile } from '../hooks/core/session-file'
import { classicStart, SESSION } from './fixtures/inputs'
import { PROJECT_DIR, SESSION_ID, worldOf, type World } from './fixtures/world'

const sessionFile = (world: World): { path: string; file: KpiSessionFile } => {
  const path = world.under(PROJECT_DIR).find(one => one.endsWith('/session.json')) as string

  return { path, file: world.json<KpiSessionFile>(path) }
}

const base = { session_id: SESSION_ID, transcript_path: '/tmp/t.jsonl', cwd: '/work/progetto-demo' }

describe('richieste in streaming (turn.step)', () => {
  test('TTFT, latenza, token per richiesta e motivo di stop; i chunk passano invariati', async ($, on) => {
    const world = worldOf(on)
    const clock = mock.clock(on)

    on('turn.step', async function* ($$, e) {
      yield { kind: 'text' as const, index: 0, text: 'ciao' }
      yield { kind: 'text' as const, index: 0, text: ' mondo' }

      return {
        turnId: e.turnId,
        index: e.index,
        answer: 'ciao mondo',
        toolUses: [],
        stopReason: 'end_turn' as const,
        usage: { model: 'claude-opus-5-5', input_tokens: 7, output_tokens: 11, cache_read_input_tokens: 13, cache_creation_input_tokens: 17 },
      }
    })

    await $.session.start(SESSION)
    await $.turn.start({ text: 'x', turnId: 't1' })

    const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 3 })
    const texts: string[] = []
    let step = await stream.next()

    while (step.done !== true) {
      if (step.value.kind === 'text') texts.push(step.value.text)
      step = await stream.next()
    }

    const result = step.value

    expect(texts).toEqual(['ciao', ' mondo'])
    expect(result.answer).toBe('ciao mondo')

    await $.turn.complete({
      answer: 'ciao mondo',
      durationMs: 1500,
      isAborted: false,
      turnId: 't1',
      reason: 'answer',
      usage: { model: 'claude-opus-5-5', input_tokens: 7, output_tokens: 11, cache_read_input_tokens: 13, cache_creation_input_tokens: 17 },
    } as never)
    await clock.advance(6000)

    const s = sessionFile(world).file.summary

    expect(s.requests.n).toBe(1)
    expect(s.requests.ttft.n).toBe(1)
    expect(s.requests.byStop.end_turn).toBe(1)
    expect(s.effort.high).toBe(1)
    // Token contati una volta sola (dalla richiesta, non dal turno).
    expect(s.tokens).toEqual({ in: 7, out: 11, cr: 13, cw: 17 })
    expect(s.byModel['claude-opus-5-5']?.req).toBe(1)
  })
})

describe('reload e ripristino', () => {
  test('session.start ripetuto nello stesso modulo non apre un altro segmento', async ($, on) => {
    const world = worldOf(on)
    const clock = mock.clock(on)

    await $.session.start(SESSION)
    await $.session.start(SESSION)
    await $.classic.SessionStart(classicStart('startup'))
    await clock.advance(6000)

    expect(sessionFile(world).file.segments.map(segment => segment.source)).toEqual(['startup'])
  })

  test('gli eventi su disco oltre l\'ultimo session.json si rigiocano alla ripresa', async ($, on) => {
    const world = worldOf(on)
    const clock = mock.clock(on)

    await $.session.start(SESSION)
    await $.session.end({ reason: 'prompt_input_exit', sessionId: SESSION_ID, resume: { id: SESSION_ID } } as never)
    await clock.advance(2000)

    // Simula un crash: un evento turn.end scritto nel chunk ma non in session.json.
    const { path, file } = sessionFile(world)
    const dir = path.slice(0, -'/session.json'.length)
    const chunkPath = world.under(`${dir}/events/`)[0] as string
    const segment = file.segments[0] as { lastSeq: number }
    const extra = { q: segment.lastSeq + 1, t: Date.now(), e: 'turn.end', tu: 'tz', ms: 5000, r: 'answer', ns: 0, ans: 1, m: 'opus', in: 1, out: 1, cr: 0, cw: 0 }

    world.files.set(chunkPath, `${world.files.get(chunkPath) ?? ''}${JSON.stringify(extra)}\n`)

    await $.classic.SessionStart(classicStart('resume'))
    await clock.advance(6000)

    const resumed = sessionFile(world).file

    expect(resumed.summary.turns.main).toBe(1)
    expect(resumed.segments).toHaveLength(2)
  })
})

describe('tool, permessi e subagent', () => {
  test('durata da PostToolUse, esiti, decisioni di permesso e dialoghi', async ($, on) => {
    const world = worldOf(on)
    const clock = mock.clock(on)

    // Solo la verifica esplicita chiede: il kit (visto con la 2.1.311) fa passare anche le tool call da
    // tool.check, e un `ask` senza nessuno che risponda le rifiuterebbe.
    let asking = true

    on('tool.call', ($$, e) => (e.tool === 'Read' ? ({ result: { type: 'text', file: { filePath: '/work/progetto-demo/a.md', content: 'x', numLines: 40, startLine: 1, totalLines: 40 } }, text: 'x', isReadOnly: true } as never) : ({ isError: true, result: 'boom', text: 'boom' } as never)))
    on('tool.check', () => ({ decision: asking ? ('ask' as const) : ('allow' as const) }))

    await $.session.start(SESSION)
    await $.turn.start({ text: 'x', turnId: 't1' })
    await $.tool.check({ tool: 'Bash', input: { command: 'ls' } } as never)
    await $.classic.PermissionRequest({ ...base, hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: {} } as never)
    asking = false
    await $.tool.call({ tool: 'Read', file_path: '/work/progetto-demo/a.md' } as never)
    await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
    await $.turn.complete({ answer: '', durationMs: 100, isAborted: false, turnId: 't1', reason: 'answer' } as never)
    await clock.advance(6000)

    const s = sessionFile(world).file.summary

    expect(s.tools.byTool.Read?.ok).toBe(1)
    expect(s.tools.byTool.Read?.ro).toBe(1)
    expect(s.files.linesRead).toBe(40)
    expect(s.tools.byTool.Bash?.err).toBe(1)
    expect(s.tests.err).toBe(1)
    expect(s.perms.byDecision.ask).toBe(1)
    expect(s.perms.dialogs).toBe(1)
  })

  test('subagent: avvio, turno e token attribuiti al tipo', async ($, on) => {
    const world = worldOf(on)
    const clock = mock.clock(on)

    on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'ag1' }))

    await $.session.start(SESSION)
    await $.agent.spawn({ tool_use_id: 'u1', prompt: 'cerca', description: 'cerca', subagentType: 'Explore', provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-opus-5-5', background: false, fork: false } as never)
    await $.classic.SubagentStart({ ...base, hook_event_name: 'SubagentStart', agent_id: 'ag1', agent_type: 'Explore' } as never)
    await $.turn.complete({
      answer: 'trovato',
      durationMs: 9000,
      isAborted: false,
      turnId: 'ta',
      agentId: 'ag1',
      reason: 'answer',
      usage: { model: 'claude-haiku-5-5', input_tokens: 5, output_tokens: 6, cache_read_input_tokens: 7, cache_creation_input_tokens: 8 },
    } as never)
    await clock.advance(6000)

    const s = sessionFile(world).file.summary

    expect(s.agents.n).toBe(1)
    expect(s.agents.byType.Explore?.ms).toBe(9000)
    expect(s.agents.byType.Explore?.tok).toBe(26)
    expect(s.agents.maxConcurrent).toBe(1)
    expect(s.turns.sub).toBe(1)
    expect(s.turns.main).toBe(0)
    expect(s.tokensSub).toEqual({ in: 5, out: 6, cr: 7, cw: 8 })
  })
})
