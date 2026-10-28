import { describe, expect, mock, test, type TestBody } from 'claude-code/testing'

import type { KpiSessionFile } from '../hooks/core/session-file'
import { assemble } from '../hooks/report/html'
import { BAND, command, commandOutput, EN, IT, PANE, SESSION } from './fixtures/inputs'
import { DOWNLOADS, elementsOf, HOME, PROJECT_DIR, ROOT, SESSION_ID, textOf, usageOf, worldOf, WSL_KERNEL, wslPathOf, type World } from './fixtures/world'

const PLUGIN = 'kpi-tracker'

type Mounted = { surface: string; unmount: () => Promise<void> }

/** Monta un componente tramite il plugin sul terminale: un albero rifiutato non si monta. */
const accepted = async ($: unknown, input: Record<string, unknown>): Promise<string> => {
  const mounted = await ($ as { ui: { mount: (target: unknown) => Promise<Mounted> } }).ui.mount(input)

  await mounted.unmount()

  return mounted.surface
}

type Engine = Parameters<TestBody>[0]

/** Una sessione con un turno, una modifica, un comando Bash con commit e una misurazione. */
async function workedSession($: Engine, on: Parameters<TestBody>[1], world: World, clock: { advance: (ms: number) => Promise<void> }) {
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
  test('la barra mostra costo, token, cache, contesto e rate limit; Nascondi la toglie', IT, async ($, on) => {
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

  test('Dettagli apre il pannello, che il terminale accetta a varie larghezze', IT, async ($, on) => {
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

  test('con errori la card Errori sale sotto le card in testa', IT, async ($, on) => {
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
  test('al modello va una riga breve; il report completo si disegna nel CommandOutput', IT, async ($, on) => {
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

  test('--ctx manda il report completo anche al modello', IT, async ($, on) => {
    const world = worldOf(on)
    const clock = mock.clock(on)

    await workedSession($, on, world, clock)

    const result = (await $.command.run(command('kpi', 'statistiche --ctx'))) as { text: string }

    expect(result.text).toContain('## KPI · tutti i dati')
    expect(result.text).toContain('### Costo e token')
    expect(result.text).toContain('### Git')
    expect(result.text).not.toContain('rif. kpi:')
  })

  test('sessioni, progetti, sessione corrente e aiuto', IT, async ($, on) => {
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

  test('report HTML, export CSV/JSON e barra off', IT, async ($, on) => {
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
    expect(world.files.get(csvPath)?.split('\r\n')[0]).toMatch(
      /;versione;tool_negate;rifiutate_utente;negate_classificatore;dialoghi_permesso;righe_aggiunte_src;righe_rimosse_src;righe_aggiunte_test;righe_rimosse_test;righe_aggiunte_doc;righe_rimosse_doc;righe_aggiunte_cobol;righe_rimosse_cobol;righe_aggiunte_mainframe;righe_rimosse_mainframe;righe_aggiunte_config;righe_rimosse_config;righe_aggiunte_altro;righe_rimosse_altro;build_ok;build_ko;documenti_creati;documenti_rigenerati$/,
    )
    expect(world.files.get(csvPath)?.split('\r\n')[1]).toMatch(/;2;1;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0$/)

    await $.command.run(command('kpi', 'esporta json --livello giorni'))

    const jsonPath = world.under(`${ROOT}/_exports/`).find(path => path.endsWith('.json')) as string
    const exported = world.json<{ level: string; rows: { giorno: string; costo_usd: number }[] }>(jsonPath)

    expect(exported.level).toBe('giorni')
    expect(exported.rows[0]?.costo_usd).toBe(1.42)

    const off = ((await $.command.run(command('kpi', 'barra off'))) as { text: string }).text

    expect(off).toContain('disattivata')
  })

  test('pulisci elenca senza --si e cancella con --si, mai la sessione in corso', IT, async ($, on) => {
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

    expect(done).toContain('Sessioni cancellate: 1 su 1')
    expect(world.runs.filter(argv => argv[0] === 'rm')).toEqual([['rm', '-rf', oldDir]])
  })

  test('su macOS il report si apre dal suo percorso, senza copie', IT, async ($, on) => {
    const world = worldOf(on)
    const clock = mock.clock(on)

    await workedSession($, on, world, clock)
    await $.command.run(command('kpi', 'report'))

    const opened = world.runs.filter(argv => argv[0] === 'open')

    expect(opened).toHaveLength(1)
    expect(opened[0]?.[1]?.startsWith(`${ROOT}/_reports/report-`)).toBe(true)
    expect(world.runs.some(argv => argv[0] === 'xdg-user-dir')).toBe(false)
  })

  test('su Linux il report sotto una cartella nascosta si apre da una copia in Scaricati (browser snap e flatpak)', IT, async ($, on) => {
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

  test('reportDir raccoglie report ed export senza copie; --out accetta ~/… e rifiuta i relativi', { options: { reportDir: '~/Documenti/kpi', language: 'it' } }, async ($, on) => {
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

    // Senza filtro di data e senza nome: data e ora di adesso, il livello sessioni non ha suffisso.
    expect(world.under(dir).filter(path => /\/kpi_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.csv$/.test(path))).toHaveLength(1)

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

describe('categorie di attività', () => {
  const RULES = JSON.stringify({ colonna: 'categoria', parole: { docs: 'DOCUMENTAZIONE', dev: 'SVILUPPO', qa: 'TEST' }, ripiego: { doc: 'DOCUMENTAZIONE', test: 'TEST', src: 'SVILUPPO' } })
  const run = async ($: Engine, args: string) => ((await $.command.run(command('kpi', args))) as { text: string }).text
  const lastColumn = (world: World, suffix: string) => {
    const path = world.under(`${ROOT}/_exports/`).find(one => one.endsWith(suffix)) as string
    const lines = (world.files.get(path) ?? '').replace(/^﻿/, '').split('\r\n').filter(line => line !== '')

    return lines.map(line => line.split(';').at(-1))
  }

  test('dal file nella cartella dati: colonna in fondo a ogni livello, filtro per etichetta, parola o nessuna, --per categoria, dettaglio e report', IT, async ($, on) => {
    const world = worldOf(on, { files: { [`${ROOT}/categorie.json`]: RULES } })
    const clock = mock.clock(on)

    world.branch = 'feature/PROJ-123-docs'
    await workedSession($, on, world, clock)

    for (const level of ['sessioni', 'giorni', 'turni', 'eventi']) {
      await run($, `esporta csv --livello ${level}`)

      const column = lastColumn(world, level === 'sessioni' ? '.csv' : `_${level}.csv`)

      expect(column[0]).toBe('categoria')
      expect(column.length > 1 && column.slice(1).every(value => value === 'DOCUMENTAZIONE')).toBe(true)
    }

    expect(await run($, 'sessioni --categoria docs')).toContain('Elenco di 1 sessione')
    expect(await run($, 'sessioni --category documentazione')).toContain('Elenco di 1 sessione')
    expect(await run($, 'sessioni --categoria SVILUPPO')).toContain('Elenco di 0 sessioni')
    expect(await run($, 'sessioni --categoria nessuna')).toContain('Elenco di 0 sessioni')
    expect(await run($, 'statistiche --per categoria --ctx')).toMatch(/Per categoria[\s\S]*\| DOCUMENTAZIONE \| 1 \|/)
    expect(await run($, 'sessione corrente --ctx')).toContain('| categoria | DOCUMENTAZIONE |')

    await run($, 'report --no-apri')

    const html = world.files.get(`${ROOT}/_reports/latest.html`) ?? ''
    const data = JSON.parse(/<script type="application\/json" id="kpi-data">(.*?)<\/script>/s.exec(html)?.[1] ?? '{}') as { meta: { category?: string }; dict: { categories: string[] }; sessions: unknown[][] }

    expect(data.meta.category).toBe('categoria')
    expect(data.dict.categories).toEqual(['DOCUMENTAZIONE'])
    expect(data.sessions[0]?.at(-1)).toBe(0)
  })

  test('senza file nessuna colonna e --categoria o --per categoria dicono come attivarle; un file rotto le spegne con un avviso', IT, async ($, on) => {
    const world = worldOf(on)
    const clock = mock.clock(on)

    await workedSession($, on, world, clock)
    await run($, 'esporta csv')

    expect(lastColumn(world, '.csv')[0]).toBe('documenti_rigenerati')
    expect(await run($, 'sessioni --categoria docs')).toContain(`Le categorie non sono attive: scrivi le regole in ${ROOT}/categorie.json`)
    expect(await run($, 'statistiche --per categoria')).toContain('Le categorie non sono attive')

    world.files.set(`${ROOT}/categories.json`, '{ "parole": { "docs": ')

    expect(await run($, 'statistiche --ctx')).toMatch(new RegExp(`^⚠ Categorie spente: ${ROOT}/categories.json non è valido: JSON non valido`))

    world.files.set(`${ROOT}/categories.json`, JSON.stringify({ ripiego: { sorgenti: 'X' } }))

    expect(await run($, 'sessioni --ctx')).toContain('classe di ripiego sconosciuta "sorgenti"')
  })

  test('dall\'opzione categoriesFile, con le chiavi in inglese e il ripiego sulle righe aggiunte', { options: { language: 'en', categoriesFile: '~/kpi/rules.json' } }, async ($, on) => {
    const world = worldOf(on, { files: { [`${HOME}/kpi/rules.json`]: JSON.stringify({ column: 'area', keywords: { qa: 'Quality' }, fallback: { doc: 'Docs', src: 'Code' } }) } })
    const clock = mock.clock(on)

    // Branch senza parole chiave: vale la classe con più righe aggiunte (src).
    world.branch = 'latest-fix'
    await workedSession($, on, world, clock)
    await run($, 'export csv --standard')

    const path = world.under(`${ROOT}/_exports/`)[0] as string
    const [header, row] = (world.files.get(path) ?? '').split('\n')

    expect(header?.endsWith(',builds_failed,documents_created,documents_regenerated,area')).toBe(true)
    expect(row?.endsWith(',Code')).toBe(true)
    expect(await run($, 'stats --by category --ctx')).toMatch(/By area[\s\S]*\| Code \| 1 \|/)
  })
})

describe('privacy', () => {
  test('nessun file scritto contiene testo di prompt, argomenti di comandi o messaggi di commit', IT, async ($, on) => {
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

describe('in inglese', () => {
  test('barra e pannello in inglese, sul terminale e sul desktop', EN, async ($, on) => {
    const world = worldOf(on)
    const clock = mock.clock(on)

    on('ui.render', () => ({ type: 'Text', children: [''] }))
    await workedSession($, on, world, clock)

    const band = textOf(await $.ui.render(BAND))

    expect(band).toContain('$1.42')
    expect(band).toContain('7d 41%')
    expect(band).toContain('[Details]')
    expect(band).toContain('[Hide]')

    const pane = textOf(await $.ui.render(PANE))

    expect(pane).toContain(' Cost ')
    expect(pane).toContain(' Context ')
    expect(pane).toContain('[HTML report]')
    expect(pane).toContain('interactive')
    expect(pane).not.toContain('Costo')

    for (const surface of ['terminal', 'desktop'] as const) {
      expect(await accepted($, { ...BAND, surface, plugin: PLUGIN })).toBe(surface)
      expect(await accepted($, { ...PANE, surface, plugin: PLUGIN })).toBe(surface)
    }
  })

  test('senza opzione /kpi è in inglese; --lingua it lo rimette in italiano per un comando', async ($, on) => {
    const world = worldOf(on)
    const clock = mock.clock(on)

    on('ui.render', ($$, e) => ({ type: 'Text', children: [e.component === 'CommandOutput' ? (e.props as { text: string }).text : ''] }))
    await workedSession($, on, world, clock)

    const result = (await $.command.run(command('kpi'))) as { text: string }

    expect(result.text).toContain('shown to the user')
    expect(result.text).toMatch(/\(ref\. kpi:r1\)$/)
    expect(textOf(await $.ui.render(commandOutput(result.text)))).toContain('## Claude Code KPIs')

    const full = async (args: string) => ((await $.command.run(command('kpi', `${args} --ctx`))) as { text: string }).text

    expect(await full('stats --by days')).toContain('### By day')
    expect(await full('statistiche --lingua it')).toContain('### Costo e token')
    expect(await full('help')).toContain('/kpi · help')
    expect(await full('aiuto --lang it')).toContain('/kpi · guida')
    expect(await full('stats --since tomorrow')).toContain('invalid date for --since: tomorrow')
    expect(await full('stats --lang fr')).toContain('Unknown language: fr')
  })

  test('CSV e JSON con colonne e valori in inglese; il formato CSV segue la lingua', EN, async ($, on) => {
    const world = worldOf(on)
    const clock = mock.clock(on)

    await workedSession($, on, world, clock)

    const csv = ((await $.command.run(command('kpi', 'export csv'))) as { text: string }).text
    const csvPath = world.under(`${ROOT}/_exports/`).find(path => path.endsWith('.csv')) as string
    const text = world.files.get(csvPath) ?? ''

    expect(csv).toContain('Exported 1 row (sessions)')
    expect(csv).toContain('standard format')
    expect(csvPath).toMatch(/\/kpi_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.csv$/)
    expect(text.startsWith('start,project,path,session,kind,status,duration_min')).toBe(true)
    expect(text.split('\n')[0]).toMatch(/,version,tools_denied,rejected_by_user,denied_by_classifier,permission_dialogs,lines_added_src,lines_removed_src,.*,lines_added_mainframe,lines_removed_mainframe,lines_added_config,lines_removed_config,lines_added_other,lines_removed_other,builds_ok,builds_failed,documents_created,documents_regenerated$/)
    expect(text).toContain(',interactive,active,')

    await $.command.run(command('kpi', 'export csv --excel --level days'))

    const excel = world.files.get(world.under(`${ROOT}/_exports/`).find(path => path.endsWith('_days.csv')) as string) ?? ''

    expect(excel.startsWith('﻿day;project;session;kind;cost_usd')).toBe(true)

    await $.command.run(command('kpi', 'export json --level days'))
    await $.command.run(command('kpi', 'esporta json --livello giorni --lingua it'))

    const jsons = world.under(`${ROOT}/_exports/`).filter(path => path.endsWith('.json'))
    const en = world.json<{ language: string; level: string; filter: string; rows: { day: string; cost_usd: number }[] }>(jsons.find(path => path.endsWith('_days.json')) as string)
    const it = world.json<{ language: string; level: string; rows: { giorno: string; costo_usd: number }[] }>(jsons.find(path => path.endsWith('_giorni.json')) as string)

    expect(en).toMatchObject({ language: 'en', level: 'days', filter: 'all data' })
    expect(en.rows[0]?.cost_usd).toBe(1.42)
    expect(it).toMatchObject({ language: 'it', level: 'giorni' })
    expect(it.rows[0]?.costo_usd).toBe(1.42)
  })

  test('nome dell\'export: nome e cognome, periodo del filtro, livello e lingua; lo stesso periodo sovrascrive', { options: { language: 'it', fullName: '  José Ñúñez-Ølsen ' } }, async ($, on) => {
    const world = worldOf(on)
    const clock = mock.clock(on)
    const run = async (args: string) => ((await $.command.run(command('kpi', args))) as { text: string }).text
    const names = () => world.under(`${ROOT}/_exports/`).map(path => path.slice(`${ROOT}/_exports/`.length))

    await workedSession($, on, world, clock)
    await run('esporta csv --mese 2026-10')
    await run('esporta csv --month 10/2026')
    await run('esporta json --mese 2026-10 --livello giorni --lingua en')
    await run('esporta csv --da 2026-10-12 --a 2026-10-12 --livello turni')
    await run('esporta csv --da 2026-09-01 --a 2026-10-31')
    await run('esporta csv --da 2026-10-05 --a 2026-10-20')

    expect(names()).toEqual([
      'kpi_jose_nunez_olsen_2026-09_2026-10.csv',
      'kpi_jose_nunez_olsen_2026-10-05_2026-10-20.csv',
      'kpi_jose_nunez_olsen_2026-10-12_turni.csv',
      'kpi_jose_nunez_olsen_2026-10.csv',
      'kpi_jose_nunez_olsen_2026-10_days.json',
    ])
    expect(await run('esporta csv --mese 2026-10 --da 2026-10-01')).toContain('--mese non si combina con --da e --a')
    expect(await run('esporta csv --mese 2026-13')).toContain('mese non valido per --mese: 2026-13')
  })

  test('nome dell\'export: senza opzione si usa git config user.name; senza nessuno dei due il file non ha nome', IT, async ($, on) => {
    const world = worldOf(on)
    const clock = mock.clock(on)

    await workedSession($, on, world, clock)
    world.gitUser = 'Anna Bianchi'
    await $.command.run(command('kpi', 'esporta csv --mese 2026-10'))
    world.gitUser = ''
    await $.command.run(command('kpi', 'esporta csv --mese 2026-10'))

    expect(world.under(`${ROOT}/_exports/`)).toEqual([`${ROOT}/_exports/kpi_2026-10.csv`, `${ROOT}/_exports/kpi_anna_bianchi_2026-10.csv`])
    expect(world.runs.filter(argv => argv.includes('user.name'))).toHaveLength(2)
  })

  test('il report HTML si apre nella lingua scelta e porta entrambe le descrizioni', EN, async ($, on) => {
    const world = worldOf(on)
    const clock = mock.clock(on)

    await workedSession($, on, world, clock)
    await $.command.run(command('kpi', 'report --no-open'))

    const html = world.files.get(`${ROOT}/_reports/latest.html`) ?? ''
    const data = JSON.parse(/<script type="application\/json" id="kpi-data">(.*?)<\/script>/s.exec(html)?.[1] ?? '{}') as { meta: { lang: string; description: { it: string; en: string } }; codes: Record<string, string> }

    expect(html).toContain('<html lang="en">')
    expect(html).toContain('<title>KPI Claude Code · all data</title>')
    expect(data.meta.lang).toBe('en')
    expect(data.meta.description).toEqual({ it: 'tutti i dati', en: 'all data' })
    expect(data.codes.interattiva).toBe('interactive')

    await $.command.run(command('kpi', 'report --no-open --lang it'))

    expect(world.files.get(`${ROOT}/_reports/latest.html`)).toContain('<html lang="it">')
  })
})

describe('cartella di report ed export', () => {
  test('/kpi cartella apre nel file manager la cartella dei report, degli export o dei dati', IT, async ($, on) => {
    const world = worldOf(on)
    const clock = mock.clock(on)
    const text = async (args: string) => ((await $.command.run(command('kpi', args))) as { text: string }).text

    await workedSession($, on, world, clock)

    expect(await text('cartella')).toBe(`Cartella aperta: ${ROOT}/_reports.`)
    // La cartella non c'era: si crea, perché il file manager non apre ciò che manca.
    expect(world.files.has(`${ROOT}/_reports/.keep`)).toBe(true)
    expect(await text('folder export')).toBe(`Cartella aperta: ${ROOT}/_exports.`)
    expect(await text('cartella dati --lang en')).toBe(`Folder opened: ${ROOT}.`)
    expect(await text('cartella boh')).toContain('Cartella sconosciuta: boh')
    expect(world.runs.filter(argv => argv[0] === 'open').map(argv => argv[1])).toEqual([`${ROOT}/_reports`, `${ROOT}/_exports`, ROOT])
  })

  test('--cartella su report ed export apre la cartella del file, anche con --no-apri e --out', IT, async ($, on) => {
    const world = worldOf(on, { os: 'Linux' })
    const clock = mock.clock(on)

    await workedSession($, on, world, clock)

    const report = ((await $.command.run(command('kpi', 'report --no-apri --cartella'))) as { text: string }).text

    expect(world.runs.filter(argv => argv[0] === 'xdg-open')).toEqual([['xdg-open', `${ROOT}/_reports`]])
    expect(report).toContain(`Cartella aperta: ${ROOT}/_reports.`)

    await $.command.run(command('kpi', 'esporta csv --out ~/kpi/mio.csv --folder'))

    expect(world.runs.filter(argv => argv[0] === 'xdg-open').at(-1)).toEqual(['xdg-open', `${HOME}/kpi`])
  })

  test('WSL: report e cartella li apre Windows (explorer.exe), senza copia in Scaricati', IT, async ($, on) => {
    const world = worldOf(on, { os: 'Linux', files: { '/proc/version': WSL_KERNEL } })
    const clock = mock.clock(on)

    await workedSession($, on, world, clock)

    const report = ((await $.command.run(command('kpi', 'report --cartella'))) as { text: string }).text
    const explorer = world.runs.filter(argv => argv[0] === 'explorer.exe').map(argv => argv[1])

    expect(world.runs.some(argv => argv[0] === 'xdg-user-dir' || argv[0] === 'xdg-open')).toBe(false)
    expect(explorer[0]?.startsWith(wslPathOf(`${ROOT}/_reports/report-`))).toBe(true)
    expect(explorer[1]).toBe(wslPathOf(`${ROOT}/_reports`))
    // explorer.exe esce con 1 anche quando riesce: conta che sia partito.
    expect(report).toContain('Aperto nel browser.')
    expect(report).toContain('Cartella aperta:')
  })

  test('su Windows la cartella si apre con start', IT, async ($, on) => {
    const world = worldOf(on, { os: 'MINGW64_NT-10.0' })
    const clock = mock.clock(on)

    await workedSession($, on, world, clock)
    await $.command.run(command('kpi', 'cartella'))

    expect(world.runs.at(-1)).toEqual(['cmd', '/c', 'start', '', `${ROOT}/_reports`])
  })

  test('il report porta le cartelle, il loro URL e il comando per aprirle; il pannello ha il pulsante Cartella', IT, async ($, on) => {
    const world = worldOf(on)
    const clock = mock.clock(on)

    on('ui.render', () => ({ type: 'Text', children: [''] }))
    await workedSession($, on, world, clock)
    await $.command.run(command('kpi', 'report --no-apri'))

    const html = world.files.get(`${ROOT}/_reports/latest.html`) ?? ''
    const data = JSON.parse(/<script type="application\/json" id="kpi-data">(.*?)<\/script>/s.exec(html)?.[1] ?? '{}') as {
      meta: { folders: { report: { path: string; url: string; command: { it: string; en: string } }; export: { path: string } } }
    }

    expect(data.meta.folders.report).toEqual({ path: `${ROOT}/_reports`, url: `file://${ROOT}/_reports`, command: { it: '/kpi cartella report', en: '/kpi folder report' } })
    expect(data.meta.folders.export.path).toBe(`${ROOT}/_exports`)

    await $.ui.render(PANE)
    await $.ui.press({ plugin: PLUGIN, key: 'kpi-folder' })
    await clock.advance(100)

    expect(world.runs.filter(argv => argv[0] === 'open').at(-1)).toEqual(['open', `${ROOT}/_reports`])
    expect(world.logs.at(-1)).toBe(`Cartella aperta: ${ROOT}/_reports.`)
  })
})

describe('app desktop (scheda Code)', () => {
  const DESKTOP = { ...SESSION, surface: 'desktop' as const }

  test('la sessione è di tipo desktop; barra, pannello e /kpi si disegnano anche lì', IT, async ($, on) => {
    const world = worldOf(on)
    const clock = mock.clock(on)
    const surfaces = ['terminal', 'desktop'] as const

    on('ui.render', ($$, e) => ({ type: 'Text', children: [e.component === 'CommandOutput' ? (e.props as { text: string }).text : ''] }))
    on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false }, text: 'ok' }) as never)
    await $.session.start(DESKTOP)
    await $.turn.start({ text: 'x', turnId: 't1' })
    await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
    await $.turn.complete({ answer: '', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' } as never)
    world.session.usage = usageOf(0.5, 20)
    await $.session.measure({ context: { tokens: 40_000, window: 200_000, percent: 20 }, rateLimits: [], cost: { usd: 0.5 }, changed: ['cost', 'context'] })
    await clock.advance(6000)

    expect(world.json<KpiSessionFile>(world.under(PROJECT_DIR).find(path => path.endsWith('session.json')) as string).kind).toBe('desktop')

    for (const surface of surfaces) {
      const band = textOf(await $.ui.render({ ...BAND, surface }))
      const pane = await $.ui.render({ ...PANE, surface })

      expect(band).toContain('$0,50')
      expect(textOf(pane)).toContain(' Costo ')
      expect(textOf(pane)).toContain('[Cartella]')
      expect(await accepted($, { ...BAND, surface, plugin: PLUGIN })).toBe(surface)
      expect(await accepted($, { ...PANE, surface, plugin: PLUGIN })).toBe(surface)
      // Il Raster c'è solo sul terminale: sul desktop la sparkline è testo.
      expect(elementsOf(pane, 'Raster').length > 0).toBe(surface === 'terminal')
    }

    const result = (await $.command.run(command('kpi'))) as { text: string }

    expect(textOf(await $.ui.render({ ...commandOutput(result.text), surface: 'desktop' }))).toContain('## KPI di Claude Code')
  })
})
