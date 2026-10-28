/** I report testuali (Markdown) di /kpi, nella lingua di `L`. */

import { meanOf, percentileOf, topOf, totalOf, type Stat } from '../analysis/stats'
import { cacheHit, totalTokens, type DayAgg, type KpiDetails } from '../analysis/summary-types'
import { displayStatus, type KpiSessionFile } from '../core/session-file'
import type { I18n, MsgKey } from '../i18n'
import { pairs, section, table } from '../format/markdown'
import { groupBy, rangeOf, type GroupKey, type Totals } from '../query/aggregate'
import { NO_CATEGORY_GROUP, type Categories } from '../query/category'
import type { KpiFilter } from '../query/filters'
import type { SessionRow } from '../query/load'


/** Le voci più frequenti di una mappa; le chiavi sono codici salvati, quindi si traducono. */
const counts = (L: I18n, map: Record<string, number>, limit = 12): string => {
  const top = topOf(map, limit)

  return top.length === 0 ? '–' : top.map(([key, value]) => `${L.code(key)} ${L.int(value)}`).join(' · ')
}

/** Il nome di una finestra di rate limit: `5h`, `7g` / `7d`, o com'è. */
const rateName = (L: I18n, kind: string, long = false): string =>
  kind === 'five_hour' ? (long ? L.t('5 ore') : '5h') : kind === 'seven_day' ? (long ? L.t('7 giorni') : L.t('7g')) : kind

/** Le righe chiave di un periodo (per il riepilogo a colonne). */
function periodColumn(L: I18n, range: DayAgg, sessions: number): string[] {
  return [
    L.int(sessions),
    L.int(range.turns),
    L.dur(range.active),
    L.usd(range.cost),
    L.compact(range.in + range.out + range.cr + range.cw),
    `${L.compact(range.in + range.cr + range.cw)} / ${L.compact(range.out)}`,
    L.ratio(range.cr, range.in + range.cr + range.cw),
    `${L.int(range.tools)}${range.toolErr > 0 ? ` (${L.int(range.toolErr)} err)` : ''}`,
    `+${L.int(range.add)} −${L.int(range.del)}`,
    L.int(range.commits),
    L.int(range.prompts),
  ]
}

const PERIOD_LABELS: MsgKey[] = ['Sessioni', 'Turni', 'Tempo attivo', 'Costo', 'Token totali', 'Input / output', 'Cache hit', 'Tool call', 'Righe', 'Commit', 'Prompt']

/** Il riepilogo di `/kpi`: sessione corrente, oggi, ultimi 7 giorni; `notice` è l'avviso sugli aggiornamenti, in testa. */
export function summaryReport(L: I18n, current: KpiSessionFile | null, today: { range: DayAgg; sessions: number }, week: { range: DayAgg; sessions: number }, now: number, notice?: string): string {
  const parts: string[] = [`## ${L.t('KPI di Claude Code')}`, ...(notice !== undefined ? [`> ${notice}`] : [])]
  const columns: string[][] = []
  const headers = ['KPI']

  if (current !== null) {
    const s = current.summary
    const range: DayAgg = {
      in: s.tokens.in,
      out: s.tokens.out,
      cr: s.tokens.cr,
      cw: s.tokens.cw,
      cost: s.cost.usd,
      turns: s.turns.main,
      active: s.activeMs,
      prompts: s.prompts.n,
      req: s.requests.n,
      tools: s.tools.n,
      toolErr: s.errors.toolErr,
      add: s.files.add,
      del: s.files.del,
      commits: s.git.commits,
    }

    headers.push(L.t('Sessione corrente'))
    columns.push(periodColumn(L, range, 1))
  }

  headers.push(L.t('Oggi'), L.t('Ultimi 7 giorni'))
  columns.push(periodColumn(L, today.range, today.sessions), periodColumn(L, week.range, week.sessions))

  const rows = PERIOD_LABELS.map((label, index) => [L.t(label), ...columns.map(column => column[index] ?? '–')])

  parts.push(table(L, headers, rows, columns.map((_, index) => index + 1)))

  if (current !== null) {
    const s = current.summary
    const rate = Object.entries(s.rate)
      .map(([kind, value]) => `${rateName(L, kind)} ${L.pct100(value.last)} (max ${L.pct100(value.max)})`)
      .join(' · ')

    parts.push(
      [
        L.t('**Sessione** {id} · {project} · {kind} · avviata {start} · durata {duration}', {
          id: current.sessionId.slice(0, 8),
          project: current.project.name,
          kind: L.code(current.kind),
          start: L.dateTime(current.createdAt),
          duration: L.dur(now - current.createdAt),
        }),
        `${L.t('Contesto {ctx} (max {max}) · compattazioni {n}', { ctx: s.context.lastPct > 0 ? L.pct100(s.context.lastPct) : '–', max: L.pct100(s.context.maxPct), n: L.int(s.compactions.n) })}${rate !== '' ? ` · rate limit ${rate}` : ''}`,
      ].join('  \n'),
    )
  }

  parts.push(`_${L.t('`/kpi aiuto` per tutti i comandi · `/kpi statistiche --da 7d` per il dettaglio completo.')}_`)

  return parts.join('\n\n')
}

/** Il report completo di un insieme di sessioni: tutte le categorie di KPI. */
export function statsReport(L: I18n, totals: Totals, rows: readonly SessionRow[], filter: KpiFilter, description: string, by: GroupKey | null, categories?: Categories | null): string {
  const s = totals.summary
  const r = totals.range
  const turns = r.turns
  const tokensAll = totalTokens(s.tokens)
  const { int, fixed, dur, usd, compact, pct, pct100, ratio } = L
  const out: string[] = [`## KPI · ${description}`]
  const p50p90 = (stat: Stat): string => (stat.n === 0 ? '–' : `${dur(percentileOf(stat, 0.5))} · ${dur(percentileOf(stat, 0.9))}`)

  out.push(
    section(
      L.t('Panoramica'),
      pairs(L, [
        [L.t('Sessioni'), `${int(totals.sessions)} (${counts(L, totals.byKind)})`],
        [L.t('Progetti'), int(totals.projects)],
        [L.t('Giorni attivi'), int(totals.days)],
        [L.t('Turni (principali / subagent)'), `${int(turns)} / ${int(s.turns.sub)}`],
        [L.t('Prompt'), int(r.prompts)],
        [L.t('Tempo attivo del modello'), dur(r.active)],
        [L.t('Durata media turno · p50 · p90'), `${dur(meanOf(s.turns.dur))} · ${p50p90(s.turns.dur)}`],
        [L.t('Segmenti di processo (riprese, reload)'), int(s.segments)],
      ]),
    ),
  )

  out.push(
    section(
      L.t('Costo e token'),
      pairs(L, [
        [L.t('Costo'), usd(r.cost)],
        [L.t('Costo fuori dai turni (subagent in background, servizi, uscita)'), `${usd(s.cost.outsideTurns ?? 0)} (${ratio(s.cost.outsideTurns ?? 0, s.cost.usd)})`],
        [L.t('Costo per turno · per sessione'), `${usd(turns === 0 ? 0 : r.cost / turns)} · ${usd(totals.sessions === 0 ? 0 : r.cost / totals.sessions)}`],
        [L.t('Costo per commit · per 100 righe'), `${r.commits === 0 ? '–' : usd(r.cost / r.commits)} · ${r.add + r.del === 0 ? '–' : usd((r.cost * 100) / (r.add + r.del))}`],
        [L.t('Token totali'), compact(r.in + r.out + r.cr + r.cw)],
        [L.t('Input non in cache · output'), `${compact(r.in)} · ${compact(r.out)}`],
        [L.t('Cache letta · scritta'), `${compact(r.cr)} · ${compact(r.cw)}`],
        [L.t('Cache hit'), ratio(r.cr, r.in + r.cr + r.cw)],
        [L.t('Token dei subagent'), `${compact(totalTokens(s.tokensSub))} (${ratio(totalTokens(s.tokensSub), tokensAll)})`],
        [L.t('Richieste API'), int(s.requests.n)],
      ]) +
        '\n\n' +
        table(
          L,
          [L.t('Modello'), L.t('Richieste'), 'Input', 'Output', L.t('Cache letta'), L.t('Cache scritta'), 'Hit'],
          Object.entries(s.byModel)
            .sort((a, b) => totalTokens(b[1]) - totalTokens(a[1]))
            .map(([model, agg]) => [model, int(agg.req), compact(agg.in), compact(agg.out), compact(agg.cr), compact(agg.cw), pct(cacheHit(agg))]),
          [1, 2, 3, 4, 5, 6],
        ) +
        `\n\n_${L.t('Il costo è quello calcolato da Claude Code (comprende le sue chiamate di servizio); non esiste un costo per modello.')}_`,
    ),
  )

  out.push(
    section(
      L.t('Richieste e latenza'),
      pairs(L, [
        [L.t('Richieste per turno (media)'), fixed(meanOf(s.turns.steps), 1)],
        [L.t('Tempo al primo token p50 · p90'), p50p90(s.requests.ttft)],
        [L.t('Latenza richiesta p50 · p90'), p50p90(s.requests.latency)],
        [L.t('Velocità di output (token/s, media)'), s.requests.tps.n === 0 ? '–' : fixed(meanOf(s.requests.tps), 1)],
        [L.t('Motivi di stop'), counts(L, s.requests.byStop)],
        [L.t('Fallback di modello'), int(s.requests.fallback)],
        ['Effort', counts(L, s.effort)],
        [L.t('Cambi di modello'), int(s.models.switches)],
        [L.t('Tool lato server'), counts(L, Object.fromEntries(Object.entries(s.requests.server).map(([name, agg]) => [name, agg.n])))],
      ]),
    ),
  )

  out.push(
    section(
      L.t('Contesto, compattazioni e rate limit'),
      pairs(L, [
        [L.t('Contesto massimo'), `${pct100(s.context.maxPct)}${s.context.window > 0 ? ` ${L.t('di {window}', { window: compact(s.context.window) })}` : ''}`],
        [L.t('Contesto medio a fine turno'), s.context.pctEnd.n === 0 ? '–' : pct100(meanOf(s.context.pctEnd))],
        [L.t('Compattazioni'), `${int(s.compactions.n)} (${counts(L, s.compactions.byTrigger)})`],
        [L.t('Riduzione media'), s.compactions.before > 0 ? pct(1 - s.compactions.after / s.compactions.before) : '–'],
        [L.t('Turni per compattazione'), s.compactions.n === 0 ? '–' : fixed(turns / s.compactions.n, 1)],
        ['/clear', int(s.commands.clear ?? 0)],
        ...Object.entries(s.rate).map(([kind, value]) => [`Rate limit ${rateName(L, kind, true)} (max)`, pct100(value.max)] as [string, string]),
        [L.t('Blocchi per rate limit'), int(s.errors.api.rate_limit ?? 0)],
      ]),
    ),
  )

  out.push(
    section(
      'Prompt',
      pairs(L, [
        [L.t('Prompt per origine'), counts(L, s.prompts.byOrigin)],
        [L.t('Prompt per sorgente'), counts(L, s.prompts.bySource)],
        [L.t('Accodati durante un turno'), int(s.prompts.queued)],
        [L.t('Lunghezza media (caratteri · parole)'), `${int(meanOf(s.prompts.chars))} · ${int(meanOf(s.prompts.words))}`],
        [L.t('Lunghezza massima (caratteri)'), int(s.prompts.chars.max)],
        [L.t('Allegati'), counts(L, s.prompts.att)],
        [L.t('Menzioni @'), `${int(s.mentions.n)} (${counts(L, s.mentions.byType)})`],
        [L.t('Tempo di risposta utente p50 · p90'), p50p90(s.prompts.think)],
        [L.t('Esiti dei turni'), counts(L, s.turns.byReason)],
      ]),
    ),
  )

  const tools = Object.entries(s.tools.byTool).sort((a, b) => b[1].n - a[1].n)

  out.push(
    section(
      L.t('Tool ({n} chiamate)', { n: int(s.tools.n) }),
      table(
        L,
        ['Tool', L.t('Chiamate'), L.t('Errori'), L.t('Negate'), L.t('Rifiutate'), L.t('Interrotte'), L.t('Durata media'), 'p90', 'Read-only', 'Subagent'],
        tools.slice(0, 20).map(([name, agg]) => [
          name,
          int(agg.n),
          `${int(agg.err)} (${ratio(agg.err, agg.n)})`,
          int(agg.deny),
          int(agg.rej ?? 0),
          int(agg.intr),
          agg.ms.n === 0 ? '–' : dur(meanOf(agg.ms)),
          agg.ms.n === 0 ? '–' : dur(percentileOf(agg.ms, 0.9)),
          ratio(agg.ro, agg.n),
          int(agg.sub),
        ]),
        [1, 2, 3, 4, 5, 6, 7, 8, 9],
      ) +
        `\n\n${L.t('Parallelismo medio {mean} tool per batch · in background {bg} · MCP {mcp}', {
          mean: fixed(meanOf(s.tools.batches), 1),
          bg: int(s.tools.bg),
          mcp: counts(L, Object.fromEntries(Object.entries(s.tools.mcp).map(([server, agg]) => [server, agg.n]))),
        })}`,
    ),
  )

  out.push(
    section(
      L.t('Bash ({n} comandi)', { n: int(s.bash.n) }),
      table(
        L,
        [L.t('Categoria'), L.t('Comandi'), 'Ok', L.t('Errori'), L.t('Interrotti'), 'Timeout', 'Background'],
        Object.entries(s.bash.byCat)
          .sort((a, b) => b[1].n - a[1].n)
          .map(([cat, agg]) => [L.code(cat), int(agg.n), int(agg.ok), int(agg.err), int(agg.intr), int(agg.to), int(agg.bg)]),
        [1, 2, 3, 4, 5, 6],
      ) +
        '\n\n' +
        table(
          L,
          [L.t('Comando'), L.t('Volte'), 'Ok', L.t('Errori')],
          Object.entries(s.bash.byCmd)
            .sort((a, b) => b[1].n - a[1].n)
            .slice(0, 15)
            .map(([cmd, agg]) => [cmd, int(agg.n), int(agg.ok), int(agg.err)]),
          [1, 2, 3],
        ) +
        `\n\n${L.t('Test: {n} esecuzioni, {ok} superate, {err} fallite (pass rate {rate}) · Build: {builds}, {bok} ok, {bko} ko · comandi con pipe {pipes} · sandbox disattivata {sbx}', {
          n: int(s.tests.n),
          ok: int(s.tests.ok),
          err: int(s.tests.err),
          rate: ratio(s.tests.ok, s.tests.ok + s.tests.err),
          builds: int(s.builds.n),
          bok: int(s.builds.ok),
          bko: int(s.builds.err),
          pipes: int(s.bash.pipes),
          sbx: int(s.bash.sandboxOff),
        })}`,
    ),
  )

  out.push(
    section(
      L.t('File e codice'),
      pairs(L, [
        [L.t('Righe aggiunte · rimosse · nette'), `+${int(r.add)} · −${int(r.del)} · ${int(r.add - r.del)}`],
        [L.t('File creati · modificati (unici) · letti (unici)'), `${int(s.files.created)} · ${int(s.files.uniqueModified)} · ${int(s.files.uniqueRead)}`],
        [L.t('Modifiche (Edit) · scritture (Write)'), `${int(s.files.edited)} · ${int(s.files.written)}`],
        [L.t('Righe lette'), compact(s.files.linesRead)],
        [L.t('Modifiche ritoccate dall\'utente'), int(s.files.userModified)],
        [L.t('File fuori dal progetto'), int(s.files.outside)],
        [L.t('File modificati 3+ volte (churn)'), int(s.files.churn)],
        [L.t('Per classe'), Object.entries(s.files.byClass).map(([cls, agg]) => `${L.code(cls)} +${int(agg.add)} −${int(agg.del)}`).join(' · ') || '–'],
        [L.t('Documenti creati · rigenerati'), [s.docs?.created, s.docs?.regen].map(map => `${int(totalOf(map))}${totalOf(map) > 0 ? ` (${Object.entries(map ?? {}).map(([ext, n]) => `${ext} ${int(n)}`).join(', ')})` : ''}`).join(' · ')],
      ]) +
        '\n\n' +
        table(
          L,
          [L.t('Estensione'), L.t('Modifiche'), L.t('Righe +'), L.t('Righe −')],
          Object.entries(s.files.byExt)
            .sort((a, b) => b[1].add + b[1].del - (a[1].add + a[1].del))
            .slice(0, 12)
            .map(([ext, agg]) => [L.code(ext), int(agg.n), int(agg.add), int(agg.del)]),
          [1, 2, 3],
        ),
    ),
  )

  out.push(
    section(
      'Git',
      pairs(L, [
        ['Commit', `${int(s.git.commits)} (${counts(L, s.git.byKind)})`],
        ['Push', int(s.git.pushes)],
        ['Merge / rebase', counts(L, s.git.branchOps)],
        ['Pull request', counts(L, s.git.prs)],
        ['Branch', counts(L, s.git.branches, 8)],
        [L.t('Righe per commit'), s.git.commits === 0 ? '–' : int((r.add + r.del) / s.git.commits)],
      ]),
    ),
  )

  out.push(
    section(
      L.t('Permessi'),
      pairs(L, [
        [L.t('Decisioni'), counts(L, s.perms.byDecision)],
        [L.t('Chi ha deciso'), counts(L, s.perms.byWho)],
        [L.t('Dialoghi di permesso mostrati'), int(s.perms.dialogs)],
        [L.t('Negate da regola, modalità o hook'), int(s.perms.toolDenied)],
        [L.t('Rifiutate dall\'utente'), int(s.perms.rejected ?? 0)],
        [L.t('Negate dal classificatore'), int(s.perms.denied)],
      ]),
    ),
  )

  out.push(
    section(
      L.t('Subagent e workflow ({n} avviati)', { n: int(s.agents.n) }),
      table(
        L,
        [L.t('Tipo'), L.t('Avviati'), L.t('In background'), L.t('Durata totale'), 'Token', 'Tool', L.t('Errori')],
        Object.entries(s.agents.byType)
          .sort((a, b) => b[1].n - a[1].n)
          .map(([type, agg]) => [L.code(type), int(agg.n), int(agg.bg), dur(agg.ms), compact(agg.tok), int(agg.tools), int(agg.err)]),
        [1, 2, 3, 4, 5, 6],
      ) + `\n\n${L.t('Workflow {wf} · massimo concorrenti {max} · modelli {models}', { wf: int(s.agents.workflows), max: int(s.agents.maxConcurrent), models: counts(L, s.agents.byModel) })}`,
    ),
  )

  out.push(
    section(
      L.t('Skill, comandi e web'),
      pairs(L, [
        ['Skill', counts(L, Object.fromEntries(Object.entries(s.skills).map(([name, agg]) => [name, agg.n])))],
        [L.t('Comandi slash'), counts(L, s.commands)],
        [L.t('Espansioni'), counts(L, s.expansions)],
        [L.t('WebFetch · domini'), `${int(s.web.fetch)} · ${counts(L, s.web.domains, 8)}`],
        ['WebSearch', int(s.web.search)],
        [L.t('File di istruzioni caricati'), counts(L, s.instr)],
        [L.t('Todo (ultima lista)'), s.todos.writes === 0 ? '–' : L.t('{done}/{total} completati', { done: int(s.todos.done), total: int(s.todos.total) })],
        [L.t('Task creati · completati'), `${int(s.tasks.created)} · ${int(s.tasks.completed)}`],
      ]),
    ),
  )

  out.push(
    section(
      L.t('Errori e interruzioni'),
      pairs(L, [
        [L.t('Errori API'), counts(L, s.errors.api)],
        [L.t('Turni in errore · rifiutati'), `${int(s.errors.turnErr)} · ${int(s.errors.refusals)}`],
        [L.t('Errori dei tool'), `${int(s.errors.toolErr)} (${ratio(s.errors.toolErr, s.tools.n)})`],
        [L.t('Interruzioni'), int(s.errors.interrupts)],
        [L.t('Stop per max_tokens'), int(s.errors.maxTokens)],
        [L.t('Notifiche'), counts(L, s.notif)],
      ]),
    ),
  )

  out.push(section(L.t('Attività per ora'), heatmap(L, s.byHour)))

  if (by !== null) {
    const name = by === 'categoria' && categories !== undefined && categories !== null ? categories.column : L.t(GROUP_NAMES[by])

    out.push(section(L.t('Per {group}', { group: name }), groupTable(L, groupBy(rows, filter, by, categories), by, by === 'categoria' ? name : undefined)))
  }

  return out.join('\n\n')
}

/** Il nome di un raggruppamento nel titolo della sezione (`Per giorno`). */
const GROUP_NAMES: Record<GroupKey, MsgKey> = {
  giorno: 'giorno',
  settimana: 'settimana',
  mese: 'mese',
  progetto: 'progetto',
  modello: 'modello',
  branch: 'branch',
  tipo: 'tipo',
  sessione: 'sessione',
  categoria: 'categoria',
}

/** Il titolo della colonna di un raggruppamento. */
const GROUP_TITLES: Record<GroupKey, MsgKey> = {
  giorno: 'Giorno',
  settimana: 'Settimana (dal)',
  mese: 'Mese',
  progetto: 'Progetto',
  modello: 'Modello',
  branch: 'Branch',
  tipo: 'Tipo',
  sessione: 'Sessione',
  categoria: 'Categoria',
}

/** Tabella ora × giorno della settimana in forma compatta. */
export function heatmap(L: I18n, byHour: readonly number[]): string {
  const max = Math.max(0, ...byHour)

  if (max === 0) {
    return `_${L.t('nessun turno')}_`
  }

  const shades = [' ', '░', '▒', '▓', '█']
  const lines = L.weekdays.map((day, weekday) => {
    const cells = Array.from({ length: 24 }, (_, hour) => {
      const value = byHour[weekday * 24 + hour] ?? 0

      return value === 0 ? '·' : (shades[Math.min(4, Math.ceil((value / max) * 4))] as string)
    })

    return `${day} ${cells.join('')}`
  })

  return ['```', `    ${'0'.padEnd(6)}${'6'.padEnd(6)}${'12'.padEnd(6)}18`, ...lines, '```'].join('\n')
}

/** La tabella di un raggruppamento; `title` sostituisce il titolo della prima colonna (il nome della colonna delle categorie). */
export function groupTable(L: I18n, groups: ReturnType<typeof groupBy>, by: GroupKey, title?: string): string {
  const { int, compact, dur, usd, pct } = L

  if (by === 'modello') {
    return table(
      L,
      [L.t('Modello'), L.t('Sessioni'), L.t('Richieste'), 'Input', 'Output', L.t('Cache letta'), 'Hit'],
      groups.map(group => [group.key, int(group.sessions), int(group.agg.req), compact(group.agg.in), compact(group.agg.out), compact(group.agg.cr), pct(cacheHit(group.agg))]),
      [1, 2, 3, 4, 5, 6],
    )
  }

  return table(
    L,
    [title ?? L.t(GROUP_TITLES[by]), L.t('Sessioni'), L.t('Turni'), L.t('Attivo'), L.t('Costo'), 'Token', 'Tool', L.t('Righe'), 'Commit'],
    groups.map(group => [
      by === 'giorno' || by === 'settimana' ? L.dayLabel(group.key) : by === 'tipo' || (by === 'categoria' && group.key === NO_CATEGORY_GROUP) ? L.code(group.key) : group.key,
      int(group.sessions),
      int(group.agg.turns),
      dur(group.agg.active),
      usd(group.agg.cost),
      compact(group.agg.in + group.agg.out + group.agg.cr + group.agg.cw),
      int(group.agg.tools),
      `+${int(group.agg.add)} −${int(group.agg.del)}`,
      int(group.agg.commits),
    ]),
    [1, 2, 3, 4, 5, 6, 8],
  )
}

/** L'elenco delle sessioni, dalla più recente. */
export function sessionsReport(L: I18n, rows: readonly SessionRow[], filter: KpiFilter, limit: number, now: number, description: string): string {
  const recent = [...rows].sort((a, b) => b.file.createdAt - a.file.createdAt).slice(0, limit)
  const { int, compact, dur, usd } = L

  return [
    `## ${L.t('Sessioni')} · ${description}`,
    `${L.count(rows.length, 'sessione', 'sessioni')}${rows.length > limit ? L.t(', le {n} più recenti (`--limite` per vederne di più)', { n: int(limit) }) : ''}.`,
    table(
      L,
      [L.t('Inizio'), L.t('Progetto'), 'ID', L.t('Tipo'), L.t('Durata'), L.t('Turni'), L.t('Costo'), 'Token', L.t('Righe'), 'Commit', 'Branch', L.t('Stato')],
      recent.map(row => {
        const s = row.file.summary
        const range = rangeOf(row, filter)

        return [
          L.dateTime(row.file.createdAt),
          L.cut(row.projectName, 28),
          row.file.sessionId.slice(0, 8),
          L.code(row.file.kind),
          dur(Math.max(0, s.lastAt - row.file.createdAt)),
          int(range.turns),
          usd(range.cost),
          compact(range.in + range.out + range.cr + range.cw),
          `+${int(range.add)} −${int(range.del)}`,
          int(range.commits),
          L.cut(row.file.meta.branches.at(-1) ?? '–', 20),
          L.code(displayStatus(row.file, now)),
        ]
      }),
      [4, 5, 6, 7, 9],
    ),
  ].join('\n\n')
}

/** I totali per progetto. */
export function projectsReport(L: I18n, rows: readonly SessionRow[], filter: KpiFilter, description: string): string {
  const byProject = new Map<string, SessionRow[]>()

  for (const row of rows) {
    byProject.set(row.projectPath, [...(byProject.get(row.projectPath) ?? []), row])
  }

  const lines = [...byProject.entries()]
    .map(([path, list]) => {
      const range = list.reduce(
        (acc, row) => {
          const one = rangeOf(row, filter)

          acc.cost += one.cost
          acc.turns += one.turns
          acc.active += one.active
          acc.tokens += one.in + one.out + one.cr + one.cw
          acc.add += one.add
          acc.del += one.del
          acc.commits += one.commits

          return acc
        },
        { cost: 0, turns: 0, active: 0, tokens: 0, add: 0, del: 0, commits: 0 },
      )
      const last = Math.max(...list.map(row => row.file.summary.lastAt || row.file.createdAt))

      return { path, name: list[0]?.projectName ?? path, sessions: list.length, last, ...range }
    })
    .sort((a, b) => b.cost - a.cost)
  const { int, compact, dur, usd } = L

  return [
    `## ${L.t('Progetti')} · ${description}`,
    table(
      L,
      [L.t('Progetto'), L.t('Percorso'), L.t('Sessioni'), L.t('Ultima attività'), L.t('Turni'), L.t('Attivo'), L.t('Costo'), 'Token', L.t('Righe'), 'Commit'],
      lines.map(line => [line.name, L.cut(line.path, 60), int(line.sessions), L.date(line.last), int(line.turns), dur(line.active), usd(line.cost), compact(line.tokens), `+${int(line.add)} −${int(line.del)}`, int(line.commits)]),
      [2, 4, 5, 6, 7, 9],
    ),
  ].join('\n\n')
}

/**
 * Il dettaglio di una sessione: statistiche complete e dettagli. `ledgerUsd`,
 * per la sessione in corso, è il costo come lo totalizza Claude Code (/cost).
 */
export function sessionReport(L: I18n, row: SessionRow, details: KpiDetails | null, totals: Totals, filter: KpiFilter, now: number, ledgerUsd?: number, categories?: Categories | null): string {
  const file = row.file
  const { int, compact, dur, usd, dateTime } = L
  const head = [
    `## ${L.t('Sessione')} ${file.sessionId}`,
    pairs(L, [
      [L.t('Progetto'), `${row.projectName} (${row.projectPath})`],
      [L.t('Cartella dati'), row.dir],
      [L.t('Tipo · stato'), `${L.code(file.kind)} · ${L.code(displayStatus(file, now))}`],
      ...(ledgerUsd === undefined ? [] : [[L.t('Costo KPI · secondo Claude Code (/cost)'), `${usd(file.summary.cost.usd)} · ${usd(ledgerUsd)}`] as [string, string]]),
      [L.t('Inizio · ultima attività'), `${dateTime(file.createdAt)} · ${dateTime(file.summary.lastAt)}`],
      [L.t('Segmenti'), file.segments.map(segment => `${L.code(segment.source)} ${dateTime(segment.startedAt)}${segment.endReason !== undefined ? ` → ${L.code(segment.endReason)}` : ''}`).join(' · ')],
      [L.t('Versioni · modelli'), `${file.meta.versions.join(', ') || '–'} · ${file.meta.models.join(', ') || '–'}`],
      ['Branch · repo', `${file.meta.branches.join(', ') || '–'} · ${file.meta.repo?.name ?? file.meta.repo?.remote ?? '–'}`],
      ...(categories === undefined || categories === null ? [] : [[categories.column, categories.of(file) ?? L.code(NO_CATEGORY_GROUP)] as [string, string]]),
      [L.t('Sessione precedente · successiva'), `${file.links.previousSessionId?.slice(0, 8) ?? '–'} · ${file.links.nextSessionId?.slice(0, 8) ?? '–'}`],
    ]),
  ]

  const parts = [...head, statsReport(L, totals, [row], filter, L.t('sessione'), null)]

  if (details !== null) {
    const files = Object.entries(details.files)
      .filter(([, agg]) => agg.add + agg.del + agg.e + agg.w > 0)
      .sort((a, b) => b[1].add + b[1].del - (a[1].add + a[1].del))
      .slice(0, 20)

    parts.push(
      section(
        L.t('File modificati'),
        table(
          L,
          ['File', L.t('Modifiche'), L.t('Righe +'), L.t('Righe −'), L.t('Classe')],
          files.map(([path, agg]) => [L.cut(path, 90), int(agg.e + agg.w), int(agg.add), int(agg.del), L.code(agg.cls)]),
          [1, 2, 3],
        ),
      ),
    )

    if (details.commits.length > 0) {
      parts.push(section('Commit', table(L, [L.t('Quando'), 'SHA', L.t('Tipo'), 'Branch'], details.commits.map(commit => [dateTime(commit.t), commit.sha, commit.kind, commit.branch ?? '–']))))
    }

    if (details.prs.length > 0) {
      parts.push(section('Pull request', table(L, [L.t('Quando'), 'PR', L.t('Azione'), 'URL'], details.prs.map(pr => [dateTime(pr.t), `#${pr.n}`, pr.action, pr.url ?? '–']))))
    }

    const agents = Object.values(details.agents)

    if (agents.length > 0) {
      parts.push(
        section(
          'Subagent',
          table(
            L,
            [L.t('Avvio'), L.t('Tipo'), L.t('Modello'), L.t('Durata'), 'Token', 'Tool', L.t('Esito')],
            agents.slice(-30).map(agent => [dateTime(agent.start), L.code(agent.type), agent.model ?? '–', agent.ms !== undefined ? dur(agent.ms) : '–', agent.tok !== undefined ? compact(agent.tok) : '–', int(agent.tools ?? 0), agent.st ?? '–']),
            [3, 4, 5],
          ),
        ),
      )
    }

    if (details.compactions.length > 0) {
      parts.push(
        section(
          L.t('Compattazioni'),
          table(L, [L.t('Quando'), 'Trigger', L.t('Token prima'), L.t('Token dopo')], details.compactions.map(one => [dateTime(one.t), one.tr, one.b !== undefined ? compact(one.b) : '–', one.af !== undefined ? compact(one.af) : '–']), [2, 3]),
        ),
      )
    }

    if (details.switches.length > 0) {
      parts.push(section(L.t('Cambi di modello'), table(L, [L.t('Quando'), L.t('Da'), L.t('A'), L.t('Origine')], details.switches.map(one => [dateTime(one.t), one.from, one.to, one.src]))))
    }
  }

  return parts.join('\n\n')
}
