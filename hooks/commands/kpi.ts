/** Il dispatcher di /kpi. */

import { openPath, type Platform } from '../core/open'
import { dirName, hasHiddenSegment, isAbsolute, join, resolvePath, trimSlash, REPORTS_DIR, EXPORTS_DIR } from '../core/paths'
import { readJson } from '../core/recover'
import type { KpiDetails } from '../analysis/summary-types'
import { addDays, dayKey, stampOf } from '../core/time'
import { exportCsv, exportJson, LEVEL_NAMES, LEVELS } from '../export/export'
import type { Host } from '../host'
import { i18nOf, langOf, type I18n } from '../i18n'
import { pruneSessions, rebuildSessions } from '../maintenance/maintenance'
import { GROUP_ALIASES, totalsOf, type GroupKey } from '../query/aggregate'
import { describeFilter, emptyFilter, filterOf } from '../query/filters'
import { loadSessions } from '../query/load'
import { buildReport } from '../report/html'
import { flushNow, noticeOf, pollCost, type Tracker } from '../tracker'
import { checkForUpdates, updateReport } from '../update/update'
import { daysOfAge, parseArgs, type ArgError } from './args'
import { helpOf } from './help'
import { projectsReport, sessionReport, sessionsReport, statsReport, summaryReport } from './report-text'

export type KpiCommandContext = {
  host: Host
  tracker: Tracker
  openPane: () => Promise<{ isPlaced: boolean; reason?: string }>
  platform: () => Promise<Platform>
}

/**
 * `text` è il report completo; `short`, quando c'è, è la riga che va al
 * modello al posto del report (che vede solo la persona). `toModel` chiede di
 * mandare il report completo anche al modello (`--ctx`). `lang` è la lingua
 * in cui è scritto, per il riferimento che lo accompagna nel transcript.
 */
export type KpiCommandResult = { text: string; short?: string; toModel?: boolean; lang?: I18n['lang'] }

const privateNote = (L: I18n, what: string): string => L.t('{what}: mostrato all\'utente, non incluso nel contesto (usa /kpi … --ctx per includerlo).', { what })

/** Il nome fisso della copia del report che il browser apre su Linux. */
export const BROWSER_COPY = 'kpi-report.html'

const badReportDir = (L: I18n): string => L.t('L\'opzione reportDir non è un percorso assoluto (anche `~/…`): correggila da /config.')

/** Dove vanno report ed export: l'opzione `reportDir`, altrimenti `sub` nella cartella dati. `null` se `reportDir` non è assoluta. */
function outDirOf(tracker: Tracker, root: string, sub: string): string | null {
  return tracker.options.reportDir.trim() === '' ? join(root, sub) : resolvePath(tracker.env, tracker.options.reportDir)
}

/** Le cartelle che `/kpi cartella` apre, per nome in entrambe le lingue. */
const FOLDERS: Record<string, 'report' | 'export' | 'dati'> = {
  report: 'report',
  reports: 'report',
  esporta: 'export',
  export: 'export',
  exports: 'export',
  dati: 'dati',
  data: 'dati',
}

/** Apre una cartella nel file manager e dice com'è andata; la crea se manca (un file manager non apre ciò che non c'è). */
async function openFolder(ctx: KpiCommandContext, L: I18n, dir: string): Promise<string> {
  const { host } = ctx

  if (!(await host.fs.exists(dir).catch(() => false))) {
    await host.fs.write(join(dir, '.keep'), '').catch(() => undefined)
  }

  const opened = await openPath(host, await ctx.platform(), dir)

  return opened ? L.t('Cartella aperta: {dir}.', { dir }) : L.t('Apri la cartella dal percorso: {dir}.', { dir })
}

/**
 * Su Linux i browser snap e flatpak (Firefox su Ubuntu, Brave, Chromium) non
 * leggono le cartelle nascoste della home: un report sotto `~/.claude` si apre
 * da una copia nella cartella Scaricati. `null` quando non serve o non si può
 * (in WSL il report lo apre il browser di Windows, che legge il percorso).
 */
async function browserCopy(host: Host, platform: Platform, path: string, html: string): Promise<string | null> {
  if (platform.os !== 'Linux' || platform.wsl || !hasHiddenSegment(path)) {
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

/** Un errore degli argomenti nella lingua di `L`. */
const argError = (L: I18n, error: ArgError): string =>
  error.kind === 'valore' ? L.t('--{name} richiede un valore', { name: error.name }) : L.t('opzione sconosciuta --{name}', { name: error.name })

export async function runKpi(ctx: KpiCommandContext, argsText: string): Promise<KpiCommandResult> {
  const { host, tracker } = ctx
  const args = parseArgs(argsText)
  const toModel = args.bools.has('ctx')
  const rawLang = args.flags.lingua?.at(-1)
  const lang = rawLang === undefined ? tracker.options.language : langOf(rawLang)

  if (lang === null) {
    return { text: tracker.i18n.t('Lingua sconosciuta: {value}. Valori: it, en.', { value: rawLang ?? '' }) }
  }

  const L = i18nOf(lang)
  const done = (result: KpiCommandResult): KpiCommandResult => ({ ...result, lang })

  if (args.unknown !== undefined) {
    return done({ text: L.t('Sottocomando sconosciuto: `{name}`. Scrivi `/kpi aiuto` per l\'elenco dei comandi.', { name: args.unknown }) })
  }

  if (args.sub === 'aiuto') {
    return done({ text: helpOf(lang), short: privateNote(L, L.t('Guida di /kpi')), toModel })
  }

  if (args.errors.length > 0) {
    return done({ text: L.t('Argomenti non validi: {errors}.\n\nScrivi `/kpi aiuto` per la guida.', { errors: args.errors.map(error => argError(L, error)).join('; ') }) })
  }

  if (args.sub === 'aggiorna') {
    const outcome = await checkForUpdates(tracker, { force: true, install: !args.bools.has('verifica') })

    return done({ text: await updateReport(tracker, host, outcome, L) })
  }

  const root = tracker.root

  if (root === null) {
    return done({ text: L.t('kpi-tracker: cartella dati non disponibile (né CLAUDE_CONFIG_DIR né HOME sono definite, oppure dataDir non è un percorso assoluto).') })
  }

  if (args.sub === 'live') {
    const opened = await ctx.openPane()

    return done({ text: opened.isPlaced ? L.t('Pannello KPI aperto.') : L.t('Il pannello non si può mostrare ora: {reason}.', { reason: opened.reason ?? L.t('motivo sconosciuto') }) })
  }

  if (args.sub === 'barra') {
    const value = (args.positional[0] ?? '').toLowerCase()

    if (value !== 'on' && value !== 'off') {
      return done({ text: tracker.ui.bandDisabled ? L.t('La barra KPI è disattivata. Usa `/kpi barra on` o `/kpi barra off`.') : L.t('La barra KPI è attiva. Usa `/kpi barra on` o `/kpi barra off`.') })
    }

    tracker.ui.bandDisabled = value === 'off'
    tracker.ui.bandHidden = false
    await host.storeSet('band', value).catch(() => undefined)
    host.invalidate()

    return done({ text: value === 'off' ? L.t('Barra KPI disattivata (anche nelle prossime sessioni).') : L.t('Barra KPI attivata.') })
  }

  if (args.sub === 'cartella') {
    const raw = (args.positional[0] ?? 'report').toLowerCase()
    const which = FOLDERS[raw]

    if (which === undefined) {
      return done({ text: L.t('Cartella sconosciuta: {value}. Valori: report, esporta, dati.', { value: raw }) })
    }

    const dir = which === 'dati' ? root : outDirOf(tracker, root, which === 'report' ? REPORTS_DIR : EXPORTS_DIR)

    if (dir === null) {
      return done({ text: badReportDir(L) })
    }

    if (tracker.interactive === false) {
      return done({ text: L.t('Cartella: {dir}.', { dir }) })
    }

    return done({ text: await openFolder(ctx, L, dir) })
  }

  await pollCost(tracker)
  await flushNow(tracker)

  const now = Date.now()
  const current = tracker.store?.file ?? null
  const override = current === null ? [] : [current]
  const { filter, errors } = filterOf(L, args, now, tracker.launchCwd)

  if (errors.length > 0) {
    return done({ text: L.t('Filtri non validi: {errors}.', { errors: errors.join('; ') }) })
  }

  const description = describeFilter(L, filter)

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

      return done({
        text: summaryReport(L, current, { range: todayTotals.range, sessions: todayTotals.sessions }, { range: weekTotals.range, sessions: weekTotals.sessions }, now, notice === null ? undefined : `${notice.tone === 'warn' ? '⚠ ' : ''}${notice.text}`),
        short: privateNote(L, L.t('Riepilogo KPI (oggi {today}, 7 giorni {week})', { today: L.usd(todayTotals.range.cost), week: L.usd(weekTotals.range.cost) })),
        toModel,
      })
    }

    case 'statistiche': {
      const rows = await loadSessions(host.fs, root, filter, override)
      const rawBy = args.flags.per?.at(-1)
      const by: GroupKey | null = rawBy === undefined ? null : (GROUP_ALIASES[rawBy.toLowerCase()] ?? null)

      if (rawBy !== undefined && by === null) {
        return done({ text: L.t('Raggruppamento sconosciuto: {value}. Valori: giorno, settimana, mese, progetto, modello, branch, tipo, sessione.', { value: rawBy }) })
      }

      const totals = totalsOf(rows, filter)

      return done({
        text: statsReport(L, totals, rows, filter, description, by),
        short: privateNote(L, L.t('Statistiche KPI ({sessions}, {cost})', { sessions: L.count(rows.length, 'sessione', 'sessioni'), cost: L.usd(totals.range.cost) })),
        toModel,
      })
    }

    case 'sessioni': {
      const rows = await loadSessions(host.fs, root, filter, override)
      const limit = Math.max(1, Math.min(1000, Number(args.flags.limite?.at(-1) ?? 20) || 20))

      return done({ text: sessionsReport(L, rows, filter, limit, now, description), short: privateNote(L, L.t('Elenco di {sessions}', { sessions: L.count(rows.length, 'sessione', 'sessioni') })), toModel })
    }

    case 'progetti': {
      const rows = await loadSessions(host.fs, root, filter, override)

      return done({ text: projectsReport(L, rows, filter, description), short: privateNote(L, L.t('Elenco dei progetti')), toModel })
    }

    case 'sessione': {
      const wanted = (args.positional[0] ?? 'corrente').toLowerCase()
      const id = wanted === 'corrente' || wanted === 'current' ? current?.sessionId : wanted

      if (id === undefined) {
        return done({ text: L.t('Nessuna sessione corrente registrata. Indica un id: `/kpi sessione <id>`.') })
      }

      const rows = await loadSessions(host.fs, root, { ...emptyFilter(), sessions: [id.toLowerCase()] }, override)
      const row = rows[0]

      if (row === undefined) {
        return done({ text: L.t('Nessuna sessione con id che inizia per `{id}`.', { id }) })
      }

      if (rows.length > 1) {
        return done({ text: L.t('Più sessioni iniziano per `{id}`: {ids}. Usa più caratteri.', { id, ids: rows.map(one => one.file.sessionId.slice(0, 12)).join(', ') }) })
      }

      const isCurrent = row.file.sessionId === current?.sessionId
      const details = isCurrent ? (tracker.store?.details ?? null) : await readJson<KpiDetails>(host.fs, join(row.dir, 'details.json'))
      const ledger = isCurrent ? (await host.usage().catch(() => null))?.cost?.usd : undefined
      const all = emptyFilter()

      return done({ text: sessionReport(L, row, details, totalsOf([row], all), all, now, ledger), short: privateNote(L, L.t('Dettaglio della sessione {id}', { id: row.file.sessionId.slice(0, 8) })), toModel })
    }

    case 'report': {
      const dir = outDirOf(tracker, root, REPORTS_DIR)

      if (dir === null) {
        return done({ text: badReportDir(L) })
      }

      const rows = await loadSessions(host.fs, root, filter, override)
      const stamp = stampOf(now)
      const path = join(dir, `report-${stamp}.html`)
      // La pagina mostra le cartelle e il comando per aprirle: da `file://` non può avviare il file manager.
      const built = await buildReport(host.fs, host.pluginRoot, rows, { lang, generatedAt: now, filter, folders: { report: dir, export: outDirOf(tracker, root, EXPORTS_DIR) } })

      await host.fs.write(path, built.html)
      await host.fs.write(join(dir, 'latest.html'), built.html)

      const lines = [
        L.t('Report HTML generato: {path} ({sessions}{trimmed}).', {
          path,
          sessions: L.count(rows.length, 'sessione', 'sessioni'),
          trimmed: built.trimmed ? L.t(', dettagli delle sessioni più vecchie ridotti per stare nel limite di dimensione') : '',
        }),
      ]

      if (!args.bools.has('no-apri') && tracker.interactive !== false) {
        const platform = await ctx.platform()
        const copy = await browserCopy(host, platform, path, built.html)
        const opened = await openPath(host, platform, copy ?? path)

        if (copy !== null) {
          lines.push(L.t('Copia per il browser: {copy} (i browser snap e flatpak non leggono le cartelle nascoste; per evitare la copia imposta reportDir).', { copy }))
        } else if (platform.os === 'Linux' && !platform.wsl && hasHiddenSegment(path)) {
          lines.push(L.t('Se il browser nega l\'accesso al file (snap o flatpak), imposta reportDir su una cartella visibile.'))
        }

        lines.push(opened ? L.t('Aperto nel browser.') : L.t('Aprilo nel browser dal percorso indicato.'))
      }

      if (args.bools.has('cartella') && tracker.interactive !== false) {
        lines.push(await openFolder(ctx, L, dir))
      }

      return done({ text: lines.join(' ') })
    }

    case 'esporta': {
      const format = (args.positional[0] ?? '').toLowerCase()

      if (format !== 'csv' && format !== 'json') {
        return done({ text: L.t('Indica il formato: `/kpi esporta csv` oppure `/kpi esporta json`.') })
      }

      const rawLevel = (args.flags.livello?.at(-1) ?? 'sessioni').toLowerCase()
      const level = LEVELS[rawLevel]

      if (level === undefined) {
        return done({ text: L.t('Livello sconosciuto: {value}. Valori: sessioni, giorni, turni, eventi.', { value: rawLevel }) })
      }

      const out = args.flags.out?.at(-1)
      const outPath = out === undefined ? undefined : resolvePath(tracker.env, out)

      if (outPath === null) {
        return done({ text: L.t('`--out` vuole un percorso assoluto (anche `~/…`): {out}.', { out: out ?? '' }) })
      }

      const dir = outDirOf(tracker, root, EXPORTS_DIR)

      if (outPath === undefined && dir === null) {
        return done({ text: badReportDir(L) })
      }

      const rows = await loadSessions(host.fs, root, filter, override)
      const stamp = stampOf(now)
      const levelName = LEVEL_NAMES[level][lang]
      const path = outPath ?? join(dir as string, `kpi-${levelName}-${stamp}.${format}`)
      // Il CSV segue la lingua (Excel italiano o standard); --standard e --excel lo forzano.
      const excel = args.bools.has('excel') || (!args.bools.has('standard') && lang === 'it')
      const result = format === 'csv' ? await exportCsv(host.fs, L, rows, filter, level, excel) : await exportJson(host.fs, L, rows, filter, level, { description, generatedAt: now })
      const paths = result.parts.map((_, index) => (index === 0 ? path : path.replace(/(\.[a-z]+)?$/, `-${L.t('parte')}${index + 1}$1`)))

      for (const [index, part] of result.parts.entries()) {
        await host.fs.write(paths[index] as string, part)
      }

      const where = paths.length === 1 ? path : L.t('{n} file ({paths})', { n: paths.length, paths: paths.join(', ') })
      const kind = format === 'csv' ? (excel ? L.t(' — formato Excel italiano') : L.t(' — formato standard')) : ''
      const text = L.t('Esportate {rows} ({level}) in {where}{kind}.', { rows: L.count(result.count, 'riga', 'righe'), level: levelName, where, kind })

      // La cartella del file scritto, anche con --out.
      return done({ text: args.bools.has('cartella') && tracker.interactive !== false ? `${text} ${await openFolder(ctx, L, dirName(path))}` : text })
    }

    case 'pulisci': {
      const rawAge = args.flags['piu-vecchie-di']?.at(-1)
      const days = rawAge === undefined ? null : daysOfAge(rawAge)

      if (days === null || days < 1) {
        return done({ text: L.t('Indica l\'età: `/kpi pulisci --piu-vecchie-di 180d` (giorni d, settimane w, mesi m, anni y). Aggiungi `--si` per cancellare davvero.') })
      }

      const result = await pruneSessions(host, L, root, { olderThanDays: days, now, apply: args.bools.has('si') && !args.bools.has('prova'), current: current?.sessionId ?? null, os: (await ctx.platform()).os })

      return done({ text: result })
    }

    case 'ricostruisci': {
      const rows = await loadSessions(host.fs, root, filter, [])
      const result = await rebuildSessions(host.fs, L, rows, current?.sessionId ?? null)

      return done({ text: result })
    }

    default:
      return done({ text: helpOf(lang) })
  }
}
