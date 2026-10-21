/**
 * Unione di summary di più sessioni (associativa): i contatori si sommano, le
 * statistiche si uniscono, i massimi restano massimi.
 */

import { mergeStat, type Stat } from './stats'
import { emptySummary, type KpiSummary } from './summary-types'

/** Campi (per percorso, `*` = qualsiasi chiave) che si uniscono col massimo invece che con la somma. */
const MAX_PATHS = [
  'lastAt',
  'context.window',
  'context.maxPct',
  'context.lastPct',
  'context.maxTokens',
  'rate.*.max',
  'rate.*.last',
  'agents.maxConcurrent',
  'todos.total',
  'todos.done',
]

const SKIP = new Set(['_r', 'kind', 'v'])

const isStat = (value: unknown): value is Stat =>
  typeof value === 'object' && value !== null && 'n' in value && 'sum' in value && 'h' in value && 'min' in value && 'max' in value

function matches(path: string, pattern: string): boolean {
  const a = path.split('.')
  const b = pattern.split('.')

  return a.length === b.length && b.every((part, index) => part === '*' || part === a[index])
}

const isMaxPath = (path: string): boolean => MAX_PATHS.some(pattern => matches(path, pattern))

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function mergeInto(into: Record<string, unknown>, from: Record<string, unknown>, prefix: string): void {
  for (const [key, value] of Object.entries(from)) {
    const path = prefix === '' ? key : `${prefix}.${key}`

    if (prefix === '' && SKIP.has(key)) {
      continue
    }

    const current = into[key]

    if (current === undefined) {
      into[key] = clone(value)
      continue
    }

    if (typeof value === 'number' && typeof current === 'number') {
      if (path === 'firstAt') {
        into[key] = current === 0 ? value : value === 0 ? current : Math.min(current, value)
      } else {
        into[key] = isMaxPath(path) ? Math.max(current, value) : current + value
      }

      continue
    }

    if (typeof value === 'string' && typeof current === 'string') {
      into[key] = value > current ? value : current
      continue
    }

    if (Array.isArray(value) && Array.isArray(current)) {
      const length = Math.max(value.length, current.length)

      into[key] = Array.from({ length }, (_, index) => (Number(current[index]) || 0) + (Number(value[index]) || 0))
      continue
    }

    if (isStat(value) && isStat(current)) {
      mergeStat(current, value)
      continue
    }

    if (typeof value === 'object' && value !== null && typeof current === 'object' && current !== null) {
      mergeInto(current as Record<string, unknown>, value as Record<string, unknown>, path)
    }
  }
}

/** Unisce `from` dentro `into` (muta `into`). */
export function mergeSummary(into: KpiSummary, from: KpiSummary): KpiSummary {
  mergeInto(into as unknown as Record<string, unknown>, from as unknown as Record<string, unknown>, '')

  return into
}

/** Il summary unito di un elenco (vuoto se l'elenco è vuoto). */
export function mergeAll(list: readonly KpiSummary[]): KpiSummary {
  const total = emptySummary()

  for (const one of list) {
    mergeSummary(total, one)
  }

  return total
}
