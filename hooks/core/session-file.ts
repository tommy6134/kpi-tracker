/** Gli schemi di project.json e session.json. */

import type { KpiSummary } from '../analysis/summary-types'
import type { KpiKind } from './events'

export type KpiRepo = { root: string; remote: string | null; name: string | null }

export type KpiProjectFile = {
  schemaVersion: 1
  path: string
  encoded: string
  name: string
  firstSeenAt: number
  lastSeenAt: number
  repo?: KpiRepo | null
}

export type KpiSegment = {
  id: string
  source: string
  startedAt: number
  endedAt?: number
  endReason?: string
  version: string
  base?: string
  lastSeq: number
  chunks: number
  costBaselineUsd: number
}

export type KpiSessionFile = {
  schemaVersion: 1
  sessionId: string
  dir: string
  project: { path: string; encoded: string; name: string }
  createdAt: number
  tzOffsetMin: number
  updatedAt: number
  heartbeatAt: number
  status: 'active' | 'ended'
  kind: KpiKind
  interactive: boolean
  links: { previousSessionId?: string; nextSessionId?: string }
  segments: KpiSegment[]
  meta: { branches: string[]; repo: KpiRepo | null; models: string[]; versions: string[]; permissionModes: Record<string, number> }
  diag: { flushes: number; flushErrors: number; lastError?: string; bytes: number }
  summary: KpiSummary
}

/** Dopo quanto tempo senza heartbeat una sessione `active` si considera interrotta. */
export const STALE_MS = 10 * 60_000

/** Lo stato mostrato: `ended`, `active` o `interrotta` (attiva ma ferma da troppo). */
export function displayStatus(file: Pick<KpiSessionFile, 'status' | 'heartbeatAt'>, now: number): 'conclusa' | 'attiva' | 'interrotta' {
  if (file.status === 'ended') {
    return 'conclusa'
  }

  return now - file.heartbeatAt > STALE_MS ? 'interrotta' : 'attiva'
}
