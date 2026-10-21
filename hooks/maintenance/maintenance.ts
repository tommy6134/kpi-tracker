/** Manutenzione: pulizia delle sessioni vecchie e ricostruzione dei KPI dagli eventi. */

import { join, isInside, parseSessionDir, ROOT_MARKER } from '../core/paths'
import { readJson, rebuildFrom } from '../core/recover'
import type { KpiSessionFile } from '../core/session-file'
import { date, int } from '../format/fmt'
import type { Host, HostFs } from '../host'
import { loadProjects, type SessionRow } from '../query/load'

/** L'argv per cancellare una cartella sul sistema dato. */
export function removeArgv(os: string, dir: string): string[] {
  return /windows|mingw|msys|cygwin/i.test(os) ? ['cmd', '/c', 'rmdir', '/s', '/q', dir] : ['rm', '-rf', dir]
}

export type PruneOptions = { olderThanDays: number; now: number; apply: boolean; current: string | null; os: string }

/**
 * Le sessioni con ultima attività più vecchia di `olderThanDays`. Senza
 * `apply` le elenca soltanto. Cancella solo cartelle col nome di una
 * sessione, dentro una radice che porta il marcatore di kpi-tracker.
 */
export async function pruneSessions(host: Host, root: string, options: PruneOptions): Promise<string> {
  if (!(await host.fs.exists(join(root, ROOT_MARKER)))) {
    return `Pulizia annullata: ${root} non porta il marcatore di kpi-tracker (${ROOT_MARKER}).`
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

  if (victims.length === 0) {
    return `Nessuna sessione con ultima attività prima del ${date(cutoff)}.`
  }

  const list = victims
    .slice(0, 15)
    .map(victim => `- ${victim.project} · ${victim.id.slice(0, 8)} · ${date(victim.last)}`)
    .join('\n')
  const more = victims.length > 15 ? `\n- … e altre ${int(victims.length - 15)}` : ''

  if (!options.apply) {
    return `${int(victims.length)} sessioni hanno l'ultima attività prima del ${date(cutoff)}:\n${list}${more}\n\nNon ho cancellato nulla. Per cancellarle: \`/kpi pulisci --piu-vecchie-di ${options.olderThanDays}d --si\`.`
  }

  let removed = 0
  const failed: string[] = []

  for (const victim of victims) {
    const result = await host.run(removeArgv(options.os, victim.dir), { timeoutMs: 30_000 }).catch(() => null)

    if (result !== null && result.exitCode === 0) {
      removed += 1
    } else {
      failed.push(victim.id.slice(0, 8))
    }
  }

  return `Cancellate ${int(removed)} sessioni su ${int(victims.length)} (ultima attività prima del ${date(cutoff)}).${failed.length > 0 ? ` Non cancellate: ${failed.join(', ')}.` : ''}`
}

/** Ricalcola summary e dettagli dagli eventi di ogni sessione (tranne quella in corso). */
export async function rebuildSessions(fs: HostFs, rows: readonly SessionRow[], current: string | null): Promise<string> {
  let done = 0
  let events = 0
  const skipped: string[] = []

  for (const row of rows) {
    if (row.file.sessionId === current) {
      skipped.push(row.file.sessionId.slice(0, 8))
      continue
    }

    const file = row.file
    const rebuilt = await rebuildFrom(fs, row.dir, file)

    if (rebuilt.events === 0) {
      skipped.push(file.sessionId.slice(0, 8))
      continue
    }

    file.summary = rebuilt.summary
    await fs.write(join(row.dir, 'session.json'), JSON.stringify(file))
    await fs.write(join(row.dir, 'details.json'), JSON.stringify(rebuilt.details))
    done += 1
    events += rebuilt.events
  }

  return `Ricostruite ${int(done)} sessioni da ${int(events)} eventi.${skipped.length > 0 ? ` Saltate (in corso o senza eventi): ${skipped.join(', ')}.` : ''}`
}
