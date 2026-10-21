/** Il dispatcher di /kpi. */

import { hasHiddenSegment, isAbsolute, join, resolvePath, trimSlash, REPORTS_DIR, EXPORTS_DIR } from '../core/paths'
import { readJson } from '../core/recover'
import type { KpiDetails } from '../analysis/summary-types'
import { addDays, dayKey, stampOf } from '../core/time'
import { exportCsv, exportJson, LEVELS, type ExportLevel } from '../export/export'
import { int, usd } from '../format/fmt'
import type { Host } from '../host'
import { pruneSessions, rebuildSessions } from '../maintenance/maintenance'
import { GROUP_ALIASES, totalsOf, type GroupKey } from '../query/aggregate'
import { describeFilter, emptyFilter, filterOf } from '../query/filters'
import { loadSessions } from '../query/load'
import { buildReport } from '../report/html'
import { flushNow, noticeOf, type Tracker } from '../tracker'
import { checkForUpdates, updateReport } from '../update/update'
import { daysOfAge, parseArgs } from './args'
import { HELP } from './help'
import { projectsReport, sessionReport, sessionsReport, statsReport, summaryReport } from './report-text'

export type KpiCommandContext = {
  host: Host
  tracker: Tracker
  openPane: () => Promise<{ isPlaced: boolean; reason?: string }>
  platform: () => Promise<{ os: string }>
}

/**
 * `text` è il report completo; `short`, quando c'è, è la riga che va al
 * modello al posto del report (che vede solo la persona). `toModel` chiede di
 * mandare il report completo anche al modello (`--ctx`).
 */
export type KpiCommandResult = { text: string; short?: string; toModel?: boolean }

const privateNote = (what: string): string => `${what} mostrato all'utente, non incluso nel contesto (usa /kpi … --ctx per includerlo).`

/** L'argv per aprire un file con l'applicazione predefinita del sistema. */
export function openArgv(os: string, path: string): string[] {
  if (/windows|mingw|msys|cygwin/i.test(os)) {
    return ['cmd', '/c', 'start', '', path]
  }

  return os === 'Darwin' ? ['open', path] : ['xdg-open', path]
}

/** Il nome fisso della copia del report che il browser apre su Linux. */
export const BROWSER_COPY = 'kpi-report.html'

const BAD_REPORT_DIR = 'L\'opzione reportDir non è un percorso assoluto (anche `~/…`): correggila da /config.'

/** Dove vanno report ed export: l'opzione `reportDir`, altrimenti `sub` nella cartella dati. `null` se `reportDir` non è assoluta. */
function outDirOf(tracker: Tracker, root: string, sub: string): string | null {
  return tracker.options.reportDir.trim() === '' ? join(root, sub) : resolvePath(tracker.env, tracker.options.reportDir)
}

/**
 * Su Linux i browser snap e flatpak (Firefox su Ubuntu, Brave, Chromium) non
 * leggono le cartelle nascoste della home: un report sotto `~/.claude` si apre
 * da una copia nella cartella Scaricati. `null` quando non serve o non si può.
 */
async function browserCopy(host: Host, os: string, path: string, html: string): Promise<string | null> {
  if (os !== 'Linux' || !hasHiddenSegment(path)) {
    return null
  }

  const result = await host.run(['xdg-user-dir', 'DOWNLOAD'], { timeoutMs: 3000 }).catch(() => null)
  const dir = result !== null && result.exitCode === 0 ? trimSlash(result.stdout.trim()) : ''

  if (!isAbsolute(dir) || hasHiddenSegment(dir)) {
    return null
  }

  const copy = join(dir, BROWSER_COPY)

  return host.fs.write(copy, html).then(
    () => copy,
    () => null,
  )
}

export async function runKpi(ctx: KpiCommandContext, argsText: string): Promise<KpiCommandResult> {
  const { host, tracker } = ctx
  const args = parseArgs(argsText)
  const toModel = args.bools.has('ctx')

  if (args.unknown !== undefined) {
    return { text: `Sottocomando sconosciuto: \`${args.unknown}\`. Scrivi \`/kpi aiuto\` per l'elenco dei comandi.` }
  }

  if (args.sub === 'aiuto') {
    return { text: HELP, short: privateNote('Guida di /kpi'), toModel }
  }

  if (args.errors.length > 0) {
    return { text: `Argomenti non validi: ${args.errors.join('; ')}.\n\nScrivi \`/kpi aiuto\` per la guida.` }
  }

  if (args.sub === 'aggiorna') {
    const outcome = await checkForUpdates(tracker, { force: true, install: !args.bools.has('verifica') })

    return { text: await updateReport(tracker, host, outcome) }
  }

  const root = tracker.root

  if (root === null) {
    return { text: 'kpi-tracker: cartella dati non disponibile (né CLAUDE_CONFIG_DIR né HOME sono definite, oppure dataDir non è un percorso assoluto).' }
  }

  if (args.sub === 'live') {
    const opened = await ctx.openPane()

    return { text: opened.isPlaced ? 'Pannello KPI aperto.' : `Il pannello non si può mostrare ora: ${opened.reason ?? 'motivo sconosciuto'}.` }
  }

  if (args.sub === 'barra') {
    const value = (args.positional[0] ?? '').toLowerCase()

    if (value !== 'on' && value !== 'off') {
      return { text: `La barra KPI è ${tracker.ui.bandDisabled ? 'disattivata' : 'attiva'}. Usa \`/kpi barra on\` o \`/kpi barra off\`.` }
    }

    tracker.ui.bandDisabled = value === 'off'
    tracker.ui.bandHidden = false
    await host.storeSet('band', value).catch(() => undefined)
    host.invalidate()

    return { text: value === 'off' ? 'Barra KPI disattivata (anche nelle prossime sessioni).' : 'Barra KPI attivata.' }
  }

  await flushNow(tracker)

  const now = Date.now()
  const current = tracker.store?.file ?? null
  const override = current === null ? [] : [current]
  const { filter, errors } = filterOf(args, now, tracker.launchCwd)

  if (errors.length > 0) {
    return { text: `Filtri non validi: ${errors.join('; ')}.` }
  }

  const description = describeFilter(filter)

  switch (args.sub) {
    case 'riepilogo': {
      const today = dayKey(now)
      const todayFilter = { ...emptyFilter(), sinceDay: today, untilDay: today }
      const weekFilter = { ...emptyFilter(), sinceDay: addDays(today, -6), untilDay: today }
      const todayRows = await loadSessions(host.fs, root, todayFilter, override)
      const weekRows = await loadSessions(host.fs, root, weekFilter, override)
      const todayTotals = totalsOf(todayRows, todayFilter)
      const weekTotals = totalsOf(weekRows, weekFilter)

      const notice = noticeOf(tracker)

      return {
        text: summaryReport(current, { range: todayTotals.range, sessions: todayTotals.sessions }, { range: weekTotals.range, sessions: weekTotals.sessions }, now, notice === null ? undefined : `${notice.tone === 'warn' ? '⚠ ' : ''}${notice.text}`),
        short: privateNote(`Riepilogo KPI (oggi ${usd(todayTotals.range.cost)}, 7 giorni ${usd(weekTotals.range.cost)})`),
        toModel,
      }
    }

    case 'statistiche': {
      const rows = await loadSessions(host.fs, root, filter, override)
      const rawBy = args.flags.per?.at(-1)
      const by: GroupKey | null = rawBy === undefined ? null : (GROUP_ALIASES[rawBy.toLowerCase()] ?? null)

      if (rawBy !== undefined && by === null) {
        return { text: `Raggruppamento sconosciuto: ${rawBy}. Valori: giorno, settimana, mese, progetto, modello, branch, tipo, sessione.` }
      }

      const totals = totalsOf(rows, filter)

      return {
        text: statsReport(totals, rows, filter, description, by),
        short: privateNote(`Statistiche KPI (${int(rows.length)} sessioni, ${usd(totals.range.cost)})`),
        toModel,
      }
    }

    case 'sessioni': {
      const rows = await loadSessions(host.fs, root, filter, override)
      const limit = Math.max(1, Math.min(1000, Number(args.flags.limite?.at(-1) ?? 20) || 20))

      return { text: sessionsReport(rows, filter, limit, now, description), short: privateNote(`Elenco di ${int(rows.length)} sessioni`), toModel }
    }

    case 'progetti': {
      const rows = await loadSessions(host.fs, root, filter, override)

      return { text: projectsReport(rows, filter, description), short: privateNote('Elenco dei progetti'), toModel }
    }

    case 'sessione': {
      const wanted = (args.positional[0] ?? 'corrente').toLowerCase()
      const id = wanted === 'corrente' || wanted === 'current' ? current?.sessionId : wanted

      if (id === undefined) {
        return { text: 'Nessuna sessione corrente registrata. Indica un id: `/kpi sessione <id>`.' }
      }

      const rows = await loadSessions(host.fs, root, { ...emptyFilter(), sessions: [id.toLowerCase()] }, override)
      const row = rows[0]

      if (row === undefined) {
        return { text: `Nessuna sessione con id che inizia per \`${id}\`.` }
      }

      if (rows.length > 1) {
        return { text: `Più sessioni iniziano per \`${id}\`: ${rows.map(one => one.file.sessionId.slice(0, 12)).join(', ')}. Usa più caratteri.` }
      }

      const details = row.file.sessionId === current?.sessionId ? (tracker.store?.details ?? null) : await readJson<KpiDetails>(host.fs, join(row.dir, 'details.json'))
      const all = emptyFilter()

      return { text: sessionReport(row, details, totalsOf([row], all), all, now), short: privateNote(`Dettaglio della sessione ${row.file.sessionId.slice(0, 8)}`), toModel }
    }

    case 'report': {
      const dir = outDirOf(tracker, root, REPORTS_DIR)

      if (dir === null) {
        return { text: BAD_REPORT_DIR }
      }

      const rows = await loadSessions(host.fs, root, filter, override)
      const stamp = stampOf(now)
      const path = join(dir, `report-${stamp}.html`)
      const built = await buildReport(host.fs, host.pluginRoot, rows, { description, generatedAt: now, filter })

      await host.fs.write(path, built.html)
      await host.fs.write(join(dir, 'latest.html'), built.html)

      const lines = [`Report HTML generato: ${path} (${int(rows.length)} sessioni${built.trimmed ? ', dettagli delle sessioni più vecchie ridotti per stare nel limite di dimensione' : ''}).`]

      if (!args.bools.has('no-apri') && tracker.interactive !== false) {
        const { os } = await ctx.platform()
        const copy = await browserCopy(host, os, path, built.html)
        const opened = await host.run(openArgv(os, copy ?? path), { timeoutMs: 10_000 }).catch(() => null)

        if (copy !== null) {
          lines.push(`Copia per il browser: ${copy} (i browser snap e flatpak non leggono le cartelle nascoste; per evitare la copia imposta reportDir).`)
        } else if (os === 'Linux' && hasHiddenSegment(path)) {
          lines.push('Se il browser nega l\'accesso al file (snap o flatpak), imposta reportDir su una cartella visibile.')
        }

        lines.push(opened !== null && opened.exitCode === 0 ? 'Aperto nel browser.' : 'Aprilo nel browser dal percorso indicato.')
      }

      return { text: lines.join(' ') }
    }

    case 'esporta': {
      const format = (args.positional[0] ?? '').toLowerCase()

      if (format !== 'csv' && format !== 'json') {
        return { text: 'Indica il formato: `/kpi esporta csv` oppure `/kpi esporta json`.' }
      }

      const rawLevel = (args.flags.livello?.at(-1) ?? 'sessioni').toLowerCase()
      const level = LEVELS[rawLevel]

      if (level === undefined) {
        return { text: `Livello sconosciuto: ${rawLevel}. Valori: sessioni, giorni, turni, eventi.` }
      }

      const out = args.flags.out?.at(-1)
      const outPath = out === undefined ? undefined : resolvePath(tracker.env, out)

      if (outPath === null) {
        return { text: `\`--out\` vuole un percorso assoluto (anche \`~/…\`): ${out}.` }
      }

      const dir = outDirOf(tracker, root, EXPORTS_DIR)

      if (outPath === undefined && dir === null) {
        return { text: BAD_REPORT_DIR }
      }

      const rows = await loadSessions(host.fs, root, filter, override)
      const stamp = stampOf(now)
      const path = outPath ?? join(dir as string, `kpi-${level}-${stamp}.${format}`)
      const excel = !args.bools.has('standard')
      const result = format === 'csv' ? await exportCsv(host.fs, rows, filter, level as ExportLevel, excel) : await exportJson(host.fs, rows, filter, level as ExportLevel, { description, generatedAt: now })
      const paths = result.parts.map((_, index) => (index === 0 ? path : path.replace(/(\.[a-z]+)?$/, `-parte${index + 1}$1`)))

      for (const [index, part] of result.parts.entries()) {
        await host.fs.write(paths[index] as string, part)
      }

      const where = paths.length === 1 ? path : `${paths.length} file (${paths.join(', ')})`

      return { text: `Esportate ${int(result.count)} righe (${level}) in ${where}${format === 'csv' ? (excel ? ' — formato Excel italiano' : ' — formato standard') : ''}.` }
    }

    case 'pulisci': {
      const rawAge = args.flags['piu-vecchie-di']?.at(-1)
      const days = rawAge === undefined ? null : daysOfAge(rawAge)

      if (days === null || days < 1) {
        return { text: 'Indica l\'età: `/kpi pulisci --piu-vecchie-di 180d` (giorni d, settimane w, mesi m, anni y). Aggiungi `--si` per cancellare davvero.' }
      }

      const result = await pruneSessions(host, root, { olderThanDays: days, now, apply: args.bools.has('si') && !args.bools.has('prova'), current: current?.sessionId ?? null, os: (await ctx.platform()).os })

      return { text: result }
    }

    case 'ricostruisci': {
      const rows = await loadSessions(host.fs, root, filter, [])
      const result = await rebuildSessions(host.fs, rows, current?.sessionId ?? null)

      return { text: result }
    }

    default:
      return { text: HELP }
  }
}
