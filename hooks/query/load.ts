/** Lettura dei dati su disco: radice → progetti → sessioni, con i filtri. */

import type { HostFs } from '../host'
import { join, parseSessionDir } from '../core/paths'
import { readJson } from '../core/recover'
import type { KpiProjectFile, KpiSessionFile } from '../core/session-file'
import { matchesProject, matchesSession, type KpiFilter } from './filters'

export type SessionRow = {
  projectDir: string
  projectPath: string
  projectName: string
  /** Cartella della sessione. */
  dir: string
  dirName: string
  file: KpiSessionFile
}

export type ProjectRow = { dir: string; encoded: string; path: string; name: string; project: KpiProjectFile | null }

/** I progetti della radice (le cartelle di servizio `_…` escluse). */
export async function loadProjects(fs: HostFs, root: string): Promise<ProjectRow[]> {
  let entries: { name: string; kind: string }[] = []

  try {
    entries = await fs.list(root)
  } catch {
    return []
  }

  const out: ProjectRow[] = []

  for (const entry of entries) {
    if (entry.kind !== 'dir' || entry.name.startsWith('_') || entry.name.startsWith('.')) {
      continue
    }

    const dir = join(root, entry.name)
    const project = await readJson<KpiProjectFile>(fs, join(dir, 'project.json'))

    out.push({ dir, encoded: entry.name, path: project?.path ?? entry.name, name: project?.name ?? entry.name, project })
  }

  return out
}

/**
 * Le sessioni che passano il filtro. `override` sostituisce i file letti da
 * disco con quelli in memoria (la sessione corrente è più aggiornata).
 */
export async function loadSessions(fs: HostFs, root: string, filter: KpiFilter, override: readonly KpiSessionFile[] = []): Promise<SessionRow[]> {
  const projects = await loadProjects(fs, root)
  const rows: SessionRow[] = []
  const live = new Map(override.map(file => [file.sessionId, file]))

  for (const project of projects) {
    if (!matchesProject(filter, project.path, project.name)) {
      continue
    }

    let entries: { name: string; kind: string }[] = []

    try {
      entries = await fs.list(project.dir)
    } catch {
      continue
    }

    for (const entry of entries) {
      const parsed = entry.kind === 'dir' ? parseSessionDir(entry.name) : null

      // Pre-filtro sul nome: una sessione iniziata dopo la fine dell'intervallo non può entrarci.
      if (parsed === null || (filter.untilDay !== undefined && parsed.date > filter.untilDay)) {
        continue
      }

      const dir = join(project.dir, entry.name)
      const onDisk = await readJson<KpiSessionFile>(fs, join(dir, 'session.json'))

      if (onDisk === null || typeof onDisk.sessionId !== 'string' || onDisk.summary === undefined) {
        continue
      }

      const file = live.get(onDisk.sessionId) ?? onDisk

      if (!matchesSession(filter, file)) {
        continue
      }

      rows.push({ projectDir: project.dir, projectPath: project.path, projectName: project.name, dir, dirName: entry.name, file })
    }
  }

  return rows.sort((a, b) => a.file.createdAt - b.file.createdAt)
}
