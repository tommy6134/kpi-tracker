import { describe, expect, mock, test } from 'claude-code/testing'

import type { KpiSessionFile } from '../hooks/core/session-file'
import { assemble } from '../hooks/report/html'
import { BAND, command, commandOutput, PANE, SESSION } from './fixtures/inputs'
import { DOWNLOADS, elementsOf, HOME, PROJECT_DIR, ROOT, SESSION_ID, textOf, usageOf, worldOf, type World } from './fixtures/world'

const PLUGIN = 'kpi-tracker'

type Mounted = { surface: string; unmount: () => Promise<void> }

/** Monta un componente tramite il plugin sul terminale: un albero rifiutato non si monta. */
const accepted = async ($: unknown, input: Record<string, unknown>): Promise<string> => {
  const mounted = await ($ as { ui: { mount: (target: unknown) => Promise<Mounted> } }).ui.mount(input)

  await mounted.unmount()

  return mounted.surface
}

type Engine = Parameters<Parameters<typeof test>[1]>[0]

/** Una sessione con un turno, una modifica, un comando Bash con commit e una misurazione. */
async function workedSession($: Engine, on: Parameters<Parameters<typeof test>[1]>[1], world: World, clock: { advance: (ms: number) => Promise<void> }) {
  on('tool.call', ($$, e) => {
    if (e.tool === 'Edit') {
      return { result: { filePath: '/work/progetto-demo/src/app.ts', structuredPatch: [{ lines: ['+a', '+b', '-c'] }], userModified: false }, text: 'ok' } as never
    }

    return { result: { stdout: '', stderr: '', interrupted: false, gitOperation: { commit: { sha: 'abcdef1234', kind: 'committed', branch: 'main' } } }, text: 'ok' } as never
  })

  await $.session.start(SESSION)
  await $.prompt.submit({ text: 'implementa la funzione SEGRETA', wait: false, origin: { kind: 'composer' } })
  await $.turn.start({ text: 'x', turnId: 't1' })
  await $.tool.call({ tool: 'Edit', file_path: '/work/progetto-demo/src/app.ts', old_string: 'c', new_string: 'a\nb' } as never)
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "SEGRETO"' } as never)
  await $.turn.complete({
    answer: 'ok',
    durationMs: 61_000,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    usage: { model: 'claude-opus-5-5', input_tokens: 1200, output_tokens: 3400, cache_read_input_tokens: 250_000, cache_creation_input_tokens: 9000 },
  } as never)
  world.session.usage = usageOf(1.42, 46)
  await $.session.measure({
    context: { tokens: 92_000, window: 200_000, percent: 46 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 23 },
      { kind: 'seven_day', percentUsed: 41 },
    ],
    cost: { usd: 1.42 },
    changed: ['cost', 'context', 'rateLimits'],
  })
  await clock.advance(6000)
}

describe('barra e pannello', () => {
  test('la barra mostra costo, token, cache, contesto e rate limit; Nascondi la toglie', async ($, on) => {
    const world = worldOf(on)
    const clock = mock.clock(on)

    on('ui.render', () => ({ type: 'Text', children: ['motore'] }))
    await workedSession($, on, world, clock)

    const text = textOf(await $.ui.render(BAND))

    expect(text).toContain('KPI')
    expect(text).toContain('$1,42')
    expect(text).toContain('cache')
    expect(text).toContain('ctx 46%')
    expect(text).toContain('5h 23%')
    expect(text).toContain('7g 41%')
    expect(text).toContain('[Dettagli]')

    for (const bodyColumns of [40, 70, 100, 140]) {
      expect(await accepted($, { ...BAND, plugin: PLUGIN, props: { ...BAND.props, bodyColumns } })).toBe('terminal')
    }

    await $.ui.render(BAND)
    await $.ui.press({ plugin: PLUGIN, key: 'kpi-hide' })

    expect(textOf(await $.ui.render(BAND))).toBe('motore')
  })

  test('Dettagli apre il pannello, che il terminale accetta a varie larghezze', async ($, on) => {
    const world = worldOf(on)
    const clock = mock.clock(on)

    on('ui.render', () => ({ type: 'Text', children: [''] }))
    await workedSession($, on, world, clock)
    await $.ui.render(BAND)
    await $.ui.press({ plugin: PLUGIN, key: 'kpi-details' })

    expect(world.opened).toEqual(['kpi-live'])

    const tree = await $.ui.render(PANE)
    const text = textOf(tree)

    expect(text).toContain('Costo')
    expect(text).toContain('Token')
    expect(text).toContain('$1,42')
    expect(text).toContain('Edit')
    expect(text).toContain('Commit')
    expect(text).toContain('+2')
    expect(text).toContain('46%')
    expect(elementsOf(tree, 'Raster').length).toBeGreaterThan(0)

    // Senza errori la card Errori resta in fondo, dopo i Permessi.
    expect(text.indexOf(' Errori ')).toBeGreaterThan(text.indexOf(' Permessi '))

    for (const [bodyColumns, bodyRows] of [[40, 10], [46, 40], [70, 30], [120, 44]] as const) {
      expect(await accepted($, { ...PANE, plugin: PLUGIN, props: { ...PANE.props, bodyColumns, scroll: { offset: 0, bodyRows } } })).toBe('terminal')
    }

    expect(await accepted($, { ...PANE, surface: 'desktop', plugin: PLUGIN })).toBe('desktop')
  })

  test('con errori la card Errori sale sotto le card in testa', async ($, on) => {
    worldOf(on)
    const clock = mock.clock(on)

    on('ui.render', () => ({ type: 'Text', children: [''] }))
    on('tool.call', () => ({ isError: true, result: 'boom', text: 'boom' }) as never)
    await $.session.start(SESSION)
    await $.turn.start({ text: 'x', turnId: 't1' })
    await $.tool.call({ tool: 'Bash', command: 'ls' } as never)
    await $.turn.complete({ answer: '', durationMs: 100, isAborted: false, turnId: 't1', reason: 'answer' } as never)
    await clock.advance(6000)

    const text = textOf(await $.ui.render(PANE))

    expect(text).toContain('✗1')
    expect(text.indexOf(' Errori ')).toBeGreaterThan(-1)
    expect(text.indexOf(' Errori ')).toBeLessThan(text.indexOf(' Token '))
  })
})

describe('/kpi', () => {
  test('al modello va una riga breve; il report completo si disegna nel CommandOutput', async ($, on) => {
    const world = worldOf(on)
    const clock = mock.clock(on)

    on('ui.render', ($$, e) => ({ type: 'Text', children: [e.component === 'CommandOutput' ? (e.props as { text: string }).text : ''] }))
    await workedSession($, on, world, clock)

    const result = (await $.command.run(command('kpi'))) as { text: string }

    expect(result.text).toContain("mostrato all'utente")
    expect(result.text).toMatch(/\(rif\. kpi:r1\)$/)
    expect(result.text.length).toBeLessThan(300)

    const drawn = textOf(await $.ui.render(commandOutput(result.text)))

    expect(drawn).toContain('## KPI di Claude Code')
    expect(drawn).toContain('Sessione corrente')
    expect(drawn).toContain('$1,42')
  })

  test('--ctx manda il report completo anche al modello', async ($, on) => {
    const world = worldOf(on)
    const clock = mock.clock(on)

    await workedSession($, on, world, clock)

    const result = (await $.command.run(command('kpi', 'statistiche --ctx'))) as { text: string }

    expect(result.text).toContain('## KPI · tutti i dati')
    expect(result.text).toContain('### Costo e token')
    expect(result.text).toContain('### Git')
    expect(result.text).not.toContain('rif. kpi:')
  })

  test('sessioni, progetti, sessione corrente e aiuto', async ($, on) => {
    const world = worldOf(on)
    const clock = mock.clock(on)
    const full = async (args: string) => ((await $.command.run(command('kpi', `${args} --ctx`))) as { text: string }).text

    await workedSession($, on, world, clock)

    expect(await full('sessioni')).toContain('3f9a1c2e')
    expect(await full('progetti')).toContain('progetto-demo')
    expect(await full('sessione corrente')).toContain(`## Sessione ${SESSION_ID}`)
    expect(await full('stats --per giorno')).toContain('### Per giorno')
    expect(await full('aiuto')).toContain('/kpi · guida')
    expect(((await $.command.run(command('kpi', 'boh'))) as { text: string }).text).toContain('Sottocomando sconosciuto')
    expect(((await $.command.run(command('kpi', 'stats --da domani'))) as { text: string }).text).toContain('data non valida')
  })

  test('report HTML, export CSV/JSON e barra off', async ($, on) => {
    const world = worldOf(on)
    const clock = mock.clock(on)

    await workedSession($, on, world, clock)

    const report = ((await $.command.run(command('kpi', 'report --no-apri'))) as { text: string }).text

    expect(report).toContain('Report HTML generato')
    expect(world.under(`${ROOT}/_reports/`).some(path => path.endsWith('latest.html'))).toBe(true)

    const csv = ((await $.command.run(command('kpi', 'esporta csv'))) as { text: string }).text
    const csvPath = world.under(`${ROOT}/_exports/`).find(path => path.endsWith('.csv')) as string

    expect(csv).toContain('formato Excel italiano')
    expect(world.files.get(csvPath)?.startsWith('﻿inizio;progetto;percorso;sessione')).toBe(true)

    await $.command.run(command('kpi', 'esporta json --livello giorni'))

    const jsonPath = world.under(`${ROOT}/_exports/`).find(path => path.endsWith('.json')) as string
    const exported = world.json<{ level: string; rows: { giorno: string; costo_usd: number }[] }>(jsonPath)

    expect(exported.level).toBe('giorni')
    expect(exported.rows[0]?.costo_usd).toBe(1.42)

    const off = ((await $.command.run(command('kpi', 'barra off'))) as { text: string }).text

    expect(off).toContain('disattivata')
  })

  test('pulisci elenca senza --si e cancella con --si, mai la sessione in corso', async ($, on) => {
    const old = '0ld5e551-0000-0000-0000-000000000000'
    const oldDir = `${PROJECT_DIR}/2025-01-01_10-00-00_0ld5e551`
    const oldFile = { schemaVersion: 1, sessionId: old, createdAt: Date.UTC(2025, 0, 1), updatedAt: Date.UTC(2025, 0, 1), summary: { lastAt: Date.UTC(2025, 0, 1) } }
    const world = worldOf(on, { files: { [`${oldDir}/session.json`]: JSON.stringify(oldFile) } })
    const clock = mock.clock(on)

    await workedSession($, on, world, clock)

    const dry = ((await $.command.run(command('kpi', 'pulisci --piu-vecchie-di 30d'))) as { text: string }).text

    expect(dry).toContain('0ld5e551')
    expect(dry).toContain('Non ho cancellato nulla')
    expect(world.runs.some(argv => argv[0] === 'rm')).toBe(false)

    const done = ((await $.command.run(command('kpi', 'pulisci --piu-vecchie-di 30d --si'))) as { text: string }).text

    expect(done).toContain('Cancellate 1 sessioni')
    expect(world.runs.filter(argv => argv[0] === 'rm')).toEqual([['rm', '-rf', oldDir]])
  })

  test('su macOS il report si apre dal suo percorso, senza copie', async ($, on) => {
    const world = worldOf(on)
    const clock = mock.clock(on)

    await workedSession($, on, world, clock)
    await $.command.run(command('kpi', 'report'))

    const opened = world.runs.filter(argv => argv[0] === 'open')

    expect(opened).toHaveLength(1)
    expect(opened[0]?.[1]?.startsWith(`${ROOT}/_reports/report-`)).toBe(true)
    expect(world.runs.some(argv => argv[0] === 'xdg-user-dir')).toBe(false)
  })

  test('su Linux il report sotto una cartella nascosta si apre da una copia in Scaricati (browser snap e flatpak)', async ($, on) => {
    const world = worldOf(on, { os: 'Linux' })
    const clock = mock.clock(on)

    await workedSession($, on, world, clock)

    const report = ((await $.command.run(command('kpi', 'report'))) as { text: string }).text
    const copy = `${DOWNLOADS}/kpi-report.html`

    expect(world.files.get(copy)).toBe(world.files.get(`${ROOT}/_reports/latest.html`))
    expect(world.runs.filter(argv => argv[0] === 'xdg-open')).toEqual([['xdg-open', copy]])
    expect(report).toContain(`Copia per il browser: ${copy}`)
    expect(report).toContain('Aperto nel browser')
  })

  test('reportDir raccoglie report ed export senza copie; --out accetta ~/… e rifiuta i relativi', { options: { reportDir: '~/Documenti/kpi' } }, async ($, on) => {
    const world = worldOf(on, { os: 'Linux' })
    const clock = mock.clock(on)
    const dir = `${HOME}/Documenti/kpi`

    await workedSession($, on, world, clock)
    await $.command.run(command('kpi', 'report'))

    expect(world.files.has(`${dir}/latest.html`)).toBe(true)
    expect(world.under(`${ROOT}/_reports/`)).toEqual([])
    expect(world.runs.some(argv => argv[0] === 'xdg-user-dir')).toBe(false)
    expect(world.runs.find(argv => argv[0] === 'xdg-open')?.[1]?.startsWith(`${dir}/report-`)).toBe(true)

    await $.command.run(command('kpi', 'esporta csv'))

    expect(world.under(`${dir}/kpi-sessioni-`)).toHaveLength(1)

    await $.command.run(command('kpi', 'esporta json --out ~/kpi.json'))

    expect(world.files.has(`${HOME}/kpi.json`)).toBe(true)

    const relative = ((await $.command.run(command('kpi', 'esporta json --out kpi.json'))) as { text: string }).text

    expect(relative).toContain('percorso assoluto')
  })
})

describe('report HTML', () => {
  test('assemble: nessuna risorsa esterna, dati incorporati in modo sicuro', () => {
    const html = assemble('<title>__TITLE__</title><style>/*__STYLE__*/</style><script type="application/json">__DATA__</script><script>/*__APP__*/</script>', 'body{}', 'var x = "$&"; // </script>', { s: '</script>' }, 'KPI <x>')

    expect(html).toContain('<title>KPI &lt;x&gt;</title>')
    expect(html).toContain('var x = "$&"')
    expect(html).not.toMatch(/src=["']https?:/)
    expect((html.match(/<\/script>/g) ?? []).length).toBe(2)
  })
})

describe('privacy', () => {
  test('nessun file scritto contiene testo di prompt, argomenti di comandi o messaggi di commit', async ($, on) => {
    const world = worldOf(on)
    const clock = mock.clock(on)

    await workedSession($, on, world, clock)
    await $.command.run(command('kpi', 'esporta csv --livello eventi'))
    await $.command.run(command('kpi', 'esporta json --livello eventi'))

    const all = world.written()

    expect(all).not.toContain('SEGRET')
    expect(all).not.toContain('implementa la funzione')

    const dir = world.under(PROJECT_DIR).find(path => path.endsWith('session.json')) as string
    const file = world.json<KpiSessionFile>(dir)

    expect(file.summary.prompts.chars.max).toBe('implementa la funzione SEGRETA'.length)
    expect(file.summary.git.commits).toBe(1)
  })
})
