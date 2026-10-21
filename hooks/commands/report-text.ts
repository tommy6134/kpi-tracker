/** I report testuali (Markdown) di /kpi. */

import { meanOf, percentileOf, topOf } from '../analysis/stats'
import { cacheHit, totalTokens, type DayAgg, type KpiDetails, type KpiSummary } from '../analysis/summary-types'
import { displayStatus, type KpiSessionFile } from '../core/session-file'
import { compact, cut, date, dateTime, dayLabel, dur, fixed, int, pct, pct100, usd, WEEKDAYS } from '../format/fmt'
import { pairs, section, table } from '../format/markdown'
import { groupBy, rangeOf, type GroupKey, type Totals } from '../query/aggregate'
import type { KpiFilter } from '../query/filters'
import type { SessionRow } from '../query/load'

const sumValues = (map: Record<string, number>): number => Object.values(map).reduce((a, b) => a + b, 0)

const ratio = (part: number, whole: number): string => (whole === 0 ? '–' : pct(part / whole))

const counts = (map: Record<string, number>, limit = 12): string => {
  const top = topOf(map, limit)

  return top.length === 0 ? '–' : top.map(([key, value]) => `${key} ${int(value)}`).join(' · ')
}

/** Le righe chiave di un periodo (per il riepilogo a colonne). */
function periodColumn(range: DayAgg, sessions: number): string[] {
  return [
    int(sessions),
    int(range.turns),
    dur(range.active),
    usd(range.cost),
    compact(range.in + range.out + range.cr + range.cw),
    `${compact(range.in + range.cr + range.cw)} / ${compact(range.out)}`,
    ratio(range.cr, range.in + range.cr + range.cw),
    `${int(range.tools)}${range.toolErr > 0 ? ` (${int(range.toolErr)} err)` : ''}`,
    `+${int(range.add)} −${int(range.del)}`,
    int(range.commits),
    int(range.prompts),
  ]
}

const PERIOD_LABELS = ['Sessioni', 'Turni', 'Tempo attivo', 'Costo', 'Token totali', 'Input / output', 'Cache hit', 'Tool call', 'Righe', 'Commit', 'Prompt']

/** Il riepilogo di `/kpi`: sessione corrente, oggi, ultimi 7 giorni; `notice` è l'avviso sugli aggiornamenti, in testa. */
export function summaryReport(current: KpiSessionFile | null, today: { range: DayAgg; sessions: number }, week: { range: DayAgg; sessions: number }, now: number, notice?: string): string {
  const parts: string[] = ['## KPI di Claude Code', ...(notice !== undefined ? [`> ${notice}`] : [])]
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

    headers.push('Sessione corrente')
    columns.push(periodColumn(range, 1))
  }

  headers.push('Oggi', 'Ultimi 7 giorni')
  columns.push(periodColumn(today.range, today.sessions), periodColumn(week.range, week.sessions))

  const rows = PERIOD_LABELS.map((label, index) => [label, ...columns.map(column => column[index] ?? '–')])

  parts.push(table(headers, rows, columns.map((_, index) => index + 1)))

  if (current !== null) {
    const s = current.summary
    const rate = Object.entries(s.rate)
      .map(([kind, value]) => `${kind === 'five_hour' ? '5h' : kind === 'seven_day' ? '7g' : kind} ${pct100(value.last)} (max ${pct100(value.max)})`)
      .join(' · ')

    parts.push(
      [
        `**Sessione** ${current.sessionId.slice(0, 8)} · ${current.project.name} · ${current.kind} · avviata ${dateTime(current.createdAt)} · durata ${dur(now - current.createdAt)}`,
        `Contesto ${s.context.lastPct > 0 ? pct100(s.context.lastPct) : '–'} (max ${pct100(s.context.maxPct)}) · compattazioni ${int(s.compactions.n)}${rate !== '' ? ` · rate limit ${rate}` : ''}`,
      ].join('  \n'),
    )
  }

  parts.push('_`/kpi aiuto` per tutti i comandi · `/kpi statistiche --da 7d` per il dettaglio completo._')

  return parts.join('\n\n')
}

/** Il report completo di un insieme di sessioni: tutte le categorie di KPI. */
export function statsReport(totals: Totals, rows: readonly SessionRow[], filter: KpiFilter, description: string, by: GroupKey | null): string {
  const s = totals.summary
  const r = totals.range
  const turns = r.turns
  const tokensAll = totalTokens(s.tokens)
  const out: string[] = [`## KPI · ${description}`]

  out.push(
    section(
      'Panoramica',
      pairs([
        ['Sessioni', `${int(totals.sessions)} (${counts(totals.byKind)})`],
        ['Progetti', int(totals.projects)],
        ['Giorni attivi', int(totals.days)],
        ['Turni (principali / subagent)', `${int(turns)} / ${int(s.turns.sub)}`],
        ['Prompt', int(r.prompts)],
        ['Tempo attivo del modello', dur(r.active)],
        ['Durata media turno · p50 · p90', `${dur(meanOf(s.turns.dur))} · ${dur(percentileOf(s.turns.dur, 0.5))} · ${dur(percentileOf(s.turns.dur, 0.9))}`],
        ['Segmenti di processo (riprese, reload)', int(s.segments)],
      ]),
    ),
  )

  out.push(
    section(
      'Costo e token',
      pairs([
        ['Costo', usd(r.cost)],
        ['Costo per turno · per sessione', `${usd(turns === 0 ? 0 : r.cost / turns)} · ${usd(totals.sessions === 0 ? 0 : r.cost / totals.sessions)}`],
        ['Costo per commit · per 100 righe', `${r.commits === 0 ? '–' : usd(r.cost / r.commits)} · ${r.add + r.del === 0 ? '–' : usd((r.cost * 100) / (r.add + r.del))}`],
        ['Token totali', compact(r.in + r.out + r.cr + r.cw)],
        ['Input non in cache · output', `${compact(r.in)} · ${compact(r.out)}`],
        ['Cache letta · scritta', `${compact(r.cr)} · ${compact(r.cw)}`],
        ['Cache hit', ratio(r.cr, r.in + r.cr + r.cw)],
        ['Token dei subagent', `${compact(totalTokens(s.tokensSub))} (${ratio(totalTokens(s.tokensSub), tokensAll)})`],
        ['Richieste API', int(s.requests.n)],
      ]) +
        '\n\n' +
        table(
          ['Modello', 'Richieste', 'Input', 'Output', 'Cache letta', 'Cache scritta', 'Hit'],
          Object.entries(s.byModel)
            .sort((a, b) => totalTokens(b[1]) - totalTokens(a[1]))
            .map(([model, agg]) => [model, int(agg.req), compact(agg.in), compact(agg.out), compact(agg.cr), compact(agg.cw), pct(cacheHit(agg))]),
          [1, 2, 3, 4, 5, 6],
        ) +
        '\n\n_Il costo è quello calcolato da Claude Code (comprende le sue chiamate di servizio); non esiste un costo per modello._',
    ),
  )

  out.push(
    section(
      'Richieste e latenza',
      pairs([
        ['Richieste per turno (media)', fixed(meanOf(s.turns.steps), 1)],
        ['Tempo al primo token p50 · p90', s.requests.ttft.n === 0 ? '–' : `${dur(percentileOf(s.requests.ttft, 0.5))} · ${dur(percentileOf(s.requests.ttft, 0.9))}`],
        ['Latenza richiesta p50 · p90', s.requests.latency.n === 0 ? '–' : `${dur(percentileOf(s.requests.latency, 0.5))} · ${dur(percentileOf(s.requests.latency, 0.9))}`],
        ['Velocità di output (token/s, media)', s.requests.tps.n === 0 ? '–' : fixed(meanOf(s.requests.tps), 1)],
        ['Motivi di stop', counts(s.requests.byStop)],
        ['Fallback di modello', int(s.requests.fallback)],
        ['Effort', counts(s.effort)],
        ['Cambi di modello', int(s.models.switches)],
        ['Tool lato server', counts(Object.fromEntries(Object.entries(s.requests.server).map(([name, agg]) => [name, agg.n])))],
      ]),
    ),
  )

  out.push(
    section(
      'Contesto, compattazioni e rate limit',
      pairs([
        ['Contesto massimo', `${pct100(s.context.maxPct)}${s.context.window > 0 ? ` di ${compact(s.context.window)}` : ''}`],
        ['Contesto medio a fine turno', s.context.pctEnd.n === 0 ? '–' : pct100(meanOf(s.context.pctEnd))],
        ['Compattazioni', `${int(s.compactions.n)} (${counts(s.compactions.byTrigger)})`],
        ['Riduzione media', s.compactions.before > 0 ? pct(1 - s.compactions.after / s.compactions.before) : '–'],
        ['Turni per compattazione', s.compactions.n === 0 ? '–' : fixed(turns / s.compactions.n, 1)],
        ['/clear', int(s.commands.clear ?? 0)],
        ...Object.entries(s.rate).map(([kind, value]) => [`Rate limit ${kind === 'five_hour' ? '5 ore' : kind === 'seven_day' ? '7 giorni' : kind} (max)`, pct100(value.max)] as [string, string]),
        ['Blocchi per rate limit', int(s.errors.api.rate_limit ?? 0)],
      ]),
    ),
  )

  out.push(
    section(
      'Prompt',
      pairs([
        ['Prompt per origine', counts(s.prompts.byOrigin)],
        ['Prompt per sorgente', counts(s.prompts.bySource)],
        ['Accodati durante un turno', int(s.prompts.queued)],
        ['Lunghezza media (caratteri · parole)', `${int(meanOf(s.prompts.chars))} · ${int(meanOf(s.prompts.words))}`],
        ['Lunghezza massima (caratteri)', int(s.prompts.chars.max)],
        ['Allegati', counts(s.prompts.att)],
        ['Menzioni @', `${int(s.mentions.n)} (${counts(s.mentions.byType)})`],
        ['Tempo di risposta utente p50 · p90', s.prompts.think.n === 0 ? '–' : `${dur(percentileOf(s.prompts.think, 0.5))} · ${dur(percentileOf(s.prompts.think, 0.9))}`],
        ['Esiti dei turni', counts(s.turns.byReason)],
      ]),
    ),
  )

  const tools = Object.entries(s.tools.byTool).sort((a, b) => b[1].n - a[1].n)

  out.push(
    section(
      `Tool (${int(s.tools.n)} chiamate)`,
      table(
        ['Tool', 'Chiamate', 'Errori', 'Negate', 'Interrotte', 'Durata media', 'p90', 'Read-only', 'Subagent'],
        tools.slice(0, 20).map(([name, agg]) => [
          name,
          int(agg.n),
          `${int(agg.err)} (${ratio(agg.err, agg.n)})`,
          int(agg.deny),
          int(agg.intr),
          agg.ms.n === 0 ? '–' : dur(meanOf(agg.ms)),
          agg.ms.n === 0 ? '–' : dur(percentileOf(agg.ms, 0.9)),
          ratio(agg.ro, agg.n),
          int(agg.sub),
        ]),
        [1, 2, 3, 4, 5, 6, 7, 8],
      ) +
        `\n\nParallelismo medio ${fixed(meanOf(s.tools.batches), 1)} tool per batch · in background ${int(s.tools.bg)} · MCP ${counts(Object.fromEntries(Object.entries(s.tools.mcp).map(([server, agg]) => [server, agg.n])))}`,
    ),
  )

  out.push(
    section(
      `Bash (${int(s.bash.n)} comandi)`,
      table(
        ['Categoria', 'Comandi', 'Ok', 'Errori', 'Interrotti', 'Timeout', 'Background'],
        Object.entries(s.bash.byCat)
          .sort((a, b) => b[1].n - a[1].n)
          .map(([cat, agg]) => [cat, int(agg.n), int(agg.ok), int(agg.err), int(agg.intr), int(agg.to), int(agg.bg)]),
        [1, 2, 3, 4, 5, 6],
      ) +
        '\n\n' +
        table(
          ['Comando', 'Volte', 'Ok', 'Errori'],
          Object.entries(s.bash.byCmd)
            .sort((a, b) => b[1].n - a[1].n)
            .slice(0, 15)
            .map(([cmd, agg]) => [cmd, int(agg.n), int(agg.ok), int(agg.err)]),
          [1, 2, 3],
        ) +
        `\n\nTest: ${int(s.tests.n)} esecuzioni, ${int(s.tests.ok)} superate, ${int(s.tests.err)} fallite (pass rate ${ratio(s.tests.ok, s.tests.ok + s.tests.err)}) · Build: ${int(s.builds.n)}, ${int(s.builds.ok)} ok, ${int(s.builds.err)} ko · comandi con pipe ${int(s.bash.pipes)} · sandbox disattivata ${int(s.bash.sandboxOff)}`,
    ),
  )

  out.push(
    section(
      'File e codice',
      pairs([
        ['Righe aggiunte · rimosse · nette', `+${int(r.add)} · −${int(r.del)} · ${int(r.add - r.del)}`],
        ['File creati · modificati (unici) · letti (unici)', `${int(s.files.created)} · ${int(s.files.uniqueModified)} · ${int(s.files.uniqueRead)}`],
        ['Modifiche (Edit) · scritture (Write)', `${int(s.files.edited)} · ${int(s.files.written)}`],
        ['Righe lette', compact(s.files.linesRead)],
        ['Modifiche ritoccate dall\'utente', int(s.files.userModified)],
        ['File fuori dal progetto', int(s.files.outside)],
        ['File modificati 3+ volte (churn)', int(s.files.churn)],
        ['Per classe', Object.entries(s.files.byClass).map(([cls, agg]) => `${cls} +${int(agg.add)} −${int(agg.del)}`).join(' · ') || '–'],
      ]) +
        '\n\n' +
        table(
          ['Estensione', 'Modifiche', 'Righe +', 'Righe −'],
          Object.entries(s.files.byExt)
            .sort((a, b) => b[1].add + b[1].del - (a[1].add + a[1].del))
            .slice(0, 12)
            .map(([ext, agg]) => [ext, int(agg.n), int(agg.add), int(agg.del)]),
          [1, 2, 3],
        ),
    ),
  )

  out.push(
    section(
      'Git',
      pairs([
        ['Commit', `${int(s.git.commits)} (${counts(s.git.byKind)})`],
        ['Push', int(s.git.pushes)],
        ['Merge / rebase', counts(s.git.branchOps)],
        ['Pull request', counts(s.git.prs)],
        ['Branch', counts(s.git.branches, 8)],
        ['Righe per commit', s.git.commits === 0 ? '–' : int((r.add + r.del) / s.git.commits)],
      ]),
    ),
  )

  out.push(
    section(
      'Permessi',
      pairs([
        ['Decisioni', counts(s.perms.byDecision)],
        ['Chi ha deciso', counts(s.perms.byWho)],
        ['Dialoghi di permesso mostrati', int(s.perms.dialogs)],
        ['Negati dal classificatore', int(s.perms.denied)],
        ['Tool call negate', int(s.perms.toolDenied)],
      ]),
    ),
  )

  out.push(
    section(
      `Subagent e workflow (${int(s.agents.n)} avviati)`,
      table(
        ['Tipo', 'Avviati', 'In background', 'Durata totale', 'Token', 'Tool', 'Errori'],
        Object.entries(s.agents.byType)
          .sort((a, b) => b[1].n - a[1].n)
          .map(([type, agg]) => [type, int(agg.n), int(agg.bg), dur(agg.ms), compact(agg.tok), int(agg.tools), int(agg.err)]),
        [1, 2, 3, 4, 5, 6],
      ) + `\n\nWorkflow ${int(s.agents.workflows)} · massimo concorrenti ${int(s.agents.maxConcurrent)} · modelli ${counts(s.agents.byModel)}`,
    ),
  )

  out.push(
    section(
      'Skill, comandi e web',
      pairs([
        ['Skill', counts(Object.fromEntries(Object.entries(s.skills).map(([name, agg]) => [name, agg.n])))],
        ['Comandi slash', counts(s.commands)],
        ['Espansioni', counts(s.expansions)],
        ['WebFetch · domini', `${int(s.web.fetch)} · ${counts(s.web.domains, 8)}`],
        ['WebSearch', int(s.web.search)],
        ['File di istruzioni caricati', counts(s.instr)],
        ['Todo (ultima lista)', s.todos.writes === 0 ? '–' : `${int(s.todos.done)}/${int(s.todos.total)} completati`],
        ['Task creati · completati', `${int(s.tasks.created)} · ${int(s.tasks.completed)}`],
      ]),
    ),
  )

  out.push(
    section(
      'Errori e interruzioni',
      pairs([
        ['Errori API', counts(s.errors.api)],
        ['Turni in errore · rifiutati', `${int(s.errors.turnErr)} · ${int(s.errors.refusals)}`],
        ['Errori dei tool', `${int(s.errors.toolErr)} (${ratio(s.errors.toolErr, s.tools.n)})`],
        ['Interruzioni', int(s.errors.interrupts)],
        ['Stop per max_tokens', int(s.errors.maxTokens)],
        ['Notifiche', counts(s.notif)],
      ]),
    ),
  )

  out.push(section('Attività per ora', heatmap(s.byHour)))

  if (by !== null) {
    out.push(section(`Per ${by}`, groupTable(groupBy(rows, filter, by), by)))
  }

  return out.join('\n\n')
}

/** Tabella ora × giorno della settimana in forma compatta. */
export function heatmap(byHour: readonly number[]): string {
  const max = Math.max(0, ...byHour)

  if (max === 0) {
    return '_nessun turno_'
  }

  const shades = [' ', '░', '▒', '▓', '█']
  const lines = WEEKDAYS.map((day, weekday) => {
    const cells = Array.from({ length: 24 }, (_, hour) => {
      const value = byHour[weekday * 24 + hour] ?? 0

      return value === 0 ? '·' : (shades[Math.min(4, Math.ceil((value / max) * 4))] as string)
    })

    return `${day} ${cells.join('')}`
  })

  return ['```', `    ${'0'.padEnd(6)}${'6'.padEnd(6)}${'12'.padEnd(6)}18`, ...lines, '```'].join('\n')
}

/** La tabella di un raggruppamento. */
export function groupTable(groups: ReturnType<typeof groupBy>, by: GroupKey): string {
  if (by === 'modello') {
    return table(
      ['Modello', 'Sessioni', 'Richieste', 'Input', 'Output', 'Cache letta', 'Hit'],
      groups.map(group => [group.key, int(group.sessions), int(group.agg.req), compact(group.agg.in), compact(group.agg.out), compact(group.agg.cr), pct(cacheHit(group.agg))]),
      [1, 2, 3, 4, 5, 6],
    )
  }

  const label = by === 'giorno' ? 'Giorno' : by === 'settimana' ? 'Settimana (dal)' : by === 'mese' ? 'Mese' : by === 'progetto' ? 'Progetto' : by === 'branch' ? 'Branch' : by === 'tipo' ? 'Tipo' : 'Sessione'

  return table(
    [label, 'Sessioni', 'Turni', 'Attivo', 'Costo', 'Token', 'Tool', 'Righe', 'Commit'],
    groups.map(group => [
      by === 'giorno' || by === 'settimana' ? dayLabel(group.key) : group.key,
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
export function sessionsReport(rows: readonly SessionRow[], filter: KpiFilter, limit: number, now: number, description: string): string {
  const recent = [...rows].sort((a, b) => b.file.createdAt - a.file.createdAt).slice(0, limit)

  return [
    `## Sessioni · ${description}`,
    `${int(rows.length)} sessioni${rows.length > limit ? `, le ${int(limit)} più recenti (\`--limite\` per vederne di più)` : ''}.`,
    table(
      ['Inizio', 'Progetto', 'ID', 'Tipo', 'Durata', 'Turni', 'Costo', 'Token', 'Righe', 'Commit', 'Branch', 'Stato'],
      recent.map(row => {
        const s = row.file.summary
        const range = rangeOf(row, filter)

        return [
          dateTime(row.file.createdAt),
          cut(row.projectName, 28),
          row.file.sessionId.slice(0, 8),
          row.file.kind,
          dur(Math.max(0, s.lastAt - row.file.createdAt)),
          int(range.turns),
          usd(range.cost),
          compact(range.in + range.out + range.cr + range.cw),
          `+${int(range.add)} −${int(range.del)}`,
          int(range.commits),
          cut(row.file.meta.branches.at(-1) ?? '–', 20),
          displayStatus(row.file, now),
        ]
      }),
      [4, 5, 6, 7, 9],
    ),
  ].join('\n\n')
}

/** I totali per progetto. */
export function projectsReport(rows: readonly SessionRow[], filter: KpiFilter, description: string): string {
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

  return [
    `## Progetti · ${description}`,
    table(
      ['Progetto', 'Percorso', 'Sessioni', 'Ultima attività', 'Turni', 'Attivo', 'Costo', 'Token', 'Righe', 'Commit'],
      lines.map(line => [line.name, cut(line.path, 60), int(line.sessions), date(line.last), int(line.turns), dur(line.active), usd(line.cost), compact(line.tokens), `+${int(line.add)} −${int(line.del)}`, int(line.commits)]),
      [2, 4, 5, 6, 7, 9],
    ),
  ].join('\n\n')
}

/** Il dettaglio di una sessione: statistiche complete e dettagli. */
export function sessionReport(row: SessionRow, details: KpiDetails | null, totals: Totals, filter: KpiFilter, now: number): string {
  const file = row.file
  const head = [
    `## Sessione ${file.sessionId}`,
    pairs([
      ['Progetto', `${row.projectName} (${row.projectPath})`],
      ['Cartella dati', row.dir],
      ['Tipo · stato', `${file.kind} · ${displayStatus(file, now)}`],
      ['Inizio · ultima attività', `${dateTime(file.createdAt)} · ${dateTime(file.summary.lastAt)}`],
      ['Segmenti', file.segments.map(segment => `${segment.source} ${dateTime(segment.startedAt)}${segment.endReason !== undefined ? ` → ${segment.endReason}` : ''}`).join(' · ')],
      ['Versioni · modelli', `${file.meta.versions.join(', ') || '–'} · ${file.meta.models.join(', ') || '–'}`],
      ['Branch · repo', `${file.meta.branches.join(', ') || '–'} · ${file.meta.repo?.name ?? file.meta.repo?.remote ?? '–'}`],
      ['Sessione precedente · successiva', `${file.links.previousSessionId?.slice(0, 8) ?? '–'} · ${file.links.nextSessionId?.slice(0, 8) ?? '–'}`],
    ]),
  ]

  const parts = [...head, statsReport(totals, [row], filter, 'sessione', null)]

  if (details !== null) {
    const files = Object.entries(details.files)
      .filter(([, agg]) => agg.add + agg.del + agg.e + agg.w > 0)
      .sort((a, b) => b[1].add + b[1].del - (a[1].add + a[1].del))
      .slice(0, 20)

    parts.push(
      section(
        'File modificati',
        table(
          ['File', 'Modifiche', 'Righe +', 'Righe −', 'Classe'],
          files.map(([path, agg]) => [cut(path, 90), int(agg.e + agg.w), int(agg.add), int(agg.del), agg.cls]),
          [1, 2, 3],
        ),
      ),
    )

    if (details.commits.length > 0) {
      parts.push(section('Commit', table(['Quando', 'SHA', 'Tipo', 'Branch'], details.commits.map(commit => [dateTime(commit.t), commit.sha, commit.kind, commit.branch ?? '–']))))
    }

    if (details.prs.length > 0) {
      parts.push(section('Pull request', table(['Quando', 'PR', 'Azione', 'URL'], details.prs.map(pr => [dateTime(pr.t), `#${pr.n}`, pr.action, pr.url ?? '–']))))
    }

    const agents = Object.values(details.agents)

    if (agents.length > 0) {
      parts.push(
        section(
          'Subagent',
          table(
            ['Avvio', 'Tipo', 'Modello', 'Durata', 'Token', 'Tool', 'Esito'],
            agents.slice(-30).map(agent => [dateTime(agent.start), agent.type, agent.model ?? '–', agent.ms !== undefined ? dur(agent.ms) : '–', agent.tok !== undefined ? compact(agent.tok) : '–', int(agent.tools ?? 0), agent.st ?? '–']),
            [3, 4, 5],
          ),
        ),
      )
    }

    if (details.compactions.length > 0) {
      parts.push(
        section(
          'Compattazioni',
          table(['Quando', 'Trigger', 'Token prima', 'Token dopo'], details.compactions.map(one => [dateTime(one.t), one.tr, one.b !== undefined ? compact(one.b) : '–', one.af !== undefined ? compact(one.af) : '–']), [2, 3]),
        ),
      )
    }

    if (details.switches.length > 0) {
      parts.push(section('Cambi di modello', table(['Quando', 'Da', 'A', 'Origine'], details.switches.map(one => [dateTime(one.t), one.from, one.to, one.src]))))
    }
  }

  return parts.join('\n\n')
}

/** Somma dei valori di una mappa (esportata per i test). */
export const totalOf = sumValues

export type { KpiSummary }
