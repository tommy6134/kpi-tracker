/**
 * Aggregati per i report. Le grandezze nel tempo (costo, token, turni, tempo
 * attivo, tool, righe, commit, prompt) si leggono da `byDay` e rispettano
 * l'intervallo; le distribuzioni (tool, modelli, comandi…) sono quelle delle
 * sessioni intere che hanno attività nell'intervallo.
 */

import { mergeAll } from '../analysis/merge'
import { emptyDay, type DayAgg, type KpiSummary } from '../analysis/summary-types'
import { monthKey, weekKey } from '../core/time'
import { inRange, type KpiFilter } from './filters'
import type { SessionRow } from './load'

export type GroupKey = 'giorno' | 'settimana' | 'mese' | 'progetto' | 'modello' | 'branch' | 'tipo' | 'sessione'

export const GROUP_ALIASES: Record<string, GroupKey> = {
  giorno: 'giorno',
  day: 'giorno',
  giorni: 'giorno',
  days: 'giorno',
  settimana: 'settimana',
  week: 'settimana',
  mese: 'mese',
  month: 'mese',
  progetto: 'progetto',
  project: 'progetto',
  modello: 'modello',
  model: 'modello',
  branch: 'branch',
  tipo: 'tipo',
  kind: 'tipo',
  sessione: 'sessione',
  session: 'sessione',
}

export function addDay(into: DayAgg, from: DayAgg | undefined): void {
  if (from === undefined) {
    return
  }

  for (const key of Object.keys(into) as (keyof DayAgg)[]) {
    into[key] += from[key] ?? 0
  }
}

/** I giorni della sessione nell'intervallo del filtro, sommati. */
export function rangeOf(row: SessionRow, filter: KpiFilter): DayAgg {
  const total = emptyDay()

  for (const [day, agg] of Object.entries(row.file.summary.byDay)) {
    if (inRange(filter, day)) {
      addDay(total, agg)
    }
  }

  return total
}

export type Totals = {
  sessions: number
  projects: number
  days: number
  range: DayAgg
  summary: KpiSummary
  byKind: Record<string, number>
}

/** Totali di un insieme di sessioni. */
export function totalsOf(rows: readonly SessionRow[], filter: KpiFilter): Totals {
  const range = emptyDay()
  const days = new Set<string>()
  const byKind: Record<string, number> = {}

  for (const row of rows) {
    addDay(range, rangeOf(row, filter))
    byKind[row.file.kind] = (byKind[row.file.kind] ?? 0) + 1

    for (const day of Object.keys(row.file.summary.byDay)) {
      if (inRange(filter, day)) {
        days.add(day)
      }
    }
  }

  return {
    sessions: rows.length,
    projects: new Set(rows.map(row => row.projectPath)).size,
    days: days.size,
    range,
    summary: mergeAll(rows.map(row => row.file.summary)),
    byKind,
  }
}

export type GroupRow = { key: string; sessions: number; agg: DayAgg }

/** Raggruppa per una dimensione. */
export function groupBy(rows: readonly SessionRow[], filter: KpiFilter, key: GroupKey): GroupRow[] {
  const groups = new Map<string, { sessions: Set<string>; agg: DayAgg }>()
  const bucket = (name: string) => {
    let group = groups.get(name)

    if (group === undefined) {
      group = { sessions: new Set(), agg: emptyDay() }
      groups.set(name, group)
    }

    return group
  }

  for (const row of rows) {
    const s = row.file.summary

    if (key === 'giorno' || key === 'settimana' || key === 'mese') {
      for (const [day, agg] of Object.entries(s.byDay)) {
        if (!inRange(filter, day)) {
          continue
        }

        const name = key === 'giorno' ? day : key === 'settimana' ? weekKey(day) : monthKey(day)
        const group = bucket(name)

        group.sessions.add(row.file.sessionId)
        addDay(group.agg, agg)
      }

      continue
    }

    if (key === 'modello') {
      for (const [model, agg] of Object.entries(s.byModel)) {
        const group = bucket(model)

        group.sessions.add(row.file.sessionId)
        group.agg.in += agg.in
        group.agg.out += agg.out
        group.agg.cr += agg.cr
        group.agg.cw += agg.cw
        group.agg.req += agg.req
      }

      continue
    }

    const name =
      key === 'progetto'
        ? row.projectName
        : key === 'branch'
          ? (row.file.meta.branches.at(-1) ?? '(nessuno)')
          : key === 'tipo'
            ? row.file.kind
            : `${row.dirName}`
    const group = bucket(name)

    group.sessions.add(row.file.sessionId)
    addDay(group.agg, rangeOf(row, filter))
  }

  const out = [...groups.entries()].map(([name, group]) => ({ key: name, sessions: group.sessions.size, agg: group.agg }))

  return key === 'giorno' || key === 'settimana' || key === 'mese' ? out.sort((a, b) => a.key.localeCompare(b.key)) : out.sort((a, b) => b.agg.cost - a.agg.cost || b.agg.turns - a.agg.turns)
}
