/**
 * Export CSV e JSON a quattro livelli: sessioni, giorni, turni, eventi, con
 * colonne e valori nella lingua scelta.
 * CSV "Excel italiano" (default in italiano): `;`, virgola decimale, BOM, CRLF.
 * CSV standard (RFC 4180, default in inglese): `,`, punto decimale, LF.
 * Oltre ~3,5 MB il file si divide in parti (limite di scrittura di 4 MiB).
 */

import { cacheHit, type KpiDetails } from '../analysis/summary-types'
import { allEventsOf, readJson } from '../core/recover'
import { join } from '../core/paths'
import { displayStatus } from '../core/session-file'
import type { HostFs } from '../host'
import type { I18n, Lang } from '../i18n'
import { inRange, type KpiFilter } from '../query/filters'
import { rangeOf } from '../query/aggregate'
import type { SessionRow } from '../query/load'

export type ExportLevel = 'sessioni' | 'giorni' | 'turni' | 'eventi'

export const LEVELS: Record<string, ExportLevel> = {
  sessioni: 'sessioni',
  sessions: 'sessioni',
  giorni: 'giorni',
  days: 'giorni',
  turni: 'turni',
  turns: 'turni',
  eventi: 'eventi',
  events: 'eventi',
}

/** Il nome di un livello nella lingua (nel nome del file e nel JSON). */
export const LEVEL_NAMES: Record<ExportLevel, Record<Lang, string>> = {
  sessioni: { it: 'sessioni', en: 'sessions' },
  giorni: { it: 'giorni', en: 'days' },
  turni: { it: 'turni', en: 'turns' },
  eventi: { it: 'eventi', en: 'events' },
}

export const PART_MAX = 3_500_000

type Value = string | number | boolean | null | undefined
type Table = { columns: string[]; rows: Value[][] }

const iso = (ms: number): string => (Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : '')
const min = (ms: number): number => Math.round((ms / 60_000) * 10) / 10

/** I nomi inglesi delle colonne (quelli nel codice sono gli italiani). */
const COLUMNS_EN: Readonly<Record<string, string>> = {
  inizio: 'start',
  progetto: 'project',
  percorso: 'path',
  sessione: 'session',
  tipo: 'kind',
  stato: 'status',
  durata_min: 'duration_min',
  attivo_min: 'active_min',
  turni: 'turns',
  prompt: 'prompts',
  richieste: 'requests',
  costo_usd: 'cost_usd',
  costo_fuori_turni_usd: 'cost_outside_turns_usd',
  token_input: 'input_tokens',
  token_output: 'output_tokens',
  cache_letta: 'cache_read',
  cache_scritta: 'cache_write',
  cache_hit: 'cache_hit',
  tool: 'tools',
  errori_tool: 'tool_errors',
  bash: 'bash',
  test_ok: 'tests_ok',
  test_ko: 'tests_failed',
  righe_aggiunte: 'lines_added',
  righe_rimosse: 'lines_removed',
  file_creati: 'files_created',
  file_modificati: 'files_modified',
  commit: 'commits',
  push: 'pushes',
  pr: 'prs',
  subagent: 'subagents',
  compattazioni: 'compactions',
  contesto_max_pct: 'context_max_pct',
  rate_5h_max_pct: 'rate_5h_max_pct',
  rate_7g_max_pct: 'rate_7d_max_pct',
  branch: 'branches',
  modelli: 'models',
  versione: 'version',
  giorno: 'day',
  turno: 'turn',
  fine: 'end',
  durata_s: 'duration_s',
  token: 'tokens',
  esito: 'outcome',
  contesto_pct: 'context_pct',
  compattazione: 'compaction',
  seq: 'seq',
  istante: 'time',
  evento: 'event',
  agente: 'agent',
  dati: 'data',
}

/** Le colonne nella lingua di `L`. */
const columnsIn = (L: I18n, columns: readonly string[]): string[] => (L.lang === 'en' ? columns.map(column => COLUMNS_EN[column] ?? column) : [...columns])

/** La tabella di un livello, con colonne e valori nella lingua di `L`. */
export async function tableOf(fs: HostFs, L: I18n, rows: readonly SessionRow[], filter: KpiFilter, level: ExportLevel): Promise<Table> {
  const table = await italianTableOf(fs, rows, filter, level)

  return { columns: columnsIn(L, table.columns), rows: table.rows.map(row => row.map((value, index) => (CODE_COLUMNS.has(table.columns[index] as string) && typeof value === 'string' ? L.code(value) : value))) }
}

/** Le colonne che contengono codici salvati (tipo, stato): si traducono come le etichette. */
const CODE_COLUMNS = new Set(['tipo', 'stato'])

async function italianTableOf(fs: HostFs, rows: readonly SessionRow[], filter: KpiFilter, level: ExportLevel): Promise<Table> {
  const now = Date.now()

  if (level === 'sessioni') {
    return {
      columns: [
        'inizio', 'progetto', 'percorso', 'sessione', 'tipo', 'stato', 'durata_min', 'attivo_min', 'turni', 'prompt', 'richieste', 'costo_usd',
        'costo_fuori_turni_usd', 'token_input', 'token_output', 'cache_letta', 'cache_scritta', 'cache_hit', 'tool', 'errori_tool', 'bash', 'test_ok', 'test_ko',
        'righe_aggiunte', 'righe_rimosse', 'file_creati', 'file_modificati', 'commit', 'push', 'pr', 'subagent', 'compattazioni',
        'contesto_max_pct', 'rate_5h_max_pct', 'rate_7g_max_pct', 'branch', 'modelli', 'versione',
      ],
      rows: rows.map(row => {
        const s = row.file.summary
        const r = rangeOf(row, filter)

        return [
          iso(row.file.createdAt), row.projectName, row.projectPath, row.file.sessionId, row.file.kind, displayStatus(row.file, now),
          min(Math.max(0, s.lastAt - row.file.createdAt)), min(r.active), r.turns, r.prompts, r.req, r.cost, s.cost.outsideTurns ?? 0, r.in, r.out, r.cr, r.cw,
          Math.round(cacheHit(r) * 1000) / 10, r.tools, r.toolErr, s.bash.n, s.tests.ok, s.tests.err, r.add, r.del, s.files.created,
          s.files.uniqueModified, r.commits, s.git.pushes, Object.values(s.git.prs).reduce((a, b) => a + b, 0), s.agents.n, s.compactions.n,
          s.context.maxPct, s.rate.five_hour?.max ?? null, s.rate.seven_day?.max ?? null, row.file.meta.branches.join(' '),
          row.file.meta.models.join(' '), row.file.meta.versions.at(-1) ?? '',
        ]
      }),
    }
  }

  if (level === 'giorni') {
    const out: Value[][] = []

    for (const row of rows) {
      for (const [day, agg] of Object.entries(row.file.summary.byDay).sort((a, b) => a[0].localeCompare(b[0]))) {
        if (!inRange(filter, day)) {
          continue
        }

        out.push([day, row.projectName, row.file.sessionId, row.file.kind, agg.cost, agg.in, agg.out, agg.cr, agg.cw, agg.turns, min(agg.active), agg.prompts, agg.req, agg.tools, agg.toolErr, agg.add, agg.del, agg.commits])
      }
    }

    return {
      columns: ['giorno', 'progetto', 'sessione', 'tipo', 'costo_usd', 'token_input', 'token_output', 'cache_letta', 'cache_scritta', 'turni', 'attivo_min', 'prompt', 'richieste', 'tool', 'errori_tool', 'righe_aggiunte', 'righe_rimosse', 'commit'],
      rows: out,
    }
  }

  if (level === 'turni') {
    const out: Value[][] = []

    for (const row of rows) {
      const details = await readJson<KpiDetails>(fs, join(row.dir, 'details.json'))

      for (const turn of details?.turns ?? []) {
        out.push([row.file.sessionId, row.projectName, turn.i, iso(turn.t), Math.round(turn.ms / 100) / 10, turn.tok, turn.out, turn.tools, turn.err, turn.r, turn.cost, turn.pct, turn.cpt === 1])
      }
    }

    return { columns: ['sessione', 'progetto', 'turno', 'fine', 'durata_s', 'token', 'token_output', 'tool', 'errori_tool', 'esito', 'costo_usd', 'contesto_pct', 'compattazione'], rows: out }
  }

  const out: Value[][] = []

  for (const row of rows) {
    const segments = await allEventsOf(fs, row.dir, row.file.segments.map(segment => segment.id))

    for (const list of segments) {
      for (const event of list) {
        const { q, t, a, e, ...rest } = event as unknown as Record<string, unknown> & { q: number; t: number; a?: string; e: string }

        out.push([row.file.sessionId, row.projectName, q, iso(t), e, a ?? '', JSON.stringify(rest)])
      }
    }
  }

  return { columns: ['sessione', 'progetto', 'seq', 'istante', 'evento', 'agente', 'dati'], rows: out }
}

function csvValue(value: Value, excel: boolean): string {
  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'boolean') {
    return value ? '1' : '0'
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return ''
    }

    const text = Number.isInteger(value) ? String(value) : String(Math.round(value * 1e6) / 1e6)

    return excel ? text.replace('.', ',') : text
  }

  const sep = excel ? ';' : ','

  return value.includes(sep) || value.includes('"') || value.includes('\n') || value.includes('\r') ? `"${value.replace(/"/g, '""')}"` : value
}

/** Testo CSV di una tabella, diviso in parti sotto `PART_MAX`. */
export function csvParts(table: Table, excel: boolean): string[] {
  const sep = excel ? ';' : ','
  const eol = excel ? '\r\n' : '\n'
  const header = table.columns.map(column => csvValue(column, excel)).join(sep)
  const parts: string[] = []
  let current: string[] = []
  let size = 0

  for (const row of table.rows) {
    const line = row.map(value => csvValue(value, excel)).join(sep)

    if (current.length > 0 && size + line.length > PART_MAX) {
      parts.push(current.join(eol))
      current = []
      size = 0
    }

    current.push(line)
    size += line.length + eol.length
  }

  parts.push(current.join(eol))

  return parts.map(body => `${excel ? '﻿' : ''}${header}${eol}${body}${body === '' ? '' : eol}`)
}

/** Le parti JSON di una tabella (oggetti con chiavi = colonne). */
export function jsonParts(table: Table, meta: Record<string, unknown>): string[] {
  const objects = table.rows.map(row => Object.fromEntries(table.columns.map((column, index) => [column, row[index] ?? null])))
  const parts: unknown[][] = []
  let current: unknown[] = []
  let size = 0

  for (const object of objects) {
    const length = JSON.stringify(object).length

    if (current.length > 0 && size + length > PART_MAX) {
      parts.push(current)
      current = []
      size = 0
    }

    current.push(object)
    size += length + 1
  }

  parts.push(current)

  return parts.map((rows, index) => JSON.stringify({ ...meta, part: index + 1, parts: parts.length, count: rows.length, rows }, null, 1))
}

export type ExportResult = { parts: string[]; count: number }

export async function exportCsv(fs: HostFs, L: I18n, rows: readonly SessionRow[], filter: KpiFilter, level: ExportLevel, excel: boolean): Promise<ExportResult> {
  const table = await tableOf(fs, L, rows, filter, level)

  return { parts: csvParts(table, excel), count: table.rows.length }
}

export async function exportJson(fs: HostFs, L: I18n, rows: readonly SessionRow[], filter: KpiFilter, level: ExportLevel, meta: { description: string; generatedAt: number }): Promise<ExportResult> {
  const table = await tableOf(fs, L, rows, filter, level)

  return { parts: jsonParts(table, { plugin: 'kpi-tracker', language: L.lang, level: LEVEL_NAMES[level][L.lang], filter: meta.description, generatedAt: iso(meta.generatedAt) }), count: table.rows.length }
}
