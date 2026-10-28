/** Manutenzione: pulizia delle sessioni vecchie e ricostruzione dei KPI dagli eventi. */

import { join, isInside, parseSessionDir, ROOT_MARKER } from '../core/paths'
import { REDUCER_VERSION } from '../analysis/summary-types'
import { readJson, rebuildFrom } from '../core/recover'
import { displayStatus, type KpiSessionFile } from '../core/session-file'
import type { Host, HostFs } from '../host'
import type { I18n } from '../i18n'
import { emptyFilter } from '../query/filters'
import { loadProjects, loadSessions, type SessionRow } from '../query/load'

/**
 * Il comando per cancellare una cartella sul sistema dato. Su Windows
 * PowerShell col percorso in una variabile d'ambiente, mai `cmd /c rmdir`:
 * senza shell un argomento senza spazi arriva senza virgolette, e cmd
 * spezzerebbe il comando a un `&` del percorso (`rmdir /s /q D:\Rossi`).
 */
export function removeCommand(os: string, dir: string): { argv: string[]; env?: Record<string, string> } {
  if (/windows|mingw|msys|cygwin/i.test(os)) {
    return {
      argv: ['powershell', '-NoProfile', '-NonInteractive', '-Command', 'Remove-Item -LiteralPath $env:KPI_TRACKER_REMOVE -Recurse -Force -ErrorAction Stop'],
      env: { KPI_TRACKER_REMOVE: dir },
    }
  }

  return { argv: ['rm', '-rf', dir] }
}

export type PruneOptions = { olderThanDays: number; now: number; apply: boolean; current: string | null; os: string }

/**
 * Le sessioni con ultima attività più vecchia di `olderThanDays`. Senza
 * `apply` le elenca soltanto. Cancella solo cartelle col nome di una
 * sessione, dentro una radice che porta il marcatore di kpi-tracker.
 */
export async function pruneSessions(host: Host, L: I18n, root: string, options: PruneOptions): Promise<string> {
  if (!(await host.fs.exists(join(root, ROOT_MARKER)))) {
    return L.t('Pulizia annullata: {root} non porta il marcatore di kpi-tracker ({marker}).', { root, marker: ROOT_MARKER })
  }

  const cutoff = options.now - options.olderThanDays * 86_400_000
  const victims: { dir: string; project: string; last: number; id: string }[] = []

  for (const project of await loadProjects(host.fs, root)) {
    let entries: { name: string; kind: string }[] = []

    try {
      entries = await host.fs.list(project.dir)
    } catch {
      continue
    }

    for (const entry of entries) {
      if (entry.kind !== 'dir' || parseSessionDir(entry.name) === null) {
        continue
      }

      const dir = join(project.dir, entry.name)
      const file = await readJson<KpiSessionFile>(host.fs, join(dir, 'session.json'))

      if (file === null || file.sessionId === options.current) {
        continue
      }

      const last = file.summary?.lastAt || file.updatedAt || file.createdAt

      if (last < cutoff && isInside(dir, root) && dir !== root) {
        victims.push({ dir, project: project.name, last, id: file.sessionId })
      }
    }
  }

  const before = L.date(cutoff)

  if (victims.length === 0) {
    return L.t('Nessuna sessione con ultima attività prima del {date}.', { date: before })
  }

  const list = victims
    .slice(0, 15)
    .map(victim => `- ${victim.project} · ${victim.id.slice(0, 8)} · ${L.date(victim.last)}`)
    .join('\n')
  const more = victims.length > 15 ? `\n- ${L.t('… e altre {n}', { n: L.int(victims.length - 15) })}` : ''

  if (!options.apply) {
    return L.t('Sessioni con l\'ultima attività prima del {date}: {n}.\n{list}{more}\n\nNon ho cancellato nulla. Per cancellarle: `/kpi pulisci --piu-vecchie-di {days}d --si`.', {
      date: before,
      n: L.int(victims.length),
      list,
      more,
      days: options.olderThanDays,
    })
  }

  let removed = 0
  const failed: string[] = []

  for (const victim of victims) {
    const { argv, env } = removeCommand(options.os, victim.dir)
    const result = await host.run(argv, { timeoutMs: 30_000, ...(env !== undefined && { env }) }).catch(() => null)

    if (result !== null && result.exitCode === 0) {
      removed += 1
    } else {
      failed.push(victim.id.slice(0, 8))
    }
  }

  return `${L.t('Sessioni cancellate: {removed} su {total} (ultima attività prima del {date}).', { removed: L.int(removed), total: L.int(victims.length), date: before })}${failed.length > 0 ? ` ${L.t('Non cancellate: {ids}.', { ids: failed.join(', ') })}` : ''}`
}

/** L'esito di una ricostruzione: sessioni rifatte, eventi letti, saltate, costo totale prima e dopo. */
export type RebuildResult = { done: number; events: number; skipped: string[]; costBefore: number; costAfter: number }

/**
 * Ricalcola summary e dettagli dagli eventi di ogni sessione, tranne quelle
 * per cui `skip` è vero; `done` dopo ognuna rifatta.
 */
export async function rebuildAll(fs: HostFs, rows: readonly SessionRow[], skip: (row: SessionRow) => boolean, done?: () => Promise<void>): Promise<RebuildResult> {
  const result: RebuildResult = { done: 0, events: 0, skipped: [], costBefore: 0, costAfter: 0 }

  for (const row of rows) {
    if (skip(row)) {
      result.skipped.push(row.file.sessionId.slice(0, 8))
      continue
    }

    const file = row.file
    const before = file.summary.cost.usd
    const rebuilt = await rebuildFrom(fs, row.dir, file)

    if (rebuilt.events === 0) {
      result.skipped.push(file.sessionId.slice(0, 8))
      continue
    }

    file.summary = rebuilt.summary
    // Prima i dettagli: session.json porta `rv`, e una sessione col calcolo nuovo non si rifà più.
    await fs.write(join(row.dir, 'details.json'), JSON.stringify(rebuilt.details))
    await fs.write(join(row.dir, 'session.json'), JSON.stringify(file))
    await done?.()
    result.done += 1
    result.events += rebuilt.events
    result.costBefore += before
    result.costAfter += rebuilt.summary.cost.usd
  }

  return result
}

/** Ricalcola summary e dettagli dagli eventi di ogni sessione (tranne quella in corso). */
export async function rebuildSessions(fs: HostFs, L: I18n, rows: readonly SessionRow[], current: string | null): Promise<string> {
  const { done, events, skipped } = await rebuildAll(fs, rows, row => row.file.sessionId === current)

  return `${L.t('Ricostruite {sessions} da {events}.', { sessions: L.count(done, 'sessione', 'sessioni'), events: L.count(events, 'evento', 'eventi') })}${skipped.length > 0 ? ` ${L.t('Saltate (in corso o senza eventi): {ids}.', { ids: skipped.join(', ') })}` : ''}`
}

/** La chiave di `$.store` che segna il ricalcolo per la versione corrente del summary. */
export const REBUILD_KEY = `rebuild-r${REDUCER_VERSION}`

/**
 * Il segno del ricalcolo. In corso (`running`): da quale sessione è partito e
 * quando ha rifatto l'ultima. Finito: le sessioni rimaste da rifare perché
 * erano aperte in un altro processo.
 */
type RebuildMark = { at: number; by?: string; running?: true; pending?: string[] }

/** Dopo quanto un ricalcolo in corso che non avanza si considera interrotto (uscita, crash). */
const REBUILD_STALE_MS = 10 * 60_000

/**
 * Ricalcola dagli eventi le sessioni passate fatte con una versione
 * precedente del calcolo (`summary.rv`): una volta per versione, e di nuovo
 * agli avvii successivi solo per quelle che allora erano attive in un altro
 * processo. Il segno in `$.store` dice "in corso" finché non ha finito, così
 * due processi non lo fanno insieme. Un ricalcolo interrotto riparte: subito
 * se l'ha lasciato questa sessione (il modulo si è ricaricato a metà, per
 * esempio per il `config.set` della lingua), altrimenti quando non avanza da
 * 10 minuti; le sessioni già rifatte hanno `rv` nuovo e si saltano. La
 * sessione in corso si ricalcola già all'aggancio (core/binding.ts).
 * Restituisce la riga per il transcript, o `null` se non c'era nulla da fare.
 */
export async function rebuildOnce(host: Host, L: I18n, root: string, current: string | null): Promise<string | null> {
  const mark = (await host.storeGet(REBUILD_KEY).catch(() => null)) as RebuildMark | null | undefined

  if (mark === null) {
    return null
  }

  const now = await host.now()
  const interrupted = mark?.running === true && (mark.by === current || now - mark.at > REBUILD_STALE_MS)

  if (mark !== undefined && !interrupted && (mark.running === true || (mark.pending ?? []).length === 0)) {
    return null
  }

  const running = (at: number): RebuildMark => ({ at, ...(current !== null && { by: current }), running: true })

  await host.storeSet(REBUILD_KEY, running(now))

  const wanted = mark === undefined || interrupted ? null : new Set(mark.pending)
  const rows = (await loadSessions(host.fs, root, emptyFilter(), [])).filter(
    row => row.file.sessionId !== current && (row.file.summary.rv ?? 1) < REDUCER_VERSION && (wanted === null || wanted.has(row.file.sessionId)),
  )
  const busy = (row: SessionRow): boolean => displayStatus(row.file, now) === 'attiva'
  const pending = rows.filter(busy).map(row => row.file.sessionId)
  const result = await rebuildAll(host.fs, rows, busy, async () => host.storeSet(REBUILD_KEY, running(await host.now())).catch(() => undefined))

  await host.storeSet(REBUILD_KEY, { at: await host.now(), pending })

  if (result.done === 0) {
    return null
  }

  const recovered = result.costAfter - result.costBefore

  return `${L.t('kpi-tracker: ricalcolati i KPI di {sessions} con la nuova versione', { sessions: L.count(result.done, 'sessione passata', 'sessioni passate') })}${recovered > 0.0005 ? ` ${L.t('(+{usd} di costo prima non registrato)', { usd: L.usd(recovered) })}` : ''}.`
}
