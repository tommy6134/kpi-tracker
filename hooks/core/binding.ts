/**
 * Aggancio di una sessione al suo posto su disco: progetto (project.json,
 * con gestione delle collisioni di codifica), cartella della sessione
 * (nuova o ripresa) e un nuovo segmento per questo processo.
 */

import { emptyDetails, emptySummary, type KpiDetails } from '../analysis/summary-types'
import type { HostFs } from '../host'
import { SCHEMA_VERSION, type KpiKind, type ResumeInfo } from './events'
import { segmentId } from './ids'
import { encodeProject, encodeProjectAlt, id8Of, join, parseSessionDir, projectNameOf, ROOT_MARKER, sessionDirName } from './paths'
import { readJson, replayTail } from './recover'
import type { KpiProjectFile, KpiRepo, KpiSegment, KpiSessionFile } from './session-file'
import { localOffsetMin } from './time'
import { sessionStoreOf, type SessionStore } from './writer'

export type OpenArgs = {
  root: string
  launchCwd: string
  sessionId: string
  now: number
  /** Quando è iniziata la sessione (per il nome della cartella), se lo si sa. */
  startedAt?: number
  kind: KpiKind
  interactive: boolean
  source: string
  version: { version: string; base?: string }
  model?: string
  permissionMode?: string
  costNow: number
  /** Il processo aveva già un'altra sessione: il ledger del costo è il suo. */
  switched: boolean
  repo: KpiRepo | null
  branch: string | null
  previousSessionId?: string
  resume?: ResumeInfo
  /** Fuso fisso (test); altrimenti quello del runtime. */
  tzOffsetMin?: number
}

/** Scrive il marcatore della radice dati se manca (serve alla pulizia come controllo di sicurezza). */
export async function ensureRoot(fs: HostFs, root: string, now: number): Promise<void> {
  const marker = join(root, ROOT_MARKER)

  if (!(await fs.exists(marker))) {
    await fs.write(marker, JSON.stringify({ schemaVersion: SCHEMA_VERSION, plugin: 'kpi-tracker', createdAt: now }, null, 2))
  }
}

/** La cartella del progetto, scritta o aggiornata; una seconda variante se la prima appartiene a un altro percorso. */
export async function resolveProject(fs: HostFs, root: string, path: string, now: number, repo: KpiRepo | null): Promise<{ dir: string; encoded: string }> {
  for (const encoded of [encodeProject(path), encodeProjectAlt(path)]) {
    const dir = join(root, encoded)
    const existing = await readJson<KpiProjectFile>(fs, join(dir, 'project.json'))

    if (existing !== null && existing.path !== path) {
      continue
    }

    const next: KpiProjectFile = {
      schemaVersion: 1,
      path,
      encoded,
      name: projectNameOf(path),
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastSeenAt: now,
      repo: repo ?? existing?.repo ?? null,
    }

    await fs.write(join(dir, 'project.json'), JSON.stringify(next, null, 2))

    return { dir, encoded }
  }

  const encoded = `${encodeProjectAlt(path)}-${now.toString(36)}`

  return { dir: join(root, encoded), encoded }
}

/** La cartella esistente di una sessione nel progetto (per suffisso id8, verificata su session.json). */
export async function findSessionDir(fs: HostFs, projectDir: string, sessionId: string): Promise<{ dir: string; file: KpiSessionFile } | null> {
  let entries: { name: string; kind: string }[] = []

  try {
    entries = await fs.list(projectDir)
  } catch {
    return null
  }

  const id8 = id8Of(sessionId)

  for (const entry of entries) {
    if (entry.kind !== 'dir' || parseSessionDir(entry.name)?.id8 !== id8) {
      continue
    }

    const dir = join(projectDir, entry.name)
    const file = await readJson<KpiSessionFile>(fs, join(dir, 'session.json'))

    if (file !== null && file.sessionId === sessionId) {
      return { dir, file }
    }
  }

  return null
}

function freshFile(args: OpenArgs, dir: string, dirName: string, project: { encoded: string }, tz: number): KpiSessionFile {
  return {
    schemaVersion: 1,
    sessionId: args.sessionId,
    dir: dirName,
    project: { path: args.launchCwd, encoded: project.encoded, name: projectNameOf(args.launchCwd) },
    createdAt: args.startedAt ?? args.now,
    tzOffsetMin: tz,
    updatedAt: args.now,
    heartbeatAt: args.now,
    status: 'active',
    kind: args.kind,
    interactive: args.interactive,
    links: args.previousSessionId !== undefined ? { previousSessionId: args.previousSessionId } : {},
    segments: [],
    meta: { branches: [], repo: args.repo, models: [], versions: [], permissionModes: {} },
    diag: { flushes: 0, flushErrors: 0, bytes: 0 },
    summary: emptySummary(args.kind),
  }
}

const addUnique = (list: string[], value: string | undefined | null): void => {
  if (value !== undefined && value !== null && value !== '' && !list.includes(value)) {
    list.push(value)
  }
}

/**
 * Apre (o riprende) la sessione e crea il segmento di questo processo.
 * Emette `seg.start` e `meta`; il primo flush lo fa chi chiama.
 */
export async function openSession(fs: HostFs, args: OpenArgs): Promise<SessionStore> {
  const tz = args.tzOffsetMin ?? localOffsetMin(args.now)

  await ensureRoot(fs, args.root, args.now)

  const project = await resolveProject(fs, args.root, args.launchCwd, args.now, args.repo)
  const found = await findSessionDir(fs, project.dir, args.sessionId)

  let dir: string
  let file: KpiSessionFile
  let details: KpiDetails

  if (found !== null) {
    dir = found.dir
    file = found.file
    details = (await readJson<KpiDetails>(fs, join(dir, 'details.json'))) ?? emptyDetails()
    file.summary ??= emptySummary(args.kind)
    file.diag ??= { flushes: 0, flushErrors: 0, bytes: 0 }
    file.links ??= {}
    await replayTail(fs, dir, file, details)
    file.status = 'active'
    file.interactive = file.interactive || args.interactive
  } else {
    const dirName = sessionDirName(args.startedAt ?? args.now, args.sessionId, tz)

    dir = join(project.dir, dirName)
    file = freshFile(args, dir, dirName, project, tz)
    details = emptyDetails()
  }

  const segment: KpiSegment = {
    id: segmentId(file.segments.length + 1),
    source: args.source,
    startedAt: args.now,
    version: args.version.version,
    ...(args.version.base !== undefined && { base: args.version.base }),
    lastSeq: 0,
    chunks: 0,
    costBaselineUsd: args.costNow,
  }

  file.segments.push(segment)
  addUnique(file.meta.versions, args.version.version)
  addUnique(file.meta.models, args.model)
  addUnique(file.meta.branches, args.branch)

  if (args.repo !== null) {
    file.meta.repo = args.repo
  }

  if (args.previousSessionId !== undefined) {
    file.links.previousSessionId = args.previousSessionId
  }

  const store = sessionStoreOf(fs, { dir, file, details, segment, chunkIndex: 1, chunkText: '' })

  store.emit(
    {
      e: 'seg.start',
      seg: segment.id,
      src: args.source,
      ver: args.version.version,
      ...(args.version.base !== undefined && { base: args.version.base }),
      kind: args.kind,
      ...(args.model !== undefined && { model: args.model }),
      ...(args.permissionMode !== undefined && { pm: args.permissionMode }),
      tz,
      cost0: args.costNow,
      ...(args.resume !== undefined && { resume: args.resume }),
      sw: args.switched ? 1 : 0,
    },
    args.now,
  )

  if (args.branch !== null || args.repo !== null) {
    store.emit({ e: 'meta', branch: args.branch, repo: args.repo }, args.now)
  }

  return store
}

/** Chiude il segmento corrente di uno store (non lo salva). */
export function closeSegment(store: SessionStore, now: number, reason: string, ended: boolean): void {
  store.emit({ e: 'seg.end', reason }, now)
  store.segment.endedAt = now
  store.segment.endReason = reason

  if (ended) {
    store.file.status = 'ended'
  }

  store.touch()
}
